// Telegram webhook: Assel forwards objects, checks the preview, publishes. Also price/sold commands.
import { waitUntil } from '@vercel/functions';
import { tg, send, buttons, download, admins, webhookSecret } from '../lib/tg.js';
import * as drafts from '../lib/drafts.js';
import { parseListing, applyCorrection } from '../lib/parse.js';
import { readObjects, commitObjects } from '../lib/gh.js';
import { findUrls, readPage, downloadImage } from '../lib/page.js';
import { previewText, missing, nextNumber, toObject, addObject, eur, esc, objectRef, toDraft, updateObject, diffText, deleteObject, nextPhotoIndex } from '../lib/objects.js';

const SITE = () => (process.env.SITE_URL || 'https://assel-chi.vercel.app').replace(/\/$/, '');
const MAX_PHOTOS = 10;
const MAX_OBJECT_PHOTOS = 15;

const HELP = `Перешлите мне объект: фото, текст от застройщика или собственника, PDF-презентацию. Можно несколькими сообщениями.
Когда всё прислали, нажмите «Готово»: я покажу, как объект будет выглядеть на сайте.

Чтобы изменить опубликованный объект, пришлите его номер («1») или ссылку на него с сайта: появятся кнопки «Изменить», «Продано», «Удалить».

Команды:
/list — все объекты с кнопками
/price 12 145000 — новая цена объекта №12
/sold 12 — объект №12 продан (страница остаётся, покупателю предложат похожие)
/unsold 12 — вернуть в продажу
/cancel — удалить черновик`;

const DONE_BTN = buttons([[['✅ Готово', 'done'], ['✖️ Отменить', 'cancel']]]);
const PREVIEW_BTN = buttons([[['🚀 Опубликовать', 'pub'], ['🗑 Удалить', 'cancel']]]);
const DELETE_BTN = buttons([[['🗑 Удалить', 'cancel']]]);

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

  // Editing a published object: text is a change, photos are new photos.
  // An edit session lasts 30 minutes; forwarded posts always start a new object.
  let edit = await drafts.getEdit(chat);
  if (edit && Date.now() - (edit.at || 0) > 30 * 60e3) { await drafts.clearEdit(chat); edit = null; }
  if (edit && !m.forward_origin) {
    if (m.text && objectRef(m.text) == null) return editText(chat, edit, m.text);
    const photo = m.photo?.at(-1).file_id || (m.document?.mime_type?.startsWith('image/') ? m.document.file_id : null);
    if (photo) {
      await drafts.addEditPhoto(chat, m.message_id, photo);
      if (m.media_group_id && !(await drafts.firstOfAlbum(chat, 'e' + m.media_group_id))) return;
      return send(chat, `Фото для №${edit.n} получила. Что с ними сделать?`, buttons([[['➕ Добавить к старым', `phadd:${edit.n}`], ['🔁 Заменить все', `phrep:${edit.n}`]], [['✖️ Отмена', 'editcancel']]]));
    }
  }

  // «1», «№1» or a site link: show the object with actions.
  const ref = m.text && !m.forward_origin ? objectRef(m.text) : null;
  if (ref != null) return showObject(chat, ref);

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
  if (q.data === 'editcancel') { await drafts.clearEdit(chat); return send(chat, 'Изменение отменено, на сайте всё как было.'); }
  if (q.data === 'noop') return send(chat, 'Хорошо, ничего не меняю.');
  const [act, num] = q.data.split(':');
  const n = Number(num);
  if (!n) return;
  if (act === 'show') return showObject(chat, n);
  if (act === 'edit') {
    await drafts.clearEdit(chat);
    await drafts.setEdit(chat, { n, at: Date.now() });
    return send(chat, `Что поменять в №${n}? Напишите обычным текстом, например «цена 47000, этаж 1 из 4, добавь что есть кондиционер». Можно прислать новые фото.`, buttons([[['✖️ Отмена', 'editcancel']]]));
  }
  if (act === 'save') return saveEdit(chat, n);
  if (act === 'phadd' || act === 'phrep') return savePhotos(chat, n, act === 'phrep');
  if (act === 'sold' || act === 'unsold') return setSold(chat, n, act === 'sold');
  if (act === 'del') return send(chat, `Точно удалить №${n}? Страница пропадёт с сайта, ссылки на неё будут вести на главную. Если квартиру купили, лучше нажать «Продано».`,
    buttons([[['🗑 Да, удалить', `delok:${n}`], ['Нет', 'noop']], [['✅ Лучше «Продано»', `sold:${n}`]]]));
  if (act === 'delok') return removeObject(chat, n);
}

async function makePreview(chat) {
  const list = await drafts.parts(chat);
  if (!list.length) return send(chat, 'Черновик пуст. Перешлите мне фото и текст объекта.');
  await send(chat, 'Разбираю, это займёт до минуты…');
  const texts = list.map(p => p.text).filter(Boolean);
  const pdfIds = [...new Set(list.map(p => p.pdf).filter(Boolean))];
  const tgPhotos = [...new Set(list.map(p => p.photo).filter(Boolean))].map(tg => ({ tg }));
  const pdfs = await Promise.all(pdfIds.map(download));
  const pages = [];
  for (const url of findUrls(texts.join('\n')).slice(0, 2)) {
    try { const pg = await readPage(url); pages.push(pg); await send(chat, `Открыла страницу «${esc(pg.title.slice(0, 80))}», нашла ${pg.images.length} фото, выбираю нужные…`); } catch (e) { await send(chat, `Не открылась ссылка: ${esc(e.message)}`); }
  }
  const parsed = await parseListing({ texts, pdfs, pages });
  const pageImages = pages.flatMap(p => p.images);
  const webPhotos = tgPhotos.length ? [] : (parsed.photo_ids || []).map(i => pageImages[i]).filter(Boolean).map(i => ({ url: i.url }));
  const photos = [...tgPhotos, ...webPhotos].slice(0, MAX_PHOTOS);
  await drafts.setState(chat, { stage: 'preview', parsed, photos });
  return sendPreview(chat, parsed, photos.length);
}

// A photo is a Telegram file ({ tg }) or a picture on the agency site ({ url }).
const fetchPhoto = p => (typeof p === 'string' ? download(p) : p.tg ? download(p.tg) : downloadImage(p.url));

async function sendPreview(chat, parsed, photos) {
  const ready = !missing(parsed, photos).length;
  const tail = ready ? '\n\nЧтобы исправить, просто напишите, например: «район Оба, до моря 400 м».' : '';
  return send(chat, previewText(parsed, photos) + tail, ready ? PREVIEW_BTN : DELETE_BTN);
}

async function publish(chat) {
  const state = await drafts.getState(chat);
  if (state.stage !== 'preview') return send(chat, 'Нечего публиковать: сначала перешлите объект и нажмите «Готово».');
  const m = missing(state.parsed, state.photos.length);
  if (m.length) return send(chat, `Не хватает: ${m.join(', ')}.`);
  await drafts.setState(chat, { ...state, stage: 'publishing' });
  await send(chat, 'Публикую…');

  const images = (await Promise.all(state.photos.map(p => fetchPhoto(p).catch(() => null)))).filter(Boolean);
  if (!images.length) return send(chat, 'Не получилось скачать фото. Перешлите фото в чат и нажмите «Готово» ещё раз.');
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
    const live = list.filter(o => !o.deleted);
    if (!live.length) return send(chat, 'На сайте нет объектов. Перешлите мне новый.');
    for (const o of live.slice(-30)) await send(chat, cardText(o), actions(o));
    return;
  }
  if (cmd === 'price') {
    const [n, p] = arg.replace(/[€\s](?=\d{3}\b)/g, '').split(/\s+/).map(Number);
    if (!n || !(p > 0)) return send(chat, 'Напишите так: /price 12 145000');
    return change(chat, n, o => ({ ...o, price: p }), o => `Цена №${o.n} теперь ${eur(o.price)}.`);
  }
  if (cmd === 'sold' || cmd === 'unsold') {
    const n = Number(arg);
    if (!n) return send(chat, `Напишите так: /${cmd} 12`);
    return setSold(chat, n, cmd === 'sold');
  }
  return send(chat, HELP);
}

async function change(chat, n, fn, done) {
  const o = await commitObjects(list => {
    const i = list.findIndex(x => x.n === n && !x.demo && !x.deleted);
    if (i < 0) return { list: null, result: null };
    const next = [...list];
    next[i] = fn(list[i]);
    return { list: next, message: `Бот: объект №${n} изменён`, result: next[i] };
  });
  if (!o) return send(chat, `Объекта №${n} нет. Список: /list`);
  return send(chat, done(o) + ' Сайт обновится через минуту.');
}

// ---- Published objects: card, edit, photos, sold, delete ----

const cardText = o => `<b>№${o.n} ${esc(o.name)}, ${esc(o.d)}</b>${o.sold ? ' · <b>ПРОДАНО</b>' : ''}
${o.rooms} · ${o.area} м² · ${eur(o.price)}${o.sea ? ` · ${o.sea} м до моря` : ''}
Фото: ${o.imgs.length}
${SITE()}/o/${o.n}/`;

const actions = o => buttons([
  [['✏️ Изменить', `edit:${o.n}`], o.sold ? ['↩️ В продажу', `unsold:${o.n}`] : ['✅ Продано', `sold:${o.n}`]],
  [['🗑 Удалить', `del:${o.n}`]],
]);

async function findObject(n) {
  return (await readObjects()).find(x => x.n === n && !x.demo && !x.deleted);
}

async function showObject(chat, n) {
  const o = await findObject(n);
  if (!o) return send(chat, `Объекта №${n} на сайте нет. Список: /list`);
  const photo = `${SITE()}/img/${o.imgs[0]}.jpg`;
  try {
    return await tg('sendPhoto', { chat_id: chat, photo, caption: cardText(o), parse_mode: 'HTML', ...actions(o) });
  } catch {
    return send(chat, cardText(o), actions(o));
  }
}

async function editText(chat, edit, text) {
  const o = await findObject(edit.n);
  if (!o) { await drafts.clearEdit(chat); return send(chat, `Объекта №${edit.n} уже нет на сайте.`); }
  await tg('sendChatAction', { chat_id: chat, action: 'typing' });
  const base = edit.next ? toDraft(edit.next) : toDraft(o);
  const next = updateObject(o, await applyCorrection(base, text));
  const m = missing(next, next.imgs.length);
  if (m.length) return send(chat, `Так нельзя: пропадёт ${m.join(', ')}. Напишите иначе или нажмите «Отмена».`, buttons([[['✖️ Отмена', 'editcancel']]]));
  const diff = diffText(o, next);
  if (!diff) return send(chat, 'Я не нашла, что менять. Напишите точнее, например «цена 47000».', buttons([[['✖️ Отмена', 'editcancel']]]));
  await drafts.setEdit(chat, { n: o.n, next, at: Date.now() });
  return send(chat, `Изменения в №${o.n}:\n\n${diff}\n\nМожно дописать ещё, или сохраните.`, buttons([[['💾 Сохранить', `save:${o.n}`], ['✖️ Отмена', 'editcancel']]]));
}

async function saveEdit(chat, n) {
  const edit = await drafts.getEdit(chat);
  if (!edit?.next || edit.n !== n) return send(chat, 'Нечего сохранять. Пришлите номер объекта и нажмите «Изменить».');
  const o = await commitObjects(list => {
    const i = list.findIndex(x => x.n === n && !x.demo && !x.deleted);
    if (i < 0) return { list: null, result: null };
    const next = [...list];
    next[i] = { ...edit.next, imgs: list[i].imgs, ...(list[i].sold ? { sold: true } : {}) };
    if (!list[i].sold) delete next[i].sold;
    return { list: next, message: `Бот: объект №${n} изменён`, result: next[i] };
  });
  await drafts.clearEdit(chat);
  if (!o) return send(chat, `Объекта №${n} уже нет на сайте.`);
  return send(chat, `Сохранила. №${n} обновится на сайте через минуту:\n${SITE()}/o/${n}/`);
}

async function savePhotos(chat, n, replace) {
  const ids = (await drafts.editPhotos(chat)).filter(Boolean);
  if (!ids.length) return send(chat, 'Новых фото нет. Пришлите фото ещё раз.');
  await send(chat, 'Загружаю фото…');
  const images = (await Promise.all(ids.map(p => download(p.tg).catch(() => null)))).filter(Boolean);
  if (!images.length) return send(chat, 'Не получилось скачать фото. Пришлите их ещё раз.');
  const o = await commitObjects(list => {
    const i = list.findIndex(x => x.n === n && !x.demo && !x.deleted);
    if (i < 0) return { list: null, result: null };
    const old = list[i];
    const start = nextPhotoIndex(old);
    const keys = images.map((_, k) => `o${n}-${start + k}`);
    const kept = replace ? [] : old.imgs;
    const imgs = [...kept, ...keys].slice(0, MAX_OBJECT_PHOTOS);
    const removed = old.imgs.filter(k => !imgs.includes(k) && k.startsWith(`o${n}-`));
    const files = [
      ...keys.filter(k => imgs.includes(k)).map(k => ({ path: `public/img/${k}.jpg`, buffer: images[keys.indexOf(k)] })),
      ...removed.map(k => ({ path: `public/img/${k}.jpg`, remove: true })),
    ];
    const next = [...list];
    next[i] = { ...old, imgs };
    return { list: next, message: `Бот: фото объекта №${n}`, files, result: next[i] };
  });
  await drafts.clearEdit(chat);
  if (!o) return send(chat, `Объекта №${n} уже нет на сайте.`);
  const cut = !replace && o.imgs.length === MAX_OBJECT_PHOTOS ? ` Больше ${MAX_OBJECT_PHOTOS} фото на объект не ставлю, лишние не вошли.` : '';
  return send(chat, `${replace ? 'Заменила все фото' : 'Добавила фото'}, теперь их ${o.imgs.length}.${cut} Сайт обновится через минуту:\n${SITE()}/o/${n}/`);
}

function setSold(chat, n, sold) {
  return change(chat, n, o => {
    const { sold: _, ...rest } = o;
    return sold ? { ...rest, sold: true } : rest;
  }, o => sold ? `№${o.n} отмечен как проданный. Страница остаётся, покупателю предложат похожие.` : `№${o.n} снова в продаже.`);
}

async function removeObject(chat, n) {
  const o = await commitObjects(list => {
    const old = list.find(x => x.n === n && !x.demo && !x.deleted);
    if (!old) return { list: null, result: null };
    const files = old.imgs.filter(k => k.startsWith(`o${n}-`)).map(k => ({ path: `public/img/${k}.jpg`, remove: true }));
    return { list: deleteObject(list, n), message: `Бот: объект №${n} удалён`, files, result: old };
  });
  await drafts.clearEdit(chat);
  if (!o) return send(chat, `Объекта №${n} уже нет на сайте.`);
  return send(chat, `Удалила №${n}. Через минуту он пропадёт с сайта, старые ссылки будут вести на главную. Номер ${n} новым объектам не достанется.`);
}
