import { signIn } from './pack-forecast-reference.mjs';
import { pathToFileURL } from 'node:url';

// Satu kali pakai, READ-ONLY murni: cek apakah akun sinkronisasi (FIREBASE_SYNC_EMAIL) bisa
// membaca collection "users" (database member, field age/gender/homeOutlet dll -- lihat
// Firebase Console), dan lihat bentuk nilai "homeOutlet" sebenarnya (perlu dipetakan ke id
// outlet internal kita sebelum bisa diagregasi per outlet). TIDAK menulis/mengubah apa pun di
// Firestore, TIDAK mencetak data pribadi individu (nama/telepon/tanggal lahir) -- hanya
// ringkasan jumlah per kategori.
const PROJECT = 'oma-opa-game';
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
  let pageToken, all = [], pages = 0;
  do {
    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${collection}?pageSize=${pageSize}${pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : ''}`;
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + idToken } });
    if (!r.ok) throw Error(`List "${collection}" gagal (HTTP ${r.status}): ${(await r.text()).slice(0, 300)}`);
    const body = await r.json();
    all.push(...(body.documents || []));
    pageToken = body.nextPageToken;
    pages++;
    if (pages % 5 === 0) console.log(`  ...${all.length} dokumen dibaca sejauh ini`);
  } while (pageToken);
  return all;
}
async function run() {
  const { idToken } = await signIn(process.env);
  console.log('Login sinkronisasi berhasil. Mengecek akses collection "users"...');
  const docs = await listAll('users', idToken);
  console.log(`\nTotal dokumen users: ${docs.length}`);
  const homeOutletCounts = new Map();
  let withHomeOutlet = 0, withAge = 0, withGender = 0, withOccupation = 0, profileComplete = 0;
  const ageValues = new Set(), genderValues = new Set();
  for (const d of docs) {
    const f = Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, unfield(v)]));
    if (f.homeOutlet) { withHomeOutlet++; homeOutletCounts.set(f.homeOutlet, (homeOutletCounts.get(f.homeOutlet) || 0) + 1); }
    if (f.age) { withAge++; ageValues.add(f.age); }
    if (f.gender) { withGender++; genderValues.add(f.gender); }
    if (f.occupation) withOccupation++;
    if (f.profileComplete) profileComplete++;
  }
  console.log(`Punya homeOutlet: ${withHomeOutlet} · age: ${withAge} · gender: ${withGender} · occupation: ${withOccupation} · profileComplete: ${profileComplete}`);
  console.log(`\nNilai age yang muncul: ${[...ageValues].sort().join(', ')}`);
  console.log(`Nilai gender yang muncul: ${[...genderValues].sort().join(', ')}`);
  console.log(`\nDistinct homeOutlet (diurutkan terbanyak), ${homeOutletCounts.size} nilai unik:`);
  for (const [v, n] of [...homeOutletCounts.entries()].sort((a, b) => b[1] - a[1])) console.log(`  "${v}": ${n}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch(e => { console.error('GAGAL: ' + e.message); process.exitCode = 1; });
}
