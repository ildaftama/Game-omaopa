import { signIn } from './pack-forecast-reference.mjs';

// Agregasi demografi member per outlet forecast (28 outlet). READ-ONLY terhadap collection
// "users" (database member). Tidak pernah mengembalikan/menyimpan data pribadi individu
// (nama/telepon/tanggal lahir/uid) -- hanya hitungan per kelompok umur/gender per outlet.
// "homeOutlet" di data member adalah teks bebas (dipilih member saat daftar), bukan id
// outlet internal -- HOMEOUTLET_TO_ID memetakan nilai yang teramati (lihat probe 2026-11-06,
// 13.049 dokumen, 44 nilai unik) ke salah satu 28 outlet forecast. Nilai yang tidak match
// (termasuk outlet retail yang ada tapi di luar 28 outlet forecast, typo, atau "Office")
// masuk ke bucket "lainnya" -- tetap dihitung di total tapi tidak dipakai per outlet.
const PROJECT = 'oma-opa-game';

export const HOMEOUTLET_TO_ID = {
  'undip semarang': 'undip',
  'pemuda magelang': 'pemuda-magelang',
  unnes: 'unnes',
  'kedungmundu (unimus)': 'unimus',
  godean: 'godean',
  'kyai mojo godean': 'godean',
  'sudirman sukoharjo': 'sukoharjo',
  'gajah raya semarang': 'gajah-raya',
  'great elephant of semarang': 'gajah-raya',
  umy: 'umy',
  karanganyar: 'karanganyar',
  'jakal uii': 'jakal-uii',
  'jakal bawah': 'jakal-uii',
  tajem: 'tajem',
  'udinus semarang': 'udinus',
  'pandanaran boyolali': 'boyolali',
  'ngaliyan semarang': 'ngaliyan',
  'rajawali klaten': 'rajawali',
  'merbabu klaten': 'merbabu',
  'gunung merbabu, klaten': 'merbabu',
  makamhaji: 'makamhaji',
  'nusukan solo': 'nusukan',
  muntilan: 'muntilann',
  'laweyan solo': 'laweyan',
  'nusa indah': 'nusa-indah',
  temanggung: 'temanggung',
  'sukowati sragen': 'sragen',
  'uksw salatiga': 'uksw',
  ambarawa: 'ambarawa',
  ums: 'ums',
  'sampangan semarang': 'sampangan',
  uns: 'uns',
};
// Teramati tapi BUKAN salah satu dari 28 outlet forecast (outlet retail lain / area / typo /
// internal) -- sengaja dibiarkan di luar peta di atas supaya tidak salah tempel ke outlet yang
// salah: Taman Siswa/Tamsis, Student Park/Tamsis, Giwangan, Gejayan, Malioboro/jl. Mataram,
// Jalan Magelang, Jalan Damai, Babarsari, Ambarukmo, Kadipiro, Office, Klaten Eagle.

export function mapHomeOutlet(raw) {
  if (!raw) return null;
  const id = HOMEOUTLET_TO_ID[String(raw).trim().toLowerCase()];
  return id || null;
}
export function normalizeGender(raw) {
  const g = String(raw || '').trim().toLowerCase();
  if (['laki-laki', 'man', 'pria'].includes(g)) return 'L';
  if (['perempuan', 'woman', 'wanita'].includes(g)) return 'P';
  return null;
}
function unfield(f) {
  if (!f) return null;
  if ('stringValue' in f) return f.stringValue;
  if ('integerValue' in f) return Number(f.integerValue);
  if ('doubleValue' in f) return f.doubleValue;
  if ('booleanValue' in f) return f.booleanValue;
  if ('nullValue' in f) return null;
  if ('timestampValue' in f) return f.timestampValue;
  if ('arrayValue' in f) return (f.arrayValue.values || []).map(unfield);
  if ('mapValue' in f) return Object.fromEntries(Object.entries(f.mapValue.fields || {}).map(([k, x]) => [k, unfield(x)]));
  return null;
}
async function listAll(collection, idToken, pageSize = 300) {
  let pageToken, all = [];
  do {
    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${collection}?pageSize=${pageSize}${pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : ''}`;
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + idToken } });
    if (!r.ok) throw Error(`List "${collection}" gagal (HTTP ${r.status}): ${(await r.text()).slice(0, 300)}`);
    const body = await r.json();
    all.push(...(body.documents || []));
    pageToken = body.nextPageToken;
  } while (pageToken);
  return all;
}
const AGE_BRACKETS = ['≤17', '18-24', '25-34', '35-44', '45+'];
function emptyBucket() {
  return { total: 0, byAge: Object.fromEntries(AGE_BRACKETS.map((a) => [a, 0])), byGender: { L: 0, P: 0 } };
}
export function aggregate(docs) {
  const perOutlet = {};
  const other = emptyBucket();
  let unknownHomeOutlet = 0;
  for (const d of docs) {
    const f = Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, unfield(v)]));
    const outletId = mapHomeOutlet(f.homeOutlet);
    const bucket = outletId ? (perOutlet[outletId] ||= emptyBucket()) : other;
    if (!f.homeOutlet) unknownHomeOutlet++;
    bucket.total++;
    if (AGE_BRACKETS.includes(f.age)) bucket.byAge[f.age]++;
    const g = normalizeGender(f.gender);
    if (g) bucket.byGender[g]++;
  }
  return { schemaVersion: 1, totalMembers: docs.length, perOutlet, other, unknownHomeOutlet };
}
export async function buildDemographics(env) {
  const { idToken } = await signIn(env);
  const docs = await listAll('users', idToken);
  return aggregate(docs);
}
