'use strict';
(function(root){
 const math=typeof module!=='undefined'&&module.exports?require('./pcs-math.js'):root.PcsMath;
 // HPP outlet per produk inti (Input Harga Jual Pabrik, owner 2026-11-13). Urutan = names.
 const HPP_FALLBACK=[20500,19800,8800,8500,3500,3500,3500,22576,23800,24000,13500,12000];
 const hppNow=()=>{try{const h=globalThis.ForecastProducts?.hpp?.();return Array.isArray(h)&&h.length===12?h:HPP_FALLBACK;}catch{return HPP_FALLBACK;}};
 const names=['Ogura Cheese','Ogura Choco','Malmil Cheese','Malmil Choco','Mini Cheese','Mini Choco','Mini Durian','Chiffon Classic Keju','Chiffon Classic Ekstra Keju','Chiffon Butter','Lite Ekstra Keju','Lite Keju'];
 const integer=n=>Number.isSafeInteger(n)&&n>=0&&n<=10000;
 const day=s=>new Date(s+'T12:00:00Z');
 const shift=(s,n)=>{const d=day(s);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
 const quantile=(a,p)=>{const b=[...a].sort((x,y)=>x-y),i=(b.length-1)*p,l=Math.floor(i);return b.length?b[l]+(b[Math.ceil(i)]-b[l])*(i-l):null;};
 const total=a=>a.reduce((s,n)=>s+n,0);
 const indices=new WeakMap();
 function scoped(source,id,from,to){if(!source)return {days:[]};let index=indices.get(source);if(!index){index=new Map();for(const r of source.days||[]){if(!index.has(r.id))index.set(r.id,[]);index.get(r.id).push(r);}indices.set(source,index);}return {...source,days:(index.get(id)||[]).filter(r=>r.date>=from&&r.date<=to)};}
 function recommend(sales,orders,id,target){
  const snapshot=root.ForecastStudy?.recommendations;
  if(snapshot){const i=snapshot.ids.indexOf(id),qty=snapshot.dates[target]?.[i];return names.map((name,p)=>{const central=qty?.[p]??null,delta=central===null?null:Math.max(1,Math.ceil(central*snapshot.tolerance));return {name,central,low:central===null?null:Math.max(0,central-delta),high:central===null?null:central+delta,samples:0,through:snapshot.through,estimated:true,method:snapshot.method,tolerance:true,uncertainty80Pcs:snapshot.validationAbsolute80Pcs[p]};});}

  sales=scoped(sales,id,shift(target,-112),shift(target,-1));orders=scoped(orders,id,shift(target,-112),shift(target,-1));
  const from=shift(target,-56),dates=[...new Set((sales?.days||[]).filter(r=>r.id===id&&r.date>=from&&r.date<target).map(r=>r.date))].sort();
  return names.map((name,p)=>{
   const rows=math.estimatedPartition(sales,orders,[id],p,dates).map(r=>r.retail).filter(r=>r.complete);
   const same=rows.filter(r=>day(r.date).getUTCDay()===day(target).getUTCDay());
   const selected=same.length>=3?same:rows.slice(-14),values=selected.map(r=>r.value);
   if(!values.length)return {name,low:null,high:null,central:null,samples:0,through:null,estimated:true};
   const recent=rows.filter(r=>r.date>=shift(target,-14)).map(r=>r.value),prior=rows.filter(r=>r.date<shift(target,-14)&&r.date>=shift(target,-28)).map(r=>r.value);
   const a=quantile(recent,.5),b=quantile(prior,.5),trend=a!==null&&b>0?Math.max(.85,Math.min(1.15,a/b)):1;
   const central=Math.round(quantile(values,.5)*trend),low=Math.max(0,Math.floor(Math.min(central,quantile(values,.2)*trend))),high=Math.max(central,Math.ceil(quantile(values,.8)*trend));
   return {name,low,high,central,samples:values.length,through:rows.at(-1).date,estimated:selected.some(r=>r.estimated),fallback:same.length<3};
  });
 }
 function prices(source,id,target){
  const refs={4:57000/9,5:57000/9,6:57000/9,7:33000,8:34000,9:34000,10:19000,11:18000};
  const keys=['Ogura Cheese','Ogura Chocolate','Malmil Cheese','Malmil Chocolate'];
  return names.map((name,p)=>{const observed=source?.outlets?.[id]?.[keys[p]];
   if(p<4&&observed?.price>0&&source.through<target)return {value:observed.price,method:'observed',period:source.period,through:source.through,stale:shift(source.through,45)<target};
   return p in refs?{value:refs[p],method:'reference',period:'Harga acuan',through:null,stale:false}:{value:null,method:'missing',period:'Belum tersedia',through:null,stale:false};
  });
 }
 function calculate(draft,recs,valuation){
  const rows=names.map((name,p)=>{const active=draft.active[p],a=draft.regular[p],b=draft.orders[p],regular=a===''?null:Number(a),orders=b===''?null:Number(b),valid=!active||(integer(regular)&&integer(orders)),r=recs[p];
   return {p,name,active,valid,regular:active?regular:0,orders:active?orders:0,total:valid&&active?regular+orders:0,warning:active&&integer(regular)&&r?.low!=null?(regular<r.low?'low':regular>r.high?'high':null):null};
  });
  // Custom kue types (manual-only, no pipeline recommendation/buffer). Blank names are
  // ignored rather than blocking the save.
  const customItems=(draft.customItems||[]).map((it,i)=>{const name=String(it?.name||'').trim(),a=it?.regular,b=it?.orders,regular=a===''?null:Number(a),orders=b===''?null:Number(b),valid=!name||(integer(regular)&&integer(orders));
   return {i,name,valid,regular:name&&integer(regular)?regular:0,orders:name&&integer(orders)?orders:0,total:name&&valid?(integer(regular)?regular:0)+(integer(orders)?orders:0):0};
  });
  const active=rows.filter(r=>r.active),complete=active.length>0&&active.every(r=>r.valid)&&customItems.every(c=>c.valid),priced=active.every(r=>Number.isFinite(valuation[r.p]?.value)&&valuation[r.p].value>0);
  return {rows,customItems,complete,regular:complete?total(rows.map(r=>r.regular))+total(customItems.map(c=>c.regular)):null,orders:complete?total(rows.map(r=>r.orders))+total(customItems.map(c=>c.orders)):null,pcs:complete?total(rows.map(r=>r.total))+total(customItems.map(c=>c.total)):null,revenue:complete&&priced?total(rows.map(r=>r.active?r.total*valuation[r.p].value:0)):null,warnings:rows.filter(r=>r.warning).length};
 }
 function compare(record,sales,orders,shipped){
  sales=scoped(sales,record.outlet,shift(record.date,-56),record.date);orders=scoped(orders,record.outlet,shift(record.date,-56),record.date);
  const plan=record.baseline,first=record.firstSavedAt?.toDate?record.firstSavedAt.toDate():new Date(record.firstSavedAt),eligible=Number.isFinite(+first)&&first<new Date(record.date+'T00:00:00+07:00');
  // Inactive variants are zero forecasts, not permission to omit their actual sales.
  // shipped (if given) swaps the predicted side for "akurasi dengan faktor produksi" (feature
  // #6) without touching the immutable plan/baseline used for the regular comparison.
  const rows=names.map((name,p)=>{const r=math.estimatedPartition(sales,orders,[record.outlet],p,[record.date])[0];return{p,name,planned:plan.active[p]?plan.regular[p]:0,shipped:shipped?plan.active[p]?shipped[p]:0:null,actual:r.retail.value,totalActual:r.total.value,estimated:r.retail.estimated,complete:r.retail.complete};});
  const complete=rows.length>0&&rows.every(r=>r.complete),actual=complete?total(rows.map(r=>r.actual)):null,actualTotal=complete?total(rows.map(r=>r.totalActual)):null,planned=total(rows.map(r=>r.planned)),absolute=complete?total(rows.map(r=>Math.abs(r.planned-r.actual))):null;
  const hasShipped=!!shipped,shippedTotal=hasShipped?total(rows.map(r=>r.shipped)):null,absoluteShipped=hasShipped&&complete?total(rows.map(r=>Math.abs(r.shipped-r.actual))):null;
  // Waste = kue dikirim tapi tidak laku sama sekali (reguler maupun pesanan) -- bukan selisih
  // forecast vs penjualan (itu akurasi). Dijepit ke 0: kirim < total laku berarti data
  // realisasi kirim yang diisi manual belum tepat, bukan "waste negatif".
  const wasteTotal=hasShipped&&complete?total(rows.map(r=>Math.max(0,r.shipped-r.totalActual))):null;
  // ESTIMASI waste dari rencana (owner 2026-11-13): versi rencana TERAKHIR (yang benar2 dipakai
  // Rincian kirim) reguler+pesanan vs total terjual (reguler+pesanan) per produk inti, x harga
  // di rencana. TANPA transfer antar outlet -- di lapangan kelebihan bisa dipindah ke outlet
  // yang kekurangan, jadi waste real biasanya lebih kecil. Persen = nominal / omzet terjual
  // (rumus sama dengan waste% tim).
  // Nominal waste pakai HPP outlet (harga jual pabrik ke outlet, owner 2026-11-13), bukan harga jual
  // ke pelanggan. Persen tetap dibagi omzet terjual (harga jual), sama dengan waste% tim.
  const HPP=hppNow();
  const sent=Array.isArray(record.plan?.active)&&Array.isArray(record.plan?.regular)?record.plan:plan,est=complete?names.map((_,p)=>{const out=sent.active[p]?(sent.regular[p]||0)+(sent.orders[p]||0):0,sold=rows[p].totalActual||0,v=Number(sent.prices?.[p]?.value)||0;return {out,sold,v,h:HPP[p],w:Math.max(0,out-sold)};}):null;
  const estWastePcs=est?total(est.map(e=>e.w)):null,estWasteValue=est?est.reduce((s,e)=>s+e.w*e.h,0):null,soldValue=est?est.reduce((s,e)=>s+e.sold*e.v,0):null;
  return {est,estWastePcs,estWasteValue,soldValue,estWastePercent:soldValue>0?estWasteValue/soldValue*100:null,rows,eligible,complete,actual,actualTotal,planned,absolute,wape:eligible&&complete&&actual>0?absolute/actual*100:null,hasShipped,shippedTotal,absoluteShipped,wapeShipped:hasShipped&&eligible&&complete&&actual>0?absoluteShipped/actual*100:null,wasteTotal,wastePercent:wasteTotal!=null&&shippedTotal>0?wasteTotal/shippedTotal*100:null};
 }
 function validCustomItems(a){return a===undefined||(Array.isArray(a)&&a.length<=20&&a.every(it=>it&&typeof it.name==='string'&&it.name.length>=1&&it.name.length<=60&&integer(it.regular)&&integer(it.orders)));}
 function validPlan(p){return p&&/^\d{4}-\d{2}-\d{2}$/.test(p.date)&&typeof p.outlet==='string'&&Array.isArray(p.active)&&p.active.length===12&&p.active.every(v=>typeof v==='boolean')&&['regular','orders'].every(k=>Array.isArray(p[k])&&p[k].length===12&&p[k].every(integer))&&Array.isArray(p.prices)&&p.prices.length===12&&p.prices.every(v=>v&&(v.value===null||(Number.isFinite(v.value)&&v.value>0)))&&typeof p.note==='string'&&validCustomItems(p.customItems);}
 function validShipped(a){return Array.isArray(a)&&a.length===12&&a.every(integer);}
 // ---- Saran dinamis dari PERFORMA RENCANA FORECASTER (owner 2026-11-13) ----
 // Acuan kedua selain pola penjualan: rencana tim yang sudah dikirim vs yang benar2 terjual,
 // per outlet x produk, 28 hari terakhir sebelum tanggal target. Kalau suatu produk di suatu
 // outlet terus bersisa (lebih), saran berikutnya DITURUNKAN dan rentangnya digeser ke bawah
 // (sisi minus lebih lebar, sisi plus menyempit). Kalau sering kurang (terjual > kirim, berarti
 // dapat transfer/habis), saran dinaikkan sedikit -- dibatasi lebih kecil karena penjualan
 // tertahan stok. Bobot naik dengan jumlah hari (n/(n+4)), minimal 3 hari data.
 const PERF_DAYS=28,PERF_MIN=3,PERF_TARGET=.03,PERF_CUT=.30,PERF_ADD=.12;
 const perfCache=new Map();
 function cmpCached(r,sales,orders){const k=r.key+'|'+r.revision+'|'+(sales?.days?.length||0)+'|'+(orders?.days?.length||0);let c=perfCache.get(k);if(!c){c=compare(r,sales,orders);if(perfCache.size>5000)perfCache.clear();perfCache.set(k,c);}return c;}
 function planPerformance(records,sales,orders,id,target){
  const from=shift(target,-PERF_DAYS),acc=names.map(()=>({out:0,sold:0,over:0,under:0,n:0}));let days=0;
  for(const r of records||[]){if(r.outlet!==id||r.date<from||r.date>=target)continue;const c=cmpCached(r,sales,orders);if(!c.est)continue;days++;
   c.est.forEach((e,p)=>{if(!e.out&&!e.sold)return;const a=acc[p];a.out+=e.out;a.sold+=e.sold;a.over+=Math.max(0,e.out-e.sold);a.under+=Math.max(0,e.sold-e.out);a.n++;});}
  return acc.map(a=>{
   if(a.n<PERF_MIN||!(a.out>0))return {...a,f:1,skew:0,days};
   const wasteRate=a.over/a.out,shortRate=a.under/Math.max(1,a.sold),net=wasteRate-PERF_TARGET-shortRate,k=a.n/(a.n+4);
   const f=Math.max(1-PERF_CUT,Math.min(1+PERF_ADD,1-k*net*.8)),skew=Math.max(-.4,Math.min(.5,k*net*1.5));
   return {...a,f,skew,wasteRate,shortRate,days};
  });
 }
 // Terapkan ke hasil recommend(): titik tengah dikali f, rentang digeser (skew>0 = condong turun).
 function applyPerformance(recs,perf){
  if(!perf)return recs;
  return recs.map((r,p)=>{const q=perf[p];if(!q||r.central==null||(q.f===1&&!q.skew))return r;
   const c0=r.central,dl=Math.max(1,c0-r.low),dh=Math.max(1,r.high-c0),c=c0*q.f;
   const central=Math.max(0,Math.round(c)),low=Math.max(0,Math.floor(c-dl*(1+q.skew))),high=Math.max(central,Math.ceil(c+dh*(1-q.skew)));
   return {...r,central,low:Math.min(low,central),high,perf:{f:q.f,skew:q.skew,n:q.n,out:q.out,sold:q.sold,over:q.over,under:q.under,base:{central:c0,low:r.low,high:r.high}}};});
 }
 function recommendWithPerformance(sales,orders,id,target,records){return applyPerformance(recommend(sales,orders,id,target),planPerformance(records,sales,orders,id,target));}
 const api={names,integer,shift,quantile,recommend,recommendWithPerformance,planPerformance,applyPerformance,prices,calculate,compare,validPlan,validShipped};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ForecastPlanner=api;
})(typeof window!=='undefined'?window:this);
