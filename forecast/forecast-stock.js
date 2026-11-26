// Tab Stok & Transfer (owner 2026-11-26). Tahap 1: stok berjalan per 15 menit, belum ada input transfer.
// Stok jual hari ini (Daily Report) = sisa kemarin - waste + kiriman +/- transfer; stok sekarang = stok
// jual - terjual ESB kumulatif. Kecepatan jual mengikuti pola per jam outlet x produk (transaksi ESB
// 1 Okt-22 Nov, dihitung sampai jam kue habis), jadi pagi/siang/sore punya bobot berbeda.
window.ForecastStock=(()=>{
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const nf=v=>Math.round(v||0).toLocaleString('id-ID');
 const rp=v=>{const n=Math.abs(v||0);if(n>=1e6)return 'Rp'+(v/1e6).toLocaleString('id-ID',{maximumFractionDigits:1})+' jt';if(n>=1e3)return 'Rp'+nf(v/1e3)+' rb';return 'Rp'+nf(v);};
 const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta'}).format(new Date());
 const nowHour=()=>{const p=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date()).split(':').map(Number);return p[0]%24+p[1]/60;};
 const hm=h=>{const m=Math.round(h*60);return `${String(Math.floor(m/60)).padStart(2,'0')}.${String(m%60).padStart(2,'0')}`;};
 const toH=t=>{const [a,b]=String(t).split(':').map(Number);return a+b/60;};
 const LABELS=['Ogura Cheese','Ogura Choco','Malmil Cheese','Malmil Choco','Malmil Cheese Less Sugar','Malmil Choco Less Sugar','Mini Ogura','Chiffon Keju','Chiffon Ekstra Keju','Chiffon Butter','Chiffon Kurma','Chiffon Lite Ekstra Keju','Chiffon Lite Keju','Roti Sosis','Roti Abon','Roti Coklat','Roti Coklat Keju','Roti Coklat Pisang','Roti Vanilla','Sweet Layer 150 ml','Sweet Layer 300 ml'];
 const SHORT=['Ogura Ch','Ogura Co','Malmil Ch','Malmil Co','Malmil Ch LS','Malmil Co LS','Mini','Chif Keju','Chif EK','Chif Butter','Chif Kurma','Lite EK','Lite Keju','Roti Sosis','Roti Abon','Roti Coklat','Roti C.Keju','Roti C.Pisang','Roti Vanilla','Layer 150','Layer 300'];
 const FAM=[0,0,1,1,1,1,2,3,3,3,3,4,4,5,5,5,5,5,5,6,6],FAMS=['Ogura','Malmil','Mini','Chiffon','Lite','Roti','Sweet Layer'],FAM_NET=['Ogura','Malmil','Mini','Chiffon','Lite','Roti','Ogura'];
 const GROUPS=[['all','Semua produk',null],['ogura','Ogura',[0]],['malmil','Malmil',[1]],['mini','Mini',[2]],['chiffon','Chiffon',[3,4]],['roti','Roti',[5]],['layer','Sweet Layer',[6]]];
 const MALMIL=new Set([2,3,4,5]),NO_SALES=new Set([10]);
 const PRICE=['Ogura Cheese','Ogura Chocolate','Malmil Cheese','Malmil Chocolate','Malmil Cheese Less Sugar','Malmil Chocolate Less Sugar','Mini Ogura - Cheese','Cisfon - Keju','Cisfon - Ekstra Keju','Cisfon - Butter',null,'Cisfon Lite - Ekstra Keju','Cisfon Lite - Keju','Roti Sosis','Roti Abon','Roti Coklat','Roti Coklat Keju','Roti Pisang Coklat','Roti Vanilla',null,null];
 // Harga jual: harga realisasi outlet (4 produk utama), selain itu harga acuan Dashboard (PRICE_REFS).
 const REF=[0,0,0,0,0,0,57000/9,33000,34000,34000,0,19000,18000,6500,7000,6000,6000,6000,6000,14000,25000],SAME=[0,1,2,3,2,3];
 const priceOf=(prices,id,lab)=>(lab<6?prices[id]?.[PRICE[SAME[lab]]]?.price:0)||REF[lab]||0;
 const OPEN=8,CLOSE=20,PRIOR_W=.3,KURANG=.8,STALE_MIN=40;
 const ST={habis:['Habis','habis'],kurang:['Kurang stok','kurang'],normal:['Normal','normal'],over:['Over stok','over'],na:['Belum terbaca','na'],baru:['Produk baru','baru']};
 const state={view:'stok',area:'all',group:'all',status:null,outlet:null};try{const v=JSON.parse(localStorage.getItem('omaopa-stock-ui')||'{}');for(const k of ['view','area','group'])if(typeof v[k]==='string')state[k]=v[k];}catch{}
 const remember=()=>{try{localStorage.setItem('omaopa-stock-ui',JSON.stringify({view:state.view,area:state.area,group:state.group}));}catch{}};let selected='__all__',baseCache=null;
 const name=id=>window.OUTLET_INTELLIGENCE?.outlets?.[id]?.name||id;
 const weekend=d=>{const w=new Date(d+'T00:00:00Z').getUTCDay();return w===0||w===6;};
 // Pola per jam: 12 slot 08-19. Fallback pola jaringan per keluarga produk, lalu rata.
 function profile(id,lab,d){
  // Owner 2026-11-26: pola harus unik per outlet, tanpa meminjam data outlet lain atau dipukul rata.
  // Outlet x produk tanpa riwayat cukup (< 20 hari) = produk baru: tampilkan stok saja.
  const P=window.ForecastHourProfile,ty=weekend(d)?1:0,p=P?.outlets?.[id]?.[lab]?.[ty];
  return Array.isArray(p)&&p.length===CLOSE-OPEN?p:null;
 }
 const cum=(p,h)=>{if(h<=OPEN)return 0;if(h>=CLOSE)return 1;let s=0;const i=Math.floor(h-OPEN);for(let k=0;k<i;k++)s+=p[k];return Math.min(1,s+p[i]*(h-OPEN-i));};
 // Jam ketika penjualan kumulatif mencapai bagian `target` dari permintaan sehari.
 const atShare=(p,target)=>{if(target<=0)return OPEN;let s=0;for(let k=0;k<p.length;k++){if(s+p[k]>=target)return OPEN+k+(p[k]>0?(target-s)/p[k]:0);s+=p[k];}return CLOSE;};
 // Permintaan normal sehari dari Daily Report 28 hari terakhir, jenis hari sama. Hari habis dinaikkan
 // 15% karena penjualannya terpotong; ini hanya titik awal, setelah jualan berjalan kecepatan hari ini
 // makin dominan.
 function baselines(){
  const S=window.STOCK_DAILY,key=(S?.updatedAt||'')+today();if(baseCache?.key===key)return baseCache.map;
  const t=today(),from=new Date(Date.parse(t+'T00:00:00Z')-28*864e5).toISOString().slice(0,10),raw=new Map();
  for(const [d,day] of Object.entries(S?.days||{})){if(d>=t||d<from)continue;const we=weekend(d);
   for(const [id,cells] of Object.entries(day))for(const [k,v] of Object.entries(cells)){if(v[5]!==1)continue;const sell=v[0]-(v[6]||0);if(sell<=0)continue;const sold=Math.max(0,sell-v[4]),val=v[4]<=0?sold*1.15:sold;
    for(const m of [`${id}|${k}|${we}`,`${id}|${k}|*`]){if(!raw.has(m))raw.set(m,[]);raw.get(m).push(val);}}}
  const map=new Map();for(const [m,a] of raw)map.set(m,{mean:a.reduce((x,y)=>x+y,0)/a.length,n:a.length});
  baseCache={key,map};return map;
 }
 function prior(id,lab,d,sell){const b=baselines(),x=b.get(`${id}|${lab}|${weekend(d)}`),y=b.get(`${id}|${lab}|*`);if(x&&x.n>=3)return x.mean;if(y&&y.n>=3)return y.mean;return null;}
 function compute(){
  const L=window.ForecastStockLive,d=today();
  if(!L||L.date!==d)return {ok:false,reason:L?'Belum ada tarikan hari ini.':'Data stok berjalan belum tersedia.'};
  const snaps=(L.snaps||[]).map(s=>({h:toH(s.t),s:s.s})).sort((a,b)=>a.h-b.h),last=snaps.at(-1),now=Math.min(Math.max(nowHour(),OPEN),CLOSE),prices=window.FORECAST_REALIZED_PRICES?.outlets||{};
  const ids=new Set([...Object.keys(L.daily||{}),...snaps.flatMap(s=>Object.keys(s.s))]),outlets=[];
  for(const id of ids){
   const day=L.daily?.[id]||null,soldNow=[...snaps].reverse().find(s=>s.s[id])?.s[id]||null,wasteIn=!!day&&Object.values(day).some(x=>x[4]>0||x[5]!=null),items=[];
   for(let lab=0;lab<LABELS.length;lab++){
    const x=day?.[lab],S=soldNow?.[lab]||0;if(!x&&!S)continue;
    const [awal,kirim,tfIn,tfOut,waste]=x||[0,0,0,0,0],old=wasteIn?Math.max(0,awal-waste):MALMIL.has(lab)?0:awal,sell=old+kirim+tfIn-tfOut;
    if(sell<=0&&!S)continue;
    const p=profile(id,lab,d),D0=prior(id,lab,d,sell),it={lab,sell,old,oldPending:!wasteIn&&!MALMIL.has(lab)&&awal>0,kirim,tf:tfIn-tfOut,sold:S,left:sell-S,noSales:NO_SALES.has(lab),noDaily:!x};
    // Jam habis: tarikan pertama dengan stok <= 0, diambil titik tengah dari tarikan sebelumnya.
    if(it.noSales||it.noDaily||!p||!D0){it.st=it.noSales||it.noDaily?'na':'baru';it.price=priceOf(prices,id,lab);items.push(it);continue;}
    let hAt=null;if(it.left<=0&&sell>0){let prev=OPEN;for(const s of snaps){const v=s.s[id]?.[lab];if(v==null)continue;if(sell-v<=0){hAt=(prev+s.h)/2;if(prev===OPEN)it.before=s.h;break;}prev=s.h;}if(hAt==null)hAt=last?.h||now;}
    const cAt=hAt!=null?cum(p,hAt):cum(p,now),a=PRIOR_W*D0,Dd=(Math.min(S,Math.max(sell,0))+a)/(cAt+a/D0);
    it.demand=Dd;it.rate=Dd*(p[Math.min(p.length-1,Math.max(0,Math.floor(now-OPEN)))]||0);it.price=priceOf(prices,id,lab);
    const rest=Dd*(1-cum(p,now));it.rest=rest;
    if(it.left<=0){it.st='habis';it.at=hAt;it.lostNow=Math.max(0,Dd*(cum(p,now)-cum(p,hAt)));it.lostDay=Math.max(0,Dd*(1-cum(p,hAt)));it.over=it.left<0?-it.left:0;}
    else if(it.left<rest*KURANG&&rest-it.left>=1){it.st='kurang';it.at=atShare(p,cum(p,now)+it.left/Dd);it.short=rest-it.left;}
    else if(it.left-rest>=Math.max(3,rest*.3)){it.st='over';it.extra=it.left-rest;}
    else it.st='normal';
    items.push(it);
   }
   if(items.length)outlets.push({id,items,day:!!day,wasteIn});
  }
  return {ok:true,asOf:L.asOf,dailyAt:L.dailyAt,lastH:last?.h,outlets,now};
 }
 function areaList(){
  const api=window.ForecastTopdown?.areas?.(),list=[];
  for(const a of api?.CLUSTERS||[])list.push({key:a.name,title:a.name,ids:a.ids,centers:a.centers||[]});
  if(api?.STAND_ALONE?.length)list.push({key:'Stand Alone',title:'Stand Alone',ids:api.STAND_ALONE,centers:[]});
  return list;
 }
 const inGroup=lab=>{const g=GROUPS.find(x=>x[0]===state.group);return !g?.[2]||g[2].includes(FAM[lab]);};
 const pill=(st,txt)=>`<b class="st-pill ${ST[st][1]}">${txt||ST[st][0]}</b>`;
 function cellText(it){
  if(it.st==='habis')return `<strong>0</strong><small>habis ${it.before?'< '+hm(it.before):hm(it.at)}</small>`;
  if(it.st==='kurang')return `<strong>${nf(it.left)}</strong><small>habis ±${hm(it.at)}</small>`;
  if(it.st==='over')return `<strong>${nf(it.left)}</strong><small>sisa ±${nf(it.extra)}</small>`;
  if(it.st==='baru')return `<strong>${nf(Math.max(0,it.left))}</strong><small>produk baru</small>`;
  if(it.st==='na')return `<strong>${nf(Math.max(0,it.left))}</strong><small>${it.noSales?'jual tdk terbaca':'tanpa Daily'}</small>`;
  return `<strong>${nf(it.left)}</strong><small>cukup</small>`;
 }
 function detail(o){
  const rows=o.items.filter(it=>inGroup(it.lab)).map(it=>{const why=it.st==='habis'?`${it.before?`Sudah habis saat tarikan pertama ${hm(it.before)}; jam pastinya belum terekam, diperkirakan ±${hm(it.at)}.`:`Habis sekitar ${hm(it.at)}.`} Lost sejauh ini ±${nf(it.lostNow)} pcs${it.price?` (${rp(it.lostNow*it.price)})`:''}, sampai tutup ±${nf(it.lostDay)} pcs.${it.over?` Terjual ${nf(it.over)} pcs melebihi stok di Daily Report: cek transfer masuk.`:''}`:it.st==='kurang'?`Diperkirakan habis sekitar ${hm(it.at)}, kurang ±${nf(it.short)} pcs sampai tutup.`:it.st==='over'?`Diperkirakan sisa ±${nf(it.extra)} pcs saat tutup.`:it.st==='baru'?'Produk baru di outlet ini, menunggu data untuk estimasi penjualan. Sementara hanya ditampilkan stoknya.':it.st==='na'?(it.noSales?'Penjualan produk ini belum terbaca dari ESB.':'Belum ada di Daily Report hari ini.'):'Stok cukup sampai tutup.';
   return `<tr><th scope="row">${esc(LABELS[it.lab])}</th><td>${pill(it.st)}</td><td>${nf(it.sell)}${it.old?`<small>${it.oldPending?'termasuk ':''}${nf(it.old)} kemarin</small>`:''}</td><td>${nf(it.sold)}</td><td><b>${nf(Math.max(0,it.left))}</b></td><td>${it.st==='habis'||it.st==='baru'?'—':`${(it.rate||0).toLocaleString('id-ID',{maximumFractionDigits:1})}/jam`}</td><td>${it.st==='baru'?'—':nf(it.rest)}</td><td class="st-why">${why}</td></tr>`;}).join('');
  return `<div class="st-detail"><table><thead><tr><th>Produk</th><th>Status</th><th>Stok jual hari ini</th><th>Terjual</th><th>Sisa</th><th>Laju sekarang</th><th>Perkiraan laku s.d. tutup</th><th>Keterangan</th></tr></thead><tbody>${rows}</tbody></table>${o.wasteIn?'':'<p class="st-note">Kolom waste hari ini belum diisi. Sisa kemarin Malmil dianggap dibuang; sisa kemarin produk lain masih dihitung bisa dijual.</p>'}</div>`;
 }
 // ---------- Rekomendasi transfer (owner 2026-11-26) ----------
 // Hanya di dalam satu area (anggota + Center area itu, termasuk Center di luar area seperti UMS untuk
 // Klaten). Stand Alone tidak ikut. Lama perjalanan = 15 menit persiapan + jarak jalan (garis lurus x1,35)
 // pada 25 km/jam. Penerima: kebutuhan SETELAH kue tiba = laku sisa hari (pola jam outlet penerima)
 // dikurangi stok yang masih ada saat tiba. Pengirim hanya memberi kelebihan setelah menyisakan
 // perkiraan lakunya sendiri sampai tutup +15% +1 pcs, jadi pengirim tidak ikut kehabisan.
 const SPEED=25,PREP=.25,ROAD=1.35,MIN_QTY=2,LAST_ARRIVE=CLOSE-.75,KEEP=1.15;
 function coords(){const m=new Map(),O=window.OUTLET_DATA?.outlets;for(const o of (Array.isArray(O)?O:Object.values(O||{})))if(o?.id&&Number.isFinite(o.lat)&&Number.isFinite(o.lon))m.set(o.id,[o.lat,o.lon]);return m;}
 function km(C,a,b){const x=C.get(a),y=C.get(b);if(!x||!y)return null;const r=Math.PI/180,dl=(y[0]-x[0])*r,dn=(y[1]-x[1])*r,h=Math.sin(dl/2)**2+Math.cos(x[0]*r)*Math.cos(y[0]*r)*Math.sin(dn/2)**2;return 2*6371*Math.asin(Math.sqrt(h))*ROAD;}
 function transfers(c){
  const C=coords(),d=today(),now=c.now,byId=new Map(c.outlets.map(o=>[o.id,o])),trips=[],gaps=[];
  if(now>=LAST_ARRIVE-PREP)return {trips,gaps,late:true};
  for(const a of areaList()){
   if(a.key==='Stand Alone')continue;
   const pool=[...new Set([...a.ids,...a.centers])].filter(id=>byId.has(id));
   for(let lab=0;lab<LABELS.length;lab++){
    const it=id=>byId.get(id).items.find(x=>x.lab===lab&&x.demand&&x.st!=='baru'&&x.st!=='na');
    const giv=pool.map(id=>{const x=it(id);if(!x)return null;const sur=Math.floor(x.left-(x.rest*KEEP+1));return sur>=MIN_QTY?{id,x,sur}:null;}).filter(Boolean);
    const rec=a.ids.filter(id=>byId.has(id)).map(id=>{const x=it(id);return x&&(x.st==='habis'||x.st==='kurang')?{id,x}:null;}).filter(Boolean);
    for(const r of rec){
     const pr=profile(r.id,lab,d);if(!pr)continue;
     const needAt=h=>{const left=Math.max(0,r.x.left-r.x.demand*(cum(pr,h)-cum(pr,now)));return r.x.demand*(1-cum(pr,h))-left;};
     const opts=giv.filter(g=>g.id!==r.id).map(g=>{const k=km(C,g.id,r.id);if(k==null)return null;const arr=now+PREP+k/SPEED;if(arr>LAST_ARRIVE)return null;const n=Math.floor(needAt(arr));return n>=MIN_QTY?{g,k,arr,n}:null;}).filter(Boolean).sort((p,q)=>p.k-q.k);
     let left=opts.length?Math.max(...opts.map(o=>o.n)):null;
     for(const o of opts){if(left<MIN_QTY)break;const q=Math.min(left,o.n,o.g.sur);if(q<MIN_QTY)continue;
      o.g.sur-=q;left-=q;
      let t=trips.find(t=>t.from===o.g.id&&t.to===r.id);if(!t){t={area:a.title,from:o.g.id,to:r.id,km:o.k,arr:o.arr,items:[],pcs:0,rp:0};trips.push(t);}
      t.items.push({lab,qty:q,recv:r.x,give:o.g.x});t.pcs+=q;t.rp+=q*(r.x.price||0);}
     const rem=left==null?Math.floor(needAt(Math.min(now+PREP+.5,LAST_ARRIVE))):left;
     if(rem>=MIN_QTY)gaps.push({area:a.title,id:r.id,lab,need:rem,x:r.x});
    }
   }
  }
  trips.sort((p,q)=>q.rp-p.rp);gaps.sort((p,q)=>q.need*(q.x.price||0)-p.need*(p.x.price||0));
  return {trips,gaps,late:false};
 }
 const tripText=t=>`${name(t.from)} → ${name(t.to)}: ${t.items.map(i=>`${LABELS[i.lab]} ${nf(i.qty)}`).join(', ')}`;
 function tripCard(t,i){
  const lines=t.items.map(x=>`<li><div><b>${esc(LABELS[x.lab])}</b><strong>${nf(x.qty)} pcs</strong></div><span>${esc(name(t.to))} ${x.recv.st==='habis'?'sudah habis':`diperkirakan habis ±${hm(x.recv.at)}`} · ${esc(name(t.from))} sisa ${nf(x.give.left)}, perkiraan laku ${nf(x.give.rest)} s.d. tutup</span></li>`).join('');
  return `<article class="st-trip"><header><div class="st-route"><b>${esc(name(t.from))}</b><i aria-hidden="true">→</i><b>${esc(name(t.to))}</b></div><span>${t.km.toLocaleString('id-ID',{maximumFractionDigits:1})} km · tiba ±${hm(t.arr)}</span></header><ul>${lines}</ul><footer><span>Menyelamatkan ±${nf(t.pcs)} pcs${t.rp?` · ${rp(t.rp)}`:''}</span><button type="button" class="st-copy" data-st-copy="${i}">Salin pesan</button></footer></article>`;
 }
 function transferView(c,ids){
  const T=transfers(c),inSel=t=>!ids||ids.has(t.from)||ids.has(t.to),trips=T.trips.filter(t=>inSel(t)&&t.items.some(x=>inGroup(x.lab))).map(t=>{const items=t.items.filter(x=>inGroup(x.lab));return {...t,items,pcs:items.reduce((s,x)=>s+x.qty,0),rp:items.reduce((s,x)=>s+x.qty*(x.recv.price||0),0)};}),gaps=T.gaps.filter(g=>(!ids||ids.has(g.id))&&inGroup(g.lab));
  lastTrips=trips;
  if(T.late)return `<div class="st-empty"><b>Sudah terlalu sore untuk transfer.</b><span>Kue tidak akan tiba cukup awal sebelum tutup 20.00. Rekomendasi muncul lagi besok pagi.</span></div>`;
  const pcs=trips.reduce((s,t)=>s+t.pcs,0),val=trips.reduce((s,t)=>s+t.rp,0);
  const head=`<div class="st-thead"><div><strong>${nf(trips.length)} transfer disarankan</strong><span>${trips.length?`menyelamatkan ±${nf(pcs)} pcs${val?` · ${rp(val)}`:''} dari lost sales`:'Belum ada pasangan outlet yang cocok saat ini.'}</span></div>${trips.length?'<button type="button" class="st-copy" data-st-copy="all">Salin semua</button>':''}</div>`;
  const cards=trips.length?`<div class="st-trips">${trips.map((t,i)=>tripCard(t,i)).join('')}</div>`:'';
  const gapList=gaps.length?`<section class="st-gaps"><h3>Kurang, tapi tidak ada pengirim <small>${nf(gaps.length)} outlet-produk</small></h3><p>Tidak ada outlet satu area dengan kelebihan yang cukup. Catat untuk rencana kirim besok.</p><ul>${gaps.slice(0,12).map(g=>`<li><b>${esc(name(g.id))}</b><span>${esc(LABELS[g.lab])}</span><em>kurang ±${nf(g.need)} pcs</em></li>`).join('')}</ul>${gaps.length>12?`<small>+${nf(gaps.length-12)} lainnya</small>`:''}</section>`:'';
  return head+cards+gapList+`<p class="wl-foot">Transfer hanya antar-outlet satu area (Center area itu ikut menjadi pengirim); Stand Alone tidak diikutkan. Pengirim selalu menyisakan perkiraan lakunya sendiri sampai tutup +15%, jadi tidak ikut kehabisan. Jarak dari koordinat outlet (×1,35 untuk jalan), 25 km/jam + 15 menit persiapan. Produk baru tidak direkomendasikan karena belum ada estimasinya. <b>Penting:</b> transfer yang sudah dikirim hari ini belum terbaca sampai tercatat di Daily Report, jadi cek dulu sebelum mengirim.</p>`;
 }
 // ---------- Tampilan ----------
 let lastTrips=[];
 const STATUS_OPTS=[['all','Semua status'],['act','Perlu tindakan'],['habis','Habis'],['kurang','Kurang stok'],['over','Over stok'],['normal','Normal'],['baru','Produk baru']];
 const okStatus=st=>!state.status||state.status==='all'?true:state.status==='act'?['habis','kurang','over'].includes(st):st===state.status;
 const sel=(key,opts,val,label)=>`<label class="st-sel"><span>${label}</span><select data-st-sel="${key}">${opts.map(([k,t])=>`<option value="${esc(k)}"${k===val?' selected':''}>${esc(t)}</option>`).join('')}</select></label>`;
 function view(){
  const c=compute();
  if(!c.ok)return `<div class="st-empty"><b>${esc(c.reason)}</b><span>Data diperbarui tiap 15 menit pukul 09.00–20.45.</span></div>`;
  const areas=areaList(),byArea=new Map(),seen=new Set();
  for(const a of areas){const rows=c.outlets.filter(o=>a.ids.includes(o.id)&&!seen.has(o.id));rows.forEach(o=>seen.add(o.id));if(rows.length)byArea.set(a.key,{...a,rows});}
  const rest=c.outlets.filter(o=>!seen.has(o.id));if(rest.length)byArea.set('Lainnya',{key:'Lainnya',title:'Lainnya',ids:rest.map(o=>o.id),centers:[],rows:rest});
  if(state.area!=='all'&&!byArea.has(state.area))state.area='all';
  if(!GROUPS.some(g=>g[0]===state.group))state.group='all';
  const pick=selected!=='__all__'?[...byArea.values()].filter(a=>a.rows.some(o=>o.id===selected)).map(a=>({...a,rows:a.rows.filter(o=>o.id===selected)})):state.area==='all'?[...byArea.values()]:[byArea.get(state.area)].filter(Boolean);
  const all=pick.flatMap(a=>a.rows),ids=selected!=='__all__'||state.area!=='all'?new Set(all.map(o=>o.id)):null,its=all.flatMap(o=>o.items.filter(it=>inGroup(it.lab)));
  const count=k=>its.filter(it=>it.st===k).length,sum0=k=>its.reduce((s,it)=>s+(it[k]||0),0),lostRp=its.reduce((s,it)=>s+(it.lostNow||0)*(it.price||0),0),lostDayRp=its.reduce((s,it)=>s+(it.lostDay||0)*(it.price||0),0);
  const age=c.lastH!=null?(c.now-c.lastH)*60:null,stale=age!=null&&age>STALE_MIN&&c.now<CLOSE,daily=c.dailyAt?hm(toH(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(c.dailyAt)))):'—';
  const nTrips=transfers(c).trips.filter(t=>(!ids||ids.has(t.from)||ids.has(t.to))&&t.items.some(x=>inGroup(x.lab))).length;
  const seg=`<div class="st-seg" role="tablist" aria-label="Tampilan">${[['stok','Stok'],['transfer','Rekomendasi transfer']].map(([k,t])=>`<button type="button" role="tab" data-st-view="${k}" aria-selected="${state.view===k}" class="${state.view===k?'on':''}">${t}${k==='transfer'&&nTrips?` <em>${nTrips}</em>`:''}</button>`).join('')}</div>`;
  const fresh=`<div class="st-fresh${stale?' stale':''}"><i aria-hidden="true"></i><span>Data ${c.lastH!=null?hm(c.lastH):'—'}${stale?` · ${nf(age)} mnt belum berubah`:''}</span><small>Daily Report ${daily}</small></div>`;
  const filters=`<div class="st-tools">${selected==='__all__'?sel('area',[['all','Semua area'],...[...byArea.values()].map(a=>[a.key,a.title])],state.area,'Area'):`<span class="st-one"><small>Outlet</small>${esc(name(selected))}</span>`}${sel('group',GROUPS.map(([k,t])=>[k,t]),state.group,'Produk')}${state.view==='stok'?sel('status',STATUS_OPTS,state.status||'all','Status'):''}</div>`;
  let body;
  if(state.view==='transfer')body=transferView(c,ids);
  else{
   const cards=[['habis',`lost ±${nf(sum0('lostNow'))} pcs`],['kurang',`kurang ±${nf(sum0('short'))} pcs`],['over',`sisa ±${nf(sum0('extra'))} pcs`],['normal','stok cukup']].map(([k,sub])=>`<button type="button" class="st-sum ${ST[k][1]}${state.status===k?' on':''}" data-st-status="${k}" aria-pressed="${state.status===k}"><span>${ST[k][0]}</span><strong>${nf(count(k))}</strong><small>${sub}</small></button>`).join('');
   const lost=`<div class="st-sum lost"><span>Lost sales hari ini</span><strong>${lostRp?rp(lostRp):nf(sum0('lostNow'))+' pcs'}</strong><small>s.d. tutup ±${lostDayRp?rp(lostDayRp):nf(sum0('lostDay'))+' pcs'}</small></div>`;
   const cols=LABELS.map((_,lab)=>lab).filter(lab=>inGroup(lab)&&all.some(o=>o.items.some(it=>it.lab===lab&&okStatus(it.st))));
   const sections=pick.map(a=>{
    const rows=a.rows.filter(o=>o.items.some(it=>inGroup(it.lab)&&okStatus(it.st))).sort((x,y)=>(a.centers.includes(y.id)-a.centers.includes(x.id))||name(x.id).localeCompare(name(y.id))).map(o=>{
     const map=new Map(o.items.map(it=>[it.lab,it])),open=state.outlet===o.id;
     const cells=cols.map(lab=>{const it=map.get(lab);if(!it)return '<td class="st-c empty">·</td>';return `<td class="st-c ${ST[it.st][1]}${okStatus(it.st)?'':' dim'}" title="${esc(LABELS[lab])}: ${ST[it.st][0]}">${cellText(it)}</td>`;}).join('');
     return `<tr class="${open?'open':''}"><th scope="row"><button type="button" data-st-outlet="${esc(o.id)}" aria-expanded="${open}"><span class="st-caret">${open?'▾':'▸'}</span>${esc(name(o.id))}${a.centers.includes(o.id)?' <i>Center</i>':''}${o.day?'':' <em>tanpa Daily Report</em>'}</button></th>${cells}</tr>${open?`<tr class="st-open"><td colspan="${cols.length+1}">${detail(o)}</td></tr>`:''}`;}).join('');
    if(!rows)return '';
    return `<section class="st-area"><h3>${esc(a.title)}<small>${a.rows.length} outlet${a.centers.length?` · Center ${esc(a.centers.map(name).join(', '))}`:''}</small></h3><div class="st-scroll"><table class="st-grid"><thead><tr><th>Outlet</th>${cols.map(l=>`<th title="${esc(LABELS[l])}">${esc(SHORT[l])}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div></section>`;}).join('');
   const legend=`<div class="st-legend">${['habis','kurang','normal','over','baru'].map(k=>pill(k)).join('')}<span class="st-hint">Angka = sisa stok sekarang · klik nama outlet untuk rincian</span></div>`;
   body=`<div class="st-sums">${cards}${lost}</div>${legend}${sections||'<div class="st-empty"><b>Tidak ada yang cocok dengan filter ini.</b><span>Ubah pilihan status atau produk.</span></div>'}
   <p class="wl-foot"><b>Kurang stok</b>: sisa kurang dari 80% perkiraan laku sampai tutup. <b>Over stok</b>: perkiraan sisa saat tutup minimal 3 pcs dan 30%. Perkiraan laku memakai pola jual per jam outlet itu sendiri (pagi, siang, sore berbeda) dan kecepatan jual hari ini. Lost sales = perkiraan penjualan pada jam-jam setelah kue habis. <b>Produk baru</b> (riwayat di outlet itu kurang dari 20 hari) hanya ditampilkan stoknya. Transfer hari ini baru terhitung setelah tercatat di Daily Report.</p>`;
  }
  return `<div class="st-top">${seg}${fresh}</div>${filters}<div class="st-body">${body}</div><p class="st-build">🚧 Sedang dibangun · input transfer menyusul</p>`;
 }
 function copy(text,btn){const done=()=>{const t=btn.textContent;btn.textContent='Tersalin ✓';btn.classList.add('ok');setTimeout(()=>{btn.textContent=t;btn.classList.remove('ok');},1800);};
  const fallback=()=>{const ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();try{document.execCommand('copy');done();}catch{}ta.remove();};
  try{navigator.clipboard.writeText(text).then(done,fallback);}catch{fallback();}}
 function paint(){const el=document.getElementById('st-root');if(!el)return;const f=document.activeElement;if(f&&el.contains(f)&&f.tagName==='SELECT')return;el.innerHTML=view();}
 document.addEventListener('click',e=>{if(!e.target.closest?.('#st-root'))return;const v=e.target.closest('[data-st-view]'),s=e.target.closest('[data-st-status]'),o=e.target.closest('[data-st-outlet]'),cp=e.target.closest('[data-st-copy]');
  if(cp){const k=cp.dataset.stCopy,list=k==='all'?lastTrips:[lastTrips[+k]].filter(Boolean);if(list.length)copy(`Transfer ${hm(Math.min(Math.max(nowHour(),OPEN),CLOSE))}:\n`+list.map(tripText).join('\n'),cp);return;}
  if(v){state.view=v.dataset.stView;remember();}else if(s){state.status=state.status===s.dataset.stStatus?null:s.dataset.stStatus;}else if(o){state.outlet=state.outlet===o.dataset.stOutlet?null:o.dataset.stOutlet;}else return;paint();});
 document.addEventListener('change',e=>{const t=e.target.closest?.('#st-root [data-st-sel]');if(!t)return;const k=t.dataset.stSel;if(k==='status')state.status=t.value==='all'?null:t.value;else{state[k]=t.value;state.outlet=null;remember();}t.blur();paint();});
 for(const ev of ['forecast-stock-live','forecast-data-refreshed'])window.addEventListener(ev,()=>{if(ev==='forecast-data-refreshed')baseCache=null;paint();});
 setInterval(()=>{if(!document.hidden)paint();},60000);
 return {compute,render(id){selected=id||'__all__';return `<div class="focus-intro"><h2>Stok & Transfer</h2><span>Stok real time dan saran transfer antar-outlet</span></div><div id="st-root">${view()}</div>`;},transfers};
})();
