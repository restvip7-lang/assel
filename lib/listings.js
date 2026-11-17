// Apartments for sale by owners, found by the parser (alanya-leads, owners.py) in the same Telegram chats.
// A plain list for Anuar: grouped by district and layout, with a link to the post and the seller's contacts.
// One private Blob per listing (listings/<sha>.json). The group chat for run summaries is in config/listings-chat.json.
import crypto from 'node:crypto';
import { put, list, get } from '@vercel/blob';
import { claimAll, release } from './dupkeys.js';
import { sign, GROUP_LINK_TTL } from './auth.js';

const opts = { access: 'private', addRandomSuffix: false, contentType: 'application/json' };
const pathOf = id => `listings/${crypto.createHash('sha256').update(String(id)).digest('hex').slice(0, 24)}.json`;
const CHAT_PATH = 'config/listings-chat.json';
const str = (v, max) => (v == null ? '' : String(v)).trim().slice(0, max);
const num = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.round(n) : null; };

// An author with more different apartments than this (over all runs) is shown as «похоже, агент».
export const AGENT_AFTER = 3;

export function cleanListing(b) {
  return {
    id: str(b.id, 100),
    source: str(b.source, 30),
    date: str(b.date, 30),
    chat: str(b.chat, 120),
    author: str(b.author, 120),
    author_id: /^\d{1,20}$/.test(str(b.author_id, 20)) ? str(b.author_id, 20) : '',
    author_profile: /^@\w{4,40}$/.test(str(b.author_profile, 41)) ? str(b.author_profile, 41) : '',
    phone: str(b.phone, 20).replace(/[^\d+]/g, ''),
    price: num(b.price),
    currency: str(b.currency, 5),
    rooms: str(b.rooms, 20),
    area: num(b.area),
    district: str(b.district, 40),
    owner_said: b.owner_said === true,
    contacts: str(b.contacts, 200),
    text: str(b.text, 4000),
    link: /^https:\/\//.test(str(b.link, 500)) ? str(b.link, 500) : '',
  };
}

async function readJson(pathname) {
  const r = await get(pathname, { access: 'private', useCache: false });
  if (!r) return null;
  return JSON.parse(await new Response(r.stream).text());
}

// false when the listing is already there (the parser sends overlapping windows).
export async function addListing(raw) {
  const l = cleanListing(raw);
  if (!l.id || !l.text) throw new Error('id and text required');
  // Same owner reposting the same apartment (same text, or same district + layout + price): a duplicate
  const { isNew, claimed } = await claimAll('listings', raw.dup_keys);
  if (!isNew) return false;
  try {
    await put(pathOf(l.id), JSON.stringify({ ...l, addedAt: new Date().toISOString() }), { ...opts, allowOverwrite: false });
    return true;
  } catch (e) {
    if (/already exists/i.test(e.message)) return false;
    await Promise.all(claimed.map(k => release('listings', k)));
    throw e;
  }
}

export async function allListings() {
  const blobs = [];
  let cursor;
  do {
    const r = await list({ prefix: 'listings/', cursor });
    blobs.push(...r.blobs);
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);
  const out = [];
  for (let i = 0; i < blobs.length; i += 20) {
    out.push(...await Promise.all(blobs.slice(i, i + 20).map(b => readJson(b.pathname).catch(() => null))));
  }
  return markAgents(mergeDuplicates(out.filter(Boolean)));
}

// Same apartment posted in several chats (or by two people with the same text): show it once, newest first,
// with the other chats in `also`. Also cleans listings saved before dup_keys existed.
const textKey = t => String(t || '').toLowerCase().replace(/[^\p{L}\p{N}_]+/gu, '').slice(0, 400);
export function mergeDuplicates(listings) {
  const sorted = [...listings].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const byKey = new Map();
  const out = [];
  for (const l of sorted) {
    const t = textKey(l.text);
    const keys = [t.length >= 40 ? 't:' + t : 'id:' + l.id];
    if (l.author_id && l.price && l.rooms) keys.push(`flat:${l.author_id}:${l.district}:${l.rooms}:${l.price}`);
    const kept = keys.map(k => byKey.get(k)).find(Boolean);
    if (kept) {
      kept.also.push({ chat: l.chat, link: l.link, date: l.date });
      if (!kept.author_profile && l.author_profile) kept.author_profile = l.author_profile;
      if (!kept.phone && l.phone) kept.phone = l.phone;
    } else {
      const k = { ...l, also: [] };
      out.push(k);
      keys.forEach(x => byKey.set(x, k));
      continue;
    }
    keys.forEach(x => byKey.has(x) || byKey.set(x, kept));
  }
  return out;
}

export function markAgents(listings) {
  const n = {};
  for (const l of listings) if (l.author_id) n[l.author_id] = (n[l.author_id] || 0) + 1;
  return listings.map(l => ({ ...l, agent: !!l.author_id && n[l.author_id] > AGENT_AFTER }));
}

export async function setHidden(id, hidden) {
  const p = pathOf(id);
  const l = await readJson(p);
  if (!l) return null;
  const next = { ...l, hidden: !!hidden, updatedAt: new Date().toISOString() };
  await put(p, JSON.stringify(next), { ...opts, allowOverwrite: true });
  return next;
}

export const getChat = () => readJson(CHAT_PATH).then(j => j?.chat ?? null).catch(() => null);
export const setChat = (chat, title) => put(CHAT_PATH, JSON.stringify({ chat, title, at: new Date().toISOString() }), { ...opts, allowOverwrite: true });

const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const ROOM_ORDER = r => (/^\d\+\d$/.test(r) ? Number(r[0]) * 10 + Number(r[2]) : 100);

// One message per run: count, then districts with their layouts. Empty string when nothing is new.
export function summaryText(listings) {
  if (!listings.length) return '';
  const by = {};
  for (const raw of listings) {
    const l = cleanListing(raw);
    const d = l.district || 'Район не указан';
    const r = l.rooms || '?';
    (by[d] ||= {})[r] = (by[d][r] || 0) + 1;
  }
  const lines = Object.entries(by)
    .sort((a, b) => sum(b[1]) - sum(a[1]))
    .map(([d, rooms]) => `• <b>${esc(d)}</b>: ` + Object.entries(rooms)
      .sort((a, b) => ROOM_ORDER(a[0]) - ROOM_ORDER(b[0]))
      .map(([r, n]) => (n > 1 ? `${esc(r)} × ${n}` : esc(r))).join(', '));
  return `🏠 <b>Новых квартир от собственников: ${listings.length}</b>\n${lines.join('\n')}`;
}
const sum = o => Object.values(o).reduce((a, b) => a + b, 0);

export const viewerLink = (site, chat) => `${site}/api/login/?g=${sign('g', chat, GROUP_LINK_TTL)}`;
