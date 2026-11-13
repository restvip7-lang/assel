// What a Claude call costs and a running estimate of the money left on the Anthropic account.
// Anthropic has no API that reports the prepaid balance, so the bot keeps its own estimate:
// the owner sets it with /balance after a top-up, and every call subtracts its cost.
import { put, get } from '@vercel/blob';

// claude-opus-5-5, USD per million tokens. Thinking tokens are billed as output.
export const PRICE = { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 };
export const LOW_BALANCE = 1;

export function costOf(u = {}) {
  return ((u.input_tokens || 0) * PRICE.input + (u.output_tokens || 0) * PRICE.output
    + (u.cache_creation_input_tokens || 0) * PRICE.cacheWrite + (u.cache_read_input_tokens || 0) * PRICE.cacheRead) / 1e6;
}

export const usd = x => '$' + (x < 0.1 ? x.toFixed(3) : x.toFixed(2));

const PATH = 'billing/state.json';
const opts = { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json' };

export async function getBilling() {
  const r = await get(PATH, { access: 'private', useCache: false }).catch(() => null);
  return r ? JSON.parse(await new Response(r.stream).text()) : { balance: null, spent: 0 };
}
const save = b => put(PATH, JSON.stringify(b), opts);

export async function setBalance(balance) {
  const b = await getBilling();
  await save({ ...b, balance, setAt: new Date().toISOString(), warned: false });
}

// Subtract a cost. Returns the new state and whether the balance just went below the warning line.
export async function charge(cost) {
  const b = await getBilling();
  const next = { ...b, spent: (b.spent || 0) + cost };
  let warn = false;
  if (b.balance != null) {
    next.balance = b.balance - cost;
    if (next.balance < LOW_BALANCE && !b.warned) { next.warned = true; warn = true; }
  }
  await save(next);
  return { ...next, warn };
}

export const outOfCredit = e => /credit balance/i.test(String(e?.message || ''));
