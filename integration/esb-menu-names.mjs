import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createEsbClient } from './esb-client.mjs';

// Satu kali pakai: lihat nama menu ESB PERSIS seperti apa adanya, untuk produk yang belum
// dipetakan di sku() (forecast/pcs-sales.mjs) -- misalnya Roti Sosis/Abon/Coklat dan varian
// bundlingnya. TIDAK mengubah data apa pun, cuma membaca lalu mencetak nama menu yang cocok
// filter ke layar. Dijalankan manual oleh owner (perlu ESB_USERNAME/ESB_PASSWORD di lingkungan
// terminal sendiri) -- hasilnya ditempel balik ke Claude untuk menulis pemetaan yang tepat.
//
// Jalankan: ESB_USERNAME=... ESB_PASSWORD=... node integration/esb-menu-names.mjs [filter] [tanggal]
// filter default "roti", tanggal default kemarin (WIB).

async function run() {
 const filter = (process.argv[2] || 'roti').toLowerCase();
 const yesterday = new Date(Date.now() - 86400000);
 const date = process.argv[3] || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(yesterday);
 const { branches } = JSON.parse(fs.readFileSync('integration/pcs-branches.json', 'utf8'));
 const client = createEsbClient({ username: process.env.ESB_USERNAME, password: process.env.ESB_PASSWORD });
 const found = new Map(); // menuName -> {count, outlets:Set, sampleTotal, sampleQty}
 let checked = 0, failed = 0;
 try {
  for (const b of branches) {
   checked++;
   let rows;
   try { ({ rows } = await client.pages('sales-menu-cogs', { branchID: String(b.branchID), salesDate: date, salesMenuCogsType: 'Standard', showMenuPackage: '0' })); }
   catch (e) { failed++; console.error(`  (lewati ${b.branchName}: ${e.message})`); continue; }
   for (const r of rows) {
    if (r.salesType !== 'Sales' || r.rowType === 'PACKAGE_COMPONENT') continue;
    if (!String(r.menuName || '').toLowerCase().includes(filter)) continue;
    const e = found.get(r.menuName) || { count: 0, outlets: new Set(), qty: 0, total: 0 };
    e.count++; e.outlets.add(b.branchName); e.qty += r.qty || 0; e.total += r.total || 0;
    found.set(r.menuName, e);
   }
  }
 } finally { client.close(); }
 console.log(`Tanggal: ${date} · ${checked} outlet dicek (${failed} gagal dibaca) · filter nama menu mengandung "${filter}"`);
 if (!found.size) { console.log('Tidak ada menu yang cocok filter ini pada tanggal tersebut.'); return; }
 for (const [name, e] of [...found.entries()].sort((a, b) => b[1].qty - a[1].qty)) {
  console.log(`- "${name}" · ${e.qty} pcs · ${e.outlets.size} outlet (${[...e.outlets].slice(0, 5).join(', ')}${e.outlets.size > 5 ? ', ...' : ''}) · rowType baris pertama perlu dicek manual kalau mau tahu PACKAGE_HEADER/ALACARTE`);
 }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
 run().catch(e => { console.error(e.message); process.exitCode = 1; });
}
