// Diagnostic: what the bot sees on a page of Assel's agency site. Agency domain only, public page data only.
import { readPage } from '../lib/page.js';

const ALLOWED = ['pointproperty.com'];

export default async function handler(req, res) {
  let u;
  try { u = new URL(String(req.query.url || '')); } catch { return res.status(400).send('bad url'); }
  if (!ALLOWED.some(h => u.hostname === h || u.hostname.endsWith('.' + h))) return res.status(403).send('domain not allowed');
  try {
    const p = await readPage(u.href);
    res.status(200).json({ url: p.url, title: p.title, textLength: p.text.length, text: p.text.slice(0, 6000), images: p.images });
  } catch (e) {
    res.status(502).send(e.message);
  }
}
