import fs from 'node:fs';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { pull as pullDailyRecap } from './waste-recap.mjs';
import { buildDemographics } from './customer-demographics.mjs';

// Nightly ESB -> private reference bundle sync (feature: otomasi ESB malam hari).
//
// This script does NOT touch forecast/pcs-sales.json / pcs-orders.json in the public
// repository and does NOT call the GitHub Pages deploy — unlike the held esb-pcs.yml
// workflow, it writes straight into the private Firestore bundle that
// forecast-auth-gate.js already reads (forecastPlans/reference_current + chunks), using
// the same gzip + base64 + sha256 chunk format that client's own manual import already
// produces. Everything else in the live bundle (globals, ForecastStudy) is carried over
// unchanged — this script only refreshes the two PCS files.
//
// It ALSO derives and writes a second, leaner "forecaster brief" bundle
// (forecastBriefs/forecaster_current) containing no revenue/profit/evaluation globals,
// for the forecaster-only role. See integration/firestore-forecast-plans.rules.fragment.
//
// Requires env: FIREBASE_SYNC_EMAIL, FIREBASE_SYNC_PASSWORD, FIREBASE_WEB_API_KEY.
// The sync account's staff/{uid} document must have super or master = true (the same
// requirement as the existing manual "Pilih paket data privat" import flow) — this is
// NOT something this script can grant; an owner/manager sets that in Firestore directly.

const PROJECT = 'oma-opa-game';
const CHUNK_LIMIT = 700000, MAX_CHUNKS = 10;
// Globals safe to hand to a forecaster-only account: outlet/product identity, events,
// price references used by the plan's own revenue estimate. No revenue trend, profit,
// waste, or evaluation globals -- DAILY_RECAP_SUMMARY (waste/lost sales) stays full-bundle
// only for this same reason, matching PERFORMANCE_SUMMARY/WASTE_ESB_SUMMARY.
const LEAN_GLOBALS = ['OUTLET_DATA', 'OUTLET_INTELLIGENCE', 'INSIGHT_DATA', 'FORECAST_REALIZED_PRICES'];

function field(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(field) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, field(x)])) } };
}
function unfield(f) {
  if (!f) return null;
  if ('stringValue' in f) return f.stringValue;
  if ('integerValue' in f) return Number(f.integerValue);
  if ('doubleValue' in f) return f.doubleValue;
  if ('booleanValue' in f) return f.booleanValue;
  if ('nullValue' in f) return null;
  if ('arrayValue' in f) return (f.arrayValue.values || []).map(unfield);
  if ('mapValue' in f) return Object.fromEntries(Object.entries(f.mapValue.fields || {}).map(([k, x]) => [k, unfield(x)]));
  return null;
}
async function request(url, options = {}) {
  let r; try { r = await fetch(url, { ...options, signal: AbortSignal.timeout(30000) }); } catch { throw Error('Koneksi ke Firebase/Firestore tidak berhasil.'); }
  if (!r.ok) { let body = {}; try { body = await r.json(); } catch {} const code = r.status === 404 ? 'NOT_FOUND' : String(r.status); const err = Error('Permintaan Firestore gagal (HTTP ' + r.status + '): ' + (body.error?.message || '')); err.code = code; throw err; }
  return r.json();
}
export async function signIn(env) {
  for (const key of ['FIREBASE_SYNC_EMAIL', 'FIREBASE_SYNC_PASSWORD', 'FIREBASE_WEB_API_KEY']) if (!env[key]) throw Error('Pengaturan integrasi belum lengkap: ' + key);
  const auth = await request('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + encodeURIComponent(env.FIREBASE_WEB_API_KEY), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: env.FIREBASE_SYNC_EMAIL, password: env.FIREBASE_SYNC_PASSWORD, returnSecureToken: true }) });
  if (!auth.idToken) throw Error('Login Firebase akun sinkronisasi belum berhasil.');
  return { idToken: auth.idToken, uid: auth.localId };
}
function docUrl(path) { return `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${path}`; }
function resourceName(path) { return `projects/${PROJECT}/databases/(default)/documents/${path}`; }
async function getDoc(path, idToken) {
  try { const d = await request(docUrl(path), { headers: { Authorization: 'Bearer ' + idToken } }); return Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, unfield(v)])); }
  catch (e) { if (e.code === 'NOT_FOUND') return null; throw e; }
}
// Reads the current live bundle (gzip+base64 chunks) and returns the decompressed object,
// or null if nothing has been published yet.
export async function fetchBundle(manifestPath, idToken) {
  const manifest = await getDoc(manifestPath, idToken);
  if (!manifest) return null;
  const dir = manifestPath.slice(0, manifestPath.lastIndexOf('/') + 1);
  const chunks = [];
  for (const key of manifest.chunks) { const c = await getDoc(dir + key, idToken); if (!c) throw Error('Chunk referensi hilang: ' + key); chunks.push(c.payload); }
  const bytes = Buffer.from(chunks.join(''), 'base64'), raw = zlib.gunzipSync(bytes);
  const hash = createHash('sha256').update(raw).digest('hex');
  if (hash !== manifest.sha256) throw Error('Checksum bundle saat ini tidak cocok.');
  return JSON.parse(raw.toString('utf8'));
}
// Gzip + base64 + chunk a bundle object, same format as forecast-auth-gate.js unpack().
export function packBundle(bundle) {
  const raw = Buffer.from(JSON.stringify(bundle), 'utf8'), gz = zlib.gzipSync(raw);
  const sha256 = createHash('sha256').update(raw).digest('hex'), b64 = gz.toString('base64');
  const chunks = []; for (let i = 0; i < b64.length; i += CHUNK_LIMIT) chunks.push(b64.slice(i, i + CHUNK_LIMIT));
  if (chunks.length > MAX_CHUNKS) throw Error('Bundle terlalu besar untuk dipaketkan (' + chunks.length + ' chunk, maksimum ' + MAX_CHUNKS + ').');
  return { sha256, chunks };
}
// Writes manifest + chunk documents atomically via :commit, using setToServerValue so
// updatedAt matches request.time exactly (required by forecastReference()/forecastBrief()).
export async function writeBundle(collectionPath, keyPrefix, kindManifest, kindChunk, packed, idToken, uid) {
  const keys = packed.chunks.map((_, i) => keyPrefix + '_' + packed.sha256.slice(0, 16) + '_' + i);
  const writes = packed.chunks.map((payload, i) => ({
    update: { name: resourceName(collectionPath + '/' + keys[i]), fields: { schemaVersion: field(2), kind: field(kindChunk), payload: field(payload), sha256: field(packed.sha256), updatedBy: field(uid) } },
    updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
  }));
  writes.push({
    update: { name: resourceName(collectionPath + '/' + keyPrefix + '_current'), fields: { schemaVersion: field(2), kind: field(kindManifest), chunks: field(keys), sha256: field(packed.sha256), updatedBy: field(uid) } },
    updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
  });
  await request(`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents:commit`, { method: 'POST', headers: { Authorization: 'Bearer ' + idToken, 'Content-Type': 'application/json' }, body: JSON.stringify({ writes }) });
  return keys;
}
export function buildLeanBundle(fullBundle) {
  const globals = Object.fromEntries(LEAN_GLOBALS.filter(k => Object.hasOwn(fullBundle.globals || {}, k)).map(k => [k, fullBundle.globals[k]]));
  return { schemaVersion: 1, globals, files: { 'pcs-sales.json': fullBundle.files['pcs-sales.json'], 'pcs-orders.json': fullBundle.files['pcs-orders.json'] } };
}
// Menulis pcs-sales.json dari bundle LIVE ke disk, SEBELUM pcs-sales.mjs dijalankan. Tanpa
// ini, pcs-sales.mjs menggabungkan data ESB baru dengan file pcs-sales.json git checkout
// (snapshot lama, bisa jauh lebih tipis dari yang sudah live di Firestore) -- riwayat yang
// lebih lengkap di bundle live bisa "hilang" setiap kali workflow ini jalan. pcs_orders.py
// tidak perlu di-prime karena ia menulis ulang penuh dari sheet PESANAN setiap kali.
export async function prime(env = process.env, salesPath = 'forecast/pcs-sales.json') {
  const { idToken } = await signIn(env);
  const current = await fetchBundle('forecastPlans/reference_current', idToken);
  if (!current?.files?.['pcs-sales.json']) { console.log('Belum ada bundle referensi tersimpan; pakai pcs-sales.json dari repo apa adanya.'); return; }
  fs.writeFileSync(salesPath, JSON.stringify(current.files['pcs-sales.json']));
  console.log('pcs-sales.json disiapkan dari bundle live sebagai basis merge (riwayat penuh dipertahankan).');
}
// Rekap harian (waste nominal dari tab WASTE + menit lost sales dari tab "Rekap Forecast
// <bulan>") ditarik dari sheet publik tim, bukan ESB -- kegagalan di sini TIDAK boleh
// menggagalkan sinkronisasi ESB utama, jadi dibungkus try/catch dan jatuh ke data lama di
// bundle (kalau ada) daripada membatalkan seluruh run().
async function fetchDailyRecap(profiles) {
  try {
    const sources = JSON.parse(fs.readFileSync('forecast/data-sources.json', 'utf8'));
    const sheetId = sources.sources.find(s => s.key === 'forecast')?.url?.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1];
    if (!sheetId || !profiles) return null;
    return await pullDailyRecap(sheetId, profiles);
  } catch (e) { console.log('Rekap harian (waste/lost sales) belum berhasil ditarik: ' + e.message); return null; }
}
// Demografi member (database "users") per outlet -- kegagalan (misalnya rule belum/ belum
// sempat di-publish) TIDAK boleh menggagalkan sinkronisasi ESB utama, sama seperti rekap
// harian: dibungkus try/catch dan jatuh ke nilai lama di bundle kalau ada.
async function fetchDemographics(env, fallback) {
  try { return await buildDemographics(env); }
  catch (e) { console.log('Demografi member belum berhasil ditarik: ' + e.message); return fallback || null; }
}
export async function run(env = process.env, salesPath = 'forecast/pcs-sales.json', ordersPath = 'forecast/pcs-orders.json') {
  const { idToken, uid } = await signIn(env);
  const current = await fetchBundle('forecastPlans/reference_current', idToken);
  if (!current) throw Error('Belum ada bundle referensi yang tersimpan — jalankan import manual (manager) terlebih dahulu sekali.');
  const sales = JSON.parse(fs.readFileSync(salesPath, 'utf8')), orders = JSON.parse(fs.readFileSync(ordersPath, 'utf8'));
  const dailyRecap = await fetchDailyRecap(current.globals?.OUTLET_INTELLIGENCE) || current.globals?.DAILY_RECAP_SUMMARY || null;
  const demographics = await fetchDemographics(env, current.globals?.CUSTOMER_DEMOGRAPHICS);
  const full = { ...current, globals: { ...current.globals, ...(dailyRecap ? { DAILY_RECAP_SUMMARY: dailyRecap } : {}), ...(demographics ? { CUSTOMER_DEMOGRAPHICS: demographics } : {}) }, files: { ...current.files, 'pcs-sales.json': sales, 'pcs-orders.json': orders } };
  const packedFull = packBundle(full);
  await writeBundle('forecastPlans', 'reference', 'reference-manifest', 'reference-chunk', packedFull, idToken, uid);
  console.log('Bundle referensi penuh tersimpan: ' + packedFull.chunks.length + ' chunk.');
  const lean = buildLeanBundle(full), packedLean = packBundle(lean);
  await writeBundle('forecastBriefs', 'forecaster', 'forecaster-manifest', 'forecaster-chunk', packedLean, idToken, uid);
  console.log('Bundle forecaster (ramping) tersimpan: ' + packedLean.chunks.length + ' chunk.');
  return { full: packedFull.sha256, lean: packedLean.sha256 };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const task = process.argv[2] === 'prime' ? prime() : run();
  task.catch(e => { console.error(e.message); console.error('Sinkronisasi bundle referensi belum berhasil.'); process.exitCode = 1; });
}
