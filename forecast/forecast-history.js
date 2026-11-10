'use strict';
// Riwayat & log forecast (owner 2026-11-10): satu menu untuk melihat SIAPA menyimpan / menghapus /
// memulihkan rencana, KAPAN, dan ALASANNYA -- supaya manajer bisa memantau dan akurasi tidak bisa
// dimanipulasi diam-diam. Sumber: dokumen rencana (versi terakhir + waktu dibuat), subkoleksi
// revisions (semua versi, dimuat saat dibuka), dan forecastPlanLog (hapus/pulihkan, permanen).
window.ForecastHistory=(()=>{
 const model=window.ForecastPlanner;
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const nf=n=>n==null?'—':Number(n).toLocaleString('id-ID');
 const today=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Jakarta'});
 const cloud=()=>window.ForecastPlanCloud||{records:[],allRecords:[],log:[]};
 const name=id=>window.OUTLET_INTELLIGENCE?.outlets?.[id]?.name||id;
 const ms=ts=>ts?.toMillis?.()||0;
 const wib=ts=>ts?.toDate?ts.toDate().toLocaleDateString('en-CA',{timeZone:'Asia/Jakarta'}):null;
 const time=ts=>ts?.toDate?ts.toDate().toLocaleTimeString('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit'}):'—';
 const full=ts=>ts?.toDate?ts.toDate().toLocaleString('id-ID',{timeZone:'Asia/Jakarta',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'—';
 const dayLabel=d=>new Date(d+'T12:00:00+07:00').toLocaleDateString('id-ID',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
 const short=d=>new Date(d+'T12:00:00+07:00').toLocaleDateString('id-ID',{day:'numeric',month:'short'});
 const sum=a=>(a||[]).reduce((s,v)=>s+(Number(v)||0),0);
 let from=model.shift(today(),-6),to=model.shift(today(),1),filter='__all__',kind='all',open=new Map();
 const who=(uid,byName)=>{if(byName)return byName;const n=cloud().staffName?.(uid);return n==null?'…':n||'Akun staf';};
 function events(){
  const C=cloud(),ev=[];
  for(const r of C.allRecords||[]){
   if(r.date<from||r.date>to||(filter!=='__all__'&&r.outlet!==filter))continue;
   if(r.revision>1)ev.push({type:'create',at:r.firstSavedAt,key:r.key,date:r.date,outlet:r.outlet,revision:1,pcs:sum(r.baseline?.regular)+sum(r.baseline?.orders),by:null,byName:''});
   ev.push({type:r.revision>1?'save':'create',at:r.savedAt,key:r.key,date:r.date,outlet:r.outlet,revision:r.revision,pcs:sum(r.plan.regular)+sum(r.plan.orders),by:r.savedBy,byName:'',note:r.plan.note,deleted:!!r.deleted});
  }
  for(const e of C.log||[]){
   if(e.date<from||e.date>to||(filter!=='__all__'&&e.outlet!==filter))continue;
   ev.push({id:e.id,type:e.action,at:e.at,key:e.key,date:e.date,outlet:e.outlet,revision:e.revision,pcs:sum(e.regular)+sum(e.orders),by:e.by,byName:e.byName,reason:e.reason,late:e.action==='delete'&&(wib(e.at)||'')>=e.date});
  }
  return ev.filter(e=>kind==='all'||(kind==='save'?['save','create'].includes(e.type):['delete','restore'].includes(e.type))).sort((a,b)=>ms(b.at)-ms(a.at));
 }
 const LABEL={create:['Dibuat','new'],save:['Diubah','save'],delete:['Dihapus','del'],restore:['Dipulihkan','restore']};
 function versions(key){
  const st=open.get(key);if(!st)return '';
  if(st.loading)return '<div class="fh-versions"><p class="fp-caption">Memuat semua versi…</p></div>';
  if(st.error)return `<div class="fh-versions"><p class="fp-alert">${esc(st.error)}</p></div>`;
  const rows=st.list.map((v,i)=>{const prev=st.list[i-1],pcs=sum(v.plan.regular)+sum(v.plan.orders),d=prev?pcs-(sum(prev.plan.regular)+sum(prev.plan.orders)):null;
   const changed=prev?model.names.map((n,p)=>[n,(prev.plan.regular[p]+prev.plan.orders[p]),(v.plan.regular[p]+v.plan.orders[p])]).filter(([,a,b])=>a!==b).map(([n,a,b])=>`${n} ${a}→${b}`):[];
   return `<tr><td><b>v${v.revision}</b>${i===0?'<small>versi awal · dipakai akurasi</small>':''}</td><td>${full(v.savedAt)}</td><td>${esc(who(v.savedBy))}</td><td>${nf(sum(v.plan.regular))}</td><td>${nf(sum(v.plan.orders))}</td><td class="${d==null?'':d>0?'fh-up':d<0?'fh-down':''}">${d==null?'—':(d>0?'+':'')+nf(d)}</td><td class="fh-wrap">${changed.length?esc(changed.slice(0,6).join(', '))+(changed.length>6?` +${changed.length-6} lagi`:''):i===0?'—':'Hanya catatan/produk lain'}${v.plan.note?`<small>“${esc(v.plan.note)}”</small>`:''}</td></tr>`;}).join('');
  return `<div class="fh-versions"><div class="fp-table-scroll"><table class="fp-table"><thead><tr><th>Versi</th><th>Waktu</th><th>Oleh</th><th>Reguler</th><th>Pesanan</th><th>Selisih</th><th>Yang berubah</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
 }
 function render(){
  cloud().watch?.(from,to);
  const ev=events();
  const base=(()=>{const k=kind;kind='all';const e=events();kind=k;return e;})();
  const nSave=base.filter(e=>e.type==='save'||e.type==='create').length,nDel=base.filter(e=>e.type==='delete').length,nLate=base.filter(e=>e.late).length,nRes=base.filter(e=>e.type==='restore').length;
  const groups=new Map();for(const e of ev){const d=wib(e.at)||'—';if(!groups.has(d))groups.set(d,[]);groups.get(d).push(e);}
  const item=e=>{const [lbl,cls]=LABEL[e.type],isOpen=open.has(e.key);
   return `<li class="fh-item ${e.late?'late':''}"><span class="fh-time">${time(e.at)}</span><span class="fh-pill ${cls}">${lbl}</span><div class="fh-body"><div><b>${esc(e.by||e.byName?who(e.by,e.byName):'—')}</b> ${e.type==='create'?'membuat':e.type==='save'?'mengubah':e.type==='delete'?'menghapus':'memulihkan'} rencana <b>${esc(name(e.outlet))}</b> untuk ${short(e.date)} <span class="fh-muted">· versi ${e.revision} · ${nf(e.pcs)} pcs</span>${e.deleted&&e.type!=='delete'?' <span class="fh-muted">· sekarang dihapus</span>':''}</div>${e.reason?`<div class="fh-reason">Alasan: “${esc(e.reason)}”</div>`:''}${e.late?'<div class="fh-late">Dihapus pada/ setelah hari H. Hasil penjualan mungkin sudah terlihat saat dihapus.</div>':''}${e.type==='delete'&&cloud().allRecords.find(r=>r.key===e.key)?.deleted?.logId===e.id?(cloud().canManage?`<button type="button" class="fh-link fh-restore" data-fp-restore="${esc(e.key)}">Pulihkan rencana ini</button>`:'<span class="fh-muted">Masih dihapus · bisa dipulihkan Admin Utama/Master</span> '):''}<button type="button" class="fh-link" data-fh-open="${esc(e.key)}">${isOpen?'Tutup versi':'Lihat semua versi'}</button>${isOpen?versions(e.key):''}</div></li>`;};
  const list=[...groups].map(([d,items])=>`<section class="fh-day"><h3>${d==='—'?'Waktu belum tercatat':dayLabel(d)}</h3><ul>${items.map(item).join('')}</ul></section>`).join('');
  return `<div class="fp-controls"><label>Outlet<select id="fh-filter">${options(filter)}</select></label><label>Rencana dari tanggal<input id="fh-from" type="date" value="${from}"></label><label>Sampai tanggal<input id="fh-to" type="date" value="${to}" min="${from}"></label><label>Jenis aktivitas<select id="fh-kind"><option value="all" ${kind==='all'?'selected':''}>Semua aktivitas</option><option value="save" ${kind==='save'?'selected':''}>Simpan & ubah</option><option value="del" ${kind==='del'?'selected':''}>Hapus & pulihkan</option></select></label></div>
   <div class="fh-tiles"><div><span>Simpan & ubah</span><strong>${nSave}</strong></div><div><span>Dihapus</span><strong>${nDel}</strong></div><div class="${nLate?'warn':''}"><span>Dihapus setelah hari H</span><strong>${nLate}</strong><small>${nLate?'perlu dicek manajer':'aman'}</small></div><div><span>Dipulihkan</span><strong>${nRes}</strong></div></div>
   <p class="fp-caption">Rentang tanggal = tanggal <b>rencana</b> (tanggal kiriman), bukan tanggal aktivitas. Catatan hapus/pulihkan permanen dan tidak bisa diubah siapa pun. Untuk satu rencana, simpanan sebelum versi terakhir terlihat lewat <b>Lihat semua versi</b>.</p>
   ${ev.length?`<div class="fh-list">${list}</div>`:`<div class="fp-empty"><h3>Belum ada aktivitas</h3><p>${cloud().state==='ready'?'Tidak ada rencana yang disimpan, diubah atau dihapus pada rentang ini.':'Masuk akun staf untuk melihat riwayat tim.'}</p></div>`}`;
 }
 function options(value){const ids=[...(window.PcsPanels?.data?.()?.sales?.outletIds||[])].sort((a,b)=>name(a).localeCompare(name(b)));return '<option value="__all__">Semua outlet</option>'+ids.map(id=>`<option value="${id}" ${value===id?'selected':''}>${esc(name(id))}</option>`).join('');}
 const rerender=()=>window.dispatchEvent(new Event('forecast-operations-changed'));
 function click(e){
  const o=e.target.closest('[data-fh-open]');if(!o)return false;const key=o.dataset.fhOpen;
  if(open.has(key)){open.delete(key);return true;}
  open.set(key,{loading:true});cloud().getRevisions(key).then(list=>{open.set(key,{list});rerender();}).catch(()=>{open.set(key,{error:'Versi rencana belum bisa dimuat. Periksa koneksi atau izin akun.'});rerender();});
  return true;
 }
 function change(e){const t=e.target;
  if(t.id==='fh-filter'){filter=t.value;return true;}
  if(t.id==='fh-kind'){kind=t.value;return true;}
  if(t.id==='fh-from'&&t.value){from=t.value;if(to<from)to=from;return true;}
  if(t.id==='fh-to'&&t.value&&t.value>=from){to=t.value;return true;}
  return false;}
 return {render,click,change};
})();
