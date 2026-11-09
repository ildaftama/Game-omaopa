import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeSources } from './pcs-source.mjs';

const original = { schemaVersion: 1, sources: [
 { key: 'orders', url: 'https://docs.google.com/spreadsheets/d/AAA/edit', tab: 'PESANAN', startRow: 5577 },
 { key: 'forecast', url: 'https://docs.google.com/spreadsheets/d/BBB/edit' },
 { key: 'swot', url: 'https://docs.google.com/spreadsheets/d/CCC/edit' },
] };

test('mergeSources applies every valid web-configured source, not just orders', () => {
 const config = { schemaVersion: 1, sources: [
  { key: 'orders', url: 'https://docs.google.com/spreadsheets/d/NEW1/edit', tab: 'PESANAN 2027', startRow: 10 },
  { key: 'forecast', url: 'https://docs.google.com/spreadsheets/d/NEW2/edit', wasteTab: 'WASTE BARU', lostTabPrefix: 'Rekap' },
 ] };
 const { merged, changed } = mergeSources(original, config);
 assert.equal(merged.sources[0].url, 'https://docs.google.com/spreadsheets/d/NEW1/edit');
 assert.equal(merged.sources[0].tab, 'PESANAN 2027');
 assert.equal(merged.sources[0].startRow, 10);
 assert.equal(merged.sources[1].wasteTab, 'WASTE BARU');
 assert.equal(merged.sources[1].lostTabPrefix, 'Rekap');
 assert.equal(merged.sources[2].url, original.sources[2].url);
 assert.deepEqual(changed, ['orders', 'forecast']);
});

test('mergeSources keeps the repository default for a non-orders source with an invalid link', () => {
 const config = { schemaVersion: 1, sources: [
  { key: 'orders', url: 'https://docs.google.com/spreadsheets/d/AAA/edit' },
  { key: 'forecast', url: 'https://example.com/not-a-sheet' },
 ] };
 assert.equal(mergeSources(original, config).merged.sources[1].url, original.sources[1].url);
});

test('mergeSources refuses an invalid orders link instead of silently using an old one', () => {
 assert.throws(() => mergeSources(original, { schemaVersion: 1, sources: [{ key: 'orders', url: 'bad' }] }));
});
