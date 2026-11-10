'use strict';
// Forecast dari omzet (owner, 2026-11-10): forecaster cukup menentukan TARGET OMZET REGULER
// jaringan untuk satu tanggal; sistem membagi otomatis ke tiap outlet & tiap produk, lalu
// forecaster tinggal meneliti/mengoreksi angka yang janggal dan menyimpan semua sekaligus.
//
// Cara bagi: tiap outlet x produk punya "basis PCS" = saran reguler yang sudah ada
// (ForecastPlanner.recommend, pola hari yang sama 8 minggu + tren); kalau saran belum ada,
// median penjualan hari yang sama 8 minggu terakhir. Basis dinilai dengan harga per produk
// (ForecastPlanner.prices) -> total basis B. Semua basis dikali k = target / B lalu dibulatkan,
// jadi porsi antar-outlet dan komposisi produk tiap outlet tetap mengikuti polanya masing-masing,
// hanya levelnya yang mengikuti target. Pesanan tercatat ditambahkan terpisah (tidak ikut dibagi).
// Disimpan memakai skema rencana yang sama (forecastPlans) -- tidak ada perubahan rules.
window.ForecastTopdown=(()=>{
 const model=window.ForecastPlanner;
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const nf=n=>n==null?'—':Math.round(n).toLocaleString('id-ID');
 const rp=n=>n==null?'—':'Rp'+nf(n);
 const today=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Jakarta'});
 const data=()=>window.PcsPanels.data();
 const cloud=()=>window.ForecastPlanCloud||{state:'loading',records:[]};
 const name=id=>window.OUTLET_INTELLIGENCE?.outlets?.[id]?.name||id;
 const SHORT=[['Ogura','Cheese'],['Ogura','Choco'],['Malmil','Cheese'],['Malmil','Choco'],['Mini','Cheese'],['Mini','Choco'],['Mini','Durian'],['Classic','Keju'],['Classic','Ekstra'],['Chiffon','Butter'],['Lite','Ekstra'],['Lite','Keju']];
 const BUFFERS=[0,3,5,10];
 let date=null,cache=null,draft=null,message='',saving=false;
 const draftKey=()=>'omaopa-topdown-v1:'+date;
 const dateLabel=d=>new Date(d+'T12:00:00+07:00').toLocaleDateString('id-ID',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
 const wd=d=>new Date(d+'T12:00:00Z').getUTCDay();
 const median=a=>a.length?model.quantile(a,.5):null;
 function persist(){try{localStorage.setItem(draftKey(),JSON.stringify(draft));}catch{}}
 function groups(ids){
  const G=window.ForecastShipping?.groups||[],seen=new Set(),out=[];
  for(const g of G){const list=g.outlets.map(([id])=>id).filter(id=>ids.includes(id));list.forEach(id=>seen.add(id));if(list.length)out.push({name:g.name,color:g.color,ids:list});}
  const rest=ids.filter(id=>!seen.has(id)).sort((a,b)=>name(a).localeCompare(name(b)));if(rest.length)out.push({name:'Lainnya',color:'#6b7a88',ids:rest});
  return out;
 }
 function orderQty(id){const pre=data().orders.days.find(r=>r.date===date&&r.id===id);return pre?.qty?.map((v,p)=>Number.isInteger(v)?v:pre.knownQty?.[p]||0)||Array(12).fill(0);}
 // Dihitung sekali per tanggal (recommend 28 outlet cukup berat).
 function compute(){
  const d=data(),key=date+'|'+d.sales.days.length+'|'+(d.orders?.days?.length||0);
  if(cache?.key===key)return cache;
  const ids=[...d.sales.outletIds],from=model.shift(date,-56),byOutlet=new Map();
  for(const r of d.sales.days){if(r.date<from||r.date>=date||!r.complete||!Array.isArray(r.qty)||wd(r.date)!==wd(date))continue;if(!byOutlet.has(r.id))byOutlet.set(r.id,[]);byOutlet.get(r.id).push(r);}
  const outlets=new Map();let B=0;
  for(const id of ids){
   const recs=model.recommend(d.sales,d.orders,id,date),prices=model.prices(window.FORECAST_REALIZED_PRICES,id,date),hist=byOutlet.get(id)||[];
   const base=recs.map((r,p)=>{if(r.central!=null)return r.central;const m=median(hist.map(x=>x.qty[p]||0));return m==null?0:m;});
   const value=base.reduce((s,q,p)=>s+q*(prices[p].value||0),0);B+=value;
   outlets.set(id,{id,recs,prices,base,value,orders:orderQty(id)});
  }
  const pred=window.ForecastDashboard?.predict?.(date)||null;
  cache={key,ids,outlets,B,pred,groups:groups(ids)};return cache;
 }
 const record=id=>cloud().records.find(r=>r.date===date&&r.outlet===id);
 function allocate(target){const c=compute(),k=c.B>0?target/c.B:0,cells={};for(const [id,o] of c.outlets)cells[id]=o.base.map(q=>String(Math.max(0,Math.round(q*k))));return cells;}
 function prepare(){
  if(!date){const t=model.shift(today(),1);date=t;}
  cloud().watch?.(date,date);
  const c=compute();
  if(!draft||draft.date!==date){
   try{const s=JSON.parse(localStorage.getItem(draftKey())||'null');if(s?.date===date&&s.cells)draft=s;else draft=null;}catch{draft=null;}
   if(!draft){
    const suggestion=Math.round(c.pred?.pure||c.B||0),auto=allocate(suggestion),cells={};
    for(const id of c.ids){const r=record(id);cells[id]=r?r.plan.regular.map(String):auto[id];}
    draft={date,target:suggestion,auto,cells,pristine:true};
   }
  }
  if(draft.pristine)for(const id of c.ids){const r=record(id);if(r)draft.cells[id]=r.plan.regular.map(String);}
  return c;
 }
 const qtyOf=v=>{const n=Number(v);return Number.isFinite(n)&&n>=0?n:0;};
 function outletTotals(c,id){const o=c.outlets.get(id),cells=draft.cells[id]||[];let pcs=0,val=0;cells.forEach((v,p)=>{const q=qtyOf(v);pcs+=q;val+=q*(o.prices[p].value||0);});return {pcs,val,orders:o.orders.reduce((a,b)=>a+b,0)};}
 function totals(c){let pcs=0,val=0,orders=0;for(const id of c.ids){const t=outletTotals(c,id);pcs+=t.pcs;val+=t.val;orders+=t.orders;}return {pcs,val,orders};}
 function statusOf(id){const r=record(id),cells=draft.cells[id];if(!r)return ['new','Belum disimpan'];const same=r.plan.regular.every((v,p)=>v===qtyOf(cells[p]));return same?['saved',`Tersimpan v${r.revision}`]:['changed',`Berubah · v${r.revision}`];}
 function render(){
  if(!data().sales||!data().orders)return '<div class="fp-empty">Memuat riwayat penjualan dan pesanan…</div>';
  const c=prepare(),t=totals(c),pred=c.pred?.pure,diff=pred?((draft.target/pred-1)*100):null;
  const head=`<thead><tr><th class="ft-outlet">Outlet</th><th class="ft-num">Omzet</th>${SHORT.map(([a,b],p)=>`<th class="ft-sku" title="${esc(model.names[p])}">${a}<br><small>${b}</small></th>`).join('')}<th class="ft-num">Reguler</th><th class="ft-num">Pesanan</th><th>Status</th></tr></thead>`;
  const row=id=>{const o=c.outlets.get(id),tt=outletTotals(c,id),[sk,sl]=statusOf(id),auto=draft.auto?.[id]||[];return `<tr data-ft-row="${esc(id)}"><td class="ft-outlet">${esc(name(id))}</td><td class="ft-num" data-ft-val="${esc(id)}">${rp(tt.val)}</td>${draft.cells[id].map((v,p)=>`<td><input class="ft-cell${auto[p]!=null&&String(auto[p])!==String(v)?' ft-edited':''}" type="number" inputmode="numeric" min="0" max="10000" step="1" value="${esc(v)}" data-ft-cell="${esc(id)}:${p}" aria-label="${esc(name(id))} ${esc(model.names[p])}" title="Saran awal: ${esc(auto[p]??'—')}"></td>`).join('')}<td class="ft-num ft-strong" data-ft-pcs="${esc(id)}">${nf(tt.pcs)}</td><td class="ft-num ${tt.orders?'':'ft-muted'}">${tt.orders?nf(tt.orders):'—'}</td><td><span class="ft-pill ${sk}" data-ft-status="${esc(id)}">${sl}</span></td></tr>`;};
  const body=c.groups.map(g=>`<tr class="ft-group" style="--acc:${g.color}"><td colspan="${SHORT.length+5}">${esc(g.name)}</td></tr>${g.ids.map(row).join('')}`).join('');
  const changedN=c.ids.filter(id=>statusOf(id)[0]!=='saved').length,existing=c.ids.filter(id=>record(id)).length;
  return `<div class="ft-wrap">
   <div class="ft-top">
    <label class="ft-date">Tanggal kiriman<input type="date" id="ft-date" value="${date}"></label>
    <div class="ft-stat"><span>Prediksi sistem · omzet reguler</span><strong>${rp(pred)}</strong><small>${pred?'Dari mesin prediksi dashboard (tanpa pesanan)':'Prediksi belum tersedia untuk tanggal ini'}</small></div>
    <div class="ft-target"><label for="ft-target">Target omzet reguler</label><div class="ft-target-input"><span>Rp</span><input id="ft-target" inputmode="numeric" value="${esc(nf(draft.target))}" autocomplete="off"></div>
     ${pred?`<div class="ft-chips">${BUFFERS.map(b=>`<button type="button" class="ft-chip ${Math.abs((diff??-99)-b)<.05?'on':''}" data-ft-buffer="${b}">${b?'+'+b+'%':'Sesuai prediksi'}</button>`).join('')}</div>`:''}
     <button type="button" class="button fp-primary" data-ft-allocate>Bagi otomatis ke outlet & produk</button>
    </div>
   </div>
   <p class="ft-sub">${esc(dateLabel(date))} · ${diff==null?'':`Target ${diff>=0?'+':''}${diff.toLocaleString('id-ID',{maximumFractionDigits:1})}% dari prediksi · `}porsi outlet & komposisi produk mengikuti pola hari yang sama 8 minggu terakhir. Kotak berwarna = sudah diubah dari hasil bagi otomatis.</p>
   <div class="ft-summary">
    <div><span>Omzet hasil bagi</span><strong data-ft-total-val>${rp(t.val)}</strong></div>
    <div><span>Total reguler</span><strong data-ft-total-pcs>${nf(t.pcs)} pcs</strong></div>
    <div><span>Pesanan tercatat</span><strong>${nf(t.orders)} pcs</strong><small>ditambahkan terpisah</small></div>
    <div><span>Outlet</span><strong>${c.ids.length}</strong><small>${existing?`${existing} sudah punya rencana`:'belum ada yang disimpan'}</small></div>
   </div>
   ${date<=today()?'<p class="fs-ship-note">Tanggal ini sudah berjalan/berlalu. Rencana yang disimpan sekarang tidak dihitung sebagai forecast sebelum penjualan.</p>':''}
   <div class="ft-table-wrap"><table class="ft-table">${head}<tbody>${body}</tbody></table></div>
   <div class="ft-save"><span role="status" class="ft-msg">${esc(message||(changedN?`${changedN} outlet belum tersimpan / berubah. Teliti angkanya, lalu simpan.`:'Semua outlet sudah tersimpan sesuai angka di tabel.'))}</span><button type="button" class="button fp-primary" data-ft-save ${saving||cloud().state!=='ready'||!changedN?'disabled':''}>${saving?'Menyimpan…':`Simpan ${changedN} outlet ke tim`}</button></div>
   <p class="ft-foot">Produk lain (Box Mini, roti, Whip, dll.) dan catatan tetap diatur per outlet di tab <b>Edit per outlet</b>; nilai yang sudah ada tidak terhapus saat disimpan dari sini.</p>
  </div>`;
 }
 function refreshTotals(id){
  const c=compute(),tt=outletTotals(c,id),t=totals(c),q=s=>document.querySelector(s);
  const v=q(`[data-ft-val="${CSS.escape(id)}"]`);if(v)v.textContent=rp(tt.val);
  const pc=q(`[data-ft-pcs="${CSS.escape(id)}"]`);if(pc)pc.textContent=nf(tt.pcs);
  const st=q(`[data-ft-status="${CSS.escape(id)}"]`);if(st){const [k,l]=statusOf(id);st.className='ft-pill '+k;st.textContent=l;}
  const tv=q('[data-ft-total-val]');if(tv)tv.textContent=rp(t.val);
  const tp=q('[data-ft-total-pcs]');if(tp)tp.textContent=nf(t.pcs)+' pcs';
  const n=c.ids.filter(x=>statusOf(x)[0]!=='saved').length,btn=q('[data-ft-save]');
  if(btn&&!saving){btn.disabled=cloud().state!=='ready'||!n;btn.textContent=`Simpan ${n} outlet ke tim`;}
 }
 function input(e){
  const t=e.target;
  if(t.dataset.ftCell){const [id,p]=t.dataset.ftCell.split(':');draft.cells[id][+p]=t.value;draft.pristine=false;persist();const auto=draft.auto?.[id]?.[+p];t.classList.toggle('ft-edited',auto!=null&&String(auto)!==String(t.value));refreshTotals(id);return false;}
  if(t.id==='ft-target'){const n=Number(String(t.value).replace(/\D/g,''));draft.target=n;persist();return false;}
  return null;
 }
 function change(e){
  const t=e.target;
  if(t.id==='ft-date'&&/^\d{4}-\d{2}-\d{2}$/.test(t.value)){date=t.value;draft=null;message='';return true;}
  if(t.id==='ft-target'){input(e);return true;}
  if(t.dataset.ftCell){input(e);return false;}
  return false;
 }
 function click(e){
  const b=e.target.closest('[data-ft-buffer]');
  if(b){const c=compute();if(c.pred?.pure){draft.target=Math.round(c.pred.pure*(1+Number(b.dataset.ftBuffer)/100));persist();}return true;}
  if(e.target.closest('[data-ft-allocate]')){
   const tgt=document.getElementById('ft-target');if(tgt)draft.target=Number(String(tgt.value).replace(/\D/g,''))||0;
   if(!draft.target){message='Isi target omzet dulu.';return true;}
   const edited=compute().ids.some(id=>draft.cells[id].some((v,p)=>draft.auto?.[id]?.[p]!=null&&String(draft.auto[id][p])!==String(v)));
   if(edited&&!confirm('Angka yang sudah diubah manual akan diganti hasil bagi otomatis. Lanjutkan?'))return false;
   draft.auto=allocate(draft.target);draft.cells=JSON.parse(JSON.stringify(draft.auto));draft.pristine=false;persist();message=`Target ${rp(draft.target)} sudah dibagi ke ${compute().ids.length} outlet. Teliti angkanya, lalu simpan.`;return true;
  }
  if(e.target.closest('[data-ft-save]')){saveAll();return true;}
  return false;
 }
 const rerender=()=>window.dispatchEvent(new Event('forecast-operations-changed'));
 async function saveAll(){
  const c=compute(),todo=c.ids.filter(id=>statusOf(id)[0]!=='saved');
  for(const id of todo){for(const v of draft.cells[id]){const n=Number(v);if(v===''||!model.integer(n)){message=`Angka ${name(id)} belum valid (harus bilangan bulat 0–10000).`;rerender();return;}}}
  saving=true;let ok=0;const fail=[];
  for(const id of todo){
   message=`Menyimpan ${ok+fail.length+1}/${todo.length}: ${name(id)}…`;rerender();
   const o=c.outlets.get(id),r=record(id),regular=draft.cells[id].map(Number),orders=o.orders.map(Number);
   const plan={date,outlet:id,active:regular.map((q,p)=>q>0||orders[p]>0),regular,orders,note:r?.plan?.note||`Dibagi otomatis dari target omzet reguler ${rp(draft.target)}.`,prices:o.prices,recommendations:o.recs,method:o.recs.find(x=>x.method)?.method||'weekday-median-trend-v1',cutoff:o.recs.map(x=>x.through).filter(Boolean).sort().at(-1)||null,...(r?.plan?.customItems?.length?{customItems:r.plan.customItems}:{})};
   try{await cloud().save(plan,r?.revision||0);ok++;}catch(err){fail.push(name(id)+(String(err.message).includes('CONFLICT')?' (diubah orang lain, muat ulang)':''));}
  }
  saving=false;message=fail.length?`${ok} outlet tersimpan. Gagal: ${fail.join(', ')}.`:`${ok} outlet tersimpan ke tim. Rincian kirim sudah bisa diunduh.`;rerender();
 }
 return {render,input,change,click};
})();
