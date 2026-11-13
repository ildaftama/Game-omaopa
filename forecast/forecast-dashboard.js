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
 const dateLabelShort=d=>Number(d.slice(8,10))+' '+months[Number(d.slice(5,7))-1].slice(0,3);
 const dateRange=(a,b)=>a.slice(0,7)===b.slice(0,7)?`${Number(a.slice(8,10))}–${dateLabelShort(b)}`:`${dateLabelShort(a)}–${dateLabelShort(b)}`;
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
 const PRODUCT_NAMES=['Ogura Cheese','Ogura Choco','Malmil Cheese','Malmil Choco','Mini Cheese','Mini Choco','Mini Durian','Chiffon Classic Keju','Chiffon Classic Ekstra Keju','Chiffon Butter','Lite Ekstra Keju','Lite Keju','Roti Sosis','Roti Abon','Roti Coklat','Roti Pisang Coklat','Roti Coklat Keju','Roti Vanilla'];
 const productLabel=p=>PRODUCT_NAMES[p]||('Produk '+p);
 function actualPrice(source,id,p){
  if(p<4){const v=source?.outlets?.[id]?.[PRICE_KEYS[p]]?.price;return v>0?v:null;}
  return p in PRICE_REFS?PRICE_REFS[p]:null;
 }
 function shiftYearDate(date,deltaYears){const [y,m,d]=date.split('-').map(Number);return `${y+deltaYears}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;}
 const moneyBig=n=>n==null?'—':n>=1e9?'Rp'+(n/1e9).toLocaleString('id-ID',{minimumFractionDigits:2,maximumFractionDigits:2})+' M':n>=1e6?'Rp'+(n/1e6).toLocaleString('id-ID',{maximumFractionDigits:1})+' jt':money(n);
 const TREND_LABEL={'sharp-up':['🔺🔺','Naik tajam'],up:['🔺','Naik'],flat:['➖','Stabil'],down:['🔻','Turun'],'sharp-down':['🔻🔻','Turun tajam']};
 // Tren naik/turun dari data REAL (bukan prediksi): median 3 hari terakhir dibanding median 3
 // hari sebelum itu. BUG yang ketemu di versi 7-hari sebelumnya: supaya tahan lubang riwayat,
 // jendelanya dipilih lewat POSISI (N titik terakhir, bukan N hari kalender) -- tapi kalau
 // lubangnya besar, itu bisa diam-diam membandingkan ke periode yang sama sekali bukan
 // "minggu lalu" (mis. Makamhaji: jendela "7 hari sebelumnya" ternyata menjangkau sampai 20
 // hari ke belakang karena 21-28 Okt bolong, hasilnya +42% yang menyesatkan -- dicek owner
 // langsung ke ESB, tidak cocok). Dua perbaikan: (1) jendela diperpendek jadi 3 hari supaya
 // lebih gampang dicek manual ke ESB dan lebih jarang kena lubang; (2) kalau toh jendelanya
 // tetap menjangkau lebih dari maxSpanDays hari kalender, BATALKAN (null) -- diam itu lebih
 // baik daripada angka yang menyesatkan. Anotasi akhir pekan/kegiatan ditambahkan terpisah di
 // windowContext() -- bukan dikoreksi otomatis di sini, biar manusia yang menilai wajar/tidak.
 let TREND_WINDOW=3;const TREND_MAX_SPAN_DAYS=6;
 // Nilai-nilai yang bisa diubah owner di halaman Pengaturan (forecast-settings.js). Dibaca ulang
 // tiap render; kalau berubah, cache turunan dibuang supaya angka langsung ikut aturan baru.
 let OMZET_HL=15,WL_HL=20,RAIN_RISK=60,settingsSig='';
 function applySettings(){
  const p=window.ForecastSettings?.get();if(!p)return;
  const sig=JSON.stringify(p);if(sig===settingsSig)return;settingsSig=sig;
  TREND_WINDOW=p.thresholds.trendWindow;OMZET_HL=p.thresholds.omzetHighlight;WL_HL=p.thresholds.wasteLostHighlight;
  WASTE_THRESHOLD=p.thresholds.waste;LOST_SALES_THRESHOLD=p.thresholds.lostSales;OPEN_MINUTES=p.thresholds.openHours*60;
  W_TH=pct1(WASTE_THRESHOLD);L_TH=pct1(LOST_SALES_THRESHOLD);RAIN_RISK=p.weather.highRiskProb;
  trendExtremesCache=null;wasteLostTrendCache=null;wasteLostCache=null;opSummaryCache=null;weatherKey='';
 }
 function daySpan(d1,d2){return Math.round((new Date(d2+'T00:00:00Z')-new Date(d1+'T00:00:00Z'))/86400000);}
 function weekTrend(series,planner){
  if(series.length<TREND_WINDOW*2)return null;
  const recentPts=series.slice(-TREND_WINDOW),priorPts=series.slice(-TREND_WINDOW*2,-TREND_WINDOW);
  if(recentPts.length<TREND_WINDOW||priorPts.length<TREND_WINDOW)return null;
  if(daySpan(recentPts[0].date,recentPts.at(-1).date)>TREND_MAX_SPAN_DAYS)return null;
  if(daySpan(priorPts[0].date,priorPts.at(-1).date)>TREND_MAX_SPAN_DAYS)return null;
  if(daySpan(priorPts.at(-1).date,recentPts[0].date)>TREND_MAX_SPAN_DAYS)return null;
  const recentMed=planner.quantile(recentPts.map(r=>r.value),.5),priorMed=planner.quantile(priorPts.map(r=>r.value),.5);
  // BUG yang dilaporkan owner (2026-11-08): sebelumnya priorMed=0 (3 hari sebelumnya benar2
  // nol -- mis. waste 0 lalu muncul) membuat fungsi ini `return null` (persen tak terhingga,
  // tidak bisa dihitung) -- tapi itu artinya kejadian "dari nol ke ada" DIAM-DIAM HILANG dari
  // semua tempat yang pakai weekTrend() (badge, kartu peringatan, DAN hitungan "N outlet waste
  // naik" di ringkasan global), padahal itu justru sinyal paling jelas/tajam, bukan yang paling
  // meragukan. Sekarang tetap dilaporkan (dir sharp-up, pct=null+fromZero=true) selama memang
  // recentMed>0 -- cuma kalau KEDUANYA nol (benar2 tidak ada apa-apa) baru null (tidak ada
  // yang perlu dilaporkan). Pemanggil WAJIB cek fromZero sebelum format pct sebagai angka.
  if(!(priorMed>0))return recentMed>0?{pct:null,fromZero:true,dir:'sharp-up',deltaMed:recentMed,recentMed,priorMed:0,recentDates:recentPts.map(r=>r.date),asOf:recentPts.at(-1).date}:null;
  const pct=(recentMed-priorMed)/priorMed*100;
  const dir=pct>=20?'sharp-up':pct>=8?'up':pct<=-20?'sharp-down':pct<=-8?'down':'flat';
  return {pct,dir,deltaMed:recentMed-priorMed,recentMed,priorMed,recentDates:recentPts.map(r=>r.date),asOf:recentPts.at(-1).date};
 }
 // Teks persen aman -- dipakai di SEMUA tempat yang menampilkan angka dari weekTrend(), supaya
 // kasus fromZero (lihat komentar di weekTrend) tidak pernah mencoba format null jadi angka
 // (itu akan error) dan tetap jujur: bukan "+∞%" atau angka karangan, tapi "baru/naik dari 0".
 function trendPctText(t){
  if(t.pct==null)return '(dari 0)';
  const sign=t.pct>=0?'+':'';
  return `${sign}${t.pct.toLocaleString('id-ID',{maximumFractionDigits:0})}%`;
 }
 // Buat .sort() aman dipakai di daftar yang bisa memuat entri fromZero (pct null) -- dalam
 // desain weekTrend() di atas, fromZero SELALU arah naik (tidak pernah turun dari nol), jadi
 // diperlakukan sebagai kenaikan paling tajam (lebih tajam dari angka berapa pun), bukan NaN
 // yang bikin urutan .sort() tidak terduga.
 function trendSortValue(r){return r.pct==null?Infinity:r.pct;}
 // Catatan konteks (bukan koreksi angka) -- kalau 3 hari terakhir memuat akhir pekan atau
 // bertepatan dengan kegiatan yang terdaftar untuk outlet ini, disebutkan apa adanya supaya
 // yang baca bisa menilai sendiri wajar atau tidak, bukan ditebak otomatis oleh sistem.
 function windowContext(dates,outletName){
  if(!dates?.length)return '';
  const notes=[];
  if(dates.some(d=>{const wd=new Date(d+'T12:00:00Z').getUTCDay();return wd===0||wd===6;}))notes.push('termasuk akhir pekan');
  const from=dates[0],to=dates.at(-1);
  const events=(window.INSIGHT_DATA?.events||[]).filter(e=>e.start<=to&&e.end>=from&&(e.outletHint===outletName||e.outletHints?.includes(outletName)));
  for(const e of events.slice(0,2))notes.push(esc(e.title));
  return notes.length?` (${notes.join(', ')})`:'';
 }
 // Produk yang paling banyak menyumbang kenaikan/penurunan (selisih RUPIAH minggu-ke-minggu,
 // bukan persen -- produk kecil yang persentasenya kebetulan besar tidak mengalahkan produk
 // besar yang sebetulnya lebih berdampak).
 function productDriver(series,direction,planner){
  const byP=new Map();
  for(const pt of series){if(!pt.perProduct)continue;for(let p=0;p<PRODUCT_COUNT;p++){const v=pt.perProduct[p];if(!v)continue;(byP.get(p)||(byP.set(p,[]),byP.get(p))).push({date:pt.date,value:v});}}
  let best=null;
  for(const [p,s] of byP){
   const t=weekTrend(s,planner);if(!t)continue;
   if(direction==='up'&&!(t.fromZero||t.pct>0))continue;
   if(direction==='down'&&!(t.pct<0))continue;
   if(!best||Math.abs(t.deltaMed)>Math.abs(best.deltaMed))best={p,...t};
  }
  return best;
 }
 // Bahasa singkat, bukan gaya laporan -- cuma nama produk + arah, tanpa persen/rupiah dobel
 // dengan baris utamanya.
 function driverCaption(driver){
  if(!driver)return '';
  return `, terutama ${esc(productLabel(driver.p))}`;
 }
 function trendBadgeHtml(t){
  if(!t)return '';
  const [icon,label]=TREND_LABEL[t.dir];
  return `<span class="fd-trend-badge fd-trend-${t.dir}">${icon} ${label} ${trendPctText(t)}</span>`;
 }
 // Omzet harian per outlet DENGAN pesanan dikeluarkan (angka PASTI dari sheet PESANAN pada
 // tanggal yang tercatat -- bukan estimasi statistik -- supaya lonjakan karena pesanan masuk
 // tidak terbaca sebagai "tren organik naik") dan rincian per produk, satu pass atas
 // panels.sales.days (bukan memanggil ulang revenueTrend()/estimatedPartition() 28x yang
 // jauh lebih berat). Dipakai untuk badge/kartu peringatan tren -- BUKAN untuk garis grafik
 // "Omzet murni/pesanan" yang tetap pakai estimatedPartition() di revenueTrend() (metodologi
 // lama, sudah teruji, tidak disentuh di sini).
 const PESANAN_PRODUCTS_TREND=[0,1,2,3,7,8,9];
 let dailySeriesCache=null;
 function dailyOutletProductSeries(){
  const panels=window.PcsPanels.data();
  if(!panels.sales)return null;
  const cacheKey=panels.sales.days.length+'|'+(panels.orders?.days?.length||0)+'|'+today();
  if(dailySeriesCache?.key===cacheKey)return dailySeriesCache.value;
  const todayStr=today(),ordersByKey=new Map((panels.orders?.days||[]).map(r=>[r.date+'|'+r.id,r]));
  const byOutlet=new Map();
  for(const row of panels.sales.days){
   // "Hari ini" dikecualikan sama seperti di revenueTrend() -- lihat komentar di sana.
   if(!row.complete||row.date>=todayStr)continue;
   const o=ordersByKey.get(row.date+'|'+row.id),perProduct=new Array(PRODUCT_COUNT).fill(0);let total=0,gross=0;
   for(let p=0;p<PRODUCT_COUNT;p++){
    const v=actualPrice(window.FORECAST_REALIZED_PRICES,row.id,p);if(v==null)continue;
    let qty=row.qty[p]||0;gross+=qty*v;
    if(PESANAN_PRODUCTS_TREND.includes(p)&&o){const pq=o.qty?.[p];if(Number.isSafeInteger(pq)&&pq>=0)qty=Math.max(0,qty-pq);}
    const val=qty*v;perProduct[p]=val;total+=val;
   }
   // gross = omzet real TERMASUK pesanan -- penyebut waste % (sama seperti PERFORMA OUTLET:
   // waste dibagi total penjualan), beda dari value (tanpa pesanan) yang dipakai untuk tren.
   (byOutlet.get(row.id)||(byOutlet.set(row.id,[]),byOutlet.get(row.id))).push({date:row.date,value:total,gross,perProduct});
  }
  for(const s of byOutlet.values())s.sort((a,b)=>a.date.localeCompare(b.date));
  const value={byOutlet};
  dailySeriesCache={key:cacheKey,value};
  return value;
 }
 function aggregateOrganicSeries(list){
  const ds=dailyOutletProductSeries();if(!ds)return [];
  const byDate=new Map();
  for(const id of list){
   const s=ds.byOutlet.get(id);if(!s)continue;
   for(const pt of s){
    const e=byDate.get(pt.date)||{value:0,perProduct:new Array(PRODUCT_COUNT).fill(0)};
    e.value+=pt.value;for(let p=0;p<PRODUCT_COUNT;p++)e.perProduct[p]+=pt.perProduct[p];
    byDate.set(pt.date,e);
   }
  }
  return [...byDate.entries()].map(([date,e])=>({date,value:e.value,perProduct:e.perProduct})).sort((a,b)=>a.date.localeCompare(b.date));
 }
 // Outlet dengan tren paling tajam (naik dan turun) di seluruh jaringan, dari omzet TANPA
 // pesanan (lihat dailyOutletProductSeries di atas).
 let trendExtremesCache=null;
 function networkTrendExtremes(){
  const ds=dailyOutletProductSeries();if(!ds)return null;
  const planner=window.ForecastPlanner;
  const cacheKey=[...ds.byOutlet.values()].reduce((s,v)=>s+v.length,0)+'|'+today();
  if(trendExtremesCache?.key===cacheKey)return trendExtremesCache.value;
  const name=id=>window.OUTLET_INTELLIGENCE?.outlets?.[id]?.name||id;
  const results=[];
  for(const [id,series] of ds.byOutlet){
   const t=weekTrend(series,planner);if(!t)continue;
   const driver=t.fromZero||t.pct>0?productDriver(series,'up',planner):t.pct<0?productDriver(series,'down',planner):null;
   const nm=name(id);
   results.push({id,name:nm,...t,driver,context:windowContext(t.recentDates,nm)});
  }
  const value=results.length?{all:results.sort((a,b)=>trendSortValue(b)-trendSortValue(a))}:null;
  trendExtremesCache={key:cacheKey,value};
  return value;
 }
 // Tren waste & lost sales HARIAN per outlet (sumber sama dengan kartu waste/lost sales yang
 // sudah ada -- DAILY_RECAP_SUMMARY, dari sheet rekap tim), metodologi sama persis
 // (weekTrend) supaya konsisten dengan tren omzet. Waste/lost sales NAIK = buruk
 // (beda semantik dari omzet naik = bagus), jadi hanya arah "naik tajam" yang diberi
 // peringatan di sini.
 let wasteLostTrendCache=null;
 function wasteLostTrendExtremes(){
  const recap=window.DAILY_RECAP_SUMMARY;if(!recap)return null;
  const cacheKey=(recap.updatedAt||'')+'|'+today();
  if(wasteLostTrendCache?.key===cacheKey)return wasteLostTrendCache.value;
  const planner=window.ForecastPlanner,name=id=>window.OUTLET_INTELLIGENCE?.outlets?.[id]?.name||id,todayStr=today();
  function build(obj){
   const byOutlet=new Map();
   for(const [date,rows] of Object.entries(obj||{})){
    if(date>=todayStr)continue;
    for(const [id,v] of Object.entries(rows)){
     const val=typeof v==='object'&&v!==null?v.nominal:v;if(val==null)continue;
     (byOutlet.get(id)||(byOutlet.set(id,[]),byOutlet.get(id))).push({date,value:val});
    }
   }
   const results=[];
   for(const [id,s] of byOutlet){s.sort((a,b)=>a.date.localeCompare(b.date));const t=weekTrend(s,planner);if(t){const nm=name(id);results.push({id,name:nm,...t,context:windowContext(t.recentDates,nm)});}}
   return results.sort((a,b)=>trendSortValue(b)-trendSortValue(a));
  }
  const value={waste:build(recap.waste),lost:build(recap.lostSalesMinutes)};
  wasteLostTrendCache={key:cacheKey,value};
  return value;
 }
 function trendRowHtml(r){
  return `<button type="button" class="fd-trend-row fd-trend-${r.dir}" data-outlet-detail="${esc(r.id)}"><span>${esc(r.name)}</span><b>${trendPctText(r)}</b></button>`;
 }
 // Hitung berapa outlet naik/turun/stabil dari daftar hasil weekTrend() -- dipakai untuk
 // ringkasan global (gambaran umum dulu) sebelum rincian per outlet.
 function trendDirCounts(list){
  let up=0,down=0,flat=0;
  for(const r of list){if(r.dir==='up'||r.dir==='sharp-up')up++;else if(r.dir==='down'||r.dir==='sharp-down')down++;else flat++;}
  return {up,down,flat};
 }
 // Kalau omzet SATU outlet naik tapi waste-nya juga naik (atau sebaliknya: omzet turun tapi
 // waste tidak ikut turun), itu tanda forecast tetap perlu hati-hati -- jangan cuma lihat satu
 // aspek. Dicek silang terhadap wasteLostTrendExtremes() yang sudah dihitung, bukan metode baru.
 function wasteCautionText(wl,id,omzetDir){
  const w=wl?.waste.find(x=>x.id===id);
  if(!w||!(w.dir==='up'||w.dir==='sharp-up'))return '';
  const wastePct=trendPctText(w);
  return omzetDir==='up'
   ?` <b class="fd-trend-caution">Tapi waste juga naik ${wastePct} — jaga agar kiriman tidak terlalu banyak.</b>`
   :` <b class="fd-trend-caution">Waste justru naik ${wastePct} saat omzet turun — sesuaikan kiriman per produk, bukan hanya mengurangi total.</b>`;
 }
 // Ringkasan global (gambaran umum SEMUA outlet dulu) -- owner minta ini di depan, baru
 // rincian per outlet di bawahnya (lihat flags/full di trendWatchCard). networkTrend = tren
 // omzet JARINGAN (agregat semua outlet, dari revenueTrend('__all__') yang sudah dihitung
 // render() -- bukan dihitung ulang di sini).
 function networkOverviewHtml(networkTrend,ext,wl){
  const stats=[];
  if(networkTrend){
   const [icon,label]=TREND_LABEL[networkTrend.dir];
   stats.push(`<div class="fd-overview-stat fd-overview-headline fd-trend-${networkTrend.dir}"><b>${icon} ${label}</b><span>Omzet jaringan ${trendPctText(networkTrend)} ${TREND_WINDOW} hari terakhir</span></div>`);
  }
  if(ext){
   const c=trendDirCounts(ext.all);
   stats.push(`<div class="fd-overview-stat fd-overview-up"><b>${c.up}</b><span>outlet omzet naik</span></div>`);
   stats.push(`<div class="fd-overview-stat fd-overview-down"><b>${c.down}</b><span>outlet omzet turun</span></div>`);
   stats.push(`<div class="fd-overview-stat"><b>${c.flat}</b><span>outlet stabil</span></div>`);
  }
  if(wl){
   const wasteUp=trendDirCounts(wl.waste).up,lostUp=trendDirCounts(wl.lost).up;
   stats.push(`<div class="fd-overview-stat${wasteUp?' fd-overview-down':''}"><b>${wasteUp}</b><span>outlet waste naik</span></div>`);
   stats.push(`<div class="fd-overview-stat${lostUp?' fd-overview-down':''}"><b>${lostUp}</b><span>outlet lost sales naik</span></div>`);
  }
  return stats.length?`<div class="fd-overview">${stats.join('')}</div>`:'';
 }
 // Kartu peringatan di puncak Dashboard. Ringkasan global dulu (networkOverviewHtml), baru
 // rincian: outlet yang BENAR-BENAR bergeser tajam (≥15% omzet, ≥20% waste/lost sales, maksimal
 // 5 outlet tiap jenis) dikelompokkan per jenis supaya lebih rapi dibaca -- tapi SEMUA outlet
 // tetap bisa dilihat lewat "Lihat tren semua outlet". networkTrend = tren omzet jaringan
 // (dari render(), lihat networkOverviewHtml di atas).
 // Saran dibedakan menurut besarnya pergerakan -- bukan "Siapkan stok lebih" yang sama persis
 // di setiap kartu (owner: bahasanya kaku & monoton).
 function riserAdvice(r){
  if(r.fromZero)return 'Penjualan mulai tumbuh, pantau dulu sebelum menambah kiriman.';
  return r.pct>=50?'Kenaikan signifikan, tambah kiriman.':r.pct>=25?'Kenaikan cukup tinggi, siapkan stok lebih.':'Mulai naik, tambah kiriman secara bertahap.';
 }
 function fallerAdvice(r){return r.pct<=-30?'Penurunan cukup dalam, kurangi kiriman.':'Sedikit melemah, kurangi kiriman secara bertahap.';}
 function trendWatchCard(networkTrend){
  const ext=networkTrendExtremes(),wl=wasteLostTrendExtremes();
  const overview=networkOverviewHtml(networkTrend,ext,wl);
  const groups=[];
  if(ext){
   // fromZero (lihat weekTrend/trendSortValue) IKUT masuk sebagai riser -- itu kenaikan paling
   // tajam yang bisa terjadi (dari benar2 nol), bukan sesuatu yang pantas didiamkan dari sorotan
   // cuma karena persennya tidak bisa dihitung sebagai angka.
   const risers=ext.all.filter(r=>r.pct>=OMZET_HL||r.fromZero).sort((a,b)=>trendSortValue(b)-trendSortValue(a)).slice(0,5);
   const fallers=ext.all.filter(r=>r.pct<=-OMZET_HL).sort((a,b)=>a.pct-b.pct).slice(0,5);
   if(risers.length)groups.push(`<div class="fd-trend-group"><span class="fd-trend-group-title">Omzet naik tajam</span><div class="fd-trend-grid">${risers.map(r=>`<button type="button" class="fd-trend-flag fd-trend-up" data-outlet-detail="${esc(r.id)}"><b>🔺 ${esc(r.name)}</b><span>Omzet ${trendPctText(r)}${r.context}${driverCaption(r.driver)}. ${riserAdvice(r)}${wasteCautionText(wl,r.id,'up')}</span></button>`).join('')}</div></div>`);
   if(fallers.length)groups.push(`<div class="fd-trend-group"><span class="fd-trend-group-title">Omzet turun tajam</span><div class="fd-trend-grid">${fallers.map(r=>`<button type="button" class="fd-trend-flag fd-trend-down" data-outlet-detail="${esc(r.id)}"><b>🔻 ${esc(r.name)}</b><span>Omzet ${trendPctText(r)}${r.context}${driverCaption(r.driver)}. ${fallerAdvice(r)}${wasteCautionText(wl,r.id,'down')}</span></button>`).join('')}</div></div>`);
  }
  if(wl){
   const wasteUp=wl.waste.filter(r=>r.pct>=WL_HL||r.fromZero).sort((a,b)=>trendSortValue(b)-trendSortValue(a)).slice(0,3);
   const lostUp=wl.lost.filter(r=>r.pct>=WL_HL||r.fromZero).sort((a,b)=>trendSortValue(b)-trendSortValue(a)).slice(0,3);
   if(wasteUp.length||lostUp.length){
    const wasteFlags=wasteUp.map(r=>`<button type="button" class="fd-trend-flag fd-trend-down" data-outlet-detail="${esc(r.id)}"><b>🗑️ ${esc(r.name)}</b><span>Waste ${trendPctText(r)}${r.context}. ${r.fromZero||r.pct>=100?'Naik tajam — periksa produk dengan sisa terbanyak.':'Tinjau kembali jumlah kiriman.'}</span></button>`);
    const lostFlags=lostUp.map(r=>`<button type="button" class="fd-trend-flag fd-trend-down" data-outlet-detail="${esc(r.id)}"><b>⏳ ${esc(r.name)}</b><span>Lost sales ${trendPctText(r)}${r.context}. ${r.fromZero?'Stok mulai sering habis.':'Stok makin sering habis, pertimbangkan menambah kiriman.'}</span></button>`);
    groups.push(`<div class="fd-trend-group"><span class="fd-trend-group-title">Waste &amp; lost sales naik</span><div class="fd-trend-grid">${[...wasteFlags,...lostFlags].join('')}</div></div>`);
   }
  }
  if(!overview&&!groups.length)return '';
  const full=ext?`<details class="fd-trend-full"><summary>Lihat tren omzet semua outlet (${ext.all.length})</summary><div class="fd-trend-rows">${ext.all.map(trendRowHtml).join('')}</div></details>`:'';
  const empty=groups.length?'':'<p class="workspace-note">Belum ada outlet dengan pergeseran tajam saat ini.</p>';
  return `<article class="workspace-card fd-trend-watch"><span class="micro-label">KONDISI OUTLET · ${TREND_WINDOW} HARI TERAKHIR vs ${TREND_WINDOW} HARI SEBELUMNYA, TANPA PESANAN · klik nama outlet untuk rincian</span>${overview}${groups.join('')}${empty}${full}</article>`;
 }
 // ---- Panel rincian satu outlet (dialog) -- dibuka dengan klik nama outlet di kartu tren.
 // Rangkum semua yang sudah dihitung di atas (tren omzet per produk, waste, lost sales) jadi
 // satu tempat, bukan menghitung ulang dengan cara baru.
 let outletDetailId=null;
 // Total (bukan median) 3 hari terakhir vs 3 hari sebelumnya untuk SATU deret -- lebih gampang
 // dibaca sebagai "produk ini laku segini 3 hari terakhir" daripada rata-rata. Jendela & batas
 // jarak SAMA dengan weekTrend() (lihat komentar di sana) -- jangan diam-diam membandingkan ke
 // periode yang kejauhan kalau ada lubang riwayat.
 function recentTotals(series){
  if(series.length<TREND_WINDOW)return null;
  const recentPts=series.slice(-TREND_WINDOW),priorPts=series.slice(-TREND_WINDOW*2,-TREND_WINDOW);
  if(daySpan(recentPts[0].date,recentPts.at(-1).date)>TREND_MAX_SPAN_DAYS)return null;
  const priorOk=priorPts.length===TREND_WINDOW&&daySpan(priorPts[0].date,priorPts.at(-1).date)<=TREND_MAX_SPAN_DAYS&&daySpan(priorPts.at(-1).date,recentPts[0].date)<=TREND_MAX_SPAN_DAYS;
  const sum=a=>a.reduce((s,r)=>s+r.value,0);
  const recent=sum(recentPts),prior=priorOk?sum(priorPts):null;
  return {recent,prior,pct:prior>0?(recent-prior)/prior*100:null};
 }
 function outletProductRows(id){
  const ds=dailyOutletProductSeries();if(!ds)return [];
  const series=ds.byOutlet.get(id);if(!series)return [];
  const rows=[];
  for(let p=0;p<PRODUCT_COUNT;p++){
   const s=series.map(pt=>({date:pt.date,value:pt.perProduct[p]||0}));
   const w=recentTotals(s);
   if(!w||(!w.recent&&!w.prior))continue;
   rows.push({p,label:productLabel(p),...w});
  }
  return rows.sort((a,b)=>b.recent-a.recent);
 }
 // Waste per produk HANYA ada untuk 4 SKU inti (kolom "core" di sheet WASTE) -- bukan 18
 // produk. Satuan PCS (jumlah kue terbuang), bukan rupiah -- sheet tidak merinci nominal per
 // produk, cuma total per outlet (dipakai di bagian ringkasan waste di atasnya).
 const WASTE_CORE_LABELS=['Ogura Cheese','Ogura Choco','Malmil Cheese','Malmil Choco'];
 function outletWasteCoreRows(id){
  const recap=window.DAILY_RECAP_SUMMARY;if(!recap?.waste)return [];
  const todayStr=today(),series=[];
  for(const [date,rows] of Object.entries(recap.waste)){
   if(date>=todayStr)continue;
   const entry=rows[id];if(!entry)continue;
   series.push({date,core:entry.core||[0,0,0,0]});
  }
  series.sort((a,b)=>a.date.localeCompare(b.date));
  if(series.length<TREND_WINDOW)return [];
  const recentPts=series.slice(-TREND_WINDOW),priorPts=series.slice(-TREND_WINDOW*2,-TREND_WINDOW);
  if(daySpan(recentPts[0].date,recentPts.at(-1).date)>TREND_MAX_SPAN_DAYS)return [];
  const priorOk=priorPts.length===TREND_WINDOW&&daySpan(priorPts[0].date,priorPts.at(-1).date)<=TREND_MAX_SPAN_DAYS&&daySpan(priorPts.at(-1).date,recentPts[0].date)<=TREND_MAX_SPAN_DAYS;
  const sum=(pts,k)=>pts.reduce((s,r)=>s+(r.core[k]||0),0);
  return WASTE_CORE_LABELS.map((label,k)=>({label,recent:sum(recentPts,k),prior:priorOk?sum(priorPts,k):null})).filter(r=>r.recent||r.prior);
 }
 function outletDetailRow(r){
  const pctTxt=r.pct==null?'<span class="fd-outlet-new">baru/jarang laku</span>':`<b class="${r.pct>=0?'fp-up':'fp-down'}">${r.pct>=0?'+':''}${r.pct.toLocaleString('id-ID',{maximumFractionDigits:0})}%</b>`;
  return `<tr><td>${esc(r.label)}</td><td>${money(Math.round(r.recent))}</td><td>${r.prior==null?'—':money(Math.round(r.prior))}</td><td>${pctTxt}</td></tr>`;
 }
 function outletWasteRow(r){
  const pct=r.prior>0?(r.recent-r.prior)/r.prior*100:null;
  // BUG dilaporkan owner: "3 hari sebelumnya" 0 pcs lalu ada waste (mis. 0 -> 3 pcs) menampilkan
  // "—" seperti tidak ada perubahan, padahal itu KENAIKAN waste nyata dari nol -- cuma persennya
  // yang tidak bisa dihitung (pembagi nol), bukan datanya yang kosong. Dibedakan dari r.prior
  // benar2 null (data belum ada sama sekali, baris itu malah tidak akan lolos filter pemanggil).
  let pctTxt;
  if(pct!=null)pctTxt=`<b class="${pct<=0?'fp-up':'fp-down'}">${pct>=0?'+':''}${pct.toLocaleString('id-ID',{maximumFractionDigits:0})}%</b>`;
  else if(r.prior===0&&r.recent>0)pctTxt='<b class="fp-down">Naik dari 0</b>';
  else pctTxt='—';
  return `<tr><td>${esc(r.label)}</td><td>${num(r.recent)} pcs</td><td>${r.prior==null?'—':num(r.prior)+' pcs'}</td><td>${pctTxt}</td></tr>`;
 }
 function outletDetailHtml(id){
  const name=window.OUTLET_INTELLIGENCE?.outlets?.[id]?.name||id;
  const planner=window.ForecastPlanner;
  const omzetTrend=weekTrend(aggregateOrganicSeries([id]),planner);
  const wl=wasteLostTrendExtremes();
  const wasteTrend=wl?.waste.find(r=>r.id===id)||null,lostTrend=wl?.lost.find(r=>r.id===id)||null;
  const productRows=outletProductRows(id),wasteCoreRows=outletWasteCoreRows(id);
  const trendLine=(t,goodWhenUp)=>{
   if(!t)return '<p class="workspace-note">Belum cukup data (riwayat bolong atau terlalu sedikit).</p>';
   // fromZero (lihat weekTrend): 3 hari sebelumnya benar2 nol, jadi "naik"-nya selalu sesuai
   // goodWhenUp langsung -- BUKAN dihitung dari t.pct (null, tidak bisa dibandingkan >=0).
   const good=t.fromZero?goodWhenUp:(goodWhenUp?t.pct>=0:t.pct<0);
   const text=t.fromZero?'Baru naik dari 0':trendPctText(t);
   return `<p class="workspace-note"><b class="${good?'fp-up':'fp-down'}">${text}</b> dibanding ${TREND_WINDOW} hari sebelumnya${windowContext(t.recentDates,name)}.</p>`;
  };
  // Ringkasan satu paragraf di puncak dialog -- gabungan tiga aspek (omzet, waste, lost sales)
  // jadi satu kesimpulan, supaya yang buka tidak perlu menyimpulkan sendiri dari tiga tabel.
  const st=wasteLostStats().list.find(r=>r.id===id);
  // Produk pendorong diambil dari tabel di bawahnya (selisih rupiah 3 hari) supaya kalimat dan
  // tabel tidak saling bertentangan.
  const dialogDriver=omzetTrend&&!omzetTrend.fromZero?productRows.filter(r=>r.prior!=null&&(omzetTrend.pct>0?r.recent>r.prior:r.recent<r.prior)).sort((x,y)=>Math.abs(y.recent-y.prior)-Math.abs(x.recent-x.prior))[0]:null;
  const omzetSentence=omzetTrend?(omzetTrend.fromZero?'Omzet baru mulai naik dari nol.':omzetTrend.dir==='flat'?`Omzet ${TREND_WINDOW} hari terakhir stabil.`:`Omzet ${omzetTrend.pct>0?'naik':'turun'} ${Math.round(Math.abs(omzetTrend.pct))}% dibanding ${TREND_WINDOW} hari sebelumnya${dialogDriver?`, terutama ${esc(dialogDriver.label)}`:''}.`):'';
  const summary=[omzetSentence,st?.wastePct!=null?wasteSentence(st):'',st?.lostPct!=null?lostSentence(st):''].filter(Boolean).join(' ');
  const advice=st?adviceText(st):'';
  const chip=(k,v,bad)=>`<div class="fd-outlet-chip ${bad==null?'':bad?'bad':'good'}"><span>${k}</span><b>${v}</b></div>`;
  const chips=`<div class="fd-outlet-chips">${chip(`Omzet · ${TREND_WINDOW} hari`,omzetTrend?(omzetTrend.fromZero?'baru':trendPctText(omzetTrend)):'—',omzetTrend&&!omzetTrend.fromZero?omzetTrend.pct<-8:null)}${chip(`Waste · batas ${W_TH}`,pct1(st?.wastePct??null),st?.wastePct!=null?st.wasteOver:null)}${chip('Kehabisan / hari',st?.lostPerDay!=null?Math.round(st.lostPerDay)+' mnt':'—',st?.lostSrc==='sheet'?st.lostOver:null)}</div>`;
  return `<dialog id="fd-outlet-dialog" class="fd-outlet-dialog" aria-labelledby="fd-outlet-title"><div class="dialog-head"><h2 id="fd-outlet-title">${esc(name)}</h2><button type="button" class="icon-button" data-outlet-detail-close aria-label="Tutup">×</button></div>
   ${chips}${summary?`<p class="fd-outlet-summary">${summary}${advice?` <b>${advice}</b>`:''}</p>`:''}
   <div class="fd-outlet-section"><h3>Omzet per produk</h3>${trendLine(omzetTrend,true)}${productRows.length?`<div class="fd-outlet-table-wrap"><table class="fd-outlet-table"><thead><tr><th>Produk</th><th>${TREND_WINDOW} hari terakhir</th><th>3 hari sebelumnya</th><th>Perubahan</th></tr></thead><tbody>${productRows.map(outletDetailRow).join('')}</tbody></table></div>`:'<p class="workspace-note">Belum ada penjualan tercatat.</p>'}</div>
   <div class="fd-outlet-section"><h3>Waste</h3>${trendLine(wasteTrend,false)}${wasteCoreRows.length?`<div class="fd-outlet-table-wrap"><table class="fd-outlet-table"><thead><tr><th>Produk inti</th><th>${TREND_WINDOW} hari terakhir</th><th>3 hari sebelumnya</th><th>Perubahan</th></tr></thead><tbody>${wasteCoreRows.map(outletWasteRow).join('')}</tbody></table></div><p class="fd-outlet-note">Cuma 4 SKU inti -- sheet WASTE belum merinci produk lain.</p>`:'<p class="workspace-note">Belum ada data waste tercatat.</p>'}</div>
   <div class="fd-outlet-section"><h3>Lost sales</h3>${st?.lostSrc==='sheet'?`<p class="workspace-note">Rata-rata kehabisan <b>${Math.round(st.lostPerDay)} menit sehari</b> dalam ${st.lostDays} hari terakhir yang tercatat.</p>`:''}${trendLine(lostTrend,false)}<p class="fd-outlet-note">Level outlet saja — sheet rekap belum merinci lost sales per produk.</p></div>
  </dialog>`;
 }
 // Mesin forecast generik -- dipakai terpisah untuk deret "omzet tanpa pesanan" dan deret
 // "omzet pesanan" (lihat revenueTrend) supaya tiap komponen punya baseline/tren/pola sendiri;
 // pesanan jauh lebih kecil (~3-4% omzet) dan lebih bergelombang daripada omzet reguler.
 // Prediksi PER OUTLET: gabungan 50:50 antara (a) pola tahun lalu outlet itu sendiri dan
 // (b) prediksi jaringan x porsi outlet itu dari total jaringan (per hari-minggu, 8 minggu
 // terakhir). Diuji mundur 2026-11-10 (28 outlet, origin tiap 2 minggu Mei-Okt, horizon 30
 // hari): akurasi harian 75,1% -> 76,4%, meleset total sebulan rata-rata 10,7% -> 9,6%.
 // Penjualan harian satu outlet memang jauh lebih bergejolak daripada jaringan (di jaringan
 // naik-turun 28 outlet saling menutupi), jadi ±76% harian adalah batas wajarnya -- semua
 // metode yang diuji mentok di 73-76%. Diterapkan sebagai faktor pengali di atas mesin outlet
 // (rasio gabungan / pola outlet), supaya pemisahan omzet murni vs pesanan tetap utuh.
 const yoyGrowthCache=new Map();
 function yoyMapAt(V,tag,origin,date,planner,robust){
  const gk=tag+'|'+origin;
  if(!yoyGrowthCache.has(gk)){let a=0,b=0,n=0;for(let k=0;k<56;k++){const d=planner.shift(origin,-k),x=V.get(d),y=V.get(planner.shift(d,-364));if(x!=null&&y!=null){a+=x;b+=y;n++;}}yoyGrowthCache.set(gk,n>=14&&b>0?a/b:null);}
  const g=yoyGrowthCache.get(gk);if(g==null)return null;
  const md=date.slice(5),hol=d=>{const m=d.slice(5);return m>='12-18'||m<='01-04';};
  if(md>='12-18'||md<='01-04'){const x=V.get(shiftYearDate(date,-1));if(x!=null)return x*g;}
  const vals=[];let s=0,w=0;[-14,-7,0,7,14].forEach((o,i)=>{const src=planner.shift(date,o-364);if(hol(src))return;const x=V.get(src);if(x!=null){const wt=[1,2,3,2,1][i];s+=x*wt;w+=wt;vals.push(x);}});
  if(!w)return null;
  return (robust?planner.quantile(vals,.5):s/w)*g;
 }
 function makeOutletAdjust(id,planner){
  const ds=dailyOutletProductSeries(),own=ds?.byOutlet.get(id);if(!own)return null;
  const V=new Map(own.map(p=>[p.date,p.gross])),N=new Map();
  for(const s of ds.byOutlet.values())for(const p of s)N.set(p.date,(N.get(p.date)||0)+p.gross);
  const wd=d=>new Date(d+'T12:00:00Z').getUTCDay(),cache=new Map();
  return (date,origin)=>{
   const key=date+'|'+origin;if(cache.has(key))return cache.get(key);
   let r=1;
   // a = pola outlet versi mesin (rata-rata berbobot) -- yang akan dikoreksi; ar = versi tahan
   // lonjakan: nilai tengah tahun lalu, dibatasi 1,3x median hari-minggu yang sama 8 minggu
   // terakhir (uji mundur: harian 76,4% -> 76,8%, meleset sebulan 9,6% -> 9,2%).
   const a=yoyMapAt(V,'o:'+id,origin,date,planner),n=yoyMapAt(N,'net',origin,date,planner);
   let ar=yoyMapAt(V,'o:'+id,origin,date,planner,true);
   const recent=[];let so=0,sn=0;for(let k=0;k<56;k++){const x=planner.shift(origin,-k);if(wd(x)!==wd(date))continue;const v=V.get(x),t=N.get(x);if(v!=null)recent.push(v);if(v!=null&&t){so+=v;sn+=t;}}
   if(ar!=null&&recent.length>=3)ar=Math.min(ar,planner.quantile(recent,.5)*1.3);
   if(a>0&&ar!=null&&n!=null&&sn>0)r=(.5*ar+.5*n*(so/sn))/a;
   cache.set(key,r);return r;
  };
 }
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
  function legacyAt(date){return baselineLevel==null?null:baselineLevel*trendFactor*weekdayShape(date)*seasonalFactor(date);}
  // Metode UTAMA sejak 2026-11-09: "pola tahun lalu x pertumbuhan terkini". Diuji mundur
  // (rolling origin tiap minggu Jan-Okt 2026, horizon 30 hari, omzet jaringan): di luar musim
  // Ramadan/Lebaran rata-rata meleset 3,0% untuk total sebulan & 7,0% per hari (WAPE), vs
  // 6,6% & 10,2% untuk mesin lama di atas (legacyAt) -- dan blend keduanya justru lebih buruk.
  //  - Patokan: hari yang SAMA minggunya tahun lalu (geser 364 hari, jadi Senin ketemu Senin),
  //    dihaluskan +-2 minggu dengan bobot 1-2-3-2-1 supaya satu hari aneh tahun lalu tidak
  //    terbawa mentah-mentah.
  //  - Pertumbuhan: total 56 hari terakhir / total 56 hari yang sama tahun lalu (pasangan
  //    tanggal yang dua-duanya ada saja -- lubang data dilewati, bukan dianggap nol).
  //  - 18 Des - 4 Jan disejajarkan per TANGGAL kalender (365 hari), bukan per hari-minggu:
  //    lonjakan Natal/Tahun Baru melekat ke tanggal (24-25 Des 2025: 89-91 jt/hari).
  // Batasan yang diketahui: hari raya yang tanggalnya bergeser tiap tahun (Ramadan/Lebaran,
  // ~11 hari lebih awal tiap tahun) TIDAK sejajar -- di Feb-Mar 2026 metode ini meleset 10-27%.
  // Kalau data tahun lalu tidak tersedia, kembali ke mesin lama (legacyAt).
  let yoyA=0,yoyB=0,yoyN=0;
  if(lastDate)for(let k=0;k<56;k++){const d=planner.shift(lastDate,-k),x=valueByDate.get(d),y=valueByDate.get(planner.shift(d,-364));if(x!=null&&y!=null){yoyA+=x;yoyB+=y;yoyN++;}}
  const yoyGrowth=yoyN>=14&&yoyB>0?yoyA/yoyB:null;
  const YOY_OFFSETS=[-14,-7,0,7,14],YOY_WEIGHTS=[1,2,3,2,1];
  // Masa libur Natal-Tahun Baru = 18 Des - 4 Jan (dari data 2025: lonjakan mulai 18 Des, reda
  // 5 Jan). Tanggal BIASA tidak boleh ikut menyerap tanggal libur tahun lalu lewat penghalusan
  // +-2 minggu -- tanpa pengecualian ini 1-17 Des 2026 sempat diprediksi Rp950 jt, LEBIH tinggi
  // dari tahun lalu (Rp895 jt) padahal tren sedang di bawah tahun lalu.
  const inHoliday=d=>{const md=d.slice(5);return md>='12-18'||md<='01-04';};
  function yoyAt(date){
   if(yoyGrowth==null)return null;
   if(inHoliday(date)){const x=valueByDate.get(shiftYearDate(date,-1));if(x!=null)return x*yoyGrowth;}
   let s=0,w=0;YOY_OFFSETS.forEach((o,i)=>{const src=planner.shift(date,o-364);if(inHoliday(src))return;const x=valueByDate.get(src);if(x!=null){s+=x*YOY_WEIGHTS[i];w+=YOY_WEIGHTS[i];}});
   return w?s/w*yoyGrowth:null;
  }
  function forecastAt(date){const y=yoyAt(date);return y!=null?y:legacyAt(date);}
  return {lastDate,baselineLevel,forecastAt,yoyGrowth};
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
 // ---- Penyesuaian prediksi dari performa tim (owner 2026-11-12) ----
 // Prediksi omzet REGULER hari berikutnya digeser sesuai waste & lost sales jaringan bulan
 // berjalan (3 hari pertama bulan / data < 3 tanggal: 7 tanggal terisi terakhir). WASTE
 // PRIORITAS: kalau waste di atas target, prediksi diturunkan (sebesar kelebihannya, maks 6%),
 // walaupun lost sales juga tinggi. Lost sales di atas ambang hanya menaikkan prediksi kalau
 // waste masih di bawah target, dan kenaikannya tidak boleh melebihi sisa ruang waste (maks 4%).
 // Target waste INTERNAL = ambang di Pengaturan - 0,3 poin (mis. 3,3% -> 3,0%) -- sengaja TIDAK
 // ditampilkan di web supaya forecaster tidak bingung dengan dua angka target.
 // Ini lapis OTOMATIS yang tidak ditampilkan (owner: "double buffer" -- saran buffer di Buat
 // forecast tetap tampil & dipakai seperti biasa, lapis ini sudah ada di dalam angka prediksi).
 // Hanya berlaku untuk tanggal >= PERF_FROM supaya prediksi hari-hari yang sudah lewat (dibekukan)
 // tidak berubah; tanggal lewat memakai data sebelum tanggal itu (sama seperti saat ditampilkan).
 const PERF_FROM='2026-11-13',PERF_MARGIN=0.3,PERF_MAX_CUT=6,PERF_MAX_ADD=4,PERF_LOST_GAIN=0.5;
 const perfCache=new Map();
 function perfAdjust(asOf){
  const recap=window.DAILY_RECAP_SUMMARY;
  const key=asOf+'|'+(recap?.updatedAt||'')+'|'+WASTE_THRESHOLD+'|'+LOST_SALES_THRESHOLD+'|'+(window.PcsPanels.data().sales?.days?.length||0);
  if(perfCache.has(key))return perfCache.get(key);
  const ds=dailyOutletProductSeries(),rev=new Map();
  if(ds)for(const [id,ser] of ds.byOutlet)for(const pt of ser)rev.set(pt.date+'|'+id,pt.gross);
  const ids=window.PcsPanels.data().sales?.outletIds||[],monthStart=asOf.slice(0,8)+'01',floor=window.ForecastPlanner.shift(asOf,-28);
  const pick=all=>{const m=all.filter(d=>d<asOf&&d>=monthStart);return m.length>=MIN_RECAP_DAYS?m:all.filter(d=>d<asOf&&d>=floor).slice(-RECAP_WINDOW_DAYS);};
  const wDates=pick(Object.keys(recap?.waste||{}).filter(d=>Object.keys(recap.waste[d]).length).sort());
  let wn=0,wr=0;for(const d of wDates)for(const id of ids){const g=rev.get(d+'|'+id);if(!(g>0))continue;wn+=recap.waste[d][id]?.nominal||0;wr+=g;}
  const lDates=pick(Object.keys(recap?.lostSalesMinutes||{}).sort());
  let lm=0,ln=0;for(const d of lDates)for(const m of Object.values(recap.lostSalesMinutes[d]||{}))if(Number.isFinite(m)){lm+=m;ln++;}
  const wastePct=wDates.length>=MIN_RECAP_DAYS&&wr>0?wn/wr*100:null,lostPct=lDates.length>=MIN_RECAP_DAYS&&ln>0?lm/ln/OPEN_MINUTES*100:null;
  const Wt=WASTE_THRESHOLD-PERF_MARGIN,L=LOST_SALES_THRESHOLD;
  let pct=0,kind='ok';
  if(wastePct==null&&lostPct==null)kind='nodata';
  else if(wastePct!=null&&wastePct>Wt){pct=-Math.min(PERF_MAX_CUT,wastePct-Wt);kind='waste';}
  else if(lostPct!=null&&lostPct>L){const room=wastePct==null?PERF_MAX_ADD:Math.max(0,Wt-wastePct);pct=Math.min(PERF_MAX_ADD,(lostPct-L)*PERF_LOST_GAIN,room);kind=pct>0?'lost':'ok';}
  const v={pct:Math.round(pct*10)/10,kind,wastePct,lostPct,monthly:wDates[0]>=monthStart,from:wDates[0]||null,to:wDates.at(-1)||null};
  perfCache.set(key,v);return v;
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
  // "Hari ini" TIDAK PERNAH dianggap hari yang sudah final untuk lastActual/tren, APAPUN isi
  // field complete-nya -- sinkronisasi malam (ALLOW_TODAY) sesekali bisa tertunda GitHub
  // Actions sampai lewat tengah malam dan salah menandai hari yang baru mulai sebagai
  // "terverifikasi kosong & selesai" (lihat pengaman WIB_HOUR di esb-forecast-refresh.yml).
  // Menyaring "hari ini" di sini jadi lapis kedua supaya lastActual/trendNow tidak pernah
  // ketipu oleh kejadian seperti itu, apapun penyebabnya. actualAt()/grafik di atas TIDAK
  // disaring di sini -- itu tetap menampilkan apa adanya data yang ada (akan otomatis benar
  // begitu sinkronisasi berikutnya menimpa angka yang salah).
  const todayStr=today();
  const totalSeries=[...byDate.entries()].filter(([date,e])=>e.known>0&&date<todayStr).map(([date,e])=>({date,value:e.sum*(expected/e.known)})).sort((a,b)=>a.date.localeCompare(b.date));
  const lastActual=totalSeries.at(-1)?.date||null;
  // Tren badge pakai omzet TANPA pesanan (lihat dailyOutletProductSeries/aggregateOrganicSeries),
  // bukan totalSeries mentah di atas -- supaya pesanan masuk tidak terbaca sebagai "tren naik".
  const organicSeries=aggregateOrganicSeries(list);
  const trendNow=weekTrend(organicSeries,planner);
  const trendDriver=trendNow?(trendNow.fromZero||trendNow.pct>0?productDriver(organicSeries,'up',planner):trendNow.pct<0?productDriver(organicSeries,'down',planner):null):null;
  const trendOutletName=outletId==='__all__'?null:(window.OUTLET_INTELLIGENCE?.outlets?.[outletId]?.name||outletId);
  const trendContext=trendNow?windowContext(trendNow.recentDates,trendOutletName):'';

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
  // Prediksi tanggal yang SUDAH LEWAT dibekukan (arahan owner 2026-11-10): sebelumnya semua
  // tanggal dihitung ulang tiap kali dashboard dibuka, jadi prediksi 9 Nov yang kemarin tampil
  // 38 jt berubah jadi 42 jt begitu omzet real 9 Nov masuk -- terutama karena bagian pesanannya
  // berganti dari angka pasti sheet PESANAN ke rata-rata mesin, plus faktor pertumbuhan ikut
  // bergeser. Sekarang tanggal lewat memakai prediksi "versi H-1": mesin yang hanya melihat data
  // SEBELUM tanggal itu, dengan aturan pesanan yang sama seperti saat itu (pesanan tercatat
  // dipakai pasti). Hasilnya sama persis dengan yang tampil sehari sebelumnya dan tidak berubah
  // lagi -- tanpa perlu menyimpan apa pun. Tanggal yang belum lewat tetap diperbarui tiap hari.
  const frozen=new Map();
  function frozenAt(date){
   if(!frozen.has(date)){
    const pe=buildEngine(pureSeries.filter(r=>r.date<date),planner),se=buildEngine(pesananSeries.filter(r=>r.date<date),planner);
    const pure=pe.forecastAt(date),known=knownPesananAt(date),pes=known!=null?known:se.forecastAt(date);
    frozen.set(date,{pure,pes});
   }
   return frozen.get(date);
  }
  const isPast=date=>lastActual&&date<=lastActual;
  const outletAdjust=outletId==='__all__'?null:makeOutletAdjust(outletId,planner);
  // Tanggal lewat: faktor dihitung dengan data s.d. H-1 (ikut dibekukan seperti prediksinya).
  const adj=date=>outletAdjust&&lastActual?outletAdjust(date,isPast(date)?planner.shift(date,-1):lastActual):1;
  // Penyesuaian performa tim (lihat perfAdjust): tanggal lewat memakai data sebelum tanggal itu,
  // tanggal mendatang memakai data s.d. kemarin.
  const perf=date=>{if(date<PERF_FROM)return 1;try{return 1+perfAdjust(isPast(date)?date:today()).pct/100;}catch{return 1;}};
  // ---- Kalibrasi bias terkini (owner 2026-11-13: "prediksi cenderung di atas real") ----
  // Uji mundur Agu-Nov 2026 (prediksi versi H-1 vs real, omzet reguler jaringan): mesin pola
  // tahun lalu x pertumbuhan makin sering KELEBIHAN sejak Okt (bias Okt +3,3%, Nov +3,5%,
  // 14 hari terakhir +3,7%), paling parah hari MINGGU (+11%, 8 dari 8 Minggu di atas real) --
  // Minggu Okt-Nov tahun lalu jauh lebih ramai daripada tahun ini. Koreksi: rasio real/prediksi
  // 28 hari terakhir, dicampur rasio hari yang sama (12 minggu, bobot n/(n+4)), diredam 75%,
  // dibatasi 0,85-1,10. Hasil uji mundur: error harian 5,18% -> 5,03%, bias +2,4% -> +1,5%,
  // 14 hari terakhir 5,49% -> 4,99% (bias +3,7% -> +2,0%), Minggu +11,2% -> +8,7%.
  // Hanya untuk tanggal >= CALIB_FROM supaya prediksi lama yang sudah tampil tidak berubah.
  const CALIB_FROM='2026-11-14',pureVal=new Map(pureSeries.map(r=>[r.date,r.value])),calibCache=new Map();
  function calib(date){
   if(date<CALIB_FROM||!lastActual)return 1;
   const end=date<=lastActual?date:planner.shift(lastActual,1);if(calibCache.has(date+'|'+end))return calibCache.get(date+'|'+end);
   const wd=new Date(date+'T12:00:00Z').getUTCDay();let gA=0,gF=0,gn=0,wA=0,wF=0,wn=0;
   for(let k=1;k<=84;k++){const d=planner.shift(end,-k),a=pureVal.get(d);if(a==null)continue;const f=frozenAt(d).pure;if(f==null||!(f>0))continue;
    if(k<=28){gA+=a;gF+=f;gn++;}if(new Date(d+'T12:00:00Z').getUTCDay()===wd){wA+=a;wF+=f;wn++;}}
   let c=1;if(gn>=7&&gF>0){const g=gA/gF,kw=wn/(wn+4);c=wn&&wF>0?g*(1-kw)+(wA/wF)*kw:g;c=Math.max(.85,Math.min(1.1,1+(c-1)*.75));}
   calibCache.set(date+'|'+end,c);return c;
  }
  const forecastPureAt=date=>{const v=isPast(date)?frozenAt(date).pure:pureEngine.forecastAt(date);return v==null?null:v*calib(date)*adj(date)*perf(date);};
  function forecastPesananAt(date){
   // Tanggal lewat yang sudah tercakup sheet PESANAN: outlet tanpa baris pesanan = 0, bukan
   // "tidak diketahui". Sebelumnya jatuh ke tebakan pola tahun lalu -- per outlet itu menyalin
   // pesanan besar tahun lalu (Muntilan 1-9 Nov: tebakan 6,2 jt vs pesanan real 2,7 jt).
   if(isPast(date)){const k=knownPesananAt(date);if(k!=null)return k;if(coveredSet.has(date)&&!blockedSet.has(date))return 0;const v=frozenAt(date).pes;return v==null?null:v*adj(date);}
   const known=knownPesananAt(date);if(known!=null)return known;
   const v=pesananEngine.forecastAt(date);return v==null?null:v*adj(date);
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
  return {rows,ym,ymNext,today:t,lastActual,hasHistory:totalSeries.length>=14,hasPlan:rows.some(r=>r.plan!=null),pesananUpliftPct,yoyGrowth:pureEngine.yoyGrowth,trendNow,trendDriver,trendContext};
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

 let WASTE_THRESHOLD=3.5,LOST_SALES_THRESHOLD=4.5; // Bawaan; bisa diubah di Pengaturan.
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
 // ---- Waste & lost sales per outlet, 7 hari terakhir yang sudah selesai ----
 // Sumber (arahan owner 2026-11-09): data sheet REKAP HARIAN FORECAST yang sudah ada -- tab
 // WASTE (nominal waste harian) dan tab "Rekap Forecast <bulan>" (menit kehabisan harian),
 // BUKAN rata-rata bulanan lama. Waste % = nominal waste sheet / omzet real ESB (termasuk
 // pesanan) pada tanggal & outlet yang SAMA -- rumus sama dengan PERFORMA OUTLET (waste dibagi
 // penjualan); tanggal yang belum diisi di sheet dilewati, bukan dianggap nol. Pengecualian:
 // outlet yang kiriman real-nya SUDAH dicatat forecaster di web (fulfillment, "dikirim vs
 // laku") pakai hitungan itu -- itu patokan akhirnya begitu datanya lengkap. Data bulan lalu
 // (PERFORMANCE_SUMMARY) SENGAJA tidak dipakai sama sekali (arahan owner): kalau sheet belum
 // mencatat outlet itu, tampil "—", bukan angka lama.
 const RECAP_WINDOW_DAYS=7,MIN_RECAP_DAYS=3;let OPEN_MINUTES=12*60;
 const CORE_SHORT=['Ogura Cheese','Ogura Choco','Malmil Cheese','Malmil Choco'];
 const pct1=n=>n==null?'—':n.toLocaleString('id-ID',{maximumFractionDigits:1})+'%';
 let W_TH=pct1(WASTE_THRESHOLD),L_TH=pct1(LOST_SALES_THRESHOLD);
 // Nama dicetak tebal -- beberapa nama outlet sendiri mengandung koma ("Pemuda, Magelang"),
 // jadi tanpa penanda visual daftar nama jadi rancu dibaca.
 const nameList=(a,max=3)=>{const n=a.map(x=>`<b>${esc(x)}</b>`),shown=n.slice(0,max),rest=n.length-shown.length;if(rest>0)return shown.join(', ')+` dan ${rest} outlet lain`;return shown.length<=1?(shown[0]||''):shown.slice(0,-1).join(', ')+' dan '+shown.at(-1);};
 let wasteLostCache=null;
 function wasteLostStats(){
  const recap=window.DAILY_RECAP_SUMMARY,ds=dailyOutletProductSeries(),cloud=window.ForecastPlanCloud;
  const settled=[...fulfillmentCache.values()].filter(v=>!v.loading).length;
  const key=[today(),recap?.updatedAt||'',ds?[...ds.byOutlet.values()].reduce((s,v)=>s+v.length,0):0,cloud?.records?.length||0,settled].join('|');
  if(wasteLostCache?.key===key)return wasteLostCache.value;
  // Periode = BULAN BERJALAN (cara tim membaca waste: "waste November"), kecuali di 3 hari
  // pertama bulan (data masih terlalu sedikit) -> 7 hari terakhir.
  const t=today(),monthStart=t.slice(0,8)+'01',from=Number(t.slice(8,10))>3?monthStart:window.ForecastPlanner.shift(t,-RECAP_WINDOW_DAYS),inWin=d=>d>=from&&d<t;
  const name=id=>window.OUTLET_INTELLIGENCE?.outlets?.[id]?.name||id;
  const rows=new Map(),get=id=>rows.get(id)||(rows.set(id,{id,name:name(id),wasteNominal:0,wasteRevenue:0,wasteDays:0,core:[0,0,0,0],lostMinutes:0,lostDays:0}),rows.get(id));
  for(const id of window.PcsPanels.data().sales?.outletIds||[])get(id);
  let wasteLast=null,lostLast=null;
  const revenueByKey=new Map();
  if(ds)for(const [id,s] of ds.byOutlet)for(const pt of s)revenueByKey.set(pt.date+'|'+id,pt.gross);
  // Sama seperti kolom Waste di sheet (IFERROR(FILTER(WASTE!AK...),"0")): untuk tanggal yang
  // SUDAH diisi tim, outlet tanpa baris waste = 0, bukan dibuang. Sebelumnya outlet-hari itu
  // dibuang dari pembagi sehingga persen waste membengkak (5,8% vs ±4% yang sebenarnya).
  const sheetWaste=recap?.waste||{};
  for(const date of Object.keys(sheetWaste)){
   if(!inWin(date)||!Object.keys(sheetWaste[date]).length)continue;
   for(const id of rows.keys()){
    const rev=revenueByKey.get(date+'|'+id);if(!(rev>0))continue;
    const e=sheetWaste[date][id],r=get(id);
    r.wasteNominal+=e?.nominal||0;r.wasteRevenue+=rev;r.wasteDays++;(e?.core||[]).forEach((v,k)=>{r.core[k]+=v||0;});
    if(!wasteLast||date>wasteLast)wasteLast=date;
   }
  }
  for(const [date,day] of Object.entries(recap?.lostSalesMinutes||{})){
   if(!inWin(date))continue;
   for(const [id,m] of Object.entries(day)){if(!Number.isFinite(m))continue;const r=get(id);r.lostMinutes+=m;r.lostDays++;if(!lostLast||date>lostLast)lostLast=date;}
  }
  const team=new Map((wasteByOutlet('__all__')||[]).map(r=>[r.id,r.percent]));
  const omzetTrendById=new Map((networkTrendExtremes()?.all||[]).map(r=>[r.id,r]));
  const list=[...rows.values()].map(r=>{
   let wastePct=null,wasteSrc=null;
   if(team.has(r.id)){wastePct=team.get(r.id);wasteSrc='kirim';}
   else if(r.wasteDays>=MIN_RECAP_DAYS){wastePct=r.wasteNominal/r.wasteRevenue*100;wasteSrc='sheet';}
   let lostPct=null,lostSrc=null,lostPerDay=null;
   if(r.lostDays>=MIN_RECAP_DAYS){lostPerDay=r.lostMinutes/r.lostDays;lostPct=lostPerDay/OPEN_MINUTES*100;lostSrc='sheet';}
   const maxCore=Math.max(...r.core),topCore=maxCore>0?r.core.indexOf(maxCore):null;
   const ot=omzetTrendById.get(r.id);
   return {...r,omzetPct:ot&&!ot.fromZero?ot.pct:null,wastePct,wasteSrc,lostPct,lostSrc,lostPerDay,topCore,wasteOver:wastePct!=null&&wastePct>WASTE_THRESHOLD,lostOver:lostSrc==='sheet'&&lostPct>LOST_SALES_THRESHOLD};
  }).filter(r=>r.wastePct!=null||r.lostPct!=null);
  const ws=list.filter(r=>r.wasteSrc==='sheet'),ls=list.filter(r=>r.lostSrc==='sheet');
  const wRev=ws.reduce((s,r)=>s+r.wasteRevenue,0),lDays=ls.reduce((s,r)=>s+r.lostDays,0);
  const net={wastePct:wRev>0?ws.reduce((s,r)=>s+r.wasteNominal,0)/wRev*100:null,lostPerDay:lDays>0?ls.reduce((s,r)=>s+r.lostMinutes,0)/lDays:null};
  net.lostPct=net.lostPerDay==null?null:net.lostPerDay/OPEN_MINUTES*100;
  const value={list,net,wasteLast,lostLast,from,lostFromSheet:ls.length>0,wasteFromSheet:ws.length>0};
  wasteLostCache={key,value};
  return value;
 }
 // Kalimat dibuat bervariasi sesuai seberapa jauh lewat batas, bukan template yang sama
 // untuk semua outlet -- owner minta bahasanya natural, tidak kaku/monoton.
 function wasteSentence(r){
  if(!r.wasteOver)return `Waste ${pct1(r.wastePct)}, masih aman di bawah batas ${W_TH}.`;
  const ratio=r.wastePct/WASTE_THRESHOLD;
  const level=ratio>=2?'lebih dari dua kali batas':ratio>=1.5?'jauh di atas batas':'sedikit di atas batas';
  return `Waste ${pct1(r.wastePct)}, ${level}${r.topCore!=null?` — sisa terbanyak ${CORE_SHORT[r.topCore]}`:''}.`;
 }
 function lostSentence(r){
  const m=Math.round(r.lostPerDay);
  if(!r.lostOver)return m>0?`Stok habis rata-rata ${m} menit per hari, masih dalam batas.`:'Stok hampir tidak pernah habis.';
  const hours=m>=60?` (±${(m/60).toLocaleString('id-ID',{maximumFractionDigits:1})} jam)`:'';
  return `Stok habis rata-rata ${m} menit per hari${hours}.`;
 }
 function adviceText(r){
  if(r.wasteOver&&r.lostOver)return 'Sisa tinggi namun stok juga sering habis — kemungkinan komposisi produk yang perlu disesuaikan, bukan jumlah totalnya.';
  // Waste tinggi TAPI omzet sedang naik tajam: memotong kiriman justru berisiko kehabisan --
  // cukup tahan (jangan ditambah) sampai lonjakannya jelas bertahan.
  const prod=r.topCore!=null?CORE_SHORT[r.topCore]:'kiriman';
  if(r.wasteOver&&r.omzetPct!=null&&r.omzetPct>=OMZET_HL)return `Omzet sedang naik, jadi kiriman ${prod} cukup dipertahankan, belum perlu ditambah.`;
  if(r.wasteOver&&r.omzetPct!=null&&r.omzetPct<=-OMZET_HL)return `Omzet juga sedang turun, kurangi kiriman ${prod}.`;
  if(r.wasteOver)return r.topCore!=null?`Kurangi kiriman ${prod}.`:'Kurangi kiriman secara bertahap.';
  if(r.lostOver)return r.wastePct!=null&&r.wastePct<WASTE_THRESHOLD*.6?'Waste rendah, kiriman masih aman ditambah.':'Tambah kiriman secara bertahap sambil memantau waste.';
  return '';
 }
 function srcTag(src){return src==='kirim'?'dikirim vs laku':'';}
 function wasteLostTable(list){
  const cell=(v,over,extra)=>`<td class="${v==null?'fd-wl-stale':over?'fd-wl-bad':'fd-wl-good'}">${pct1(v)}${extra||''}</td>`;
  const rows=list.slice().sort((a,b)=>(b.wastePct??-1)-(a.wastePct??-1)).map(r=>`<tr><td><button type="button" class="fd-wl-link" data-outlet-detail="${esc(r.id)}">${esc(r.name)}</button></td>${cell(r.wastePct,r.wasteOver)}${cell(r.lostPct,r.lostOver,r.lostPerDay!=null?` <small>${Math.round(r.lostPerDay)} mnt</small>`:'')}</tr>`).join('');
  return `<details class="fd-trend-full"><summary>Lihat semua outlet (${list.length})</summary><div class="fd-outlet-table-wrap"><table class="fd-outlet-table fd-wl-table"><thead><tr><th>Outlet</th><th>Waste</th><th>Lost sales / hari</th></tr></thead><tbody>${rows}</tbody></table></div></details>`;
 }
 function wasteLostCard(outletId){
  const s=wasteLostStats();
  if(!s.list.length)return '';
  const period=s.from.endsWith('-01')?`${months[Number(s.from.slice(5,7))-1].toUpperCase()}${s.wasteLast?` (S.D. ${dateLabelShort(s.wasteLast).toUpperCase()})`:''}`:`${RECAP_WINDOW_DAYS} HARI TERAKHIR`;
  const label=`<span class="micro-label">WASTE &amp; LOST SALES · ${period} · BATAS WASTE ${W_TH} · LOST SALES ${L_TH}</span>`;
  if(outletId!=='__all__'){
   const r=s.list.find(x=>x.id===outletId);if(!r)return '';
   const lines=[r.wastePct!=null?wasteSentence(r):'',r.lostPct!=null?lostSentence(r):''].filter(Boolean).join(' ');
   const advice=adviceText(r);
   return `<article class="workspace-card fd-wl-card ${r.wasteOver||r.lostOver?'fd-waste-warning':'fd-wl-ok'}">${label}<p class="fd-wl-summary">${lines}${advice?` <b>${advice}</b>`:''}</p></article>`;
  }
  const wOver=s.list.filter(r=>r.wasteOver).sort((a,b)=>b.wastePct-a.wastePct),lOver=s.list.filter(r=>r.lostOver).sort((a,b)=>b.lostPct-a.lostPct);
  const tile=(big,small,tone)=>`<div class="fd-overview-stat${tone?' fd-overview-'+tone:''}"><b>${big}</b><span>${small}</span></div>`;
  const tiles=[
   s.net.wastePct!=null?tile(pct1(s.net.wastePct),'waste jaringan',s.net.wastePct>WASTE_THRESHOLD?'down':'up'):'',
   tile(wOver.length,'outlet waste di atas batas',wOver.length?'down':'up'),
   s.net.lostPerDay!=null?tile(Math.round(s.net.lostPerDay)+' mnt','kehabisan / outlet / hari',s.net.lostPct>LOST_SALES_THRESHOLD?'down':'up'):'',
   s.lostFromSheet?tile(lOver.length,'outlet sering kehabisan stok',lOver.length?'down':'up'):tile('—','lost sales harian belum masuk',''),
  ].join('');
  const sentences=[];
  if(s.net.wastePct!=null){
   const head=s.net.wastePct>WASTE_THRESHOLD?`Waste jaringan ${pct1(s.net.wastePct)}, di atas batas ${W_TH}`:`Waste jaringan ${pct1(s.net.wastePct)}, masih di bawah batas ${W_TH}`;
   sentences.push(wOver.length?`${head} — ${wOver.length} outlet di atas batas, tertinggi di ${nameList(wOver.slice(0,3).map(r=>r.name))}.`:`${head}, dan belum ada outlet yang melewati batas.`);
  }
  if(lOver.length)sentences.push(`${lOver.length} outlet sering kehabisan stok, terutama ${nameList(lOver.slice(0,2).map(r=>r.name))}.`);
  else if(s.net.lostPerDay!=null)sentences.push('Lost sales semua outlet masih dalam batas wajar.');
  // Tabel "perlu perhatian" menggantikan 3 kelompok kartu berkalimat panjang (owner: kurang
  // rapi). Satu baris per outlet: angka, status, dan saran singkat; penjelasan lengkap tetap
  // ada di dialog outlet (klik nama).
  const prio=r=>(r.wasteOver&&r.lostOver?0:r.wasteOver?1:2);
  const sev=r=>(r.wastePct??0)/WASTE_THRESHOLD+(r.lostPct??0)/LOST_SALES_THRESHOLD;
  const attention=s.list.filter(r=>r.wasteOver||r.lostOver).sort((x,y)=>prio(x)-prio(y)||sev(y)-sev(x));
  const status=r=>r.wasteOver&&r.lostOver?['both','Waste tinggi & sering habis']:r.wasteOver?['waste','Waste tinggi']:['lost','Sering habis'];
  const shortAdvice=r=>{
   const prod=r.topCore!=null?CORE_SHORT[r.topCore]:'kiriman';
   if(r.wasteOver&&r.lostOver)return 'Sesuaikan komposisi produk';
   if(r.wasteOver&&r.omzetPct!=null&&r.omzetPct>=OMZET_HL)return `Tahan ${prod}, omzet sedang naik`;
   if(r.wasteOver)return `Kurangi ${prod}`;
   return r.wastePct!=null&&r.wastePct<WASTE_THRESHOLD*.6?'Tambah kiriman':'Tambah bertahap';
  };
  const cell=(v,over,txt)=>`<td class="${v==null?'fd-wl-stale':over?'fd-wl-bad':'fd-wl-good'}">${txt}</td>`;
  const row=r=>{const [k,l]=status(r);return `<tr><td><button type="button" class="fd-wl-link" data-outlet-detail="${esc(r.id)}">${esc(r.name)}</button></td>${cell(r.wastePct,r.wasteOver,pct1(r.wastePct))}${cell(r.lostPerDay,r.lostOver,r.lostPerDay!=null?Math.round(r.lostPerDay)+' mnt':'—')}<td><span class="fd-wl-pill ${k}">${l}</span></td><td class="fd-wl-advice">${esc(shortAdvice(r))}</td></tr>`;};
  const head='<thead><tr><th>Outlet</th><th>Waste</th><th>Habis stok/hari</th><th>Status</th><th>Saran</th></tr></thead>';
  const TOP=8,top=attention.slice(0,TOP),rest=attention.slice(TOP);
  const tableHtml=list=>`<div class="fd-outlet-table-wrap"><table class="fd-outlet-table fd-wl-table fd-wl-attn">${head}<tbody>${list.map(row).join('')}</tbody></table></div>`;
  const table=attention.length?`<span class="fd-trend-group-title">Perlu perhatian · klik nama untuk rincian</span>${tableHtml(top)}${rest.length?`<details class="fd-trend-full"><summary>Lihat ${rest.length} outlet lain yang perlu perhatian</summary>${tableHtml(rest)}</details>`:''}`:'';
  const alarm=wOver.length||lOver.length;
  return `<article class="workspace-card fd-wl-card ${alarm?'fd-waste-warning':'fd-wl-ok'}">${label}<div class="fd-overview">${tiles}</div>${sentences.length?`<p class="fd-wl-summary">${sentences.join(' ')}</p>`:''}${table}${wasteLostTable(s.list)}</article>`;
 }

 // Pemetaan outlet -> area tim forecaster (3 area operasional sesuai pembagian wilayah owner,
 // BUKAN klaster otomatis) -- supaya tiap forecaster yang memegang satu wilayah bisa fokus
 // filter peta cuaca ke outlet yang mereka tangani saja.
 const OUTLET_AREA={
  // Area 1: Jogja, Klaten, Magelang, Muntilan, Temanggung
  godean:'Area 1',umy:'Area 1','jakal-uii':'Area 1','nusa-indah':'Area 1',tajem:'Area 1',
  merbabu:'Area 1',rajawali:'Area 1',
  'pemuda-magelang':'Area 1',muntilann:'Area 1',temanggung:'Area 1',
  // Area 2: Solo, Sukoharjo, Sragen, Karanganyar, Boyolali
  uns:'Area 2',ums:'Area 2',makamhaji:'Area 2',nusukan:'Area 2',laweyan:'Area 2',sukoharjo:'Area 2',
  sragen:'Area 2',karanganyar:'Area 2',boyolali:'Area 2',
  // Area 3: Semarang, UKSW (Salatiga), Ambarawa
  'gajah-raya':'Area 3',udinus:'Area 3',unnes:'Area 3',undip:'Area 3',
  sampangan:'Area 3',unimus:'Area 3',ngaliyan:'Area 3',
  uksw:'Area 3',ambarawa:'Area 3',
 };
 const AREA_LABEL={
  'Area 1':'Area 1 · Jogja/Klaten/Magelang/Temanggung',
  'Area 2':'Area 2 · Solo/Sukoharjo/Sragen/Karanganyar/Boyolali',
  'Area 3':'Area 3 · Semarang/Salatiga/Ambarawa',
 };
 function areaOf(id){return OUTLET_AREA[id]||'Lainnya';}
 let weatherAreaFilter='__all__';
 function weatherRowsInArea(rows){return weatherAreaFilter==='__all__'?rows:rows.filter(r=>areaOf(r.id)===weatherAreaFilter);}

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
 function weatherOutletListHtml(rows){
  return rows.slice().sort((a,b)=>(b.today??-1)-(a.today??-1)).map(r=>{const [icon]=weatherIcon(r.code,r.today);return `<button type="button" class="weather-outlet-row ${r.today!=null&&r.today>=RAIN_RISK?'risk':''}" data-weather-focus="${esc(r.id)}"><span class="weather-outlet-icon">${icon}</span><span class="weather-outlet-name">${esc(r.name)}</span><span class="weather-outlet-pct">${r.today==null?'—':r.today+'%'}</span></button>`;}).join('')||'<p class="fp-caption">Tidak ada outlet di area ini.</p>';
 }
 function weatherAreaOptions(rows){
  const counts=new Map();
  for(const r of rows){const a=areaOf(r.id);counts.set(a,(counts.get(a)||0)+1);}
  const areas=[...counts.keys()].sort((a,b)=>a.localeCompare(b,'id'));
  return `<option value="__all__" ${weatherAreaFilter==='__all__'?'selected':''}>Semua area (${rows.length})</option>`+
   areas.map(a=>`<option value="${esc(a)}" ${weatherAreaFilter===a?'selected':''}>${esc(AREA_LABEL[a]||a)} (${counts.get(a)})</option>`).join('');
 }
 function weatherMapSection(rows){
  if(!rows.length)return '';
  return `<div class="weather-map-toolbar"><label for="weather-area-select">Fokus area</label><select id="weather-area-select" class="weather-area-select">${weatherAreaOptions(rows)}</select></div><div class="weather-map-layout"><div class="weather-leaflet-wrap"><div id="weather-leaflet-map" class="weather-leaflet" role="img" aria-label="Peta interaktif cuaca outlet"></div><button type="button" class="weather-reset-btn" id="weather-reset-view" title="Lihat semua outlet">⟲ Semua outlet</button></div><div class="weather-outlet-list">${weatherOutletListHtml(weatherRowsInArea(rows))}</div></div>`;
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
 // Demografi member per outlet (sumber: collection Firestore "users", diagregasi read-only
 // di integration/customer-demographics.mjs -- tidak pernah ada data pribadi individu di sini,
 // cuma hitungan). null kalau bundle belum punya CUSTOMER_DEMOGRAPHICS (sync belum jalan sejak
 // rule /users dipublish) atau outlet ini tidak punya member yang homeOutlet-nya ter-map.
 function demographicsFor(id){
  const d=window.CUSTOMER_DEMOGRAPHICS?.perOutlet?.[id];
  if(!d||!d.total)return null;
  const topAge=Object.entries(d.byAge||{}).filter(([,n])=>n>0).sort((a,b)=>b[1]-a[1])[0]?.[0];
  const l=d.byGender?.L||0,p=d.byGender?.P||0,gTotal=l+p;
  return {total:d.total,topAge,pctL:gTotal?Math.round(l/gTotal*100):null,pctP:gTotal?Math.round(p/gTotal*100):null};
 }
 // Popup LENGKAP (cuaca + akurasi/waste/lost sales + produk unggulan + demografi + SWOT
 // ringkas) -- owner minta semuanya tetap di popup, TIDAK berpindah halaman (sebelumnya ada
 // tombol ke Ringkasan outlet, dihapus atas permintaan: mengganggu alur, cukup di sini saja).
 function popupHtml(r){
  const [icon,label]=weatherIcon(r.code,r.today),[iconT,labelT]=weatherIcon(r.codeTomorrow,r.tomorrow);
  const temp=r.tempMax!=null&&r.tempMin!=null?`${Math.round(r.tempMin)}–${Math.round(r.tempMax)}°C`:'';
  const o=window.OUTLET_INTELLIGENCE?.outlets?.[r.id];
  const risk=r.today!=null&&r.today>=RAIN_RISK;
  const wl=wasteLostStats().list.find(x=>x.id===r.id);
  const acc=outletAccuracy(r.id),waste={percent:wl?.wastePct??null},lost={percent:wl?.lostPct??null};
  const stat=(label,val,threshold)=>`<div class="weather-popup-stat"><span>${label}</span><b class="${val==null?'':threshold!=null&&val>threshold?'fp-down':'fp-up'}">${val==null?'—':val.toLocaleString('id-ID',{maximumFractionDigits:1})+'%'}</b></div>`;
  const swot=o?[['Kekuatan',o.strength],['Perlu diperbaiki',o.weakness],['Peluang',o.opportunity],['Tantangan',o.threat]].filter(([,v])=>v):[];
  // Nama outlet dibuat "sticky" (tetap terlihat saat isi popup di-scroll) -- berguna sekarang
  // popup bisa lebih tinggi dari kotak peta dan harus di-scroll (lihat perbaikan terpotong
  // di pcs-panel.css: .leaflet-popup-content-wrapper).
  return `<div class="weather-popup"><div class="weather-popup-head">${esc(r.name)}${risk?'<span class="weather-popup-risk-tag">🌧️ Hujan tinggi</span>':''}</div>
   ${r.now?.code!=null?(()=>{const [iN,lN]=weatherIcon(r.now.code,null);return `<div class="weather-popup-row"><span>${iN}</span><div><b>Sekarang${r.now.time?' · '+esc(r.now.time.slice(11,16)):''}</b><br>${esc(lN)}${r.now.temp!=null?' · '+Math.round(r.now.temp)+'°C':''}</div></div>`;})():''}
   <div class="weather-popup-row"><span>${icon}</span><div><b>Hari ini</b><br>${esc(label)} · peluang hujan ${r.today==null?'belum tersedia':r.today+'%'}${r.rainMm!=null&&r.rainMm>=1?' · ±'+Math.round(r.rainMm)+' mm':''}${temp?' · '+temp:''}</div></div>
   <div class="weather-popup-row"><span>${iconT}</span><div><b>Besok</b><br>${esc(labelT)} · peluang hujan ${r.tomorrow==null?'belum tersedia':r.tomorrow+'%'}</div></div>
   <div class="weather-popup-stats">${stat('Akurasi forecast',acc?.wape,null)}${stat('Waste',waste?.percent,WASTE_THRESHOLD)}${stat('Lost sales',lost?.percent,LOST_SALES_THRESHOLD)}</div>
   ${o?.products?.[0]?`<p class="weather-popup-line">🏆 Produk terlaris: <b>${esc(o.products[0].name)}</b>${o.products[0].salesShare!=null?` (${o.products[0].salesShare.toLocaleString('id-ID',{maximumFractionDigits:1})}%)`:''}</p>`:''}
   ${o?.customers?`<p class="weather-popup-line">👥 Pelanggan: ${esc(o.customers)}</p>`:''}
   ${(()=>{const dm=demographicsFor(r.id);return dm?`<p class="weather-popup-line">👤 Member terdaftar: <b>${dm.total.toLocaleString('id-ID')}</b>${dm.topAge?` · dominan usia <b>${esc(dm.topAge)}</b>`:''}${dm.pctL!=null?` · ${dm.pctL}% L / ${dm.pctP}% P`:''}</p>`:'';})()}
   ${swot.length?`<div class="weather-popup-swot">${swot.map(([k,v])=>`<p><b>${k}:</b> ${esc(v)}</p>`).join('')}</div>`:''}
  </div>`;
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
  }
  const rows=weatherRowsInArea(lastWeatherRows),seen=new Set();
  for(const r of rows){
   const o=window.OUTLET_DATA?.outlets?.find(x=>x.id===r.id);if(!o)continue;
   seen.add(r.id);
   const [icon]=weatherIcon(r.code,r.today),risk=r.today!=null&&r.today>=RAIN_RISK;
   const html=`<div class="weather-pin ${risk?'risk':''}"><span>${icon}</span><small>${r.today==null?'—':r.today+'%'}</small></div>`;
   const icon2=L.divIcon({className:'',html,iconSize:[40,40],iconAnchor:[20,40],popupAnchor:[0,-38]});
   const existing=leafletMarkers.get(r.id);
   if(existing){existing.setIcon(icon2);existing.setPopupContent(popupHtml(r));}
   else{const m=L.marker([o.lat,o.lon],{icon:icon2,title:r.name}).addTo(leafletMap).bindPopup(popupHtml(r));leafletMarkers.set(r.id,m);}
  }
  for(const [id,m] of [...leafletMarkers])if(!seen.has(id)){leafletMap.removeLayer(m);leafletMarkers.delete(id);}
  function resetMapView(){
   if(!leafletMarkers.size)return;
   leafletMap.closePopup();
   if(leafletMarkers.size===1){const only=[...leafletMarkers.values()][0];leafletMap.setView(only.getLatLng(),14);}
   else leafletMap.fitBounds(L.latLngBounds([...leafletMarkers.values()].map(m=>m.getLatLng())),{padding:[28,28]});
  }
  if(!leafletFitted&&leafletMarkers.size){leafletFitted=true;resetMapView();}
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
  // Tombol "Semua outlet": kembali ke tampilan peta penuh (fitBounds semua marker + tutup
  // popup) tanpa perlu ganti pilihan outlet di dropdown atas -- permintaan owner, supaya
  // setelah fokus ke satu outlet (lewat klik marker/daftar) tidak perlu navigasi manual.
  const resetBtn=document.getElementById('weather-reset-view');
  if(resetBtn)resetBtn.onclick=resetMapView;
  // Filter area: dipilih sekali, lalu bertahan antar outlet/tab (module-level) supaya
  // forecaster yang fokus satu wilayah tidak perlu pilih ulang tiap kali pindah layar.
  // Mengubah filter cukup sinkronkan ulang marker+daftar dari data cuaca yang SUDAH ada
  // (lastWeatherRows) -- tidak perlu panggil API cuaca lagi.
  const areaSelect=document.getElementById('weather-area-select');
  if(areaSelect&&!areaSelect.dataset.wired){
   areaSelect.dataset.wired='1';
   areaSelect.addEventListener('change',()=>{
    weatherAreaFilter=areaSelect.value;
    const listEl=document.querySelector('.weather-outlet-list');
    if(listEl)listEl.innerHTML=weatherOutletListHtml(weatherRowsInArea(lastWeatherRows));
    leafletFitted=false;
    mountWeatherMap();
   });
  }
 }
 let lastWeatherRows=[];
 async function weatherHighlights(outletId){
  const sales=window.PcsPanels.data().sales;if(!sales)return '<p class="workspace-note">Data outlet belum termuat.</p>';
  const list=outletIds(outletId,sales);if(!list.length)return '<p class="workspace-note">Pilih outlet untuk lihat cuaca.</p>';
  const t=today(),tomorrow=window.ForecastPlanner.shift(t,1);
  let map;try{map=await window.WeatherForecast.getNetwork(list,t,tomorrow);}catch{return '<p class="workspace-note">Layanan cuaca belum dapat dihubungi.</p>';}
  const name=id=>window.OUTLET_INTELLIGENCE?.outlets?.[id]?.name||id;
  const mapRows=[];
  for(const [id,w] of map){
   const d0=w.error?null:w.days.find(d=>d.date===t),d1=w.error?null:w.days.find(d=>d.date===tomorrow);
   mapRows.push({id,name:name(id),today:d0?.probability??null,code:d0?.conditionCode??null,tomorrow:d1?.probability??null,codeTomorrow:d1?.conditionCode??null,tempMax:d0?.tempMax??null,tempMin:d0?.tempMin??null,rainMm:d0?.precipitationMm??null,now:w.error?null:w.now||null});
  }
  lastWeatherRows=mapRows;
  // Daftar per-area (teks) sebelumnya di bawah peta DIHAPUS atas permintaan owner -- mengganggu
  // estetika dan sudah dobel dengan peta + daftar outlet yang sudah ada.
  return weatherMapSection(mapRows);
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
 // Skeleton berbentuk sama seperti hasil akhir (kotak peta + toolbar + daftar outlet) supaya
 // transisi ke data asli tidak "melompat" -- bukan cuma teks "Memuat..." polos.
 const WEATHER_SKELETON=`<div class="weather-map-toolbar"><span class="skeleton" style="display:inline-block;width:160px;height:30px;border-radius:7px"></span></div><div class="weather-map-layout"><div class="weather-leaflet-wrap"><div class="weather-leaflet skeleton"></div></div><div class="weather-outlet-list">${Array(6).fill('<span class="skeleton" style="display:block;height:34px;margin:2px 0;border-radius:7px"></span>').join('')}</div></div>`;
 let weatherHtml=WEATHER_SKELETON,weatherKey='';
 function ensureWeather(outletId){
  const key=outletId+'|'+today();
  if(weatherKey===key)return;
  weatherKey=key;weatherHtml=WEATHER_SKELETON;
  weatherHighlights(outletId).then(html=>{if(weatherKey===key){weatherHtml=html;window.dispatchEvent(new Event('forecast-operations-changed'));}});
 }
 // Ringkasan omzet per bulan di bawah grafik -- jawaban langsung untuk "berapa total omzet
 // bulan ini/bulan depan" tanpa harus menjumlah titik grafik. "Perkiraan akhir bulan" =
 // omzet real untuk hari yang sudah lewat + prediksi untuk sisa harinya (beda dari "prediksi
 // sebulan" yang murni angka mesin untuk SEMUA hari, termasuk yang sudah lewat).
 function monthSummaryHtml(trend){
  const sum=(rows,k)=>rows.reduce((s,r)=>s+(r[k]||0),0);
  const cards=[trend.ym,trend.ymNext].map(ym=>{
   const rows=trend.rows.filter(r=>r.date.startsWith(ym));
   const pred=sum(rows,'forecastTotal'),pure=sum(rows,'forecastPure');
   if(!(pred>0))return '';
   const elapsed=trend.lastActual?rows.filter(r=>r.date<=trend.lastActual&&r.actualTotal!=null):[];
   const real=sum(elapsed,'actualTotal'),projected=real+sum(rows.filter(r=>!elapsed.includes(r)),'forecastTotal');
   const title=months[Number(ym.slice(5,7))-1]+' '+ym.slice(0,4);
   const line=(k,v,sub)=>`<div class="fd-month-line"><span>${k}</span><b title="${esc(money(Math.round(v)))}">${moneyBig(v)}</b>${sub?`<small>${sub}</small>`:''}</div>`;
   return `<div class="fd-month-card"><div class="fd-month-head"><b>${title}</b></div>
    ${line('Prediksi sebulan',pred,`tanpa pesanan ${moneyBig(pure)}`)}
    ${elapsed.length?line(`Real s.d. ${dateLabelShort(elapsed.at(-1).date)}`,real,`${elapsed.length} hari`):''}
    ${elapsed.length?line('Perkiraan akhir bulan',projected,'real + prediksi sisa hari'):''}
</div>`;
  }).filter(Boolean);
  if(!cards.length)return '';
  return `<div class="fd-month-summary">${cards.join('')}</div>`;
 }
 // Akurasi bulan berjalan di puncak dashboard: prediksi sistem (versi H-1 yang dibekukan, jadi
 // ini akurasi yang jujur -- angka yang memang tampil sebelum harinya) vs omzet real, plus
 // akurasi rencana tim bulan yang sama (WAPE PCS, rumus sama dengan "Akurasi A" di bawah).
 // Estimasi waste dari rencana tim (owner 2026-11-13): rencana terakhir (reguler+pesanan) vs total
 // terjual per produk inti, TANPA transfer antar outlet. Batas bawah = kalau semua kelebihan bisa
 // ditransfer (dijumlah per tanggal & produk dulu). Bukan waste tercatat tim.
 function estWasteNote(est){
  if(!est||!est.n||!(est.sv>0))return '';
  let wt=0;for(const q of est.pool.values())wt+=Math.max(0,q.out-q.sold)*q.h;
  const p=est.w/est.sv*100,pt=wt/est.sv*100,bad=p>WASTE_THRESHOLD;
  return `<p class="fd-est-waste ${bad?'bad':''}"><b>Estimasi waste dari rencana tim: ${pct1(p)}</b> (${Math.round(est.pcs).toLocaleString('id-ID')} pcs · ${moneyBig(est.w)}, ${est.n} rencana) — rencana terakhir dikurangi total terjual, nominal pakai HPP outlet, <b>tanpa transfer</b> antar outlet. Kalau semua kelebihan bisa ditransfer: ±${pct1(pt)}. Ambang ${W_TH}. Waste real biasanya di antara kedua angka ini.</p>`;
 }
 function accuracyCard(trend,outletId){
  const days=trend.rows.filter(r=>r.date.startsWith(trend.ym)&&trend.lastActual&&r.date<=trend.lastActual&&r.actualTotal!=null&&r.forecastTotal!=null);
  if(!days.length)return '';
  const rows=[];let est=null;
  // 1) Prediksi sistem: versi H-1 yang dibekukan vs omzet real (semua produk, termasuk pesanan).
  {const A=days.reduce((s,r)=>s+r.actualTotal,0),F=days.reduce((s,r)=>s+r.forecastTotal,0),E=days.reduce((s,r)=>s+Math.abs(r.forecastTotal-r.actualTotal),0);
   rows.push({label:'Prediksi sistem',sub:`${days.length} hari`,acc:Math.max(0,100-E/A*100),bias:(F-A)/A*100,F,A,verb:'kiriman dari angka prediksi'});}
  // 2) & 3) Forecaster, dalam RUPIAH (owner, 2026-11-10) supaya sebanding dengan prediksi sistem:
  // per SKU inti, |rencana - laku reguler| x harga yang tersimpan di rencana itu. "Rencana awal" =
  // baseline yang diisi malam sebelumnya (tidak bisa diubah setelah tahu hasil); "Pengiriman real" =
  // jumlah yang benar2 dikirim setelah penyesuaian produksi (gagal/kelebihan produksi).
  const cloud=window.ForecastPlanCloud,panels=window.PcsPanels.data(),planner=window.ForecastPlanner;
  if(cloud?.state==='ready'&&panels.sales&&panels.orders){
   const plan={F:0,A:0,E:0,n:0},ship={F:0,A:0,E:0,n:0};est={w:0,sv:0,pcs:0,n:0,pool:new Map()};
   for(const r of cloud.records||[]){
    if(!r.date.startsWith(trend.ym)||r.date>trend.lastActual||(outletId!=='__all__'&&r.outlet!==outletId))continue;
    const fc=fulfillmentFor(r.key),shipped=!fc.loading&&fc.data?fc.data.shipped:null;
    const c=planner.compare(r,panels.sales,panels.orders,shipped);
    if(c.est){est.w+=c.estWasteValue;est.sv+=c.soldValue;est.pcs+=c.estWastePcs;est.n++;c.est.forEach((e,p)=>{const k=r.date+'|'+p,q=est.pool.get(k)||{out:0,sold:0,h:0};q.out+=e.out;q.sold+=e.sold;q.h=e.h;est.pool.set(k,q);});}
    if(!c.eligible||!c.complete)continue;
    const price=p=>Number(r.baseline.prices?.[p]?.value)||0;
    let pf=0,pa=0,pe=0,sf=0,se=0;
    for(const row of c.rows){const v=price(row.p);pf+=row.planned*v;pa+=row.actual*v;pe+=Math.abs(row.planned-row.actual)*v;if(c.hasShipped){sf+=row.shipped*v;se+=Math.abs(row.shipped-row.actual)*v;}}
    if(!(pa>0))continue;
    plan.F+=pf;plan.A+=pa;plan.E+=pe;plan.n++;
    if(c.hasShipped){ship.F+=sf;ship.A+=pa;ship.E+=se;ship.n++;}
   }
   const add=(o,label,verb,empty)=>rows.push(o.n&&o.A>0?{label,sub:`${o.n} rencana`,acc:Math.max(0,100-o.E/o.A*100),bias:(o.F-o.A)/o.A*100,F:o.F,A:o.A,verb}:{label,empty});
   add(plan,'Rencana forecaster (awal)','rencana','Belum ada rencana bulan ini');
   add(ship,'Pengiriman real','kiriman','Jumlah kiriman real belum dicatat');
  }
  const month=months[Number(trend.ym.slice(5,7))-1];
  const tone=v=>v>=90?'good':v>=80?'mid':'bad';
  const sign=v=>(v>=0?'+':'')+pct1(v);
  const line=r=>r.empty?`<tr class="fd-acc-empty"><td><b>${esc(r.label)}</b></td><td colspan="3">${esc(r.empty)}</td></tr>`
   :`<tr><td><b>${esc(r.label)}</b><small>${esc(r.sub)}</small></td><td><span class="fd-acc-pill ${tone(r.acc)}">${pct1(r.acc)}</span></td><td class="${Math.abs(r.bias)>=3?'fd-acc-warnc':''}">${sign(r.bias)}</td><td>${moneyBig(r.F)} <span class="fd-acc-vs">vs</span> ${moneyBig(r.A)}</td></tr>`;
  // Peringatan arah (owner): selisih total >=3% -> sarankan koreksi sebesar selisihnya.
  const warns=rows.filter(r=>!r.empty&&Math.abs(r.bias)>=3).map(r=>{
   const up=r.bias>0,k=Math.round(Math.abs(r.bias));
   return `<li class="${up?'over':'under'}"><b>${esc(r.label)}</b> cenderung ${pct1(Math.abs(r.bias))} ${up?'di atas':'di bawah'} real (${moneyBig(r.F)} vs ${moneyBig(r.A)}). ${up?'Kurangi':'Tambah'} ${esc(r.verb)} sekitar ${k}% ${up?'agar waste tidak menumpuk':'agar tidak kehabisan stok'}.</li>`;
  });
  return `<article class="workspace-card fd-accuracy"><span class="micro-label">AKURASI ${month.toUpperCase()} · ${dateRange(days[0].date,days.at(-1).date).toUpperCase()} · DALAM RUPIAH</span>
   <div class="fd-outlet-table-wrap"><table class="fd-acc-table"><thead><tr><th></th><th>Akurasi</th><th>Selisih total</th><th>Prediksi/rencana vs real</th></tr></thead><tbody>${rows.map(line).join('')}</tbody></table></div>
   ${warns.length?`<ul class="fd-acc-warn">${warns.join('')}</ul>`:`<p class="fd-accuracy-note">Semua masih dalam selisih ±3% dari real.</p>`}${estWasteNote(est)}</article>`;
 }
 // Omzet real hari ini (SEMENTARA, owner 2026-11-12): tarikan ESB jam 18-20 WIB sebelum outlet
 // tutup (pcs-sales.json `intraday`). Hanya pantauan -- belum dipakai mesin prediksi, karena
 // laporan ESB per hari (bukan per jam) dan pola "jam X = Y% omzet sehari" baru dipelajari dari
 // catatan tarikan (intradayLog). Omzet = PCS x harga, cara yang sama dengan omzet real dashboard.
 function intradayCard(trend,outletId){
  const it=window.PcsPanels.data().sales?.intraday;if(!it||it.date!==today())return '';
  const ids=outletIds(outletId,window.PcsPanels.data().sales),rows=it.rows.filter(r=>ids.includes(r.id));if(!rows.length)return '';
  let sum=0;for(const r of rows)for(let p=0;p<PRODUCT_COUNT;p++){const v=actualPrice(window.FORECAST_REALIZED_PRICES,r.id,p);if(v!=null)sum+=(r.qty?.[p]||0)*v;}
  const pred=trend.rows.find(x=>x.date===it.date)?.forecastTotal,jam=new Date(it.asOf).toLocaleTimeString('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit'});
  const pct=pred>0?sum/pred*100:null;
  return `<div class="fd-today"><div><span>Omzet real hari ini · sementara s.d. ${esc(jam)} WIB</span><strong>Rp${Math.round(sum).toLocaleString('id-ID')}</strong></div><div><span>Prediksi hari ini</span><strong>${pred?'Rp'+Math.round(pred).toLocaleString('id-ID'):'—'}</strong></div><div><span>Tercapai</span><strong>${pct==null?'—':pct.toLocaleString('id-ID',{maximumFractionDigits:0})+'%'}</strong></div><small>${rows.length}/${ids.length} outlet terbaca. Outlet umumnya tutup 20.00 — angka final masuk setelah itu (diperbarui lagi s.d. 23.00 untuk outlet full shift).</small></div>`;
 }
 function render(outletId){
  applySettings();
  const show=window.ForecastSettings?.get().display||{trend:true,wasteLost:true,accuracy:true,weather:true,events:true,operations:true};
  const trend=revenueTrend(outletId);
  if(!trend)return `<div class="workspace-empty">${esc(window.PcsPanels.data().error||'Memuat data penjualan & pesanan…')}</div>`;
  lastTrend=trend;
  if(show.weather)ensureWeather(outletId);
  const monthName=m=>months[Number(m.slice(5,7))-1]+' '+m.slice(0,4);
  return `<div class="focus-intro"><h2>Dashboard</h2><span>${outletId==='__all__'?'Seluruh outlet':''} · ${monthName(trend.ym)} & ${monthName(trend.ymNext)}</span></div>
   <div class="fd-shortcut"><button type="button" class="button fp-primary" data-go="forecast" data-fp-mode="topdown">Buat forecast →</button><span>Monitoring rencana tim ada di bawah kartu akurasi.</span></div>
   ${intradayCard(trend,outletId)}
   ${show.accuracy?accuracyCard(trend,outletId):''}
   ${window.ForecastWorkspace?.monitorSection?.()||''}
   ${show.trend&&outletId==='__all__'?trendWatchCard(trend.trendNow):''}
   ${show.wasteLost?wasteLostCard(outletId):''}
   <article class="workspace-card pcs-main-chart"><div class="pcs-chart-title"><h3>Tren omzet · ${monthName(trend.ym)} &amp; ${monthName(trend.ymNext)}</h3>${trendBadgeHtml(trend.trendNow)}</div><div id="fd-chart-slot">${trend.hasHistory?chart(trend):'<div class="pcs-chart-empty"><p>Riwayat penjualan belum cukup untuk grafik.</p></div>'}</div>${monthSummaryHtml(trend)}</article>
   ${show.weather?`<article class="workspace-card weather-card"><span class="micro-label">CUACA HARI INI &amp; BESOK</span>${weatherHtml}</article>`:''}
   ${show.events?`<div class="product-comparison"><article class="workspace-card"><span class="micro-label">KEGIATAN 7 HARI KE DEPAN</span>${eventsSoon(outletId)}</article></div>`:''}
   ${show.operations?operationalSummary(outletId):''}
   ${outletDetailId?outletDetailHtml(outletDetailId):''}`;
 }
 function click(e){
  const open=e.target.closest('[data-outlet-detail]');
  if(open){outletDetailId=open.dataset.outletDetail;return true;}
  if(e.target.closest('[data-outlet-detail-close]')){outletDetailId=null;return true;}
  return false;
 }
 function mountOutletDialog(){
  const dlg=document.getElementById('fd-outlet-dialog');
  if(!dlg)return;
  if(!dlg.dataset.wired){dlg.dataset.wired='1';dlg.addEventListener('close',()=>{outletDetailId=null;});}
  if(!dlg.open)dlg.showModal();
 }
 function mount(){mountWeatherMap();if(outletDetailId)mountOutletDialog();}
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
 // Dipakai "Forecast dari omzet": prediksi omzet reguler/pesanan jaringan untuk satu tanggal
 // (bulan ini & bulan depan), angka yang sama dengan garis prediksi di grafik dashboard.
 function predict(date){try{const r=revenueTrend('__all__')?.rows.find(x=>x.date===date);return r?{pure:r.forecastPure,total:r.forecastTotal}:null;}catch{return null;}}
 // Dipakai saran buffer "Forecast dari omzet": waste (sheet WASTE, nominal / omzet ESB) dan
 // menit habis stok (sheet rekap) untuk N TANGGAL TERAKHIR YANG SUDAH DIISI tim (bukan N hari
 // kalender -- sheet sering telat 1-3 hari), jaringan & per outlet. Sama aturannya dengan kartu
 // waste/lost di dashboard (outlet tanpa baris waste pada tanggal terisi = 0).
 function recentWasteLost(n=7){
  applySettings();
  const recap=window.DAILY_RECAP_SUMMARY,ds=dailyOutletProductSeries(),t=today(),floor=window.ForecastPlanner.shift(t,-28);
  const rev=new Map();if(ds)for(const [id,s] of ds.byOutlet)for(const pt of s)rev.set(pt.date+'|'+id,pt.gross);
  const ids=window.PcsPanels.data().sales?.outletIds||[],by=new Map(ids.map(id=>[id,{wn:0,wr:0,wd:0,lm:0,ld:0}]));
  const wDates=Object.keys(recap?.waste||{}).filter(x=>x<t&&x>=floor&&Object.keys(recap.waste[x]).length).sort().slice(-n);
  for(const date of wDates)for(const [id,r] of by){const g=rev.get(date+'|'+id);if(!(g>0))continue;r.wn+=recap.waste[date][id]?.nominal||0;r.wr+=g;r.wd++;}
  const lDates=Object.keys(recap?.lostSalesMinutes||{}).filter(x=>x<t&&x>=floor).sort().slice(-n);
  for(const date of lDates)for(const [id,m] of Object.entries(recap.lostSalesMinutes[date]||{})){const r=by.get(id);if(r&&Number.isFinite(m)){r.lm+=m;r.ld++;}}
  const pctOf=r=>({wastePct:r.wd>=MIN_RECAP_DAYS&&r.wr>0?r.wn/r.wr*100:null,lostPct:r.ld>=MIN_RECAP_DAYS?r.lm/r.ld/OPEN_MINUTES*100:null,lostPerDay:r.ld>=MIN_RECAP_DAYS?r.lm/r.ld:null});
  const all=[...by.values()].reduce((s,r)=>({wn:s.wn+r.wn,wr:s.wr+r.wr,wd:Math.max(s.wd,r.wd),lm:s.lm+r.lm,ld:s.ld+r.ld}),{wn:0,wr:0,wd:0,lm:0,ld:0});
  const net={wastePct:all.wd>=MIN_RECAP_DAYS&&all.wr>0?all.wn/all.wr*100:null,lostPct:all.ld>0&&lDates.length>=MIN_RECAP_DAYS?all.lm/all.ld/OPEN_MINUTES*100:null,lostPerDay:all.ld>0&&lDates.length>=MIN_RECAP_DAYS?all.lm/all.ld:null};
  return {net,byOutlet:new Map([...by].map(([id,r])=>[id,pctOf(r)])),wasteThreshold:WASTE_THRESHOLD,lostThreshold:LOST_SALES_THRESHOLD,wasteFrom:wDates[0]||null,wasteTo:wDates.at(-1)||null,lostFrom:lDates[0]||null,lostTo:lDates.at(-1)||null};
 }
 return {render,inspect,change,mount,click,predict,recentWasteLost};
})();
