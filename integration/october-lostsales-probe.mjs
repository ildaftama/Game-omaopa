import fs from 'node:fs';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';
import { fetchLostSalesForMonth } from './waste-recap.mjs';
import { outletLookup } from './performance-summary.mjs';

// Satu kali pakai: rangkuman lost sales HARIAN (agregat seluruh jaringan, bukan per outlet --
// sesuai permintaan owner) untuk Oktober 2026 penuh. Dijalankan lewat GitHub Actions karena
// endpoint gviz Google Sheets tidak terjangkau dari sandbox lokal. Hanya MEMBACA sheet publik
// tim (sama seperti pack-forecast-reference.mjs/waste-recap.mjs yang sudah ada), tidak
// menulis apa pun.
async function listTabNames(sheetId) {
  const res = await fetch(`https://docs.google.com/spreadsheets/d/${sheetId}/export?format=xlsx`, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) return [];
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync('.tmp-sheet.xlsx', buf);
  const { execSync } = await import('node:child_process');
  let xml = '';
  try { xml = execSync('unzip -p .tmp-sheet.xlsx xl/workbook.xml', { encoding: 'utf8' }); } catch (e) { return ['(unzip gagal: ' + e.message + ')']; }
  const names = [...xml.matchAll(/<sheet[^>]*name="([^"]*)"/g)].map(m => m[1]);
  return names;
}
async function run() {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync('forecast/outlet-intelligence-data.js', 'utf8'), ctx);
  const sources = JSON.parse(fs.readFileSync('forecast/data-sources.json', 'utf8'));
  const sheetUrl = sources.sources.find(s => s.key === 'forecast')?.url;
  const sheetId = sheetUrl?.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1];
  if (!sheetId) throw Error('Sumber "forecast" tidak ditemukan.');
  const getId = outletLookup(ctx.window.OUTLET_INTELLIGENCE);
  const result = await fetchLostSalesForMonth(sheetId, 2026, 9, getId); // Oktober = index 9
  if (!result) {
    console.log('Tab Oktober tidak ditemukan lewat nama kandidat biasa. Daftar tab asli di workbook:');
    const names = await listTabNames(sheetId);
    for (const n of names) console.log(' - ' + n);
    process.exitCode = 1;
    return;
  }
  console.log('Tab dipakai: ' + result.tabName);
  const byDate = result.data; // { date: { outletId: minutes } }
  const dates = Object.keys(byDate).sort();
  console.log('\nTanggal | Outlet dengan data | Total menit | Lost sales % (menit / (n*720))');
  let totalMinutesAll = 0, totalPairs = 0;
  for (const date of dates) {
    const entries = Object.entries(byDate[date]);
    const n = entries.length;
    const totalMinutes = entries.reduce((s, [, m]) => s + (m || 0), 0);
    const percent = n > 0 ? totalMinutes / (n * 12 * 60) * 100 : null;
    console.log(`${date} | ${n} | ${totalMinutes} | ${percent != null ? percent.toFixed(2) : '-'}`);
    if (percent != null) { totalMinutesAll += totalMinutes; totalPairs += n; }
  }
  const monthPercent = totalPairs > 0 ? totalMinutesAll / (totalPairs * 12 * 60) * 100 : null;
  console.log('\nRingkasan Oktober 2026: total menit kehabisan = ' + totalMinutesAll + ', rata-rata lost sales % harian (weighted) = ' + (monthPercent != null ? monthPercent.toFixed(2) + '%' : '-'));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch(e => { console.error('GAGAL: ' + e.message); process.exitCode = 1; });
}
