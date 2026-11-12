import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, parseWasteTab, parseLostSalesTab, fetchLostSalesForMonth, pull } from './waste-recap.mjs';

const getId = name => ({ jakal: 'jakal-uii', tajem: 'tajem', 'nusaindah': 'nusa-indah' }[String(name).trim().toLowerCase().replace(/[^a-z0-9]/g, '')] || null);
const csvRow = cells => cells.map(c => /[,"\n]/.test(c) ? '"' + String(c).replace(/"/g, '""') + '"' : c).join(',');

test('parseCsv keeps a quoted cell with an embedded newline as one field', () => {
 const rows = parseCsv('"Outlet","Lost sales (menit)\nTanpa mini cisfon","Next"\n"Jakal","92","x"');
 assert.equal(rows.length, 2);
 assert.equal(rows[0][1], 'Lost sales (menit)\nTanpa mini cisfon');
 assert.equal(rows[1][1], '92');
});

test('parseWasteTab reads core SKU qty and nominal, sums duplicate rows', () => {
 const header = Array(38).fill('').join(',');
 const row1 = ['01 January 2026', 'Jakal', '1', '', '', '', ...Array(30).fill(''), '98600', 'Area 1', ''].join(',');
 const row2 = ['01 January 2026', 'Jakal', '1', '', '', '', ...Array(30).fill(''), '1400', 'Area 1', ''].join(','); // same date/outlet, should sum
 const csv = `${header}\n${row1}\n${row2}`;
 const out = parseWasteTab(csv, getId);
 assert.deepEqual(out['2026-01-01']['jakal-uii'], { core: [2, 0, 0, 0], nominal: 100000 });
});

test('parseWasteTab finds the Nominal column by header after new product columns are inserted', () => {
 // Tata letak sheet sejak tim menambah produk Roti Manis: Nominal di kolom 54, Area 55.
 const header = ['Tanggal', 'Outlet', 'Ochis', 'Ocho', 'Mchis', 'Mcho', ...Array(48).fill(''), 'Nominal ', 'Area '];
 header[36] = 'Roti Manis Coklat Keju h-1';
 const row = ['01 January 2026', 'Tajem', '1', '1', '', '', ...Array(48).fill(''), '40300', 'Area 1'];
 const out = parseWasteTab(csvRow(header) + '\n' + csvRow(row), getId);
 assert.deepEqual(out['2026-01-01'].tajem, { core: [1, 1, 0, 0], nominal: 40300 });
});

test('parseWasteTab skips rows with an unknown outlet name or unparseable date', () => {
 const header = Array(38).fill('').join(',');
 const bad1 = ['31 Februari 2026', 'Jakal', '1', '', '', '', ...Array(30).fill(''), '1000', 'Area 1', ''].join(',');
 const bad2 = ['01 January 2026', 'Outlet Tidak Dikenal', '1', '', '', '', ...Array(30).fill(''), '1000', 'Area 1', ''].join(',');
 const csv = `${header}\n${bad1}\n${bad2}`;
 assert.deepEqual(parseWasteTab(csv, getId), {});
});

test('parseLostSalesTab reads the last column of each 10-column day block', () => {
 const dateRow = csvRow(['`', 'Sunday, 1 November 2026', ...Array(9).fill(''), 'Monday, 2 November 2026', ...Array(9).fill('')]);
 const blank = csvRow(Array(21).fill(''));
 const dataRow = csvRow(['Jakal', ...Array(9).fill(''), '92', ...Array(9).fill(''), '15']);
 const csv = `${dateRow}\n${blank}\n${blank}\n${dataRow}`;
 const out = parseLostSalesTab(csv, getId);
 assert.equal(out['2026-11-01']['jakal-uii'], 92);
 assert.equal(out['2026-11-02']['jakal-uii'], 15);
});

test('fetchLostSalesForMonth rejects a tab whose first date does not match the requested month (gviz silently falls back to the first sheet when a tab name is missing)', async () => {
 const wrongMonthCsv = csvRow(['`', 'Monday, 1 January 2026']) + '\n' + csvRow(['']);
 const rightMonthCsv = [
  csvRow(['`', 'Sunday, 1 November 2026', ...Array(9).fill('')]),
  csvRow(Array(11).fill('')),
  csvRow(Array(11).fill('')),
  csvRow(['Jakal', ...Array(9).fill(''), '92']),
 ].join('\n');
 // Singkatan dicoba dulu; di sini tab "NOV" pura2 tidak ada (gviz jatuh ke sheet pertama ->
 // isi bulan salah), jadi harus ditolak lalu lanjut ke nama penuh.
 const requested = [];
 const originalFetch = global.fetch;
 global.fetch = async url => { const tab = decodeURIComponent(String(url).split('sheet=')[1]); requested.push(tab); return { ok: true, text: async () => (tab === 'Rekap Forecast NOVEMBER' ? rightMonthCsv : wrongMonthCsv) }; };
 try {
  const result = await fetchLostSalesForMonth('sheet-id', 2026, 10, getId); // November = index 10
  assert.deepEqual(requested, ['Rekap Forecast NOV', 'Rekap Forecast NOVEMBER']);
  assert.equal(result.tabName, 'Rekap Forecast NOVEMBER');
  assert.equal(result.data['2026-11-01']['jakal-uii'], 92);
 } finally { global.fetch = originalFetch; }
});

test('pull() drops lost-sales dates after "today" -- the month template pre-fills future days with 0, not real data', async () => {
 const wasteCsv = csvRow(Array(38).fill('')) + '\n' + csvRow(['04 November 2026', 'Jakal', '1', '', '', '', ...Array(30).fill(''), '5000', 'Area 1', '']);
 const dayLabels = ['Sunday, 1 November 2026', 'Monday, 2 November 2026', 'Tuesday, 3 November 2026', 'Wednesday, 4 November 2026', 'Thursday, 5 November 2026', 'Friday, 6 November 2026'];
 const dateRow = csvRow(['`', ...dayLabels.flatMap(d => [d, ...Array(9).fill('')])]);
 const dataRow = csvRow(['Jakal', ...[0, 0, 0, 20, 10, 0].flatMap(v => [...Array(9).fill(''), String(v)])]);
 const novCsv = [dateRow, csvRow(Array(61).fill('')), csvRow(Array(61).fill('')), dataRow].join('\n');
 const profiles = { outlets: { 'jakal-uii': { name: 'Jakal' } } };
 const originalFetch = global.fetch;
 global.fetch = async (url) => ({ ok: true, text: async () => url.includes('WASTE') ? wasteCsv : novCsv });
 try {
  const result = await pull('sheet-id', profiles, { now: new Date('2026-11-05T10:00:00+07:00') });
  assert.deepEqual(result.waste['2026-11-04']['jakal-uii'], { core: [1, 0, 0, 0], nominal: 5000 });
  assert.equal(result.lostSalesMinutes['2026-11-04']['jakal-uii'], 20);
  assert.equal(result.lostSalesMinutes['2026-11-05']['jakal-uii'], 10);
  assert.equal(result.lostSalesMinutes['2026-11-06'], undefined); // tomorrow: dropped, not a fake 0
 } finally { global.fetch = originalFetch; }
});

test('parseLostSalesTab skips "#N/A" / empty cells instead of reading them as 0 minutes', () => {
 const dateRow = csvRow(['`', 'Sunday, 1 November 2026', ...Array(9).fill(''), 'Monday, 2 November 2026', ...Array(9).fill('')]);
 const blank = csvRow(Array(21).fill(''));
 const dataRow = csvRow(['Jakal', ...Array(9).fill(''), '#N/A', ...Array(9).fill(''), '']);
 const out = parseLostSalesTab(`${dateRow}\n${blank}\n${blank}\n${dataRow}`, getId);
 assert.equal(out['2026-11-01'], undefined);
 assert.equal(out['2026-11-02'], undefined);
});

test('pull() keeps previously stored lost sales when the heavy month tab cannot be read this run', async () => {
 const wasteCsv = csvRow(Array(38).fill('')) + '\n' + csvRow(['04 November 2026', 'Jakal', '1', '', '', '', ...Array(30).fill(''), '5000', 'Area 1', '']);
 const profiles = { outlets: { 'jakal-uii': { name: 'Jakal' } } };
 const previous = { lostSalesMinutes: { '2026-11-03': { 'jakal-uii': 45 } } };
 const originalFetch = global.fetch;
 global.fetch = async (url) => { if (String(url).includes('WASTE')) return { ok: true, text: async () => wasteCsv }; throw Error('timeout'); };
 try {
  const result = await pull('sheet-id', profiles, { now: new Date('2026-11-20T10:00:00+07:00'), previous });
  assert.equal(result.lostSalesMinutes['2026-11-03']['jakal-uii'], 45);
  assert.deepEqual(result.lostSalesMonthTabsUsed, []);
 } finally { global.fetch = originalFetch; }
});

test('pull() keeps stored waste and still reads lost sales when the WASTE tab times out', async () => {
 const dateRow = csvRow(['`', 'Sunday, 1 November 2026', ...Array(9).fill('')]);
 const novCsv = [dateRow, csvRow(Array(11).fill('')), csvRow(Array(11).fill('')), csvRow(['Jakal', ...Array(9).fill(''), '92'])].join('\n');
 const profiles = { outlets: { 'jakal-uii': { name: 'Jakal' } } };
 const previous = { waste: { '2026-11-01': { 'jakal-uii': { core: [1, 0, 0, 0], nominal: 4100 } } } };
 const originalFetch = global.fetch;
 global.fetch = async (url) => { if (String(url).includes('WASTE')) throw Error('timeout'); return { ok: true, text: async () => novCsv }; };
 try {
  const result = await pull('sheet-id', profiles, { now: new Date('2026-11-20T10:00:00+07:00'), previous });
  assert.equal(result.waste['2026-11-01']['jakal-uii'].nominal, 4100);
  assert.equal(result.wasteFresh, false);
  assert.equal(result.lostSalesMinutes['2026-11-01']['jakal-uii'], 92);
 } finally { global.fetch = originalFetch; }
});

test('with GOOGLE_SHEETS_API_KEY set, tabs are read through the Sheets API (key in header, not URL) and a missing tab name falls through to the next candidate', async () => {
 const profiles = { outlets: { 'jakal-uii': { name: 'Jakal' } } };
 const wasteValues = [Array(38).fill(''), ['04 November 2026', 'Jakal', '1', '', '', '', ...Array(30).fill(''), 'Rp5,000', 'Area 1']];
 const novValues = [['`', 'Sunday, 1 November 2026'], [], [], ['Jakal', '', '', '', '', '', '', '', '', '', '92']];
 const seen = [];
 const originalFetch = global.fetch, originalKey = process.env.GOOGLE_SHEETS_API_KEY;
 process.env.GOOGLE_SHEETS_API_KEY = 'test-key';
 global.fetch = async (url, opts) => {
  const u = String(url); seen.push(u);
  assert.ok(u.startsWith('https://sheets.googleapis.com/v4/spreadsheets/sheet-id/values/'));
  assert.ok(!u.includes('test-key'));
  assert.equal(opts.headers['X-goog-api-key'], 'test-key');
  const tab = decodeURIComponent(u.split('/values/')[1].split('?')[0]);
  if (tab === "'WASTE'") return { ok: true, json: async () => ({ values: wasteValues }) };
  if (tab === "'Rekap Forecast NOV'") return { ok: true, json: async () => ({ values: novValues }) };
  return { ok: false, status: 400, json: async () => ({}) };
 };
 try {
  const result = await pull('sheet-id', profiles, { now: new Date('2026-11-20T10:00:00+07:00') });
  assert.equal(result.via, 'sheets-api');
  assert.deepEqual(result.waste['2026-11-04']['jakal-uii'], { core: [1, 0, 0, 0], nominal: 5000 });
  assert.equal(result.lostSalesMinutes['2026-11-01']['jakal-uii'], 92);
  assert.deepEqual(result.lostSalesMonthTabsUsed, ['Rekap Forecast NOV']);
 } finally { global.fetch = originalFetch; if (originalKey === undefined) delete process.env.GOOGLE_SHEETS_API_KEY; else process.env.GOOGLE_SHEETS_API_KEY = originalKey; }
});
