import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { estimateLostSales, outletLookup } from './performance-summary.mjs';

// Tarik otomatis harian dari sheet "REKAP HARIAN FORECAST 2026" (key "forecast" di
// forecast/data-sources.json) -- dua tab: "WASTE" (format panjang, satu baris per
// outlet+tanggal, sudah ada kolom Nominal -- tidak perlu ganti nama tab tiap bulan) dan
// "Rekap Forecast <BULAN>" (format lebar, satu blok 10 kolom per tanggal, kolom terakhir
// tiap blok = menit kehabisan/lost sales -- dipakai performance-summary.mjs versi manual
// sebelumnya). Dibaca lewat Google Sheets API kalau GOOGLE_SHEETS_API_KEY ada (lihat
// fetchSheetRows), selain itu lewat endpoint ekspor gviz publik (sama seperti XLSX publik yang
// sudah dipakai pcs_orders.py untuk sheet PESANAN) -- tanpa kredensial.
//
// PERINGATAN: kalau nama tab tidak ditemukan, Google gviz TIDAK mengembalikan error --
// ia diam-diam jatuh ke sheet PERTAMA di workbook (konten sama sekali berbeda). Jadi nama
// bulan kandidat WAJIB divalidasi lewat isi header tanggalnya sebelum dipakai, bukan cuma
// dicek HTTP 200.

const MONTHS_EN = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTH_ID = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const MONTH_ABBR = ['JAN','FEB','MAR','APR','MEI','JUN','JUL','AGT','SEP','OKT','NOV','DES'];

// Tab "Rekap Forecast <bulan>" sangat berat (301 kolom penuh rumus) -- diukur 2026-11-09,
// ekspor gviz-nya butuh ±250 detik. Batas lama 30 detik membuat tab ini SELALU gagal diam-diam,
// jadi lost sales harian tidak pernah masuk sejak Oktober (cuma tab WASTE yang ringan yang
// berhasil). Tab bulanan diberi waktu jauh lebih longgar; tab WASTE tetap 30 detik.
const MONTH_TAB_TIMEOUT_MS = 360000, RECAP_BUDGET_MS = 480000, WASTE_TAB_TIMEOUT_MS = 120000, SHEETS_API_TIMEOUT_MS = 60000;
// JALUR UTAMA (arahan owner 2026-11-09): Google Sheets API v4 (values.get) dengan API key di
// secret GOOGLE_SHEETS_API_KEY. API ini membaca nilai yang SUDAH dihitung Google -- tidak
// memaksa workbook dirender ulang seperti ekspor gviz. Itu penting karena tab "Rekap Forecast
// <bulan>" berisi ±3.000 sel rumus LET+IMPORTRANGE: ekspor gviz-nya sampai 4 menit atau error
// 500, dan ikut melambatkan tab WASTE yang ringan, sehingga lost sales tidak pernah masuk.
// FORMATTED_VALUE dipakai supaya isinya sama persis dengan ekspor CSV (tanggal "01 January
// 2026", angka berformat) -- parser di bawah tidak perlu tahu sumbernya. Key dikirim lewat
// header X-goog-api-key, bukan query string. Tanpa key -> jatuh ke ekspor gviz lama.
// Beda perilaku yang penting: Sheets API MENOLAK nama tab yang tidak ada (error), sedangkan
// gviz diam-diam mengembalikan sheet pertama -- validasi bulan di bawah tetap dipakai untuk
// keduanya.
async function fetchSheetRows(sheetId, tabName, timeoutMs = 30000) {
 const key = process.env.GOOGLE_SHEETS_API_KEY;
 if (key) {
  const range = encodeURIComponent(`'${tabName.replace(/'/g, "''")}'`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?valueRenderOption=FORMATTED_VALUE&majorDimension=ROWS`;
  const res = await fetch(url, { headers: { 'X-goog-api-key': key }, signal: AbortSignal.timeout(Math.min(timeoutMs, SHEETS_API_TIMEOUT_MS)) });
  if (!res.ok) throw Error(`Tab sheet "${tabName}" tidak terbaca lewat Sheets API (HTTP ${res.status}).`);
  const body = await res.json();
  return (body.values || []).map(r => r.map(v => v == null ? '' : String(v)));
 }
 const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}`;
 const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
 if (!res.ok) throw Error(`Tab sheet "${tabName}" tidak terbaca (HTTP ${res.status}).`);
 return parseCsv(await res.text());
}
const toRows = input => typeof input === 'string' ? parseCsv(input) : input;

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

// Sel kosong / "#N/A" (rumus tanggal yang belum diisi tim) harus jadi null, BUKAN 0 --
// Number('') === 0, jadi tanpa cek ini "#N/A" diam-diam terbaca "0 menit kehabisan".
const num = v => { const s = String(v ?? '').replace(/[^0-9.-]/g, ''); if (!s || s === '-' || s === '.') return null; const n = Number(s); return Number.isFinite(n) ? n : null; };

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
export function parseWasteTab(input, getId) {
 const rows = toRows(input);
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
export function parseLostSalesTab(input, getId) {
 const rows = toRows(input);
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

// Nama tab bulanan tim TIDAK konsisten ("Rekap Forecast AGUSTUS" vs "...SEPT" vs "...OKT" vs
// "...NOV"). Singkatan dicoba DULU (pola tim sejak September) -- nama yang salah tidak error,
// gviz diam-diam mengembalikan sheet PERTAMA, dan tiap percobaan tab bulanan bisa makan
// beberapa menit, jadi urutan ini penting. Header tanggal blok pertama WAJIB divalidasi
// benar-benar bulan+tahun yang diminta (lihat peringatan gviz-fallback di atas).
export async function fetchLostSalesForMonth(sheetId, year, monthIndex0, getId, deadline = Infinity) {
 const candidates = [...new Set([`Rekap Forecast ${MONTH_ABBR[monthIndex0]}`, ...(monthIndex0 === 8 ? ['Rekap Forecast SEPT'] : []), `Rekap Forecast ${MONTH_ID[monthIndex0].toUpperCase()}`])];
 for (const tabName of candidates) {
  const left = deadline - Date.now(); if (left < 20000) break;
  let rows; try { rows = await fetchSheetRows(sheetId, tabName, Math.min(MONTH_TAB_TIMEOUT_MS, left)); } catch { continue; }
  if (!rows.length) continue;
  const firstDate = parseDateHeaderCell(rows[0][1]);
  if (firstDate !== `${year}-${String(monthIndex0 + 1).padStart(2, '0')}-01`) continue;
  return { tabName, data: parseLostSalesTab(rows, getId) };
 }
 return null;
}

export async function pull(sheetId, profiles, { now = new Date(), previous = null } = {}) {
 const getId = outletLookup(profiles);
 // Tab WASTE biasanya cepat, tapi workbook ini kadang lambat sekali (rumus IMPORTRANGE ribuan
 // sel di tab Rekap bulanan). Kalau WASTE gagal/timeout, pakai data waste yang sudah tersimpan
 // dan TETAP lanjut menarik lost sales -- dulu satu kegagalan di sini menggugurkan semuanya.
 let waste = { ...(previous?.waste || {}) }, wasteFresh = false;
 try { Object.assign(waste, parseWasteTab(await fetchSheetRows(sheetId, 'WASTE', WASTE_TAB_TIMEOUT_MS), getId)); wasteFresh = true; }
 catch (e) { console.log('Tab WASTE belum terbaca (' + e.message + '); pakai waste tersimpan.'); }
 const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(now);
 const [year, month] = today.slice(0, 7).split('-').map(Number);
 // Bulan lalu cuma ditarik ulang di awal bulan (jendela 7 hari dashboard masih menyentuhnya)
 // -- selebihnya sudah tersimpan dari tarikan sebelumnya (lihat merge `previous` di bawah),
 // tidak perlu membebani tiap run dengan tab berat kedua.
 const day = Number(today.slice(8, 10));
 const months = [[year, month - 1]];
 if (day <= 8) { if (month === 1) months.push([year - 1, 11]); else months.push([year, month - 2]); }
 // Mulai dari lost sales yang sudah tersimpan di bundle (kalau ada), lalu ditimpa tanggal yang
 // berhasil ditarik ulang -- tab bulanan yang kebetulan gagal/timeout di satu run tidak lagi
 // menghapus data lost sales yang sudah ada.
 // Anggaran waktu total untuk tab bulanan -- jangan sampai tab yang lambat membuat seluruh job
 // sinkronisasi (yang juga membawa omzet ESB tiap jam) kena batas waktu workflow dan gagal total.
 const deadline = Date.now() + RECAP_BUDGET_MS;
 const lostSales = { ...(previous?.lostSalesMinutes || {}) }; const monthsUsed = [];
 for (const [y, mi] of months) {
  const result = await fetchLostSalesForMonth(sheetId, y, mi, getId, deadline).catch(() => null);
  if (result) { Object.assign(lostSales, result.data); monthsUsed.push(result.tabName); }
 }
 // Template bulan berjalan sudah berisi 0 untuk tanggal yang BELUM terjadi (bukan data real
 // "tidak ada lost sales") -- buang tanggal setelah hari ini supaya tidak jadi angka palsu.
 for (const date of Object.keys(lostSales)) if (date > today) delete lostSales[date];
 if (!wasteFresh && !monthsUsed.length && previous) throw Error('Sheet rekap tidak terbaca sama sekali di run ini.');
 return {
  schemaVersion: 1,
  updatedAt: new Date().toISOString(),
  wasteFresh,
  source: 'REKAP HARIAN FORECAST 2026 (tab WASTE + Rekap Forecast <bulan>)',
  via: process.env.GOOGLE_SHEETS_API_KEY ? 'sheets-api' : 'gviz',
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
