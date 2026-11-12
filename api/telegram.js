// Telegram webhook: Assel forwards objects, checks the preview, publishes. Also price/sold commands.
import { waitUntil } from '@vercel/functions';
import { tg, send, buttons, download, admins, webhookSecret } from '../lib/tg.js';
import * as drafts from '../lib/drafts.js';
import { parseListing, applyCorrection } from '../lib/parse.js';
import { readObjects, commitObjects } from '../lib/gh.js';
import { previewText, missing, nextNumber, toObject, addObject, eur, esc } from '../lib/objects.js';

const SITE = () => (process.env.SITE_URL || 'https://assel-chi.vercel.app').replace(/\/$/, '');
const MAX_PHOTOS = 10;

const HELP = `Перешлите мне объект: фото, текст от застройщика или собственника, PDF-презентацию. Можно несколькими сообщениями.
Когда всё прислали, нажмите «Готово»: я покажу, как объект будет выглядеть на сайте.

Команды:
/list — все объекты
/price 12 145000 — новая цена объекта №12
/sold 12 — объект №12 продан (страница остаётся, покупателю предложат похожие)
/unsold 12 — вернуть в продажу
/cancel — удалить черновик`;

const DONE_BTN = buttons([[['✅ Готово', 'done'], ['✖️ Отменить', 'cancel']]]);
const PREVIEW_BTN = buttons([[['🚀 Опубликовать', 'pub']], [['✖️ Отменить', 'cancel']]]);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (req.headers['x-telegram-bot-api-secret-token'] !== webhookSecret()) return res.status(401).end();
  const update = req.body || {};
  // Answer Telegram at once; slow work (Claude, GitHub) continues in the background.
  waitUntil(handle(update).catch(e => report(update, e)));
  res.status(200).json({ ok: true });
}

async function report(update, e) {
  console.error(e);
  const chat = update.message?.chat.id ?? update.callback_query?.message.chat.id;
  if (chat) await send(chat, `Что-то пошло не так: ${esc(e.message).slice(0, 300)}\nПопробуйте ещё раз или напишите Ануару.`).catch(() => {});
}

async function handle(u) {
  const from = u.message?.from ?? u.callback_query?.from;
  if (!from) return;
  const chat = u.message?.chat.id ?? u.callback_query.message.chat.id;
  if (!admins().includes(from.id)) {
    if (u.message) await send(chat, `Это бот сайта Assel Usmanova. Ваш Telegram id: <code>${from.id}</code>. Чтобы получить доступ, передайте его Ануару.`);
    return;
  }
  if (u.callback_query) return onButton(chat, u.callback_query);
  return onMessage(chat, u.message);
}

async function onMessage(chat, m) {
  const text = m.text || m.caption || '';
  const cmd = m.text?.match(/^\/(\w+)(?:@\w+)?\s*(.*)$/s);
  if (cmd) return onCommand(chat, cmd[1].toLowerCase(), cmd[2].trim());

  const state = await drafts.getState(chat);
  // A plain message after the preview is a correction, not a new part.
  if (state.stage === 'preview' && m.text && !m.forward_origin) {
    await tg('sendChatAction', { chat_id: chat, action: 'typing' });
    const parsed = await applyCorrection(state.parsed, m.text);
    await drafts.setState(chat, { ...state, parsed });
    return sendPreview(chat, parsed, state.photos.length);
  }

  const part = { text };
  if (m.photo) part.photo = m.photo.at(-1).file_id;
  if (m.document?.mime_type === 'application/pdf') part.pdf = m.document.file_id;
  else if (m.document?.mime_type?.startsWith('image/')) part.photo = m.document.file_id;
  if (m.video) part.video = true;
  if (!part.text && !part.photo && !part.pdf) {
    if (m.video) return send(chat, 'Видео пока не беру: загрузите его на YouTube и пришлите ссылку текстом.');
    return send(chat, 'Это я не умею читать. Пришлите фото, текст или PDF.');
  }
  if (state.stage !== 'collect') await drafts.setState(chat, { stage: 'collect' });
  await drafts.addPart(chat, m.message_id, part);

  if (m.media_group_id && !(await drafts.firstOfAlbum(chat, m.media_group_id))) return;
  await send(chat, 'Получила. Пришлите ещё или нажмите «Готово».', DONE_BTN);
}

async function onButton(chat, q) {
  await tg('answerCallbackQuery', { callback_query_id: q.id }).catch(() => {});
  if (q.data === 'cancel') {
    await drafts.clear(chat);
    return send(chat, 'Черновик удалён.');
  }
  if (q.data === 'done') return makePreview(chat);
  if (q.data === 'pub') return publish(chat);
}

async function makePreview(chat) {
  const list = await drafts.parts(chat);
  if (!list.length) return send(chat, 'Черновик пуст. Перешлите мне фото и текст объекта.');
  await send(chat, 'Разбираю, это займёт до минуты…');
  const texts = list.map(p => p.text).filter(Boolean);
  const pdfIds = [...new Set(list.map(p => p.pdf).filter(Boolean))];
  const photos = [...new Set(list.map(p => p.photo).filter(Boolean))].slice(0, MAX_PHOTOS);
  const pdfs = await Promise.all(pdfIds.map(download));
  const parsed = await parseListing({ texts, pdfs });
  await drafts.setState(chat, { stage: 'preview', parsed, photos });
  return sendPreview(chat, parsed, photos.length);
}

async function sendPreview(chat, parsed, photos) {
  const ready = !missing(parsed, photos).length;
  const tail = ready ? '\n\nЧтобы исправить, просто напишите, например: «район Оба, до моря 400 м».' : '';
  return send(chat, previewText(parsed, photos) + tail, ready ? PREVIEW_BTN : buttons([[['✖️ Отменить', 'cancel']]]));
}

async function publish(chat) {
  const state = await drafts.getState(chat);
  if (state.stage !== 'preview') return send(chat, 'Нечего публиковать: сначала перешлите объект и нажмите «Готово».');
  const m = missing(state.parsed, state.photos.length);
  if (m.length) return send(chat, `Не хватает: ${m.join(', ')}.`);
  await drafts.setState(chat, { ...state, stage: 'publishing' });
  await send(chat, 'Публикую…');

  const images = await Promise.all(state.photos.map(download));
  const o = await commitObjects(list => {
    const n = nextNumber(list);
    const keys = images.map((_, i) => `o${n}-${i + 1}`);
    const obj = toObject(state.parsed, n, keys);
    return {
      list: addObject(list, obj),
      message: `Бот: объект №${n} ${obj.name}, ${obj.d}`,
      files: images.map((buffer, i) => ({ path: `public/img/${keys[i]}.jpg`, buffer })),
      result: obj,
    };
  });
  await drafts.clear(chat);
  const url = `${SITE()}/o/${o.n}/`;
  return send(chat, `Готово, объект №${o.n} будет на сайте через минуту:\n${url}\n\nЭту ссылку можно ставить в Instagram. В посте можно написать «пишите ${o.n} в WhatsApp».`);
}

async function onCommand(chat, cmd, arg) {
  if (cmd === 'start' || cmd === 'help') return send(chat, HELP);
  if (cmd === 'cancel') { await drafts.clear(chat); return send(chat, 'Черновик удалён.'); }
  if (cmd === 'list') {
    const list = (await readObjects()).filter(o => !o.demo);
    if (!list.length) return send(chat, 'На сайте пока только примеры. Перешлите мне первый объект.');
    return send(chat, list.map(o => `№${o.n} ${esc(o.name)}, ${esc(o.d)} · ${o.rooms} · ${eur(o.price)}${o.sold ? ' · ПРОДАНО' : ''}\n${SITE()}/o/${o.n}/`).join('\n\n'));
  }
  if (cmd === 'price') {
    const [n, p] = arg.replace(/[€\s](?=\d{3}\b)/g, '').split(/\s+/).map(Number);
    if (!n || !(p > 0)) return send(chat, 'Напишите так: /price 12 145000');
    return change(chat, n, o => ({ ...o, price: p }), o => `Цена №${o.n} теперь ${eur(o.price)}.`);
  }
  if (cmd === 'sold' || cmd === 'unsold') {
    const n = Number(arg);
    if (!n) return send(chat, `Напишите так: /${cmd} 12`);
    return change(chat, n, o => {
      const { sold, ...rest } = o;
      return cmd === 'sold' ? { ...rest, sold: true } : rest;
    }, o => cmd === 'sold' ? `№${o.n} отмечен как проданный. Страница остаётся, покупателю предложат похожие.` : `№${o.n} снова в продаже.`);
  }
  return send(chat, HELP);
}

async function change(chat, n, fn, done) {
  const o = await commitObjects(list => {
    const i = list.findIndex(x => x.n === n && !x.demo);
    if (i < 0) return { list: null, result: null };
    const next = [...list];
    next[i] = fn(list[i]);
    return { list: next, message: `Бот: объект №${n} изменён`, result: next[i] };
  });
  if (!o) return send(chat, `Объекта №${n} нет. Список: /list`);
  return send(chat, done(o) + ' Сайт обновится через минуту.');
}
