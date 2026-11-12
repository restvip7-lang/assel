// Drafts live in a private Vercel Blob store: one file per forwarded message, plus state.json.
import { put, list, del, get } from '@vercel/blob';

const dir = chat => `drafts/${chat}/`;
const opts = { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json' };

export const addPart = (chat, msgId, part) => put(`${dir(chat)}part-${String(msgId).padStart(10, '0')}.json`, JSON.stringify(part), opts);

// True only for the first message of an album, so the bot replies once per album.
export async function firstOfAlbum(chat, groupId) {
  try {
    await put(`${dir(chat)}album-${groupId}.json`, '{}', { ...opts, allowOverwrite: false });
    return true;
  } catch {
    return false;
  }
}

async function readJson(pathname) {
  const r = await get(pathname, { access: 'private', useCache: false });
  if (!r) return null;
  return JSON.parse(await new Response(r.stream).text());
}

export async function parts(chat) {
  const { blobs } = await list({ prefix: dir(chat) + 'part-' });
  blobs.sort((a, b) => a.pathname.localeCompare(b.pathname));
  return Promise.all(blobs.map(b => readJson(b.pathname)));
}

export const getState = async chat => (await readJson(dir(chat) + 'state.json')) || { stage: 'collect' };
export const setState = (chat, state) => put(dir(chat) + 'state.json', JSON.stringify(state), opts);

export async function clear(chat) {
  let cursor;
  do {
    const r = await list({ prefix: dir(chat), cursor });
    if (r.blobs.length) await del(r.blobs.map(b => b.url));
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);
}
