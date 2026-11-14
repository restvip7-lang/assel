// Lead form on the site -> a message to Assel in Telegram.
import { send, admins } from '../lib/tg.js';
import { esc } from '../lib/objects.js';

const SITE = () => (process.env.SITE_URL || 'https://assel-chi.vercel.app').replace(/\/$/, '');
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// Shown only when the visitor used the English or the Turkish version.
const LANG_NAMES = { en: 'английский', tr: 'турецкий' };

export function leadText(b) {
  const n = Number.isInteger(b.n) && b.n > 0 ? b.n : null;
  return [
    '🔔 <b>Новая заявка с сайта</b>',
    `Имя: ${esc(str(b.name, 80))}`,
    `Контакт: ${esc(str(b.contact, 80))}`,
    `Когда связаться: ${esc(str(b.when, 40) || '—')}`,
    n ? `Объект: №${n} ${SITE()}/o/${n}/` : 'Объект: общий подбор',
    `Откуда пришёл: ${esc(str(b.src, 120) || 'напрямую')}`,
    ...(LANG_NAMES[b.lang] ? [`Язык сайта: ${LANG_NAMES[b.lang]}`] : []),
  ].join('\n');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const b = req.body || {};
  if (b.website) return res.status(200).json({ ok: true }); // bots fill the hidden field
  if (!str(b.name, 80) || str(b.contact, 80).length < 4) return res.status(400).json({ ok: false });
  const to = process.env.LEADS_CHAT_ID || admins()[0];
  if (!to) return res.status(500).json({ ok: false });
  await send(to, leadText(b));
  res.status(200).json({ ok: true });
}
