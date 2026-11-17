// Buyer leads for the cabinet.
// POST  (parser, header X-Leads-Secret or body.secret = LEADS_SECRET): add a lead;
//       with { type: 'summary', leads: [...] } after a run: notify the admins in Telegram about the new leads.
// GET   (cabinet session cookie): all leads.
// PATCH (cabinet session cookie): { id, status?, comment?, next? } or { id, deleted: true, reason } / { id, deleted: false }.
import crypto from 'node:crypto';
import { admins, send } from '../lib/tg.js';
import { sessionUser } from '../lib/auth.js';
import { addLead, allLeads, updateLead, STATUSES, DELETE_REASONS, summaryText } from '../lib/leads.js';

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
      const text = summaryText(Array.isArray(b.leads) ? b.leads : []);
      if (!text) return res.status(200).json({ ok: true, sent: 0 });
      const btn = { reply_markup: { inline_keyboard: [[{ text: '📋 Открыть заявки', url: `${SITE()}/cabinet/` }]] } };
      let sent = 0;
      for (const id of admins()) { try { await send(id, text, btn); sent++; } catch (e) { console.error(e); } }
      return res.status(200).json({ ok: true, sent });
    }
    try {
      const added = await addLead(b);
      return res.status(200).json({ ok: true, duplicate: !added });
    } catch (e) {
      return res.status(400).json({ ok: false, error: e.message });
    }
  }
  if (!sessionUser(req, admins())) return res.status(401).json({ ok: false, error: 'login' });
  if (req.method === 'GET') return res.status(200).json({ ok: true, statuses: STATUSES, reasons: DELETE_REASONS, leads: await allLeads() });
  if (req.method === 'PATCH') {
    if (!b.id) return res.status(400).json({ ok: false });
    try {
      const lead = await updateLead(String(b.id), b);
      return lead ? res.status(200).json({ ok: true, lead }) : res.status(404).json({ ok: false });
    } catch (e) {
      return res.status(400).json({ ok: false, error: e.message });
    }
  }
  res.status(405).end();
}
