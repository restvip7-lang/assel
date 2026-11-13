// Minimal Telegram Bot API client.
import crypto from 'node:crypto';

const token = () => {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  if (!t) throw new Error('TELEGRAM_BOT_TOKEN is not set');
  return t;
};

// Secret Telegram sends back in X-Telegram-Bot-Api-Secret-Token; derived from the token, so no extra env var.
export const webhookSecret = () => crypto.createHash('sha256').update('webhook:' + token()).digest('hex').slice(0, 48);

export async function tg(method, params = {}) {
  const r = await fetch(`https://api.telegram.org/bot${token()}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(`Telegram ${method}: ${j.description}`);
  return j.result;
}

export async function download(fileId) {
  const f = await tg('getFile', { file_id: fileId });
  const r = await fetch(`https://api.telegram.org/file/bot${token()}/${f.file_path}`);
  if (!r.ok) throw new Error(`Telegram file download failed: ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

export const send = (chat_id, text, extra = {}) =>
  tg('sendMessage', { chat_id, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...extra });

export const buttons = rows => ({ reply_markup: { inline_keyboard: rows.map(r => r.map(([text, data]) => ({ text, callback_data: data }))) } });

export const admins = () => (process.env.ADMIN_IDS || '').split(/[\s,]+/).filter(Boolean).map(Number);

// Send files as one album of documents (no Telegram compression). files: [{ name, buffer }], up to 10.
export async function sendDocuments(chat_id, files, caption) {
  const form = new FormData();
  form.append('chat_id', String(chat_id));
  form.append('media', JSON.stringify(files.map((f, i) => ({ type: 'document', media: `attach://f${i}`, ...(i === files.length - 1 && caption ? { caption, parse_mode: 'HTML' } : {}) }))));
  files.forEach((f, i) => form.append(`f${i}`, new Blob([f.buffer], { type: 'image/png' }), f.name));
  const r = await fetch(`https://api.telegram.org/bot${token()}/sendMediaGroup`, { method: 'POST', body: form });
  const j = await r.json();
  if (!j.ok) throw new Error(`Telegram sendMediaGroup: ${j.description}`);
  return j.result;
}
