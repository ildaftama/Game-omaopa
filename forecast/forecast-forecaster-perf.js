// Performa forecaster (owner 2026-11-24; dirombak 2026-11-27): dibaca Master, Factory Manager, SPV Logistik.
// Rencana dikreditkan ke penyusun versi awal (revisi 1, disimpan sebelum hari H), versi yang sama dengan
// akurasi di Dashboard. Owner 27 Nov: hanya akun ID terdaftar (bukan Master, bukan akun lama tanpa nama),
// lengkap dengan waste & lost sales per forecaster, per area, per outlet, per produk.
// - Akurasi: rencana reguler vs penjualan reguler produk inti (sama seperti sebelumnya).
// - Waste rencana tanggal D = sisa kue hari D: rekap waste tim tanggal D atau Daily Report tanggal D+1
//   (kolom waste Daily Report = sisa kemarin), diambil yang lebih besar per produk. Nominal = HPP.
// - Lost sales = estimasi harian (dokumen lost-daily): murni (tanpa transfer) dan setelah transfer.
window.ForecastForecasterPerf=(()=>{
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const nf=v=>Math.round(v||0).toLocaleString('id-ID'),pc=v=>v==null||!Number.isFinite(v)?'—':v.toLocaleString('id-ID',{maximumFractionDigits:1})+'%';
 const rp=v=>{v=Math.round(v||0);const a=Math.abs(v);return a>=1e9?'Rp'+(v/1e9).toLocaleString('id-ID',{maximumFractionDigits:2})+' M':a>=1e6?'Rp'+(v/1e6).toLocaleString('id-ID',{maximumFractionDigits:1})+' jt':'Rp'+v.toLocaleString('id-ID');};
 const today=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Jakarta'});
 const SALES_LABEL=['Ogura Cheese','Ogura Choco','Malmil Cheese','Malmil Choco','Mini Ogura','Mini Ogura','Mini Ogura','Chiffon Keju','Chiffon Ekstra Keju','Chiffon Butter','Chiffon Lite Ekstra Keju','Chiffon Lite Keju'];
 const PRICE_NAME={'Ogura Cheese':'Ogura Cheese','Ogura Choco':'Ogura Chocolate','Malmil Cheese':'Malmil Cheese','Malmil Choco':'Malmil Chocolate'};
 const REF_PRICE={'Ogura Cheese':56000,'Ogura Choco':56000,'Malmil Cheese':18800,'Malmil Choco':18800,'Mini Ogura':57000/9,'Chiffon Keju':33000,'Chiffon Ekstra Keju':34000,'Chiffon Butter':34000,'Chiffon Lite Ekstra Keju':19000,'Chiffon Lite Keju':18000,'Roti Sosis':6500,'Roti Abon':7000,'Roti Coklat':6000,'Roti Coklat Keju':6000,'Roti Coklat Pisang':6000,'Roti Vanilla':6000,'Sweet Layer 150 ml':14000,'Sweet Layer 300 ml':25000,'Malmil Cheese Less Sugar':17000,'Malmil Choco Less Sugar':18000};
 let period=30,who='__all__',view='area',busy=0,timer=null,users=null,stopUsers=null;const authors=new Map(),queued=new Set(),memo=new Map();
 const rerender=()=>{if(timer)return;timer=setTimeout(()=>{timer=null;window.dispatchEvent(new Event('forecast-perf-render'));},800);};
 function watchUsers(){if(stopUsers||!window.ForecastAccountsAPI?.listen)return;stopUsers=window.ForecastAccountsAPI.listen(l=>{if(l){users=new Map(l.map(u=>[u.uid,u]));rerender();}});}
 function fetchAuthors(keys){
  const cloud=window.ForecastPlanCloud;if(!cloud?.revisionAuthor)return;
  const todo=keys.filter(k=>!authors.has(k)&&!queued.has(k));if(!todo.length)return;todo.forEach(k=>queued.add(k));
  let i=0;const next=()=>{if(i>=todo.length)return Promise.resolve();const k=todo[i++];busy++;return cloud.revisionAuthor(k).then(u=>authors.set(k,u||null),()=>authors.set(k,null)).finally(()=>{busy--;queued.delete(k);if(!busy||i%25===0)rerender();}).then(next);};
  for(let w=0;w<6;w++)next();
 }
 // Akun yang dinilai: akun ID terdaftar & aktif, bukan Master/Tamu. Akun lama (tanpa dokumen akun) tidak dinilai.
 const counted=uid=>{const u=users?.get(uid);return !!u&&u.role!=='master'&&u.role!=='guest';};
 const personName=uid=>users?.get(uid)?.name||'—';
 const outletName=id=>window.OUTLET_INTELLIGENCE?.outlets?.[id]?.name||id;
 function areaOf(){
  const api=window.ForecastTopdown?.areas?.(),m=new Map();
  for(const a of api?.CLUSTERS||[])for(const id of a.ids)if(!m.has(id))m.set(id,a.name);
  for(const id of api?.STAND_ALONE||[])if(!m.has(id))m.set(id,'Stand Alone');
  return m;
 }
 const blank=()=>({n:0,planned:0,actual:0,abs:0,over:0,under:0,sold:0,wPcs:0,wRp:0,lPcs:0,lRp:0,tPcs:0,tRp:0,days:new Set(),outlets:new Set()});
 const add=(x,k,v)=>{x[k]+=v||0;};
 function hppMap(){
  const t={},items=window.DAILY_RECAP_SUMMARY?.wasteItems||window.WASTE_LOST_ITEMS||{};
  for(const day of Object.values(items))for(const o of Object.values(day))for(const [l,[p,n]] of Object.entries(o)){const x=t[l]||(t[l]=[0,0]);x[0]+=p||0;x[1]+=n||0;}
  return l=>{const x=t[l];return x&&x[0]>0?x[1]/x[0]:(REF_PRICE[l]||0)*.5;};
 }
 function collect(){
  const cloud=window.ForecastPlanCloud,P=window.ForecastPlanner,d=window.PcsPanels?.data?.();
  if(!cloud||!['ready','readonly'].includes(cloud.state)||!d?.sales||!d?.orders||!P)return null;
  watchUsers();if(!users)return null;
  const t=today(),from=P.shift(t,-period),recs=(cloud.allRecords||cloud.records||[]).filter(r=>!r.deleted&&r.outlet!=='pabrik'&&r.date>=from&&r.date<t);
  const stock=window.STOCK_DAILY,labels=stock?.labels||[],recap=window.DAILY_RECAP_SUMMARY?.wasteItems||window.WASTE_LOST_ITEMS||{},lost=window.ForecastLostDaily,prices=window.FORECAST_REALIZED_PRICES?.outlets||{},hpp=hppMap(),area=areaOf();
  const price=(id,l)=>(PRICE_NAME[l]?prices[id]?.[PRICE_NAME[l]]?.price:0)||REF_PRICE[l]||0;
  const need=[],people=new Map(),team=blank(),skipped={legacy:0,master:0};
  const G=(map,k)=>map.get(k)||(map.set(k,blank()),map.get(k));
  for(const r of recs){
   const mk=`${r.key}|${r.revision}|${d.sales.updatedAt}|${d.orders.updatedAt}`;let c=memo.get(mk);if(!c){c=P.compare(r,d.sales,d.orders);memo.set(mk,c);}if(!c.eligible||!c.complete||!(c.actual>0))continue;
   let uid=r.revision===1?r.savedBy:authors.get(r.key);if(uid===undefined){need.push(r.key);continue;}
   if(!counted(uid)){if(users.get(uid)?.role==='master')skipped.master++;else skipped.legacy++;continue;}
   const p=people.get(uid)||{uid,sum:blank(),area:new Map(),outlet:new Map(),prod:new Map()};people.set(uid,p);
   const ar=area.get(r.outlet)||'Lainnya',bins=[p.sum,team,G(p.area,ar),G(p.outlet,r.outlet)];
   const over=c.planned>c.actual?c.planned-c.actual:0,under=c.actual>c.planned?c.actual-c.planned:0;
   for(const x of bins){x.n++;add(x,'planned',c.planned);add(x,'actual',c.actual);add(x,'abs',c.absolute);add(x,'over',over);add(x,'under',under);x.days.add(r.date);x.outlets.add(r.outlet);}
   // Akurasi per produk (baris rencana vs terjual reguler).
   for(const row of c.rows||[]){const l=SALES_LABEL[row.p];if(!l||!(row.planned>0||row.actual>0))continue;const x=G(p.prod,l);add(x,'planned',row.planned);add(x,'actual',row.actual);add(x,'abs',Math.abs(row.planned-row.actual));x.days.add(r.date);x.outlets.add(r.outlet);}
   // Waste sisa hari D: rekap tim D atau Daily Report D+1, ambil yang lebih besar per produk.
   const next=P.shift(r.date,1),rc=recap[r.date]?.[r.outlet]||{},dr=stock?.days?.[next]?.[r.outlet]||{},wl=new Map();
   for(const [l,[pcs]] of Object.entries(rc))wl.set(l,Math.max(wl.get(l)||0,pcs||0));
   for(const [k,v] of Object.entries(dr)){const l=labels[+k];if(l)wl.set(l,Math.max(wl.get(l)||0,v[6]||0));}
   for(const [l,pcs] of wl){if(!pcs)continue;const v=pcs*hpp(l);for(const x of [...bins,G(p.prod,l)]){add(x,'wPcs',pcs);add(x,'wRp',v);}}
   // Lost sales hari D (estimasi harian): [terjual, lost murni, jam habis, habis, lost setelah transfer].
   const ld=lost?.days?.[r.date]?.[r.outlet];
   if(ld)for(const [k,v] of Object.entries(ld)){const l=labels[+k];if(!l)continue;const pr=price(r.outlet,l);for(const x of [...bins,G(p.prod,l)]){add(x,'sold',v[0]);add(x,'lPcs',v[1]);add(x,'lRp',(v[1]||0)*pr);add(x,'tPcs',v[4]);add(x,'tRp',(v[4]||0)*pr);}}
  }
  if(need.length)fetchAuthors(need);
  const rows=[...people.values()].sort((a,b)=>b.sum.n-a.sum.n);
  if(who!=='__all__'&&!people.has(who))who='__all__';
  return {rows,team,pending:need.length,skipped,from,to:P.shift(t,-1),area};
 }
 const acc=g=>g.actual>0?100-g.abs/g.actual*100:null,bias=g=>g.actual>0?(g.planned-g.actual)/g.actual*100:null;
 const wPct=g=>g.sold+g.wPcs>0?g.wPcs/(g.sold+g.wPcs)*100:null,lPct=g=>g.sold+g.lPcs>0?g.lPcs/(g.sold+g.lPcs)*100:null,tPct=g=>g.sold+g.tPcs>0?g.tPcs/(g.sold+g.tPcs)*100:null;
 const tone=v=>v==null?'':v>=80?'ok':v>=70?'mid':'hot';
 const wTone=v=>v==null?'':v<=3.5?'ok':v<=5?'mid':'hot',lTone=v=>v==null?'':v<=10?'ok':v<=18?'mid':'hot';
 const cells=g=>{const a=acc(g),b=bias(g),w=wPct(g),l=lPct(g);return `<td><b class="${tone(a)}">${pc(a)}</b><small>${b==null?'':(b>0?'+':'')+pc(b)+(b>3?' lebih':b<-3?' kurang':' seimbang')}</small></td><td><b class="${wTone(w)}">${rp(g.wRp)}</b><small>${nf(g.wPcs)} pcs · ${pc(w)}</small></td><td><b class="${lTone(l)}">${rp(g.lRp)}</b><small>${nf(g.lPcs)} pcs · ${pc(l)}</small></td><td>${rp(g.tRp)}<small>${nf(g.tPcs)} pcs · ${pc(tPct(g))}</small></td>`;};
 const head=first=>`<thead><tr><th>${first}</th><th>Outlet-hari</th><th>Akurasi<small>selisih rencana</small></th><th>Waste<small>sisa kue (HPP)</small></th><th>Lost sales murni<small>tanpa transfer</small></th><th>Lost setelah transfer</th></tr></thead>`;
 const line=(label,g,cls='',extra='')=>`<tr${cls?` class="${cls}"`:''}${extra}><th scope="row">${label}</th><td>${nf(g.n)}<small>${nf(g.days.size)} hari · ${nf(g.outlets.size)} outlet</small></td>${cells(g)}</tr>`;
 function breakdown(c){
  const sel=who==='__all__'?c.rows:c.rows.filter(r=>r.uid===who);if(!sel.length)return '';
  const merge=key=>{const m=new Map();for(const p of sel)for(const [k,g] of p[key]){const x=m.get(k)||blank();for(const f of ['n','planned','actual','abs','over','under','sold','wPcs','wRp','lPcs','lRp','tPcs','tRp'])x[f]+=g[f];g.days.forEach(d=>x.days.add(d));g.outlets.forEach(o=>x.outlets.add(o));m.set(k,x);}return m;};
  const tabs=[['area','Per area'],['outlet','Per outlet'],['prod','Per produk']].map(([k,l])=>`<button type="button" data-fpf-view="${k}" class="${view===k?'on':''}" aria-pressed="${view===k}">${l}</button>`).join('');
  const m=merge(view),loss=g=>g.wRp+g.lRp,list=[...m.entries()].sort((a,b)=>loss(b[1])-loss(a[1]));
  const label=k=>view==='outlet'?esc(outletName(k))+`<small>${esc(c.area.get(k)||'')}</small>`:esc(k);
  const isProd=view==='prod',first=view==='area'?'Area':view==='outlet'?'Outlet':'Produk';
  const body=list.map(([k,g])=>isProd?`<tr><th scope="row">${label(k)}</th><td>${nf(g.days.size)} hari<small>${nf(g.outlets.size)} outlet</small></td>${cells(g)}</tr>`:line(label(k),g)).join('')||'<tr><td colspan="6">Belum ada data.</td></tr>';
  const worst=list[0],title=who==='__all__'?'Semua forecaster':esc(personName(who));
  const insight=worst&&loss(worst[1])>0?`<p class="fpf-note">Kerugian terbesar ${title.toLowerCase()==='semua forecaster'?'tim':'<b>'+title+'</b>'}: <b>${view==='outlet'?esc(outletName(worst[0])):esc(worst[0])}</b> — waste ${rp(worst[1].wRp)} + lost ${rp(worst[1].lRp)}${acc(worst[1])!=null?`, akurasi ${pc(acc(worst[1]))}`:''}.</p>`:'';
  return `<section class="fpf-break"><div class="fpf-head"><h4 class="fs-h3">Rincian ${title}</h4><div class="fpf-periods" role="group" aria-label="Rincian">${tabs}</div></div>${insight}
  <div class="fpf-scroll"><table class="fpf-table">${head(first)}<tbody>${body}</tbody></table></div></section>`;
 }
 function render(){
  const c=collect(),per=[[7,'7 hari'],[30,'30 hari'],[60,'60 hari']].map(([k,l])=>`<button type="button" data-fpf-period="${k}" class="${period===k?'on':''}" aria-pressed="${period===k}">${l}</button>`).join('');
  if(!c)return '<div id="fpf-root"><article class="workspace-card"><p class="fs-use">Memuat rencana tim, akun, dan penjualan…</p></article></div>';
  const d=s=>new Date(s+'T12:00:00Z').toLocaleDateString('id-ID',{day:'numeric',month:'short'});
  const pick=c.rows.length>1?`<div class="fpf-who" role="group" aria-label="Forecaster"><button type="button" data-fpf-who="__all__" class="${who==='__all__'?'on':''}">Semua</button>${c.rows.map(r=>`<button type="button" data-fpf-who="${esc(r.uid)}" class="${who===r.uid?'on':''}">${esc(personName(r.uid))}</button>`).join('')}</div>`:'';
  const body=c.rows.length?c.rows.map(g=>line(`<button type="button" class="fpf-name${who===g.uid?' on':''}" data-fpf-who="${esc(g.uid)}">${esc(personName(g.uid))}</button><small>${esc(window.ForecastRolePolicy?.ROLE_LABEL?.[users.get(g.uid)?.role]||'')}</small>`,g.sum)).join('')+(c.rows.length>1?line('Seluruh forecaster',c.team,'fpf-team'):''):`<tr><td colspan="6">${c.pending?'Memuat penyusun rencana…':'Belum ada rencana dari akun terdaftar yang bisa dinilai pada periode ini.'}</td></tr>`;
  const skip=c.skipped.master+c.skipped.legacy?` Tidak dinilai: ${[c.skipped.legacy?`${nf(c.skipped.legacy)} rencana akun lama tanpa nama`:'',c.skipped.master?`${nf(c.skipped.master)} rencana Master`:''].filter(Boolean).join(' dan ')}.`:'';
  return `<div id="fpf-root"><article class="workspace-card"><div class="fpf-head"><div><h3 class="fs-h3">Performa forecaster</h3><p class="fs-use">${d(c.from)} – ${d(c.to)}. Hanya akun terdaftar (bukan Master). Rencana dikreditkan ke penyusun versi awalnya.${skip}${c.pending?` Memuat ${nf(c.pending)} penyusun…`:''}</p></div><div class="fpf-periods" role="group" aria-label="Periode">${per}</div></div>
  <div class="fpf-scroll"><table class="fpf-table">${head('Forecaster')}<tbody>${body}</tbody></table></div>
  ${pick}${breakdown(c)}
  <p class="fs-use"><b>Akurasi</b> = 100% dikurangi selisih absolut rencana reguler vs terjual reguler produk inti; angka kecil di bawahnya positif berarti rencana di atas penjualan. <b>Waste</b> = sisa kue hari itu (rekap waste tim hari H atau Daily Report H+1, diambil yang lebih besar), nominal HPP, persen dari kue terjual + waste. <b>Lost sales</b> = estimasi penjualan yang hilang sejak kue habis sampai tutup (persen dari permintaan); setelah transfer memperhitungkan transfer antar-outlet. Hari yang waste atau lost-nya belum tercatat terhitung 0, jadi hari terakhir bisa bertambah setelah data masuk.</p></article></div>`;
 }
 document.addEventListener('click',e=>{const t=e.target.closest?.('#fpf-root [data-fpf-period],#fpf-root [data-fpf-who],#fpf-root [data-fpf-view]');if(!t)return;if(t.dataset.fpfPeriod)period=+t.dataset.fpfPeriod;else if(t.dataset.fpfWho)who=t.dataset.fpfWho;else view=t.dataset.fpfView;window.dispatchEvent(new Event('forecast-perf-render'));});
 for(const ev of ['forecast-plans-changed','forecast-lost-daily','forecast-data-refreshed'])window.addEventListener(ev,()=>{if(document.getElementById('fpf-root'))rerender();});
 return {render};
})();
