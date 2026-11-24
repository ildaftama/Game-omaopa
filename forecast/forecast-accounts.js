// Akun & akses (owner 2026-11-24): khusus Master. Akun baru memakai ID + password dan peran dari
// forecastUsers/{uid}. Akun lama (nomor HP + PIN) tetap berjalan sampai login lama dimatikan.
window.ForecastAccounts=(()=>{
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const ROLES=['master','factory','spv','forecaster','analyst','esbadmin','guest'],STATUS={pending:'Menunggu persetujuan',active:'Aktif',disabled:'Nonaktif'};
 let users=null,stop=null,msg='',msgOk=true,busy=false;
 const api=()=>window.ForecastAccountsAPI,label=r=>window.ForecastRolePolicy?.ROLE_LABEL?.[r]||'Belum ada peran';
 const rerender=()=>window.dispatchEvent(new Event('forecast-settings-render'));
 const say=(m,ok=true)=>{msg=m;msgOk=ok;rerender();};
 function ensure(){if(stop||!api())return;stop=api().listen(list=>{users=list;rerender();});}
 const chars=()=>{const p=window.ForecastOfficeData?.people||[];return [['','Tanpa karakter'],['f1',p[0]?`Forecaster ${p[0]}`:'Karakter forecaster 1'],['f2',p[1]?`Forecaster ${p[1]}`:'Karakter forecaster 2']];};
 const roleSelect=(val,attr,dis='')=>`<select ${attr} ${dis}><option value="">Pilih peran</option>${ROLES.map(r=>`<option value="${r}" ${val===r?'selected':''}>${esc(label(r))}</option>`).join('')}</select>`;
 const charSelect=(val,attr,show,dis='')=>`<select ${attr} ${show?'':'hidden'} ${dis} aria-label="Karakter di Kantor">${chars().map(([k,l])=>`<option value="${k}" ${val===k?'selected':''}>${esc(l)}</option>`).join('')}</select>`;
 function row(u){
  const me=u.uid===api()?.me?.(),dis=me||busy?'disabled':'',st=u.status||'pending';
  const acts=me?'<span class="fa-me">Akun Anda</span>':st==='pending'?`<button type="button" class="button fp-primary" data-fa-approve ${dis}>Setujui</button><button type="button" class="button quiet" data-fa-reject ${dis}>Tolak</button>`:st==='active'?`<button type="button" class="button" data-fa-save ${dis}>Simpan</button><button type="button" class="button quiet" data-fa-disable ${dis}>Nonaktifkan</button>`:`<button type="button" class="button" data-fa-enable ${dis}>Aktifkan lagi</button><button type="button" class="button quiet" data-fa-delete ${dis}>Hapus</button>`;
  return `<div class="fa-row" data-fa-uid="${esc(u.uid)}"><div class="fa-who"><b>${esc(u.name||u.id)}</b><span>ID: ${esc(u.id)} · ${esc(STATUS[st]||st)}</span></div><div class="fa-ctl">${roleSelect(u.role||'','data-fa-role',dis)}${charSelect(u.char||'','data-fa-char',u.role==='forecaster',dis)}</div><div class="fa-acts">${acts}</div></div>`;
 }
 function group(title,list,empty){return `<article class="workspace-card fa-card"><h3 class="fs-h3">${title} <small>${list.length}</small></h3>${list.length?list.map(row).join(''):`<p class="fs-use">${empty}</p>`}</article>`;}
 function render(){
  ensure();
  const all=(users||[]).slice().sort((a,b)=>String(a.name||a.id).localeCompare(String(b.name||b.id))),by=s=>all.filter(u=>(u.status||'pending')===s);
  const create=`<article class="workspace-card fa-card"><h3 class="fs-h3">Buat akun baru</h3><p class="fs-use">Akun langsung aktif. Password awal diketik di sini; pemilik akun bisa menggantinya lewat tombol Akun saya di kanan atas. Orang lain juga bisa daftar sendiri dari halaman login, lalu muncul di "Menunggu persetujuan".</p><div class="fa-new"><label>ID<input id="fa-new-id" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="30" placeholder="contoh: estha"></label><label>Nama<input id="fa-new-name" autocomplete="off" maxlength="40"></label><label>Peran${roleSelect('forecaster','id="fa-new-role"')}</label><label>Karakter${charSelect('','id="fa-new-char"',true)}</label><label>Password awal<span class="fa-pw"><input id="fa-new-pass" type="password" autocomplete="new-password" maxlength="64"><button type="button" class="fa-eye" data-pw-toggle aria-label="Tampilkan password" aria-pressed="false">Lihat</button></span></label><label>Ulangi password<span class="fa-pw"><input id="fa-new-pass2" type="password" autocomplete="new-password" maxlength="64"><button type="button" class="fa-eye" data-pw-toggle aria-label="Tampilkan password" aria-pressed="false">Lihat</button></span></label></div><div class="fs-office-row"><button type="button" class="button fp-primary" data-fa-create ${busy?'disabled':''}>Buat akun</button><span role="status" class="${msgOk?'':'fa-bad'}">${esc(msg)}</span></div><p class="fs-use">ID: 3–30 huruf kecil, angka, titik, garis bawah, atau strip. Password minimal 8 karakter, campuran huruf dan angka.</p></article>`;
  const list=users==null?'<article class="workspace-card"><p class="fs-use">Memuat daftar akun… Kalau tidak muncul, aturan Firestore untuk akun baru mungkin belum dipublikasikan.</p></article>':group('Menunggu persetujuan',by('pending'),'Tidak ada pendaftaran baru.')+group('Aktif',by('active'),'Belum ada akun ID yang aktif.')+group('Nonaktif',by('disabled'),'Tidak ada akun nonaktif.');
  return `<div id="fa-root">${create}${list}<p class="fs-use">Login nomor HP + PIN sudah ditutup kecuali akun Master pemilik. Peran: Master mengelola semua; Factory Manager & SPV Logistik bisa mengubah pengaturan; Forecaster menyusun rencana tanpa mengubah pengaturan; Data Analis, Admin ESB, dan Tamu (pihak outlet) bisa melihat semua data tanpa mengubah apa pun.</p></div>`;
 }
 async function run(work,okText){busy=true;say('Menyimpan…');try{await work();busy=false;say(okText);}catch(err){busy=false;say(err?.code==='auth/email-already-in-use'?'ID ini sudah dipakai. Pilih ID lain.':err?.message&&!/permission|insufficient/i.test(err.message)?err.message:'Belum tersimpan. Pastikan aturan Firestore akun baru sudah dipublikasikan.',false);}}
 function click(e){
  const A=api();if(!A)return false;
  if(e.target.closest('[data-fa-create]')){
   const v=id=>document.getElementById(id)?.value||'',id=v('fa-new-id').trim().toLowerCase(),name=v('fa-new-name').trim(),role=v('fa-new-role'),char=v('fa-new-char'),pw=v('fa-new-pass');
   if(!A.idOk(id)){say('ID harus 3–30 karakter: huruf kecil, angka, titik, garis bawah, atau strip.',false);return true;}
   if(name.length<2){say('Isi nama minimal 2 huruf.',false);return true;}
   if(!ROLES.includes(role)){say('Pilih peran akun.',false);return true;}
   if(!A.passOk(pw)){say('Password minimal 8 karakter dan harus berisi huruf dan angka.',false);return true;}
   if(pw!==v('fa-new-pass2')){say('Ulangi password belum sama.',false);return true;}
   if(role==='forecaster'&&char&&(users||[]).some(u=>u.status==='active'&&u.role==='forecaster'&&u.char===char)){say('Karakter itu sudah dipakai akun lain.',false);return true;}
   run(()=>A.create({id,name,role,char,password:pw}),`Akun ${id} dibuat dan langsung aktif.`);return true;
  }
  const rowEl=e.target.closest('[data-fa-uid]');if(!rowEl)return false;
  const uid=rowEl.dataset.faUid,u=(users||[]).find(x=>x.uid===uid);if(!u)return true;
  const role=rowEl.querySelector('[data-fa-role]')?.value||'',char=role==='forecaster'?rowEl.querySelector('[data-fa-char]')?.value||'':'';
  const clash=()=>role==='forecaster'&&char&&(users||[]).some(x=>x.uid!==uid&&x.status==='active'&&x.role==='forecaster'&&x.char===char);
  if(e.target.closest('[data-fa-approve]')){if(!ROLES.includes(role)){say('Pilih peran dulu sebelum menyetujui.',false);return true;}if(clash()){say('Karakter itu sudah dipakai akun lain.',false);return true;}run(()=>A.update(uid,{status:'active',role,char}),`${u.name||u.id} disetujui sebagai ${label(role)}.`);return true;}
  if(e.target.closest('[data-fa-save]')){if(!ROLES.includes(role)){say('Pilih peran akun.',false);return true;}if(clash()){say('Karakter itu sudah dipakai akun lain.',false);return true;}run(()=>A.update(uid,{role,char}),`Perubahan ${u.name||u.id} tersimpan.`);return true;}
  if(e.target.closest('[data-fa-disable]')){if(!confirm(`Nonaktifkan akun ${u.name||u.id}? Akun langsung keluar dari web Forecast.`))return true;run(()=>A.update(uid,{status:'disabled'}),`${u.name||u.id} dinonaktifkan.`);return true;}
  if(e.target.closest('[data-fa-enable]')){run(()=>A.update(uid,{status:'active'}),`${u.name||u.id} aktif lagi.`);return true;}
  if(e.target.closest('[data-fa-reject]')||e.target.closest('[data-fa-delete]')){if(!confirm(`Hapus ${u.name||u.id} dari daftar akun Forecast? Orangnya tidak bisa masuk lagi sampai didaftarkan ulang.`))return true;run(()=>A.remove(uid),`${u.name||u.id} dihapus dari daftar.`);return true;}
  return false;
 }
 // Tampilkan pilihan karakter hanya untuk peran Forecaster.
 document.addEventListener('change',e=>{const s=e.target.closest?.('#fa-root [data-fa-role],#fa-new-role');if(!s)return;const box=s.closest('.fa-row')||s.closest('.fa-new'),c=box?.querySelector('[data-fa-char],#fa-new-char');if(c)c.hidden=s.value!=='forecaster';});
 return {render,click};
})();
