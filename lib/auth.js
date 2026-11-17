// Cabinet login without passwords: an admin sends /leads to the bot and gets a one-time-ish link
// (valid 15 minutes) that sets a session cookie for 30 days. Keys are derived from the bot token.
import crypto from 'node:crypto';

const key = () => {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  if (!t) throw new Error('TELEGRAM_BOT_TOKEN is not set');
  return crypto.createHash('sha256').update('cabinet:' + t).digest();
};
const b64 = s => Buffer.from(s).toString('base64url');
const sig = data => crypto.createHmac('sha256', key()).update(data).digest('base64url');

export const LOGIN_TTL = 15 * 60e3;
export const SESSION_TTL = 30 * 24 * 3600e3;
export const COOKIE = 'cab';

export function sign(kind, uid, ttl, now = Date.now()) {
  const data = b64(JSON.stringify({ k: kind, u: uid, exp: now + ttl }));
  return `${data}.${sig(data)}`;
}

export function verify(token, kind, now = Date.now()) {
  const [data, s] = String(token || '').split('.');
  if (!data || !s) return null;
  const want = sig(data);
  if (s.length !== want.length || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(want))) return null;
  let p;
  try { p = JSON.parse(Buffer.from(data, 'base64url').toString()); } catch { return null; }
  if (p.k !== kind || !(p.exp > now)) return null;
  return p;
}

export function cookieValue(req) {
  const m = String(req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  return m ? m[1] : '';
}

// Session is valid only while the user is still an admin of the bot.
export function sessionUser(req, admins) {
  const p = verify(cookieValue(req), 's');
  return p && admins.includes(p.u) ? p.u : null;
}

// Viewers of the owners' listings (Anuar's group chat, e.g. his wife, who is not a bot admin): the button in the
// group's run summary carries a link valid 7 days; it sets a separate cookie that opens only /cabinet/listings/.
export const GROUP_LINK_TTL = 7 * 24 * 3600e3;
export const VIEW_COOKIE = 'cabv';

export function viewerOk(req) {
  const m = String(req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${VIEW_COOKIE}=([^;]+)`));
  return !!(m && verify(m[1], 'v'));
}
