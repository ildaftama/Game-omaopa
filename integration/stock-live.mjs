// Stok berjalan per 15 menit (owner 2026-11-26). Dokumen kecil privat yang selalu ditimpa:
// stok jual hari ini dari Daily Report (sisa kemarin - waste + kiriman +/- transfer) dan riwayat
// penjualan kumulatif ESB per tarikan. Web menghitung sisa stok, status, dan lost sales dari sini.
// Terbukti di Daily Report 1-25 Nov: sisa kemarin - waste + kiriman + transfer - terjual = stok akhir
// (4.979 dari 4.981 sel). Sheet hanya dibaca. Repo publik: log tanpa angka outlet.
import { parseFolder, parseStockTab, STOCK_LABELS, TAB_ID } from './daily-stock.mjs';
import { parseCsv } from './waste-recap.mjs';

export const STOCK_LIVE_KEY = 'reference_0000000000000003_0';
// Indeks produk PCS ESB (pcs-sales.mjs PRODUCTS) -> indeks label Daily Report (STOCK_LABELS).
// Mini 3 rasa digabung seperti di Daily Report. Chiffon Kurma tidak dipetakan di penjualan PCS.
export const PCS_TO_STOCK = [0, 1, 2, 3, 6, 6, 6, 7, 8, 9, 11, 12, 13, 14, 15, 17, 16, 18, 4, 5];
const MAX_SNAPS = 70;

export function soldVector(result) {
  const v = STOCK_LABELS.map(() => 0);
  PCS_TO_STOCK.forEach((s, p) => { v[s] += (result.qty?.[p] || 0) + (result.free?.[p] || 0); });
  if (result.layer) { v[19] += result.layer[0] || 0; v[20] += result.layer[1] || 0; }
  return v;
}
const hhmm = iso => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));

// daily: { [outletId]: { [label]: [awal, kirim, tfIn, tfOut, waste, akhir|null] } } atau null bila gagal dibaca.
export function mergeStockLive(previous, { date, asOf, results, daily, dailyAt }) {
  const same = previous?.date === date;
  const snaps = same && Array.isArray(previous.snaps) ? previous.snaps.slice() : [];
  const sold = {};
  for (const r of results || []) if (r.complete) sold[r.id] = soldVector(r);
  if (Object.keys(sold).length) {
    const t = hhmm(asOf), last = snaps.at(-1);
    if (last?.t === t) snaps[snaps.length - 1] = { t, s: { ...last.s, ...sold } }; else snaps.push({ t, s: sold });
  }
  while (snaps.length > MAX_SNAPS) snaps.shift();
  const keepDaily = daily && Object.keys(daily).length ? { ...(same ? previous.daily || {} : {}), ...daily } : (same ? previous.daily || {} : {});
  return {
    schemaVersion: 1, kind: 'stock-live', date, asOf, labels: STOCK_LABELS,
    daily: keepDaily, dailyAt: daily && Object.keys(daily).length ? dailyAt : (same ? previous.dailyAt || null : null),
    expected: (results || []).length, snaps,
  };
}

async function text(url, fetcher) {
  const r = await fetcher(url, { signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw Error('HTTP ' + r.status);
  return r.text();
}
// Hanya sheet bulan berjalan, hanya tanggal hari ini.
export async function pullDailyToday(folderId, { now = new Date(), fetcher = fetch } = {}) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(now), [y, m] = today.split('-').map(Number);
  const files = parseFolder(await text(`https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(folderId)}`, fetcher)).filter(f => f.year === y && f.month === m);
  if (!files.length) throw Error('Sheet Daily Report bulan ini belum ditemukan.');
  const jobs = [];
  for (const f of files) {
    const page = await text(`https://docs.google.com/spreadsheets/d/${f.id}/htmlview`, fetcher);
    for (const [, name, gid] of page.matchAll(/name: "([^"]+)"[^}]*?gid: "(\d+)"/g)) { const id = TAB_ID[name.trim().toUpperCase()]; if (id) jobs.push({ f, id, gid }); }
  }
  const out = {};
  let cursor = 0, ok = 0;
  async function worker() {
    while (cursor < jobs.length) {
      const j = jobs[cursor++];
      try {
        const cells = parseStockTab(parseCsv(await text(`https://docs.google.com/spreadsheets/d/${j.f.id}/export?format=csv&gid=${j.gid}`, fetcher)), j.f.year, j.f.month)[today];
        ok++;
        if (!cells) continue;
        const o = {};
        for (const [k, x] of Object.entries(cells)) { const [avail, kirim, tfIn, tfOut, end, complete, waste] = x; o[k] = [avail - kirim - tfIn + tfOut, kirim, tfIn, tfOut, waste || 0, complete === 1 ? end : null]; }
        out[j.id] = o;
      } catch { /* tab gagal: web memakai angka tarikan sebelumnya */ }
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  if (!ok) throw Error('Tab Daily Report belum terbaca.');
  return { daily: out, tabs: jobs.length, read: ok };
}
