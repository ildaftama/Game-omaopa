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
 return {category,notes,campusOutlets:[...campus]};
})();
