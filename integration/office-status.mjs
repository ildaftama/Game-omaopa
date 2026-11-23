// Data Kantor Mini: jadwal shift + status singkat waste/lost, disimpan di SATU dokumen privat kecil.
// Repo ini publik: link sheet, nama staf, dan angka outlet hanya ada di dokumen privat itu.
// Log hanya boleh berisi jumlah baris, dan kegagalan di sini tidak boleh menggagalkan sinkronisasi.
export const OFFICE_KEY = 'reference_0000000000000001_0';
const PRICE_REFS = { 4: 57000 / 9, 5: 57000 / 9, 6: 57000 / 9, 7: 33000, 8: 34000, 9: 34000, 10: 19000, 11: 18000, 12: 6500, 13: 7000, 14: 6000, 15: 6000, 16: 6000, 17: 6000 };
const PRICE_KEYS = ['Ogura Cheese', 'Ogura Chocolate', 'Malmil Cheese', 'Malmil Chocolate'];
const WINDOW = 7, MIN_DAYS = 3, KEEP_DAYS = 45;
const wibDay = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(d);
const shiftDay = (day, n) => new Date(Date.parse(day + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);

function priceOf(prices, id, p) {
  if (p < 4) { const v = prices?.outlets?.[id]?.[PRICE_KEYS[p]]?.price; return v > 0 ? v : 0; }
  if (p === 18 || p === 19) return priceOf(prices, id, p - 16);
  return PRICE_REFS[p] || 0;
}
export function parseCsv(text) {
  const rows = []; let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch; }
    else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell.replace(/\r$/, '')); rows.push(row); }
  return rows;
}
export function parseSchedule(rows, people) {
  const out = {}, headAt = rows.findIndex(r => r.some(c => c.trim() === 'Team') && r.some(c => /^\d+\/\d+\/\d{4}$/.test(c.trim())));
  if (headAt < 0) return out;
  const head = rows[headAt], nameCol = head.findIndex(c => c.trim() === 'Name');
  const found = people.map(name => rows.slice(headAt + 1).find(r => (r[nameCol] || '').trim() === name));
  if (found.some(r => !r)) return out;
  head.forEach((c, i) => {
    const m = c.trim().match(/^(\d+)\/(\d+)\/(\d{4})$/);
    if (m) out[`${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`] = found.map(r => (r[i] || '').trim());
  });
  return out;
}
export async function pullSchedule(sheetId, people, fetcher = fetch) {
  const base = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}`;
  const page = await (await fetcher(`${base}/htmlview`, { signal: AbortSignal.timeout(30000) })).text();
  const tabs = [...page.matchAll(/name: "([^"]+)"[^}]*?gid: "(\d+)"/g)].filter(m => /schedule/i.test(m[1])).map(m => m[2]).slice(-3);
  const all = {};
  for (const gid of tabs) {
    const r = await fetcher(`${base}/export?format=csv&gid=${gid}`, { signal: AbortSignal.timeout(30000) });
    if (r.ok) Object.assign(all, parseSchedule(parseCsv(await r.text()), people));
  }
  return all;
}
function grossMap(sales, prices) {
  const map = new Map();
  for (const row of sales?.days || []) {
    if (!row.complete || !Array.isArray(row.qty)) continue;
    let gross = 0;
    for (let p = 0; p < 20; p++) gross += (row.qty[p] || 0) * priceOf(prices, row.id, p);
    map.set(row.date + '|' + row.id, gross);
  }
  return map;
}
const level = (v, limit) => v == null ? null : v > limit ? 'lewat' : v >= limit * .9 ? 'waspada' : 'aman';
const trendOf = (now, before) => now == null || !(before > 0) ? 'stabil' : now > before * 1.1 ? 'naik' : now < before * .9 ? 'turun' : 'stabil';
export function computeStatus({ sales, recap, prices, names = {}, thresholds = {}, today = wibDay() }) {
  const wasteLimit = thresholds.waste || 3.5, lostLimit = thresholds.lostSales || 4.5, openMin = (thresholds.openHours || 12) * 60, floor = shiftDay(today, -28);
  const gross = grossMap(sales, prices), ids = sales?.outletIds || [];
  const wDays = Object.keys(recap?.waste || {}).filter(d => d < today && d >= floor && Object.keys(recap.waste[d]).length).sort();
  const lDays = Object.keys(recap?.lostSalesMinutes || {}).filter(d => d < today && d >= floor).sort();
  const wastePct = (days, only) => { let n = 0, r = 0; for (const d of days) for (const id of only || ids) { const g = gross.get(d + '|' + id); if (g > 0) { n += recap.waste[d][id]?.nominal || 0; r += g; } } return days.length >= (only ? MIN_DAYS : 1) && r > 0 ? n / r * 100 : null; };
  const lostPct = (days, only) => { let m = 0, c = 0; for (const d of days) for (const [id, v] of Object.entries(recap.lostSalesMinutes[d] || {})) if ((!only || only.includes(id)) && Number.isFinite(v)) { m += v; c++; } return c && days.length >= (only ? MIN_DAYS : 1) ? m / c / openMin * 100 : null; };
  const wRecent = wDays.slice(-WINDOW), lRecent = lDays.slice(-WINDOW);
  const top = (fn, days, limit) => ids.map(id => [id, fn(days, [id])]).filter(([, v]) => v != null && v > limit).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id]) => ({ id, name: names[id] || id }));
  const wasteNow = wRecent.length >= MIN_DAYS ? wastePct(wRecent) : null, lostNow = lRecent.length >= MIN_DAYS ? lostPct(lRecent) : null;
  return {
    waste: level(wasteNow, wasteLimit), lost: level(lostNow, lostLimit),
    wasteTrend: trendOf(wastePct(wDays.slice(-3)), wastePct(wDays.slice(-6, -3))), lostTrend: trendOf(lostPct(lDays.slice(-3)), lostPct(lDays.slice(-6, -3))),
    wasteOutlets: wRecent.length >= MIN_DAYS ? top(wastePct, wRecent, wasteLimit) : [], lostOutlets: lRecent.length >= MIN_DAYS ? top(lostPct, lRecent, lostLimit) : [],
  };
}
async function readThresholds(fetcher = fetch) {
  try {
    const r = await fetcher('https://firestore.googleapis.com/v1/projects/oma-opa-game/databases/(default)/documents/settings/forecastSources', { signal: AbortSignal.timeout(20000) });
    const t = (await r.json()).fields?.config?.mapValue?.fields?.preferences?.mapValue?.fields?.thresholds?.mapValue?.fields || {};
    const n = v => Number(v?.doubleValue ?? v?.integerValue) || undefined;
    return { waste: n(t.waste), lostSales: n(t.lostSales), openHours: n(t.openHours) };
  } catch { return {}; }
}
// read/write dari pack-forecast-reference.mjs. `data` kosong = hanya perbarui jadwal (jalur per jam).
export async function refreshOffice({ read, write, data }) {
  const cur = await read(OFFICE_KEY);
  if (!cur?.sheetId || !Array.isArray(cur.people)) { console.log('Data Kantor Mini belum disiapkan.'); return false; }
  let schedule = { ...(cur.schedule || {}) };
  let scheduleOk = false;
  try { const got = await pullSchedule(cur.sheetId, cur.people); scheduleOk = Object.keys(got).length > 0; Object.assign(schedule, got); } catch { scheduleOk = false; }
  if (!scheduleOk) console.log('Jadwal Kantor Mini belum terbaca, memakai jadwal terakhir.');
  const floor = shiftDay(wibDay(), -KEEP_DAYS);
  schedule = Object.fromEntries(Object.entries(schedule).filter(([d]) => d >= floor).sort());
  let status = cur.status || null;
  if (data?.recap) status = computeStatus({ ...data, thresholds: await readThresholds() });
  const next = { schemaVersion: 1, kind: 'office', sheetId: cur.sheetId, people: cur.people, schedule, status, scheduleOk, scheduleAt: scheduleOk ? new Date().toISOString() : cur.scheduleAt || null };
  await write(OFFICE_KEY, { ...next, updatedAt: new Date().toISOString() });
  console.log('Data Kantor Mini diperiksa: ' + Object.keys(schedule).length + ' hari jadwal.');
  return true;
}
