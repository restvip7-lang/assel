import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanLead, applyUpdate, STATUSES, summaryText } from '../lib/leads.js';

process.env.TELEGRAM_BOT_TOKEN ||= 'test-token';
const { sign, verify, sessionUser, COOKIE } = await import('../lib/auth.js');
const { default: leadsApi } = await import('../api/leads.js');

const res = () => { const r = { code: 0, body: null, headers: {} }; r.status = c => (r.code = c, r); r.json = b => (r.body = b, r); r.end = () => r; r.setHeader = (k, v) => (r.headers[k] = v); return r; };

test('lead from the parser keeps only known fields and safe links', () => {
  const l = cleanLead({ id: 'tg:1:2', text: 'Куплю 2+1', budget: '150000.4', link: 'javascript:alert(1)', secret: 's', evil: 1 });
  assert.equal(l.budget, 150000);
  assert.equal(l.link, '');
  assert.equal('secret' in l, false);
  assert.equal('evil' in l, false);
  assert.equal(cleanLead({ link: 'https://t.me/a/1' }).link, 'https://t.me/a/1');
});

test('status change is recorded in history, unknown status rejected', () => {
  const l = { id: 'x', status: 'Новая', history: [] };
  const u = applyUpdate(l, { status: 'Не дозвонилась', comment: 'перезвонить', next: '2026-11-20' }, 'T');
  assert.deepEqual(u.history, [{ at: 'T', status: 'Не дозвонилась' }]);
  assert.equal(u.comment, 'перезвонить');
  assert.equal(applyUpdate(u, { next: 'завтра' }).next, '');
  assert.equal(applyUpdate(u, { comment: 'ещё' }).history.length, 1);
  assert.throws(() => applyUpdate(l, { status: 'Купил' }));
  assert.ok(STATUSES.includes('Новая'));
});

test('login link and session: right kind, not expired, admins only', () => {
  const now = Date.now();
  const t = sign('l', 42, 60e3, now);
  assert.equal(verify(t, 'l', now).u, 42);
  assert.equal(verify(t, 's', now), null);
  assert.equal(verify(t, 'l', now + 61e3), null);
  assert.equal(verify(t.slice(0, -2) + 'xx', 'l', now), null);
  const s = sign('s', 42, 60e3);
  assert.equal(sessionUser({ headers: { cookie: `a=1; ${COOKIE}=${s}` } }, [42]), 42);
  assert.equal(sessionUser({ headers: { cookie: `${COOKIE}=${s}` } }, [7]), null);
});

test('leads API: parser needs the secret, cabinet needs a session', async () => {
  process.env.LEADS_SECRET = 'right';
  let r = res(); await leadsApi({ method: 'POST', headers: {}, body: { id: '1', text: 'x', secret: 'wrong' } }, r);
  assert.equal(r.code, 401);
  r = res(); await leadsApi({ method: 'GET', headers: {}, body: {} }, r);
  assert.equal(r.code, 401);
  delete process.env.LEADS_SECRET;
  r = res(); await leadsApi({ method: 'POST', headers: { 'x-leads-secret': '' }, body: {} }, r);
  assert.equal(r.code, 503);
});

test('summary after a run: count, short lines, nothing when empty', () => {
  assert.equal(summaryText([]), '');
  const t = summaryText([
    { property_type: '2+1', districts: 'Оба', budget: 120000, currency: 'EUR', text: 'x' },
    { text: 'Куплю <b>дом</b>' },
    ...Array(5).fill({ property_type: 'вилла', text: 'y' }),
  ]);
  assert.match(t, /Новых заявок: 7/);
  assert.match(t, /2\+1, Оба, 120\s000 €/);
  assert.match(t, /Куплю &lt;b&gt;дом/);
  assert.match(t, /и ещё 2/);
});

test('delete needs a reason, keeps the record, can be restored', () => {
  const l = { id: 'x', status: 'Новая', history: [] };
  assert.throws(() => applyUpdate(l, { deleted: true, reason: '  ' }));
  const d = applyUpdate(l, { deleted: true, reason: 'Уже купил' }, 'T');
  assert.equal(d.deleted, true);
  assert.equal(d.deleteReason, 'Уже купил');
  assert.deepEqual(d.history.at(-1), { at: 'T', deleted: 'Уже купил' });
  const r = applyUpdate(d, { deleted: false }, 'U');
  assert.equal(r.deleted, false);
  assert.deepEqual(r.history.at(-1), { at: 'U', restored: true });
});

test('owner listing: only known fields, safe values', async () => {
  const { cleanListing } = await import('../lib/listings.js');
  const l = cleanListing({ id: 'own:1', text: 'Продаю 2+1', price: '145000', author_id: '12x', author_profile: 'evil', link: 'http://x', phone: '+90 (555) 1', secret: 's' });
  assert.equal(l.price, 145000);
  assert.equal(l.author_id, '');
  assert.equal(l.author_profile, '');
  assert.equal(l.link, '');
  assert.equal(l.phone, '+905551');
  assert.equal('secret' in l, false);
});

test('owner listings: authors with many apartments are marked as agents', async () => {
  const { markAgents, AGENT_AFTER } = await import('../lib/listings.js');
  const many = Array.from({ length: AGENT_AFTER + 1 }, (_, i) => ({ id: 'a' + i, author_id: '7' }));
  const out = markAgents([...many, { id: 'b', author_id: '8' }, { id: 'c', author_id: '' }]);
  assert.equal(out.filter(l => l.agent).length, AGENT_AFTER + 1);
  assert.equal(out.find(l => l.id === 'b').agent, false);
  assert.equal(out.find(l => l.id === 'c').agent, false);
});

test('owner listings summary: one message, by district and layout', async () => {
  const { summaryText } = await import('../lib/listings.js');
  assert.equal(summaryText([]), '');
  const t = summaryText([
    { district: 'Махмутлар', rooms: '2+1' }, { district: 'Махмутлар', rooms: '1+1' }, { district: 'Махмутлар', rooms: '1+1' },
    { district: 'Оба', rooms: '3+1' }, { rooms: '' },
  ]);
  assert.match(t, /Новых квартир от собственников: 5/);
  assert.match(t, /Махмутлар<\/b>: 1\+1 × 2, 2\+1/);
  assert.match(t, /Оба<\/b>: 3\+1/);
  assert.match(t, /Район не указан<\/b>: \?/);
  assert.ok(t.indexOf('Махмутлар') < t.indexOf('Оба'));
});

test('listings API: parser needs the secret, list needs a session or the group link', async () => {
  const { default: api } = await import('../api/listings.js');
  process.env.LEADS_SECRET = 'right';
  let r = res(); await api({ method: 'POST', headers: {}, body: { id: '1', text: 'x', secret: 'wrong' } }, r);
  assert.equal(r.code, 401);
  r = res(); await api({ method: 'GET', headers: {}, body: {} }, r);
  assert.equal(r.code, 401);
  const { sign, VIEW_COOKIE, viewerOk } = await import('../lib/auth.js');
  assert.equal(viewerOk({ headers: { cookie: `${VIEW_COOKIE}=${sign('v', -100, 60e3)}` } }), true);
  assert.equal(viewerOk({ headers: { cookie: `${VIEW_COOKIE}=${sign('s', -100, 60e3)}` } }), false);
  delete process.env.LEADS_SECRET;
});

test('group link opens only the listings, admin link can go there too', async () => {
  const { default: login } = await import('../api/login.js');
  const { sign, VIEW_COOKIE } = await import('../lib/auth.js');
  process.env.ADMIN_IDS = '42';
  const r = () => { const x = res(); x.redirect = (c, u) => (x.code = c, x.to = u, x); x.send = b => (x.body = b, x); return x; };
  let x = r(); login({ query: { g: sign('g', -100, 60e3) } }, x);
  assert.equal(x.to, '/cabinet/listings/');
  assert.match(x.headers['Set-Cookie'], new RegExp('^' + VIEW_COOKIE + '='));
  x = r(); login({ query: { g: sign('l', 42, 60e3) } }, x);
  assert.equal(x.code, 401);
  x = r(); login({ query: { t: sign('l', 42, 60e3), to: 'listings' } }, x);
  assert.equal(x.to, '/cabinet/listings/');
  x = r(); login({ query: { t: sign('l', 42, 60e3) } }, x);
  assert.equal(x.to, '/cabinet/');
});
