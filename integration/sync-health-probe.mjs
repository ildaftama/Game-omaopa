import { signIn, fetchBundle } from './pack-forecast-reference.mjs';
import { pathToFileURL } from 'node:url';

// Satu kali pakai, read-only: cek KELENGKAPAN (bukan nominal/angka) sinkronisasi ESB untuk
// 7-8 Nov 2026 -- owner melaporkan omzet 7 Nov telat update, minta dicek apakah sinkronisasi
// tiap jam benar-benar jalan. Tidak mencetak omzet/qty per produk sama sekali, cuma hitung
// berapa outlet yang complete per tanggal.
async function run() {
  const { idToken } = await signIn(process.env);
  const bundle = await fetchBundle('forecastPlans/reference_current', idToken);
  if (!bundle) { console.log('Bundle belum ada.'); return; }
  const sales = bundle.files['pcs-sales.json'];
  const totalOutlets = (sales.outletIds || []).length;
  console.log('Total outlet dikenal: ' + totalOutlets);
  console.log('updatedAt bundle: ' + bundle.updatedAt);
  for (const date of ['2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']) {
    const rows = (sales.days || []).filter(r => r.date === date);
    const complete = rows.filter(r => r.complete).length;
    console.log(`${date}: ${rows.length} baris, ${complete} complete dari ${totalOutlets} outlet`);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch(e => { console.error('GAGAL: ' + e.message); process.exitCode = 1; });
}
