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
//
// Revisi 2026-11-10 (owner): semua yang dulu harus dibuka per outlet kini bisa langsung di
// halaman ini -- produk lain (Box Mini, roti, Whip, dst.) jadi kolom di tabel utama dan bisa
// ditambah dari atas; klik nama outlet untuk mengubah pesanan & catatan outlet itu.
// Disimpan memakai skema rencana yang sama (forecastPlans, customItems) -- tidak ada perubahan rules.
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
 // Produk lain = daftar di Pengaturan › Produk (forecast-products.js); tidak bisa ditambah/
 // dihapus dari halaman ini (owner 2026-11-10: supaya tidak terpencet saat menyusun forecast).
 // Roti punya penjualan ESB di indeks 12-14 -> diberi saran median hari sama (cocok nama/alias).
 const ROTI={'roti sosis':12,'roti abon':13,'roti coklat':14};
 const low=s=>String(s||'').trim().toLowerCase();
 const PR=()=>window.ForecastProducts;
 const rotiIdx=nm=>{const x=PR().match(nm),keys=[nm,...(x?.aliases||[])].map(low);for(const k of keys)if(ROTI[k]!=null)return ROTI[k];return null;};
 const BUFFERS=[-5,-3,0,3,5];
 const pct1=n=>n.toLocaleString('id-ID',{maximumFractionDigits:1});
 // Saran buffer dari kondisi 7 tanggal terakhir yang sudah diisi tim (owner 2026-11-10: buffer
 // jangan selalu plus -- jaga waste). Waste tinggi & jarang habis -> kurangi; sering habis &
 // waste rendah -> tambah; dua-duanya tinggi -> masalah komposisi, bukan jumlah -> tetap.
 // Besarnya 3% (5% kalau sudah lebih dari 1,5x ambang), sama untuk jaringan maupun per outlet.
 function bufferFor(r,W,L){
  const w=r?.wastePct,l=r?.lostPct;if(w==null&&l==null)return {pct:0,kind:'nodata'};
  const wHigh=w!=null&&w>W,lHigh=l!=null&&l>L;
  if(wHigh&&!lHigh)return {pct:w>W*1.5?-5:-3,kind:'minus'};
  if(lHigh&&!wHigh)return {pct:l>L*1.5?5:3,kind:'plus'};
  return {pct:0,kind:wHigh&&lHigh?'mix':'ok'};
 }
 function describe(r,W){const parts=[];if(r?.wastePct!=null)parts.push(`waste ${pct1(r.wastePct)}% (ambang ${pct1(W)}%)`);if(r?.lostPerDay!=null)parts.push(`habis stok ±${Math.round(r.lostPerDay)} mnt/hari`);return parts.join(', ');}
 let date=null,cache=null,draft=null,message='',saving=false;
 // ---- Saran buffer HUJAN per outlet (owner 2026-11-12) ----
 // Ramalan peluang hujan (Open-Meteo, rata-rata harian) untuk tanggal kiriman. Outlet berpeluang
 // hujan tinggi diberi SARAN penurunan kiriman; forecaster yang memutuskan (klik per outlet atau
 // sekaligus), tidak pernah otomatis. Riset 2025-26: hujan deras rata-rata cuma -2% omzet, tapi
 // owner sengaja minta saran yang lebih besar sebagai alat bantu -- keputusan tetap di forecaster.
 // Ambang "hujan tinggi" = Pengaturan > Cuaca (highRiskProb, bawaan 60%).
 let rain={date:null,map:null,loading:false};
 const rainPrefs=()=>window.ForecastSettings?.get?.()?.weather||{rainLabelProb:45,highRiskProb:60};
 function rainOf(id){if(rain.date!==date||!rain.map)return null;const d=rain.map.get(id)?.days?.[0];return d&&!d.error&&d.probability!=null?d:null;}
 function rainCut(prob){const hi=rainPrefs().highRiskProb??60;return prob==null||prob<hi?0:prob>=Math.min(95,hi+20)?-15:-10;}
 function loadRain(ids){
  const t=today(),max=model.shift(t,15);if(date<t||date>max||!window.WeatherForecast?.getNetwork)return;
  if(rain.date===date&&(rain.map||rain.loading))return;
  const d=date;rain={date:d,map:null,loading:true};
  window.WeatherForecast.getNetwork(ids,d).then(m=>{if(rain.date!==d)return;rain={date:d,map:m,loading:false};rerender();},()=>{if(rain.date===d)rain.loading=false;});
 }
 // Terapkan / batalkan saran hujan untuk satu outlet. Angka sebelum diturunkan disimpan supaya
 // "batal" mengembalikan persis seperti semula.
 function applyRain(id,pct){if(!draft.rain)draft.rain={};if(draft.rain[id])return;const base=draft.cells[id].map(String);draft.rain[id]={pct,base};draft.cells[id]=base.map(v=>String(Math.max(0,Math.round(qtyOf(v)*(1+pct/100)))));}
 function undoRain(id){const r=draft.rain?.[id];if(!r)return;draft.cells[id]=r.base.map(String);delete draft.rain[id];}
 function rainChip(id){
  const d=rainOf(id);if(!d)return '';const pr=Math.round(d.probability),cut=rainCut(pr),lab=rainPrefs().rainLabelProb??45,on=draft.rain?.[id];
  if(pr<lab&&!on)return '';
  const mm=d.precipitationMm!=null?` · ${d.precipitationMm.toLocaleString('id-ID',{maximumFractionDigits:1})} mm`:'';
  const chip=`<span class="ft-rain ${cut?'hi':''}" title="Peluang hujan ${pr}%${mm}">🌧️ ${pr}%</span>`;
  if(on)return chip+`<button type="button" class="ft-rain-btn on" data-ft-rain-undo="${esc(id)}" title="Kiriman outlet ini sudah diturunkan ${Math.abs(on.pct)}% karena hujan. Klik untuk membatalkan.">✓ ${on.pct}% · batal</button>`;
  return chip+(cut?`<button type="button" class="ft-rain-btn" data-ft-rain-apply="${esc(id)}:${cut}" title="Saran: turunkan reguler 12 produk inti outlet ini ${Math.abs(cut)}% karena peluang hujan tinggi">${cut}%</button>`:'');
 }
 function rainSummary(c){
  const t=today();if(date<t||date>model.shift(t,15))return '';
  if(rain.date===date&&rain.loading)return '<p class="ft-why ft-why-ok">Memuat ramalan hujan per outlet…</p>';
  if(rain.date!==date||!rain.map)return '';
  const hi=c.ids.map(id=>({id,d:rainOf(id)})).filter(x=>x.d&&rainCut(x.d.probability)).sort((a,b)=>b.d.probability-a.d.probability);
  const pending=hi.filter(x=>!draft.rain?.[x.id]),applied=c.ids.filter(id=>draft.rain?.[id]).length;
  if(!hi.length&&!applied)return '<p class="ft-why ft-why-ok">🌤️ Ramalan hujan: tidak ada outlet dengan peluang hujan tinggi untuk tanggal ini.</p>';
  const names=hi.slice(0,4).map(x=>`<b>${esc(name(x.id))}</b> ${Math.round(x.d.probability)}%`).join(', ')+(hi.length>4?` dan ${hi.length-4} outlet lain`:'');
  return `<div class="ft-rain-sum"><p>🌧️ <b>${hi.length} outlet</b> berpeluang hujan tinggi: ${names}. Saran: turunkan kiriman outlet tersebut 10–15%. Keputusan di Anda — klik tombol % di samping nama outlet, atau sekaligus:</p><div>${pending.length?`<button type="button" class="button" data-ft-rain-all>Turunkan semua (${pending.length} outlet)</button>`:''}${applied?`<button type="button" class="button quiet" data-ft-rain-none>Batalkan semua penurunan hujan (${applied})</button>`:''}</div></div>`;
 }
 const draftKey=()=>'omaopa-topdown-v2:'+date;
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
 // Pesanan untuk pabrik (bukan outlet) -- direkap terpisah oleh pcs_orders.py (factoryDays).
 function factoryOrders(d=date){const f=data().orders?.factoryDays;if(!Array.isArray(f))return null;const r=f.find(x=>x.date===d);return r?{...r,qty:r.qty.map((v,p)=>Number.isInteger(v)?v:r.knownQty?.[p]||0),partial:r.qty.some(v=>v===null)}:{date:d,qty:Array(12).fill(0),orders:0,partial:false};}
 // Dihitung sekali per tanggal (recommend 28 outlet cukup berat).
 function compute(){
  const d=data(),key=date+'|'+d.sales.days.length+'|'+(d.orders?.days?.length||0);
  if(cache?.key===key)return cache;
  const ids=[...d.sales.outletIds],from=model.shift(date,-56),byOutlet=new Map();
  for(const r of d.sales.days){if(r.date<from||r.date>=date||!r.complete||!Array.isArray(r.qty)||wd(r.date)!==wd(date))continue;if(!byOutlet.has(r.id))byOutlet.set(r.id,[]);byOutlet.get(r.id).push(r);}
  const outlets=new Map(),lwDate=model.shift(date,-7);let B=0;
  for(const id of ids){
   const recs=model.recommend(d.sales,d.orders,id,date),prices=model.prices(window.FORECAST_REALIZED_PRICES,id,date),hist=byOutlet.get(id)||[];
   const base=recs.map((r,p)=>{if(r.central!=null)return r.central;const m=median(hist.map(x=>x.qty[p]||0));return m==null?0:m;});
   const value=base.reduce((s,q,p)=>s+q*(prices[p].value||0),0);B+=value;
   const roti={};for(const i of Object.values(ROTI)){const v=hist.filter(x=>x.qty.length>i).map(x=>x.qty[i]||0);roti[i]=v.length>=3?Math.round(median(v)):null;}
   const lwRow=d.sales.days.find(x=>x.id===id&&x.date===lwDate&&x.complete&&Array.isArray(x.qty)),lwOrd=d.orders.days.find(x=>x.id===id&&x.date===lwDate);
   const lw=lwRow?Math.max(0,lwRow.qty.slice(0,12).reduce((a,b)=>a+(b||0),0)-(lwOrd?.knownQty||lwOrd?.qty||[]).reduce((a,b)=>a+(Number(b)||0),0)):null;
   outlets.set(id,{id,recs,prices,base,value,orders:orderQty(id),roti,lw});
  }
  const pred=window.ForecastDashboard?.predict?.(date)||null;
  let wl=null;try{wl=window.ForecastDashboard?.recentWasteLost?.(7)||null;}catch{}
  const W=wl?.wasteThreshold??3.5,L=wl?.lostThreshold??4.5;
  for(const [id,o] of outlets){const r=wl?.byOutlet.get(id);o.wl=r;o.adj=bufferFor(r,W,L);}
  const net=bufferFor(wl?.net,W,L);
  cache={key,ids,outlets,B,pred,wl,net,W,L,groups:groups(ids)};return cache;
 }
 const record=id=>cloud().records.find(r=>r.date===date&&r.outlet===id);
 // Pembulatan "sisa terbesar": semua dibulatkan ke bawah dulu, lalu PCS ditambahkan satu per
 // satu ke sel dengan pecahan terbesar sampai omzet hasil bagi mendekati target (selisih kurang
 // dari harga 1 PCS) -- pembulatan biasa bisa meleset ratusan ribu rupiah di 28 outlet x 12 produk.
 // perOutlet: porsi outlet digeser sesuai saran buffer outletnya (waste tinggi dikurangi, sering
 // habis ditambah), lalu dinormalkan lagi supaya TOTAL jaringan tetap = target.
 function allocate(target,perOutlet=true){
  const c=compute(),cells={},frac=[];let val=0;
  const wOf=o=>perOutlet?1+o.adj.pct/100:1,den=[...c.outlets.values()].reduce((s,o)=>s+o.value*wOf(o),0);
  for(const [id,o] of c.outlets){const k=den>0?target*wOf(o)/den:0;cells[id]=o.base.map((q,p)=>{const raw=Math.max(0,q*k),fl=Math.floor(raw),pr=o.prices[p].value||0;val+=fl*pr;if(pr>0&&raw-fl>0)frac.push({id,p,f:raw-fl,pr});return fl;});}
  frac.sort((a,b)=>b.f-a.f);
  for(const x of frac){if(val+x.pr/2>target)continue;cells[x.id][x.p]++;val+=x.pr;}
  for(const id in cells)cells[id]=cells[id].map(String);
  return cells;
 }
 // Nilai awal produk lain untuk outlet tanpa rencana tersimpan: roti = median penjualan hari
 // yang sama (kalau datanya cukup), lainnya 0.
 function extraDefault(o,nm){const i=rotiIdx(nm),v=i==null?null:o.roti[i];return {r:v==null?'0':String(v),o:'0'};}
 // Isi satu outlet dari rencana tim yang tersimpan (reguler, pesanan, produk lain, catatan).
 function seed(id,r){
  const p=r.plan;draft.cells[id]=p.regular.map(String);draft.orders[id]=p.orders.map(String);draft.notes[id]=p.note||'';
  const ex={};for(const it of p.customItems||[]){const m=PR().match(it.name);if(!m)continue;ex[m.name]={r:String(it.regular||0),o:String(it.orders||0)};}
  for(const nm of draft.names)if(!ex[nm])ex[nm]={r:'0',o:'0'};
  draft.extra[id]=ex;draft.seen[id]=r.revision;
 }
 function ensureShape(c){
  for(const k of ['cells','orders','extra','notes','seen'])if(!draft[k]||typeof draft[k]!=='object')draft[k]={};
  // Kolom selalu mengikuti daftar Pengaturan; angka yang tersimpan dengan nama lama (sebelum
  // diganti nama) dipindah ke nama baru.
  draft.names=PR().names();
  for(const id of Object.keys(draft.extra)){const ex=draft.extra[id];for(const x of PR().extra())if(!ex[x.name]){const old=x.aliases.find(a=>ex[a]);if(old)ex[x.name]=ex[old];}}
  for(const id of c.ids){const o=c.outlets.get(id);
   if(!Array.isArray(draft.cells[id]))draft.cells[id]=draft.auto?.[id]||o.base.map(()=>'0');
   if(!Array.isArray(draft.orders[id]))draft.orders[id]=o.orders.map(String);
   if(!draft.extra[id])draft.extra[id]={};
   for(const nm of draft.names)if(!draft.extra[id][nm])draft.extra[id][nm]=extraDefault(o,nm);
   if(draft.notes[id]==null)draft.notes[id]='';
  }
  if(!Array.isArray(draft.open))draft.open=[];
 }
 function prepare(){
  if(!date){const t=model.shift(today(),1);date=t;}
  cloud().watch?.(date,date);
  const c=compute();
  if(!draft||draft.date!==date){
   try{const s=JSON.parse(localStorage.getItem(draftKey())||'null');if(s?.date===date&&s.cells)draft=s;else draft=null;}catch{draft=null;}
   if(!draft){
    const suggestion=Math.round((c.pred?.pure||c.B||0)*(1+c.net.pct/100)),auto=allocate(suggestion,true);
    draft={date,target:suggestion,auto,cells:JSON.parse(JSON.stringify(auto)),orders:{},extra:{},notes:{},seen:{},names:PR().names(),perOutlet:true,open:[]};
    ensureShape(c);persist();
   }
  }
  if(draft.perOutlet===undefined)draft.perOutlet=true;
  ensureShape(c);
  // Rencana tim yang LEBIH BARU dari yang terakhir dilihat draft ini (disimpan dari halaman ini,
  // dari tab detail outlet, atau oleh rekan) selalu menang -- tabel ikut angka tim terbaru.
  let synced=false;for(const id of c.ids){const r=record(id);if(r&&(draft.seen[id]||0)<r.revision){seed(id,r);synced=true;}}
  if(synced){ensureShape(c);persist();}
  return c;
 }
 // Pembanding: reguler terjual hari yang sama minggu lalu (ESB 12 produk inti dikurangi pesanan
 // tercatat). Selisih > 25% disorot supaya angka janggal cepat terlihat saat meneliti.
 // ---- Rencana produksi per angkatan (forecast-production.js) ----
 let proposal=null,prodTimer=0;
 const PD=()=>window.ForecastProduction;
 function prodInputs(c){const box=PR().match('Box Mini')?.name;return c.ids.map(id=>{const o=c.outlets.get(id),ex=draft.extra[id]||{};return {id,regular:draft.cells[id].map(qtyOf),orders:(draft.orders[id]||[]).map(qtyOf),boxMini:box?qtyOf(ex[box]?.r)+qtyOf(ex[box]?.o):0,wastePct:o.wl?.wastePct,lostPct:o.wl?.lostPct};});}
 const prodSig=pl=>pl.rows.map(r=>r.p+':'+r.total+':'+r.diff).join('|');
 function productionBlock(c){
  if(!PD())return '';
  const ins=prodInputs(c),pl=PD().plan(ins,factoryOrders()?.qty,draft.prodOverride||{},{miniStock:draft.miniStock}),m=pl.mode,stale=proposal&&proposal.sig!==prodSig(pl);
  const plus=pl.rows.filter(r=>r.diff>0).reduce((a,r)=>a+r.diff,0),minus=pl.rows.filter(r=>r.diff<0).reduce((a,r)=>a-r.diff,0),batches=pl.rows.reduce((a,r)=>a+r.batches,0);
  const fam=PD().families().map(f=>{const rs=pl.rows.filter(r=>r.family.key===f.key);return `<tr class="fpd-fam"><td colspan="3">${esc(f.label)} <span>1 angkatan = ${f.size} pcs${f.unit?` (${f.unit})`:''}</span></td></tr>${rs.map(r=>{
   if(r.combined)return `<tr><td><b>Mini Ogura · campur 3 rasa</b><small>${r.per.map(x=>`${esc(SHORT[x.p][1])} ${nf(x.total)}`).join(' · ')}${r.box?` · Box Mini ${nf(r.box/9)} pax = ${nf(r.box)} pcs`:''}</small>${r.box?`<small class="fpd-boxnote">Box Mini dihitung TAMBAHAN di luar kolom Mini pcs. Kalau box itu diambil dari kebutuhan Mini outlet yang sama, kurangi kolom Mini pcs outlet tersebut supaya tidak dobel.</small>`:''}<label class="fpd-stock">Stok Mini dari produksi sebelumnya <input type="number" inputmode="numeric" min="0" max="10000" step="1" data-ft-mini-stock value="${esc(draft.miniStock??'')}" placeholder="0"> pcs</label></td><td class="ft-num">${nf(r.total)}</td><td><div class="fpd-fixed"><b>${r.batches?`${r.batches} angkatan`:'Tidak perlu produksi'}</b><span>${r.batches?`${nf(r.target)} pcs · selalu dibulatkan naik · sisa ${nf(r.leftover)} pcs jadi stok besok`:`stok cukup · sisa stok ${nf(r.leftover)} pcs`}</span></div></td></tr>`;
   const parts=[`reguler ${nf(r.regular)}`,r.orders?`pesanan ${nf(r.orders)}`:'',r.factory?`pabrik ${nf(r.factory)}`:'',r.box?`Box Mini ${nf(r.box)}`:''].filter(Boolean).join(' · ');
    // Pilihan produksi: dua kartu (turun / naik) yang masing-masing menampilkan akibatnya;
    // saran sistem ditandai, pilihan aktif disorot. Kalau total pas kelipatan, cukup satu label.
    const full=Math.floor(r.total/r.size),opt=(dir,n,txt,cls)=>`<button type="button" class="fpd-opt ${cls} ${r.dir===dir?'on':''}" data-ft-prod-set="${r.p}:${dir}" aria-pressed="${r.dir===dir}"><span class="fpd-opt-top"><b>${n?`${n} angkatan`:'Tidak diproduksi'}</b>${r.auto===dir?'<i>saran</i>':''}</span><span class="fpd-opt-sub">${txt}</span></button>`;
    const choice=r.rem?`<div class="fpd-seg" role="group" aria-label="Pilih produksi ${esc(model.names[r.p])}">${opt('down',full,`${nf(full*r.size)} pcs · kurang ${r.rem} pcs`,'down')}${opt('up',full+1,`${nf((full+1)*r.size)} pcs · lebih ${r.size-r.rem} pcs`,'up')}</div>${r.overridden?'<small class="fpd-manual">Dipilih manual, berbeda dari saran sistem</small>':''}`:`<div class="fpd-fixed ok"><b>${r.batches} angkatan</b><span>${nf(r.target)} pcs · pas, tidak ada sisa</span></div>`;
    return `<tr><td><b>${esc(model.names[r.p])}</b><small>${parts}</small></td><td class="ft-num">${nf(r.total)}</td><td>${choice}</td></tr>`;}).join('')}`;}).join('');
  let prop='';
  if(proposal&&!stale){
   const rows=pl.rows.filter(r=>proposal.map.has(r.p)),nOut=new Set();for(const r of rows)for(const x of proposal.map.get(r.p).list)nOut.add(x.id);
   prop=`<div class="fpd-prop"><div class="fpd-prop-head"><b>Usulan penyesuaian ke outlet</b><span>${nOut.size} outlet berubah. Kelebihan ke outlet yang sering habis stok, kekurangan dari outlet yang waste-nya tinggi. Pesanan tidak diubah.</span></div>${rows.map(r=>{const pr=proposal.map.get(r.p),add=r.diff>0;return `<details class="fpd-item"><summary><span class="${add?'fpd-plus':'fpd-minus'}">${add?'+':'−'}${Math.abs(r.diff)}</span> <b>${esc(model.names[r.p])}</b> <span class="fpd-muted">${add?'ditambah ke':'dikurangi dari'} ${pr.list.length} outlet${pr.unplaced?` · ${Math.abs(pr.unplaced)} pcs tidak bisa dibagi (jadi sisa)`:''}</span></summary><div class="fpd-chips">${pr.list.map(x=>`<span class="${x.delta>0?'up':'down'}">${esc(name(x.id))} <b>${x.delta>0?'+':'−'}${Math.abs(x.delta)}</b></span>`).join('')}</div></details>`;}).join('')}<div class="fpd-prop-actions"><button type="button" class="button" data-ft-prod-cancel>Batal</button><button type="button" class="button fp-primary" data-ft-prod-apply>Terapkan ke tabel</button></div></div>`;
  }
  return `<section class="fpd"><div class="fpd-head"><div><h3>Rencana produksi (angkatan)</h3><p>Total semua outlet + pesanan pabrik, dibulatkan ke angkatan dapur. Ikut berubah setiap angka outlet diubah. Gambar untuk dapur bisa diunduh di menu <b>3 · Rencana produksi</b> setelah semua outlet tersimpan.</p></div><div class="fpd-mode fpd-${m.kind}"><b>${esc(m.title)}</b><span>${esc(m.text)}</span></div></div>
   <div class="fpd-sum"><div><span>Total angkatan</span><strong>${batches}</strong></div><div><span>Kelebihan (dibulatkan naik)</span><strong class="${plus?'fpd-plus':''}">${plus?'+'+plus:0} pcs</strong></div><div><span>Kekurangan (dibulatkan turun)</span><strong class="${minus?'fpd-minus':''}">${minus?'−'+minus:0} pcs</strong></div></div>
   <div class="ft-table-wrap fpd-wrap"><table class="ft-table fpd-table"><thead><tr><th class="fpd-l">Produk</th><th class="ft-num">Total rencana</th><th class="fpd-l">Pilih produksi <span class="fpd-muted">(klik untuk mengganti)</span></th></tr></thead><tbody>${fam}</tbody></table></div>
   ${plus||minus?(proposal&&!stale?prop:`<div class="fpd-cta">${stale?'<span class="fpd-muted">Angka berubah sejak usulan dibuat, hitung ulang.</span>':`<span>Selisih ${plus?`+${plus} pcs`:''}${plus&&minus?' dan ':''}${minus?`−${minus} pcs`:''} perlu dibagi ke outlet supaya kiriman pas dengan produksi.</span>`}<button type="button" class="button fp-primary" data-ft-prod-propose>Bagi otomatis ke outlet</button></div>`):'<p class="fpd-done">Semua rasa sudah pas dengan angkatan. Tidak ada sisa atau kekurangan.</p>'}
  </section>`;
 }
 function scheduleProd(){clearTimeout(prodTimer);prodTimer=setTimeout(()=>{const el=q('#ft-prod');if(!el||!draft)return;const keep=document.activeElement?.matches?.('[data-ft-mini-stock]');el.innerHTML=productionBlock(compute());if(keep)el.querySelector('[data-ft-mini-stock]')?.focus({preventScroll:true});},250);}
 const LW_ALERT=25;
 // Kunci setelah hari H (owner 2026-11-10): mulai 00.00 WIB tanggal kiriman, rencana hanya bisa
 // disimpan/dihapus akun Master -- juga dijaga rules Firestore (forecastOpenDate).
 const locked=()=>date<=today()&&window.ForecastAuth?.role?.master!==true;
 function lwCell(o,pcs){if(o.lw==null)return {txt:'—',cls:'ft-muted',title:'Penjualan minggu lalu belum lengkap'};if(!o.lw)return {txt:pcs?'baru':'—',cls:'ft-muted',title:'Minggu lalu tidak ada penjualan reguler'};const d=(pcs/o.lw-1)*100,big=Math.abs(d)>LW_ALERT;return {txt:(d>0?'+':d<0?'−':'')+Math.abs(Math.round(d))+'%',cls:big?(d>0?'ft-lw-up':'ft-lw-down'):'ft-lw-ok',title:`Minggu lalu terjual ${o.lw} pcs reguler · rencana ${pcs} pcs${big?' · selisih besar, cek lagi':''}`};}
 const qtyOf=v=>{const n=Number(v);return Number.isFinite(n)&&n>=0?n:0;};
 function outletTotals(c,id){const o=c.outlets.get(id),cells=draft.cells[id]||[];let pcs=0,val=0;cells.forEach((v,p)=>{const q=qtyOf(v);pcs+=q;val+=q*(o.prices[p].value||0);});const ex=draft.extra[id]||{};let extra=0,exOrd=0;for(const nm of draft.names){extra+=qtyOf(ex[nm]?.r);exOrd+=qtyOf(ex[nm]?.o);}return {pcs,val,extra,orders:(draft.orders[id]||[]).reduce((a,b)=>a+qtyOf(b),0)+exOrd};}
 function lwTotal(c){let lw=0,pcs=0,n=0;for(const id of c.ids){const o=c.outlets.get(id);if(o.lw==null)continue;lw+=o.lw;pcs+=outletTotals(c,id).pcs;n++;}if(!lw)return 'Minggu lalu: data belum lengkap';const d=(pcs/lw-1)*100;return `Minggu lalu ${nf(lw)} pcs terjual · rencana ${d>0?'+':d<0?'−':''}${Math.abs(d).toLocaleString('id-ID',{maximumFractionDigits:1})}%`;}
 function totals(c){let pcs=0,val=0,orders=0,extra=0;for(const id of c.ids){const t=outletTotals(c,id);pcs+=t.pcs;val+=t.val;orders+=t.orders;extra+=t.extra;}return {pcs,val,orders,extra};}
 // customItems yang akan disimpan untuk outlet ini: kolom produk lain yang bernilai > 0, plus
 // item lama di rencana tim yang namanya tidak ada di kolom (tidak pernah dihapus diam-diam).
 function customItemsOf(id){
  const ex=draft.extra[id]||{},out=[];
  for(const nm of draft.names){const r=qtyOf(ex[nm]?.r),o=qtyOf(ex[nm]?.o);if(r||o)out.push({name:nm,regular:Math.round(r),orders:Math.round(o)});}
  for(const it of record(id)?.plan?.customItems||[])if(!PR().match(it.name))out.push({name:it.name,regular:it.regular,orders:it.orders});
  return out;
 }
 const sameItems=(a,b)=>{const k=x=>x.map(it=>low(it.name)+'='+(it.regular||0)+'/'+(it.orders||0)).sort().join('|');return k(a||[])===k(b||[]);};
 function statusOf(id){const r=record(id);if(!r)return ['new','Belum disimpan'];const p=r.plan,cells=draft.cells[id],ord=draft.orders[id]||[];const same=p.regular.every((v,p2)=>v===qtyOf(cells[p2]))&&p.orders.every((v,p2)=>v===qtyOf(ord[p2]))&&String(p.note||'')===String(draft.notes[id]||'')&&sameItems(p.customItems,customItemsOf(id));return same?['saved',`Tersimpan v${r.revision}`]:['changed',`Berubah · v${r.revision}`];}
 const shortName=nm=>{const w=String(nm).split(' ');return w.length>1?`${esc(w[0])}<br><small>${esc(w.slice(1).join(' '))}</small>`:esc(nm);};
 function detailRow(c,id,span){
  const o=c.outlets.get(id),ord=draft.orders[id],ex=draft.extra[id],known=o.orders,r=record(id);
  const cell=(attr,v,label,hint)=>`<label class="ft-dcell"><span>${label}</span><input class="ft-cell" type="number" inputmode="numeric" min="0" max="10000" step="1" value="${esc(v)}" ${attr}>${hint||''}</label>`;
  return `<tr class="ft-detail" data-ft-detail-row="${esc(id)}"><td colspan="${span}"><div class="ft-detail-box">
   <div class="ft-detail-head"><b>Pesanan · ${esc(name(id))}</b><span>Ditambahkan di luar reguler. Angka awal dari rekap pesanan${r?' / rencana tim':''}.</span></div>
   <div class="ft-dgrid">${model.names.map((nm,p)=>cell(`data-ft-ord="${esc(id)}:${p}"`,ord[p],esc(SHORT[p].join(' ')),known[p]>0&&qtyOf(ord[p])!==known[p]?`<small class="ft-dwarn">tercatat ${known[p]}</small>`:'')).join('')}${draft.names.map((nm,i)=>cell(`data-ft-xo="${esc(id)}:${i}"`,ex[nm].o,esc(nm))).join('')}</div>
   <label class="ft-dnote">Catatan outlet<textarea rows="2" maxlength="500" data-ft-note="${esc(id)}" placeholder="Contoh: ada acara kampus, kiriman ditambah">${esc(draft.notes[id])}</textarea></label>
   <div class="ft-detail-foot"><span>Saran rentang per produk & realisasi kirim ada di detail outlet.</span><button type="button" class="button" data-ft-open-outlet="${esc(id)}">Buka detail outlet ↗</button></div>
  </div></td></tr>`;
 }
 function factoryBlock(){
  const f=factoryOrders();
  if(!f)return '<div class="ft-factory"><b>Pesanan pabrik</b><span>Belum tersinkron. Pesanan bertulisan "pabrik" akan muncul di sini setelah sinkron pesanan berikutnya.</span></div>';
  const items=f.qty.map((q,p)=>[q,p]).filter(([q])=>q>0);
  return `<div class="ft-factory"><b>Pesanan pabrik · ${nf(f.qty.reduce((a,b)=>a+b,0))} pcs</b>${items.length?`<span>${items.map(([q,p])=>`${esc(model.names[p])} <b>${q}</b>`).join(' · ')}</span>`:'<span>Tidak ada pesanan untuk pabrik pada tanggal ini.</span>'}${f.partial?'<em>Sebagian varian belum pasti, cek sheet PESANAN.</em>':''}<small>Diproduksi terpisah, tidak masuk outlet mana pun. Tampil juga di Rincian kirim.</small></div>`;
 }
 // Menu "3 · Rencana produksi" (owner 2026-11-10): angkatan langsung mengikuti forecast yang SEDANG
 // disusun (draft halaman Buat forecast), tidak menunggu disimpan. Unduh/bagikan gambar untuk dapur
 // baru terbuka setelah semua outlet tersimpan -- itu langkah terakhir.
 function productionPage(){
  const c=prepare(),i=pendingInfo(c),saved=c.ids.filter(id=>record(id)).length,done=!i.n&&saved>0,canShare=!!(navigator.canShare&&navigator.share);
  const stat=done?`<div class="fpp-status done"><b>✓ Semua ${c.ids.length} outlet tersimpan</b><span>Rencana produksi final, siap diunduh untuk dapur.</span></div>`:`<div class="fpp-status draft"><b>Draft · ${i.n} outlet belum tersimpan</b><span>Angka di bawah sudah mengikuti forecast yang sedang disusun. Simpan semua outlet untuk membuka unduhan.${i.areas?` (${esc(i.areas)})`:''}</span></div>`;
  const acts=done?`${canShare?'<button type="button" class="button fp-primary" data-ft-prod-share>Bagikan ke WA</button>':''}<button type="button" class="button ${canShare?'':'fp-primary'}" data-ft-prod-download>Unduh gambar</button>`:`<button type="button" class="button" data-fp-mode="topdown">← Kembali ke Buat forecast</button><button type="button" class="button fp-primary" data-ft-save ${saving||cloud().state!=='ready'||!i.n||locked()?'disabled':''}>${saving?'Menyimpan…':saveText(i)}</button>`;
  return `<div class="ft-wrap"><div class="fpp-top"><label class="ft-date">Tanggal kiriman<input type="date" id="ft-date" value="${date}"></label>${stat}<div class="fpp-actions">${acts}</div></div>
   <p class="fs-ship-sub fs-ship-status ft-msg" role="status" ${message?'':'hidden'}>${esc(message)}</p>
   <div id="ft-prod">${productionBlock(c)}</div></div>`;
 }
 function render(view){
  if(!data().sales||!data().orders)return '<div class="fp-empty">Memuat riwayat penjualan dan pesanan…</div>';
  if(view==='production')return productionPage();
  const c=prepare(),t=totals(c),pred=c.pred?.pure,diff=pred?((draft.target/pred-1)*100):null,span=SHORT.length+draft.names.length+6;
  loadRain(c.ids);
  const head=`<thead><tr><th class="ft-outlet">Outlet</th><th class="ft-num">Omzet</th>${SHORT.map(([a,b],p)=>`<th class="ft-sku" title="${esc(model.names[p])}">${a}<br><small>${b}</small></th>`).join('')}${draft.names.map((nm,i)=>`<th class="ft-sku ft-xh${i===0?' ft-xfirst':''}" title="${esc(nm)} · diisi manual">${shortName(nm)}</th>`).join('')}<th class="ft-num">Reguler</th><th class="ft-num" title="Rencana reguler 12 produk inti dibanding reguler terjual hari yang sama minggu lalu">vs mg lalu</th><th class="ft-num">Pesanan</th><th>Status</th></tr></thead>`;
  const row=id=>{const o=c.outlets.get(id),tt=outletTotals(c,id),[sk,sl]=statusOf(id),auto=draft.auto?.[id]||[],open=draft.open.includes(id),ex=draft.extra[id];const adj=draft.perOutlet&&o.adj.pct?`<span class="ft-adj ${o.adj.pct<0?'minus':'plus'}" title="${esc(describe(o.wl,c.W)+' → '+(o.adj.pct<0?'dikurangi ':'ditambah ')+Math.abs(o.adj.pct)+'%')}">${o.adj.pct>0?'+':'−'}${Math.abs(o.adj.pct)}%</span>`:'';const note=draft.notes[id]?'<span class="ft-notedot" title="Ada catatan">✎</span>':'';
   return `<tr data-ft-row="${esc(id)}" class="${open?'ft-open':''}"><td class="ft-outlet"><button type="button" class="ft-oname" data-ft-toggle="${esc(id)}" aria-expanded="${open}" title="Ubah pesanan & catatan outlet ini"><span class="ft-caret">${open?'▾':'▸'}</span>${esc(name(id))}</button>${adj}${note}${rainChip(id)}</td><td class="ft-num" data-ft-val="${esc(id)}">${rp(tt.val)}</td>${draft.cells[id].map((v,p)=>`<td><input class="ft-cell${auto[p]!=null&&String(auto[p])!==String(v)?' ft-edited':''}" type="number" inputmode="numeric" min="0" max="10000" step="1" value="${esc(v)}" data-ft-cell="${esc(id)}:${p}" aria-label="${esc(name(id))} ${esc(model.names[p])}" title="Saran awal: ${esc(auto[p]??'—')}"></td>`).join('')}${draft.names.map((nm,i)=>`<td class="${i===0?'ft-xfirst':''}"><input class="ft-cell ft-xcell" type="number" inputmode="numeric" min="0" max="10000" step="1" value="${esc(ex[nm].r)}" data-ft-xr="${esc(id)}:${i}" aria-label="${esc(name(id))} ${esc(nm)}" ${rotiIdx(nm)!=null?`title="Saran median hari sama: ${o.roti[rotiIdx(nm)]??'data belum cukup'}"`:''}></td>`).join('')}<td class="ft-num ft-strong" data-ft-pcs="${esc(id)}">${nf(tt.pcs+tt.extra)}</td>${(()=>{const l=lwCell(o,tt.pcs);return `<td class="ft-num ${l.cls}" data-ft-lw="${esc(id)}" title="${esc(l.title)}">${l.txt}</td>`;})()}<td class="ft-num ${tt.orders?'':'ft-muted'}" data-ft-ord-total="${esc(id)}">${tt.orders?nf(tt.orders):'—'}</td><td><span class="ft-pill ${sk}" data-ft-status="${esc(id)}">${sl}</span></td></tr>${open?detailRow(c,id,span):''}`;};
  const body=c.groups.map(g=>`<tr class="ft-group" style="--acc:${g.color}"><td colspan="${span}">${esc(g.name)}</td></tr>${g.ids.map(row).join('')}`).join('');
  const adjN=c.ids.filter(id=>c.outlets.get(id).adj.pct).length;
  const changedN=c.ids.filter(id=>statusOf(id)[0]!=='saved').length,existing=c.ids.filter(id=>record(id)).length;
  const fo=factoryOrders(),foN=fo?fo.qty.reduce((a,b)=>a+b,0):null;
  return `<div class="ft-wrap">
   <div class="ft-top">
    <label class="ft-date">Tanggal kiriman<input type="date" id="ft-date" value="${date}"></label>
    <div class="ft-stat"><span>Prediksi sistem · omzet reguler</span><strong>${rp(pred)}</strong><small>${pred?'Dari mesin prediksi dashboard (tanpa pesanan)':'Prediksi belum tersedia untuk tanggal ini'}</small></div>
    <div class="ft-target"><label for="ft-target">Target omzet reguler</label><div class="ft-target-input"><span>Rp</span><input id="ft-target" inputmode="numeric" value="${esc(nf(draft.target))}" autocomplete="off"></div>
     ${pred?`<div class="ft-chips">${BUFFERS.map(b=>`<button type="button" class="ft-chip ${Math.abs((diff??-99)-b)<.05?'on':''} ${b===c.net.pct?'sug':''}" data-ft-buffer="${b}">${b?(b>0?'+':'−')+Math.abs(b)+'%':'Sesuai prediksi'}${b===c.net.pct?' · saran':''}</button>`).join('')}</div>${netWhy(c)}`:''}${rainSummary(c)}
     <label class="ft-toggle"><input type="checkbox" id="ft-per-outlet" ${draft.perOutlet?'checked':''}> Sesuaikan porsi per outlet dari waste & habis stok <small>(${adjN} outlet digeser, total tetap sesuai target)</small></label>
     <button type="button" class="button fp-primary" data-ft-allocate>Bagi otomatis ke outlet & produk</button>
    </div>
   </div>
   <div class="ft-extras"><div><b>Produk lain (diisi manual)</b><span>${draft.names.length?draft.names.map(esc).join(' · '):'Belum ada'}. Tampil sebagai kolom di kanan tabel, tidak ikut dibagi dari omzet. Tambah, ganti nama, atau hapus produk di <b>Pengaturan › Produk</b>.</span></div></div>
   <p class="ft-sub">${esc(dateLabel(date))} · ${diff==null?'':Math.abs(diff)<.05?'Target sesuai prediksi · ':`Target ${diff>0?'+':''}${diff.toLocaleString('id-ID',{maximumFractionDigits:1})}% dari prediksi · `}porsi outlet & komposisi produk mengikuti pola hari yang sama 8 minggu terakhir. Kotak kuning = sudah diubah dari hasil bagi otomatis. Klik nama outlet untuk mengubah pesanan & catatannya.</p>
   <div class="ft-summary">
    <div><span>Omzet hasil bagi</span><strong data-ft-total-val>${rp(t.val)}</strong><small>12 produk inti</small></div>
    <div><span>Total reguler</span><strong data-ft-total-pcs>${nf(t.pcs+t.extra)} pcs</strong><small data-ft-lw-total>${esc(lwTotal(c))}</small><small data-ft-total-extra>${t.extra?`termasuk ${nf(t.extra)} pcs produk lain`:'produk lain belum diisi'}</small></div>
    <div><span>Pesanan outlet</span><strong data-ft-total-ord>${nf(t.orders)} pcs</strong><small>ditambahkan terpisah</small></div>
    <div><span>Pesanan pabrik</span><strong>${foN==null?'—':nf(foN)+' pcs'}</strong><small>${foN==null?'menunggu sinkron':'tidak masuk outlet'}</small></div>
   </div>
   ${factoryBlock()}
   ${locked()?'<p class="fp-lock-note">🔒 Rencana tanggal ini terkunci karena hari H sudah dimulai (00.00 WIB). Hanya akun Master yang bisa mengubah, menyimpan, atau menghapusnya.</p>':date<=today()?'<p class="fs-ship-note">Hari H sudah dimulai. Anda Master, jadi masih bisa mengubah, tapi rencana yang disimpan sekarang tidak dihitung di akurasi.</p>':''}
   <div class="ft-table-wrap"><table class="ft-table">${head}<tbody>${body}</tbody></table></div>
   <div id="ft-prod">${productionBlock(c)}</div>
   <div class="ft-save"><span role="status" class="ft-msg">${esc(message||pendingMsg(pendingInfo(c)))}</span><span class="ft-save-actions">${existing&&!locked()?`<button type="button" class="button quiet" data-ft-delete-all ${saving?'disabled':''}>Hapus rencana tanggal ini</button>`:''}<button type="button" class="button fp-primary" data-ft-save ${saving||cloud().state!=='ready'||!changedN||locked()?'disabled':''} ${!changedN&&existing&&!saving?'hidden':''}>${saving?'Menyimpan…':saveText(pendingInfo(c))}</button><button type="button" class="button fp-primary" data-fp-mode="shipping" data-ft-next ${changedN||!existing||saving?'hidden':''}>Lanjut ke Rincian kirim →</button></span></div>
   <p class="ft-foot">${c.ids.length} outlet · ${existing?`${existing} sudah punya rencana tim`:'belum ada yang disimpan'}. Rencana yang disimpan dari sini sama persis dengan simpan per outlet, jadi langsung muncul di detail outlet dan Rincian kirim.</p>
  </div>`;
 }
 function netWhy(c){
  const n=c.net,d=describe(c.wl?.net,c.W),per=c.wl?.wasteFrom&&c.wl?.wasteTo?` (${c.wl.wasteFrom.slice(8)}/${c.wl.wasteFrom.slice(5,7)}–${c.wl.wasteTo.slice(8)}/${c.wl.wasteTo.slice(5,7)})`:'';
  const txt=n.kind==='nodata'?'Data waste & habis stok 7 hari terakhir belum cukup, saran: sesuai prediksi.'
   :n.kind==='minus'?`Saran −${Math.abs(n.pct)}% · 7 hari terakhir ${d}${per}. Waste di atas ambang dan stok jarang habis, kiriman bisa dikurangi.`
   :n.kind==='plus'?`Saran +${n.pct}% · 7 hari terakhir ${d}${per}. Stok sering habis sementara waste rendah, kiriman bisa ditambah.`
   :n.kind==='mix'?`Saran sesuai prediksi · 7 hari terakhir ${d}${per}. Waste dan habis stok sama-sama tinggi, berarti komposisi produk yang perlu diatur, bukan jumlahnya.`
   :`Saran sesuai prediksi · 7 hari terakhir ${d}${per}. Waste dan habis stok masih dalam batas.`;
  return `<p class="ft-why ft-why-${n.kind}">${esc(txt)}</p>`;
 }
 const q=s=>document.querySelector(s);
 // Tombol simpan dihitung per OUTLET (bukan area). 0 = semua sudah tersimpan -> tulis jelas; kalau
 // ada yang belum, sebutkan sebarannya per area pengiriman supaya mudah dicek.
 function pendingInfo(c){const ids=c.ids.filter(x=>statusOf(x)[0]!=='saved'),areas=c.groups.map(g=>[g.name,g.ids.filter(id=>ids.includes(id)).length]).filter(([,n])=>n);return {n:ids.length,areas:areas.map(([a,n])=>`${a} ${n}`).join(', ')};}
 const saveText=i=>i.n?`Simpan ${i.n} outlet ke tim`:'Semua outlet tersimpan';
 const pendingMsg=i=>i.n?`${i.n} outlet belum tersimpan / berubah (${i.areas}). Teliti angkanya, lalu simpan.`:'Semua outlet sudah tersimpan sesuai angka di tabel.';
 function saveLabel(){const c=compute(),i=pendingInfo(c),btn=q('[data-ft-save]');if(btn&&!saving){btn.disabled=cloud().state!=='ready'||!i.n||locked();btn.textContent=saveText(i);btn.title=i.n?`Per area: ${i.areas}`:'';const any=c.ids.some(x=>record(x));btn.hidden=!i.n&&any;const nx=q('[data-ft-next]');if(nx)nx.hidden=!!i.n||!any;}const m=q('.ft-msg');if(m&&!message)m.textContent=pendingMsg(i);}
 function refreshTotals(id){
  const c=compute(),tt=outletTotals(c,id),t=totals(c),E=CSS.escape(id);
  const v=q(`[data-ft-val="${E}"]`);if(v)v.textContent=rp(tt.val);
  const pc=q(`[data-ft-pcs="${E}"]`);if(pc)pc.textContent=nf(tt.pcs+tt.extra);
  const lc=q(`[data-ft-lw="${E}"]`);if(lc){const l=lwCell(c.outlets.get(id),tt.pcs);lc.textContent=l.txt;lc.className='ft-num '+l.cls;lc.title=l.title;}
  const lt=q('[data-ft-lw-total]');if(lt)lt.textContent=lwTotal(c);
  const od=q(`[data-ft-ord-total="${E}"]`);if(od){od.textContent=tt.orders?nf(tt.orders):'—';od.classList.toggle('ft-muted',!tt.orders);}
  const st=q(`[data-ft-status="${E}"]`);if(st){const [k,l]=statusOf(id);st.className='ft-pill '+k;st.textContent=l;}
  const tv=q('[data-ft-total-val]');if(tv)tv.textContent=rp(t.val);
  const tp=q('[data-ft-total-pcs]');if(tp)tp.textContent=nf(t.pcs+t.extra)+' pcs';
  const tx=q('[data-ft-total-extra]');if(tx)tx.textContent=t.extra?`termasuk ${nf(t.extra)} pcs produk lain`:'produk lain belum diisi';
  const to=q('[data-ft-total-ord]');if(to)to.textContent=nf(t.orders)+' pcs';
  saveLabel();scheduleProd();
 }
 const split=s=>{const i=s.lastIndexOf(':');return [s.slice(0,i),+s.slice(i+1)];};
 function input(e){
  const t=e.target;if(!draft)return null;
  if(t.dataset.ftCell){const [id,p]=split(t.dataset.ftCell);draft.cells[id][p]=t.value;persist();const auto=draft.auto?.[id]?.[p];t.classList.toggle('ft-edited',auto!=null&&String(auto)!==String(t.value));refreshTotals(id);return false;}
  if(t.dataset.ftXr){const [id,i]=split(t.dataset.ftXr);draft.extra[id][draft.names[i]].r=t.value;persist();refreshTotals(id);return false;}
  if(t.dataset.ftXo){const [id,i]=split(t.dataset.ftXo);draft.extra[id][draft.names[i]].o=t.value;persist();refreshTotals(id);return false;}
  if(t.dataset.ftOrd){const [id,p]=split(t.dataset.ftOrd);draft.orders[id][p]=t.value;persist();refreshTotals(id);return false;}
  if(t.dataset.ftNote!==undefined){draft.notes[t.dataset.ftNote]=t.value;persist();refreshTotals(t.dataset.ftNote);return false;}
  if(t.dataset.ftMiniStock!==undefined){draft.miniStock=t.value;persist();scheduleProd();return false;}
  if(t.id==='ft-target'){const n=Number(String(t.value).replace(/\D/g,''));draft.target=n;persist();return false;}
  return null;
 }
 function change(e){
  const t=e.target;
  if(t.id==='ft-date'&&/^\d{4}-\d{2}-\d{2}$/.test(t.value)){date=t.value;draft=null;message='';proposal=null;return true;}
  if(t.id==='ft-target'){input(e);return true;}
  if(t.id==='ft-per-outlet'){draft.perOutlet=t.checked;const edited=hasEdits();if(!edited){draft.auto=allocate(draft.target,draft.perOutlet);draft.cells=JSON.parse(JSON.stringify(draft.auto));message='Pembagian diperbarui.';}else message='Klik "Bagi otomatis" untuk menerapkan pengaturan ini.';persist();return true;}
  if(t.dataset.ftCell||t.dataset.ftXr||t.dataset.ftXo||t.dataset.ftOrd||t.dataset.ftNote!==undefined){input(e);return false;}
  return false;
 }
 function click(e){
  const b=e.target.closest('[data-ft-buffer]');
  if(b){const c=compute();if(c.pred?.pure){draft.target=Math.round(c.pred.pure*(1+Number(b.dataset.ftBuffer)/100));persist();}return true;}
  const ra=e.target.closest('[data-ft-rain-apply]');
  if(ra){const [id,pct]=ra.dataset.ftRainApply.split(':');applyRain(id,Number(pct));persist();message=`${name(id)}: kiriman reguler diturunkan ${pct}% karena peluang hujan tinggi.`;return true;}
  const ru=e.target.closest('[data-ft-rain-undo]');
  if(ru){undoRain(ru.dataset.ftRainUndo);persist();message='Penurunan karena hujan dibatalkan.';return true;}
  if(e.target.closest('[data-ft-rain-all]')){let n=0;for(const id of compute().ids){const d=rainOf(id),cut=d?rainCut(d.probability):0;if(cut&&!draft.rain?.[id]){applyRain(id,cut);n++;}}persist();message=`${n} outlet diturunkan 10–15% karena peluang hujan tinggi. Bisa dibatalkan per outlet.`;return true;}
  if(e.target.closest('[data-ft-rain-none]')){for(const id of Object.keys(draft.rain||{}))undoRain(id);persist();message='Semua penurunan karena hujan dibatalkan.';return true;}
  const tg=e.target.closest('[data-ft-toggle]');
  if(tg){const id=tg.dataset.ftToggle,i=draft.open.indexOf(id);if(i<0)draft.open.push(id);else draft.open.splice(i,1);persist();return true;}
  const oo=e.target.closest('[data-ft-open-outlet]');
  if(oo){window.ForecastWorkspace?.openOutlet?.(oo.dataset.ftOpenOutlet,date);return true;}
  if(e.target.closest('[data-ft-delete-all]')){const recs=compute().ids.map(record).filter(Boolean);window.ForecastWorkspace?.askDelete?.(recs,`${recs.length} rencana outlet tanggal ${dateLabel(date)}`);return true;}
  if(e.target.closest('[data-ft-allocate]')){
   const tgt=document.getElementById('ft-target');if(tgt)draft.target=Number(String(tgt.value).replace(/\D/g,''))||0;
   if(!draft.target){message='Isi target omzet dulu.';return true;}
   const edited=hasEdits();
   if(edited&&!confirm('Angka reguler yang sudah diubah manual akan diganti hasil bagi otomatis. Pesanan, produk lain & catatan tidak berubah. Lanjutkan?'))return false;
   draft.auto=allocate(draft.target,draft.perOutlet);draft.cells=JSON.parse(JSON.stringify(draft.auto));draft.rain={};persist();message=`Target ${rp(draft.target)} sudah dibagi ke ${compute().ids.length} outlet. Teliti angkanya, lalu simpan.`;return true;
  }
  const st=e.target.closest('[data-ft-prod-set]');
  if(st){const [pp,dir]=st.dataset.ftProdSet.split(':'),p=+pp,c=compute(),r=PD().plan(prodInputs(c),factoryOrders()?.qty,draft.prodOverride||{},{miniStock:draft.miniStock}).rows.find(x=>x.p===p);if(r&&r.dir!==dir){draft.prodOverride=draft.prodOverride||{};if(dir===r.auto)delete draft.prodOverride[p];else draft.prodOverride[p]=dir;persist();proposal=null;}return true;}
  const fl=e.target.closest('[data-ft-prod-flip]');
  if(fl){const p=+fl.dataset.ftProdFlip,c=compute(),r=PD().plan(prodInputs(c),factoryOrders()?.qty,draft.prodOverride||{},{miniStock:draft.miniStock}).rows.find(x=>x.p===p);if(r){draft.prodOverride=draft.prodOverride||{};const next=r.dir==='up'?'down':'up';if(next===r.auto)delete draft.prodOverride[p];else draft.prodOverride[p]=next;persist();proposal=null;}return true;}
  if(e.target.closest('[data-ft-prod-propose]')){const c=compute(),ins=prodInputs(c),pl=PD().plan(ins,factoryOrders()?.qty,draft.prodOverride||{},{miniStock:draft.miniStock});proposal={sig:prodSig(pl),map:PD().propose(pl.rows,ins)};return true;}
  if(e.target.closest('[data-ft-prod-cancel]')){proposal=null;return true;}
  if(e.target.closest('[data-ft-prod-apply]')){if(proposal){const ids=new Set();for(const [p,pr] of proposal.map)for(const x of pr.list){const cur=qtyOf(draft.cells[x.id][p]);draft.cells[x.id][p]=String(Math.max(0,cur+x.delta));ids.add(x.id);}persist();message=`Penyesuaian angkatan diterapkan ke ${ids.size} outlet (kotak kuning). Teliti lalu simpan ke tim.`;proposal=null;}return true;}
  if(e.target.closest('[data-ft-prod-download]')){window.ForecastShipping?.exportProduction?.(date,false);return false;}
  if(e.target.closest('[data-ft-prod-share]')){window.ForecastShipping?.exportProduction?.(date,true);return false;}
  if(e.target.closest('[data-ft-save]')){if(locked()){message='Rencana tanggal ini terkunci karena hari H sudah dimulai (00.00 WIB). Hanya akun Master yang bisa mengubah, menyimpan, atau menghapusnya.';return true;}saveAll();return true;}
  return false;
 }
 function keydown(){return false;}
 function hasEdits(){return compute().ids.some(id=>draft.cells[id].some((v,p)=>draft.auto?.[id]?.[p]!=null&&String(draft.auto[id][p])!==String(v)));}
 const rerender=()=>window.dispatchEvent(new Event('forecast-operations-changed'));
 // Selama menyimpan, layar TIDAK dirender ulang tiap outlet (dulu 28 outlet x snapshot Firestore
 // = puluhan render penuh dalam beberapa detik -> layar berkedip). Pesan progres diperbarui di
 // tempat; render penuh sekali di akhir.
 const say=t=>{message=t;const m=q('.ft-msg');if(m){m.textContent=t;m.hidden=false;}};
 async function saveAll(){
  const c=compute(),todo=c.ids.filter(id=>statusOf(id)[0]!=='saved'),bad=v=>v===''||!model.integer(Number(v));
  for(const id of todo){
   if(draft.cells[id].some(bad)||draft.orders[id].some(bad)){message=`Angka ${name(id)} belum valid (harus bilangan bulat 0–10000).`;rerender();return;}
   for(const nm of draft.names){const x=draft.extra[id][nm];if(!model.integer(qtyOf(x.r))||!model.integer(qtyOf(x.o))){message=`Angka ${nm} di ${name(id)} belum valid.`;rerender();return;}}
   if(customItemsOf(id).length>20){message=`${name(id)}: maksimal 20 produk lain.`;rerender();return;}
  }
  saving=true;let ok=0,failWhy='';const fail=[];
  const btn=q('[data-ft-save]');if(btn){btn.disabled=true;btn.textContent='Menyimpan…';}
  const saveOne=async id=>{

   const o=c.outlets.get(id),r=record(id),regular=draft.cells[id].map(Number),orders=draft.orders[id].map(Number),items=customItemsOf(id);
   const plan={date,outlet:id,active:regular.map((v,p)=>v>0||orders[p]>0),regular,orders,note:String(draft.notes[id]||'').trim()||`Dibagi otomatis dari target omzet reguler ${rp(draft.target)}.`,prices:o.prices,recommendations:o.recs,method:o.recs.find(x=>x.method)?.method||'weekday-median-trend-v1',cutoff:o.recs.map(x=>x.through).filter(Boolean).sort().at(-1)||null,...(items.length?{customItems:items}:{})};
   if(!plan.active.some(Boolean))plan.active[2]=true;
   try{await cloud().save(plan,r?.revision||0);ok++;if(!draft.notes[id])draft.notes[id]=plan.note;}catch(err){fail.push(name(id)+(String(err.message).includes('diubah rekan')?' (diubah rekan, muat ulang)':''));failWhy=failWhy||String(err.message);}
   say(`Menyimpan… ${ok+fail.length}/${todo.length} outlet selesai`);
  };
  // 5 outlet sekaligus; tiap outlet tetap satu transaksi sendiri (cek konflik versi per outlet).
  for(let i=0;i<todo.length;i+=5)await Promise.all(todo.slice(i,i+5).map(saveOne));
  persist();saving=false;message=fail.length?`${ok} outlet tersimpan. Gagal ${fail.length}: ${fail.join(', ')}. Penyebab: ${failWhy}`:`${ok} outlet tersimpan ke tim. Rincian kirim sudah bisa diunduh.`;rerender();
 }
 // Dipakai tab detail outlet: angka hasil bagi untuk outlet+tanggal ini (kalau belum ada rencana
 // tim), supaya detail outlet langsung berisi angka yang sama dengan halaman utama.
 function cellsFor(d,id){
  try{if(!data().sales||!data().orders)return null;if(date!==d){date=d;draft=null;}const c=prepare();if(!c.outlets.has(id))return null;
   return {regular:[...draft.cells[id]],orders:[...draft.orders[id]],note:draft.notes[id]||'',customItems:draft.names.map(nm=>({name:nm,regular:draft.extra[id][nm].r,orders:draft.extra[id][nm].o}))};}catch{return null;}
 }
 return {render,input,change,click,keydown,cellsFor,factoryOrders,busy:()=>saving,setMessage:t=>{message=t;}};
})();
