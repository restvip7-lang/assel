import test from 'node:test';
import assert from 'node:assert/strict';
import { validate, missing, nextNumber, toObject, addObject, previewText } from '../lib/objects.js';
import { leadText } from '../api/lead.js';

const parsed = {
  name: 'Sea <b>Line</b>', d: 'Махмутлар', owner: false, price: 139000.4, rooms: '1+1', area: 58, sea: null,
  floor: null, year: '2026', inst: { first: '40%', months: 18 }, tags: ['Рассрочка'], hot: null,
  desc: 'Светлая квартира.', desc_en: 'Bright flat.', desc_tr: 'Aydınlık daire.', near: ['Пляж 350 м'], questions: [],
};

test('numbering ignores demo objects and starts at 1', () => {
  assert.equal(nextNumber([{ n: 30, demo: true }]), 1);
  assert.equal(nextNumber([{ n: 30, demo: true }, { n: 4 }]), 5);
});

test('first real object removes demo examples', () => {
  const list = addObject([{ n: 12, demo: true }, { n: 1 }], { n: 2 });
  assert.deepEqual(list.map(o => o.n), [1, 2]);
});

test('parsed draft becomes a valid object without invented fields', () => {
  const o = toObject(parsed, 1, ['o1-1']);
  assert.deepEqual(validate([o]), []);
  assert.equal(o.name, 'Sea bLine/b');
  assert.equal(o.price, 139000);
  assert.equal('sea' in o, false);
  assert.equal('floor' in o, false);
  assert.equal('owner' in o, false);
});

test('missing fields block publishing', () => {
  assert.deepEqual(missing({ ...parsed, price: null }, 2), ['цена в евро']);
  assert.deepEqual(missing(parsed, 0), ['хотя бы одно фото']);
  assert.match(previewText({ ...parsed, price: null }, 1), /Не хватает: цена/);
});

test('preview escapes HTML', () => assert.match(previewText(parsed, 1), /Sea &lt;b&gt;Line/));

test('lead message names the object and the source', () => {
  const t = leadText({ name: 'Иван', contact: '+7 700 000 00 00', when: 'Сегодня', n: 12, src: 'instagram / reels12' });
  assert.match(t, /№12/);
  assert.match(t, /instagram \/ reels12/);
  assert.match(leadText({ name: '<x>', contact: '1234' }), /&lt;x&gt;/);
});
