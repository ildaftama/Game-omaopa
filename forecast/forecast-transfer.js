// Catatan transfer antar-outlet (owner 2026-11-26). Forecaster wajib mencatat setiap transfer di web supaya
// stok berjalan, lost sales, dan saran transfer langsung ikut berubah. Daily Report tetap jadi cadangan:
// jumlah final mengikuti Daily Report, jam mengikuti catatan web. Tampil di tab Stok & Transfer.
window.ForecastTransferLog=(()=>{
 'use strict';
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const nf=v=>Math.round(v||0).toLocaleString('id-ID');
 const S=()=>window.ForecastStock,A=()=>window.ForecastTransferAPI;
 const DAYS=7;
 let items=null,logDate=null,busy=false;
 const iso=t=>new Date(t).toISOString().slice(0,10);
 const shift=(d,n)=>iso(Date.parse(d+'T00:00:00Z')+n*864e5);
 const dLabel=d=>{const t=S().today();return d===t?'Hari ini':d===shift(t,-1)?'Kemarin':new Date(d+'T00:00:00Z').toLocaleDateString('id-ID',{weekday:'long',day:'numeric',month:'short',timeZone:'UTC'});};
 const nowHM=()=>{const h=S().nowHour(),m=Math.round(h*60);return String(Math.floor(m/60)%24).padStart(2,'0')+':'+String(m%60).padStart(2,'0');};
 const mine=t=>t.by===A()?.uid?.();
 const canEdit=t=>A()?.isMaster?.()||(mine(t)&&A()?.canWrite?.()&&t.date>=shift(S().today(),-1));
 const pcs=t=>Object.values(t.items||{}).reduce((s,q)=>s+q,0);
 const itemsText=t=>Object.entries(t.items||{}).sort((a,b)=>a[0]-b[0]).map(([k,q])=>`${S().LABELS[+k]} ${nf(q)}`).join(', ');

 function outletGroups(){
  const seen=new Set(),groups=[];
  for(const a of S().areaList()){const ids=[...new Set([...a.ids,...(a.centers||[])])].filter(id=>!seen.has(id));ids.forEach(id=>seen.add(id));if(ids.length)groups.push([a.title,ids]);}
  const rest=Object.keys(window.OUTLET_INTELLIGENCE?.outlets||{}).filter(id=>!seen.has(id));if(rest.length)groups.push(['Lainnya',rest]);
  return groups.map(([t,ids])=>[t,ids.sort((x,y)=>S().name(x).localeCompare(S().name(y)))]);
 }
 // Sisa stok sekarang per outlet x produk (hanya untuk hari ini).
 function leftMap(){const c=S().compute(),m=new Map();if(c.ok)for(const o of c.outlets)for(const it of o.items)m.set(o.id+'|'+it.lab,Math.max(0,Math.round(it.left)));return m;}

 // ---------- Form catat / ubah ----------
 function open(pre={},editId=null){
  if(!A()?.canWrite?.()&&!A()?.isMaster?.())return;
  document.querySelector('.tf-modal')?.remove();const back=document.activeElement,t=S().today();
  const opts=sel=>outletGroups().map(([g,ids])=>`<optgroup label="${esc(g)}">${ids.map(id=>`<option value="${esc(id)}"${id===sel?' selected':''}>${esc(S().name(id))}</option>`).join('')}</optgroup>`).join('');
  const prodOpts=k=>S().LABELS.map((l,i)=>`<option value="${i}"${String(i)===String(k)?' selected':''}>${esc(l)}</option>`).join('');
  const rows=Object.entries(pre.items||{}).length?Object.entries(pre.items):[['','']];
  const row=(k,q)=>`<div class="tf-row"><select name="lab" aria-label="Produk"><option value="">Pilih produk…</option>${prodOpts(k)}</select><input name="qty" type="number" inputmode="numeric" min="1" max="500" value="${esc(q)}" placeholder="pcs" aria-label="Jumlah pcs"><button type="button" class="tf-x" data-tf-delrow aria-label="Hapus baris">✕</button><small class="tf-hint"></small></div>`;
  const m=document.createElement('div');m.className='tf-modal';
  m.innerHTML=`<form class="tf-card" role="dialog" aria-modal="true" aria-labelledby="tf-title" action="javascript:void 0" novalidate>
<h3 id="tf-title">${editId?'Ubah catatan transfer':'Catat transfer'}</h3>
<p class="tf-sub">Catat setelah kue benar-benar dikirim. Stok dan saran transfer langsung ikut berubah.</p>
<div class="tf-two"><label>Tanggal<select name="tdate"><option value="${t}">Hari ini</option><option value="${shift(t,-1)}"${pre.date===shift(t,-1)?' selected':''}>Kemarin</option></select></label><label>Jam kirim<input name="ttime" type="time" min="07:00" max="21:00" value="${esc(pre.time||nowHM())}" required></label></div>
<div class="tf-route"><label>Dari outlet<select name="tfrom" required><option value="">Pilih pengirim…</option>${opts(pre.from)}</select></label><button type="button" class="tf-swap" data-tf-swap aria-label="Tukar pengirim dan penerima" title="Tukar">⇄</button><label>Ke outlet<select name="tto" required><option value="">Pilih penerima…</option>${opts(pre.to)}</select></label></div>
<fieldset><legend>Produk yang dikirim</legend><div class="tf-rows">${rows.map(([k,q])=>row(k,q)).join('')}</div><button type="button" class="tf-addrow" data-tf-addrow>+ Tambah produk</button></fieldset>
<label>Catatan <small>(opsional)</small><input name="tnote" maxlength="200" value="${esc(pre.note||'')}" placeholder="mis. dibawa kurir Grab, dititip driver pabrik"></label>
<p class="tf-info">Jumlah akhirnya disesuaikan dengan Daily Report bila sudah diisi; jam kirim diambil dari catatan ini.</p>
<p class="tf-msg" role="status"></p>
<div class="tf-actions">${editId?'<button type="button" class="button quiet tf-del" data-tf-remove>Hapus catatan</button>':''}<button type="button" class="button quiet" data-tf-close>Batal</button><button type="submit" class="button fp-primary">${editId?'Simpan perubahan':'Simpan transfer'}</button></div></form>`;
  document.body.appendChild(m);
  const f=m.querySelector('form'),msg=m.querySelector('.tf-msg'),close=()=>{m.remove();back?.focus?.();};
  const hints=()=>{const today=f.tdate.value===S().today(),L=today?leftMap():null;
   f.querySelectorAll('.tf-row').forEach(r=>{const k=r.querySelector('[name=lab]').value,q=+r.querySelector('[name=qty]').value||0,h=r.querySelector('.tf-hint');
    if(!today||k===''||!f.tfrom.value){h.textContent='';h.className='tf-hint';return;}
    const a=L.get(f.tfrom.value+'|'+k),b=f.tto.value?L.get(f.tto.value+'|'+k):null;
    h.textContent=`Sisa sekarang: ${S().name(f.tfrom.value)} ${a==null?'—':nf(a)}${f.tto.value?` · ${S().name(f.tto.value)} ${b==null?'—':nf(b)}`:''}${a!=null&&q>a?' · melebihi sisa pengirim, cek lagi':''}`;
    h.className='tf-hint'+(a!=null&&q>a?' warn':'');});};
  f.addEventListener('input',hints);f.addEventListener('change',hints);hints();
  m.addEventListener('click',async e=>{
   if(e.target===m||e.target.closest('[data-tf-close]')){close();return;}
   if(e.target.closest('[data-tf-addrow]')){f.querySelector('.tf-rows').insertAdjacentHTML('beforeend',row('',''));f.querySelector('.tf-row:last-child select').focus();hints();return;}
   const dr=e.target.closest('[data-tf-delrow]');if(dr){if(f.querySelectorAll('.tf-row').length>1)dr.closest('.tf-row').remove();else{dr.closest('.tf-row').querySelector('select').value='';dr.closest('.tf-row').querySelector('input').value='';}hints();return;}
   if(e.target.closest('[data-tf-swap]')){const a=f.tfrom.value;f.tfrom.value=f.tto.value;f.tto.value=a;hints();return;}
   if(e.target.closest('[data-tf-remove]')){if(!confirm('Hapus catatan transfer ini? Stok kedua outlet akan dihitung ulang tanpa transfer ini.'))return;try{await A().remove(editId);close();}catch{msg.textContent='Catatan belum terhapus. Periksa koneksi lalu coba lagi.';}}
  });
  m.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close();}});
  f.addEventListener('submit',async e=>{e.preventDefault();if(busy)return;msg.textContent='';
   const it={};let bad=false;
   f.querySelectorAll('.tf-row').forEach(r=>{const k=r.querySelector('[name=lab]').value,q=Math.round(+r.querySelector('[name=qty]').value||0);if(k===''&&!q)return;if(k===''||q<1||q>500){bad=true;return;}it[k]=(it[k]||0)+q;});
   const d={date:f.tdate.value,time:f.ttime.value,from:f.tfrom.value,to:f.tto.value,items:it,note:f.tnote.value};
   if(!d.from||!d.to){msg.textContent='Pilih outlet pengirim dan penerima.';return;}
   if(d.from===d.to){msg.textContent='Pengirim dan penerima tidak boleh sama.';return;}
   if(bad){msg.textContent='Setiap baris perlu produk dan jumlah 1–500 pcs.';return;}
   if(!Object.keys(it).length){msg.textContent='Isi minimal satu produk.';return;}
   if(!/^\d\d:\d\d$/.test(d.time)){msg.textContent='Isi jam kirim.';return;}
   if(d.date===S().today()&&d.time>nowHM()&&!confirm(`Jam kirim ${d.time} belum lewat. Tetap simpan?`))return;
   // Cegah tercatat dua kali oleh dua forecaster.
   const dup=(items||[]).find(x=>x.id!==editId&&x.date===d.date&&x.from===d.from&&x.to===d.to&&Math.abs((+x.time.slice(0,2)*60+ +x.time.slice(3))-(+d.time.slice(0,2)*60+ +d.time.slice(3)))<=45&&Object.keys(x.items||{}).some(k=>k in it));
   if(dup&&!confirm(`Transfer ${S().name(d.from)} → ${S().name(d.to)} jam ${dup.time} sudah dicatat oleh ${dup.name} (${itemsText(dup)}). Tetap simpan sebagai transfer terpisah?`))return;
   const sb=f.querySelector('[type=submit]');busy=true;sb.disabled=true;sb.textContent='Menyimpan…';
   try{if(editId)await A().update(editId,d);else await A().add(d);busy=false;close();logDate=d.date;}
   catch(err){busy=false;sb.disabled=false;sb.textContent=editId?'Simpan perubahan':'Simpan transfer';msg.textContent=err?.code==='permission-denied'?'Ditolak server. Aturan Firestore untuk transfer mungkin belum dipublikasikan, atau akun ini tidak boleh mencatat.':'Transfer belum tersimpan. Periksa koneksi lalu coba lagi.';}
  });
  setTimeout(()=>(pre.from?f.querySelector('[name=qty]'):f.tfrom).focus(),0);
 }

 // ---------- Daftar catatan + pencocokan Daily Report ----------
 function view(c,ids){
  if(items==null)return '<div class="st-empty"><b>Memuat catatan transfer…</b><span>Bila tidak muncul, aturan Firestore untuk transfer mungkin belum dipublikasikan.</span></div>';
  const t=S().today();logDate=logDate||t;
  const dates=Array.from({length:DAYS},(_,i)=>shift(t,-i));
  const inSel=x=>!ids||ids.has(x.from)||ids.has(x.to);
  const list=items.filter(x=>x.date===logDate&&inSel(x)).sort((a,b)=>b.time.localeCompare(a.time)||((b.at?.toMillis?.()||0)-(a.at?.toMillis?.()||0)));
  // Pencocokan per outlet x produk x arah, hanya hari ini (Daily Report hari ini ada di data stok berjalan).
  const L=window.ForecastStockLive,daily=logDate===t&&L?.date===t?L.daily||{}:null,web=new Map();
  if(daily)for(const x of items.filter(x=>x.date===t))for(const [k,q] of Object.entries(x.items||{})){web.set(`${x.from}|${k}|out`,(web.get(`${x.from}|${k}|out`)||0)+q);web.set(`${x.to}|${k}|in`,(web.get(`${x.to}|${k}|in`)||0)+q);}
  const dr=(id,k,dir)=>daily?.[id]?.[k]?.[dir==='in'?2:3]||0;
  const status=x=>{if(!daily)return '';let miss=0,diff=[],ok=0;
   for(const [k,q] of Object.entries(x.items||{}))for(const [id,dir] of [[x.from,'out'],[x.to,'in']]){const v=dr(id,k,dir),w=web.get(`${id}|${k}|${dir}`)||0;if(!v)miss++;else if(Math.round(v)!==w)diff.push(`${S().name(id)} ${S().SHORT[+k]} ${dir==='in'?'masuk':'keluar'} ${nf(v)}`);else ok++;}
   if(diff.length)return `<span class="tf-st diff" title="${esc(diff.join('; '))}">Beda dengan Daily Report: ${esc(diff.join('; '))}</span>`;
   if(miss&&!ok)return '<span class="tf-st wait">Belum ada di Daily Report</span>';
   if(miss)return '<span class="tf-st wait">Sebagian sudah di Daily Report</span>';
   return '<span class="tf-st ok">Cocok dengan Daily Report</span>';};
  const unlogged=[];
  if(daily)for(const [id,cells] of Object.entries(daily)){if(ids&&!ids.has(id))continue;for(const [k,v] of Object.entries(cells))for(const [dir,i] of [['in',2],['out',3]])if((v[i]||0)>0&&!web.has(`${id}|${k}|${dir}`))unlogged.push({id,k,dir,q:v[i]});}
  const tot=list.reduce((s,x)=>s+pcs(x),0),who=new Set(list.map(x=>x.name));
  const head=`<div class="tf-head"><label class="st-sel"><span>Tanggal</span><select data-tf-date>${dates.map(d=>`<option value="${d}"${d===logDate?' selected':''}>${esc(dLabel(d))}${d===t||d===shift(t,-1)?'':''}</option>`).join('')}</select></label><div class="tf-sum"><strong>${nf(list.length)} transfer</strong><span>${nf(tot)} pcs${who.size?` · dicatat oleh ${esc([...who].join(', '))}`:''}</span></div></div>`;
  const rows=list.length?`<div class="tf-list">${list.map(x=>`<article class="tf-item"><div class="tf-time">${esc(x.time.replace(':','.'))}</div><div class="tf-main"><div class="st-route"><b>${esc(S().name(x.from))}</b><i aria-hidden="true">→</i><b>${esc(S().name(x.to))}</b><span class="tf-pcs">${nf(pcs(x))} pcs</span></div><p>${esc(itemsText(x))}</p>${x.note?`<p class="tf-note">“${esc(x.note)}”</p>`:''}<div class="tf-meta"><span>Dicatat ${esc(x.name||'—')}${x.editedAt?' · diubah':''}</span>${status(x)}</div></div>${canEdit(x)?`<button type="button" class="st-copy" data-tf-edit="${esc(x.id)}">Ubah</button>`:''}</article>`).join('')}</div>`
   :`<div class="st-empty"><b>Belum ada transfer tercatat ${logDate===t?'hari ini':'pada tanggal ini'}.</b><span>${A()?.canWrite?.()?'Klik “+ Catat transfer” setiap kali ada kue yang dipindah antar-outlet.':'Transfer dicatat oleh forecaster.'}</span></div>`;
  const miss=unlogged.length?`<section class="st-gaps tf-unlogged"><h3>Ada di Daily Report, belum dicatat di web <small>${nf(unlogged.length)} baris</small></h3><p>Transfer ini terisi di Daily Report tetapi tidak ada catatannya di web, jadi jamnya tidak diketahui dan stok menganggapnya terjadi pagi hari.</p><ul>${unlogged.sort((a,b)=>S().name(a.id).localeCompare(S().name(b.id))).map(u=>`<li><b>${esc(S().name(u.id))}</b><span>${esc(S().LABELS[+u.k])}</span><em>${u.dir==='in'?'masuk +':'keluar −'}${nf(u.q)}</em></li>`).join('')}</ul></section>`:'';
  const foot=`<p class="wl-foot">Setiap transfer wajib dicatat di sini. Stok pengirim langsung berkurang dan stok penerima bertambah mulai jam kirim, jadi lost sales dan saran transfer ikut akurat. Bila Daily Report sudah terisi, jumlahnya mengikuti Daily Report. Pencatat bisa mengubah catatannya sampai besok; Master bisa mengubah semua.${daily?'':' Pencocokan dengan Daily Report hanya tersedia untuk hari ini.'}</p>`;
  return head+rows+miss+foot;
 }
 document.addEventListener('click',e=>{const b=e.target.closest?.('#st-root [data-tf-edit]');if(!b)return;const x=(items||[]).find(y=>y.id===b.dataset.tfEdit);if(x)open(x,x.id);});
 document.addEventListener('change',e=>{const s=e.target.closest?.('#st-root [data-tf-date]');if(!s)return;logDate=s.value;s.blur();S()?.paint?.();});

 function start(){
  const from=shift(S().today(),-(DAYS+1));
  A().listen(from,list=>{items=list||[];window.dispatchEvent(new CustomEvent('forecast-transfer'));});
 }
 const wait=setInterval(()=>{if(window.ForecastTransferAPI&&window.ForecastAuth&&window.ForecastStock&&!document.getElementById('forecast-app')?.hidden){clearInterval(wait);start();}},1000);
 return {list:()=>items||[],open,view};
})();
