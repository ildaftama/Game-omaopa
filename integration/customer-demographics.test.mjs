import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapHomeOutlet, normalizeGender, aggregate } from './customer-demographics.mjs';

test('mapHomeOutlet matches known aliases case-insensitively, rejects unknown text', () => {
  assert.equal(mapHomeOutlet('Undip Semarang'), 'undip');
  assert.equal(mapHomeOutlet('undip semarang'), 'undip');
  assert.equal(mapHomeOutlet('Great Elephant of Semarang'), 'gajah-raya');
  assert.equal(mapHomeOutlet('Giwangan'), null);
  assert.equal(mapHomeOutlet(''), null);
  assert.equal(mapHomeOutlet(undefined), null);
});

test('normalizeGender collapses Indonesian/English variants, rejects junk', () => {
  assert.equal(normalizeGender('Laki-laki'), 'L');
  assert.equal(normalizeGender('Man'), 'L');
  assert.equal(normalizeGender('Perempuan'), 'P');
  assert.equal(normalizeGender('Woman'), 'P');
  assert.equal(normalizeGender('Wanita'), 'P');
  assert.equal(normalizeGender('???'), null);
});

function doc(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields)) out[k] = { stringValue: v };
  return { fields: out };
}

test('aggregate buckets mapped outlets separately from unmapped "other", never emits raw PII fields', () => {
  const docs = [
    doc({ homeOutlet: 'Undip Semarang', age: '18-24', gender: 'Perempuan', name: 'Rahasia', phone: '0800' }),
    doc({ homeOutlet: 'undip semarang', age: '25-34', gender: 'Man' }),
    doc({ homeOutlet: 'Giwangan', age: '35-44', gender: 'Wanita' }),
    doc({}),
  ];
  const r = aggregate(docs);
  assert.equal(r.totalMembers, 4);
  assert.equal(r.perOutlet.undip.total, 2);
  assert.equal(r.perOutlet.undip.byAge['18-24'], 1);
  assert.equal(r.perOutlet.undip.byGender.L, 1);
  assert.equal(r.perOutlet.undip.byGender.P, 1);
  assert.equal(r.other.total, 2);
  assert.equal(r.unknownHomeOutlet, 1);
  assert.deepEqual(Object.keys(JSON.stringify(r)).includes('Rahasia'), false);
  assert.ok(!JSON.stringify(r).includes('Rahasia'));
  assert.ok(!JSON.stringify(r).includes('0800'));
});
