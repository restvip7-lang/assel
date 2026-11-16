import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanLead, applyUpdate, STATUSES } from '../lib/leads.js';

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
