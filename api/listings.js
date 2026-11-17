// Apartments for sale by owners (parser alanya-leads, owners.py).
// POST  (parser, X-Leads-Secret or body.secret = LEADS_SECRET): add a listing;
//       { type: 'summary', listings: [...] } after a run: one message to the group chat set with /listings there.
// GET   (admin session or the group's viewer link): all listings.
// PATCH (same): { id, hidden: true|false }.
import crypto from 'node:crypto';
import { admins, send } from '../lib/tg.js';
import { sessionUser, viewerOk, renewSession } from '../lib/auth.js';
import { addListing, allListings, setHidden, getChat, summaryText, viewerLink } from '../lib/listings.js';

const SITE = () => (process.env.SITE_URL || 'https://assel-chi.vercel.app').replace(/\/$/, '');
const same = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const b = req.body || {};
  if (req.method === 'POST') {
    const want = process.env.LEADS_SECRET || '';
    const got = String(req.headers['x-leads-secret'] || b.secret || '');
    if (!want) return res.status(503).json({ ok: false, error: 'LEADS_SECRET is not set' });
    if (!same(got, want)) return res.status(401).json({ ok: false, error: 'forbidden' });
    if (b.type === 'summary') {
      const text = summaryText(Array.isArray(b.listings) ? b.listings : []);
      const chat = await getChat();
      if (!text || !chat) return res.status(200).json({ ok: true, sent: 0, chat: !!chat });
      const btn = { reply_markup: { inline_keyboard: [[{ text: '📋 Открыть список', url: viewerLink(SITE(), chat) }]] } };
      try { await send(chat, text, btn); } catch (e) { console.error(e); return res.status(200).json({ ok: true, sent: 0 }); }
      return res.status(200).json({ ok: true, sent: 1 });
    }
    try {
      return res.status(200).json({ ok: true, duplicate: !(await addListing(b)) });
    } catch (e) {
      return res.status(400).json({ ok: false, error: e.message });
    }
  }
  if (!sessionUser(req, admins()) && !viewerOk(req)) return res.status(401).json({ ok: false, error: 'login' });
  if (req.method === 'GET') {
    const admin = !!renewSession(req, res, admins());
    return res.status(200).json({ ok: true, admin, listings: await allListings() });
  }
  if (req.method === 'PATCH') {
    if (!b.id) return res.status(400).json({ ok: false });
    const l = await setHidden(String(b.id), b.hidden === true);
    return l ? res.status(200).json({ ok: true, listing: l }) : res.status(404).json({ ok: false });
  }
  res.status(405).end();
}
