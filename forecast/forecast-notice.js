// Pengumuman System & notifikasi (owner 2026-11-26).
// Master menulis pengumuman atas nama "System": bisa tampil di chat tim, masuk lonceng notifikasi di
// kanan atas, atau keduanya. Pengumuman bisa membawa tautan ke tab web (mis. Rekomendasi transfer),
// dan alamat http(s) di dalam teks otomatis menjadi tautan yang terbuka di tab browser baru.
window.ForecastNotice=(()=>{
 'use strict';
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const ms=t=>t?.toMillis?.()??(typeof t==='number'?t:0);
 // Tautan ke tab web. Nilai disimpan di pengumuman (maks 30 karakter), label tampil ke pembaca.
 const LINKS=[
  ['','Tanpa tautan'],['dashboard','Dashboard'],['wastelost','Waste & Lost Sales'],
  ['stock','Stok & Transfer · Stok'],['stock:transfer','Stok & Transfer · Rekomendasi transfer'],
  ['forecast','Forecast'],['guide','Update Metode Forecast'],['office','Kantor Agen AI'],
  ['perf','Performa Forecaster'],['settings','Pengaturan'],
 ];
 const linkLabel=k=>(LINKS.find(l=>l[0]===k)||[])[1]||'';
 const shortLabel=k=>linkLabel(k).split(' · ').pop();
 // Teks aman (sudah di-escape) dengan alamat web dijadikan tautan.
 const rich=t=>esc(t).replace(/\bhttps?:\/\/[^\s<]+[^\s<.,;:!?)\]'"]/g,u=>`<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`);
 const A=()=>window.ForecastNoticeAPI,me=()=>A()?.uid?.();
 let items=[],first=true,el=null,open=false,seenBefore=0,toastT=null,audio=null,cleaned=false;
 const readKey=()=>'forecast-notice-read-'+me();
 const lastRead=()=>{try{return +localStorage.getItem(readKey())||0;}catch{return 0;}};
 const setRead=t=>{try{localStorage.setItem(readKey(),String(t));}catch{}};
 const notifs=()=>items.filter(n=>n.notif);
 const unread=()=>{const lr=lastRead();return notifs().filter(n=>ms(n.at)>lr&&n.by!==me()).length;};
 const ago=t=>{const m=Math.round((Date.now()-ms(t))/60e3);return m<1?'baru saja':m<60?m+' menit lalu':m<1440?Math.round(m/60)+' jam lalu':Math.round(m/1440)+' hari lalu';};
 function ting(){
  try{audio=audio||new (window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume();const t0=audio.currentTime;
   [[987.8,0],[1318.5,.12],[1760,.24]].forEach(([f,d])=>{const o=audio.createOscillator(),g=audio.createGain();o.type='sine';o.frequency.value=f;g.gain.setValueAtTime(0,t0+d);g.gain.linearRampToValueAtTime(.14,t0+d+.012);g.gain.exponentialRampToValueAtTime(.0001,t0+d+.3);o.connect(g).connect(audio.destination);o.start(t0+d);o.stop(t0+d+.32);});
  }catch{}
 }
 window.addEventListener('pointerdown',()=>{try{audio=audio||new (window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume();}catch{}},{once:true,capture:true});

 // Pindah ke tab yang ditautkan. Mengembalikan false bila tab itu tidak tersedia untuk akun ini.
 function goTo(link){
  const [f,sub]=String(link||'').split(':');if(!f)return false;
  const b=f==='settings'?document.getElementById('sources-open'):document.querySelector(`.focus-tabs [data-focus="${CSS.escape(f)}"]`);
  if(!b||b.hidden||b.offsetParent===null){alert(`Tab "${linkLabel(link)||f}" tidak tersedia untuk akun Anda.`);return false;}
  if(f==='stock')window.ForecastStock?.setView?.(sub==='transfer'?'transfer':'stok');
  b.click();
  setTimeout(()=>document.querySelector('.workspace-heading')?.scrollIntoView({behavior:'smooth',block:'start'}),30);
  return true;
 }
 const goBtn=(link,cls)=>link&&linkLabel(link)?`<button type="button" class="${cls}" data-fn-go="${esc(link)}">Buka ${esc(shortLabel(link))} →</button>`:'';

 // ---------- Lonceng di kanan atas ----------
 function badge(){
  if(!el)return;const n=unread(),b=el.querySelector('.fn-badge');b.textContent=n>99?'99+':String(n);b.hidden=!n;
  el.querySelector('.fn-btn').setAttribute('aria-label',n?`Notifikasi, ${n} belum dibaca`:'Notifikasi');
 }
 function panelHtml(){
  const list=notifs().slice().reverse(),master=A()?.isMaster?.();
  const head=`<header><h2>Notifikasi</h2>${master?'<button type="button" class="fn-new" data-fn-compose>+ Buat notifikasi</button>':''}</header>`;
  if(!list.length)return head+`<p class="fn-empty">Belum ada notifikasi.${master?' Kirim pengumuman pertama lewat tombol di atas.':''}</p>`;
  return head+`<ul class="fn-list">${list.map(n=>`<li class="${ms(n.at)>seenBefore&&n.by!==me()?'new':''}"><div class="fn-top"><b>${esc(n.title||'Update dari System')}</b><time title="${esc(new Date(ms(n.at)).toLocaleString('id-ID',{timeZone:'Asia/Jakarta'}))}">${ago(n.at)}</time></div><p>${rich(n.text)}</p><div class="fn-acts">${goBtn(n.link,'fn-go')}${master?`<button type="button" class="fn-del" data-fn-del="${esc(n.id)}">Hapus</button>`:''}</div></li>`).join('')}</ul><p class="fn-foot">Notifikasi disimpan 30 hari.</p>`;
 }
 function paint(){if(el&&open)el.querySelector('.fn-panel').innerHTML=panelHtml();badge();}
 function setOpen(v){
  open=v;const p=el.querySelector('.fn-panel'),btn=el.querySelector('.fn-btn');p.hidden=!v;btn.setAttribute('aria-expanded',String(v));
  if(v){seenBefore=lastRead();const last=notifs().at(-1);setRead(Math.max(Date.now(),last?ms(last.at):0));paint();hideToast();p.querySelector('button')?.focus({preventScroll:true});}else badge();
 }
 function mount(){
  if(el||!document.querySelector('.header-right'))return;
  el=document.createElement('div');el.className='fn';
  el.innerHTML=`<button type="button" class="fn-btn" aria-label="Notifikasi" aria-expanded="false" aria-haspopup="dialog"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 3a6 6 0 0 0-6 6v3.6l-1.6 2.7A1 1 0 0 0 5.3 17h13.4a1 1 0 0 0 .9-1.5L18 12.6V9a6 6 0 0 0-6-6Zm-2.4 15.5a2.5 2.5 0 0 0 4.8 0Z" fill="currentColor"/></svg><b class="fn-badge" hidden>0</b></button><section class="fn-panel" role="dialog" aria-label="Notifikasi" hidden></section>`;
  const anchor=document.querySelector('[data-account-open]')||document.querySelector('[data-forecast-signout]');
  anchor?anchor.before(el):document.querySelector('.header-right').prepend(el);
  el.querySelector('.fn-btn').addEventListener('click',e=>{e.stopPropagation();setOpen(!open);});
  el.querySelector('.fn-panel').addEventListener('click',async e=>{
   const go=e.target.closest('[data-fn-go]'),del=e.target.closest('[data-fn-del]');
   if(e.target.closest('[data-fn-compose]')){setOpen(false);compose({chat:false,notif:true});return;}
   if(go){setOpen(false);goTo(go.dataset.fnGo);return;}
   if(del){if(!confirm('Hapus pengumuman ini? Pengumuman hilang dari notifikasi dan chat semua akun.'))return;try{await A().remove(del.dataset.fnDel);}catch{alert('Pengumuman belum terhapus. Periksa koneksi lalu coba lagi.');}}
  });
  el.addEventListener('keydown',e=>{if(e.key==='Escape'&&open){e.preventDefault();setOpen(false);el.querySelector('.fn-btn').focus();}});
  document.addEventListener('click',e=>{if(open&&!el.contains(e.target))setOpen(false);});
  badge();
 }

 // ---------- Pemberitahuan singkat saat pengumuman baru masuk ----------
 function hideToast(){clearTimeout(toastT);document.querySelector('.fn-toast')?.remove();}
 function toast(n){
  hideToast();const t=document.createElement('div');t.className='fn-toast';t.setAttribute('role','status');
  t.innerHTML=`<div><small>🔔 Update dari System</small><b>${esc(n.title||'Pengumuman baru')}</b><p>${esc(n.text.length>140?n.text.slice(0,140)+'…':n.text)}</p><div class="fn-acts">${goBtn(n.link,'fn-go')}<button type="button" class="fn-more">Lihat</button></div></div><button type="button" class="fn-x" aria-label="Tutup">✕</button>`;
  document.body.appendChild(t);
  t.addEventListener('click',e=>{const go=e.target.closest('[data-fn-go]');if(go){hideToast();setRead(Math.max(lastRead(),ms(n.at)));badge();goTo(go.dataset.fnGo);}else if(e.target.closest('.fn-more')){hideToast();setOpen(true);}else if(e.target.closest('.fn-x'))hideToast();});
  toastT=setTimeout(hideToast,12e3);
 }

 // ---------- Form pengumuman (khusus Master) ----------
 function compose(def={chat:true,notif:true}){
  if(!A()?.isMaster?.())return;document.querySelector('.fn-modal')?.remove();const back=document.activeElement;
  const m=document.createElement('div');m.className='fn-modal';
  m.innerHTML=`<form class="fn-card" role="dialog" aria-modal="true" aria-labelledby="fn-title" action="javascript:void 0"><h3 id="fn-title">Kirim pengumuman System</h3><p class="fn-sub">Dikirim atas nama <b>System</b>, bukan nama Anda.</p>
<label><span>Judul <small>(opsional, tampil tebal)</small></span><input name="ntitle" maxlength="80" placeholder="mis. Update: Rekomendasi transfer"></label>
<label>Pesan<textarea name="ntext" maxlength="1000" rows="4" required placeholder="Tulis isi pengumuman. Alamat web (https://…) otomatis bisa diklik."></textarea><small class="fn-count">0/1000</small></label>
<label><span>Tautan ke tab <small>(pembaca tinggal klik untuk membuka tab ini)</small></span><select name="nlink">${LINKS.map(([k,v])=>`<option value="${esc(k)}">${esc(v)}</option>`).join('')}</select></label>
<fieldset><legend>Kirim ke</legend><label class="fn-check"><input type="checkbox" name="nchat" ${def.chat?'checked':''}> Chat tim <small>tampil sebagai pesan System</small></label><label class="fn-check"><input type="checkbox" name="nnotif" ${def.notif?'checked':''}> Notifikasi 🔔 <small>lonceng di kanan atas + pemberitahuan singkat</small></label></fieldset>
<div class="fn-prev-wrap"><span>Pratinjau</span><div class="fn-prev"></div></div>
<p class="fn-msg" role="status"></p><div class="fn-actions"><button type="button" class="button quiet" data-fn-close>Batal</button><button type="submit" class="button fp-primary">Kirim</button></div></form>`;
  document.body.appendChild(m);
  const f=m.querySelector('form'),msg=m.querySelector('.fn-msg'),close=()=>{m.remove();back?.focus?.();};
  const prev=()=>{const t=f.ntitle.value.trim(),x=f.ntext.value.trim(),l=f.nlink.value;f.querySelector('.fn-count').textContent=f.ntext.value.length+'/1000';
   m.querySelector('.fn-prev').innerHTML=`<div class="fc-sys"><div class="fc-sys-head"><b>System</b><span>Pengumuman</span></div>${t?`<strong>${esc(t)}</strong>`:''}<p>${x?rich(x):'<i>Isi pesan…</i>'}</p>${l?`<span class="fc-go">Buka ${esc(shortLabel(l))} →</span>`:''}</div>`;};
  f.addEventListener('input',prev);f.addEventListener('change',prev);prev();
  m.addEventListener('click',e=>{if(e.target===m||e.target.closest('[data-fn-close]'))close();});
  m.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close();}});
  f.addEventListener('submit',async e=>{e.preventDefault();
   const n={title:f.ntitle.value,text:f.ntext.value,link:f.nlink.value,chat:f.nchat.checked,notif:f.nnotif.checked};
   if(!n.text.trim()){msg.textContent='Pesan belum diisi.';f.ntext.focus();return;}
   if(!n.chat&&!n.notif){msg.textContent='Pilih minimal satu: Chat tim atau Notifikasi.';return;}
   const sb=f.querySelector('[type=submit]');sb.disabled=true;sb.textContent='Mengirim…';msg.textContent='';
   try{await A().send(n);close();}catch(err){sb.disabled=false;sb.textContent='Kirim';msg.textContent=err?.code==='permission-denied'?'Ditolak server. Aturan Firestore untuk pengumuman mungkin belum dipublikasikan.':'Pengumuman belum terkirim. Periksa koneksi lalu coba lagi.';}
  });
  setTimeout(()=>f.ntitle.focus(),0);
 }

 function start(){
  if(!A()||!window.ForecastAuth)return;mount();
  A().listen(list=>{
   if(list==null){window.dispatchEvent(new CustomEvent('forecast-notice',{detail:{items:[],error:true}}));return;}
   const prev=new Set(items.map(n=>n.id)),fresh=list.filter(n=>!prev.has(n.id)&&n.by!==me());items=list;
   if(!first){const nf=fresh.filter(n=>n.notif);if(nf.length){if(!fresh.some(n=>n.chat))ting();if(!open)toast(nf.at(-1));}}
   first=false;paint();
   window.dispatchEvent(new CustomEvent('forecast-notice',{detail:{items}}));
   if(!cleaned&&A().isMaster?.()){cleaned=true;A().cleanup?.().catch(()=>{});}
  });
 }
 const wait=setInterval(()=>{if(window.ForecastNoticeAPI&&window.ForecastAuth&&!document.getElementById('forecast-app')?.hidden){clearInterval(wait);start();}},1000);
 return {goTo,compose,rich,linkLabel:shortLabel,items:()=>items,LINKS};
})();
