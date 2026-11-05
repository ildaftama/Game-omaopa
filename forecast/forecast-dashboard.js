'use strict';
// Dashboard = halaman yang dilihat tim begitu buka Forecast. Render ulang tiap kali dibuka
// dari data privat yang sedang termuat (bukan janji jadwal tertentu — itu urusan otomasi
// malam ESB). Grafik omzet dipisah omzet reguler vs pesanan (lihat revenueTrend), tiap
// komponen diprediksi dengan metodologi yang SAMA dengan forecast-planner-model.js (median
// hari-sama + tren terbatas 0.85-1.15 + pola musiman harian), diterapkan pada deret omzet
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
 function monthDates(ym){const [y,m]=ym.split('-').map(Number),days=new Date(Date.UTC(y,m,0)).getUTCDate();return Array.from({length:days},(_,i)=>`${ym}-${String(i+1).padStart(2,'0')}`);}
 // ym pakai bulan 1-indeks ("2026-11"). Date.UTC sendiri 0-indeks, jadi Date.UTC(y,m,1) dengan
 // m apa adanya (1-indeks) sudah otomatis jatuh ke bulan BERIKUTNYA — jangan ditambah lagi.
 function addMonth(ym){const [y,m]=ym.split('-').map(Number);return new Date(Date.UTC(y,m,1)).toISOString().slice(0,7);}
 function outletIds(outletId,sales){return outletId==='__all__'?(sales?.outletIds||[]):sales?.outletIds?.includes(outletId)?[outletId]:[];}
 // planner.prices() sengaja menolak memakai harga rata-rata observasi untuk tanggal SEBELUM
 // periode observasi itu sendiri (source.through<target) -- itu tepat untuk FORECAST (jangan
 // sampai "mengintip" harga yang belum terjadi), tapi SALAH untuk menghitung omzet REAL di
 // masa lalu: tanpa guard itu, hampir seluruh riwayat (semua tanggal sebelum cutoff harga)
 // kehilangan 4 SKU inti (Malmil/Ogura, ~80% omzet) karena hargaNya jadi null. Untuk omzet
 // real, harga rata-rata terbaik yang kita tahu SEKARANG memang yang tepat dipakai, bukan
 // "harga yang berlaku saat itu" yang memang tidak kita punya datanya per hari.
 const PRICE_REFS={4:57000/9,5:57000/9,6:57000/9,7:33000,8:34000,9:34000,10:19000,11:18000};
 const PRICE_KEYS=['Ogura Cheese','Ogura Chocolate','Malmil Cheese','Malmil Chocolate'];
 function actualPrice(source,id,p){
  if(p<4){const v=source?.outlets?.[id]?.[PRICE_KEYS[p]]?.price;return v>0?v:null;}
  return p in PRICE_REFS?PRICE_REFS[p]:null;
 }
 function shiftYearDate(date,deltaYears){const [y,m,d]=date.split('-').map(Number);return `${y+deltaYears}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;}
 // Mesin forecast generik -- dipakai terpisah untuk deret "omzet tanpa pesanan" dan deret
 // "omzet pesanan" (lihat revenueTrend) supaya tiap komponen punya baseline/tren/pola sendiri;
 // pesanan jauh lebih kecil (~3-4% omzet) dan lebih bergelombang daripada omzet reguler.
 function buildEngine(series,planner){
  const valueByDate=new Map(series.map(r=>[r.date,r.value]));
  const lastDate=series.length?series[series.length-1].date:null;
  const baseWin=lastDate?series.filter(r=>r.date>=planner.shift(lastDate,-56)):[];
  const baselineLevel=baseWin.length?planner.quantile(baseWin.map(r=>r.value),.5):null;
  const trendRecent=lastDate?series.filter(r=>r.date>=planner.shift(lastDate,-14)).map(r=>r.value):[],trendPrior=lastDate?series.filter(r=>r.date<planner.shift(lastDate,-14)&&r.date>=planner.shift(lastDate,-28)).map(r=>r.value):[];
  const trendA=planner.quantile(trendRecent,.5),trendB=planner.quantile(trendPrior,.5),trendFactor=trendA!==null&&trendB>0?Math.max(.85,Math.min(1.15,trendA/trendB)):1;
  const wideWin=lastDate?series.filter(r=>r.date>=planner.shift(lastDate,-180)):[],wideMedian=wideWin.length?planner.quantile(wideWin.map(r=>r.value),.5):baselineLevel;
  function weekdayShape(date){
   const wd=new Date(date+'T12:00:00Z').getUTCDay(),sameDay=wideWin.filter(r=>new Date(r.date+'T12:00:00Z').getUTCDay()===wd).map(r=>r.value);
   return sameDay.length>=3&&wideMedian>0?Math.max(.5,Math.min(1.8,planner.quantile(sameDay,.5)/wideMedian)):1;
  }
  // Pola musiman per HARI, bukan per bulan: jendela ±3 hari di sekitar tanggal target TAHUN
  // LALU, dibagi jendela sama di sekitar "hari ini" tahun lalu. Satu rasio per bulan (dipakai
  // sebelumnya) meratakan lonjakan tanggal-tanggal tertentu di akhir tahun (naik tajam lalu
  // turun lagi dalam hitungan hari), bukan kenaikan rata selama sebulan. Jendela harian
  // menangkap bentuk kenaikan itu langsung dari data real, bukan rata-rata satu bulan penuh.
  function windowMedian(centerDate,radius){
   const vals=[];for(let o=-radius;o<=radius;o++){const v=valueByDate.get(planner.shift(centerDate,o));if(v!=null)vals.push(v);}
   return vals.length?planner.quantile(vals,.5):null;
  }
  function seasonalFactor(date){
   if(!lastDate)return 1;
   const t=windowMedian(shiftYearDate(date,-1),3),a=windowMedian(shiftYearDate(lastDate,-1),3);
   if(t==null||a==null||a<=0)return 1;
   return Math.max(.5,Math.min(2.2,t/a));
  }
  function forecastAt(date){return baselineLevel==null?null:baselineLevel*trendFactor*weekdayShape(date)*seasonalFactor(date);}
  return {lastDate,forecastAt};
 }
 function revenueTrend(outletId){
  const panels=window.PcsPanels.data(),planner=window.ForecastPlanner,cloud=window.ForecastPlanCloud,math=window.PcsMath;
  if(!panels.sales||!panels.orders)return null;
  const list=outletIds(outletId,panels.sales),expected=list.length;
  const byDate=new Map();
  for(const row of panels.sales.days){
   if(!list.includes(row.id))continue;
   const e=byDate.get(row.date)||{sum:0,known:0};
   if(row.complete){
    for(let p=0;p<12;p++){const v=actualPrice(window.FORECAST_REALIZED_PRICES,row.id,p);if(v!=null)e.sum+=(row.qty[p]||0)*v;}
    e.known++;
   }
   byDate.set(row.date,e);
  }
  // Tanpa ambang jumlah outlet -- untuk hari yang sudah lewat, ESB adalah sumber kebenaran:
  // kalau laporan outlet itu sudah ditarik dan lengkap, pakai apa adanya. Yang belum tertarik
  // sama sekali (expected>known) di-skala proporsional supaya outlet yang laporannya belum
  // sempat ditarik tidak membuat omzet hari itu kelihatan lebih kecil dari yang sebenarnya.
  const actualAt=date=>{const e=byDate.get(date);return e&&e.known>0?e.sum*(expected/e.known):null;};
  const totalSeries=[...byDate.entries()].filter(([,e])=>e.known>0).map(([date,e])=>({date,value:e.sum*(expected/e.known)})).sort((a,b)=>a.date.localeCompare(b.date));
  const lastActual=totalSeries.at(-1)?.date||null;

  // Pisahkan omzet pesanan dari omzet reguler (hanya 4 SKU inti 0-3 yang punya data pesanan).
  // estimatedPartition() dipanggil SEKALI per produk untuk SELURUH rentang tanggal & outlet
  // sekaligus (bukan per-outlet/per-tanggal) -- itu yang membuatnya cepat (~250ms untuk ~22
  // bulan data), beda dari percobaan awal yang memanggilnya ratusan kali per render.
  const allSalesDates=[...new Set(panels.sales.days.map(r=>r.date))].sort();
  const partsByProduct={};for(const p of [0,1,2,3])partsByProduct[p]=math.estimatedPartition(panels.sales,panels.orders,list,p,allSalesDates);
  const dateIndex=new Map(allSalesDates.map((d,i)=>[d,i]));
  function avgPrice(p){const vals=list.map(id=>actualPrice(window.FORECAST_REALIZED_PRICES,id,p)).filter(v=>v!=null);return vals.length?vals.reduce((s,v)=>s+v,0)/vals.length:null;}
  const pesananPrice=[0,1,2,3].map(avgPrice);
  function pesananRevenueAt(date){
   const i=dateIndex.get(date);if(i==null)return null;
   let sum=0,any=false;
   for(const p of [0,1,2,3]){const o=partsByProduct[p][i].orders;if(o.value==null)continue;const scale=o.valid>0?(expected/o.valid):1;sum+=o.value*scale*(pesananPrice[p]||0);any=true;}
   return any?sum:null;
  }
  const retailSeries=[],pesananSeries=[];
  for(const {date,value:totalVal} of totalSeries){
   const pes=pesananRevenueAt(date);if(pes==null)continue;
   pesananSeries.push({date,value:pes});retailSeries.push({date,value:Math.max(0,totalVal-pes)});
  }
  const actualPesananByDate=new Map(pesananSeries.map(r=>[r.date,r.value]));

  // Pesanan masa depan yang SUDAH tercatat di sheet (dipesan customer lebih dulu) dipakai
  // langsung sebagai angka pasti, bukan ditebak lewat tren -- jauh lebih akurat untuk ~25 hari
  // ke depan yang biasanya sudah ter-input, baru jatuh ke tren untuk tanggal yang belum ada
  // pesanannya sama sekali.
  const coveredSet=new Set(panels.orders.coveredDates||[]),blockedSet=new Set(panels.orders.blockedDates||[]);
  const ordersByKey=new Map(panels.orders.days.map(r=>[r.date+'|'+r.id,r]));
  function knownPesananAt(date){
   if(!coveredSet.has(date)||blockedSet.has(date))return null;
   let sum=0,any=false;
   for(const id of list){const o=ordersByKey.get(date+'|'+id);if(!o)continue;for(const p of [0,1,2,3]){const q=o.qty?.[p];if(Number.isSafeInteger(q)&&q>=0){sum+=q*(pesananPrice[p]||0);any=true;}}}
   return any?sum:null;
  }

  const retailEngine=buildEngine(retailSeries,planner),pesananEngine=buildEngine(pesananSeries,planner);
  const forecastRetailAt=date=>retailEngine.forecastAt(date);
  function forecastPesananAt(date){
   if(lastActual&&date>lastActual){const known=knownPesananAt(date);if(known!=null)return known;}
   return pesananEngine.forecastAt(date);
  }
  function forecastTotalAt(date){
   const r=forecastRetailAt(date),p=forecastPesananAt(date);
   return r==null&&p==null?null:(r||0)+(p||0);
  }

  // Rencana forecaster (plan baseline yang disimpan tim), bukan prediksi algoritma — supaya
  // bisa dibandingkan: real vs prediksi saya vs rencana tim. Baseline dipakai (bukan revisi
  // terakhir) karena itu forecast asli sebelum tahu hasil penjualan.
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
  const rows=dates.map(date=>({date,actualTotal:actualAt(date),actualPesanan:actualPesananByDate.has(date)?actualPesananByDate.get(date):null,forecastRetail:forecastRetailAt(date),forecastTotal:forecastTotalAt(date),plan:planAt(date)}));
  return {rows,ym,ymNext,today:t,lastActual,hasHistory:totalSeries.length>=14,hasPlan:rows.some(r=>r.plan!=null)};
 }

 function chart(trend){
  const w=Math.min(1040,Math.max(320,(window.innerWidth||1120)-88)),h=w<600?260:300,pad={l:54,r:16,t:16,b:30};
  const rows=trend.rows,n=rows.length,vals=rows.flatMap(r=>[r.actualTotal,r.actualPesanan,r.forecastRetail,r.forecastTotal,r.plan]).filter(v=>v!=null),max=Math.max(1,...vals)*1.1;
  const x=i=>pad.l+i*(w-pad.l-pad.r)/Math.max(n-1,1),y=v=>h-pad.b-v/max*(h-pad.t-pad.b);
  let svg='';
  for(let i=0;i<4;i++){const v=max*i/3,yy=y(v);svg+=`<line x1="${pad.l}" x2="${w-pad.r}" y1="${yy}" y2="${yy}" stroke="#e9eef2"/><text x="${pad.l-8}" y="${yy+4}" text-anchor="end" font-size="11">${moneyShort(v)}</text>`;}
  const todayIdx=rows.findIndex(r=>r.date===trend.today);
  if(todayIdx>=0){const xx=x(todayIdx);svg+=`<line x1="${xx}" x2="${xx}" y1="${pad.t}" y2="${h-pad.b}" stroke="#8a8a8a" stroke-width="1" stroke-dasharray="3 3"/><text x="${xx}" y="${pad.t-2}" text-anchor="middle" font-size="10" fill="#8a8a8a">Hari ini</text>`;}
  const series=[['actualTotal','#276b96',false,'Omzet total (real)'],['actualPesanan','#9b59b6',false,'Omzet pesanan (real)'],['forecastRetail','#e08214',true,'Prediksi tanpa pesanan'],['forecastTotal','#c0392b',true,'Prediksi dengan pesanan'],['plan','#2e8b57',false,'Rencana tim']];
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
  const name=id=>window.OUTLET_INTELLIGENCE?.outlets?.[id]?.name||id;
  const byArea={1:[],2:[],3:[]};
  for(const [id,w] of map){
   const area=window.OutletResearchNotes?.area(id);if(!area)continue;
   const d0=w.error?null:w.days.find(d=>d.date===t),d1=w.error?null:w.days.find(d=>d.date===tomorrow);
   byArea[area].push({id,today:d0?.probability??null,tomorrow:d1?.probability??null});
  }
  const sections=[1,2,3].map(n=>{
   const rows=byArea[n],maxP=Math.max(-1,...rows.flatMap(r=>[r.today,r.tomorrow]).filter(v=>v!=null)),risky=rows.filter(r=>(r.today!=null&&r.today>=60)||(r.tomorrow!=null&&r.tomorrow>=60));
   const summary=maxP<0?'Data belum tersedia':maxP>=60?`${risky.length} outlet berisiko hujan (tertinggi ${maxP}%)`:`Aman · tertinggi ${maxP}%`;
   return `<details class="weather-area"><summary><b>${esc(window.OutletResearchNotes.areaName(n))}</b><span class="${maxP>=60?'fp-warning':'fp-ok'}">${esc(summary)}</span></summary><div class="upcoming-line-list">${rows.sort((a,b)=>Math.max(b.today??-1,b.tomorrow??-1)-Math.max(a.today??-1,a.tomorrow??-1)).map(r=>`<div class="upcoming-line"><b>${esc(name(r.id))}</b><span>Hari ini ${r.today==null?'—':r.today+'%'} · Besok ${r.tomorrow==null?'—':r.tomorrow+'%'}</span></div>`).join('')}</div></details>`;
  });
  return sections.join('')+SOURCE_NOTE;
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
   <article class="workspace-card pcs-main-chart"><div class="pcs-chart-title"><h3>Tren omzet · ${monthName(trend.ym)} &amp; ${monthName(trend.ymNext)}</h3></div>${trend.hasHistory?chart(trend):'<div class="pcs-chart-empty"><p>Riwayat penjualan belum cukup untuk grafik.</p></div>'}<p class="workspace-note">${cutoff?`Data penjualan real tersedia s.d. ${cutoff}; setelah itu (termasuk hari yang sudah lewat tapi belum ada datanya) ditampilkan sebagai prediksi.`:'Belum ada data penjualan real yang lengkap untuk periode ini — seluruh garis adalah prediksi.'} Omzet pesanan dipisah dari omzet reguler (4 SKU inti) lewat rekonsiliasi sheet pesanan vs ESB. Prediksi tanpa pesanan: level 56 hari terakhir × tren jangka pendek × pola hari-dalam-minggu (180 hari) × pola musiman HARIAN (bentuk kenaikan tanggal yang sama tahun lalu, bukan rata-rata satu bulan). Prediksi pesanan memakai pesanan yang sudah tercatat di sheet untuk ~25 hari ke depan; tanggal yang belum ada pesanannya memakai tren yang sama. Prediksi dengan pesanan = jumlah keduanya.${trend.hasPlan?' Rencana tim memakai rencana awal (baseline) yang disimpan forecaster.':''}</p></article>
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
