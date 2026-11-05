'use strict';
// Dashboard = halaman yang dilihat tim begitu buka Forecast. Render ulang tiap kali dibuka
// dari data privat yang sedang termuat (bukan janji jadwal tertentu — itu urusan otomasi
// malam ESB). Grafik omzet memakai metodologi yang SAMA dengan forecast-planner-model.js
// (median hari-sama 8 minggu + tren terbatas 0.85-1.15), diterapkan pada deret omzet
// jaringan/outlet langsung — bukan menjumlah 28 forecast per-outlet yang lebih berisik dan
// jauh lebih berat dihitung di browser.
window.ForecastDashboard=(()=>{
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const num=n=>n==null?'—':Math.round(n).toLocaleString('id-ID');
 const moneyShort=n=>n==null?'—':n>=1000000?(n/1000000).toLocaleString('id-ID',{maximumFractionDigits:1})+' jt':Math.round(n/1000).toLocaleString('id-ID')+' rb';
 const money=n=>n==null?'—':'Rp'+num(n);
 const pct=n=>n==null?'—':n.toLocaleString('id-ID',{maximumFractionDigits:1})+'%';
 const months=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
 const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta'}).format(new Date());
 const dayLabel=d=>Number(d.slice(8,10));
 const median=a=>{if(!a.length)return null;const b=[...a].sort((x,y)=>x-y),m=Math.floor(b.length/2);return b.length%2?b[m]:(b[m-1]+b[m])/2;};
 function monthDates(ym){const [y,m]=ym.split('-').map(Number),days=new Date(Date.UTC(y,m,0)).getUTCDate();return Array.from({length:days},(_,i)=>`${ym}-${String(i+1).padStart(2,'0')}`);}
 function addMonth(ym){const [y,m]=ym.split('-').map(Number),d=new Date(Date.UTC(y,m,1));d.setUTCMonth(d.getUTCMonth()+1);return d.toISOString().slice(0,7);}
 function outletIds(outletId,sales){return outletId==='__all__'?(sales?.outletIds||[]):sales?.outletIds?.includes(outletId)?[outletId]:[];}

 function revenueTrend(outletId){
  const panels=window.PcsPanels.data(),planner=window.ForecastPlanner;
  if(!panels.sales||!panels.orders)return null;
  const list=outletIds(outletId,panels.sales),expected=list.length;
  const byDate=new Map();
  for(const row of panels.sales.days){
   if(!list.includes(row.id))continue;
   const e=byDate.get(row.date)||{sum:0,complete:true,count:0};
   if(!row.complete)e.complete=false;else{
    const prices=planner.prices(window.FORECAST_REALIZED_PRICES,row.id,row.date);
    for(let p=0;p<12;p++)if(Number.isFinite(prices[p]?.value))e.sum+=(row.qty[p]||0)*prices[p].value;
   }
   e.count++;byDate.set(row.date,e);
  }
  const actualAt=date=>{const e=byDate.get(date);return e&&e.complete&&e.count===expected?e.sum:null;};
  const series=[...byDate.entries()].filter(([,e])=>e.complete&&e.count===expected).map(([date,e])=>({date,value:e.sum})).sort((a,b)=>a.date.localeCompare(b.date));
  function forecastAt(date){
   const wd=new Date(date+'T12:00:00Z').getUTCDay(),from=planner.shift(date,-56);
   const win=series.filter(r=>r.date>=from&&r.date<date);
   const sameDay=win.filter(r=>new Date(r.date+'T12:00:00Z').getUTCDay()===wd).map(r=>r.value);
   const pool=sameDay.length>=3?sameDay:win.slice(-14).map(r=>r.value);
   if(!pool.length)return null;
   const recent=win.filter(r=>r.date>=planner.shift(date,-14)).map(r=>r.value),prior=win.filter(r=>r.date<planner.shift(date,-14)&&r.date>=planner.shift(date,-28)).map(r=>r.value);
   const a=median(recent),b=median(prior),trend=a!=null&&b>0?Math.max(.85,Math.min(1.15,a/b)):1;
   return median(pool)*trend;
  }
  const t=today(),ym=t.slice(0,7),ymNext=addMonth(ym),dates=[...monthDates(ym),...monthDates(ymNext)];
  const rows=dates.map(date=>({date,actual:actualAt(date),forecast:forecastAt(date)}));
  return {rows,ym,ymNext,today:t,hasHistory:series.length>=14};
 }

 function chart(trend){
  const w=Math.min(1040,Math.max(320,(window.innerWidth||1120)-88)),h=w<600?260:300,pad={l:54,r:16,t:16,b:30};
  const rows=trend.rows,n=rows.length,vals=rows.flatMap(r=>[r.actual,r.forecast]).filter(v=>v!=null),max=Math.max(1,...vals)*1.1;
  const x=i=>pad.l+i*(w-pad.l-pad.r)/Math.max(n-1,1),y=v=>h-pad.b-v/max*(h-pad.t-pad.b);
  let svg='';
  for(let i=0;i<4;i++){const v=max*i/3,yy=y(v);svg+=`<line x1="${pad.l}" x2="${w-pad.r}" y1="${yy}" y2="${yy}" stroke="#e9eef2"/><text x="${pad.l-8}" y="${yy+4}" text-anchor="end" font-size="11">${moneyShort(v)}</text>`;}
  const todayIdx=rows.findIndex(r=>r.date===trend.today);
  if(todayIdx>=0){const xx=x(todayIdx);svg+=`<line x1="${xx}" x2="${xx}" y1="${pad.t}" y2="${h-pad.b}" stroke="#b4772e" stroke-width="1" stroke-dasharray="3 3"/><text x="${xx}" y="${pad.t-2}" text-anchor="middle" font-size="10" fill="#b4772e">Hari ini</text>`;}
  function line(key,color,dash){let d='';rows.forEach((r,i)=>{if(r[key]==null)return;d+=(d?'L':'M')+x(i)+' '+y(r[key])+' ';});return d?`<path d="${d}" fill="none" stroke="${color}" stroke-width="1.8" ${dash?'stroke-dasharray="6 4"':''}/>`:'';}
  svg+=line('actual','#276b96',false)+line('forecast','#b4772e',true);
  rows.forEach((r,i)=>{for(const[key,color]of[['actual','#276b96'],['forecast','#b4772e']])if(r[key]!=null)svg+=`<circle cx="${x(i)}" cy="${y(r[key])}" r="7" fill="transparent" tabindex="0" data-pcs-point="${esc((key==='actual'?'Real':'Prediksi')+' · '+r.date)}" data-pcs-qty="${Math.round(r[key])}"><title>${esc((key==='actual'?'Real':'Prediksi')+' · '+r.date)}: ${money(r[key])}</title></circle>`;});
  const step=Math.max(1,Math.ceil(n/14));rows.forEach((r,i)=>{if(i%step!==0&&i!==n-1)return;svg+=`<text x="${x(i)}" y="${h-10}" text-anchor="middle" font-size="10">${dayLabel(r.date)}${r.date.endsWith('-01')?' '+months[Number(r.date.slice(5,7))-1].slice(0,3):''}</text>`;});
  return `<div class="pcs-chart"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Grafik tren omzet real vs prediksi">${svg}</svg></div><div class="pcs-chart-readout" aria-live="polite">Garis biru = omzet real, garis oranye putus-putus = prediksi. Arahkan untuk lihat angka.</div>`;
 }

 function badges(){
  const perf=window.PERFORMANCE_SUMMARY,period=perf?.latestCompletePeriod;if(!perf||!period)return '';
  const rows=Object.entries(perf.outlets).map(([id,o])=>({id,name:o.name||id,p:o.periods?.[period]})).filter(r=>r.p);
  const waste=[...rows].sort((a,b)=>(b.p.wastePercent||0)-(a.p.wastePercent||0)).slice(0,5);
  const lost=[...rows].sort((a,b)=>(b.p.estimatedLostSalesPercent||0)-(a.p.estimatedLostSalesPercent||0)).slice(0,5);
  const card=(title,list,field,unit)=>`<article class="workspace-card compact-card"><span class="micro-label">${title}</span>${list.map(r=>`<div class="product-line"><b>${esc(r.name)}</b><span>${num(r.p[field])}${unit}</span></div>`).join('')}<p class="workspace-note">${period} · data performa outlet</p></article>`;
  return `<div class="product-comparison">${card('5 OUTLET WASTE TERTINGGI',waste,'wastePercent','%')}${card('5 OUTLET LOST SALES TERTINGGI',lost,'estimatedLostSalesPercent','%')}</div>`;
 }

 async function weatherHighlights(outletId){
  const sales=window.PcsPanels.data().sales;if(!sales)return '';
  const list=outletIds(outletId,sales);if(!list.length)return '';
  const t=today(),tomorrow=window.ForecastPlanner.shift(t,1);
  const map=await window.WeatherForecast.getNetwork(list,t,tomorrow);
  const risky=[];
  for(const [id,w] of map){if(w.error)continue;for(const d of w.days)if(d.probability!=null&&d.probability>=60)risky.push({id,date:d.date,probability:d.probability});}
  if(!risky.length)return '<p class="workspace-note">Tidak ada outlet dengan risiko hujan tinggi hari ini/besok.</p>';
  const name=id=>window.OUTLET_INTELLIGENCE?.outlets?.[id]?.name||id;
  return `<div class="upcoming-line-list">${risky.slice(0,8).map(r=>`<div class="upcoming-line"><b>${esc(name(r.id))}</b><span>${r.date===t?'Hari ini':'Besok'} · hujan ${r.probability}%</span></div>`).join('')}</div>`;
 }

 function eventsSoon(outletId){
  const t=today(),to=window.ForecastPlanner.shift(t,7),events=(window.INSIGHT_DATA?.events||[]).filter(e=>e.end>=t&&e.start<=to);
  if(!events.length)return '<p class="workspace-note">Tidak ada kegiatan terjadwal 7 hari ke depan.</p>';
  return `<div class="upcoming-line-list">${events.slice(0,8).map(e=>`<div class="upcoming-line"><b>${esc(e.title)}</b><span>${esc(e.start)}${e.venue?' · '+esc(e.venue):''}</span></div>`).join('')}</div>`;
 }

 function operationalSummary(outletId){
  const panels=window.PcsPanels.data(),planner=window.ForecastPlanner,cloud=window.ForecastPlanCloud,math=window.PcsMath;
  const list=outletIds(outletId,panels.sales),yesterday=planner.shift(today(),-1);
  let sold=0,retail=0,orders=0;for(const p of [0,1,2,3]){const r=math.estimatedPartition(panels.sales,panels.orders,list,p,[yesterday])[0];sold+=r.total.value||0;retail+=r.retail.value||0;orders+=r.orders.value||0;}
  const from=planner.shift(today(),-56);cloud?.watch?.(from,today());
  const comparisons=(cloud?.records||[]).filter(r=>(outletId==='__all__'||r.outlet===outletId)&&r.date>=from&&r.date<=today()).map(r=>planner.compare(r,panels.sales,panels.orders));
  const valid=comparisons.filter(c=>c.eligible&&c.complete),actual=valid.reduce((s,c)=>s+c.actual,0),wapeA=valid.length&&actual?valid.reduce((s,c)=>s+c.absolute,0)/actual*100:null;
  const validShipped=valid.filter(c=>c.hasShipped),actualShipped=validShipped.reduce((s,c)=>s+c.actual,0),wapeB=validShipped.length&&actualShipped?validShipped.reduce((s,c)=>s+c.absoluteShipped,0)/actualShipped*100:null;
  return `<div class="fp-metrics">
   <article><span>Penjualan kemarin (4 SKU inti)</span><strong>${num(sold)} <small>PCS</small></strong></article>
   <article><span>Penjualan murni</span><strong>${num(retail)} <small>PCS</small></strong></article>
   <article><span>Pesanan</span><strong>${num(orders)} <small>PCS</small></strong></article>
   <article><span>Akurasi A · forecaster murni</span><strong>${pct(wapeA)}</strong><small>${valid.length} rencana, 56 hari</small></article>
   <article><span>Akurasi B · dengan faktor produksi</span><strong>${pct(wapeB)}</strong><small>${validShipped.length} rencana punya data kirim</small></article>
  </div>`;
 }
 let weatherHtml='<p class="workspace-note">Memuat ramalan cuaca…</p>';
 function render(outletId){
  const trend=revenueTrend(outletId);
  if(!trend)return `<div class="workspace-empty">${esc(window.PcsPanels.data().error||'Memuat data penjualan & pesanan…')}</div>`;
  weatherHighlights(outletId).then(html=>{weatherHtml=html;window.dispatchEvent(new Event('forecast-operations-changed'));});
  const monthName=m=>months[Number(m.slice(5,7))-1]+' '+m.slice(0,4);
  return `<div class="focus-intro"><h2>Dashboard</h2><span>${outletId==='__all__'?'Seluruh outlet':''} · ${monthName(trend.ym)} & ${monthName(trend.ymNext)}</span></div>
   <article class="workspace-card pcs-main-chart"><div class="pcs-chart-title"><h3>Tren omzet · ${monthName(trend.ym)} &amp; ${monthName(trend.ymNext)}</h3></div>${trend.hasHistory?chart(trend):'<div class="pcs-chart-empty"><p>Riwayat penjualan belum cukup untuk grafik.</p></div>'}<p class="workspace-note">Prediksi memakai median hari-sama 8 minggu + tren terbatas (metode sama dengan rekomendasi forecast). Produk sekunder (Chiffon/Mini/Lite) termasuk dalam harga per-produk, bukan direka-reka terpisah.</p></article>
   <div class="product-comparison">
    <article class="workspace-card"><span class="micro-label">CUACA HARI INI &amp; BESOK</span>${weatherHtml}</article>
    <article class="workspace-card"><span class="micro-label">KEGIATAN 7 HARI KE DEPAN</span>${eventsSoon(outletId)}</article>
   </div>
   ${operationalSummary(outletId)}
   ${badges()}`;
 }
 return {render};
})();
