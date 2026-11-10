'use strict';
// Rencana produksi per ANGKATAN (owner 2026-11-10). Dapur memproduksi per angkatan dengan isi
// tetap per varian (semua rasa sama): Ogura 18, Malmil 36, Mini Ogura 90 (10 pax x 9), Chiffon 12,
// Chiffon Lite 12 -- bisa diubah di Pengaturan › Produk. Total rencana PCS (reguler + pesanan semua
// outlet + pesanan pabrik) hampir tidak pernah pas kelipatan angkatan, jadi tiap rasa dibulatkan:
//   - NAIK ke angkatan berikutnya kalau sisanya >= ambang, selain itu TURUN (sisa tidak diproduksi).
//   - Ambang dinamis dari kondisi 28 hari terakhir: normal 50%; waste di atas ambang & jarang habis
//     -> 75% (lebih sulit naik); sering habis & waste rendah -> 25% (lebih mudah naik).
//   - Forecaster boleh membalik keputusan naik/turun per rasa.
// Selisihnya (lebih/kurang) diusulkan ke outlet: kelebihan ke outlet yang paling sering habis
// stok, kekurangan diambil dari outlet yang waste-nya paling tinggi; pesanan tidak pernah dikurangi.
// Usulan baru berlaku setelah forecaster menekan "Terapkan".
// MINI OGURA (owner 2026-11-10): 1 angkatan = 90 pcs CAMPURAN 3 rasa dan bisa dipakai beberapa hari
// (dirapel). Jadi dihitung gabungan 3 rasa, selalu dibulatkan NAIK (tidak pernah "tidak diproduksi"),
// dikurangi stok Mini dari produksi sebelumnya; sisanya jadi stok hari berikutnya, tidak dibagi ke outlet.
window.ForecastProduction=(()=>{
 const FAMILIES=[
  {key:'ogura',label:'Ogura',ps:[0,1],size:18},
  {key:'malmil',label:'Malmil',ps:[2,3],size:36},
  {key:'mini',label:'Mini Ogura',ps:[4,5,6],size:90,unit:'10 pax × 9 pcs, campur 3 rasa',combined:true},
  {key:'chiffon',label:'Chiffon Classic',ps:[7,8,9],size:12},
  {key:'lite',label:'Chiffon Lite',ps:[10,11],size:12},
 ];
 const DEFAULT_SIZES=Object.fromEntries(FAMILIES.map(f=>[f.key,f.size]));
 // Box Mini = 9 pcs campur, dianggap 3 cheese + 3 choco + 3 durian (seperti "1 mix" di sheet pesanan).
 const BOX_MINI=[3,3,3];
 function sizes(){const s=window.ForecastSettings?.get?.()?.products?.batch||{};return Object.fromEntries(FAMILIES.map(f=>[f.key,Number.isInteger(s[f.key])&&s[f.key]>0?s[f.key]:f.size]));}
 function families(){const s=sizes();return FAMILIES.map(f=>({...f,size:s[f.key]}));}
 // Ambang pembulatan dari kondisi 28 hari (jaringan).
 function mode(){
  let wl=null;try{wl=window.ForecastDashboard?.recentWasteLost?.(28)||null;}catch{}
  const W=wl?.wasteThreshold??3.5,L=wl?.lostThreshold??4.5,w=wl?.net?.wastePct,l=wl?.net?.lostPct;
  const wh=w!=null&&w>W,lh=l!=null&&l>L,f=n=>n.toLocaleString('id-ID',{maximumFractionDigits:1});
  const facts=[w!=null?`waste ${f(w)}% (ambang ${f(W)}%)`:null,l!=null?`habis stok ${f(l)}% jam buka (ambang ${f(L)}%)`:null].filter(Boolean).join(', ');
  if(wh&&!lh)return {kind:'waste',threshold:.75,title:'Mode hemat waste',text:`28 hari terakhir ${facts}. Dibulatkan naik hanya kalau sisa ≥ 75% angkatan.`};
  if(lh&&!wh)return {kind:'lost',threshold:.25,title:'Mode cegah habis stok',text:`28 hari terakhir ${facts}. Dibulatkan naik kalau sisa ≥ 25% angkatan.`};
  return {kind:wh&&lh?'mix':w==null&&l==null?'nodata':'normal',threshold:.5,title:'Mode normal',text:`${facts?`28 hari terakhir ${facts}. `:''}Dibulatkan ke angkatan terdekat (sisa ≥ 50% naik).`};
 }
 // outlets: [{id, regular[12], orders[12], boxMini}] ; factory: qty[12] ; overrides: {p:'up'|'down'}
 function plan(outlets,factory,overrides={},opts={}){
  const m=mode(),rows=[];
  for(const f of families()){
   if(f.combined){
    const per=f.ps.map(p=>{const regular=outlets.reduce((s,o)=>s+(o.regular[p]||0),0),orders=outlets.reduce((s,o)=>s+(o.orders[p]||0),0),fac=factory?.[p]||0,box=outlets.reduce((s,o)=>s+(o.boxMini||0),0)*BOX_MINI[p-f.ps[0]];return {p,regular,orders,factory:fac,box,total:regular+orders+fac+box};});
    const total=per.reduce((s,x)=>s+x.total,0),stock=Math.max(0,Math.round(Number(opts.miniStock)||0)),need=Math.max(0,total-stock),batches=Math.ceil(need/f.size),target=batches*f.size;
    rows.push({p:null,combined:true,family:f,size:f.size,per,regular:per.reduce((s,x)=>s+x.regular,0),orders:per.reduce((s,x)=>s+x.orders,0),factory:per.reduce((s,x)=>s+x.factory,0),box:per.reduce((s,x)=>s+x.box,0),total,stock,batches,target,leftover:target+stock-total,rem:0,dir:'exact',diff:0});
    continue;
   }
   for(const p of f.ps){
   const regular=outlets.reduce((s,o)=>s+(o.regular[p]||0),0),orders=outlets.reduce((s,o)=>s+(o.orders[p]||0),0),fac=factory?.[p]||0;
   const box=f.key==='mini'?outlets.reduce((s,o)=>s+(o.boxMini||0),0)*BOX_MINI[p-4]:0;
   const total=regular+orders+fac+box,full=Math.floor(total/f.size),rem=total-full*f.size,auto=rem>0&&rem>=f.size*m.threshold?'up':'down';
   const dir=rem?(overrides[p]||auto):'exact',batches=dir==='up'?full+1:full,target=batches*f.size;
   rows.push({p,family:f,size:f.size,regular,orders,factory:fac,box,total,rem,auto,dir,overridden:!!overrides[p]&&overrides[p]!==auto,batches,target,diff:target-total});
   }
  }
  return {mode:m,rows};
 }
 // Usulan per rasa: [{id,delta}] -- metode D'Hondt berbobot supaya pcs tersebar wajar.
 function propose(rows,outlets){
  const out=new Map();
  for(const r of rows){
   if(!r.diff)continue;const add=r.diff>0,n=Math.abs(r.diff),moved=new Map();
   const cand=outlets.map(o=>{const reg=o.regular[r.p]||0,score=add?(o.lostPct||0):(o.wastePct||0);return {id:o.id,reg,w:reg>0?reg*(1+Math.min(score,40)/10):0};}).filter(o=>o.w>0);
   let left=n;
   while(left>0&&cand.length){let best=null,bv=-1;for(const o of cand){const k=moved.get(o.id)||0;if(!add&&k>=o.reg)continue;const v=o.w/(k+1);if(v>bv){bv=v;best=o;}}if(!best)break;moved.set(best.id,(moved.get(best.id)||0)+1);left--;}
   out.set(r.p,{list:[...moved].map(([id,k])=>({id,delta:add?k:-k})).sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta)),unplaced:left*(add?1:-1)});
  }
  return out;
 }
 return {FAMILIES,DEFAULT_SIZES,families,sizes,mode,plan,propose};
})();
