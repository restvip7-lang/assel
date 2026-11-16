// Buyer leads from the parser (alanya-leads): stored in the private Blob store, one file per lead.
// Assel works them in the cabinet (/cabinet/): status, comment, next-step date.
import crypto from 'node:crypto';
import { put, list, get } from '@vercel/blob';

export const STATUSES = ['Новая', 'Не дозвонилась', 'Написала', 'В работе', 'Показ назначен', 'Сделка', 'Не актуально'];

const opts = { access: 'private', addRandomSuffix: false, contentType: 'application/json' };
const pathOf = id => `leads/${crypto.createHash('sha256').update(String(id)).digest('hex').slice(0, 24)}.json`;
const str = (v, max) => (v == null ? '' : String(v)).trim().slice(0, max);

// Only known fields, trimmed; nothing from the request is trusted as is.
export function cleanLead(b) {
  const budget = Number(b.budget);
  return {
    id: str(b.id, 300),
    date: str(b.date, 30),
    source: str(b.source, 30),
    chat: str(b.chat, 120),
    author: str(b.author, 120),
    author_profile: str(b.author_profile, 60),
    contacts: str(b.contacts, 200),
    budget: Number.isFinite(budget) && budget > 0 ? Math.round(budget) : null,
    currency: str(b.currency, 5),
    budget_raw: str(b.budget_raw, 60),
    property_type: str(b.property_type, 80),
    districts: str(b.districts, 120),
    text: str(b.text, 4000),
    link: /^https:\/\//.test(str(b.link, 500)) ? str(b.link, 500) : '',
  };
}

export function applyUpdate(lead, u, now = new Date().toISOString()) {
  const next = { ...lead };
  if (u.status != null) {
    if (!STATUSES.includes(u.status)) throw new Error('bad status');
    if (u.status !== lead.status) next.history = [...(lead.history || []), { at: now, status: u.status }];
    next.status = u.status;
  }
  if (u.comment != null) next.comment = str(u.comment, 2000);
  if (u.next != null) next.next = /^\d{4}-\d{2}-\d{2}$/.test(u.next) ? u.next : '';
  next.updatedAt = now;
  return next;
}

async function readJson(pathname) {
  const r = await get(pathname, { access: 'private', useCache: false });
  if (!r) return null;
  return JSON.parse(await new Response(r.stream).text());
}

// Returns false when the lead is already there (the parser may send the same post twice).
export async function addLead(raw) {
  const lead = cleanLead(raw);
  if (!lead.id || !lead.text) throw new Error('id and text required');
  const now = new Date().toISOString();
  try {
    await put(pathOf(lead.id), JSON.stringify({ ...lead, status: 'Новая', comment: '', next: '', addedAt: now, history: [] }),
      { ...opts, allowOverwrite: false });
    return true;
  } catch (e) {
    if (/already exists/i.test(e.message)) return false;
    throw e;
  }
}

export async function allLeads() {
  const blobs = [];
  let cursor;
  do {
    const r = await list({ prefix: 'leads/', cursor });
    blobs.push(...r.blobs);
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);
  const out = [];
  for (let i = 0; i < blobs.length; i += 20) {
    out.push(...await Promise.all(blobs.slice(i, i + 20).map(b => readJson(b.pathname).catch(() => null))));
  }
  return out.filter(Boolean).sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || ''));
}

export async function updateLead(id, u) {
  const p = pathOf(id);
  const lead = await readJson(p);
  if (!lead) return null;
  const next = applyUpdate(lead, u);
  await put(p, JSON.stringify(next), { ...opts, allowOverwrite: true });
  return next;
}
