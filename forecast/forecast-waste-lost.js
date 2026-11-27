// Tab Waste & Lost Sales (owner 2026-11-24). Masih tahap dibangun sampai seluruh data dipastikan.
// Waste dari tab WASTE tim. Stok dari Daily Report: kolom waste hari ini adalah sisa kemarin, jadi
// produk dianggap habis bila stok setelah waste masih ada, lalu stok akhir 0 tanpa transfer keluar.
// Owner 2026-11-27: lost sales dari riwayat lost harian (dokumen privat _5): jam habis x pola jual per jam outlet,
// semua produk. 1-26 Nov dari transaksi ESB, sesudahnya otomatis dari stok berjalan 15 menit.
window.ForecastWasteLost=(()=>{
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const nf=v=>Math.round(v||0).toLocaleString('id-ID'),pc=(v,d=2)=>v==null||!Number.isFinite(v)?'—':v.toLocaleString('id-ID',{minimumFractionDigits:d,maximumFractionDigits:d})+'%';
 const rp=v=>{const n=Math.abs(v||0);if(n>=1e9)return 'Rp'+(v/1e9).toLocaleString('id-ID',{maximumFractionDigits:2})+' M';if(n>=1e6)return 'Rp'+(v/1e6).toLocaleString('id-ID',{maximumFractionDigits:1})+' jt';if(n>=1e3)return 'Rp'+nf(v/1e3)+' rb';return 'Rp'+nf(v);};
 const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta'}).format(new Date());
 const FAMILIES=[['Ogura',['Ogura Cheese','Ogura Choco']],['Malmil',['Malmil Cheese','Malmil Choco','Malmil Cheese Less Sugar','Malmil Choco Less Sugar']],['Mini',['Mini Ogura']],['Chiffon',['Chiffon Keju','Chiffon Ekstra Keju','Chiffon Butter','Chiffon Kurma','Chiffon Lite Ekstra Keju','Chiffon Lite Keju']],['Roti',['Roti Sosis','Roti Abon','Roti Coklat','Roti Coklat Keju','Roti Coklat Pisang','Roti Vanilla']]];
 const ORDER=FAMILIES.flatMap(f=>f[1]);
 // Estimasi lost baru untuk 4 produk utama: varian kecil terlalu jarang terjual untuk diukur dari data harian.
 const PRICE_NAME={'Ogura Cheese':'Ogura Cheese','Ogura Choco':'Ogura Chocolate','Malmil Cheese':'Malmil Cheese','Malmil Choco':'Malmil Chocolate'};
 const SALES_LABEL=['Ogura Cheese','Ogura Choco','Malmil Cheese','Malmil Choco','Mini Ogura','Mini Ogura','Mini Ogura','Chiffon Keju','Chiffon Ekstra Keju','Chiffon Butter','Chiffon Lite Ekstra Keju','Chiffon Lite Keju','Roti Sosis','Roti Abon','Roti Coklat','Roti Coklat Pisang','Roti Coklat Keju','Roti Vanilla','Malmil Cheese Less Sugar','Malmil Choco Less Sugar'];
 const SOLD_OUT_OFTEN=40,NOT_SELLING=.5;
 const state={period:'mtd',area:null,outlet:null};let selected='__all__',cache=null,healthCache=null;for(const ev of ['forecast-data-refreshed','forecast-sources-loaded'])window.addEventListener?.(ev,()=>{cache=null;healthCache=null;});
 const name=id=>window.OUTLET_INTELLIGENCE?.outlets?.[id]?.name||id;
 const limits=()=>({waste:window.ForecastSettings?.get?.().thresholds?.waste||3.5});
 const tone=(v,lim)=>v==null?'':v>lim?'hot':v>=lim*.9?'mid':'ok';
 const span=ds=>ds.length?`${+ds[0].slice(8)}/${+ds[0].slice(5,7)} – ${+ds.at(-1).slice(8)}/${+ds.at(-1).slice(5,7)}`:'belum ada data';
 const range=(a,b)=>{const x=nf(a),y=nf(b);return x===y?x:`${x}–${y}`;};
 const rpRange=(a,b)=>{const x=rp(a),y=rp(b);return x===y?x:`${x} – ${y}`;};
 const dayType=d=>{const w=new Date(d+'T00:00:00Z').getUTCDay();return w===0||w===6?'we':'wd';};
 const flow=v=>{const sell=v[0]-(v[6]||0);return {sell,sold:Math.max(0,sell-v[4]),empty:v[5]===1&&sell>0&&v[4]<=0&&!v[3]};};
 const quant=(s,p)=>{const i=(s.length-1)*p,l=Math.floor(i);return s[l]+(s[Math.ceil(i)]-s[l])*(i-l);};
 function dates(all){
  const t=today(),past=all.filter(d=>d<t).sort();
  if(state.period==='7')return past.slice(-7);
  if(state.period==='prev'){const [y,m]=t.split('-').map(Number),p=m===1?`${y-1}-12`:`${y}-${String(m-1).padStart(2,'0')}`;return past.filter(d=>d.startsWith(p));}
  return past.filter(d=>d.startsWith(t.slice(0,7)));
 }
 // Patokan penjualan normal per outlet x produk x hari kerja/akhir pekan, rentang P75-P90.
 function baselines(stock){
  const key=stock?.updatedAt||'';if(cache?.key===key)return cache.map;
  const raw=new Map(),t=today();
  for(const [d,day] of Object.entries(stock?.days||{})){if(d>=t)continue;const type=dayType(d);
   for(const [id,cells] of Object.entries(day))for(const [k,v] of Object.entries(cells)){const l=stock.labels[+k];if(!PRICE_NAME[l]||v[5]!==1)continue;const f=flow(v);if(f.sell<=0)continue;const m=`${id}|${l}|${type}`;if(!raw.has(m))raw.set(m,[]);raw.get(m).push(f.sold);}}
  const map=new Map();for(const [m,a] of raw){if(a.length<4)continue;a.sort((x,y)=>x-y);map.set(m,[quant(a,.75),quant(a,.9)]);}
  cache={key,map};return map;
 }
 const blank=()=>({pcs:0,nom:0,habis:0,low:0,high:0,lowRp:0,highRp:0,omzet:0,days:0,kirim:0,sold:0,est:0});
 // Harga jual untuk rupiah lost: realisasi outlet untuk 4 produk utama, selain itu harga acuan.
 const REF_PRICE={'Mini Ogura':57000/9,'Chiffon Keju':33000,'Chiffon Ekstra Keju':34000,'Chiffon Butter':34000,'Chiffon Lite Ekstra Keju':19000,'Chiffon Lite Keju':18000,'Roti Sosis':6500,'Roti Abon':7000,'Roti Coklat':6000,'Roti Coklat Keju':6000,'Roti Coklat Pisang':6000,'Roti Vanilla':6000,'Sweet Layer 150 ml':14000,'Sweet Layer 300 ml':25000,'Malmil Cheese Less Sugar':17000,'Malmil Choco Less Sugar':18000};
 const priceFor=(prices,id,l)=>(PRICE_NAME[l]?prices[id]?.[PRICE_NAME[l]]?.price:0)||REF_PRICE[l]||({'Ogura Cheese':56000,'Ogura Choco':56000,'Malmil Cheese':18800,'Malmil Choco':18800})[l]||0;
 const lostSrc=d=>{const s=window.ForecastLostDaily?.src?.[d];return s==='tx'||s==='live';};
 const addTo=(a,b)=>{for(const k of Object.keys(a))a[k]+=b[k]||0;return a;};
 function collect(opt={}){
  const recap=window.DAILY_RECAP_SUMMARY,stock=window.STOCK_DAILY,items=recap?.wasteItems||window.WASTE_LOST_ITEMS||{},avail=Object.keys(items).filter(d=>Object.keys(items[d]).length),ds=opt.dates?opt.dates(avail):dates(avail);
  const ids=opt.all||selected==='__all__'?window.PcsPanels?.data?.().sales?.outletIds||[]:[selected],gross=new Map(),grossProduct=new Map(),series=window.ForecastDashboard?.grossSeries?.(),base=baselines(stock),prices=window.FORECAST_REALIZED_PRICES?.outlets||{};
  if(series)for(const [id,s] of series.byOutlet)for(const pt of s){gross.set(pt.date+'|'+id,pt.gross);grossProduct.set(pt.date+'|'+id,pt.grossProduct);}
  const prod={},out=new Map(ids.map(id=>[id,{id,omzet:0,sum:blank(),items:{}}]));
  const P=l=>prod[l]||(prod[l]=blank()),I=(o,l)=>o.items[l]||(o.items[l]=blank());
  for(const d of ds)for(const [id,o] of out){o.omzet+=gross.get(d+'|'+id)||0;(grossProduct.get(d+'|'+id)||[]).forEach((v,p)=>{const l=SALES_LABEL[p];if(l&&v)P(l).omzet+=v;});
   for(const [l,[pcs,nom]] of Object.entries(items[d]?.[id]||{}))for(const x of [P(l),I(o,l),o.sum]){x.pcs+=pcs;x.nom+=nom;}
   const day=stock?.days?.[d]?.[id];if(!day)continue;
   for(const [k,v] of Object.entries(day)){const l=stock.labels[+k];if(!l)continue;const f=flow(v);P(l).kirim+=v[1];if(v[5]===1&&f.sell>0)P(l).days++;if(f.empty)for(const x of [P(l),I(o,l),o.sum])x.habis++;}
   const ld=lostSrc(d)?window.ForecastLostDaily.days?.[d]?.[id]:null;
   if(ld)for(const [k,c] of Object.entries(ld)){const l=stock.labels[+k];if(!l)continue;const lost=c[1]||0,price=priceFor(prices,id,l);for(const x of [P(l),I(o,l),o.sum]){x.est=1;x.sold+=c[0]||0;x.low+=lost;x.high+=lost;x.lowRp+=lost*price;x.highRp+=lost*price;}}
  }
  const rows=[...out.values()],total=rows.reduce((a,r)=>addTo(a,r.sum),blank()),omzet=rows.reduce((s,r)=>s+r.omzet,0);
  return {ds,rows,prod,total,omzet};
 }
 function areaGroups(c){
  const api=window.ForecastTopdown?.areas?.(),seen=new Set(),byId=new Map(c.rows.map(r=>[r.id,r])),groups=[];
  const push=(key,title,sub,ids)=>{const rows=ids.filter(id=>byId.has(id)&&!seen.has(id)).map(id=>{seen.add(id);return byId.get(id);});if(rows.length)groups.push({key,title,sub,rows,centers:api?.CLUSTERS?.find(x=>x.name===key)?.centers||[],sum:rows.reduce((a,r)=>addTo(a,r.sum),blank()),omzet:rows.reduce((s,r)=>s+r.omzet,0)});};
  for(const a of api?.CLUSTERS||[]){const list=a.centers.map(x=>name(x)+(a.ids.includes(x)?'':' (luar area)')).join(', ');push(a.name,a.name,`Center: ${list}`,a.ids);}
  push('Stand Alone','Stand Alone','Tanpa Center',api?.STAND_ALONE||[]);
  push('Lainnya','Lainnya','Belum masuk area',c.rows.map(r=>r.id));
  return groups.sort((a,b)=>b.sum.nom-a.sum.nom);
 }
 const lostPct=x=>x.sold+x.high>0?x.high/(x.sold+x.high)*100:null;
 const lostStat=x=>x.high>0?`<strong>${rp(x.highRp)}</strong><small>${nf(x.high)} pcs · ${pc(lostPct(x),1)} permintaan</small>`:x.est?'<strong>0</strong><small>tidak pernah habis</small>':'<strong class="na">—</strong><small>belum diestimasi</small>';
 const stat=(label,body,cls='')=>`<div class="wl-stat ${cls}"><span>${label}</span>${body}</div>`;

 function status(p,lim){const wr=p.omzet>0?p.nom/p.omzet*100:null,hr=p.days?p.habis/p.days*100:0;if(wr==null)return ['Belum terbaca','none'];if(wr>lim&&hr<SOLD_OUT_OFTEN&&p.kirim>0&&p.pcs/p.kirim>=NOT_SELLING)return ['Tidak laku','bad'];if(wr<=lim)return hr>=SOLD_OUT_OFTEN?['Laris','win']:['Stabil','calm'];return hr>=SOLD_OUT_OFTEN?['Cek penempatan','place']:['Kurang laku','slow'];}
 function productCard(l,c,lim){const p=c.prod[l],share=c.total.nom>0?p.nom/c.total.nom*100:0,wr=p.omzet>0?p.nom/p.omzet*100:null,[st,cls]=status(p,lim);return `<article class="wl-prod"><header><h4>${esc(l)}</h4><b class="wl-tag ${cls}">${st}</b></header><div class="wl-pair">${stat('Waste',`<strong>${rp(p.nom)}</strong><small>${nf(p.pcs)} pcs</small>`,'waste')}${stat('Lost murni',lostStat(p),'lost')}</div><div class="wl-shares"><div><span><b>${pc(share,1)}</b> dari total waste</span><i><em style="width:${Math.min(100,share).toFixed(1)}%"></em></i></div><div><span><b class="${tone(wr,lim)}">${pc(wr,1)}</b> dari omzet produk</span><small>Omzet ${rp(p.omzet)}</small></div></div></article>`;}
 function productView(c,L){
  const html=FAMILIES.map(([f,ls])=>{const cards=ls.filter(l=>c.prod[l]&&(c.prod[l].pcs||c.prod[l].habis)).map(l=>productCard(l,c,L.waste)).join('');return cards?`<div class="wl-family"><h3>${f}</h3><div class="wl-prods">${cards}</div></div>`:'';}).join('');
  return `<section class="wl-section"><h2>Per produk</h2><p class="wl-legend"><span><b class="wl-tag bad">Tidak laku</b> minimal separuh kiriman jadi waste</span><span><b class="wl-tag win">Laris</b> waste rendah, sering habis</span><span><b class="wl-tag place">Cek penempatan</b> waste tinggi, tetapi sering habis juga</span><span><b class="wl-tag slow">Kurang laku</b> waste tinggi, jarang habis</span><span><b class="wl-tag calm">Stabil</b> waste rendah, jarang habis</span></p>${html||'<p class="wl-note">Belum ada data pada periode ini.</p>'}</section>`;
 }
 function outletDetail(r){
  const rows=ORDER.filter(l=>r.items[l]&&(r.items[l].pcs||r.items[l].habis)).map(l=>{const p=r.items[l];return `<li><span>${esc(l)}</span><b>${nf(p.pcs)} pcs</b><em>${p.high>0?`lost ${nf(p.high)} pcs · ${pc(lostPct(p),0)}`:p.habis?`habis ${nf(p.habis)} hari`:''}</em></li>`;}).join('');
  return `<ul class="wl-items">${rows||'<li><span>Tidak ada data produk.</span></li>'}</ul>`;
 }
 function areaPanel(a,L){
  const rows=[...a.rows].sort((x,y)=>y.sum.nom-x.sum.nom).map(r=>{const open=state.outlet===r.id,wp=r.omzet>0?r.sum.nom/r.omzet*100:null,center=a.centers.includes(r.id);
   return `<div class="wl-outlet ${open?'open':''}"><button type="button" data-wl-outlet="${esc(r.id)}" aria-expanded="${open}"><span class="wl-oname">${open?'▾':'▸'} ${esc(name(r.id))}${center?' <i>Center</i>':''}</span><span class="wl-onum"><small>Waste</small><b>${nf(r.sum.pcs)} pcs</b><em>${rp(r.sum.nom)} · <u class="${tone(wp,L.waste)}">${pc(wp,1)}</u></em></span><span class="wl-onum"><small>Lost murni</small><b>${r.sum.high>0?nf(r.sum.high)+' pcs':r.sum.est?'0':'—'}</b><em>${r.sum.high>0?`${rp(r.sum.highRp)} · ${pc(lostPct(r.sum),1)}`:r.sum.est?'tidak pernah habis':'belum diestimasi'}</em></span></button>${open?outletDetail(r):''}</div>`;}).join('');
  return `<div class="wl-panel"><h3>${esc(a.title)} <small>${a.rows.length} outlet</small></h3>${rows}</div>`;
 }
 function areaView(c,L){
  const groups=areaGroups(c);if(selected!=='__all__'&&groups[0])state.area=groups[0].key;
  const active=groups.find(a=>a.key===state.area);
  const cards=groups.map(a=>{const on=a===active,wp=a.omzet>0?a.sum.nom/a.omzet*100:null;return `<button type="button" class="wl-area ${on?'on':''}" data-wl-area="${esc(a.key)}" aria-expanded="${on}"><span class="wl-atitle">${esc(a.title)}</span><span class="wl-asub">${esc(a.sub)} · ${a.rows.length} outlet</span><span class="wl-pair">${stat('Waste',`<strong>${rp(a.sum.nom)}</strong><small>${nf(a.sum.pcs)} pcs · <u class="${tone(wp,L.waste)}">${pc(wp,1)}</u></small>`,'waste')}${stat('Lost murni',lostStat(a.sum),'lost')}</span></button>`;}).join('');
  return `<section class="wl-section"><h2>Per area</h2><p class="wl-note">Klik area untuk melihat outlet di dalamnya.</p><div class="wl-areas">${cards}</div>${active?areaPanel(active,L):''}</section>`;
 }
 function view(){
  if(!window.DAILY_RECAP_SUMMARY&&!window.WASTE_LOST_ITEMS)return '<div class="workspace-empty">Data waste belum tersedia untuk akun ini.</div>';
  const c=collect(),L=limits(),wp=c.omzet>0?c.total.nom/c.omzet*100:null;
  const per=[['mtd','Bulan ini'],['7','7 hari terakhir'],['prev','Bulan lalu']].map(([k,t])=>`<button type="button" data-wl-period="${k}" aria-pressed="${state.period===k}" class="${state.period===k?'on':''}">${t}</button>`).join('');
  return `<div class="wl-build" role="status"><b>🚧 Sedang dibangun</b><span>Angka masih diperiksa. Untuk keputusan, tetap cocokkan dengan sheet tim.</span></div>
  <div class="wl-bar"><div class="wl-periods" role="group" aria-label="Periode">${per}</div><span>${esc(selected==='__all__'?'Semua outlet':name(selected))} · ${span(c.ds)}</span></div>
  <div class="wl-hero"><div class="waste"><span>Total waste</span><strong>${rp(c.total.nom)}</strong><small>${nf(c.total.pcs)} pcs · <u class="${tone(wp,L.waste)}">${pc(wp)} dari omzet</u></small></div><div class="lost"><span>Lost sales murni <em class="wl-help" title="Seandainya tidak ada transfer: stok sendiri (sisa layak jual + kiriman pabrik) dibanding permintaan. Menilai ketepatan rencana kirim.">?</em></span><strong>${c.total.high>0?rp(c.total.highRp):'—'}</strong><small>${c.total.high>0?`${nf(c.total.high)} pcs · ${pc(lostPct(c.total),1)} dari permintaan · tanpa transfer`:c.total.est?'Tidak ada kue habis pada periode ini':'Belum ada estimasi untuk periode ini'}</small></div><div class="lost tf pending"><span>Lost sales setelah transfer</span><strong>—</strong><small>🚧 Sedang dibangun · menunggu catatan transfer di web lengkap</small></div></div>
  ${productView(c,L)}${areaView(c,L)}
  <p class="wl-foot"><b>Lost sales murni</b> = seandainya tidak ada transfer: stok sendiri (sisa layak jual + kiriman pabrik) dibanding permintaan, jadi menilai ketepatan rencana kirim. <b>Lost setelah transfer</b> (yang benar-benar tersisa setelah transfer) sedang dibangun dan akan diisi setelah catatan transfer di web lengkap. Lost = perkiraan penjualan sejak kue habis sampai tutup 20.00, mengikuti ramainya tiap jam di outlet itu sendiri (pagi sepi, sore ramai). Jam habis 1–26 Nov dari transaksi terakhir saat stok akhir 0; mulai 27 Nov dari stok berjalan 15 menit dan catatan transfer, dihitung otomatis tiap pagi untuk hari sebelumnya. Uji balik November: total meleset ±2%, per outlet-produk-hari bisa meleset ±50%, jadi baca sebagai jumlah, bukan angka per hari. Produk baru (riwayat kurang dari 20 hari di outlet itu) belum diestimasi. Sering habis berarti habis di minimal ${SOLD_OUT_OFTEN}% hari berstok, waste tinggi berarti di atas batas ${pc(L.waste,1)} dari omzet produk. Omzet Roti belum memuat penjualan paket, jadi persennya bisa terlihat lebih tinggi.</p>`;
 }
 // Peringatan produk: selalu 28 hari terakhir seluruh outlet, tidak ikut filter di tab ini.
 const HEALTH_DAYS=28,low=s=>String(s||'').trim().toLowerCase();
 function labelOf(nm){
  const clean=s=>low(s).replace('roti manis','roti').replace(' meses','').replace('chocolate','choco').replace('cisfon','chiffon').replace('roti pisang coklat','roti coklat pisang');
  const x=window.ForecastProducts?.extra?.().find(e=>e.name===nm),keys=[nm,...(x?.aliases||[])].map(clean);
  return ORDER.find(l=>keys.includes(low(l)))||null;
 }
 function health(){
  const L=limits(),key=[window.STOCK_DAILY?.updatedAt,today(),L.waste].join('|');if(healthCache?.key===key)return healthCache.value;
  const c=collect({all:true,dates:a=>a.filter(d=>d<today()).sort().slice(-HEALTH_DAYS)});
  const items=ORDER.filter(l=>c.prod[l]&&(c.prod[l].pcs||c.prod[l].kirim)).map(l=>{const p=c.prod[l],[st,cls]=status(p,L.waste);return {label:l,status:st,cls,critical:cls==='bad',pcs:p.pcs,nom:p.nom,kirim:p.kirim,wasteOfShip:p.kirim?p.pcs/p.kirim*100:null,wasteOfOmzet:p.omzet>0?p.nom/p.omzet*100:null,habisRate:p.days?p.habis/p.days*100:null,lostLow:p.low,lostHigh:p.high,lostRp:(p.lowRp+p.highRp)/2,lostPct:lostPct(p)};});
  const mid=s=>({wasteRp:s.sum.nom,lostPcs:(s.sum.low+s.sum.high)/2,lostRp:(s.sum.lowRp+s.sum.highRp)/2,habis:s.sum.habis,wastePct:s.omzet>0?s.sum.nom/s.omzet*100:null});
  const value={from:c.ds[0],to:c.ds.at(-1),items,outlets:c.rows.map(r=>({id:r.id,name:name(r.id),...mid(r)})),areas:areaGroups(c).filter(a=>a.key!=='Lainnya').map(a=>({name:a.title,...mid(a)}))};if(c.ds.length)healthCache={key,value};return value;
 }
 function noticeHtml(){
  try{
   if(!window.STOCK_DAILY||(!window.DAILY_RECAP_SUMMARY&&!window.WASTE_LOST_ITEMS))return '';
   const h=health();if(!h.items.length)return '';
   const row=(cls,title,hint,list)=>list.length?`<div class="wl-alert-row"><b class="wl-tag ${cls}">${title}</b><span class="wl-alert-names">${list.map(x=>esc(x.label)+(cls==='bad'&&x.wasteOfShip!=null?` <small>${pc(x.wasteOfShip,0)} jadi waste</small>`:'')).join(', ')}</span><em>${hint}</em></div>`:'';
   const by=c=>h.items.filter(x=>x.cls===c);
   const rows=row('bad','Tidak laku','pertimbangkan tidak diproduksi',by('bad'))+row('slow','Kurang laku','kurangi jumlahnya',by('slow'))+row('place','Cek penempatan','pindahkan antar-outlet',by('place'))+row('win','Laris','jaga stok jangan kurang',by('win'));
   return rows?`<section class="workspace-card wl-alert" aria-label="Perhatian produk"><header><div><h3>Perhatian produk</h3><span>${HEALTH_DAYS} hari terakhir · ${span([h.from,h.to].filter(Boolean))} · seluruh outlet</span></div><button type="button" class="button quiet" data-wl-go>Lihat rincian</button></header>${rows}</section>`:'';
  }catch{return '';}
 }
 function criticalFor(plan){
  const qty={};(plan?.core||[]).forEach((v,p)=>{const l=SALES_LABEL[p];if(l&&v>0)qty[l]=(qty[l]||0)+v;});
  for(const [nm,v] of Object.entries(plan?.extra||{})){const l=labelOf(nm);if(l&&v>0)qty[l]=(qty[l]||0)+v;}
  return health().items.filter(x=>x.critical&&qty[x.label]>0).map(x=>({...x,planned:qty[x.label]}));
 }
 function confirmPlan(list,outlets){
  return new Promise(done=>{
   const h=health(),back=document.activeElement,el=document.createElement('div');el.className='wl-confirm';
   const rows=list.map(x=>`<li><div><b>${esc(x.label)}</b><span>Direncanakan ${nf(x.planned)} pcs</span></div><p>${nf(x.kirim)} pcs dikirim, <b>${nf(x.pcs)} pcs jadi waste (${pc(x.wasteOfShip,0)})</b>, senilai ${rp(x.nom)}.</p></li>`).join('');
   el.innerHTML=`<div class="wl-confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="wl-confirm-title" aria-describedby="wl-confirm-ask"><h3 id="wl-confirm-title">Produk ini sedang tidak laku</h3><p class="wl-confirm-sub">Data ${HEALTH_DAYS} hari terakhir (${span([h.from,h.to].filter(Boolean))}), seluruh outlet.</p><ul>${rows}</ul><p class="wl-confirm-ask" id="wl-confirm-ask">Kamu yakin ingin tetap memproduksinya?</p><div class="wl-confirm-actions"><button type="button" class="button" data-wl-no>Tidak</button><button type="button" class="button fp-primary" data-wl-yes>Ya, simpan ${nf(outlets)} outlet</button></div></div>`;
   const close=v=>{document.removeEventListener('keydown',key,true);el.remove();back?.focus?.();done(v);};
   const key=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close(false);}else if(e.key==='Tab'){const a=el.querySelector('[data-wl-no]'),b=el.querySelector('[data-wl-yes]'),next=document.activeElement===a?b:a;e.preventDefault();next.focus();}};
   el.addEventListener('click',e=>{e.stopPropagation();if(e.target.closest('[data-wl-yes]'))close(true);else if(e.target.closest('[data-wl-no]')||e.target===el)close(false);});
   document.addEventListener('keydown',key,true);document.body.appendChild(el);el.querySelector('[data-wl-no]').focus();
  });
 }
 function paint(){const el=document.getElementById('wl-root');if(el)el.innerHTML=view();}
 window.addEventListener?.('forecast-lost-daily',()=>{cache=null;healthCache=null;paint();});
 // Ringkasan lost bulan berjalan untuk Dashboard: semua outlet, semua produk, hari yang sudah selesai.
 function lostSummary(){
  const LD=window.ForecastLostDaily;if(!LD?.days)return null;const t=today(),m=t.slice(0,7),prices=window.FORECAST_REALIZED_PRICES?.outlets||{},labels=window.STOCK_DAILY?.labels;if(!labels)return null;
  let pcs=0,sold=0,rpv=0;const ds=Object.keys(LD.days).filter(d=>d<t&&d.startsWith(m)&&lostSrc(d)).sort();
  for(const d of ds)for(const [id,cells] of Object.entries(LD.days[d]))for(const [k,c] of Object.entries(cells)){const l=labels[+k];pcs+=c[1]||0;sold+=c[0]||0;rpv+=(c[1]||0)*priceFor(prices,id,l);}
  return ds.length?{pcs,rp:rpv,pct:pcs+sold>0?pcs/(pcs+sold)*100:null,from:ds[0],to:ds.at(-1)}:null;
 }
 document.addEventListener('click',e=>{if(e.target.closest?.('[data-wl-go]')){document.querySelector('[data-focus="wastelost"]')?.click();return;}if(!e.target.closest?.('#wl-root'))return;const a=e.target.closest('[data-wl-period]'),b=e.target.closest('[data-wl-area]'),o=e.target.closest('[data-wl-outlet]');if(a){state.period=a.dataset.wlPeriod;state.outlet=null;paint();}else if(b){state.area=state.area===b.dataset.wlArea?null:b.dataset.wlArea;state.outlet=null;paint();}else if(o){state.outlet=state.outlet===o.dataset.wlOutlet?null:o.dataset.wlOutlet;paint();}});
 return {lostSummary,health,noticeHtml,criticalFor,confirmPlan,render(id){selected=id||'__all__';return `<div class="focus-intro"><h2>Waste & Lost Sales</h2><span>Ringkasan per produk dan area</span></div><div id="wl-root">${view()}</div>`;}};
})();
