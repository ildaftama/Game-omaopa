// Riwayat lost sales harian per outlet x produk (owner 2026-11-27).
// Dihitung dari stok berjalan (Daily Report + penjualan ESB per 15 menit) dan catatan transfer web, dengan
// model yang sama seperti tab Stok & Transfer (versi LOST MURNI, tanpa transfer): pola jual per jam outlet itu sendiri, permintaan dari penjualan
// sebelum habis dicampur rata-rata 28 hari, lost = permintaan pada jam-jam stok kosong sampai tutup 20.00.
// Kalibrasi 1-26 Nov (uji balik 11.813 kasus, semua hari): bobot acuan 1,0 dan hari habis x1,15 -> bias -2%.
// Repo publik: log hanya berisi jumlah, tidak ada angka per outlet.
export const LOST_DAILY_KEY = 'reference_0000000000000005_0';
export const HOUR_PROFILE_KEY = 'reference_0000000000000004_0';
export const MODEL = { open: 8, close: 20, priorWeight: 1, soldOutLift: 1.15, keepDays: 150 };
const MALMIL = new Set([2, 3, 4, 5]), NO_SALES = new Set([10]);
const toH = t => { const [a, b] = String(t).split(':').map(Number); return a + (b || 0) / 60; };
export const weekend = d => { const w = new Date(d + 'T00:00:00Z').getUTCDay(); return w === 0 || w === 6; };
const shift = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);

// Bagian penjualan per jam 08-19 (dinormalkan; dokumen bisa berisi per-mil atau pecahan).
export function shares(profile, id, lab, date) {
  const a = profile?.outlets?.[id]?.[lab]?.[weekend(date) ? 1 : 0];
  if (!Array.isArray(a) || a.length !== MODEL.close - MODEL.open) return null;
  const s = a.reduce((x, y) => x + y, 0);
  return s > 0 ? a.map(x => x / s) : null;
}
export function cum(p, h) {
  const { open, close } = MODEL;
  if (h <= open) return 0; if (h >= close) return 1;
  const i = Math.floor(h - open); let s = 0;
  for (let k = 0; k < i; k++) s += p[k];
  return Math.min(1, s + p[i] * (h - open - i));
}
// Sel riwayat: [terjual, lost, jam habis x100 (0 = tidak habis), habis 1/0].
export function prior(doc, id, lab, date) {
  const same = [], all = [];
  for (let k = 1; k <= 28; k++) {
    const d = shift(date, -k), c = doc?.days?.[d]?.[id]?.[lab];
    if (!c) continue;
    const v = c[3] ? c[0] * MODEL.soldOutLift : c[0];
    all.push(v); if (weekend(d) === weekend(date)) same.push(v);
  }
  const m = a => a.reduce((x, y) => x + y, 0) / a.length;
  return same.length >= 3 ? m(same) : all.length >= 3 ? m(all) : null;
}
// Daily Report memberi jumlah transfer, web memberi jam. Jumlah ikut Daily Report bila terisi.
export function mergeTf(W, tin, tout) {
  const out = [];
  for (const [dr, sg] of [[tin, 1], [tout, -1]]) {
    const w = W.filter(e => Math.sign(e.d) === sg), ws = w.reduce((s, e) => s + Math.abs(e.d), 0);
    if (dr > 0 && !ws) out.push({ h: MODEL.open, d: sg * dr });
    else if (dr > 0) w.forEach(e => out.push({ h: e.h, d: e.d * dr / ws }));
    else w.forEach(e => out.push({ h: e.h, d: e.d }));
  }
  return out.sort((a, b) => a.h - b.h);
}
const r1 = v => Math.round(v * 10) / 10;
// Jam ketika bagian kumulatif pola mencapai `target`.
export function atShare(p, target) {
  if (target <= 0) return MODEL.open;
  let s = 0;
  for (let k = 0; k < p.length; k++) { if (s + p[k] >= target) return MODEL.open + k + (p[k] > 0 ? (target - s) / p[k] : 0); s += p[k]; }
  return MODEL.close;
}
const est = (S, h, p, D0) => { const a = MODEL.priorWeight * D0; return (S + a) / (cum(p, h) + a / D0); };
// Owner 2026-11-27: LOST MURNI = seandainya tidak ada transfer. Stok sendiri = sisa layak jual + kiriman
// pabrik. Outlet penerima transfer habis lebih cepat (saat penjualan kumulatif melewati stok sendiri);
// outlet pengirim yang aslinya habis diperpanjang dengan stok yang dikirim keluar. Lost setelah transfer
// (memakai jam catatan transfer) menyusul setelah catatan transfer lengkap.
export function computeDay(live, { profile, history } = {}) {
  const date = live?.date, out = {};
  if (!date) return out;
  const snaps = (live.snaps || []).map(s => ({ h: toH(s.t), s: s.s })).sort((a, b) => a.h - b.h);
  for (const [id, day] of Object.entries(live.daily || {})) {
    const soldNow = [...snaps].reverse().find(s => s.s[id])?.s[id] || null, wasteIn = Object.values(day).some(x => x[4] > 0 || x[5] != null), cells = {};
    for (let lab = 0; lab < 21; lab++) {
      const x = day[lab], S = soldNow?.[lab] || 0;
      if (!x) continue;
      const [awal, kirim, tfIn, tfOut, waste] = x, old = wasteIn ? Math.max(0, awal - waste) : MALMIL.has(lab) ? 0 : awal;
      const base = old + kirim, actual = base + tfIn - tfOut;
      if (base <= 0 && actual <= 0 && !S) continue;
      const p = shares(profile, id, lab, date), D0 = prior(history, id, lab, date);
      if (NO_SALES.has(lab) || !p || !D0) { cells[lab] = [Math.round(S), 0, 0, actual - S <= 0 && actual > 0 ? 1 : 0]; continue; }
      // Jam stok sendiri habis: interpolasi di antara dua tarikan.
      let hM = base <= 0 ? MODEL.open : null, prevH = MODEL.open, prevV = 0;
      if (hM == null) for (const s of snaps) {
        const v = s.s[id]?.[lab]; if (v == null) continue;
        if (v >= base) { hM = prevH + (v > prevV ? (base - prevV) / (v - prevV) : 1) * (s.h - prevH); break; }
        prevH = s.h; prevV = v;
      }
      let Sobs = Math.min(S, Math.max(base, 0));
      if (hM == null && tfOut > 0 && actual - S <= 0) {
        // Pengirim yang aslinya habis: cari jam habis nyata, lalu perpanjang dengan stok yang dikirim keluar.
        let hR = null, ph = MODEL.open, pv = 0;
        for (const s of snaps) { const v = s.s[id]?.[lab]; if (v == null) continue; if (v >= actual) { hR = ph + (v > pv ? (actual - pv) / (v - pv) : 1) * (s.h - ph); break; } ph = s.h; pv = v; }
        hR = hR ?? (snaps.at(-1)?.h || MODEL.close);
        const D = est(S, hR, p, D0), extra = Math.max(0, base - S);
        hM = D > 0 ? atShare(p, cum(p, hR) + extra / D) : MODEL.close; Sobs = S + extra;
      }
      let lost = 0;
      if (hM != null && hM < MODEL.close - 0.25) { const D = est(Sobs, hM, p, D0); lost = Math.max(0, D * (1 - cum(p, hM))); }
      cells[lab] = [Math.round(S), r1(lost), lost > 0 ? Math.round(hM * 100) : 0, lost > 0 ? 1 : 0];
    }
    if (Object.keys(cells).length) out[id] = cells;
  }
  return out;
}
// Simpan satu hari ke riwayat. Hari dari riwayat transaksi (src 'tx') tidak ditimpa hitungan otomatis.
export function mergeLostDay(doc, date, cells, src = 'live', now = new Date()) {
  const base = doc?.kind === 'lost-daily' ? doc : { schemaVersion: 1, kind: 'lost-daily', days: {}, src: {} };
  const next = { ...base, days: { ...base.days }, src: { ...(base.src || {}) }, model: 'murni v2 (tanpa transfer) · bobot 1,0 · habis x1,15 · tutup 20.00', updatedAt: now.toISOString() };
  if (next.src[date] === 'tx' && src !== 'tx') return next;
  next.days[date] = cells; next.src[date] = src;
  const floor = shift(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(now), -MODEL.keepDays);
  for (const d of Object.keys(next.days)) if (d < floor) { delete next.days[d]; delete next.src[d]; }
  return next;
}
// Catatan transfer web untuk satu tanggal (Firestore REST, akun sinkronisasi).
export async function readTransfers(date, idToken, project = 'oma-opa-game', fetcher = fetch) {
  const body = { structuredQuery: { from: [{ collectionId: 'forecastTransfer' }], where: { fieldFilter: { field: { fieldPath: 'date' }, op: 'EQUAL', value: { stringValue: date } } }, limit: 500 } };
  const r = await fetcher(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents:runQuery`, { method: 'POST', headers: { Authorization: 'Bearer ' + idToken, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw Error('HTTP ' + r.status);
  const num = v => Number(v?.integerValue ?? v?.doubleValue ?? 0);
  return (await r.json()).filter(x => x.document).map(x => {
    const f = x.document.fields || {}, items = {};
    for (const [k, v] of Object.entries(f.items?.mapValue?.fields || {})) items[k] = num(v);
    return { date: f.date?.stringValue, time: f.time?.stringValue || '08:00', from: f.from?.stringValue, to: f.to?.stringValue, items };
  });
}
