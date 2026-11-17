// /api/login/?t=<token from the bot> -> admin session cookie -> /cabinet/ (or /cabinet/listings/ with &to=listings)
// /api/login/?g=<token from the group summary> -> viewer cookie for the owners' listings only -> /cabinet/listings/
import { admins } from '../lib/tg.js';
import { verify, sign, COOKIE, SESSION_TTL, VIEW_COOKIE } from '../lib/auth.js';

const cookie = (name, value) => `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL / 1000}`;

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.query.g) {
    const g = verify(req.query.g, 'g');
    if (!g) return expired(res, 'Ссылка устарела. Откройте список по кнопке из последнего сообщения бота в чате.');
    res.setHeader('Set-Cookie', cookie(VIEW_COOKIE, sign('v', g.u, SESSION_TTL)));
    return res.redirect(302, '/cabinet/listings/');
  }
  const p = verify(req.query.t, 'l');
  if (!p || !admins().includes(p.u)) return expired(res, 'Ссылка устарела. Отправьте боту <b>/leads</b> и откройте новую ссылку.');
  res.setHeader('Set-Cookie', cookie(COOKIE, sign('s', p.u, SESSION_TTL)));
  res.redirect(302, req.query.to === 'listings' ? '/cabinet/listings/' : '/cabinet/');
}

function expired(res, text) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(401).send(`<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><p style="font:16px system-ui;padding:24px">${text}</p>`);
}
