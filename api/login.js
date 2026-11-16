// /api/login/?t=<token from the bot> -> session cookie -> /cabinet/
import { admins } from '../lib/tg.js';
import { verify, sign, COOKIE, SESSION_TTL } from '../lib/auth.js';

export default function handler(req, res) {
  const p = verify(req.query.t, 'l');
  if (!p || !admins().includes(p.u)) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(401).send('<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><p style="font:16px system-ui;padding:24px">Ссылка устарела. Отправьте боту <b>/leads</b> и откройте новую ссылку.</p>');
  }
  res.setHeader('Set-Cookie', `${COOKIE}=${sign('s', p.u, SESSION_TTL)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL / 1000}`);
  res.setHeader('Cache-Control', 'no-store');
  res.redirect(302, '/cabinet/');
}
