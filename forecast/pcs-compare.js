'use strict';
window.PcsCompare=(()=>{
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),num=n=>n==null?'—':n.toLocaleString('id-ID');
 const months=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'],palette=['#285c78','#a7732f','#59846f','#855f91','#3e8d98','#aa627a'],types={retail:'Tanpa pesanan',orders:'Pesanan'},dimensions={products:'Produk',outlets:'Outlet',months:'Bulan',types:'Jenis penjualan'};
 let data=null,config=null,draft=null,open=false,startField='',restore=false,restorePlot=false;
 const copy=o=>JSON.parse(JSON.stringify(o)),today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 function initial(d){
  const known=[...new Set(d.sales.days.filter(r=>r.date.startsWith(d.year)&&r.date.slice(0,7)<today().slice(0,7)).map(r=>r.date.slice(5,7)))].sort();
  return{by:'types',view:'monthly',year:d.year,products:d.product==='all'?[2,3]:[Number(d.product)],outlets:d.outletId==='__all__'?[...d.sales.outletIds]:[d.outletId],months:d.month==='all'?(known.length?known.slice(-2):['08','09']):[d.month],types:['retail','orders']};
 }
 function count(c){return c.by==='types'?c.types.length:c[c.by].length*c.types.length;}
 function problem(c){
  if(!/^202[56]$/.test(c.year))return 'Pilih tahun yang tersedia.';
  if(['products','outlets','months','types'].some(k=>!c[k].length))return 'Pilih setidaknya satu produk, outlet, bulan, dan jenis penjualan.';
  if(count(c)>6)return `Pilihan ini menghasilkan ${count(c)} garis. Kurangi pilihan ${dimensions[c.by].toLowerCase()} atau jenis penjualan hingga maksimal 6 garis.`;
  if(c.by!=='months'&&c.view==='daily'&&c.months.length>2)return 'Tampilan harian maksimal dua bulan. Pilih Bulanan untuk periode lebih panjang.';
  return '';
 }
 function calendar(y,m){const last=new Date(Number(y),Number(m),0).getDate();return Array.from({length:last},(_,i)=>`${y}-${m}-${String(i+1).padStart(2,'0')}`);}
 function summed(rows){return(rows[0]||[]).map((r,i)=>{const rs=rows.map(a=>a[i]);return{date:r.date,value:rs.some(r=>r.value!==null)?rs.reduce((n,r)=>n+(r.value??0),0):null,complete:rs.every(r=>r.complete),valid:rs.reduce((n,r)=>n+r.valid,0),expected:rs.reduce((n,r)=>n+r.expected,0)};});}
 function build(d,c){
  const ds=[...c.months].sort().flatMap(m=>calendar(c.year,m)),base=c.by==='types'?['all']:c.by==='months'?[...c.months].sort():c[c.by];let result=[];
  for(const key of base)for(const type of c.types){
   const ps=c.by==='products'?[Number(key)]:c.products,ids=c.by==='outlets'?[key]:c.outlets,days=c.by==='months'?calendar(c.year,key):ds;
   const raw=summed(ps.map(p=>type==='retail'?window.PcsMath.pure(d.sales,d.orders,ids,p,days):window.PcsMath.ordered(d.orders,ids,p,days)));
   let rows;
   if(c.by==='months')rows=Array.from({length:31},(_,i)=>raw[i]?{...raw[i],sourceDate:raw[i].date,date:String(i+1).padStart(2,'0')}:{date:String(i+1).padStart(2,'0'),value:null,valid:0,expected:ids.length*ps.length,complete:false});
   else if(c.view==='monthly')rows=window.PcsMath.group(raw,r=>r.date.slice(0,7)).map(r=>({...r,complete:r.complete&&(type==='orders'||r.date<today().slice(0,7))}));else rows=raw;
   const entity=c.by==='products'?d.labels[Number(key)]:c.by==='outlets'?outletName(key):c.by==='months'?months[Number(key)-1]:'';
   const name=entity?entity+(c.types.length>1?' · '+types[type]:''):types[type];
   result.push({key:String(key)+'|'+type,name,type,rows,raw,total:raw.some(r=>r.value!==null)?raw.reduce((n,r)=>n+(r.value??0),0):null,complete:raw.every(r=>r.complete),fullDays:raw.filter(r=>r.complete).length,dayCount:raw.length,color:palette[result.length]});
  }return result;
 }
 const outletName=id=>window.OUTLET_INTELLIGENCE?.outlets?.[id]?.name||id;
 function pointDate(r,c){if(c.by==='months')return Number(r.date);if(c.view==='monthly')return months[Number(r.date.slice(5,7))-1].slice(0,3);return Number(r.date.slice(8,10))+' '+months[Number(r.date.slice(5,7))-1].slice(0,3);}
 function plot(series,c){
  const w=Math.min(1040,Math.max(300,(window.innerWidth||1120)-88)),h=w<600?310:350,p={l:52,r:20,t:22,b:44},n=series[0]?.rows.length||1,max=Math.max(1,...series.flatMap(s=>s.rows.map(r=>r.value??0)))*1.10,x=i=>p.l+i*(w-p.l-p.r)/Math.max(n-1,1),y=v=>h-p.b-v/max*(h-p.t-p.b);let svg='';
  for(let i=0;i<5;i++){const v=max*i/4,yy=y(v);svg+=`<line x1="${p.l}" x2="${w-p.r}" y1="${yy}" y2="${yy}" stroke="#e8eef2"/><text x="${p.l-10}" y="${yy+4}" text-anchor="end">${v>=10000?Math.round(v/1000)+' rb':num(Math.round(v))}</text>`;}
  for(const s of series)for(let i=0;i<s.rows.length;i++){
   const r=s.rows[i],a=s.rows[i-1];if(r.value===null)continue;
   const adjacent=c.by==='months'||c.view==='monthly'||(a&&new Date(r.date)-new Date(a.date)===86400000);
   if(adjacent&&a?.value!==null&&a?.value!==undefined)svg+=`<line x1="${x(i-1)}" y1="${y(a.value)}" x2="${x(i)}" y2="${y(r.value)}" stroke="${s.color}" stroke-width="1.3" stroke-linecap="round" ${a.complete&&r.complete?'':'stroke-dasharray="5 4"'}/>`;
   if(a?.value==null&&s.rows[i+1]?.value==null)svg+=`<circle cx="${x(i)}" cy="${y(r.value)}" r="2.5" fill="${s.color}"/>`;
   // Only isolated values get a marker; transparent targets work with mouse and keyboard.
   svg+=`<circle cx="${x(i)}" cy="${y(r.value)}" r="9" fill="transparent" stroke="none" tabindex="0" data-cmp-point="${esc(s.name+' · '+(r.sourceDate||r.date))}" data-cmp-qty="${r.value}" data-cmp-partial="${!r.complete}" style="--cmp-color:${s.color}"><title>${esc(s.name)} · ${esc(r.sourceDate||r.date)}: ${num(r.value)} PCS${r.complete?'':' · sebagian data'}</title></circle>`;
  }
  const step=Math.max(1,Math.ceil(n/(w<600?5:10)));(series[0]?.rows||[]).forEach((r,i)=>{if(i%step!==0&&i!==n-1)return;svg+=`<text x="${x(i)}" y="${h-12}" text-anchor="middle">${esc(pointDate(r,c))}</text>`;});
  return `<div class="pcs-chart cmp-chart"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Grafik perbandingan PCS berdasarkan ${dimensions[c.by].toLowerCase()}">${svg}</svg></div><div class="pcs-chart-readout cmp-readout" aria-live="polite">Arahkan ke garis untuk melihat rinciannya.</div>`;
 }
 function selectionSummary(c){const products=c.products.length<=2?c.products.map(p=>data.labels[p]).join(' + '):c.products.length+' produk',outlets=c.outlets.length<=2?c.outlets.map(outletName).join(' + '):c.outlets.length+' outlet';return `${products} · ${outlets} · ${[...c.months].sort().map(m=>months[Number(m)-1].slice(0,3)).join(', ')} ${c.year} · ${c.types.length===1?types[c.types[0]]:'Pesanan & tanpa pesanan'}`;}
 function pick(k,title,options,search=false){return `<details class="cmp-picker" data-cmp-picker="${k}" ${startField===k?'open':''}><summary><span>${title}</span><b data-cmp-count="${k}">${draft[k].length} dipilih</b></summary><div class="cmp-picker-body">${search?`<input type="search" data-cmp-search="${k}" placeholder="Cari outlet…" aria-label="Cari outlet perbandingan">`:''}<div class="cmp-picker-tools"><button type="button" data-cmp-all="${k}">Pilih semua</button><button type="button" data-cmp-none="${k}">Kosongkan</button></div><div class="cmp-options ${k==='months'?'cmp-month-options':''}">${options.map(([value,name])=>`<label data-cmp-option="${k}"><input type="checkbox" data-cmp-field="${k}" value="${esc(value)}" ${draft[k].map(String).includes(String(value))?'checked':''}><span>${esc(name)}</span></label>`).join('')}</div></div></details>`;}
 function dialog(){if(!open||!draft)return '';
  return `<dialog id="pcs-comparison-dialog" class="cmp-dialog" aria-labelledby="cmp-dialog-title"><div class="cmp-dialog-head"><div><h2 id="cmp-dialog-title">Atur perbandingan</h2><p>Maksimal 6 garis agar mudah dibaca.</p></div><button type="button" data-cmp-cancel aria-label="Tutup pengaturan perbandingan">✕</button></div><div class="cmp-dialog-body"><fieldset class="cmp-dimensions"><legend>Yang ingin dibandingkan</legend>${Object.entries(dimensions).map(([v,name])=>`<label><input type="radio" name="cmp-dimension" data-cmp-field="by" value="${v}" ${draft.by===v?'checked':''}><span>${name}</span></label>`).join('')}</fieldset><div class="cmp-period-controls"><label>Tahun<select data-cmp-field="year" aria-label="Tahun perbandingan"><option ${draft.year==='2026'?'selected':''}>2026</option><option ${draft.year==='2025'?'selected':''}>2025</option></select></label><label>Tampilan<select data-cmp-field="view" aria-label="Tampilan perbandingan" ${draft.by==='months'?'disabled':''}><option value="monthly" ${draft.view==='monthly'&&draft.by!=='months'?'selected':''}>Bulanan</option><option value="daily" ${draft.view==='daily'||draft.by==='months'?'selected':''}>Harian</option></select></label></div><p class="cmp-hint" data-cmp-hint>${draft.by==='months'?'Bulan disejajarkan menurut tanggal 1–31.':'Pilihan lain digabung menjadi total. Warna garis mengikuti pembanding di atas.'}</p>${pick('products','Produk',data.labels.map((name,i)=>[i,name]))}${pick('outlets','Outlet',data.sales.outletIds.map(id=>[id,outletName(id)]).sort((a,b)=>a[1].localeCompare(b[1])),true)}${pick('months','Bulan',months.map((m,i)=>[String(i+1).padStart(2,'0'),m]))}<fieldset class="cmp-types"><legend>Jenis penjualan</legend>${Object.entries(types).map(([v,name])=>`<label><input type="checkbox" data-cmp-field="types" value="${v}" ${draft.types.includes(v)?'checked':''}><span>${name}</span></label>`).join('')}</fieldset></div><div class="cmp-dialog-foot"><p data-cmp-validation role="status">${problem(draft)||count(draft)+' garis akan ditampilkan'}</p><div><button type="button" data-cmp-cancel class="cmp-secondary">Batal</button><button type="button" data-cmp-apply class="cmp-primary" ${problem(draft)?'disabled':''}>Tampilkan perbandingan</button></div></div></dialog>`;
 }
 function render(d){data=d;if(!config)config=initial(d);const bad=problem(config),series=bad?[]:build(d,config),any=series.some(s=>s.total!==null);
  return `<section class="pcs-compare"><div class="cmp-heading"><div><h2>Bandingkan ${dimensions[config.by].toLowerCase()}</h2><p>${esc(selectionSummary(config))}</p></div><button type="button" class="cmp-primary" data-cmp-config="">Atur perbandingan</button></div><div class="cmp-filter-chips">${[['products','Produk'],['outlets','Outlet'],['months','Bulan'],['types','Jenis penjualan']].map(([k,title])=>`<button type="button" data-cmp-config="${k}">${title} <b>${config[k].length}</b></button>`).join('')}</div><article class="workspace-card pcs-main-chart"><div class="pcs-chart-title"><h3>${config.by==='months'?'Pola harian · tanggal 1–31':config.view==='monthly'?'Tren per bulan':'Tren harian'}</h3><span class="pcs-tag">${config.year} · PCS</span></div>${any?plot(series,config):`<div class="pcs-chart-empty"><strong>${bad?esc(bad):'Belum ada data pada pilihan ini'}</strong><p>Ubah pilihan melalui Atur perbandingan.</p></div>`}<div class="cmp-legend" aria-label="Keterangan garis">${series.map(s=>`<div><i style="background:${s.color}"></i><span>${esc(s.name)}<small>${s.fullDays}/${s.dayCount} hari lengkap</small></span><strong>${num(s.total)} <small>PCS${s.complete?'':' *'}</small></strong></div>`).join('')}</div><p class="pcs-data-note">* Data sebagian atau bulan belum selesai. Angka kosong tidak dihitung nol.${config.types.includes('orders')?' Pesanan mengikuti tanggal pengambilan, termasuk yang akan datang.':''}</p></article>${dialog()}</section>`;
 }
 function refresh(){
  const box=document.getElementById('pcs-comparison-dialog');if(!box||!draft)return;
  for(const k of ['products','outlets','months']){box.querySelector(`[data-cmp-count="${k}"]`).textContent=draft[k].length+' dipilih';}
  box.querySelector('[data-cmp-validation]').textContent=problem(draft)||count(draft)+' garis akan ditampilkan';box.querySelector('[data-cmp-apply]').disabled=!!problem(draft);
  const view=box.querySelector('[data-cmp-field="view"]');view.disabled=draft.by==='months';view.value=draft.by==='months'?'daily':draft.view;
  box.querySelector('[data-cmp-hint]').textContent=draft.by==='months'?'Bulan disejajarkan menurut tanggal 1–31.':'Pilihan lain digabung menjadi total. Warna garis mengikuti pembanding di atas.';
 }
 function click(e){
  const set=e.target.closest('[data-cmp-config]');if(set){draft=copy(config);open=true;startField=set.dataset.cmpConfig;return true;}
  if(e.target.closest('[data-cmp-cancel]')){open=false;draft=null;restore=true;return true;}
  if(e.target.closest('[data-cmp-apply]')){if(draft&&!problem(draft)){config=copy(draft);open=false;draft=null;restore=true;restorePlot=true;return true;}return false;}
  const all=e.target.closest('[data-cmp-all]'),none=e.target.closest('[data-cmp-none]');if(all||none){const k=all?all.dataset.cmpAll:none.dataset.cmpNone;for(const input of document.querySelectorAll(`#pcs-comparison-dialog [data-cmp-field="${k}"]`))input.checked=!!all;draft[k]=all?(k==='products'?data.labels.map((_,i)=>i):k==='outlets'?[...data.sales.outletIds]:months.map((_,i)=>String(i+1).padStart(2,'0'))):[];refresh();}return false;
 }
 function change(e){const k=e.target.dataset?.cmpField;if(!k||!draft)return false;
  if(['year','by','view'].includes(k))draft[k]=e.target.value;
  else{const v=k==='products'?Number(e.target.value):e.target.value;draft[k]=e.target.checked?[...new Set([...draft[k],v])]:draft[k].filter(x=>x!==v);}
  refresh();return true;
 }
 function mount(){
  const active=!!document.querySelector('.pcs-compare'),picker=document.querySelector('.outlet-picker');if(picker)picker.hidden=active;if(active)document.getElementById('workspace-title').textContent='Perbandingan penjualan';
  const box=document.getElementById('pcs-comparison-dialog');if(box&&open&&!box.open){box.showModal();box.addEventListener('cancel',()=>{open=false;draft=null;},{once:true});refresh();if(startField==='types')box.querySelector('[data-cmp-field="types"]')?.focus();else if(startField)box.querySelector(`[data-cmp-picker="${startField}"] summary`)?.focus();}
  if(restore){document.querySelector('.pcs-compare [data-cmp-config]')?.focus({preventScroll:true});if(restorePlot)document.querySelector('.pcs-compare')?.scrollIntoView({behavior:'smooth',block:'start'});restore=false;restorePlot=false;}
 }
 function input(e){const k=e.target.dataset?.cmpSearch;if(!k)return;const q=e.target.value.trim().toLowerCase();for(const label of document.querySelectorAll(`[data-cmp-option="${k}"]`))label.hidden=!label.textContent.toLowerCase().includes(q);}
 function inspect(e){const p=e.target.closest('[data-cmp-point]');if(!p)return;const box=p.closest('.pcs-compare')?.querySelector('.cmp-readout');if(box)box.textContent=p.dataset.cmpPoint+' · '+num(Number(p.dataset.cmpQty))+' PCS'+(p.dataset.cmpPartial==='true'?' · sebagian data':'');}
 return{render,click,change,mount,input,inspect};
})();
