// Pure helpers for objects: validation, numbering, preview text. Used by build.mjs and the bot.

export function validate(list) {
  const seen = new Set();
  const errors = [];
  for (const o of list) {
    if (o.deleted) { if (seen.has(o.n)) errors.push(`объект №${o.n}: номер повторяется`); seen.add(o.n); continue; }
    const id = `объект №${o.n ?? '?'}`;
    if (!Number.isInteger(o.n) || o.n < 1) errors.push(`${id}: n должен быть целым числом`);
    if (seen.has(o.n)) errors.push(`${id}: номер повторяется`);
    seen.add(o.n);
    for (const k of ['name', 'd', 'rooms']) if (!o[k]) errors.push(`${id}: нет поля ${k}`);
    for (const k of ['price', 'area']) if (!(o[k] > 0)) errors.push(`${id}: ${k} должно быть больше 0`);
    if (o.sea != null && !(o.sea > 0)) errors.push(`${id}: sea должно быть больше 0`);
    if (!Array.isArray(o.imgs) || !o.imgs.length) errors.push(`${id}: нужны фото (imgs)`);
  }
  return errors;
}

// What is still missing before an object can be published.
export function missing(o, photos) {
  const m = [];
  if (!o.d) m.push('район');
  if (!o.rooms) m.push('комнаты');
  if (!(o.price > 0)) m.push('цена в евро');
  if (!(o.area > 0)) m.push('площадь');
  if (!photos) m.push('хотя бы одно фото');
  return m;
}

// Title when the complex name is unknown, e.g. «Квартира 1+1, 35 м²».
export const autoName = p => [p.rooms === 'Вилла' ? 'Вилла' : `Квартира ${p.rooms || ''}`.trim(), p.area ? `${p.area} м²` : ''].filter(Boolean).join(', ');

// Real objects are numbered from 1; demo examples are ignored.
export const nextNumber = list => Math.max(0, ...list.filter(o => !o.demo).map(o => o.n)) + 1;

// Text from forwarded posts ends up in the page HTML: strip tags and trim.
const clean = v => typeof v === 'string' ? v.replace(/[<>]/g, '').trim() : v;

// Turn the parsed draft into a site object. Fields Claude left empty are dropped.
export function toObject(p, n, imgs) {
  const o = {
    n,
    ...(p.owner ? { owner: true } : {}),
    name: clean(p.name) || autoName(p), d: clean(p.d), price: Math.round(p.price), rooms: clean(p.rooms), area: p.area,
  };
  if (p.sea > 0) o.sea = Math.round(p.sea);
  if (p.floor) o.floor = clean(p.floor);
  if (p.year) o.year = clean(p.year);
  o.imgs = imgs;
  o.tags = (p.tags || []).map(clean).filter(Boolean).slice(0, 3);
  if (p.hot) o.hot = clean(p.hot);
  o.desc = clean(p.desc || '');
  o.near = (p.near || []).map(clean).filter(Boolean).slice(0, 6);
  if (p.desc_en) o.desc_en = clean(p.desc_en);
  if (p.desc_tr) o.desc_tr = clean(p.desc_tr);
  // «Nearby» in English and Turkish: kept only when it matches the Russian list item by item.
  for (const k of ['near_en', 'near_tr']) { const v = (p[k] || []).map(clean).filter(Boolean).slice(0, 6); if (v.length && v.length === o.near.length) o[k] = v; }
  o.addedAt = new Date().toISOString().slice(0, 10);
  return o;
}

// Add a published object; the first real object removes the demo examples.
export const addObject = (list, o) => [...list.filter(x => !x.demo), o];

const eur = p => '€' + Math.round(p).toLocaleString('en-US').replace(/,/g, ' ');

export function previewText(p, photos) {
  const v = x => (x === null || x === undefined || x === '' ? '—' : x);
  const lines = [
    `<b>${esc(p.name || autoName(p))}, ${esc(v(p.d))}</b>`,
    `${p.owner ? 'От собственника' : 'От застройщика'}`,
    `Цена: ${p.price > 0 ? eur(p.price) : '—'}`,
    `Комнаты: ${esc(v(p.rooms))} · Площадь: ${p.area ? p.area + ' м²' : '—'}`,
    `До моря: ${p.sea ? p.sea + ' м' : '—'} · Этаж: ${esc(v(p.floor))} · Сдача: ${esc(v(p.year))}`,
    p.tags?.length ? `Метки: ${esc(p.tags.join(', '))}` : '',
    p.hot ? `Плашка: ${esc(p.hot)}` : '',
    '',
    esc(p.desc || ''),
    p.near?.length ? `\nРядом: ${esc(p.near.join(', '))}` : '',
    `\nФото: ${photos}`,
  ];
  const m = missing(p, photos);
  if (!p.name) lines.push(`\n🏷 Название комплекса не указано. Если знаете, напишите его сообщением, например «комплекс Sea Line». Если нет, публикуйте так: на сайте будет «${esc(autoName(p))}».`);
  if (m.length) lines.push(`\n⚠️ Не хватает: ${m.join(', ')}. Напишите это сообщением, например «цена 145000».`);
  if (p.questions?.length) lines.push(`\n❓ ${esc(p.questions.join('\n❓ '))}`);
  return lines.filter(l => l !== '').join('\n');
}

// Object number from a message: «1», «№1», «#1» or a site link …/o/1/.
export function objectRef(text) {
  const t = String(text || '').trim();
  const m = t.match(/^(?:№|#|n)?\s*(\d{1,4})$/i) || t.match(/^https?:\/\/\S*?\/o\/(\d{1,4})\/?(?:[?#]\S*)?$/i);
  return m ? Number(m[1]) : null;
}

// Site object -> the draft shape Claude edits.
export const toDraft = o => ({
  name: o.name ?? null, d: o.d ?? null, owner: !!o.owner, price: o.price ?? null, rooms: o.rooms ?? null, area: o.area ?? null,
  sea: o.sea ?? null, floor: o.floor ?? null, year: o.year ?? null, tags: o.tags || [], hot: o.hot ?? null,
  desc: o.desc || '', desc_en: o.desc_en || '', desc_tr: o.desc_tr || '', near: o.near || [], near_en: o.near_en || [], near_tr: o.near_tr || [], photo_ids: [], questions: [],
});

// Apply an edited draft to a published object; number, photos, sold state, video and date stay.
export function updateObject(old, p) {
  const o = toObject(p, old.n, old.imgs);
  for (const k of ['sold', 'video', 'youtube', 'addedAt']) if (old[k] !== undefined) o[k] = old[k];
  return o;
}

const LABELS = { name: 'Название', d: 'Район', owner: 'Продавец', price: 'Цена', rooms: 'Комнаты', area: 'Площадь', sea: 'До моря',
  floor: 'Этаж', year: 'Сдача', tags: 'Метки', hot: 'Плашка', desc: 'Описание', near: 'Рядом' };
const show = (k, v) => v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length) ? '—'
  : k === 'owner' ? (v ? 'собственник' : 'застройщик') : k === 'price' ? eur(v) : k === 'area' ? v + ' м²' : k === 'sea' ? v + ' м'
  : Array.isArray(v) ? v.join(', ') : String(v);

// «Цена: €45 000 → €47 000» lines for the fields that changed.
export function diffText(old, next) {
  const lines = [];
  for (const k of Object.keys(LABELS)) {
    const a = k === 'owner' ? !!old[k] : old[k], b = k === 'owner' ? !!next[k] : next[k];
    if (JSON.stringify(a ?? null) === JSON.stringify(b ?? null)) continue;
    lines.push(k === 'desc' ? `<b>Описание</b> станет:\n${esc(show(k, b))}` : `<b>${LABELS[k]}:</b> ${esc(show(k, a))} → ${esc(show(k, b))}`);
  }
  return lines.join('\n');
}

// A deleted object leaves a stub so its number is never reused and old links lead to the home page.
export const deleteObject = (list, n) => list.map(o => (o.n === n && !o.demo ? { n, deleted: true, deletedAt: new Date().toISOString().slice(0, 10) } : o));

// Next free photo index for object n, e.g. after o3-1..o3-9 comes 10.
export const nextPhotoIndex = o => Math.max(0, ...(o.imgs || []).map(k => Number(k.match(new RegExp(`^o${o.n}-(\\d+)$`))?.[1] || 0))) + 1;

export const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export { eur };
