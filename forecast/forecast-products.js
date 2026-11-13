'use strict';
// Daftar produk untuk forecast & rincian kirim (owner 2026-11-10): diatur di Pengaturan › Produk,
// bukan di halaman forecast, supaya tidak terpencet saat menyusun forecast.
// - 12 produk inti: dikunci pipeline rekomendasi & rules Firestore (indeks tetap); yang bisa
//   diatur hanya NAMA TAMPIL di rincian kirim dan apakah tampil di rincian kirim.
// - Produk lain: bebas ditambah, diganti nama, dihapus, dipilih kategorinya. Disimpan di rencana
//   sebagai customItems memakai NAMA; ganti nama menyimpan nama lama sebagai alias supaya rencana
//   lama tetap terbaca di rincian kirim & akurasi roti.
window.ForecastProducts=(()=>{
 const CATS=['Ogura & Malmil','Mini','Chiffon','Roti & lainnya'];
 const CORE=[['Ogura Cheese','#e2c15a',0],['Ogura Chocolate','#8b5e3c',0],['Malmil Cheese','#e2c15a',0],['Malmil Choco','#8b5e3c',0],['Mini Cheese (pcs)','#e2c15a',1],['Mini Choco (pcs)','#8b5e3c',1],['Mini Durian (pcs)','#7fae6b',1],['Chiffon Classic Keju','#e6b39b',2],['Chiffon Classic Ekstra Keju','#d99a7e',2],['Chiffon Butter','#e0b25e',2],['Chiffon Lite Ekstra Keju','#7d9cc6',2],['Chiffon Lite Keju','#9db7d8',2]];
 // Urutan tampil di rincian kirim (sama seperti format logistik sebelumnya).
 const CORE_ORDER=[0,1,2,3,4,5,6,7,8,11,10,9];
 const DEFAULT_EXTRA=[['Box Mini',1],['Chiffon Kurma',2],['Roti Sosis',3],['Roti Abon',3],['Roti Coklat',3],['Whip',3]];
 const DOTS=['#a597c7','#b97b55','#d6918b','#7b95c4','#8b5e3c','#e3a77d','#7fae6b','#c48fb0','#6fa3a8','#c9a55a'];
 const low=s=>String(s||'').trim().toLowerCase();
 // Warna latar baris & header rute di Rincian kirim (owner 2026-11-12). Bawaan = warna format
 // logistik lama yang dihafal tim packing (dilembutkan); tim bisa mengubahnya sendiri di
 // Pengaturan › Produk › Warna rincian kirim. Putih (#ffffff) = tanpa warna.
 const CORE_BG={4:'#fff6a8',5:'#fbd2a6',6:'#b9efbf',7:'#fdeadd',8:'#fdeadd',9:'#fde0a6',10:'#d3e3f6',11:'#d3e3f6'};
 const EXTRA_BG={'box mini':'#e2dcf0','chiffon kurma':'#f4c6a6','roti sosis':'#f7d6d2','roti manis sosis':'#f7d6d2','roti abon':'#bdd3f6','roti manis abon':'#bdd3f6',
  'roti coklat':'#d6eacb','roti manis coklat meses':'#d6eacb','whip':'#f8d3b8','roti coklat keju':'#ecdcc8','roti manis coklat keju':'#ecdcc8',
  'roti pisang coklat':'#e4eec4','roti manis coklat pisang':'#e4eec4','roti vanilla':'#f4edc9','roti manis vanilla':'#f4edc9'};
 const ROUTE_BG={'Semarang':'#e6d6ee','Magelang – Salatiga':'#e6d6ee','Solo':'#d2ebce','Jogja':'#bfeef0'};
 const hex=v=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v)?v.toLowerCase():null;
 const bgOr=v=>v==='#ffffff'?null:v;
 const defaultCoreBg=p=>CORE_BG[p]||null,defaultExtraBg=name=>EXTRA_BG[low(name)]||null;
 // HPP outlet per produk inti (harga jual pabrik ke outlet, owner 2026-11-13), dipakai nominal
 // estimasi waste. Bisa diubah tim di Pengaturan › Produk (disimpan di core[p].hpp).
 const DEFAULT_HPP=[20500,19800,8800,8500,3500,3500,3500,22576,23800,24000,13500,12000];
 const hppOk=v=>Number.isFinite(Number(v))&&v!==''&&v!==null&&Number(v)>=0;
 function hpp(){const c=prefs().core;return DEFAULT_HPP.map((d,p)=>hppOk(c[p]?.hpp)?Number(c[p].hpp):d);}
 const DEFAULTS={core:CORE.map(([label])=>({label,ship:true})),extra:DEFAULT_EXTRA.map(([name,cat])=>({name,cat,aliases:[]}))};
 function prefs(){const p=window.ForecastSettings?.get?.()?.products||{};return {core:Array.isArray(p.core)&&p.core.length===12?p.core:DEFAULTS.core,extra:Array.isArray(p.extra)?p.extra:DEFAULTS.extra};}
 function core(){const c=prefs().core;return CORE.map(([label,dot,cat],p)=>({p,label:String(c[p]?.label||label),ship:c[p]?.ship!==false,dot,cat,bg:bgOr(hex(c[p]?.color)??defaultCoreBg(p))}));}
 function extra(){return prefs().extra.filter(x=>String(x?.name||'').trim()).map((x,i)=>({name:String(x.name).trim(),cat:Number.isInteger(x.cat)&&x.cat>=0&&x.cat<CATS.length?x.cat:3,aliases:Array.isArray(x.aliases)?x.aliases.map(String):[],dot:DOTS[i%DOTS.length],bg:bgOr(hex(x.color)??defaultExtraBg(x.name))}));}
 const names=()=>extra().map(x=>x.name);
 // Produk lain yang cocok dengan nama item rencana (nama sekarang atau nama lama).
 function match(itemName){const n=low(itemName);return extra().find(x=>low(x.name)===n||x.aliases.some(a=>low(a)===n))||null;}
 // Nilai item rencana untuk satu produk lain (cocok nama atau alias).
 function itemFor(items,product){return (items||[]).find(it=>{const n=low(it.name);return n===low(product.name)||product.aliases.some(a=>low(a)===n);})||null;}
 // Warna header rute (nama rute -> warna latar lembut).
 function routeBg(name){const r=window.ForecastSettings?.get?.()?.products?.routes||{};return hex(r[name])||ROUTE_BG[name]||null;}
 return {hpp,DEFAULT_HPP,CATS,CORE_ORDER,DEFAULTS,core,extra,names,match,itemFor,low,hex,routeBg,defaultCoreBg,defaultExtraBg,ROUTE_BG};
})();
