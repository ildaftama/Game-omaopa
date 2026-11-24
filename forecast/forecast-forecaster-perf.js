// Performa forecaster (owner 2026-11-24): dibaca Master, Factory Manager, SPV Logistik.
// Rencana dikreditkan ke penyusun versi awal (revisi 1, disimpan sebelum hari H), yaitu versi yang
// sama dengan yang dipakai akurasi di Dashboard. Produk inti reguler, rencana vs terjual.
window.ForecastForecasterPerf=(()=>{
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const nf=v=>Math.round(v||0).toLocaleString('id-ID'),pc=v=>v==null||!Number.isFinite(v)?'—':v.toLocaleString('id-ID',{maximumFractionDigits:1})+'%';
 const today=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Jakarta'});
 let period=30,busy=0;const authors=new Map(),queued=new Set();
 const rerender=()=>window.dispatchEvent(new Event('forecast-perf-render'));
 function fetchAuthors(keys){
  const cloud=window.ForecastPlanCloud;if(!cloud?.revisionAuthor)return;
  const todo=keys.filter(k=>!authors.has(k)&&!queued.has(k));if(!todo.length)return;todo.forEach(k=>queued.add(k));
  let i=0;const next=()=>{if(i>=todo.length)return Promise.resolve();const k=todo[i++];busy++;return cloud.revisionAuthor(k).then(u=>authors.set(k,u||null),()=>authors.set(k,null)).finally(()=>{busy--;queued.delete(k);if(!busy||i%25===0)rerender();}).then(next);};
  for(let w=0;w<6;w++)next();
 }
 function collect(){
  const cloud=window.ForecastPlanCloud,P=window.ForecastPlanner,d=window.PcsPanels?.data?.();
  if(!cloud||!['ready','readonly'].includes(cloud.state)||!d?.sales||!d?.orders||!P)return null;
  const t=today(),from=P.shift(t,-period),recs=(cloud.allRecords||cloud.records||[]).filter(r=>!r.deleted&&r.outlet!=='pabrik'&&r.date>=from&&r.date<t);
  const need=[],by=new Map(),team={n:0,planned:0,actual:0,abs:0,over:0,under:0};
  for(const r of recs){
   const c=P.compare(r,d.sales,d.orders);if(!c.eligible||!c.complete||!(c.actual>0))continue;
   let uid=r.revision===1?r.savedBy:authors.get(r.key);if(uid===undefined){need.push(r.key);continue;}
   uid=uid||'?';const g=by.get(uid)||{uid,n:0,planned:0,actual:0,abs:0,over:0,under:0,outlets:new Set()};by.set(uid,g);
   const over=c.planned>c.actual?c.planned-c.actual:0,under=c.actual>c.planned?c.actual-c.planned:0;
   for(const x of [g,team]){x.n++;x.planned+=c.planned;x.actual+=c.actual;x.abs+=c.absolute;x.over+=over;x.under+=under;}g.outlets.add(r.outlet);
  }
  if(need.length)fetchAuthors(need);
  return {rows:[...by.values()].sort((a,b)=>b.n-a.n),team,pending:need.length,from,to:P.shift(t,-1)};
 }
 const acc=g=>g.actual>0?100-g.abs/g.actual*100:null,bias=g=>g.actual>0?(g.planned-g.actual)/g.actual*100:null;
 const name=uid=>uid==='?'?'Tidak diketahui':window.ForecastPlanCloud?.staffName?.(uid)||'Memuat…';
 const tone=v=>v==null?'':v>=80?'ok':v>=70?'mid':'hot';
 function row(g,team){const a=acc(g),b=bias(g);return `<tr${team?' class="fpf-team"':''}><th scope="row">${team?'Seluruh tim':esc(name(g.uid))}</th><td>${nf(g.n)}</td><td><b class="${tone(a)}">${pc(a)}</b></td><td>${b==null?'—':(b>0?'+':'')+pc(b)}<small>${b==null?'':b>3?'cenderung lebih':b<-3?'cenderung kurang':'seimbang'}</small></td><td>${nf(g.over)}</td><td>${nf(g.under)}</td></tr>`;}
 function render(){
  const c=collect(),per=[[7,'7 hari'],[30,'30 hari'],[60,'60 hari']].map(([k,l])=>`<button type="button" data-fpf-period="${k}" class="${period===k?'on':''}" aria-pressed="${period===k}">${l}</button>`).join('');
  if(!c)return '<article class="workspace-card"><p class="fs-use">Memuat rencana tim dan penjualan…</p></article>';
  const d=s=>new Date(s+'T12:00:00Z').toLocaleDateString('id-ID',{day:'numeric',month:'short'});
  const body=c.rows.length?c.rows.map(g=>row(g)).join('')+row(c.team,true):`<tr><td colspan="6">${c.pending?'Memuat penyusun rencana…':'Belum ada rencana yang bisa dinilai pada periode ini.'}</td></tr>`;
  return `<div id="fpf-root"><article class="workspace-card"><div class="fpf-head"><div><h3 class="fs-h3">Performa forecaster</h3><p class="fs-use">${d(c.from)} – ${d(c.to)}. Rencana awal yang disimpan sebelum hari H dibanding penjualan reguler produk inti. Rencana dikreditkan ke penyusun versi awalnya.${c.pending?` Memuat ${nf(c.pending)} penyusun…`:''}</p></div><div class="fpf-periods" role="group" aria-label="Periode">${per}</div></div>
  <div class="fpf-scroll"><table class="fpf-table"><thead><tr><th>Penyusun</th><th>Outlet-hari</th><th>Akurasi</th><th>Selisih rata-rata</th><th>Lebih kirim (pcs)</th><th>Kurang kirim (pcs)</th></tr></thead><tbody>${body}</tbody></table></div>
  <p class="fs-use">Akurasi = 100% dikurangi selisih absolut dibagi jumlah terjual. Selisih positif berarti rencana di atas penjualan (berpotensi waste), negatif berarti di bawah (berpotensi kehabisan). Kurang kirim belum menghitung lost sales yang tidak tercatat.</p></article></div>`;
 }
 document.addEventListener('click',e=>{const b=e.target.closest?.('#fpf-root [data-fpf-period]');if(!b)return;period=+b.dataset.fpfPeriod;rerender();});
 window.addEventListener('forecast-plans-changed',()=>{if(document.getElementById('fpf-root'))rerender();});
 return {render};
})();
