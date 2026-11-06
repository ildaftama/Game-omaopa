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
async function run() {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync('forecast/outlet-intelligence-data.js', 'utf8'), ctx);
  const sources = JSON.parse(fs.readFileSync('forecast/data-sources.json', 'utf8'));
  const sheetUrl = sources.sources.find(s => s.key === 'forecast')?.url;
  const sheetId = sheetUrl?.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1];
  if (!sheetId) throw Error('Sumber "forecast" tidak ditemukan.');
  const getId = outletLookup(ctx.window.OUTLET_INTELLIGENCE);
  const result = await fetchLostSalesForMonth(sheetId, 2026, 9, getId); // Oktober = index 9
  if (!result) { console.log('Tab Oktober tidak ditemukan.'); process.exitCode = 1; return; }
  console.log('Tab dipakai: ' + result.tabName);
  const byDate = result.data; // { date: { outletId: minutes } }
  const dates = Object.keys(byDate).sort();
  console.log('\nTanggal | Outlet dengan data | Total menit | Rata-rata menit/outlet | Lost sales % (menit / (n*720))');
  let sumPercentWeighted = 0, totalPairs = 0, totalMinutesAll = 0;
  for (const date of dates) {
    const entries = Object.entries(byDate[date]);
    const n = entries.length;
    const totalMinutes = entries.reduce((s, [, m]) => s + (m || 0), 0);
    const percent = n > 0 ? totalMinutes / (n * 12 * 60) * 100 : null;
    console.log(`${date} | ${n} | ${totalMinutes} | ${n ? (totalMinutes / n).toFixed(1) : '-'} | ${percent != null ? percent.toFixed(2) : '-'}`);
    if (percent != null) { sumPercentWeighted += totalMinutes; totalPairs += n; totalMinutesAll += totalMinutes; }
  }
  const monthPercent = totalPairs > 0 ? sumPercentWeighted / (totalPairs * 12 * 60) * 100 : null;
  console.log('\nRingkasan Oktober 2026 (seluruh jaringan): total menit kehabisan = ' + totalMinutesAll + ', rata-rata lost sales % harian (weighted) = ' + (monthPercent != null ? monthPercent.toFixed(2) + '%' : '-'));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch(e => { console.error('GAGAL: ' + e.message); process.exitCode = 1; });
}
