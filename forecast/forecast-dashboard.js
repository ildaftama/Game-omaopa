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
 // Harga Roti dari owner (2026-11-05): Sosis 6500, Abon 7000, Coklat 6000; rasa baru yang
 // belum launching (Pisang Coklat/Coklat Keju/Vanilla) 6000 masing-masing. Varian bundling
 // ("Bundling Roti Manis - X") dijual Rp5000 tapi dipetakan ke PRODUK YANG SAMA (lihat
 // pcs-sales.mjs sku()) -- harga acuan di sini dibiarkan harga normal, sama seperti rata-rata
 // box Mini (57000/9) yang juga sudah memakai satu harga acuan walau ada variasi per transaksi.
 const PRICE_REFS={4:57000/9,5:57000/9,6:57000/9,7:33000,8:34000,9:34000,10:19000,11:18000,12:6500,13:7000,14:6000,15:6000,16:6000,17:6000};
 const PRICE_KEYS=['Ogura Cheese','Ogura Chocolate','Malmil Cheese','Malmil Chocolate'];
 const PRODUCT_COUNT=18;
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
  return {lastDate,baselineLevel,forecastAt};
 }
 // PENTING: row.netSales (dari summarize() di pcs-sales.mjs, dipaketkan 2026-11-06) SEMENTARA
 // TIDAK dipakai di sini -- hasil backfill langsung dibandingkan ke ERP dan angkanya malah LEBIH
 // RENDAH dari rekonstruksi PCS x harga (mis. Boyolali 5 Nov: 538.300 vs seharusnya ~714.300
 // menurut laporan "Daily Sales Summary By Branch"), jadi netSales dari sales-menu-cogs ternyata
 // BELUM terbukti benar -- kemungkinan ada baris yang salah ditangani (PACKAGE_COMPONENT, atau
 // showMenuPackage=0 menyembunyikan sebagian baris). Diamkan dulu field-nya (tetap dihitung &
 // disimpan, tidak dihapus) sampai diverifikasi ulang dengan akses ESB langsung -- Dashboard
 // tetap pakai rekonstruksi PCS x harga (pola lama, dipahami, tidak sempurna tapi tidak salah
 // arah) supaya tidak menampilkan angka yang malah lebih salah daripada sebelumnya.
 function revenueTrend(outletId){
  const panels=window.PcsPanels.data(),planner=window.ForecastPlanner,cloud=window.ForecastPlanCloud,math=window.PcsMath;
  if(!panels.sales||!panels.orders)return null;
  const list=outletIds(outletId,panels.sales),expected=list.length;
  const byDate=new Map();
  for(const row of panels.sales.days){
   if(!list.includes(row.id))continue;
   const e=byDate.get(row.date)||{sum:0,known:0};
   if(row.complete){
    for(let p=0;p<PRODUCT_COUNT;p++){const v=actualPrice(window.FORECAST_REALIZED_PRICES,row.id,p);if(v!=null)e.sum+=(row.qty[p]||0)*v;}
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

  // Pisahkan omzet pesanan dari omzet reguler. PESANAN_PRODUCTS = 4 SKU inti (Ogura/Malmil,
  // 0-3) + Chiffon (7-9) -- Chiffon sering dipesan juga, owner konfirmasi 2026-11-06. Mesin
  // rekomendasi forecast (recommend()/compare() di forecast-planner-model.js) SUDAH memakai
  // estimatedPartition() untuk SEMUA 12 SKU inti sejak awal (bukan cuma 0-3), jadi perluasan
  // di sini TIDAK perlu perubahan apa pun di mesin prediksi -- murni memperluas cakupan grafik
  // omzet murni/pesanan ini saja ke produk yang sama yang sudah dipakai di tempat lain.
  // estimatedPartition() dipanggil SEKALI per produk untuk SELURUH rentang tanggal & outlet
  // sekaligus (bukan per-outlet/per-tanggal) -- itu yang membuatnya cepat (~250ms untuk ~22
  // bulan data), beda dari percobaan awal yang memanggilnya ratusan kali per render.
  const PESANAN_PRODUCTS=[0,1,2,3,7,8,9];
  const allSalesDates=[...new Set(panels.sales.days.map(r=>r.date))].sort();
  const partsByProduct={};for(const p of PESANAN_PRODUCTS)partsByProduct[p]=math.estimatedPartition(panels.sales,panels.orders,list,p,allSalesDates);
  const dateIndex=new Map(allSalesDates.map((d,i)=>[d,i]));
  function avgPrice(p){const vals=list.map(id=>actualPrice(window.FORECAST_REALIZED_PRICES,id,p)).filter(v=>v!=null);return vals.length?vals.reduce((s,v)=>s+v,0)/vals.length:null;}
  const pesananPrice=Object.fromEntries(PESANAN_PRODUCTS.map(p=>[p,avgPrice(p)]));
  function pesananRevenueAt(date){
   const i=dateIndex.get(date);if(i==null)return null;
   let sum=0,any=false;
   for(const p of PESANAN_PRODUCTS){const o=partsByProduct[p][i].orders;if(o.value==null)continue;const scale=o.valid>0?(expected/o.valid):1;sum+=o.value*scale*(pesananPrice[p]||0);any=true;}
   return any?sum:null;
  }
  const pureSeries=[],pesananSeries=[];
  for(const {date,value:totalVal} of totalSeries){
   const pes=pesananRevenueAt(date);if(pes==null)continue;
   pesananSeries.push({date,value:pes});pureSeries.push({date,value:Math.max(0,totalVal-pes)});
  }
  const actualPureByDate=new Map(pureSeries.map(r=>[r.date,r.value])),actualPesananByDate=new Map(pesananSeries.map(r=>[r.date,r.value]));

  // Pesanan masa depan yang SUDAH tercatat di sheet (dipesan customer lebih dulu) dipakai
  // langsung sebagai angka pasti, bukan ditebak lewat tren -- seberapa jauh ke depan ini
  // berlaku mengikuti sejauh mana sheet sudah terisi, baru jatuh ke tren untuk tanggal yang
  // belum ada pesanannya sama sekali.
  const coveredSet=new Set(panels.orders.coveredDates||[]),blockedSet=new Set(panels.orders.blockedDates||[]);
  const ordersByKey=new Map(panels.orders.days.map(r=>[r.date+'|'+r.id,r]));
  function knownPesananAt(date){
   if(!coveredSet.has(date)||blockedSet.has(date))return null;
   let sum=0,any=false;
   for(const id of list){const o=ordersByKey.get(date+'|'+id);if(!o)continue;for(const p of PESANAN_PRODUCTS){const q=o.qty?.[p];if(Number.isSafeInteger(q)&&q>=0){sum+=q*(pesananPrice[p]||0);any=true;}}}
   return any?sum:null;
  }

  const pureEngine=buildEngine(pureSeries,planner),pesananEngine=buildEngine(pesananSeries,planner);
  const forecastPureAt=date=>pureEngine.forecastAt(date);
  function forecastPesananAt(date){
   if(lastActual&&date>lastActual){const known=knownPesananAt(date);if(known!=null)return known;}
   return pesananEngine.forecastAt(date);
  }
  function forecastTotalAt(date){
   const r=forecastPureAt(date),p=forecastPesananAt(date);
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
  const rows=dates.map(date=>({date,actualPure:actualPureByDate.has(date)?actualPureByDate.get(date):null,actualTotal:actualAt(date),actualPesanan:actualPesananByDate.has(date)?actualPesananByDate.get(date):null,forecastPure:forecastPureAt(date),forecastTotal:forecastTotalAt(date),plan:planAt(date)}));
  // Satu angka ringkas pengganti paragraf metodologi: berapa persen pesanan biasanya menambah
  // omzet murni, dipakai sebagai catatan singkat di bawah grafik.
  const pesananUpliftPct=pureEngine.baselineLevel>0&&pesananEngine.baselineLevel!=null?pesananEngine.baselineLevel/pureEngine.baselineLevel*100:null;
  return {rows,ym,ymNext,today:t,lastActual,hasHistory:totalSeries.length>=14,hasPlan:rows.some(r=>r.plan!=null),pesananUpliftPct};
 }

 // actualTotal/forecastTotal/plan = garis utama (tebal, warna pekat, selalu tampil default).
 // Variannya (actualPure/forecastPure/actualPesanan) = elemen kelima "secondary":true --
 // digambar lebih tipis & agak transnamun DI BAWAH garis utama, supaya saat berpotongan garis
 // utama tetap terbaca jelas. Off secara default (baru 2-3 garis, bukan 6 sekaligus); nyalakan
 // lewat legend kalau mau lihat rinciannya. State tampilan tersimpan per perangkat.
 // Garis "secondary" (murni/pesanan) dibuat putus-putus (dash) MESKI bukan garis prediksi --
 // nilainya sering sangat dekat dengan garis utamanya (pesanan biasanya hanya beberapa persen
 // dari total), jadi kalau cuma dibedakan lewat opacity/ketebalan, garis itu praktis tertutup
 // total oleh garis utama yang solid di atasnya dan terlihat seperti tidak muncul sama sekali
 // walau datanya ada (dan checkbox-nya sudah aktif). Pola putus-putus tetap kelihatan jelas
 // walau dua garis berhimpit persis, beda dari sekadar transparansi.
 const SERIES=[
  ['actualTotal','#1f4e79',false,'Omzet real',false],
  ['actualPure','#5aa7d6',true,'Omzet murni',true],
  ['actualPesanan','#9b59b6',true,'Omzet pesanan',true],
  ['forecastTotal','#c0392b',true,'Prediksi',false],
  ['forecastPure','#e08b3f',true,'Prediksi murni',true],
  ['plan','#2e8b57',false,'Rencana tim',false],
 ];
 const HIDDEN_KEY='forecast-dashboard-hidden-series',DEFAULT_HIDDEN=['actualPure','actualPesanan','forecastPure'];
 function loadHidden(){try{const raw=localStorage.getItem(HIDDEN_KEY);return raw?new Set(JSON.parse(raw)):new Set(DEFAULT_HIDDEN);}catch{return new Set(DEFAULT_HIDDEN);}}
 function saveHidden(set){try{localStorage.setItem(HIDDEN_KEY,JSON.stringify([...set]));}catch{}}
 let hidden=loadHidden(),lastTrend=null;
 function chart(trend){
  const rows=trend.rows,n=rows.length;
  const active=SERIES.filter(([key])=>rows.some(r=>r[key]!=null));
  const visible=active.filter(([key])=>!hidden.has(key));
  const drawOrder=[...visible].sort((a,b)=>(a[4]===b[4]?0:a[4]?-1:1)); // secondary dulu (di bawah), utama belakangan (di atas)
  const w=Math.min(1500,Math.max(320,(window.innerWidth||1120)-88)),h=w<600?260:w<900?300:340,pad={l:54,r:16,t:16,b:30};
  const vals=rows.flatMap(r=>visible.map(([key])=>r[key])).filter(v=>v!=null),max=Math.max(1,...vals)*1.1;
  const x=i=>pad.l+i*(w-pad.l-pad.r)/Math.max(n-1,1),y=v=>h-pad.b-v/max*(h-pad.t-pad.b);
  let svg='';
  for(let i=0;i<4;i++){const v=max*i/3,yy=y(v);svg+=`<line x1="${pad.l}" x2="${w-pad.r}" y1="${yy}" y2="${yy}" stroke="#e9eef2"/><text x="${pad.l-8}" y="${yy+4}" text-anchor="end" font-size="11">${moneyShort(v)}</text>`;}
  const todayIdx=rows.findIndex(r=>r.date===trend.today);
  if(todayIdx>=0){const xx=x(todayIdx);svg+=`<line x1="${xx}" x2="${xx}" y1="${pad.t}" y2="${h-pad.b}" stroke="#8a8a8a" stroke-width="1" stroke-dasharray="3 3"/><text x="${xx}" y="${pad.t-2}" text-anchor="middle" font-size="10" fill="#8a8a8a">Hari ini</text>`;}
  function line(key,color,dash,secondary){let d='';rows.forEach((r,i)=>{if(r[key]==null)return;d+=(d?'L':'M')+x(i)+' '+y(r[key])+' ';});return d?`<path d="${d}" fill="none" stroke="${color}" stroke-width="${secondary?1.1:1.5}" opacity="${secondary?.85:.9}" ${dash?'stroke-dasharray="5 4"':''} stroke-linecap="round" stroke-linejoin="round"/>`:'';}
  for(const [key,color,dash,,secondary] of drawOrder)svg+=line(key,color,dash,secondary);
  const longDate=d=>Number(d.slice(8,10))+' '+months[Number(d.slice(5,7))-1]+' '+d.slice(0,4);
  rows.forEach((r,i)=>{for(const[key,color,,label,secondary]of drawOrder)if(r[key]!=null)svg+=`<circle cx="${x(i)}" cy="${y(r[key])}" r="${secondary?1.7:2.2}" fill="${color}" opacity="${secondary?.85:.9}" stroke="#fff" stroke-width="1"/><circle cx="${x(i)}" cy="${y(r[key])}" r="8" fill="transparent" tabindex="0" data-fd-point="${esc(label+' · '+longDate(r.date))}" data-fd-value="${Math.round(r[key])}"/>`;});
  const step=Math.max(1,Math.ceil(n/14));rows.forEach((r,i)=>{if(i%step!==0&&i!==n-1)return;svg+=`<text x="${x(i)}" y="${h-10}" text-anchor="middle" font-size="10">${dayLabel(r.date)}${r.date.endsWith('-01')?' '+months[Number(r.date.slice(5,7))-1].slice(0,3):''}</text>`;});
  const legend=active.map(([key,color,dash,label])=>`<label class="${hidden.has(key)?'off':'on'}"><input type="checkbox" data-fd-toggle="${key}" ${hidden.has(key)?'':'checked'}><i class="${dash?'dashed':''}" style="border-color:${color}"></i>${esc(label)}</label>`).join('');
  return `<div class="pcs-chart fd-chart-wrap"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Grafik tren omzet real vs prediksi vs rencana tim">${svg}</svg><div class="fd-tooltip" hidden></div></div><div class="fd-legend">${legend}</div><div class="pcs-chart-readout" aria-live="polite">Arahkan atau sentuh titik untuk lihat nominal langsung di grafik. Klik label untuk sembunyikan/tampilkan.</div>`;
 }
 function change(e){
  const cb=e.target.closest?.('[data-fd-toggle]');
  if(!cb)return false;
  const key=cb.dataset.fdToggle;
  if(cb.checked)hidden.delete(key);else hidden.add(key);
  saveHidden(hidden);
  const slot=document.getElementById('fd-chart-slot');
  if(slot&&lastTrend&&lastTrend.hasHistory)slot.innerHTML=chart(lastTrend);
  return false;
 }

 const WASTE_THRESHOLD=3.5,LOST_SALES_THRESHOLD=4.5; // Ambang dari owner.
 const fulfillmentCache=new Map();
 // Ganti outlet (terutama "Semua outlet") bisa menyentuh puluhan rencana yang fulfillment-nya
 // belum ter-cache sama sekali -- tiap satu SELESAI dimuat dari Firestore dulunya langsung
 // memicu render ulang HALAMAN PENUH sendiri-sendiri, jadi terasa lambat/patah-patah kalau ada
 // banyak yang belum ter-cache sekaligus. Digabung jadi satu render per batch pendek.
 let fulfillmentRenderPending=false;
 function scheduleFulfillmentRender(){if(fulfillmentRenderPending)return;fulfillmentRenderPending=true;setTimeout(()=>{fulfillmentRenderPending=false;window.dispatchEvent(new Event('forecast-plans-changed'));},120);}
 function fulfillmentFor(key){
  if(!fulfillmentCache.has(key)){
   fulfillmentCache.set(key,{loading:true,data:null});
   window.ForecastPlanCloud.getFulfillment(key).then(f=>{fulfillmentCache.set(key,{loading:false,data:f});scheduleFulfillmentRender();}).catch(()=>{fulfillmentCache.set(key,{loading:false,data:null});scheduleFulfillmentRender();});
  }
  return fulfillmentCache.get(key);
 }
 // Waste harian (bukan angka tetap sebulan): "real dikirim" dikurangi total laku
 // (reguler+pesanan), dijumlah per outlet dari rencana 7 hari terakhir yang sudah punya data
 // kirim. Pakai getFulfillment() yang sama & di-cache sama seperti tab Monitoring Forecast,
 // jadi tidak menambah beban Firestore di luar yang memang perlu.
 function wasteByOutlet(outletId){
  const cloud=window.ForecastPlanCloud,planner=window.ForecastPlanner;
  if(!cloud||cloud.state!=='ready')return null;
  const t=today(),from=planner.shift(t,-7);
  cloud.watch?.(from,t);
  const panels=window.PcsPanels.data();
  if(!panels.sales||!panels.orders)return null;
  const perOutlet=new Map();
  for(const r of cloud.records||[]){
   if(r.date<from||r.date>t)continue;
   if(outletId!=='__all__'&&r.outlet!==outletId)continue;
   const fc=fulfillmentFor(r.key);if(fc.loading||!fc.data)continue;
   const c=window.ForecastPlanner.compare(r,panels.sales,panels.orders,fc.data.shipped);
   if(!c.hasShipped||!c.complete)continue;
   const o=perOutlet.get(r.outlet)||{shipped:0,waste:0};
   o.shipped+=c.shippedTotal||0;o.waste+=c.wasteTotal||0;
   perOutlet.set(r.outlet,o);
  }
  const name=id=>window.OUTLET_INTELLIGENCE?.outlets?.[id]?.name||id;
  return [...perOutlet.entries()].map(([id,o])=>({id,name:name(id),percent:o.shipped>0?o.waste/o.shipped*100:null})).filter(r=>r.percent!=null).sort((a,b)=>b.percent-a.percent);
 }
 // Lost sales HARIAN dari sheet rekap tim (tab "Rekap Forecast <bulan>", kolom menit
 // kehabisan tiap outlet tiap tanggal) -- ditarik tiap malam oleh waste-recap.mjs, bukan
 // snapshot September lagi. Dirata-rata 7 hari terakhir, dikonversi ke % dengan rumus yang
 // sama dengan performance-summary.mjs (menit / (hari x 12 jam buka x 60)).
 function lostSalesByOutlet(outletId){
  const recap=window.DAILY_RECAP_SUMMARY?.lostSalesMinutes;if(!recap)return null;
  const planner=window.ForecastPlanner,t=today(),from=planner.shift(t,-7);
  const byOutlet=new Map();
  for(const [date,rows] of Object.entries(recap)){
   if(date<from||date>t)continue;
   for(const [id,minutes] of Object.entries(rows)){
    if(outletId!=='__all__'&&id!==outletId)continue;
    const o=byOutlet.get(id)||{minutes:0,days:0};o.minutes+=minutes||0;o.days++;byOutlet.set(id,o);
   }
  }
  const name=id=>window.OUTLET_INTELLIGENCE?.outlets?.[id]?.name||id;
  return [...byOutlet.entries()].map(([id,o])=>({id,name:name(id),percent:o.days>0?o.minutes/(o.days*12*60)*100:null})).filter(r=>r.percent!=null).sort((a,b)=>b.percent-a.percent);
 }
 // Waste nominal langsung dari sheet (tab WASTE, kolom Nominal) -- angka PEMBANDING terhadap
 // wasteByOutlet() (dikirim vs laku, dari data rencana tim) di atas. Dua sumber/metode
 // berbeda, sengaja ditampilkan berdampingan, bukan dijumlah jadi satu angka.
 function wasteSheetByOutlet(outletId){
  const recap=window.DAILY_RECAP_SUMMARY?.waste;if(!recap)return null;
  const planner=window.ForecastPlanner,t=today(),from=planner.shift(t,-7);
  const byOutlet=new Map();
  for(const [date,rows] of Object.entries(recap)){
   if(date<from||date>t)continue;
   for(const [id,entry] of Object.entries(rows)){
    if(outletId!=='__all__'&&id!==outletId)continue;
    byOutlet.set(id,(byOutlet.get(id)||0)+(entry.nominal||0));
   }
  }
  const name=id=>window.OUTLET_INTELLIGENCE?.outlets?.[id]?.name||id;
  return [...byOutlet.entries()].map(([id,nominal])=>({id,name:name(id),nominal})).filter(r=>r.nominal>0).sort((a,b)=>b.nominal-a.nominal);
 }
 function monthlyLostSalesFallback(){
  const perf=window.PERFORMANCE_SUMMARY,period=perf?.latestCompletePeriod;if(!period)return null;
  const rows=Object.entries(perf.outlets).map(([id,o])=>({id,name:o.name||id,percent:o.periods?.[period]?.estimatedLostSalesPercent})).filter(r=>r.percent!=null).sort((a,b)=>b.percent-a.percent);
  return rows.length?{period,rows}:null;
 }
 function badges(outletId){
  const wasteTeam=wasteByOutlet(outletId),wasteSheet=wasteSheetByOutlet(outletId),lostDaily=lostSalesByOutlet(outletId);
  const line=(r,threshold)=>`<div class="product-line"><b>${esc(r.name)}</b><span class="${r.percent>threshold?'fp-down':'fp-up'}">${r.percent.toLocaleString('id-ID',{maximumFractionDigits:1})}%</span></div>`;
  const lineMoney=r=>`<div class="product-line"><b>${esc(r.name)}</b><span>${money(r.nominal)}</span></div>`;
  const wasteTeamCard=wasteTeam==null?'':`<article class="workspace-card compact-card"><span class="micro-label">WASTE · DIKIRIM VS LAKU (RENCANA TIM)</span>${wasteTeam.length?wasteTeam.slice(0,5).map(r=>line(r,WASTE_THRESHOLD)).join(''):'<p class="workspace-note">Belum ada rencana 7 hari terakhir dengan data "real dikirim".</p>'}<p class="workspace-note">7 hari terakhir · ambang ${WASTE_THRESHOLD}%</p></article>`;
  const wasteSheetCard=wasteSheet==null?'':`<article class="workspace-card compact-card"><span class="micro-label">WASTE · SHEET REKAP (NOMINAL, PEMBANDING)</span>${wasteSheet.length?wasteSheet.slice(0,5).map(lineMoney).join(''):'<p class="workspace-note">Belum ada data waste 7 hari terakhir di sheet.</p>'}<p class="workspace-note">7 hari terakhir · dari tab WASTE, pembanding kartu sebelah</p></article>`;
  const fallback=lostDaily?null:monthlyLostSalesFallback();
  const lostRows=lostDaily?.slice(0,5)||fallback?.rows.slice(0,5)||[];
  const lostNote=lostDaily?`7 hari terakhir · ambang ${LOST_SALES_THRESHOLD}% · dari sheet rekap`:fallback?`${fallback.period} (bulanan, belum harian) · ambang ${LOST_SALES_THRESHOLD}%`:'';
  const lostCard=!lostRows.length?'':`<article class="workspace-card compact-card"><span class="micro-label">5 OUTLET LOST SALES TERTINGGI</span>${lostRows.map(r=>line(r,LOST_SALES_THRESHOLD)).join('')}<p class="workspace-note">${lostNote}</p></article>`;
  const cards=[wasteTeamCard,wasteSheetCard,lostCard].filter(Boolean);
  return cards.length?`<div class="product-comparison">${cards.join('')}</div>`:'';
 }

 const SOURCE_NOTE='<p class="fp-caption">Sumber: Open-Meteo (ramalan publik), probabilitas hujan RATA-RATA per hari dari model cuaca — bukan data yang kami karang. Awal musim hujan (November) wajar menunjukkan persentase tinggi di banyak outlet sekaligus karena satu sistem hujan bisa menutupi beberapa outlet yang berdekatan.</p>';
 // Kode cuaca WMO (field weathercode Open-Meteo) -> ikon + label kondisi Bahasa Indonesia.
 // Daftar lengkap: https://open-meteo.com/en/docs -- hanya kode yang relevan untuk Jogja/Jateng.
 function weatherIcon(code,probability){
  const table={0:['☀️','Cerah'],1:['🌤️','Cerah berawan'],2:['⛅','Berawan sebagian'],3:['☁️','Mendung'],45:['🌫️','Berkabut'],48:['🌫️','Berkabut'],51:['🌦️','Gerimis'],53:['🌦️','Gerimis'],55:['🌦️','Gerimis'],56:['🌦️','Gerimis'],57:['🌦️','Gerimis'],61:['🌧️','Hujan ringan'],63:['🌧️','Hujan'],65:['🌧️','Hujan lebat'],66:['🌧️','Hujan'],67:['🌧️','Hujan lebat'],80:['🌧️','Hujan ringan'],81:['🌧️','Hujan'],82:['🌧️','Hujan sangat lebat'],95:['⛈️','Badai petir'],96:['⛈️','Badai petir'],99:['⛈️','Badai petir']};
  if(code!=null&&table[code])return table[code];
  // weathercode tidak tersedia (mis. sebagian gagal dimuat) -- tebak kasar dari probabilitas saja.
  if(probability==null)return ['❔','Belum tersedia'];
  return probability>=60?['🌧️','Kemungkinan hujan']:probability>=30?['⛅','Kemungkinan berawan']:['☀️','Kemungkinan cerah'];
 }
 // Peta Leaflet SUNGGUHAN (sama library & tile OpenStreetMap yang dipakai tab "Peta &
 // penduduk" di app.js) -- bukan SVG sebaran sederhana lagi. Instance peta ini MANDIRI, tidak
 // berbagi apa pun dengan peta demografi (container id beda, tidak saling sentuh) supaya tidak
 // berisiko merusak fitur KMZ/population yang sudah ada.
 function weatherMapSection(rows){
  if(!rows.length)return '';
  return `<div class="weather-map-layout"><div id="weather-leaflet-map" class="weather-leaflet" role="img" aria-label="Peta interaktif cuaca 28 outlet"></div><div class="weather-outlet-list">${rows.slice().sort((a,b)=>(b.today??-1)-(a.today??-1)).map(r=>{const [icon]=weatherIcon(r.code,r.today);return `<button type="button" class="weather-outlet-row ${r.today!=null&&r.today>=60?'risk':''}" data-weather-focus="${esc(r.id)}"><span class="weather-outlet-icon">${icon}</span><span class="weather-outlet-name">${esc(r.name)}</span><span class="weather-outlet-pct">${r.today==null?'—':r.today+'%'}</span></button>`;}).join('')}</div></div><p class="fp-caption">Klik titik di peta atau baris di daftar untuk detail per outlet · lingkaran merah = kemungkinan hujan ≥60% hari ini.</p>`;
 }
 let leafletMap=null,leafletMarkers=new Map(),leafletContainerEl=null,leafletFitted=false;
 // Akurasi forecast (WAPE) untuk SATU outlet, 56 hari terakhir -- pola yang sama dengan
 // operationalSummary() di bawah, cuma tidak di-cache (popup per-klik, bukan tiap render).
 function outletAccuracy(id){
  const cloud=window.ForecastPlanCloud,planner=window.ForecastPlanner,panels=window.PcsPanels.data();
  if(!cloud||cloud.state!=='ready'||!panels.sales||!panels.orders)return null;
  const from=planner.shift(today(),-56);
  const valid=(cloud.records||[]).filter(r=>r.outlet===id&&r.date>=from&&r.date<=today()).map(r=>planner.compare(r,panels.sales,panels.orders)).filter(c=>c.eligible&&c.complete);
  const actual=valid.reduce((s,c)=>s+c.actual,0);
  return {wape:valid.length&&actual?valid.reduce((s,c)=>s+c.absolute,0)/actual*100:null,n:valid.length};
 }
 // Popup ringkas (cuaca + sekilas akurasi/waste/lost sales/produk unggulan) + tombol ke profil
 // lengkap outlet (Ringkasan: SWOT, demografi, produk & laba, dll -- halaman yang SUDAH ada,
 // tidak dibangun ulang di sini supaya tidak dobel pemeliharaan).
 function popupHtml(r){
  const [icon,label]=weatherIcon(r.code,r.today),[iconT,labelT]=weatherIcon(r.codeTomorrow,r.tomorrow);
  const temp=r.tempMax!=null&&r.tempMin!=null?`${Math.round(r.tempMin)}–${Math.round(r.tempMax)}°C`:'';
  const o=window.OUTLET_INTELLIGENCE?.outlets?.[r.id];
  const acc=outletAccuracy(r.id),waste=wasteByOutlet(r.id)?.[0],lost=lostSalesByOutlet(r.id)?.[0]||monthlyLostSalesFallback()?.rows.find(x=>x.id===r.id);
  const stat=(label,val,threshold)=>`<div class="weather-popup-stat"><span>${label}</span><b class="${val==null?'':threshold!=null&&val>threshold?'fp-down':'fp-up'}">${val==null?'—':val.toLocaleString('id-ID',{maximumFractionDigits:1})+'%'}</b></div>`;
  return `<div class="weather-popup"><b>${esc(r.name)}</b>
   <div class="weather-popup-row"><span>${icon}</span><div><b>Hari ini</b><br>${esc(label)} · ${r.today==null?'data belum tersedia':r.today+'%'}${temp?' · '+temp:''}</div></div>
   <div class="weather-popup-row"><span>${iconT}</span><div><b>Besok</b><br>${esc(labelT)} · ${r.tomorrow==null?'data belum tersedia':r.tomorrow+'%'}</div></div>
   <div class="weather-popup-stats">${stat('Akurasi forecast',acc?.wape,null)}${stat('Waste',waste?.percent,WASTE_THRESHOLD)}${stat('Lost sales',lost?.percent,LOST_SALES_THRESHOLD)}</div>
   ${o?.products?.[0]?`<p class="weather-popup-line">Produk terlaris: <b>${esc(o.products[0].name)}</b></p>`:''}
   ${o?.strength?`<p class="weather-popup-line">${esc(o.strength)}</p>`:''}
   <button type="button" class="button fp-primary weather-popup-btn" data-weather-profile="${esc(r.id)}">Lihat profil lengkap outlet →</button>
  </div>`;
 }
 // Lompat ke halaman Ringkasan outlet (SWOT, demografi, produk & laba, dll -- sudah ada,
 // dibangun tim sebelumnya) dari popup peta cuaca. Disimulasikan lewat event DOM yang SAMA
 // persis dipakai UI aslinya (ganti nilai select lalu dispatch 'change'), supaya memakai jalur
 // kode yang sudah terbukti jalan, bukan API baru yang harus dirawat sendiri.
 function openOutletProfile(id){
  const outletSel=document.getElementById('workspace-outlet');
  if(outletSel){outletSel.value=id;outletSel.dispatchEvent(new Event('change',{bubbles:true}));}
  const supportSel=document.getElementById('support-view');
  if(supportSel){supportSel.value='summary';supportSel.dispatchEvent(new Event('change',{bubbles:true}));}
 }
 // mount() dipanggil SETIAP render (lihat outlet-workspace.js) -- idempoten: kalau container
 // DOM masih elemen yang SAMA (render ulang untuk outlet yang sama / re-render lain yang tidak
 // mengganti kartu cuaca), peta & marker yang sudah ada dipakai ulang (cuma disinkronkan), tidak
 // dibuat ulang dari nol (hemat, dan tidak mereset posisi/zoom yang sedang dilihat user). Kalau
 // containernya ELEMEN BARU (innerHTML diganti total), instance lama (sudah yatim, terlepas
 // dari DOM) dibuang dan peta baru dibuat.
 function mountWeatherMap(){
  const el=document.getElementById('weather-leaflet-map');
  if(!el||typeof L==='undefined')return;
  if(leafletContainerEl!==el){
   if(leafletMap){try{leafletMap.remove();}catch{}}
   leafletContainerEl=el;leafletFitted=false;leafletMarkers=new Map();
   leafletMap=L.map(el,{scrollWheelZoom:false,zoomControl:true});
   L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'}).addTo(leafletMap);
   // Tombol "Lihat profil lengkap" di dalam konten popup -- didaftarkan sekali per instance
   // peta (bukan per mount(), supaya listener tidak menumpuk), lewat event popupopen karena
   // elemen popup baru dibuat Leaflet tiap kali dibuka.
   leafletMap.on('popupopen',e=>{
    const btn=e.popup.getElement()?.querySelector('[data-weather-profile]');
    if(btn)btn.onclick=()=>openOutletProfile(btn.dataset.weatherProfile);
   });
  }
  const rows=lastWeatherRows,seen=new Set();
  for(const r of rows){
   const o=window.OUTLET_DATA?.outlets?.find(x=>x.id===r.id);if(!o)continue;
   seen.add(r.id);
   const [icon]=weatherIcon(r.code,r.today),risk=r.today!=null&&r.today>=60;
   const html=`<div class="weather-pin ${risk?'risk':''}"><span>${icon}</span><small>${r.today==null?'—':r.today+'%'}</small></div>`;
   const icon2=L.divIcon({className:'',html,iconSize:[40,40],iconAnchor:[20,40],popupAnchor:[0,-38]});
   const existing=leafletMarkers.get(r.id);
   if(existing){existing.setIcon(icon2);existing.setPopupContent(popupHtml(r));}
   else{const m=L.marker([o.lat,o.lon],{icon:icon2,title:r.name}).addTo(leafletMap).bindPopup(popupHtml(r));leafletMarkers.set(r.id,m);}
  }
  for(const [id,m] of [...leafletMarkers])if(!seen.has(id)){leafletMap.removeLayer(m);leafletMarkers.delete(id);}
  if(!leafletFitted&&leafletMarkers.size){
   leafletFitted=true;
   if(leafletMarkers.size===1){const only=[...leafletMarkers.values()][0];leafletMap.setView(only.getLatLng(),14);}
   else leafletMap.fitBounds(L.latLngBounds([...leafletMarkers.values()].map(m=>m.getLatLng())),{padding:[28,28]});
  }
  setTimeout(()=>leafletMap?.invalidateSize(),60);
  const list=document.querySelector('.weather-outlet-list');
  if(list&&!list.dataset.wired){
   list.dataset.wired='1';
   list.addEventListener('click',e=>{
    const row=e.target.closest('[data-weather-focus]');if(!row)return;
    const m=leafletMarkers.get(row.dataset.weatherFocus);if(!m||!leafletMap)return;
    leafletMap.flyTo(m.getLatLng(),14,{duration:.65});m.openPopup();
   });
  }
 }
 let lastWeatherRows=[];
 async function weatherHighlights(outletId){
  const sales=window.PcsPanels.data().sales;if(!sales)return '<p class="workspace-note">Data outlet belum termuat.</p>';
  const list=outletIds(outletId,sales);if(!list.length)return '<p class="workspace-note">Pilih outlet untuk lihat cuaca.</p>';
  const t=today(),tomorrow=window.ForecastPlanner.shift(t,1);
  let map;try{map=await window.WeatherForecast.getNetwork(list,t,tomorrow);}catch{return '<p class="workspace-note">Layanan cuaca belum dapat dihubungi.</p>'+SOURCE_NOTE;}
  const name=id=>window.OUTLET_INTELLIGENCE?.outlets?.[id]?.name||id;
  const byArea={1:[],2:[],3:[]},mapRows=[];
  for(const [id,w] of map){
   const d0=w.error?null:w.days.find(d=>d.date===t),d1=w.error?null:w.days.find(d=>d.date===tomorrow);
   mapRows.push({id,name:name(id),today:d0?.probability??null,code:d0?.weatherCode??null,tomorrow:d1?.probability??null,codeTomorrow:d1?.weatherCode??null,tempMax:d0?.tempMax??null,tempMin:d0?.tempMin??null});
   const area=window.OutletResearchNotes?.area(id);if(!area)continue;
   byArea[area].push({id,today:d0?.probability??null,tomorrow:d1?.probability??null});
  }
  lastWeatherRows=mapRows;
  const sections=[1,2,3].map(n=>{
   const rows=byArea[n],maxP=Math.max(-1,...rows.flatMap(r=>[r.today,r.tomorrow]).filter(v=>v!=null)),risky=rows.filter(r=>(r.today!=null&&r.today>=60)||(r.tomorrow!=null&&r.tomorrow>=60));
   const summary=maxP<0?'Data belum tersedia':maxP>=60?`${risky.length} outlet berisiko hujan (tertinggi ${maxP}%)`:`Aman · tertinggi ${maxP}%`;
   return `<details class="weather-area"><summary><b>${esc(window.OutletResearchNotes.areaName(n))}</b><span class="${maxP>=60?'fp-warning':'fp-ok'}">${esc(summary)}</span></summary><div class="upcoming-line-list">${rows.sort((a,b)=>Math.max(b.today??-1,b.tomorrow??-1)-Math.max(a.today??-1,a.tomorrow??-1)).map(r=>`<div class="upcoming-line"><b>${esc(name(r.id))}</b><span>Hari ini ${r.today==null?'—':r.today+'%'} · Besok ${r.tomorrow==null?'—':r.tomorrow+'%'}</span></div>`).join('')}</div></details>`;
  });
  return weatherMapSection(mapRows)+sections.join('')+SOURCE_NOTE;
 }

 function eventsSoon(outletId){
  const t=today(),to=window.ForecastPlanner.shift(t,7),events=(window.INSIGHT_DATA?.events||[]).filter(e=>e.end>=t&&e.start<=to);
  if(!events.length)return '<p class="workspace-note">Tidak ada kegiatan terjadwal 7 hari ke depan.</p>';
  return `<div class="upcoming-line-list">${events.slice(0,8).map(e=>`<div class="upcoming-line"><b>${esc(e.title)}</b><span>${esc(e.start)}${e.venue?' · '+esc(e.venue):''}</span></div>`).join('')}</div>`;
 }

 // render() dipanggil berkali-kali berdekatan untuk outlet yang SAMA (mis. batch fulfillment
 // di atas, atau event lain yang tidak benar-benar mengubah data) -- comparisons di sini
 // memanggil compare() per rencana (bisa puluhan-ratusan seiring waktu), jadi hasilnya
 // di-cache per (outletId, jumlah records, hari ini) dan dipakai ulang kalau belum berubah.
 let opSummaryCache=null;
 function operationalSummary(outletId){
  const panels=window.PcsPanels.data(),planner=window.ForecastPlanner,cloud=window.ForecastPlanCloud,math=window.PcsMath;
  const cacheKey=outletId+'|'+(cloud?.records?.length||0)+'|'+today();
  if(opSummaryCache?.key===cacheKey)return opSummaryCache.html;
  const list=outletIds(outletId,panels.sales),yesterday=planner.shift(today(),-1);
  let sold=0,retail=0,orders=0;for(const p of [0,1,2,3]){const r=math.estimatedPartition(panels.sales,panels.orders,list,p,[yesterday])[0];sold+=r.total.value||0;retail+=r.retail.value||0;orders+=r.orders.value||0;}
  const from=planner.shift(today(),-56);
  const comparisons=(cloud?.records||[]).filter(r=>(outletId==='__all__'||r.outlet===outletId)&&r.date>=from&&r.date<=today()).map(r=>planner.compare(r,panels.sales,panels.orders));
  const valid=comparisons.filter(c=>c.eligible&&c.complete),actual=valid.reduce((s,c)=>s+c.actual,0),wapeA=valid.length&&actual?valid.reduce((s,c)=>s+c.absolute,0)/actual*100:null;
  const validShipped=valid.filter(c=>c.hasShipped),actualShipped=validShipped.reduce((s,c)=>s+c.actual,0),wapeB=validShipped.length&&actualShipped?validShipped.reduce((s,c)=>s+c.absoluteShipped,0)/actualShipped*100:null;
  const html=`<div class="fp-metrics">
   <article><span>Penjualan kemarin (4 SKU inti)</span><strong>${num(sold)} <small>PCS</small></strong></article>
   <article><span>Penjualan murni</span><strong>${num(retail)} <small>PCS</small></strong></article>
   <article><span>Pesanan (4 SKU inti)</span><strong>${num(orders)} <small>PCS</small></strong><small>Malmil &amp; Ogura saja</small></article>
   <article><span>Akurasi A · forecaster murni</span><strong>${pct(wapeA)}</strong><small>${valid.length} rencana, 56 hari</small></article>
   <article><span>Akurasi B · dengan faktor produksi</span><strong>${pct(wapeB)}</strong><small>${validShipped.length} rencana punya data kirim</small></article>
  </div>`;
  opSummaryCache={key:cacheKey,html};
  return html;
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
  lastTrend=trend;
  ensureWeather(outletId);
  const monthName=m=>months[Number(m.slice(5,7))-1]+' '+m.slice(0,4);
  const uplift=trend.pesananUpliftPct!=null?`Pesanan biasanya menambah ~${trend.pesananUpliftPct.toLocaleString('id-ID',{maximumFractionDigits:1})}% dari omzet murni (rata-rata 56 hari terakhir; tanggal yang pesanannya sudah tercatat di sheet pakai angka pasti, bukan tebakan). Data diperbarui tiap malam jam 21.02 WIB.`:'';
  return `<div class="focus-intro"><h2>Dashboard</h2><span>${outletId==='__all__'?'Seluruh outlet':''} · ${monthName(trend.ym)} & ${monthName(trend.ymNext)}</span></div>
   <div class="fd-shortcut"><button type="button" class="button fp-primary" data-go="forecast">Buat forecast →</button><span>Histori rencana & akurasi tim (buat pembelajaran) ada di tab Forecast → Monitoring.</span></div>
   <article class="workspace-card pcs-main-chart"><div class="pcs-chart-title"><h3>Tren omzet · ${monthName(trend.ym)} &amp; ${monthName(trend.ymNext)}</h3></div><div id="fd-chart-slot">${trend.hasHistory?chart(trend):'<div class="pcs-chart-empty"><p>Riwayat penjualan belum cukup untuk grafik.</p></div>'}</div>${uplift?`<p class="workspace-note">${uplift}</p>`:''}</article>
   <article class="workspace-card weather-card"><span class="micro-label">CUACA HARI INI &amp; BESOK</span>${weatherHtml}</article>
   <div class="product-comparison">
    <article class="workspace-card"><span class="micro-label">KEGIATAN 7 HARI KE DEPAN</span>${eventsSoon(outletId)}</article>
   </div>
   ${operationalSummary(outletId)}
   ${badges(outletId)}`;
 }
 function mount(){mountWeatherMap();}
 // Tooltip melayang DI TITIK yang disentuh/di-hover, bukan cuma teks tetap di bawah grafik --
 // posisinya dari koordinat layar event (clientX/clientY, bukan koordinat SVG internal yang
 // perlu konversi skala) relatif terhadap pembungkus .fd-chart-wrap. Readout di bawah grafik
 // tetap diisi juga (dibiarkan untuk pembaca layar/aria-live, dan sebagai fallback kalau
 // tooltip terpotong di tepi layar).
 function inspect(e){
  const p=e.target.closest('[data-fd-point]');if(!p)return;
  const wrap=p.closest('.fd-chart-wrap');if(!wrap)return;
  const box=p.closest('.pcs-main-chart')?.querySelector('.pcs-chart-readout');
  const text=p.dataset.fdPoint+': '+money(Number(p.dataset.fdValue));
  if(box)box.textContent=text;
  const tip=wrap.querySelector('.fd-tooltip');if(!tip)return;
  const rect=wrap.getBoundingClientRect(),cx=(e.clientX??0)-rect.left,cy=(e.clientY??0)-rect.top;
  tip.textContent=text;tip.hidden=false;
  tip.style.left=Math.max(6,Math.min(rect.width-6,cx))+'px';
  tip.style.top=Math.max(0,cy-14)+'px';
 }
 return {render,inspect,change,mount};
})();
