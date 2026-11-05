'use strict';
// Catatan pola per outlet/hari/produk, diringkas dari riset yang sudah ada (riset V3 4-SKU dan
// riset 12-SKU website) — porting ALASAN dan gaya penjelasan, bukan menyalin ulang angka Python
// baris-per-baris. Tidak ada data finansial di sini; aman untuk role forecaster.
window.OutletResearchNotes=(()=>{
 // Outlet yang namanya/ID-nya terkait kampus (universitas berdekatan). Nusa Indah dikonfirmasi
 // pemilik terkait UII/UPN/AMIKOM; sisanya memakai ID singkatan kampus itu sendiri.
 const campus=new Set(['jakal-uii','nusa-indah','udinus','uksw','ums','umy','undip','unimus','unnes','uns']);
 function category(outletId){return campus.has(outletId)?'kampus':'non-kampus';}
 function notes(outletId,weekday,productIndex){
  const out=[];
  if(category(outletId)==='kampus')out.push('Outlet berbasis kampus historis paling sulit diprediksi di jaringan ini — jadwal akademik (libur, UTS/UAS, wisuda) membuat pola mingguan lebih berubah-ubah dibanding outlet non-kampus.');
  if(weekday===6)out.push('Hari Sabtu historis punya error prediksi lebih tinggi dari hari lain, terutama di outlet berbasis kampus.');
  if(productIndex===1){out.push('Ogura Choco adalah produk paling sulit diprediksi di seluruh jaringan — rasio margin/HPP yang tinggi membuat permintaannya lebih sensitif terhadap faktor luar dibanding produk lain.');
   if(weekday===3)out.push('Kombinasi Rabu dengan Ogura Choco historis punya selisih prediksi terbesar di antara kombinasi hari×produk yang diperiksa.');
  }
  return out;
 }
 // Pengelompokan wilayah operasional (dikonfirmasi owner 2026-11-05), dipakai untuk ringkas
 // cuaca per area dulu sebelum rincian per outlet. Merbabu & Rajawali dipetakan ke Area 1
 // (Klaten) berdasarkan koordinat — namanya sendiri tidak menyebut kota.
 const AREA_NAMES={1:'Area 1 · Jogja, Klaten, Magelang, Temanggung, Muntilan',2:'Area 2 · Solo, Boyolali, Sragen, Karanganyar, Sukoharjo',3:'Area 3 · Semarang, Salatiga, Ambarawa'};
 const areaMap={
  godean:1,umy:1,'jakal-uii':1,'nusa-indah':1,tajem:1,'pemuda-magelang':1,muntilann:1,temanggung:1,merbabu:1,rajawali:1,
  boyolali:2,sragen:2,karanganyar:2,sukoharjo:2,uns:2,ums:2,makamhaji:2,nusukan:2,laweyan:2,
  ambarawa:3,uksw:3,'gajah-raya':3,udinus:3,unnes:3,undip:3,sampangan:3,unimus:3,ngaliyan:3,
 };
 function area(outletId){return areaMap[outletId]||null;}
 function areaName(n){return AREA_NAMES[n]||('Area '+n);}
 return {category,notes,campusOutlets:[...campus],area,areaName,AREA_NAMES};
})();
