'use strict';
// Riwayat & log forecast (owner 2026-11-10): siapa menyimpan / menghapus / memulihkan rencana,
// kapan, dan alasannya -- supaya manajer bisa memantau dan akurasi tidak dimanipulasi diam-diam.
//
// Ditampilkan PER SESI, bukan per outlet (revisi owner): sekali simpan 28 outlet pukul 11.00 =
// satu baris "10 Nov 11.00 · menyimpan 28 rencana"; diklik baru muncul rincian outletnya. Simpan
// lagi pukul 11.10 = baris baru. Sesi = aksi yang sama, oleh orang yang sama (dan alasan sama untuk
// hapus/pulihkan), berjarak tidak lebih dari 5 menit dari aktivitas sebelumnya di sesi itu.
//
// Sumber: semua versi tiap rencana (subkoleksi revisions, dimuat sekali per versi terakhir lalu
// disimpan di memori) + forecastPlanLog (hapus/pulihkan, permanen).
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
 const pcsOf=p=>sum(p?.regular)+sum(p?.orders);
 const GAP=5*60*1000;
 let from=model.shift(today(),-6),to=model.shift(today(),1),filter='__all__',kind='all';
 const openGroups=new Set(),openPlans=new Set(),revs=new Map();let inflight=0;const queue=[];
 const who=(uid,byName)=>{if(byName)return byName;const n=cloud().staffName?.(uid);return n==null?'…':n||'Akun staf';};
 const rerender=()=>window.dispatchEvent(new Event('forecast-operations-changed'));
 // Semua versi satu rencana; dimuat ulang hanya kalau versi terakhirnya berubah.
 function pump(){while(inflight<6&&queue.length){const r=queue.shift();inflight++;cloud().getRevisions(r.key).then(list=>{revs.set(r.key,{rev:r.revision,list});}).catch(()=>{revs.set(r.key,{rev:r.revision,list:null,error:true});}).finally(()=>{inflight--;pump();if(!inflight&&!queue.length)rerender();});}}
 function ensure(recs){for(const r of recs){const c=revs.get(r.key);if(c&&(c.rev===r.revision||c.loading))continue;revs.set(r.key,{rev:r.revision,loading:true,list:c?.list||null});queue.push(r);}pump();}
 const inRange=x=>x.date>=from&&x.date<=to&&(filter==='__all__'||x.outlet===filter);
 function events(){
  const C=cloud(),ev=[],recs=(C.allRecords||[]).filter(inRange);ensure(recs);
  for(const r of recs){
   const list=revs.get(r.key)?.list;
   if(list?.length){list.forEach((v,i)=>ev.push({type:v.revision===1?'create':'save',at:v.savedAt,key:r.key,date:r.date,outlet:r.outlet,revision:v.revision,pcs:pcsOf(v.plan),diff:i?pcsOf(v.plan)-pcsOf(list[i-1].plan):null,by:v.savedBy,byName:''}));}
   else{ // sementara versi lengkap belum termuat
    if(r.revision>1)ev.push({type:'create',at:r.firstSavedAt,key:r.key,date:r.date,outlet:r.outlet,revision:1,pcs:pcsOf(r.baseline),by:r.revision===1?r.savedBy:null,byName:r.revision===1?'':'—'});
    ev.push({type:r.revision>1?'save':'create',at:r.savedAt,key:r.key,date:r.date,outlet:r.outlet,revision:r.revision,pcs:pcsOf(r.plan),by:r.savedBy,byName:''});
   }
  }
  for(const e of C.log||[])if(inRange(e))ev.push({id:e.id,type:e.action,at:e.at,key:e.key,date:e.date,outlet:e.outlet,revision:e.revision,pcs:sum(e.regular)+sum(e.orders),by:e.by,byName:e.byName,reason:e.reason,late:e.action==='delete'&&(wib(e.at)||'')>=e.date});
  return ev.sort((a,b)=>ms(b.at)-ms(a.at));
 }
 const cls=t=>t==='create'||t==='save'?'save':t;
 function sessions(ev){
  const out=[];
  for(const e of ev){
   const g=out.at(-1),actor=e.by||e.byName;
   if(g&&g.cls===cls(e.type)&&g.actor===actor&&(g.reason||'')===(e.reason||'')&&wib(g.items.at(-1).at)===wib(e.at)&&ms(g.items.at(-1).at)-ms(e.at)<=GAP)g.items.push(e);
   else out.push({cls:cls(e.type),actor,by:e.by,byName:e.byName,reason:e.reason,items:[e]});
  }
  for(const g of out){g.start=g.items.at(-1).at;g.end=g.items[0].at;g.id=g.cls+'|'+g.actor+'|'+ms(g.start);g.late=g.items.filter(e=>e.late).length;}
  return out.filter(g=>kind==='all'||(kind==='save'?g.cls==='save':g.cls!=='save'));
 }
 function versions(key){
  const st=revs.get(key);
  if(!st?.list)return `<tr class="fh-vrow"><td colspan="6"><p class="fp-caption">${st?.error?'Versi rencana belum bisa dimuat.':'Memuat semua versi…'}</p></td></tr>`;
  const rows=st.list.map((v,i)=>{const prev=st.list[i-1],d=prev?pcsOf(v.plan)-pcsOf(prev.plan):null;
   const changed=prev?model.names.map((n,p)=>[n,(prev.plan.regular[p]+prev.plan.orders[p]),(v.plan.regular[p]+v.plan.orders[p])]).filter(([,a,b])=>a!==b).map(([n,a,b])=>`${n} ${a}→${b}`):[];
   return `<tr><td><b>v${v.revision}</b>${i===0?'<small>versi awal · dipakai akurasi</small>':''}</td><td>${full(v.savedAt)}</td><td>${esc(who(v.savedBy))}</td><td>${nf(sum(v.plan.regular))} / ${nf(sum(v.plan.orders))}</td><td class="${d==null?'':d>0?'fh-up':d<0?'fh-down':''}">${d==null?'—':(d>0?'+':'')+nf(d)}</td><td class="fh-wrap">${changed.length?esc(changed.slice(0,6).join(', '))+(changed.length>6?` +${changed.length-6} lagi`:''):i===0?'—':'Hanya catatan/produk lain'}${v.plan.note?`<small>“${esc(v.plan.note)}”</small>`:''}</td></tr>`;}).join('');
  return `<tr class="fh-vrow"><td colspan="6"><div class="fh-versions"><table class="fp-table"><thead><tr><th>Versi</th><th>Waktu</th><th>Oleh</th><th>Reguler / pesanan</th><th>Selisih</th><th>Yang berubah</th></tr></thead><tbody>${rows}</tbody></table></div></td></tr>`;
 }
 const VERB={save:'menyimpan',delete:'menghapus',restore:'memulihkan'},PILL={save:['Simpan','save'],delete:['Hapus','del'],restore:['Pulihkan','restore']};
 function sessionRow(g){
  const n=g.items.length,created=g.items.filter(e=>e.type==='create').length,dates=[...new Set(g.items.map(e=>e.date))].sort(),pcs=g.items.reduce((s,e)=>s+e.pcs,0),open=openGroups.has(g.id);
  const span=time(g.start)===time(g.end)?time(g.start):`${time(g.start)}–${time(g.end)}`;
  const what=g.cls==='save'?(created===n?`${n} rencana baru`:created?`${n} rencana (${created} baru, ${n-created} diubah)`:`${n} rencana (diubah)`):`${n} rencana`;
  const dlabel=dates.length===1?short(dates[0]):`${short(dates[0])}–${short(dates.at(-1))}`;
  const [pl,pc]=PILL[g.cls];
  const detail=open?`<div class="fh-detail"><table class="fp-table"><thead><tr><th>Outlet</th><th>Tanggal rencana</th><th>Versi</th><th>Total PCS</th><th>${g.cls==='save'?'Selisih dari versi sebelumnya':'Status sekarang'}</th><th></th></tr></thead><tbody>${g.items.slice().sort((a,b)=>name(a.outlet).localeCompare(name(b.outlet))||a.date.localeCompare(b.date)).map(e=>{const rec=cloud().allRecords.find(r=>r.key===e.key),still=e.type==='delete'&&rec?.deleted?.logId===e.id,pk=e.key+'@'+g.id;
    const last=g.cls==='save'?(e.diff==null?(e.type==='create'?'baru':'—'):`<span class="${e.diff>0?'fh-up':e.diff<0?'fh-down':''}">${e.diff>0?'+':''}${nf(e.diff)}</span>`):still?(cloud().canManage?`<button type="button" class="fh-link fh-restore" data-fp-restore="${esc(e.key)}">Pulihkan</button>`:'Masih dihapus'):e.type==='delete'?'Sudah dipulihkan / dibuat ulang':'Aktif';
    return `<tr class="${e.late?'fh-late-row':''}"><td>${esc(name(e.outlet))}${e.late?'<small class="fh-down">setelah hari H</small>':''}</td><td>${short(e.date)}</td><td>v${e.revision}</td><td>${nf(e.pcs)}</td><td>${last}</td><td><button type="button" class="fh-link" data-fh-plan="${esc(pk)}">${openPlans.has(pk)?'Tutup versi':'Semua versi'}</button></td></tr>${openPlans.has(pk)?versions(e.key):''}`;}).join('')}</tbody></table></div>`:'';
  return `<li class="fh-item ${g.late?'late':''} ${open?'open':''}"><button type="button" class="fh-row" data-fh-group="${esc(g.id)}" aria-expanded="${open}"><span class="fh-time">${span}</span><span class="fh-pill ${pc}">${pl}</span><span class="fh-body"><span><b>${esc(who(g.by,g.byName))}</b> ${VERB[g.cls]} <b>${what}</b> untuk ${dlabel} <span class="fh-muted">· ${nf(pcs)} pcs</span></span>${g.reason?`<span class="fh-reason">Alasan: “${esc(g.reason)}”</span>`:''}${g.late?`<span class="fh-late">${g.late} dihapus pada/ setelah hari H. Hasil penjualan mungkin sudah terlihat saat dihapus.</span>`:''}</span><span class="fh-caret">${open?'▾':'▸'}</span></button>${detail}</li>`;
 }
 function render(){
  cloud().watch?.(from,to);
  const all=sessions(events()),k=kind;kind='all';const base=sessions(events());kind=k;
  const tiles=[['Sesi simpan',base.filter(g=>g.cls==='save').length,`${base.filter(g=>g.cls==='save').reduce((s,g)=>s+g.items.length,0)} rencana`],['Sesi hapus',base.filter(g=>g.cls==='delete').length,`${base.filter(g=>g.cls==='delete').reduce((s,g)=>s+g.items.length,0)} rencana`]];
  const late=base.reduce((s,g)=>s+g.late,0),restored=base.filter(g=>g.cls==='restore').reduce((s,g)=>s+g.items.length,0);
  const days=new Map();for(const g of all){const d=wib(g.end)||'—';if(!days.has(d))days.set(d,[]);days.get(d).push(g);}
  const loading=[...revs.values()].some(c=>c.loading);
  return `<div class="fp-controls"><label>Outlet<select id="fh-filter">${options(filter)}</select></label><label>Rencana dari tanggal<input id="fh-from" type="date" value="${from}"></label><label>Sampai tanggal<input id="fh-to" type="date" value="${to}" min="${from}"></label><label>Jenis aktivitas<select id="fh-kind"><option value="all" ${kind==='all'?'selected':''}>Semua aktivitas</option><option value="save" ${kind==='save'?'selected':''}>Simpan & ubah</option><option value="del" ${kind==='del'?'selected':''}>Hapus & pulihkan</option></select></label></div>
   <div class="fh-tiles">${tiles.map(([a,b,c])=>`<div><span>${a}</span><strong>${b}</strong><small>${c}</small></div>`).join('')}<div class="${late?'warn':''}"><span>Dihapus setelah hari H</span><strong>${late}</strong><small>${late?'perlu dicek manajer':'aman'}</small></div><div><span>Dipulihkan</span><strong>${restored}</strong><small>rencana</small></div></div>
   <p class="fp-caption">Satu baris = satu sesi (misalnya sekali klik simpan untuk banyak outlet). Klik barisnya untuk melihat rincian per outlet, lalu <b>Semua versi</b> untuk melihat perubahan angka. Rentang tanggal = tanggal <b>rencana</b>. Catatan hapus/pulihkan permanen dan tidak bisa diubah siapa pun.${loading?' <span class="fh-muted">Memuat riwayat versi…</span>':''}</p>
   ${all.length?`<div class="fh-list">${[...days].map(([d,gs])=>`<section class="fh-day"><h3>${d==='—'?'Waktu belum tercatat':dayLabel(d)}</h3><ul>${gs.map(sessionRow).join('')}</ul></section>`).join('')}</div>`:`<div class="fp-empty"><h3>Belum ada aktivitas</h3><p>${cloud().state==='ready'?'Tidak ada rencana yang disimpan, diubah atau dihapus pada rentang ini.':'Masuk akun staf untuk melihat riwayat tim.'}</p></div>`}`;
 }
 function options(value){const ids=[...(window.PcsPanels?.data?.()?.sales?.outletIds||[])].sort((a,b)=>name(a).localeCompare(name(b)));return '<option value="__all__">Semua outlet</option>'+ids.map(id=>`<option value="${id}" ${value===id?'selected':''}>${esc(name(id))}</option>`).join('');}
 function click(e){
  const pl=e.target.closest('[data-fh-plan]');if(pl){const k=pl.dataset.fhPlan;openPlans.has(k)?openPlans.delete(k):openPlans.add(k);return true;}
  const g=e.target.closest('[data-fh-group]');if(g){const k=g.dataset.fhGroup;openGroups.has(k)?openGroups.delete(k):openGroups.add(k);return true;}
  return false;
 }
 function change(e){const t=e.target;
  if(t.id==='fh-filter'){filter=t.value;return true;}
  if(t.id==='fh-kind'){kind=t.value;return true;}
  if(t.id==='fh-from'&&t.value){from=t.value;if(to<from)to=from;return true;}
  if(t.id==='fh-to'&&t.value&&t.value>=from){to=t.value;return true;}
  return false;}
 return {render,click,change};
})();
