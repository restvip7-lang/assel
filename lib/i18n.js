// Languages of the site: Russian at /, English at /en/, Turkish at /tr/.
// All interface texts live in data/i18n.json; objects are localized here at build time.
import dict from '../data/i18n.json' with { type: 'json' };

export const LANGS = ['ru', 'en', 'tr'];
export const prefix = lang => (lang === 'ru' ? '' : '/' + lang);
export const T = lang => dict[lang];
export const fmt = (s, v = {}) => String(s).replace(/\{(\w+)\}/g, (m, k) => (v[k] ?? m));

// A title the bot generated because Assel gave no complex name («Квартира 1+1, 35 м²»).
export const isAutoName = name => /^(Квартира|Вилла)(\s\d\+\d)?(,\s[\d.,]+\sм²)?$/.test(String(name || '').trim());

// One object as a visitor of this language sees it. `d` stays Russian (it is the filter key), `dn` is the shown district.
// Nothing is invented: a tag, badge or «nearby» item without a known translation is left out.
export function localize(o, lang) {
  const L = dict[lang];
  const { desc_en, desc_tr, near_en, near_tr, ...out } = o;
  out.auto = isAutoName(o.name);
  out.dn = L.districts?.[o.d] || o.d;
  out.yearTxt = !o.year ? '' : o.year === 'Сдан' ? L.yearDone : fmt(L.yearDue, { y: o.year });
  out.tags = o.tags || []; out.near = o.near || [];
  if (lang === 'ru') return out;
  const villa = o.rooms === 'Вилла';
  if (villa) out.rooms = L.villa;
  if (out.auto) out.name = fmt(villa ? L.autoVilla : L.autoApt, { rooms: o.rooms, area: o.area });
  out.tags = out.tags.map(t => L.tags[t]).filter(Boolean);
  const sea = /^(\d+)\s*м до моря$/.exec(o.hot || '');
  const hot = sea ? fmt(L.seaTxt, { n: sea[1] }) : L.hot[o.hot];
  if (hot) out.hot = hot; else delete out.hot;
  out.near = o['near_' + lang] || [];
  out.desc = o['desc_' + lang] || o.desc || '';
  if (o.floor) { const m = /^(\d+)\s*из\s*(\d+)$/.exec(o.floor); if (m) out.floor = fmt(L.floorOf, { a: m[1], b: m[2] }); }
  if (o.year === 'Сдан') out.year = L.yearDone;
  return out;
}
