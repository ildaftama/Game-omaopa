// Stok harian per outlet dari sheet Daily Report: stok awal, kiriman, transfer, stok akhir.
// Sheet hanya dibaca. ID folder ada di dokumen privat, dan log tidak boleh berisi angka outlet.
import { parseCsv } from './waste-recap.mjs';

export const STOCK_LABELS = ['Ogura Cheese', 'Ogura Choco', 'Malmil Cheese', 'Malmil Choco', 'Malmil Cheese Less Sugar', 'Malmil Choco Less Sugar', 'Mini Ogura', 'Chiffon Keju', 'Chiffon Ekstra Keju', 'Chiffon Butter', 'Chiffon Kurma', 'Chiffon Lite Ekstra Keju', 'Chiffon Lite Keju', 'Roti Sosis', 'Roti Abon', 'Roti Coklat', 'Roti Coklat Keju', 'Roti Coklat Pisang', 'Roti Vanilla', 'Sweet Layer 150 ml', 'Sweet Layer 300 ml'];
export const TAB_ID = { JAKAL: 'jakal-uii', TAJEM: 'tajem', 'NUSA INDAH': 'nusa-indah', UMY: 'umy', GODEAN: 'godean', MERBABU: 'merbabu', RAJAWALI: 'rajawali', MAGELANG: 'pemuda-magelang', MUNTILAN: 'muntilann', TEMANGGUNG: 'temanggung', NGALIYAN: 'ngaliyan', SAMPANGAN: 'sampangan', UNNES: 'unnes', AMBARAWA: 'ambarawa', UKSW: 'uksw', UNDIP: 'undip', UNIMUS: 'unimus', GAJAH: 'gajah-raya', UDINUS: 'udinus', SRAGEN: 'sragen', KARANGANYAR: 'karanganyar', JEBRES: 'uns', NUSUKAN: 'nusukan', BOYOLALI: 'boyolali', SUKOHARJO: 'sukoharjo', LAWEYAN: 'laweyan', 'MAKAM HAJI': 'makamhaji', UMS: 'ums' };
const MONTHS = ['JANUARI', 'FEBRUARI', 'MARET', 'APRIL', 'MEI', 'JUNI', 'JULI', 'AGUSTUS', 'SEPTEMBER', 'OKTOBER', 'NOVEMBER', 'DESEMBER'];
const KEEP_DAYS = 75;

export function stockLabel(item) {
  const s = String(item).toLowerCase().replace(/\s+/g, ' ').trim();
  const rules = [[/^ogura cheese/, 0], [/^ogura choc/, 1], [/^malmil cheese less/, 4], [/^malmil choc\w* less/, 5], [/^malmil cheese/, 2], [/^malmil choc/, 3], [/^mini ogura - /, 6], [/^cisfon lite - ekstra/, 11], [/^cisfon lite - keju/, 12], [/^cisfon - ekstra/, 8], [/^cisfon - keju/, 7], [/^cisfon - butter/, 9], [/^cisfon - kurma/, 10], [/^roti manis sosis/, 13], [/^roti manis abon/, 14], [/^roti manis coklat meses/, 15], [/^roti manis coklat keju/, 16], [/^roti manis (coklat pisang|pisang coklat)/, 17], [/^roti manis vanilla/, 18], [/^(ogura|sweet) layer\b.*150/, 19], [/^(ogura|sweet) layer\b.*300/, 20]];
  const hit = rules.find(([re]) => re.test(s));
  return hit ? hit[1] : null;
}
const isAged = s => /\d\s*hari\s*y/i.test(String(s));
function qty(v) {
  let s = String(v ?? '').trim().replace(/\s/g, '');
  if (!s || s.startsWith('#') || s.includes('%')) return null;
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
// Satu hari = 16 kolom: 0 awal, 1-3 tambah, 4-6 transfer, 10 stok akhir.
export function parseStockTab(rows, year, month) {
  const head = rows[0] || [], cols = new Map();
  head.forEach((c, i) => { const d = String(c).trim(); if (/^\d{1,2}$/.test(d) && Number(d) >= 1 && Number(d) <= 31 && !cols.has(Number(d))) cols.set(Number(d), i); });
  const out = {};
  for (const [day, c] of cols) {
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, cells = {};
    let label = null;
    for (const row of rows.slice(2)) {
      const name = row[1];
      if (!String(name || '').trim()) continue;
      if (!isAged(name)) label = stockLabel(name);
      if (label == null || c + 10 >= row.length) continue;
      const awal = Math.max(qty(row[c]) || 0, 0), kirim = [1, 2, 3].reduce((s, k) => s + Math.max(qty(row[c + k]) || 0, 0), 0);
      let tfIn = 0, tfOut = 0;
      for (const k of [4, 5, 6]) { const v = qty(row[c + k]) || 0; if (v > 0) tfIn += v; else tfOut -= v; }
      const avail = awal + kirim + tfIn - tfOut, end = qty(row[c + 10]);
      if (avail <= 0 && !(end > 0)) continue;
      const x = cells[label] || (cells[label] = [0, 0, 0, 0, 0, 1, 0]);
      x[0] += avail; x[1] += kirim; x[2] += tfIn; x[3] += tfOut; x[4] += Math.max(end || 0, 0); x[6] += Math.max(qty(row[c + 7]) || 0, 0);
      if (end == null) x[5] = 0;
    }
    if (Object.keys(cells).length) out[date] = cells;
  }
  return out;
}
export function parseFolder(html) {
  return [...String(html).matchAll(/id="entry-([\w-]+)"[\s\S]*?flip-entry-title">([^<]+)</g)].map(m => {
    const t = m[2].trim().match(/^(\S+)\s+(\d{4})\s+(.+?)\s+DAILY REPORT/i), mi = t ? MONTHS.indexOf(t[1].toUpperCase()) : -1;
    return mi >= 0 ? { id: m[1], year: Number(t[2]), month: mi + 1, area: t[3].toUpperCase() } : null;
  }).filter(Boolean);
}
async function text(url, fetcher) {
  const r = await fetcher(url, { signal: AbortSignal.timeout(45000) });
  if (!r.ok) throw Error('HTTP ' + r.status);
  return r.text();
}
export async function pullDailyStock(folderId, previous, { now = new Date(), fetcher = fetch } = {}) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(now), [y, m, d] = today.split('-').map(Number);
  const prior = m === 1 ? [y - 1, 12] : [y, m - 1], priorKey = `${prior[0]}-${String(prior[1]).padStart(2, '0')}`;
  const hasPrior = Object.entries(previous?.days || {}).some(([x, day]) => x.startsWith(priorKey) && Object.values(day).some(cells => Object.values(cells).some(v => v.length >= 7)));
  const wanted = new Set([`${y}-${m}`, ...(d <= 3 || !hasPrior ? [`${prior[0]}-${prior[1]}`] : [])]);
  const files = parseFolder(await text(`https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(folderId)}`, fetcher)).filter(f => wanted.has(`${f.year}-${f.month}`));
  if (!files.length) throw Error('Sheet Daily Report belum ditemukan.');
  const jobs = [];
  for (const f of files) {
    const page = await text(`https://docs.google.com/spreadsheets/d/${f.id}/htmlview`, fetcher);
    for (const [, name, gid] of page.matchAll(/name: "([^"]+)"[^}]*?gid: "(\d+)"/g)) if (TAB_ID[name.trim().toUpperCase()]) jobs.push({ f, id: TAB_ID[name.trim().toUpperCase()], gid });
  }
  const days = { ...(previous?.days || {}) };
  let cursor = 0, ok = 0;
  async function worker() {
    while (cursor < jobs.length) {
      const j = jobs[cursor++];
      try {
        const parsed = parseStockTab(parseCsv(await text(`https://docs.google.com/spreadsheets/d/${j.f.id}/export?format=csv&gid=${j.gid}`, fetcher)), j.f.year, j.f.month);
        for (const [date, cells] of Object.entries(parsed)) if (date <= today) { days[date] = { ...(days[date] || {}), [j.id]: cells }; }
        ok++;
      } catch { /* tab yang gagal memakai data tersimpan */ }
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  if (!ok) throw Error('Tab Daily Report belum terbaca.');
  const floor = new Date(Date.parse(today + 'T00:00:00Z') - KEEP_DAYS * 86400000).toISOString().slice(0, 10);
  for (const date of Object.keys(days)) if (date < floor) delete days[date];
  console.log(`Daily Report terbaca: ${ok}/${jobs.length} tab.`);
  return { schemaVersion: 1, updatedAt: now.toISOString(), labels: STOCK_LABELS, days };
}
