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
 // ym pakai bulan 1-indeks ("2026-11"). Date.UTC sendiri 0-indeks, jadi Date.UTC(y,m,1) dengan
 // m apa adanya (1-indeks) sudah otomatis jatuh ke bulan BERIKUTNYA — jangan ditambah lagi.
 function addMonth(ym){const [y,m]=ym.split('-').map(Number);return new Date(Date.UTC(y,m,1)).toISOString().slice(0,7);}
 function outletIds(outletId,sales){return outletId==='__all__'?(sales?.outletIds||[]):sales?.outletIds?.includes(outletId)?[outletId]:[];}

 function revenueTrend(outletId){
  const panels=window.PcsPanels.data(),planner=window.ForecastPlanner,cloud=window.ForecastPlanCloud;
  if(!panels.sales||!panels.orders)return null;
  const list=outletIds(outletId,panels.sales),expected=list.length,minOutlets=Math.max(1,Math.ceil(expected*0.7));
  const byDate=new Map();
  for(const row of panels.sales.days){
   if(!list.includes(row.id))continue;
   const e=byDate.get(row.date)||{sum:0,known:0};
   if(row.complete){
    const prices=planner.prices(window.FORECAST_REALIZED_PRICES,row.id,row.date);
    for(let p=0;p<12;p++)if(Number.isFinite(prices[p]?.value))e.sum+=(row.qty[p]||0)*prices[p].value;
    e.known++;
   }
   byDate.set(row.date,e);
  }
  // Omzet real butuh mayoritas outlet lengkap (>=70%), bukan seluruhnya — kalau butuh semua,
  // satu outlet telat lapor saja bisa membuat seluruh hari hilang dari grafik.
  const actualAt=date=>{const e=byDate.get(date);return e&&e.known>=minOutlets?e.sum*(expected/e.known):null;};
  const series=[...byDate.entries()].filter(([,e])=>e.known>=minOutlets).map(([date,e])=>({date,value:e.sum*(expected/e.known)})).sort((a,b)=>a.date.localeCompare(b.date));
  const lastActual=series.at(-1)?.date||null;
  function forecastAt(date){
   const wd=new Date(date+'T12:00:00Z').getUTCDay();
   // Coba 56 hari dulu (konsisten dengan rekomendasi per-outlet); kalau riwayat sekitar
   // tanggal itu tipis (mis. baru beberapa minggu data tersinkron), lebarkan ke 180 hari
   // supaya garis prediksi tidak hilang begitu saja karena jendela terlalu sempit.
   let win=series.filter(r=>r.date>=planner.shift(date,-56)&&r.date<date);
   if(!win.length)win=series.filter(r=>r.date>=planner.shift(date,-180)&&r.date<date);
   if(!win.length)return null;
   const sameDay=win.filter(r=>new Date(r.date+'T12:00:00Z').getUTCDay()===wd).map(r=>r.value);
   const pool=sameDay.length>=3?sameDay:win.slice(-14).map(r=>r.value);
   if(!pool.length)return null;
   const recent=win.filter(r=>r.date>=planner.shift(date,-14)).map(r=>r.value),prior=win.filter(r=>r.date<planner.shift(date,-14)&&r.date>=planner.shift(date,-28)).map(r=>r.value);
   const a=median(recent),b=median(prior),trend=a!=null&&b>0?Math.max(.85,Math.min(1.15,a/b)):1;
   return median(pool)*trend;
  }
  // Rencana forecaster (plan baseline yang disimpan tim), bukan prediksi algoritma — supaya
  // bisa dibandingkan 3 arah: real vs prediksi saya vs rencana tim. Baseline dipakai (bukan
  // revisi terakhir) karena itu forecast asli sebelum tahu hasil penjualan.
  const planAt=(()=>{
   if(!cloud||cloud.state!=='ready')return ()=>null;
   // Rentang gabungan: cukup ke belakang untuk akurasi 56 hari (operationalSummary) dan ke
   // depan sampai akhir bulan berikutnya untuk grafik rencana tim.
   cloud.watch?.(planner.shift(today(),-56),planner.shift(today(),62));
   const byPlanDate=new Map();
   for(const r of cloud.records||[]){
    if(outletId!=='__all__'&&r.outlet!==outletId)continue;
    const prices=r.baseline.prices;let sum=0;
    for(let p=0;p<12;p++)if(r.baseline.active[p]&&Number.isFinite(prices[p]?.value))sum+=(r.baseline.regular[p]+r.baseline.orders[p])*prices[p].value;
    byPlanDate.set(r.date,(byPlanDate.get(r.date)||0)+sum);
   }
   return date=>byPlanDate.has(date)?byPlanDate.get(date):null;
  })();
  const t=today(),ym=t.slice(0,7),ymNext=addMonth(ym),dates=[...monthDates(ym),...monthDates(ymNext)];
  const rows=dates.map(date=>({date,actual:actualAt(date),forecast:forecastAt(date),plan:planAt(date)}));
  return {rows,ym,ymNext,today:t,lastActual,hasHistory:series.length>=14,hasPlan:rows.some(r=>r.plan!=null)};
 }

 function chart(trend){
  const w=Math.min(1040,Math.max(320,(window.innerWidth||1120)-88)),h=w<600?260:300,pad={l:54,r:16,t:16,b:30};
  const rows=trend.rows,n=rows.length,vals=rows.flatMap(r=>[r.actual,r.forecast,r.plan]).filter(v=>v!=null),max=Math.max(1,...vals)*1.1;
  const x=i=>pad.l+i*(w-pad.l-pad.r)/Math.max(n-1,1),y=v=>h-pad.b-v/max*(h-pad.t-pad.b);
  let svg='';
  for(let i=0;i<4;i++){const v=max*i/3,yy=y(v);svg+=`<line x1="${pad.l}" x2="${w-pad.r}" y1="${yy}" y2="${yy}" stroke="#e9eef2"/><text x="${pad.l-8}" y="${yy+4}" text-anchor="end" font-size="11">${moneyShort(v)}</text>`;}
  const todayIdx=rows.findIndex(r=>r.date===trend.today);
  if(todayIdx>=0){const xx=x(todayIdx);svg+=`<line x1="${xx}" x2="${xx}" y1="${pad.t}" y2="${h-pad.b}" stroke="#8a8a8a" stroke-width="1" stroke-dasharray="3 3"/><text x="${xx}" y="${pad.t-2}" text-anchor="middle" font-size="10" fill="#8a8a8a">Hari ini</text>`;}
  const series=[['actual','#276b96',false,'Real'],['forecast','#b4772e',true,'Prediksi'],['plan','#59844f',false,'Rencana tim']];
  function line(key,color,dash){let d='';rows.forEach((r,i)=>{if(r[key]==null)return;d+=(d?'L':'M')+x(i)+' '+y(r[key])+' ';});return d?`<path d="${d}" fill="none" stroke="${color}" stroke-width="1.8" ${dash?'stroke-dasharray="6 4"':''}/>`:'';}
  for(const [key,color,dash] of series)svg+=line(key,color,dash);
  const longDate=d=>Number(d.slice(8,10))+' '+months[Number(d.slice(5,7))-1]+' '+d.slice(0,4);
  rows.forEach((r,i)=>{for(const[key,color,,label]of series)if(r[key]!=null)svg+=`<circle cx="${x(i)}" cy="${y(r[key])}" r="8" fill="transparent" tabindex="0" data-fd-point="${esc(label+' · '+longDate(r.date))}" data-fd-value="${Math.round(r[key])}"><title>${esc(label+' · '+longDate(r.date))}: ${money(r[key])}</title></circle>`;});
  const step=Math.max(1,Math.ceil(n/14));rows.forEach((r,i)=>{if(i%step!==0&&i!==n-1)return;svg+=`<text x="${x(i)}" y="${h-10}" text-anchor="middle" font-size="10">${dayLabel(r.date)}${r.date.endsWith('-01')?' '+months[Number(r.date.slice(5,7))-1].slice(0,3):''}</text>`;});
  const legend=series.filter(([key])=>rows.some(r=>r[key]!=null)).map(([,color,,label])=>`<span><i style="background:${color}"></i>${esc(label)}</span>`).join('');
  return `<div class="pcs-chart"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Grafik tren omzet real vs prediksi vs rencana tim">${svg}</svg></div><div class="pcs-active-legend">${legend}</div><div class="pcs-chart-readout" aria-live="polite">Arahkan atau fokus ke titik untuk lihat tanggal & nominal persis.</div>`;
 }

 function badges(){
  const perf=window.PERFORMANCE_SUMMARY,period=perf?.latestCompletePeriod;if(!perf||!period)return '';
  const rows=Object.entries(perf.outlets).map(([id,o])=>({id,name:o.name||id,p:o.periods?.[period]})).filter(r=>r.p);
  const waste=[...rows].sort((a,b)=>(b.p.wastePercent||0)-(a.p.wastePercent||0)).slice(0,5);
  const lost=[...rows].sort((a,b)=>(b.p.estimatedLostSalesPercent||0)-(a.p.estimatedLostSalesPercent||0)).slice(0,5);
  const card=(title,list,field,unit)=>`<article class="workspace-card compact-card"><span class="micro-label">${title}</span>${list.map(r=>`<div class="product-line"><b>${esc(r.name)}</b><span>${num(r.p[field])}${unit}</span></div>`).join('')}<p class="workspace-note">${period} · data performa outlet</p></article>`;
  return `<div class="product-comparison">${card('5 OUTLET WASTE TERTINGGI',waste,'wastePercent','%')}${card('5 OUTLET LOST SALES TERTINGGI',lost,'estimatedLostSalesPercent','%')}</div>`;
 }

 const SOURCE_NOTE='<p class="fp-caption">Sumber: Open-Meteo (ramalan publik), probabilitas hujan maksimum per hari dari model cuaca — bukan data yang kami karang. Awal musim hujan (November) wajar menunjukkan persentase tinggi di banyak outlet sekaligus karena satu sistem hujan bisa menutupi beberapa outlet yang berdekatan.</p>';
 async function weatherHighlights(outletId){
  const sales=window.PcsPanels.data().sales;if(!sales)return '<p class="workspace-note">Data outlet belum termuat.</p>';
  const list=outletIds(outletId,sales);if(!list.length)return '<p class="workspace-note">Pilih outlet untuk lihat cuaca.</p>';
  const t=today(),tomorrow=window.ForecastPlanner.shift(t,1);
  let map;try{map=await window.WeatherForecast.getNetwork(list,t,tomorrow);}catch{return '<p class="workspace-note">Layanan cuaca belum dapat dihubungi.</p>'+SOURCE_NOTE;}
  const risky=[];
  for(const [id,w] of map){if(w.error)continue;for(const d of w.days)if(d.probability!=null&&d.probability>=60)risky.push({id,date:d.date,probability:d.probability});}
  risky.sort((a,b)=>b.probability-a.probability);
  if(!risky.length)return '<p class="workspace-note">Tidak ada outlet dengan risiko hujan tinggi hari ini/besok.</p>'+SOURCE_NOTE;
  const name=id=>window.OUTLET_INTELLIGENCE?.outlets?.[id]?.name||id;
  return `<div class="upcoming-line-list">${risky.slice(0,8).map(r=>`<div class="upcoming-line"><b>${esc(name(r.id))}</b><span>${r.date===t?'Hari ini':'Besok'} · hujan ${r.probability}%</span></div>`).join('')}</div>${risky.length>8?`<p class="workspace-note">+${risky.length-8} outlet lain berisiko hujan.</p>`:''}${SOURCE_NOTE}`;
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
  const from=planner.shift(today(),-56);
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

 // Cuaca di-fetch SEKALI per outlet+tanggal, bukan setiap render — render() dipanggil ulang
 // begitu cuaca selesai dimuat (untuk menampilkannya), jadi tanpa penjaga key ini akan jadi
 // loop tanpa henti (fetch -> render -> fetch -> ...) dan membuat halaman macet.
 let weatherHtml='<p class="workspace-note">Memuat ramalan cuaca…</p>',weatherKey='';
 function ensureWeather(outletId){
  const key=outletId+'|'+today();
  if(weatherKey===key)return;
  weatherKey=key;weatherHtml='<p class="workspace-note">Memuat ramalan cuaca…</p>';
  weatherHighlights(outletId).then(html=>{if(weatherKey===key){weatherHtml=html;window.dispatchEvent(new Event('forecast-operations-changed'));}});
 }
 function render(outletId){
  const trend=revenueTrend(outletId);
  if(!trend)return `<div class="workspace-empty">${esc(window.PcsPanels.data().error||'Memuat data penjualan & pesanan…')}</div>`;
  ensureWeather(outletId);
  const monthName=m=>months[Number(m.slice(5,7))-1]+' '+m.slice(0,4);
  const cutoff=trend.lastActual?new Date(trend.lastActual+'T12:00:00+07:00').toLocaleDateString('id-ID',{day:'numeric',month:'short'}):null;
  return `<div class="focus-intro"><h2>Dashboard</h2><span>${outletId==='__all__'?'Seluruh outlet':''} · ${monthName(trend.ym)} & ${monthName(trend.ymNext)}</span></div>
   <article class="workspace-card pcs-main-chart"><div class="pcs-chart-title"><h3>Tren omzet · ${monthName(trend.ym)} &amp; ${monthName(trend.ymNext)}</h3></div>${trend.hasHistory?chart(trend):'<div class="pcs-chart-empty"><p>Riwayat penjualan belum cukup untuk grafik.</p></div>'}<p class="workspace-note">${cutoff?`Data penjualan real tersedia s.d. ${cutoff}; setelah itu (termasuk hari yang sudah lewat tapi belum ada datanya) ditampilkan sebagai prediksi.`:'Belum ada data penjualan real yang lengkap untuk periode ini — seluruh garis adalah prediksi.'} Metode: median hari-sama 8 minggu + tren terbatas, sama seperti rekomendasi per-outlet. Produk sekunder (Chiffon/Mini/Lite) ikut terhitung lewat harga per-SKU.${trend.hasPlan?' Rencana tim memakai rencana awal (baseline) yang disimpan forecaster.':''}</p></article>
   <div class="product-comparison">
    <article class="workspace-card"><span class="micro-label">CUACA HARI INI &amp; BESOK</span>${weatherHtml}</article>
    <article class="workspace-card"><span class="micro-label">KEGIATAN 7 HARI KE DEPAN</span>${eventsSoon(outletId)}</article>
   </div>
   ${operationalSummary(outletId)}
   ${badges()}`;
 }
 function inspect(e){const p=e.target.closest('[data-fd-point]');if(!p)return;const box=p.closest('.pcs-main-chart')?.querySelector('.pcs-chart-readout');if(box)box.textContent=p.dataset.fdPoint+': '+money(Number(p.dataset.fdValue));}
 return {render,inspect};
})();
