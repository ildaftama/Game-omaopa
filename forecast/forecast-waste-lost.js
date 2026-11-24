// Tab Waste & Lost Sales (owner 2026-11-24). Masih tahap dibangun sampai seluruh data dipastikan.
// Waste per produk dari tab WASTE tim, stok habis dari Daily Report, menit lost dari rekap harian.
window.ForecastWasteLost=(()=>{
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const nf=v=>Math.round(v||0).toLocaleString('id-ID'),rp=v=>'Rp'+nf(v),pc=(v,d=2)=>v==null||!Number.isFinite(v)?'—':v.toLocaleString('id-ID',{minimumFractionDigits:d,maximumFractionDigits:d})+'%';
 const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta'}).format(new Date());
 const ORDER=['Ogura Cheese','Ogura Choco','Malmil Cheese','Malmil Choco','Malmil Cheese Less Sugar','Malmil Choco Less Sugar','Mini Ogura','Chiffon Keju','Chiffon Ekstra Keju','Chiffon Butter','Chiffon Kurma','Chiffon Lite Ekstra Keju','Chiffon Lite Keju','Roti Sosis','Roti Abon','Roti Coklat','Roti Coklat Keju','Roti Coklat Pisang','Roti Vanilla'];
 const GROUPS=[['Ogura',/^Ogura/],['Malmil',/^Malmil/],['Mini',/^Mini/],['Chiffon',/^Chiffon/],['Roti',/^Roti/]];
 const state={period:'mtd',sort:'nom',open:null};let selected='__all__';
 const name=id=>window.OUTLET_INTELLIGENCE?.outlets?.[id]?.name||id;
 const limits=()=>{const t=window.ForecastSettings?.get?.().thresholds||{};return {waste:t.waste||3.5,lost:t.lostSales||4.5,open:(t.openHours||12)*60};};
 function range(allDates){
  const t=today(),past=allDates.filter(d=>d<t).sort();
  if(state.period==='7')return past.slice(-7);
  if(state.period==='prev'){const m=t.slice(0,7),[y,mo]=m.split('-').map(Number),p=mo===1?`${y-1}-12`:`${y}-${String(mo-1).padStart(2,'0')}`;return past.filter(d=>d.startsWith(p));}
  return past.filter(d=>d.startsWith(t.slice(0,7)));
 }
 function collect(){
  const recap=window.DAILY_RECAP_SUMMARY,stock=window.STOCK_DAILY,items=recap?.wasteItems||{},dates=range(Object.keys(items).filter(d=>Object.keys(items[d]).length));
  const ids=(selected==='__all__'?window.PcsPanels?.data?.().sales?.outletIds||[]:[selected]),gross=new Map(),series=window.ForecastDashboard?.grossSeries?.();
  if(series)for(const [id,s] of series.byOutlet)for(const pt of s)gross.set(pt.date+'|'+id,pt.gross);
  const blank=()=>({pcs:0,nom:0,kirim:0,habis:0,cek:0,days:0,tfIn:0,tfOut:0}),prod={},out=new Map(ids.map(id=>[id,{id,pcs:0,nom:0,omzet:0,lostM:0,lostD:0,habis:0,cek:0,kirim:0,items:{}}]));
  const cell=(o,l)=>o.items[l]||(o.items[l]=blank()),P=l=>prod[l]||(prod[l]=blank());
  for(const d of dates)for(const [id,o] of out){o.omzet+=gross.get(d+'|'+id)||0;
   for(const [l,[pcs,nom]] of Object.entries(items[d]?.[id]||{})){o.pcs+=pcs;o.nom+=nom;const a=cell(o,l),b=P(l);a.pcs+=pcs;a.nom+=nom;b.pcs+=pcs;b.nom+=nom;}
   const m=recap?.lostSalesMinutes?.[d]?.[id];if(Number.isFinite(m)){o.lostM+=m;o.lostD++;}
   const day=stock?.days?.[d]?.[id];if(day)for(const [k,v] of Object.entries(day)){const l=stock.labels[+k];if(!l)continue;const a=cell(o,l),b=P(l),closed=v[5]===1,zero=closed&&v[0]>0&&v[4]<=0&&!v[3],wasted=(v[6]??items[d]?.[id]?.[l]?.[0]??0)>0,empty=zero&&!wasted,check=zero&&wasted;for(const x of [a,b]){x.kirim+=v[1];x.tfIn+=v[2];x.tfOut+=v[3];if(closed&&v[0]>0)x.days++;if(empty)x.habis++;if(check)x.cek++;}o.kirim+=v[1];if(empty)o.habis++;if(check)o.cek++;}
  }
  const rows=[...out.values()],sum=k=>rows.reduce((s,r)=>s+r[k],0);
  return {dates,rows,prod,pcs:sum('pcs'),nom:sum('nom'),omzet:sum('omzet'),habis:sum('habis'),cek:sum('cek'),lostM:sum('lostM'),lostD:sum('lostD'),hasStock:!!stock,hasItems:Object.keys(items).length>0};
 }
 const tone=(v,lim)=>v==null?'':v>lim?'hot':v>=lim*.9?'mid':'ok';
 const span=ds=>ds.length?`${+ds[0].slice(8)}/${+ds[0].slice(5,7)} – ${+ds.at(-1).slice(8)}/${+ds.at(-1).slice(5,7)}`:'belum ada data';
 function productTable(c){
  const total=c.nom||1,labels=ORDER.filter(l=>c.prod[l]&&(c.prod[l].pcs||c.prod[l].kirim||c.prod[l].days));
  const body=GROUPS.map(([g,re])=>{const ls=labels.filter(l=>re.test(l));if(!ls.length)return '';const a=ls.reduce((s,l)=>({pcs:s.pcs+c.prod[l].pcs,nom:s.nom+c.prod[l].nom,kirim:s.kirim+c.prod[l].kirim}),{pcs:0,nom:0,kirim:0});
   return `<tr class="wl-group"><th scope="row">${g}</th><td>${nf(a.pcs)}</td><td>${rp(a.nom)}</td><td>${pc(a.nom/total*100,1)}</td><td>${a.kirim?pc(a.pcs/a.kirim*100,1):'—'}</td></tr>`+ls.map(l=>{const p=c.prod[l];return `<tr><th scope="row">${esc(l)}</th><td>${nf(p.pcs)}</td><td>${rp(p.nom)}</td><td>${pc(p.nom/total*100,1)}</td><td>${p.kirim?pc(p.pcs/p.kirim*100,1):'—'}</td></tr>`;}).join('');}).join('');
  return `<article class="workspace-card wl-card"><h3>Waste per produk</h3><div class="wl-scroll"><table class="wl-table"><thead><tr><th>Produk</th><th>Pcs</th><th>Nominal HPP</th><th>Porsi</th><th>Dari kiriman</th></tr></thead><tbody>${body||'<tr><td colspan="5">Belum ada data waste per produk.</td></tr>'}</tbody><tfoot><tr><th>Total</th><td>${nf(c.pcs)}</td><td>${rp(c.nom)}</td><td>100%</td><td></td></tr></tfoot></table></div></article>`;
 }
 function lostTable(c){
  const labels=ORDER.filter(l=>c.prod[l]?.days);
  const body=GROUPS.map(([g,re])=>{const ls=labels.filter(l=>re.test(l));if(!ls.length)return '';const a=ls.reduce((s,l)=>({h:s.h+c.prod[l].habis,k:s.k+c.prod[l].cek,d:s.d+c.prod[l].days,i:s.i+c.prod[l].tfIn}),{h:0,k:0,d:0,i:0});
   return `<tr class="wl-group"><th scope="row">${g}</th><td>${nf(a.h)}</td><td>${nf(a.k)}</td><td>${pc(a.d?a.h/a.d*100:null,1)}</td><td>${nf(a.i)}</td></tr>`+ls.map(l=>{const p=c.prod[l];return `<tr><th scope="row">${esc(l)}</th><td>${nf(p.habis)}</td><td>${nf(p.cek)}</td><td>${pc(p.days?p.habis/p.days*100:null,1)}</td><td>${nf(p.tfIn)}</td></tr>`;}).join('');}).join('');
  return `<article class="workspace-card wl-card"><h3>Lost sales per produk</h3><p class="wl-note">Habis = stok akhir 0 tanpa waste dan tanpa transfer keluar. Perlu dicek = stok akhir 0 tetapi ada waste, jadi belum tentu kehabisan. Estimasi pcs dan rupiah menyusul setelah jam habis dipastikan.</p><div class="wl-scroll"><table class="wl-table"><thead><tr><th>Produk</th><th>Outlet-hari habis</th><th>Perlu dicek</th><th>Dari hari berstok</th><th>Transfer masuk</th></tr></thead><tbody>${body||'<tr><td colspan="5">Data stok Daily Report belum masuk.</td></tr>'}</tbody></table></div></article>`;
 }
 function outletTable(c){
  const L=limits(),m=r=>({...r,wp:r.omzet>0?r.nom/r.omzet*100:null,lp:r.lostD?r.lostM/r.lostD/L.open*100:null}),rows=c.rows.map(m),key={nom:'nom',pcs:'pcs',wp:'wp',lp:'lp',habis:'habis',cek:'cek'}[state.sort]||'nom';rows.sort((a,b)=>(b[key]??-1)-(a[key]??-1));
  const th=(k,t)=>`<th aria-sort="${state.sort===k?'descending':'none'}"><button type="button" data-wl-sort="${k}">${t}${state.sort===k?' ↓':''}</button></th>`;
  const body=rows.map(r=>{const open=state.open===r.id,detail=open?`<tr class="wl-detail"><td colspan="8"><table class="wl-table wl-mini"><thead><tr><th>Produk</th><th>Waste pcs</th><th>Nominal</th><th>Kiriman</th><th>Transfer masuk</th><th>Transfer keluar</th><th>Hari habis</th><th>Perlu dicek</th></tr></thead><tbody>${ORDER.filter(l=>r.items[l]).map(l=>{const p=r.items[l];return `<tr><th scope="row">${esc(l)}</th><td>${nf(p.pcs)}</td><td>${rp(p.nom)}</td><td>${nf(p.kirim)}</td><td>${nf(p.tfIn)}</td><td>${nf(p.tfOut)}</td><td>${nf(p.habis)}</td><td>${nf(p.cek)}</td></tr>`;}).join('')}</tbody></table></td></tr>`:'';
   return `<tr class="${open?'wl-open':''}"><th scope="row"><button type="button" data-wl-open="${esc(r.id)}" aria-expanded="${open}">${open?'▾':'▸'} ${esc(name(r.id))}</button></th><td>${nf(r.pcs)}</td><td>${rp(r.nom)}</td><td><span class="wl-pill ${tone(r.wp,L.waste)}">${pc(r.wp)}</span></td><td><span class="wl-pill ${tone(r.lp,L.lost)}">${pc(r.lp)}</span></td><td>${nf(r.habis)}</td><td>${nf(r.cek)}</td><td>${r.lostD?nf(r.lostM/r.lostD):'—'}</td></tr>${detail}`;}).join('');
  return `<article class="workspace-card wl-card"><h3>Performa outlet</h3><p class="wl-note">Klik nama outlet untuk melihat rincian per produk. Batas waste ${pc(L.waste,1)}, lost sales ${pc(L.lost,1)}.</p><div class="wl-scroll"><table class="wl-table wl-outlets"><thead><tr><th>Outlet</th>${th('pcs','Waste pcs')}${th('nom','Nominal')}${th('wp','Waste %')}${th('lp','Lost %')}${th('habis','Produk habis')}${th('cek','Perlu dicek')}<th>Menit lost/hari</th></tr></thead><tbody>${body}</tbody></table></div></article>`;
 }
 function view(){
  if(!window.DAILY_RECAP_SUMMARY)return '<div class="workspace-empty">Data waste belum tersedia untuk akun ini.</div>';
  const c=collect(),L=limits(),wp=c.omzet>0?c.nom/c.omzet*100:null,lp=c.lostD?c.lostM/c.lostD/L.open*100:null;
  const per=[['mtd','Bulan ini'],['7','7 hari terakhir'],['prev','Bulan lalu']].map(([k,t])=>`<button type="button" data-wl-period="${k}" aria-pressed="${state.period===k}" class="${state.period===k?'on':''}">${t}</button>`).join('');
  return `<div class="wl-build" role="status"><b>🚧 Sedang dibangun</b><span>Angka di halaman ini masih diperiksa sampai seluruh data fix. Untuk keputusan, tetap cocokkan dengan sheet tim.</span></div>
  <div class="wl-bar"><div class="wl-periods" role="group" aria-label="Periode">${per}</div><span>${esc(selected==='__all__'?'Semua outlet':name(selected))} · ${span(c.dates)}</span></div>
  <div class="wl-kpis"><div><span>Waste</span><strong>${nf(c.pcs)} pcs</strong></div><div><span>Nominal waste</span><strong>${rp(c.nom)}</strong></div><div><span>Waste dari omzet</span><strong class="${tone(wp,L.waste)}">${pc(wp)}</strong></div><div><span>Lost sales tercatat</span><strong class="${tone(lp,L.lost)}">${pc(lp)}</strong></div><div><span>Produk habis</span><strong>${nf(c.habis)} <small>outlet-hari</small></strong><small>+${nf(c.cek)} perlu dicek</small></div></div>
  <div class="wl-grid">${productTable(c)}${lostTable(c)}</div>${outletTable(c)}`;
 }
 function paint(){const el=document.getElementById('wl-root');if(el)el.innerHTML=view();}
 document.addEventListener('click',e=>{if(!e.target.closest?.('#wl-root'))return;const a=e.target.closest('[data-wl-period]'),b=e.target.closest('[data-wl-sort]'),o=e.target.closest('[data-wl-open]');if(a){state.period=a.dataset.wlPeriod;state.open=null;paint();}else if(b){state.sort=b.dataset.wlSort;paint();}else if(o){state.open=state.open===o.dataset.wlOpen?null:o.dataset.wlOpen;paint();}});
 return {render(id){selected=id||'__all__';return `<div class="focus-intro"><h2>Waste & Lost Sales</h2><span>Rangkuman per produk dan outlet</span></div><div id="wl-root">${view()}</div>`;}};
})();
