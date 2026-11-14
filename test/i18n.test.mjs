import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { LANGS, T, prefix, fmt, localize, isAutoName } from '../lib/i18n.js';
import { toObject, toDraft } from '../lib/objects.js';
import { leadText } from '../api/lead.js';

const read = f => JSON.parse(fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8'));
// The shape of a value: same keys and list lengths in every language.
const shape = v => Array.isArray(v) ? v.map(shape) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, shape(v[k])])) : typeof v;
const tokens = s => (String(s).match(/\{\/?\w+\}/g) || []).sort().join();

test('English and Turkish have every text the Russian site has', () => {
  const { districts: _d, tags: _t, hot: _h, ...ru } = T('ru');
  for (const l of ['en', 'tr']) {
    const { districts, tags, hot, ...x } = T(l);
    assert.deepEqual(shape(x), shape(ru), l);
    for (const k of Object.keys(ru)) if (typeof ru[k] === 'string') assert.equal(tokens(x[k]), tokens(ru[k]), `${l}.${k}`);
    for (const k of Object.keys(ru.meta)) assert.equal(tokens(x.meta[k]), tokens(ru.meta[k]), `${l}.meta.${k}`);
    assert.deepEqual(Object.keys(districts).sort(), Object.keys(T('en').districts).sort());
  }
});

test('topic pages exist in every language with the same structure', () => {
  const ru = read('data/guides.json');
  for (const l of ['en', 'tr']) {
    const g = read(`data/guides.${l}.json`);
    const strip = x => x.map(({ msg, ...r }) => r);
    assert.deepEqual(shape(strip(g)), shape(strip(ru)), l);
    g.forEach((x, i) => {
      assert.match(x.slug, /^[a-z-]+$/);
      x.blocks.forEach((b, j) => { assert.equal(b.type, ru[i].blocks[j].type); if (b.type === 'districts') assert.deepEqual(b.cards.map(c => c.d), ru[i].blocks[j].cards.map(c => c.d)); });
    });
  }
});

const o = { n: 7, owner: true, name: 'Квартира 1+1, 35 м²', d: 'Газипаша', price: 45000, rooms: '1+1', area: 35, sea: 1000, floor: '4 из 9', year: 'Сдан',
  imgs: ['o7-1'], tags: ['С мебелью', 'Своя метка'], hot: '150 м до моря', desc: 'Описание', desc_en: 'Description', near: ['Море 1000 м'], near_en: ['Sea 1000 m'] };

test('an object is shown in the visitor language without invented text', () => {
  const en = localize(o, 'en'), tr = localize(o, 'tr'), ru = localize(o, 'ru');
  assert.equal(ru.name, o.name); assert.equal(ru.dn, 'Газипаша'); assert.equal(ru.yearTxt, 'Сдан'); assert.deepEqual(ru.tags, o.tags);
  assert.equal(en.name, '1+1 apartment, 35 m²'); assert.equal(tr.name, '1+1 daire, 35 m²');
  assert.equal(en.d, 'Газипаша'); assert.equal(en.dn, 'Gazipasa'); assert.equal(tr.dn, 'Gazipaşa');
  assert.deepEqual(en.tags, ['Furnished']); // a tag without a translation is left out
  assert.equal(en.hot, '150 m to the sea'); assert.equal(en.floor, '4 of 9'); assert.equal(en.year, 'Completed'); assert.equal(tr.yearTxt, 'Tamamlandı');
  assert.equal(en.desc, 'Description'); assert.deepEqual(en.near, ['Sea 1000 m']);
  assert.equal(tr.desc, 'Описание'); assert.deepEqual(tr.near, []); // no Turkish text yet: Russian description, no «nearby»
  assert.equal(en.desc_en, undefined);
  assert.equal(localize({ ...o, name: 'Sea Line' }, 'en').name, 'Sea Line');
  assert.equal(localize({ ...o, hot: 'Торг' }, 'en').hot, undefined);
});

test('auto titles are recognised, complex names are not', () => {
  for (const n of ['Квартира 1+1, 35 м²', 'Вилла, 220 м²', 'Квартира 2+1']) assert.ok(isAutoName(n), n);
  for (const n of ['Sea Line', 'Квартира у моря', 'Вилла Роза']) assert.ok(!isAutoName(n), n);
});

test('paths and placeholders', () => {
  assert.deepEqual(LANGS.map(prefix), ['', '/en', '/tr']);
  assert.equal(fmt('№{n} {x}', { n: 3 }), '№3 {x}');
});

test('the bot keeps «nearby» translations only when they match the Russian list', () => {
  const p = { ...toDraft(o), near: ['Море 1000 м', 'Центр 2 км'], near_en: ['Sea 1000 m', 'Centre 2 km'], near_tr: ['Deniz 1000 m'] };
  const x = toObject(p, 7, ['o7-1']);
  assert.deepEqual(x.near_en, ['Sea 1000 m', 'Centre 2 km']);
  assert.equal(x.near_tr, undefined);
  assert.deepEqual(toDraft(x).near_en, x.near_en);
});

test('a lead from the English site says so', () => {
  assert.match(leadText({ name: 'John', contact: '+44 1', when: 'Сегодня', lang: 'en' }), /Язык сайта: английский/);
  assert.doesNotMatch(leadText({ name: 'Иван', contact: '+7 1', when: 'Сегодня', lang: 'ru' }), /Язык сайта/);
});
