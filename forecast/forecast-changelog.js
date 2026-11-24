// Log perubahan (owner 2026-11-24): perubahan rencana setelah hari H, hapus/pulihkan rencana, dan
// perubahan pengaturan. Dikelompokkan per hari agar mudah dibaca; rincian outlet dibuka saat diklik.
window.ForecastChangeLog=(()=>{
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const ROLE={master:'Master',factory:'Factory Manager',spv:'SPV Logistik',forecaster:'Forecaster',analyst:'Data Analis',esbadmin:'Admin ESB',guest:'Tamu',super:'Admin Utama',admin:'Admin'};
 const ms=t=>t?.toMillis?.()??0,wib=t=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta'}).format(new Date(ms(t)));
 const hm=t=>new Date(ms(t)).toLocaleTimeString('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit'});
 const dlabel=d=>new Date(d+'T12:00:00Z').toLocaleDateString('id-ID',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
 const short=d=>new Date(d+'T12:00:00Z').toLocaleDateString('id-ID',{day:'numeric',month:'short'});
 const oname=id=>id==='pabrik'?'Pesanan pabrik':window.OUTLET_INTELLIGENCE?.outlets?.[id]?.name||id;
 let rows=null,stop=null,open=new Set(),cleaned=false;
 const rerender=()=>window.dispatchEvent(new Event('forecast-settings-render'));
 function ensure(){if(stop||!window.ForecastLogAPI)return;stop=window.ForecastLogAPI.listen(r=>{rows=r;rerender();if(!cleaned){cleaned=true;window.ForecastLogAPI.cleanup?.().catch(()=>{});}});}
 const who=e=>`${esc(e.byName||'Akun tim')}${ROLE[e.role]?` <small>${esc(ROLE[e.role])}</small>`:''}`;
 function groups(list){
  // Satu baris per orang + jenis + tanggal rencana; perubahan pengaturan berdiri sendiri.
  const out=[],map=new Map();
  for(const e of list){
   const t=e.type==='plan'||e.type==='delete'||e.type==='restore'?e.type:'settings',k=t==='settings'?e.id:`${t}|${e.by}|${e.date}`;
   let g=map.get(k);if(!g){g={key:k,type:t,by:e,date:e.date,items:[],first:ms(e.at),last:ms(e.at)};map.set(k,g);out.push(g);}
   g.items.push(e);g.first=Math.min(g.first,ms(e.at));g.last=Math.max(g.last,ms(e.at));
  }
  return out;
 }
 function line(g){
  const outlets=new Set(g.items.map(e=>e.outlet).filter(Boolean)),span=g.first===g.last?hm({toMillis:()=>g.first}):`${hm({toMillis:()=>g.first})}–${hm({toMillis:()=>g.last})}`,on=open.has(g.key);
  const verb=g.type==='plan'?`mengubah rencana kirim ${esc(short(g.date))} · ${outlets.size} outlet`:g.type==='delete'?`menghapus rencana ${esc(short(g.date))} · ${outlets.size} outlet`:g.type==='restore'?`memulihkan rencana ${esc(short(g.date))} · ${outlets.size} outlet`:esc(g.items[0].summary||'Mengubah pengaturan');
  const detail=g.type==='settings'?(g.items[0].changes||[]).map(c=>`<li>${esc(c)}</li>`).join('')||'<li>Tidak ada rincian.</li>'
   :g.items.slice().sort((a,b)=>ms(a.at)-ms(b.at)).map(e=>`<li><b>${esc(oname(e.outlet))}</b> <time>${hm(e.at)}</time>${e.type==='plan'?(e.changes||[]).length?`<span>${(e.changes||[]).map(esc).join(' · ')}</span>`:`<span>${esc(e.summary||'')}</span>`:`<span>Alasan: ${esc(e.reason||'-')}</span>`}</li>`).join('');
  const tone=g.type==='delete'?'del':g.type==='settings'?'set':'plan';
  return `<li class="cl-row ${tone}"><button type="button" data-cl-open="${esc(g.key)}" aria-expanded="${on}"><span class="cl-who">${who(g.by)}</span><span class="cl-what">${verb}</span><time>${span}</time><span aria-hidden="true">${on?'▾':'▸'}</span></button>${on?`<ul class="cl-detail">${detail}</ul>`:''}</li>`;
 }
 function render(){
  ensure();
  if(rows==null)return '<article class="workspace-card"><p class="fs-use">Memuat log… Kalau tidak muncul, aturan Firestore untuk log mungkin belum dipublikasikan.</p></article>';
  const byDay=new Map();for(const e of rows.slice().sort((a,b)=>ms(b.at)-ms(a.at))){const d=wib(e.at);if(!byDay.has(d))byDay.set(d,[]);byDay.get(d).push(e);}
  const days=[...byDay.entries()].map(([d,list])=>{const g=groups(list);return `<article class="workspace-card cl-day"><h3 class="fs-h3">${esc(dlabel(d))} <small>${list.length} catatan</small></h3><ul class="cl-list">${g.map(line).join('')}</ul></article>`;}).join('');
  return `<div id="cl-root"><p class="fs-use">Perubahan rencana setelah hari H, hapus/pulihkan rencana, dan perubahan pengaturan. Disimpan 90 hari. Klik baris untuk melihat rinciannya.</p>${days||'<article class="workspace-card"><p class="fs-use">Belum ada catatan.</p></article>'}</div>`;
 }
 function click(e){const b=e.target.closest('[data-cl-open]');if(!b)return false;const k=b.dataset.clOpen;open.has(k)?open.delete(k):open.add(k);rerender();return true;}
 return {render,click};
})();
