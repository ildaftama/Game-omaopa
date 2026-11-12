'use strict';
// Pengaturan › Eksperimen (owner 2026-11-12) -- KHUSUS akun Master, tidak dipakai bagian lain web.
// Grafik PCS per outlet: penjualan reguler real (TANPA pesanan, sama seperti dasar saran forecast)
// vs prediksi PCS, per kategori (Malmil, Ogura, Mini Ogura, Chiffon) dan per rasa. Tujuannya
// menilai apakah prediksi langsung dalam PCS lebih tepat daripada membagi target omzet (Rupiah):
// harga per pcs tiap produk berbeda, jadi satu pengali omzet untuk semua produk bisa bias.
//
// Prediksi tiap tanggal D dihitung HANYA dari data sebelum D (tidak bocor ke masa depan), dengan
// metode yang sama seperti saran reguler ForecastPlanner.recommend versi tanpa snapshot: median
// hari yang sama 8 minggu terakhir (min. 3 titik, kalau kurang: median 14 hari terakhir) x tren
// (median 14 hari terakhir / 14 hari sebelumnya, dibatasi 0,85-1,15). Prediksi kategori = jumlah
// prediksi rasanya. Semua outlet = jumlah per outlet (outlet-hari yang datanya belum lengkap dilewati).
window.ForecastExperiment=(()=>{
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const nf=n=>n==null?'—':Math.round(n).toLocaleString('id-ID');
 const pct=n=>n==null?'—':n.toLocaleString('id-ID',{maximumFractionDigits:1})+'%';
 const today=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Jakarta'});
 const shift=(s,n)=>{const d=new Date(s+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
 const dow=s=>new Date(s+'T12:00:00Z').getUTCDay();
 const DAY=['Min','Sen','Sel','Rab','Kam','Jum','Sab'];
 const short=s=>{const [,m,d]=s.split('-');return `${+d}/${+m}`;};
 const median=a=>{if(!a.length)return null;const b=[...a].sort((x,y)=>x-y),i=(b.length-1)/2;return (b[Math.floor(i)]+b[Math.ceil(i)])/2;};
 const CATS=[
  {name:'Malmil',color:'#b25d38',items:[[2,'Cheese'],[3,'Choco']]},
  {name:'Ogura',color:'#244c78',items:[[0,'Cheese'],[1,'Choco']]},
  {name:'Mini Ogura',color:'#76658d',items:[[4,'Cheese'],[5,'Choco'],[6,'Durian']]},
  {name:'Chiffon',color:'#395745',items:[[7,'Classic Keju'],[8,'Classic Ekstra Keju'],[9,'Butter'],[11,'Lite Keju'],[10,'Lite Ekstra Keju']]},
 ];
 const RANGES=[[28,'4 minggu'],[56,'8 minggu'],[91,'3 bulan']];
 let outlet='__all__',range=28;
 const isMaster=()=>window.ForecastAuth?.role?.master===true;
 const data=()=>window.PcsPanels?.data?.()||{};
 const name=id=>window.OUTLET_INTELLIGENCE?.outlets?.[id]?.name||id;

 // Seri reguler real per outlet x produk, di-cache per versi data penjualan/pesanan.
 // Data dipotong per outlet SEKALI (estimatedPartition memindai seluruh hari penjualan tiap
 // dipanggil -- tanpa ini "Semua outlet" butuh ±9 detik).
 let cache={key:'',series:new Map(),pred:new Map(),byId:null};
 function series(id,p){
  const {sales,orders}=data(),key=(sales?.updatedAt||'')+'|'+(orders?.updatedAt||'')+'|'+(sales?.days?.length||0);
  if(cache.key!==key)cache={key,series:new Map(),pred:new Map(),byId:null};
  const k=id+'|'+p;if(cache.series.has(k))return cache.series.get(k);
  if(!cache.byId){const b=new Map(),pick=(src,f)=>{for(const r of src?.days||[]){const e=b.get(r.id)||{s:[],o:[]};e[f].push(r);b.set(r.id,e);}};pick(sales,'s');pick(orders,'o');cache.byId=b;}
  const e=cache.byId.get(id)||{s:[],o:[]},dates=[...new Set(e.s.map(r=>r.date))].sort();
  const m=new Map();
  for(const r of window.PcsMath.estimatedPartition({...sales,days:e.s},{...orders,days:e.o},[id],p,dates))if(r.retail.complete&&r.retail.value!=null)m.set(r.date,r.retail.value);
  cache.series.set(k,m);return m;
 }
 // Prediksi untuk tanggal target dari seri m, hanya memakai tanggal < target.
 function predict(m,target,k){
  const ck=k+'|'+target;if(cache.pred.has(ck))return cache.pred.get(ck);
  const v=predictRaw(m,target);cache.pred.set(ck,v);return v;
 }
 function predictRaw(m,target){
  const from=shift(target,-56),rows=[];
  for(let d=from;d<target;d=shift(d,1))if(m.has(d))rows.push([d,m.get(d)]);
  if(!rows.length)return null;
  const same=rows.filter(([d])=>dow(d)===dow(target)),sel=same.length>=3?same:rows.slice(-14);
  const recent=rows.filter(([d])=>d>=shift(target,-14)).map(r=>r[1]),prior=rows.filter(([d])=>d<shift(target,-14)&&d>=shift(target,-28)).map(r=>r[1]);
  const a=median(recent),b=median(prior),trend=a!=null&&b>0?Math.max(.85,Math.min(1.15,a/b)):1;
  return Math.round(median(sel.map(r=>r[1]))*trend);
 }
 // Untuk satu produk: per tanggal {real, pred}, dijumlah atas outlet terpilih.
 function productDays(p,dates){
  const ids=outlet==='__all__'?(data().sales?.outletIds||[]):[outlet];
  const out=dates.map(date=>({date,real:null,pred:null,pairReal:0,pairPred:0}));
  for(const id of ids){
   const m=series(id,p);
   out.forEach(o=>{const pr=predict(m,o.date,id+'|'+p),re=m.has(o.date)?m.get(o.date):null;
    if(pr!=null)o.pred=(o.pred||0)+pr;if(re!=null)o.real=(o.real||0)+re;
    if(pr!=null&&re!=null){o.pairReal+=re;o.pairPred+=pr;}});
  }
  return out;
 }
 const sumDays=list=>list[0].map((o,i)=>{const r={date:o.date,real:null,pred:null,pairReal:0,pairPred:0};for(const l of list){const x=l[i];if(x.real!=null)r.real=(r.real||0)+x.real;if(x.pred!=null)r.pred=(r.pred||0)+x.pred;r.pairReal+=x.pairReal;r.pairPred+=x.pairPred;}return r;});
 // Akurasi = 100 - WAPE (sama seperti akurasi di dashboard), dihitung per outlet-hari yang punya
 // real & prediksi. Untuk kategori/semua outlet ini masih total harian, bukan per outlet.
 function score(days){
  const pts=days.filter(d=>d.pairReal>0||d.pairPred>0);if(!pts.length)return null;
  const A=pts.reduce((s,d)=>s+d.pairReal,0),E=pts.reduce((s,d)=>s+Math.abs(d.pairPred-d.pairReal),0),F=pts.reduce((s,d)=>s+d.pairPred,0);
  return A>0?{acc:Math.max(0,100-E/A*100),bias:(F-A)/A*100,days:pts.length}:null;
 }
 function chart(days,color,{h=170,small=false}={}){
  const W=640,H=h,L=small?30:38,R=10,T=10,B=small?20:24,vals=days.flatMap(d=>[d.real,d.pred]).filter(v=>v!=null),max=Math.max(1,...vals);
  const top=max<=5?5:Math.ceil(max/(max>50?10:5))*(max>50?10:5),x=i=>L+(W-L-R)*(days.length>1?i/(days.length-1):.5),y=v=>T+(H-T-B)*(1-v/top);
  const path=k=>{let s='',pen=false;days.forEach((d,i)=>{if(d[k]==null){pen=false;return;}s+=(pen?'L':'M')+x(i).toFixed(1)+' '+y(d[k]).toFixed(1);pen=true;});return s;};
  const grid=[0,.5,1].map(f=>`<line x1="${L}" x2="${W-R}" y1="${y(top*f)}" y2="${y(top*f)}" class="fx-grid"/><text x="${L-5}" y="${y(top*f)+3.5}" text-anchor="end" class="fx-ax">${nf(top*f)}</text>`).join('');
  const step=Math.max(1,Math.ceil(days.length/(small?4:8))),labels=days.map((d,i)=>i%step===0||i===days.length-1?`<text x="${x(i)}" y="${H-6}" text-anchor="middle" class="fx-ax">${short(d.date)}</text>`:'').join('');
  const wk=days.map((d,i)=>dow(d.date)===0||dow(d.date)===6?`<rect x="${x(i)-(W-L-R)/Math.max(1,days.length-1)/2}" y="${T}" width="${(W-L-R)/Math.max(1,days.length-1)}" height="${H-T-B}" class="fx-wk"/>`:'').join('');
  const dots=days.map((d,i)=>`<g><title>${DAY[dow(d.date)]} ${short(d.date)} · real ${nf(d.real)} · prediksi ${nf(d.pred)} pcs</title><rect x="${x(i)-6}" y="${T}" width="12" height="${H-T-B}" fill="transparent"/>${d.real!=null&&!small?`<circle cx="${x(i)}" cy="${y(d.real)}" r="2.2" fill="${color}"/>`:''}${d.future&&d.pred!=null?`<circle cx="${x(i)}" cy="${y(d.pred)}" r="3.5" class="fx-next"/>`:''}</g>`).join('');
  return `<svg class="fx-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Grafik pcs real vs prediksi">${wk}${grid}${labels}<path d="${path('pred')}" class="fx-pred"/><path d="${path('real')}" fill="none" stroke="${color}" stroke-width="${small?1.6:2.2}"/>${dots}</svg>`;
 }
 function render(){
  if(!isMaster())return '<article class="workspace-card"><p class="fs-lock">🔒 Eksperimen hanya bisa dibuka akun Master.</p></article>';
  const {sales,orders}=data();if(!sales||!orders||!window.PcsMath)return '<article class="workspace-card"><p class="fs-use">Memuat data penjualan PCS…</p></article>';
  const t=today(),last=(sales.days||[]).filter(r=>r.complete).reduce((m,r)=>r.date>m?r.date:m,''),end=last||shift(t,-1);
  const dates=[];for(let i=range-1;i>=0;i--)dates.push(shift(end,-i));
  // Tanggal ke depan: dari hari setelah data terakhir sampai besok (target yang biasanya disusun).
  const future=[];for(let d=shift(end,1);d<=shift(t,1);d=shift(d,1))future.push(d);
  const all=[...dates,...future];
  const ids=[...(sales.outletIds||[])].sort((a,b)=>name(a).localeCompare(name(b)));
  const opts=`<option value="__all__">Semua outlet</option>`+ids.map(id=>`<option value="${esc(id)}" ${outlet===id?'selected':''}>${esc(name(id))}</option>`).join('');
  const target=shift(t,1);
  const cards=CATS.map(cat=>{
   const per=cat.items.map(([p,label])=>{const days=productDays(p,all).map(d=>({...d,future:d.date>end}));return {p,label,days,past:days.filter(d=>!d.future)};});
   const total=sumDays(per.map(r=>r.days)).map((d,i)=>({...d,future:per[0].days[i].future})),past=total.filter(d=>!d.future),sc=score(past),next=total.find(d=>d.date===target);
   const rows=per.map(r=>{const s=score(r.past),n=r.days.find(d=>d.date===target),y=r.past.at(-1),avg=r.past.slice(-7).filter(d=>d.real!=null);
    return `<tr><td><b>${esc(r.label)}</b></td><td class="fx-num fx-strong">${nf(n?.pred)}</td><td class="fx-num">${nf(y?.real)}</td><td class="fx-num">${avg.length?nf(avg.reduce((a,d)=>a+d.real,0)/avg.length):'—'}</td><td class="fx-num">${s?pct(s.acc):'—'}</td><td class="fx-num ${s&&Math.abs(s.bias)>10?'fx-warn':''}">${s?(s.bias>0?'+':'')+pct(s.bias):'—'}</td></tr>`;}).join('');
   const minis=per.map(r=>`<div class="fx-mini"><div class="fx-mini-head"><b>${esc(r.label)}</b><span>besok ${nf(r.days.find(d=>d.date===target)?.pred)} pcs</span></div>${chart(r.days,cat.color,{h:110,small:true})}</div>`).join('');
   return `<article class="workspace-card fx-card"><div class="fx-card-head"><div><h3 class="fs-h3"><span class="fx-dot" style="background:${cat.color}"></span>${esc(cat.name)}</h3><p class="fs-use">Prediksi ${esc(DAY[dow(target)])} ${short(target)}: <b>${nf(next?.pred)} pcs</b>${sc?` · akurasi ${range} hari ${pct(sc.acc)} · bias ${(sc.bias>0?'+':'')+pct(sc.bias)}`:''}</p></div></div>
    ${chart(total,cat.color)}
    <div class="fx-table-wrap"><table class="fx-table"><thead><tr><th>Rasa</th><th>Prediksi ${short(target)}</th><th>Real ${last?short(last):''}</th><th>Rata² 7 hari</th><th>Akurasi</th><th>Bias</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="fx-minis">${minis}</div></article>`;
  }).join('');
  return `<article class="workspace-card fx-intro"><div><h3 class="fs-h3">Grafik PCS per kategori & rasa <small>eksperimen · hanya Master</small></h3>
   <p class="fs-use">Garis tebal = penjualan <b>reguler real tanpa pesanan</b>. Garis putus-putus = prediksi PCS yang dihitung hanya dari data sebelum tanggal itu (median hari yang sama 8 minggu × tren). Titik bulat = prediksi untuk hari yang belum ada datanya. Area abu-abu = Sabtu/Minggu. Arahkan kursor ke grafik untuk melihat angka per hari. Halaman ini tidak mengubah forecast tim.</p></div>
   <div class="fx-controls"><label>Outlet<select data-fx-outlet>${opts}</select></label><label>Periode<select data-fx-range>${RANGES.map(([n,l])=>`<option value="${n}" ${range===n?'selected':''}>${l}</option>`).join('')}</select></label></div>
   <p class="fx-note">Akurasi = 100% − selisih absolut ÷ penjualan real (rumus sama dengan akurasi di Dashboard), dihitung per hari untuk ${outlet==='__all__'?'total semua outlet':'outlet ini'}. Bias + = prediksi cenderung kelebihan. Data real terakhir: ${last?esc(last):'—'}.</p></article>${cards}`;
 }
 function change(e){
  const t=e.target;
  if(t.matches('[data-fx-outlet]')){outlet=t.value;return true;}
  if(t.matches('[data-fx-range]')){range=Number(t.value)||28;return true;}
  return false;
 }
 return {render,change};
})();
