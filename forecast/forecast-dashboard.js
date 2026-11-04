'use strict';
// Dashboard otomatis: render ulang dari data privat yang sedang dimuat setiap kali dibuka —
// "otomatis" dalam arti tidak perlu aksi manual, bukan janji jadwal pembaruan tertentu (itu
// tergantung otomasi malam ESB, lihat architecture docs). Tidak mengarang angka yang belum ada
// sumbernya (mis. lost sales PCS) — tampilkan proksi yang tersedia dengan keterangan jujur.
window.ForecastDashboard=(()=>{
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const num=n=>n==null?'—':n.toLocaleString('id-ID',{maximumFractionDigits:0});
 const pct=n=>n==null?'—':n.toLocaleString('id-ID',{maximumFractionDigits:1})+'%';
 const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta'}).format(new Date());
 const CORE=[0,1,2,3]; // Ogura Cheese, Ogura Choco, Malmil Cheese, Malmil Choco
 function outletIds(outletId,sales){return outletId==='__all__'?(sales?.outletIds||[]):sales?.outletIds?.includes(outletId)?[outletId]:[];}
 function render(outletId){
  const panels=window.PcsPanels.data();
  if(!panels.sales||!panels.orders)return `<div class="workspace-empty">${esc(panels.error||'Memuat data penjualan & pesanan…')}</div>`;
  const math=window.PcsMath,planner=window.ForecastPlanner,list=outletIds(outletId,panels.sales),day=planner.shift(today(),-1);
  let sold=0,retail=0,orders=0,complete=true;
  for(const p of CORE){const r=math.estimatedPartition(panels.sales,panels.orders,list,p,[day])[0];if(!r.total.complete)complete=false;sold+=r.total.value||0;retail+=r.retail.value||0;orders+=r.orders.value||0;}
  const cloud=window.ForecastPlanCloud,from=planner.shift(today(),-56);cloud?.watch?.(from,today());
  const records=(cloud?.records||[]).filter(r=>(outletId==='__all__'||r.outlet===outletId)&&r.date>=from&&r.date<=today());
  const comparisons=records.map(r=>planner.compare(r,panels.sales,panels.orders));
  const valid=comparisons.filter(c=>c.eligible&&c.complete),actual=valid.reduce((s,c)=>s+c.actual,0),wapeA=valid.length&&actual?valid.reduce((s,c)=>s+c.absolute,0)/actual*100:null;
  const validShipped=valid.filter(c=>c.hasShipped),actualShipped=validShipped.reduce((s,c)=>s+c.actual,0),wapeB=validShipped.length&&actualShipped?validShipped.reduce((s,c)=>s+c.absoluteShipped,0)/actualShipped*100:null;
  const inv=window.ForecastStudy?.inventory,invMonth=inv?.monthly?.at(-1),invRows=invMonth?.outlets?.filter(o=>outletId==='__all__'||o.id===outletId)||[],minutes=invMonth?invRows.reduce((s,o)=>s+(o.stockoutMinutes||0),0):null;
  return `<div class="focus-intro"><h2>Dashboard</h2><span>${outletId==='__all__'?'Seluruh outlet':''} · diperbarui otomatis saat data privat termuat</span></div>
   <div class="fp-metrics">
    <article><span>Total penjualan kemarin (4 SKU inti)</span><strong>${num(sold)} <small>PCS</small></strong><small>${complete?planner.shift(today(),-1):'Sebagian data belum lengkap'}</small></article>
    <article><span>Penjualan murni (tanpa pesanan)</span><strong>${num(retail)} <small>PCS</small></strong><small>Estimasi pemisahan pesanan</small></article>
    <article><span>Pesanan</span><strong>${num(orders)} <small>PCS</small></strong><small>Estimasi alokasi pesanan</small></article>
    <article><span>Akurasi A · forecaster murni</span><strong>${pct(wapeA)}</strong><small>${valid.length} rencana, 56 hari terakhir</small></article>
    <article><span>Akurasi B · dengan faktor produksi</span><strong>${pct(wapeB)}</strong><small>${validShipped.length} rencana punya data kue real dikirim</small></article>
    <article><span>Kehabisan Malmil/Ogura</span><strong>${minutes==null?'Belum tersedia':num(minutes)+' menit'}</strong><small>${minutes==null?'Riset stok belum diterbitkan ke website ini':'Menit kehabisan, bukan PCS lost sales terukur'}</small></article>
   </div>
   <p class="fp-caption">Dashboard ini agregat dari data yang sama dengan tab Forecast & Data pendukung — bukan sumber data baru. "Kehabisan" adalah proksi dari riset stok, belum membuktikan berapa PCS pelanggan batal membeli.</p>`;
 }
 return {render};
})();
