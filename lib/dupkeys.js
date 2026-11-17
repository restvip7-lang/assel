// Duplicate guard by content, not by post id: the same person posts the same request or apartment in several chats
// (or reposts it next day). The parser sends dup_key (author + normalized text, or author + district + layout + price);
// the first post with that key wins, later ones are reported as duplicates. One empty private Blob per key.
import crypto from 'node:crypto';
import { put, del } from '@vercel/blob';

const pathOf = (kind, key) => `dupkeys/${kind}/${crypto.createHash('sha256').update(String(key)).digest('hex').slice(0, 32)}.json`;

// true = this key is new (now claimed); false = seen before.
export async function claim(kind, key) {
  if (!key) return true;
  try {
    await put(pathOf(kind, key), '{}', { access: 'private', addRandomSuffix: false, allowOverwrite: false, contentType: 'application/json' });
    return true;
  } catch (e) {
    if (/already exists/i.test(e.message)) return false;
    throw e;
  }
}

// Undo a claim when saving the item itself failed, so a retry is not mistaken for a duplicate.
export const release = (kind, key) => (key ? del(pathOf(kind, key)).catch(() => {}) : Promise.resolve());

// Several keys (e.g. same text, same apartment): new only if none was seen. Claims every key either way,
// so a later repost matching any of them is caught.
export async function claimAll(kind, keys) {
  const list = [...new Set((keys || []).map(k => String(k || '').trim().slice(0, 300)).filter(Boolean))];
  const fresh = await Promise.all(list.map(k => claim(kind, k)));
  return { isNew: fresh.every(Boolean), claimed: list.filter((_, i) => fresh[i]) };
}
