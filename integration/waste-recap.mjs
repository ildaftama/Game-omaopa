import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { estimateLostSales, outletLookup } from './performance-summary.mjs';

// Tarik otomatis harian dari sheet "REKAP HARIAN FORECAST 2026" (key "forecast" di
// forecast/data-sources.json) -- dua tab: "WASTE" (format panjang, satu baris per
// outlet+tanggal, sudah ada kolom Nominal -- tidak perlu ganti nama tab tiap bulan) dan
// "Rekap Forecast <BULAN>" (format lebar, satu blok 10 kolom per tanggal, kolom terakhir
// tiap blok = menit kehabisan/lost sales -- dipakai performance-summary.mjs versi manual
// sebelumnya). Dibaca lewat endpoint ekspor gviz publik (sama seperti XLSX publik yang
// sudah dipakai pcs_orders.py untuk sheet PESANAN) -- tanpa kredensial.
//
// PERINGATAN: kalau nama tab tidak ditemukan, Google gviz TIDAK mengembalikan error --
// ia diam-diam jatuh ke sheet PERTAMA di workbook (konten sama sekali berbeda). Jadi nama
// bulan kandidat WAJIB divalidasi lewat isi header tanggalnya sebelum dipakai, bukan cuma
// dicek HTTP 200.

const MONTHS_EN = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTH_ID = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const MONTH_ABBR = ['JAN','FEB','MAR','APR','MEI','JUN','JUL','AGT','SEP','OKT','NOV','DES'];

async function fetchSheetCsv(sheetId, tabName) {
 const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}`;
 const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
 if (!res.ok) throw Error(`Tab sheet "${tabName}" tidak terbaca (HTTP ${res.status}).`);
 return res.text();
}

// Parser CSV yang menangani sel bertanda kutip berisi baris baru (header "Lost sales
// (menit)\nTanpa mini cisfon" di sheet ini) -- split('\n') polos akan memotongnya salah.
export function parseCsv(text) {
 const rows = []; let row = [], cur = '', inQ = false;
 for (let i = 0; i < text.length; i++) {
  const c = text[i];
  if (inQ) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else inQ = false; } else cur += c; }
  else if (c === '"') inQ = true;
  else if (c === ',') { row.push(cur); cur = ''; }
  else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; rows.push(row); row = []; }
  else cur += c;
 }
 if (cur.length || row.length) { row.push(cur); rows.push(row); }
 return rows.filter(r => !(r.length === 1 && r[0] === ''));
}

const num = v => { const n = Number(String(v ?? '').replace(/[^0-9.-]/g, '')); return Number.isFinite(n) ? n : null; };

// "01 January 2026" -> "2026-01-01"
function parseIsoDate(label) {
 const m = String(label).trim().match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
 if (!m) return null;
 const mi = MONTHS_EN.findIndex(x => x.toLowerCase() === m[2].toLowerCase());
 if (mi < 0) return null;
 return `${m[3]}-${String(mi + 1).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
}
// "Sunday, 1 November 2026" -> "2026-11-01"
function parseDateHeaderCell(label) {
 const m = String(label).trim().match(/,\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
 if (!m) return null;
 const mi = MONTHS_EN.findIndex(x => x.toLowerCase() === m[2].toLowerCase());
 if (mi < 0) return null;
 return `${m[3]}-${String(mi + 1).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
}

// Format panjang: Tanggal, Outlet, Ochis, Ocho, Mchis, Mcho, ...(produk lain h-1/h-2/h-3),
// Nominal (kolom 36), Area (37). Dijumlah per outlet+tanggal (jaga-jaga ada baris duplikat).
export function parseWasteTab(csvText, getId) {
 const rows = parseCsv(csvText);
 const byDate = {};
 for (let i = 1; i < rows.length; i++) {
  const r = rows[i]; if (!r[0] || !r[1]) continue;
  const date = parseIsoDate(r[0]), id = getId(r[1]);
  if (!date || !id) continue;
  const core = [0, 1, 2, 3].map(k => num(r[2 + k]) || 0);
  const nominal = num(r[36]) || 0;
  const day = byDate[date] || (byDate[date] = {});
  const entry = day[id] || (day[id] = { core: [0, 0, 0, 0], nominal: 0 });
  entry.core = entry.core.map((v, k) => v + core[k]); entry.nominal += nominal;
 }
 return byDate;
}

// Format lebar: baris tanggal (kolom 1, 11, 21, ... = awal blok 10 kolom per tanggal),
// data outlet mulai baris ke-4 (indeks 3). Kolom terakhir tiap blok (offset+9) = menit
// kehabisan -- posisi ini sudah dipakai & terverifikasi oleh performance-summary.mjs versi
// manual sebelumnya (stockRow[10+d*10]).
export function parseLostSalesTab(csvText, getId) {
 const rows = parseCsv(csvText);
 if (!rows.length) return {};
 const dateRow = rows[0], blocks = [];
 for (let c = 1; c < dateRow.length; c += 10) blocks.push({ col: c, date: parseDateHeaderCell(dateRow[c]) });
 const byDate = {};
 for (let i = 3; i < rows.length; i++) {
  const r = rows[i]; if (!r[0]) continue;
  const id = getId(r[0]); if (!id) continue;
  for (const { col, date } of blocks) {
   if (!date) continue;
   const minutes = num(r[col + 9]); if (minutes == null) continue;
   (byDate[date] || (byDate[date] = {}))[id] = minutes;
  }
 }
 return byDate;
}

// Nama tab bulanan tim TIDAK konsisten (lihat "Rekap Forecast AGUSTUS" vs "...OKT" vs
// "...NOV" -- kadang nama penuh, kadang singkatan). Coba nama penuh dulu lalu singkatan,
// dan WAJIB validasi header tanggal blok pertama benar-benar bulan+tahun yang diminta
// (lihat peringatan gviz-fallback di atas) sebelum dipakai.
export async function fetchLostSalesForMonth(sheetId, year, monthIndex0, getId) {
 const candidates = [...new Set([`Rekap Forecast ${MONTH_ID[monthIndex0].toUpperCase()}`, `Rekap Forecast ${MONTH_ABBR[monthIndex0]}`])];
 for (const tabName of candidates) {
  let text; try { text = await fetchSheetCsv(sheetId, tabName); } catch { continue; }
  const rows = parseCsv(text); if (!rows.length) continue;
  const firstDate = parseDateHeaderCell(rows[0][1]);
  if (firstDate !== `${year}-${String(monthIndex0 + 1).padStart(2, '0')}-01`) continue;
  return { tabName, data: parseLostSalesTab(text, getId) };
 }
 return null;
}

export async function pull(sheetId, profiles, { now = new Date() } = {}) {
 const getId = outletLookup(profiles);
 const wasteCsv = await fetchSheetCsv(sheetId, 'WASTE');
 const waste = parseWasteTab(wasteCsv, getId);
 const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(now);
 const [year, month] = today.slice(0, 7).split('-').map(Number);
 const months = [[year, month - 1]]; if (month === 1) months.push([year - 1, 11]); else months.push([year, month - 2]);
 const lostSales = {}; const monthsUsed = [];
 for (const [y, mi] of months) {
  const result = await fetchLostSalesForMonth(sheetId, y, mi, getId).catch(() => null);
  if (result) { Object.assign(lostSales, result.data); monthsUsed.push(result.tabName); }
 }
 // Template bulan berjalan sudah berisi 0 untuk tanggal yang BELUM terjadi (bukan data real
 // "tidak ada lost sales") -- buang tanggal setelah hari ini supaya tidak jadi angka palsu.
 for (const date of Object.keys(lostSales)) if (date > today) delete lostSales[date];
 return {
  schemaVersion: 1,
  updatedAt: new Date().toISOString(),
  source: 'REKAP HARIAN FORECAST 2026 (tab WASTE + Rekap Forecast <bulan>)',
  lossMethod: 'Menit kehabisan dari sheet / hari / 12 jam buka -- asumsi penjualan merata.',
  lostSalesMonthTabsUsed: monthsUsed,
  waste,
  lostSalesMinutes: lostSales,
 };
}

async function main() {
 const vm = await import('node:vm');
 const ctx = { window: {} };
 vm.default.runInNewContext(fs.readFileSync(new URL('../forecast/outlet-intelligence-data.js', import.meta.url), 'utf8'), ctx);
 const sources = JSON.parse(fs.readFileSync('forecast/data-sources.json', 'utf8'));
 const sheetUrl = sources.sources.find(s => s.key === 'forecast')?.url;
 const sheetId = sheetUrl?.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1];
 if (!sheetId) throw Error('Sumber "forecast" (Rekap Harian Forecast) belum terdaftar di data-sources.json.');
 const result = await pull(sheetId, ctx.window.OUTLET_INTELLIGENCE);
 fs.mkdirSync('.pcs-temp', { recursive: true });
 fs.writeFileSync('.pcs-temp/daily-recap.json', JSON.stringify(result));
 console.log(JSON.stringify({ wasteDays: Object.keys(result.waste).length, lostSalesDays: Object.keys(result.lostSalesMinutes).length, monthTabsUsed: result.lostSalesMonthTabsUsed }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
 main().catch(e => { console.error(e.message); console.error('Penarikan rekap harian (waste/lost sales) belum berhasil.'); process.exitCode = 1; });
}
