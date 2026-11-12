import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validate } from '../build.mjs';

const objects = JSON.parse(fs.readFileSync(new URL('../data/objects.json', import.meta.url)));
const ok = { n: 1, name: 'A', d: 'Оба', rooms: '1+1', price: 1, area: 1, sea: 1, imgs: ['c1'] };

test('objects.json is valid', () => assert.deepEqual(validate(objects), []));
test('duplicate numbers are rejected', () => assert.match(validate([ok, ok]).join(), /повторяется/));
test('missing price is rejected', () => assert.match(validate([{ ...ok, price: 0 }]).join(), /price/));
test('every object image exists', () => {
  for (const o of objects) for (const k of o.imgs) assert.ok(fs.existsSync(new URL(`../public/img/${k}.jpg`, import.meta.url)), k);
});
