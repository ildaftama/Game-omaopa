// Chat tim (owner 2026-11-24): satu grup untuk semua akun Forecast, titik hijau untuk yang sedang
// membuka web, bunyi "ting" untuk pesan baru, Master bisa hapus pesan.
// Owner 2026-11-25: pesan sendiri bisa DIEDIT dalam 10 menit (tanda "diedit") dan DITARIK dalam 2 menit.
// Owner 2026-11-26: pengumuman System dari Master (forecast-notice.js) ikut tampil di sini dengan tautan ke tab.
window.ForecastChat=(()=>{
 'use strict';
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const ROLE={master:'Master',factory:'Factory Manager',spv:'SPV Logistik',forecaster:'Forecaster',analyst:'Data Analis',esbadmin:'Admin ESB',guest:'Tamu',super:'Admin Utama',admin:'Admin'};
 const UNSEND=120e3,EDIT=600e3,mmss=v=>{const t=Math.max(0,Math.ceil(v/1000));return Math.floor(t/60)+':'+String(t%60).padStart(2,'0');},ONLINE=150e3,ms=t=>t?.toMillis?.()??(typeof t==='number'?t:0);
 let notes=[],notesFirst=true,msgs=[],pres=[],open=false,stopM=null,stopP=null,first=true,unread=0,el=null,tick=null,cleaned=false,audio=null,editing=null,busy=false;
 const A=()=>window.ForecastChatAPI,me=()=>A()?.uid?.();
 const readKey=()=>'forecast-chat-read-'+me();
 const lastRead=()=>{try{return +localStorage.getItem(readKey())||0;}catch{return 0;}};
 const lastAt=()=>Math.max(msgs.length?ms(msgs.at(-1).at):0,notes.length?ms(notes.at(-1).at):0)||Date.now();
 const N=()=>window.ForecastNotice,rich=t=>N()?.rich?N().rich(t):esc(t);
 const markRead=()=>{const t=lastAt();try{localStorage.setItem(readKey(),String(t));}catch{}unread=0;badge();};
 function ting(){
  try{audio=audio||new (window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume();const t0=audio.currentTime;
   [[1318.5,0],[1760,.11]].forEach(([f,d])=>{const o=audio.createOscillator(),g=audio.createGain();o.type='sine';o.frequency.value=f;g.gain.setValueAtTime(0,t0+d);g.gain.linearRampToValueAtTime(.16,t0+d+.012);g.gain.exponentialRampToValueAtTime(.0001,t0+d+.32);o.connect(g).connect(audio.destination);o.start(t0+d);o.stop(t0+d+.34);});
  }catch{}
 }
 // Browser hanya mengizinkan suara setelah ada interaksi; siapkan audio pada klik pertama.
 window.addEventListener('pointerdown',()=>{try{audio=audio||new (window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume();}catch{}},{once:true,capture:true});
 const isOnline=p=>p.online!==false&&Date.now()-ms(p.at)<ONLINE;
 const ago=t=>{const m=Math.round((Date.now()-ms(t))/60e3);return m<1?'baru saja':m<60?m+' menit lalu':m<1440?Math.round(m/60)+' jam lalu':Math.round(m/1440)+' hari lalu';};
 const hhmm=t=>new Date(ms(t)).toLocaleTimeString('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit'});
 const dayLabel=t=>{const f=d=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta'}).format(d),d=f(new Date(ms(t))),now=f(new Date()),y=f(new Date(Date.now()-864e5));return d===now?'Hari ini':d===y?'Kemarin':new Date(ms(t)).toLocaleDateString('id-ID',{timeZone:'Asia/Jakarta',weekday:'long',day:'numeric',month:'long'});};
 function badge(){const b=el?.querySelector('.fc-badge');if(!b)return;b.textContent=unread>99?'99+':String(unread);b.hidden=!unread;el.querySelector('.fc-btn').setAttribute('aria-label',unread?`Chat tim, ${unread} pesan baru`:'Chat tim');}
 function people(){
  const list=pres.slice().sort((a,b)=>isOnline(b)-isOnline(a)||ms(b.at)-ms(a.at)).filter(p=>isOnline(p)||Date.now()-ms(p.at)<30*864e5);
  const on=list.filter(isOnline).length;
  return `<div class="fc-people"><span class="fc-count">${on} online</span>${list.map(p=>`<span class="fc-person ${isOnline(p)?'on':''}" title="${esc(isOnline(p)?'Sedang membuka web':'Terakhir '+ago(p.at))}"><i></i>${esc(p.name)}${p.uid===me()?' (Anda)':''}<small>${esc(ROLE[p.role]||'')}</small></span>`).join('')}</div>`;
 }
 function sysMsg(n,master){
  const lab=N()?.linkLabel?.(n.link);
  return `<div class="fc-sys"><div class="fc-sys-head"><b>System</b><span>Pengumuman</span><time>${hhmm(n.at)}</time>${master?`<button type="button" data-fc-ndel="${esc(n.id)}">Hapus</button>`:''}</div>${n.title?`<strong>${esc(n.title)}</strong>`:''}<p>${rich(n.text)}</p>${lab?`<button type="button" class="fc-go" data-fn-go="${esc(n.link)}">Buka ${esc(lab)} →</button>`:''}</div>`;
 }
 function list(){
  if(!msgs.length&&!notes.length)return '<p class="fc-empty">Belum ada pesan. Sapa tim di sini.</p>';
  const master=A()?.isMaster?.(),now=Date.now();let day='',out='';
  const all=msgs.map(m=>({m})).concat(notes.map(n=>({n}))).sort((a,b)=>ms((a.m||a.n).at)-ms((b.m||b.n).at));
  for(const x of all){const m=x.m||x.n,d=dayLabel(m.at);if(d!==day){day=d;out+=`<div class="fc-day">${esc(d)}</div>`;}
   if(x.n){out+=sysMsg(x.n,master);continue;}
   const mine=m.uid===me(),age=now-ms(m.at),left=UNSEND-age,eLeft=EDIT-age,pr=pres.find(p=>p.uid===m.uid),role=ROLE[pr?.role]||'',ed=editing===m.id;
   const act=(mine&&eLeft>0&&!ed?`<button type="button" class="fc-edit" data-fc-edit="${esc(m.id)}" title="Bisa diedit sampai 10 menit setelah dikirim">Edit (${mmss(eLeft)})</button>`:'')
    +(mine&&left>0?`<button type="button" data-fc-unsend="${esc(m.id)}" title="Bisa ditarik sampai 2 menit setelah dikirim">Tarik (${mmss(left)})</button>`:master?`<button type="button" data-fc-del="${esc(m.id)}">Hapus</button>`:'');
   const body=ed?`<div class="fc-editbox"><textarea data-fc-edit-text maxlength="1000" aria-label="Edit pesan">${esc(m.text)}</textarea><div><button type="button" data-fc-save="${esc(m.id)}" ${eLeft>0&&!busy?'':'disabled'}>${busy?'Menyimpan…':'Simpan'}</button><button type="button" data-fc-cancel>Batal</button><span>${eLeft>0?`sisa waktu edit ${mmss(eLeft)} · Enter simpan, Esc batal`:'Waktu edit 10 menit sudah habis.'}</span></div></div>`:`<p>${rich(m.text)}</p>`;
   out+=`<div class="fc-msg ${mine?'mine':''}"><div class="fc-meta"><b>${esc(mine?'Anda':m.name)}</b>${role&&!mine?`<span>${esc(role)}</span>`:''}<time>${hhmm(m.at)}</time>${m.editedAt?'<em>(diedit)</em>':''}${act}</div>${body}</div>`;}
  return out;
 }
 function paint(keepScroll){
  if(!el)return;const box=el.querySelector('.fc-list'),atBottom=!box||box.scrollHeight-box.scrollTop-box.clientHeight<40;
  const old=box?.querySelector('[data-fc-edit-text]'),keep=old?{v:old.value,a:old.selectionStart,b:old.selectionEnd,f:document.activeElement===old,h:old.style.height}:null,st=box?.scrollTop;
  el.querySelector('.fc-people-wrap').innerHTML=people();box.innerHTML=list();
  const ne=box.querySelector('[data-fc-edit-text]');if(ne&&keep){ne.value=keep.v;ne.style.height=keep.h;if(keep.f){ne.focus({preventScroll:true});try{ne.setSelectionRange(keep.a,keep.b);}catch{}}}
  if(editing){box.scrollTop=st;return;}
  if(!keepScroll||atBottom)box.scrollTop=box.scrollHeight;
 }
 function mount(){
  el=document.createElement('div');el.className='fc';el.innerHTML=`<button type="button" class="fc-btn" aria-label="Chat tim" aria-expanded="false"><span aria-hidden="true">💬</span><b class="fc-badge" hidden>0</b></button><section class="fc-panel" role="dialog" aria-label="Chat tim" hidden><header><div><h2>Chat tim</h2><span>Bisa dibaca semua akun Forecast</span></div><div class="fc-head-acts">${A()?.isMaster?.()&&window.ForecastNotice?'<button type="button" class="fc-sysbtn" title="Kirim pengumuman atas nama System, bisa dengan tautan ke tab">📣 Pesan System</button>':''}<button type="button" class="fc-close" aria-label="Tutup chat">✕</button></div></header><div class="fc-people-wrap"></div><div class="fc-list" aria-live="polite"></div><form class="fc-form"><textarea rows="1" maxlength="1000" placeholder="Tulis pesan… (Enter kirim, Shift+Enter baris baru)" aria-label="Pesan"></textarea><button type="submit">Kirim</button></form><p class="fc-err" role="status"></p></section>`;
  document.body.appendChild(el);
  const panel=el.querySelector('.fc-panel'),btn=el.querySelector('.fc-btn'),ta=el.querySelector('textarea'),err=el.querySelector('.fc-err');
  const setOpen=v=>{open=v;panel.hidden=!v;btn.setAttribute('aria-expanded',String(v));clearInterval(tick);if(v){markRead();paint();tick=setInterval(()=>{if(editing||msgs.some(m=>m.uid===me()&&Date.now()-ms(m.at)<EDIT+1500))paint(true);else el.querySelector('.fc-people-wrap').innerHTML=people();},1000);setTimeout(()=>ta.focus(),0);}else btn.focus();};
  btn.addEventListener('click',()=>setOpen(!open));
  el.querySelector('.fc-close').addEventListener('click',()=>setOpen(false));
  el.querySelector('.fc-sysbtn')?.addEventListener('click',()=>N()?.compose?.({chat:true,notif:true}));
  panel.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();setOpen(false);}});
  ta.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();el.querySelector('.fc-form').requestSubmit();}});
  ta.addEventListener('input',()=>{ta.style.height='auto';ta.style.height=Math.min(120,ta.scrollHeight)+'px';});
  el.querySelector('.fc-form').addEventListener('submit',async e=>{e.preventDefault();const t=ta.value.trim();if(!t)return;err.textContent='';ta.value='';ta.style.height='auto';try{await A().send(t);}catch{ta.value=t;err.textContent='Pesan belum terkirim. Periksa koneksi lalu coba lagi.';}});
  const listEl=el.querySelector('.fc-list');
  const startEdit=id=>{editing=id;busy=false;err.textContent='';paint(true);const t=listEl.querySelector('[data-fc-edit-text]');if(t){t.focus();t.setSelectionRange(t.value.length,t.value.length);t.style.height=Math.min(160,t.scrollHeight+2)+'px';}};
  const stopEdit=()=>{editing=null;busy=false;paint(true);ta.focus();};
  async function saveEdit(){
   const id=editing,t=listEl.querySelector('[data-fc-edit-text]'),m=msgs.find(x=>x.id===id);if(!id||!t||!m||busy)return;
   const v=t.value.trim();if(!v){err.textContent='Pesan tidak boleh kosong. Pakai Tarik untuk membatalkan kirim.';return;}
   if(v===m.text){stopEdit();return;}
   if(Date.now()-ms(m.at)>=EDIT){err.textContent='Waktu edit 10 menit sudah habis.';return;}
   busy=true;paint(true);try{await A().edit(id,v);err.textContent='';stopEdit();}catch{busy=false;paint(true);err.textContent='Pesan belum terubah. Waktu edit (10 menit) mungkin sudah lewat, atau koneksi terputus.';}
  }
  listEl.addEventListener('click',async e=>{
   const go=e.target.closest('[data-fn-go]');if(go){setOpen(false);N()?.goTo?.(go.dataset.fnGo);return;}
   const nd=e.target.closest('[data-fc-ndel]');if(nd){if(!confirm('Hapus pengumuman ini? Pengumuman hilang dari chat dan notifikasi semua akun.'))return;try{await window.ForecastNoticeAPI.remove(nd.dataset.fcNdel);}catch{err.textContent='Pengumuman belum terhapus.';}return;}
   const ed=e.target.closest('[data-fc-edit]');if(ed){startEdit(ed.dataset.fcEdit);return;}
   if(e.target.closest('[data-fc-save]')){saveEdit();return;}
   if(e.target.closest('[data-fc-cancel]')){stopEdit();return;}
   const u=e.target.closest('[data-fc-unsend]'),d=e.target.closest('[data-fc-del]');if(!u&&!d)return;if(d&&!confirm('Hapus pesan ini untuk semua orang?'))return;
   const id=(u||d).dataset[u?'fcUnsend':'fcDel'];try{await A().remove(id);if(editing===id)editing=null;}catch{err.textContent=u?'Waktu tarik pesan (2 menit) sudah lewat.':'Pesan belum terhapus.';}});
  listEl.addEventListener('keydown',e=>{if(!e.target.matches('[data-fc-edit-text]'))return;
   if(e.key==='Escape'){e.preventDefault();e.stopPropagation();stopEdit();}
   else if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();saveEdit();}});
  listEl.addEventListener('input',e=>{if(e.target.matches('[data-fc-edit-text]')){const t=e.target;t.style.height='auto';t.style.height=Math.min(160,t.scrollHeight+2)+'px';}});
 }
 function start(){
  if(stopM||!A()||!window.ForecastAuth)return;mount();
  stopM=A().listen(list=>{if(list==null){if(el)el.querySelector('.fc-err').textContent='Chat belum tersambung. Aturan Firestore chat mungkin belum dipublikasikan.';return;}
   const prev=new Set(msgs.map(m=>m.id)),fresh=list.filter(m=>!prev.has(m.id)&&m.uid!==me());msgs=list;if(editing&&!msgs.some(m=>m.id===editing)){editing=null;busy=false;}
   if(first){first=false;const lr=lastRead();unread+=msgs.filter(m=>m.uid!==me()&&ms(m.at)>lr).length;}
   else if(fresh.length){ting();if(open&&!document.hidden)markRead();else unread+=fresh.length;}
   badge();if(open)paint(true);
   if(!cleaned&&A().isMaster?.()){cleaned=true;A().cleanup?.().catch(()=>{});}
  });
  stopP=A().listenPresence(list=>{if(list){pres=list;if(open)el.querySelector('.fc-people-wrap').innerHTML=people();}});
  const onNotes=all=>{const list=(all||[]).filter(n=>n.chat),prev=new Set(notes.map(n=>n.id)),fresh=list.filter(n=>!prev.has(n.id)&&n.by!==me());notes=list;
   if(notesFirst){notesFirst=false;const lr=lastRead();unread+=notes.filter(n=>n.by!==me()&&ms(n.at)>lr).length;}
   else if(fresh.length){ting();if(open&&!document.hidden)markRead();else unread+=fresh.length;}
   badge();if(open)paint(true);};
  window.addEventListener('forecast-notice',e=>onNotes(e.detail?.items));
  if(N()?.items?.().length)onNotes(N().items());
  document.addEventListener('visibilitychange',()=>{if(open&&!document.hidden)markRead();});
 }
 const wait=setInterval(()=>{if(window.ForecastChatAPI&&window.ForecastAuth&&!document.getElementById('forecast-app')?.hidden){clearInterval(wait);start();}},1000);
 return {start};
})();
