// ============================================================
//  Oma Opa Cakery — CORE bersama (login + dompet poin)
//  Dipakai oleh semua game/halaman: cukup <script type="module" src="core-omaopa.js">
//  Tanpa SMS: "No HP + PIN" memakai Email/Password (HP -> email internal, PIN -> password).
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, setPersistence, browserLocalPersistence,
  GoogleAuthProvider, signInWithPopup,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  EmailAuthProvider, reauthenticateWithCredential, updatePassword,
  signOut as fbSignOut, updateProfile
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, deleteDoc, addDoc, onSnapshot, increment, serverTimestamp,
  runTransaction, collection, getDocs, getCountFromServer, query, orderBy, where, limit, startAfter, documentId, arrayUnion
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";
import {
  getStorage, ref as storageRef, uploadBytes, getBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyAJ8gae4YgP8FOk1VAA6EC2dFlwhzhV9wg",
  authDomain: "oma-opa-game.firebaseapp.com",
  projectId: "oma-opa-game",
  storageBucket: "oma-opa-game.firebasestorage.app",
  messagingSenderId: "737187594894",
  appId: "1:737187594894:web:07e8fdd4dbb2e5fa903fdf",
  measurementId: "G-PC3ZHJC1R3"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);
const storage = getStorage(app);
setPersistence(auth, browserLocalPersistence).catch(()=>{});

const LS_PTS = 'omaopa_points';        // cermin dompet (dipakai game utk tampilan)
const LS_UNSYNCED = 'omaopa_unsynced'; // poin yg didapat saat belum login (digabung saat login)
const PHONE_DOMAIN = '@phone.omaopa.fun';
const BOOTSTRAP_MASTER_PHONE = '087820498399';

// URL Google Apps Script (Web App) untuk rekap data member ke Spreadsheet.
// Kosongkan '' kalau belum dipakai. Isi setelah deploy Apps Script (lihat panduan).
const SHEET_URL = 'https://script.google.com/macros/s/AKfycbxQ3dpVue_N0sjHzMnwsYe9Rxl3R1JxhnoOGVgwGNfjijm_PNBrJ17P2X9eGMloGZF8/exec';
function pushToSheet(row){
  try{
    if(!SHEET_URL || SHEET_URL.indexOf('http')!==0) return;
    fetch(SHEET_URL, {
      method:'POST', mode:'no-cors',
      headers:{'Content-Type':'text/plain;charset=utf-8'},
      body: JSON.stringify(row)
    }).catch(()=>{});
  }catch(e){}
}

let user = null, profile = null, points = 0, unsubDoc = null, mergedOnce = false, _pinReminded = false, _outletAsked = false, _dobAsked = false;
const listeners = [];

// ---------- util ----------
function lsGet(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
function lsSet(k,v){ try{ localStorage.setItem(k,String(v)); }catch(e){} }
points = parseInt(lsGet(LS_PTS)||'0',10) || 0;

function normPhone(raw){
  let s = String(raw||'').replace(/\D/g,'');
  if(!s) return '';
  if(s.startsWith('0')) s = '62'+s.slice(1);
  else if(s.startsWith('62')) {/* ok */}
  else if(s.startsWith('8')) s = '62'+s;
  else s = '62'+s;
  return s;
}
function phoneEmail(raw){ return normPhone(raw) + PHONE_DOMAIN; }
function _ageBucket(dobStr){ if(!dobStr) return ''; var d=new Date(dobStr); if(isNaN(d.getTime())) return ''; var now=new Date(); var age=now.getFullYear()-d.getFullYear(); var mm=now.getMonth()-d.getMonth(); if(mm<0 || (mm===0 && now.getDate()<d.getDate())) age--; if(age<0||age>120) return ''; if(age<=17) return '≤17'; if(age<=24) return '18-24'; if(age<=34) return '25-34'; if(age<=44) return '35-44'; return '45+'; }
function validPin(p){ return /^\d{6}$/.test(String(p||'')); }
function errMsg(e){
  const c = (e && e.code) || '';
  if(c.includes('email-already-in-use')) return 'Nomor ini sudah terdaftar. Silakan Masuk.';
  if(c.includes('invalid-credential')||c.includes('wrong-password')||c.includes('user-not-found')) return 'Nomor atau PIN salah.';
  if(c.includes('weak-password')) return 'PIN harus 6 angka.';
  if(c.includes('network')) return 'Jaringan bermasalah, coba lagi.';
  if(c.includes('popup-closed')||c.includes('popup-blocked')||c.includes('cancelled-popup')) return 'Login Google dibatalkan.';
  if(c.includes('too-many-requests')) return 'Terlalu banyak percobaan. Coba lagi nanti.';
  return (e && e.message) ? e.message : 'Terjadi kesalahan, coba lagi.';
}

function snapshot(){
  return {
    user: user ? { uid:user.uid, name:(profile&&profile.name)||user.displayName||'' } : null,
    points: points,
    profile: profile
  };
}
function emit(){
  lsSet(LS_PTS, points);
  document.querySelectorAll('#coin,[data-oo-points]').forEach(el=>{ el.textContent = points; });
  try{ window.dispatchEvent(new CustomEvent('omaopa:change',{detail:snapshot()})); }catch(e){}
  for(const cb of listeners){ try{ cb(snapshot()); }catch(e){} }
  renderOverlay();
  try{ if(typeof rwBk!=='undefined' && rwBk.classList.contains('show')) renderRewards(); }catch(e){}
}

// ---------- poin ----------
async function ensureDoc(extra){
  if(!user) return;
  const ref = doc(db,'users',user.uid);
  let snap; try{ snap = await getDoc(ref); }catch(e){ return; }
  const unsynced = parseInt(lsGet(LS_UNSYNCED)||'0',10) || 0;
  if(!snap.exists()){
    await setDoc(ref, Object.assign({ points: unsynced, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, extra||{}));
    lsSet(LS_UNSYNCED, 0);
  } else {
    if(unsynced>0 && !mergedOnce){ await setDoc(ref,{ points: increment(unsynced), updatedAt: serverTimestamp() },{merge:true}); lsSet(LS_UNSYNCED,0); }
    if(extra) await setDoc(ref, Object.assign({updatedAt:serverTimestamp()}, extra), {merge:true});
  }
  mergedOnce = true;
}

function addPoints(n, source){
  n = Math.round(n)||0; if(!n) return;
  if(user){
    const ref = doc(db,'users',user.uid);
    const patch = { points: increment(n), updatedAt: serverTimestamp() };
    if(n>0 && (source==='game'||source==='checkin')) patch['earn_'+source] = increment(n);
    setDoc(ref, patch, {merge:true}).catch(()=>{});
    // tampilan diupdate oleh onSnapshot
  } else {
    points += n;
    const u = (parseInt(lsGet(LS_UNSYNCED)||'0',10)||0) + n;
    lsSet(LS_UNSYNCED, u);
    emit();
  }
}

// ---------- auth flow ----------
let staffFlag=false, superFlag=false, masterFlag=false, refCodeChecked=false;
onAuthStateChanged(auth, async (u)=>{
  if(unsubDoc){ unsubDoc(); unsubDoc=null; }
  mergedOnce = false; refCodeChecked = false;
  user = u || null;
  staffFlag = false;
  if(user){
    try{ await ensureDoc(); }catch(e){}
    try{ const si=await getStaffInfo(); staffFlag=!!si; superFlag=!!(si&&si.super); masterFlag=!!(si&&si.master);
      if(si && (user.email||'').split('@')[0]===normPhone(BOOTSTRAP_MASTER_PHONE)){ masterFlag=true; superFlag=true; if(!si.master){ try{ setDoc(doc(db,'staff',user.uid),{master:true,super:true,admin:true},{merge:true}); }catch(_e){} } }
      if(staffFlag){ try{ setDoc(doc(db,'leaderboard',user.uid),{staff:true},{merge:true}); }catch(e){} try{ setDoc(doc(db,'scores',user.uid),{staff:true},{merge:true}); }catch(e){} }
    }catch(e){ staffFlag=false; }
    if(!staffFlag){ try{ const kw=await getDoc(doc(db,'karyawan',user.uid)); if(kw.exists()) staffFlag=true; }catch(e){} }
    const ref = doc(db,'users',user.uid);
    unsubDoc = onSnapshot(ref,(d)=>{
      const data = d.exists()? d.data() : {};
      profile = data;
      points = (typeof data.points==='number') ? data.points : 0;
      emit();
      if(d.exists()) mirrorLeaderboard(data.name, points);
      if(d.exists() && data.mustChangePin && !_pinReminded){ _pinReminded=true; setTimeout(function(){ try{ openProfile(); }catch(e){} }, 900); }
      if(d.exists() && data.profileComplete && !data.homeOutlet && !data.mustChangePin && !staffFlag && !_outletAsked){ _outletAsked=true; setTimeout(function(){ try{ askHomeOutlet(); }catch(e){} }, 1400); }
      if(d.exists() && data.profileComplete && data.homeOutlet && !data.dob && !data.mustChangePin && !staffFlag && !_dobAsked){ _dobAsked=true; setTimeout(function(){ try{ askBirthday(); }catch(e){} }, 1400); }
      if(d.exists() && !staffFlag){ maybeGrantRegBonus(); }
      if(d.exists() && !staffFlag && !data.refCode && !refCodeChecked){ refCodeChecked=true; ensureRefCode().catch(()=>{}); }
    }, ()=>{});
  } else {
    profile = null;
    points = parseInt(lsGet(LS_PTS)||'0',10) || 0;
    emit();
  }
});

async function signInGoogle(){
  const prov = new GoogleAuthProvider();
  const res = await signInWithPopup(auth, prov);
  user = res.user;
  await ensureDoc({ name: user.displayName||'', provider:'google', profileComplete:false });
}
async function loginPhonePin(phone, pin){
  if(!normPhone(phone)) throw {message:'Nomor HP belum benar.'};
  if(!validPin(pin)) throw {message:'PIN harus 6 angka.'};
  await signInWithEmailAndPassword(auth, phoneEmail(phone), pin);
  await ensureDoc();
}
async function changeMyPin(currentPin, newPin){
  if(!user) throw {message:'Masuk dulu ya.'};
  if(!validPin(newPin)) throw {message:'PIN baru harus 6 angka.'};
  const ph=(profile&&profile.phone)||'';
  if(!ph) throw {message:'Akun ini tidak memakai PIN.'};
  try{ const cred=EmailAuthProvider.credential(phoneEmail(ph), String(currentPin)); await reauthenticateWithCredential(user, cred); }
  catch(e){ throw {message:'PIN lama salah.'}; }
  await updatePassword(user, String(newPin));
  try{ await setDoc(doc(db,'users',user.uid), { mustChangePin:false }, {merge:true}); }catch(e){}
  return true;
}
async function createOrReuseAuthAccount(phone, pin, displayName){
  try{
    const res = await createUserWithEmailAndPassword(auth, phoneEmail(phone), pin);
    const u = res.user;
    try{ if(displayName) await updateProfile(u,{displayName:displayName}); }catch(e){}
    return { uid:u.uid, isNew:true, user:u };
  }catch(err){
    if(err && err.code==='auth/email-already-in-use'){
      try{
        const res2 = await signInWithEmailAndPassword(auth, phoneEmail(phone), pin);
        return { uid:res2.user.uid, isNew:false, user:res2.user };
      }catch(err2){
        throw {message:'Nomor HP ini sudah terdaftar. Kalau ini nomor kamu, masukkan PIN yang sama seperti akun kamu sebelumnya buat lanjut.'};
      }
    }
    throw err;
  }
}
async function registerPhonePin(data){
  const { phone, pin, name, gender, age, dob, occupation, homeOutlet, consent, ref } = data;
  if(!name || name.trim().length<2) throw {message:'Isi nama dulu ya.'};
  if(!normPhone(phone)) throw {message:'Nomor HP belum benar.'};
  if(!validPin(pin)) throw {message:'PIN harus 6 angka.'};
  if(!gender) throw {message:'Pilih jenis kelamin dulu ya.'};
  if(!dob) throw {message:'Isi tanggal lahir dulu ya.'};
  if(!age) throw {message:'Pilih usia dulu ya.'};
  if(!occupation) throw {message:'Isi/pilih pekerjaan dulu ya.'};
  if(!homeOutlet) throw {message:'Pilih outlet terdekat dulu ya.'};
  if(!consent) throw {message:'Centang persetujuan dulu ya.'};
  const acc = await createOrReuseAuthAccount(phone, pin, name.trim());
  user = acc.user;
  // cek kode referral (opsional) -> uid pemberi
  let referredBy='';
  const rc=(ref||'').trim().toUpperCase();
  if(rc){ try{ const rm=await getDoc(doc(db,'refcodes',rc)); if(rm.exists()){ const ru=(rm.data().uid||''); if(ru && ru!==user.uid) referredBy=ru; } }catch(e){} }
  // buat kode referral unik untuk akun ini
  const myCode=await ensureUniqueRefCode();
  await ensureDoc({ name:name.trim(), nameLower:name.trim().toLowerCase(), phone:normPhone(phone), gender, age, dob, occupation, homeOutlet, consent:true, provider:'phone', profileComplete:true, refCode:myCode, referredBy:referredBy, refRewarded:false });
  try{ await setDoc(doc(db,'refcodes',myCode), { uid:user.uid, name:name.trim(), createdAt:serverTimestamp() }); }catch(e){}
  pushToSheet({
    type: 'member',
    waktu: new Date().toISOString(),
    uid: user.uid,
    nama: name.trim(),
    no_hp: normPhone(phone),
    gender: gender,
    usia: age,
    tgl_lahir: dob,
    pekerjaan: occupation,
    outlet_terdekat: homeOutlet
  });
}
async function doSignOut(){ await fbSignOut(auth); }
function askHomeOutlet(){
  if(!user || !profile || document.getElementById('ooOutletAsk')) return;
  var outs=(window.OMA_OUTLETS||[]); var byArea={}; outs.forEach(function(o){ var a=o.area||'Lainnya'; (byArea[a]=byArea[a]||[]).push((o.name||'').replace(/^Oma Opa Cakery\s*/i,'')); });
  var opt='<option value="">— pilih outlet terdekat —</option>'; Object.keys(byArea).forEach(function(a){ opt+='<optgroup label="'+a+'">'; byArea[a].forEach(function(n){ opt+='<option>'+n+'</option>'; }); opt+='</optgroup>'; });
  var bk=document.createElement('div'); bk.id='ooOutletAsk';
  bk.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px';
  bk.innerHTML='<div style="background:#FFF9EC;border-radius:18px;padding:20px;max-width:340px;width:100%;box-shadow:0 12px 40px rgba(0,0,0,.3)">'
    +'<div style="font-weight:800;font-size:1.1rem;color:#5A3017;margin-bottom:6px">📍 Outlet terdekatmu?</div>'
    +'<div style="font-size:.85rem;color:#7A5A3A;margin-bottom:12px">Bantu kami tahu outlet Oma Opa yang paling dekat / sering kamu kunjungi ya 🙏</div>'
    +'<select id="aoSel" style="width:100%;padding:11px;border:2px solid #E7D7B6;border-radius:11px;font-size:.95rem;margin-bottom:8px;background:#fff">'+opt+'</select>'
    +'<div id="aoMsg" style="font-size:.8rem;color:#C0392B;margin-bottom:8px"></div>'
    +'<button id="aoSave" style="width:100%;padding:12px;border:none;border-radius:11px;background:#FACC1A;color:#5A3A05;font-weight:800;font-size:.95rem;cursor:pointer">Simpan</button>'
    +'<button id="aoSkip" style="width:100%;padding:9px;border:none;background:none;color:#9a7a5e;font-size:.82rem;margin-top:6px;cursor:pointer;text-decoration:underline">Nanti aja</button>'
    +'</div>';
  document.body.appendChild(bk);
  bk.querySelector('#aoSave').onclick=async function(){ var v=bk.querySelector('#aoSel').value; if(!v){ bk.querySelector('#aoMsg').textContent='Pilih dulu ya.'; return; } var btn=this; btn.disabled=true; btn.textContent='Menyimpan…'; try{ await setDoc(doc(db,'users',user.uid),{homeOutlet:v},{merge:true}); bk.remove(); }catch(e){ bk.querySelector('#aoMsg').textContent='Gagal, coba lagi.'; btn.disabled=false; btn.textContent='Simpan'; } };
  bk.querySelector('#aoSkip').onclick=function(){ bk.remove(); };
}
function askBirthday(){
  if(!user || !profile || document.getElementById('ooDobAsk')) return;
  var bk=document.createElement('div'); bk.id='ooDobAsk';
  bk.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px';
  bk.innerHTML='<div style="background:#FFF9EC;border-radius:18px;padding:20px;max-width:340px;width:100%;box-shadow:0 12px 40px rgba(0,0,0,.3)">'
    +'<div style="font-weight:800;font-size:1.1rem;color:#5A3017;margin-bottom:6px">🎂 Tanggal lahirmu?</div>'
    +'<div style="font-size:.85rem;color:#7A5A3A;margin-bottom:12px">Biar kami bisa kasih kejutan pas hari ulang tahunmu 🎁</div>'
    +'<input type="date" id="adDob" style="width:100%;padding:11px;border:2px solid #E7D7B6;border-radius:11px;font-size:.95rem;margin-bottom:8px;background:#fff">'
    +'<div id="adMsg" style="font-size:.8rem;color:#C0392B;margin-bottom:8px"></div>'
    +'<button id="adSave" style="width:100%;padding:12px;border:none;border-radius:11px;background:#FACC1A;color:#5A3A05;font-weight:800;font-size:.95rem;cursor:pointer">Simpan</button>'
    +'<button id="adSkip" style="width:100%;padding:9px;border:none;background:none;color:#9a7a5e;font-size:.82rem;margin-top:6px;cursor:pointer;text-decoration:underline">Nanti aja</button>'
    +'</div>';
  document.body.appendChild(bk);
  bk.querySelector('#adSave').onclick=async function(){ var v=bk.querySelector('#adDob').value; if(!v){ bk.querySelector('#adMsg').textContent='Pilih tanggal dulu ya.'; return; } var btn=this; btn.disabled=true; btn.textContent='Menyimpan…'; try{ await setDoc(doc(db,'users',user.uid),{ dob:v, age:_ageBucket(v) },{merge:true}); bk.remove(); }catch(e){ bk.querySelector('#adMsg').textContent='Gagal, coba lagi.'; btn.disabled=false; btn.textContent='Simpan'; } };
  bk.querySelector('#adSkip').onclick=function(){ bk.remove(); };
}
async function deleteMyAccount(currentPin){
  if(!user) throw {message:'Masuk dulu ya.'};
  const ph=(profile&&profile.phone)||'';
  if(ph){ try{ const cred=EmailAuthProvider.credential(phoneEmail(ph), String(currentPin)); await reauthenticateWithCredential(user, cred); }catch(e){ throw {message:'PIN salah.'}; } }
  const uid=user.uid;
  try{ await deleteDoc(doc(db,'users',uid)); }catch(e){}
  try{ await deleteDoc(doc(db,'leaderboard',uid)); }catch(e){}
  try{ await deleteDoc(doc(db,'scores',uid)); }catch(e){}
  await user.delete();
  return true;
}
async function adminDeleteMember(targetUid){
  if(!(await isMaster())) throw {message:'Khusus Master.'};
  targetUid=String(targetUid||'').trim(); if(!targetUid) throw {message:'Member tidak valid.'};
  let idToken=''; try{ idToken=await user.getIdToken(); }catch(e){ throw {message:'Sesi admin kedaluwarsa, login ulang.'}; }
  let j=null;
  try{ const res=await fetch(SHEET_URL, { method:'POST', redirect:'follow', headers:{'Content-Type':'text/plain;charset=utf-8'}, body: JSON.stringify({ type:'deletemember', idToken:idToken, uid:targetUid }) }); j=await res.json(); }catch(e){ throw {message:'Gagal menghubungi server. Cek koneksi / setup Apps Script.'}; }
  if(!j || !j.ok) throw {message:(j&&j.error)||'Hapus akun gagal.'};
  logAudit('hapus_member', 'Hapus akun member (uid:'+targetUid+').');
  return true;
}
async function adminResetPin(targetUid, newPin){
  if(!(await isSuper())) throw {message:'Khusus admin utama.'};
  targetUid=String(targetUid||'').trim(); newPin=String(newPin||'');
  if(!targetUid) throw {message:'Member tidak valid.'};
  if(!/^\d{6}$/.test(newPin)) throw {message:'PIN harus 6 angka.'};
  let idToken=''; try{ idToken=await user.getIdToken(); }catch(e){ throw {message:'Sesi admin kedaluwarsa, login ulang.'}; }
  let j=null;
  try{
    const res=await fetch(SHEET_URL, { method:'POST', redirect:'follow', headers:{'Content-Type':'text/plain;charset=utf-8'}, body: JSON.stringify({ type:'resetpin', idToken:idToken, uid:targetUid, pin:newPin }) });
    j=await res.json();
  }catch(e){ throw {message:'Gagal menghubungi server reset. Cek koneksi / setup Apps Script.'}; }
  if(!j || !j.ok) throw {message:(j&&j.error)||'Reset PIN gagal.'};
  logAudit('reset_pin', 'Reset PIN member (uid:'+targetUid+').');
  return true;
}

// ============================================================
//  UI LOGIN (disuntik sendiri ke halaman manapun)
// ============================================================
const K='#FFC21A', KD='#E5A100', CO='#5A3017', CR='#FFF6E6';
const style = document.createElement('style');
style.textContent = `
.oo-bk{position:fixed;inset:0;background:rgba(80,55,30,.55);backdrop-filter:blur(3px);display:none;align-items:center;justify-content:center;z-index:99999;padding:16px;font-family:'Nunito',system-ui,sans-serif}
.oo-bk.show{display:flex}
.oo-card{background:${CR};width:100%;max-width:360px;border-radius:22px;padding:18px 16px 16px;box-shadow:0 18px 50px rgba(80,55,30,.4);max-height:92vh;overflow:auto}
.oo-h{font-family:'Fredoka','Nunito',sans-serif;font-weight:700;color:${CO};font-size:1.2rem;text-align:center;margin:2px 0 2px}
.oo-sub{text-align:center;color:#9a7a5e;font-size:.8rem;font-weight:700;margin-bottom:12px}
.oo-x{position:absolute;top:10px;right:14px;border:none;background:none;font-size:1.4rem;color:#b59a7e;cursor:pointer;line-height:1}
.oo-g{display:flex;align-items:center;justify-content:center;gap:9px;width:100%;border:2px solid #E7D8BE;background:#fff;border-radius:13px;padding:11px;font-weight:800;color:${CO};font-size:.92rem;cursor:pointer}
.oo-g:active{transform:scale(.98)}
.oo-or{display:flex;align-items:center;gap:8px;color:#b59a7e;font-size:.74rem;font-weight:700;margin:13px 0}
.oo-or:before,.oo-or:after{content:'';flex:1;height:1px;background:#E7D8BE}
.oo-tabs{display:flex;background:#F1E4CC;border-radius:12px;padding:3px;margin-bottom:12px}
.oo-tab{flex:1;text-align:center;padding:8px;border-radius:9px;font-weight:800;font-size:.86rem;color:#9a7a5e;cursor:pointer}
.oo-tab.on{background:#fff;color:${CO};box-shadow:0 1px 3px rgba(0,0,0,.08)}
.oo-f{display:flex;flex-direction:column;gap:9px}
.oo-l{font-size:.74rem;font-weight:800;color:#8a6a3a;margin:2px 0 -4px}
.oo-in,.oo-se{width:100%;border:2px solid #E7D8BE;border-radius:12px;padding:11px;font-size:.95rem;font-family:inherit;color:${CO};background:#fff;box-sizing:border-box}
.oo-in:focus,.oo-se:focus{outline:none;border-color:${K}}
.oo-row{display:flex;gap:8px}
.oo-row>*{flex:1}
.oo-ck{display:flex;gap:8px;align-items:flex-start;font-size:.76rem;color:#7a5a3a;font-weight:600;margin-top:2px}
.oo-ck input{margin-top:2px;width:16px;height:16px;flex:none}
.oo-btn{width:100%;border:none;background:${K};color:${CO};font-weight:900;font-size:1rem;border-radius:13px;padding:12px;cursor:pointer;box-shadow:0 3px 0 ${KD};margin-top:4px;font-family:inherit}
.oo-btn:active{transform:translateY(2px);box-shadow:0 1px 0 ${KD}}
.oo-btn[disabled]{opacity:.6}
.oo-err{background:#FDECEC;color:#C0392B;border-radius:10px;padding:8px 10px;font-size:.8rem;font-weight:700;text-align:center}
.oo-mini{text-align:center;font-size:.72rem;color:#b59a7e;margin-top:10px;line-height:1.4}
.oo-prof{text-align:center}
.oo-av{width:64px;height:64px;border-radius:50%;background:${K};color:${CO};font-weight:900;font-size:1.6rem;display:flex;align-items:center;justify-content:center;margin:4px auto 8px}
.oo-pts{display:inline-flex;gap:6px;align-items:center;background:#fff;border:2px solid #F1E4CC;border-radius:999px;padding:6px 14px;font-weight:900;color:#7A5A12;margin:6px 0 14px}
.oo-out{width:100%;border:2px solid #E7D8BE;background:#fff;color:#C0392B;font-weight:800;border-radius:13px;padding:11px;cursor:pointer;font-family:inherit}
.oo-ref{background:#fff;border:2px dashed ${KD};border-radius:14px;padding:10px 12px;margin:2px 0 9px;font-size:.72rem;font-weight:800;color:#8a6a3a}
.oo-ref b{display:block;font-size:1.4rem;letter-spacing:3px;color:${CO};margin:3px 0 5px;font-family:'Fredoka','Nunito',sans-serif}
.oo-share{width:100%;border:2px solid ${KD};background:${K};color:${CO};font-weight:900;border-radius:13px;padding:11px;cursor:pointer;font-family:inherit;margin-bottom:8px}
.oo-share:active{transform:translateY(1px)}
.oo-tc{font-size:.64rem;color:#b59a7e;line-height:1.45;margin-top:8px;text-align:left}
`;
document.head.appendChild(style);

const bk = document.createElement('div');
bk.className='oo-bk';
bk.innerHTML = `<div class="oo-card" style="position:relative">
  <button class="oo-x" id="ooX">×</button>
  <div id="ooBody"></div>
</div>`;
function mount(){ if(!document.body.contains(bk)) document.body.appendChild(bk); }
if(document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);

let tab='masuk';
function openLogin(){ mount(); renderOverlay(); bk.classList.add('show'); }
function closeLogin(){ bk.classList.remove('show'); }
function shareRef(code){
  code=(code||'').trim();
  if(!code){ try{ alert('Kode referral lagi disiapkan, coba sebentar lagi ya.'); }catch(e){} return; }
  const txt='Yuk daftar member Oma Opa Cakery & pakai kode referralku: '+code+' — kita berdua dapat '+REF_WELCOME+' poin pas belanja pertama! Daftar di https://omaopa.fun';
  try{ if(navigator.share){ navigator.share({ title:'Oma Opa Cakery', text:txt }); return; } }catch(e){}
  try{ window.open('https://wa.me/?text='+encodeURIComponent(txt), '_blank'); }catch(e){}
}

function renderOverlay(){
  const body = bk.querySelector('#ooBody'); if(!body) return;
  if(user){
    const nm = (profile&&profile.name)||user.displayName||'Sahabat Oma Opa';
    const myCode = (profile&&profile.refCode)||'';
    body.innerHTML = `<div class="oo-prof">
      <div class="oo-av">${(nm[0]||'O').toUpperCase()}</div>
      <div class="oo-h" style="margin-bottom:0">Hai, ${nm}!</div>
      <div class="oo-pts">🪙 ${points} poin</div>
      <div class="oo-ref">Kode referral kamu<b id="ooRefCode">${myCode||'…'}</b>Ajak teman daftar pakai kodemu — kalian <b style="display:inline;font-size:.72rem;letter-spacing:0;color:#8a6a3a">berdua dapat ${REF_REWARD} poin</b> pas belanja pertamanya 🎉</div>
      <button class="oo-share" id="ooRefShare">📲 Bagikan kode referral</button>
      <button class="oo-out" id="ooOut">Keluar</button>
      <div class="oo-tc">Jumlah poin & ketentuan reward sepenuhnya kebijakan Oma Opa Cakery dan dapat berubah sewaktu-waktu. Poin dari kecurangan atau pemanfaatan celah dapat dibatalkan & akun ditangguhkan.</div>
    </div>`;
    body.querySelector('#ooOut').onclick = async ()=>{ try{ await doSignOut(); }catch(e){} closeLogin(); };
    const sb=body.querySelector('#ooRefShare'); if(sb) sb.onclick=()=>shareRef((profile&&profile.refCode)||'');
    if(!myCode){ ensureRefCode().then(function(c){ var el=body.querySelector('#ooRefCode'); if(el && c) el.textContent=c; }).catch(()=>{}); }
    return;
  }
  body.innerHTML = `
    <div class="oo-h">Masuk ke Oma Opa</div>
    <div class="oo-sub">Simpan poin & tukar jadi voucher 🎁</div>
    <div class="oo-tabs">
      <div class="oo-tab ${tab==='masuk'?'on':''}" data-tab="masuk">Masuk</div>
      <div class="oo-tab ${tab==='daftar'?'on':''}" data-tab="daftar">Daftar</div>
    </div>
    <div id="ooErr"></div>
    <div id="ooForm"></div>
    <div class="oo-mini">Belum punya akun? Pilih <b>Daftar</b> & isi data dirimu.</div>`;
  body.querySelectorAll('.oo-tab').forEach(t=> t.onclick = ()=>{ tab=t.dataset.tab; renderOverlay(); });
  renderForm();
}
function setErr(m){ const e=bk.querySelector('#ooErr'); if(e) e.innerHTML = m? `<div class="oo-err">${m}</div>`:''; }
function renderForm(){
  const f = bk.querySelector('#ooForm'); if(!f) return;
  if(tab==='masuk'){
    f.innerHTML = `<div class="oo-f">
      <label class="oo-l">No HP</label>
      <input class="oo-in" id="ooPhone" type="tel" inputmode="numeric" placeholder="0812xxxxxxx">
      <label class="oo-l">PIN (6 angka)</label>
      <input class="oo-in" id="ooPin" type="password" inputmode="numeric" maxlength="6" placeholder="••••••">
      <button class="oo-btn" id="ooGo">Masuk</button>
      <div style="text-align:center;margin-top:11px"><a href="https://wa.me/${WA_CC}?text=${encodeURIComponent(DEF_LUPAPIN_MSG)}" target="_blank" rel="noopener" id="ooForgot" style="color:#9a7a5e;font-size:.82rem;text-decoration:underline;font-weight:700">Lupa PIN?</a></div>
    </div>`;
    f.querySelector('#ooGo').onclick = async (ev)=>{
      setErr(''); const b=ev.target; b.disabled=true; b.textContent='Memproses…';
      try{ await loginPhonePin(f.querySelector('#ooPhone').value, f.querySelector('#ooPin').value); closeLogin(); }
      catch(e){ setErr(errMsg(e)); b.disabled=false; b.textContent='Masuk'; }
    };
    (async()=>{ try{ const m=await getMessages(); if(m&&m.lupapin){ const a=f.querySelector('#ooForgot'); if(a) a.href='https://wa.me/'+WA_CC+'?text='+encodeURIComponent(m.lupapin); } }catch(e){} })();
  } else {
    const outletOpts = (function(){ var outs=(window.OMA_OUTLETS||[]); var byArea={}; outs.forEach(function(o){ var a=o.area||'Lainnya'; (byArea[a]=byArea[a]||[]).push((o.name||'').replace(/^Oma Opa Cakery\s*/i,'')); }); var h='<option value="">— pilih outlet terdekat —</option>'; Object.keys(byArea).forEach(function(a){ h+='<optgroup label="'+a+'">'; byArea[a].forEach(function(n){ h+='<option>'+n+'</option>'; }); h+='</optgroup>'; }); return h; })();
    f.innerHTML = `<div class="oo-f">
      <label class="oo-l">Nama</label>
      <input class="oo-in" id="rName" placeholder="Nama panggilan">
      <label class="oo-l">No HP</label>
      <input class="oo-in" id="rPhone" type="tel" inputmode="numeric" placeholder="0812xxxxxxx">
      <label class="oo-l">PIN (6 angka)</label>
      <input class="oo-in" id="rPin" type="password" inputmode="numeric" maxlength="6" placeholder="buat PIN">
      <div class="oo-row">
        <div><label class="oo-l">Jenis kelamin</label>
          <select class="oo-se" id="rGender"><option value="">—</option><option>Laki-laki</option><option>Perempuan</option></select></div>
        <div><label class="oo-l">Tanggal lahir</label>
          <input class="oo-in" id="rDob" type="date"></div>
      </div>
      <label class="oo-l">Pekerjaan</label>
      <select class="oo-se" id="rJob"><option value="">—</option><option>PNS</option><option>Pelajar</option><option>Mahasiswa</option><option>Karyawan swasta</option><option>Pengusaha</option><option>Ibu Rumah Tangga</option><option>Lainnya</option></select>
      <input class="oo-in" id="rJobOther" placeholder="Tulis pekerjaanmu" style="display:none">
      <label class="oo-l">Outlet terdekat</label>
      <select class="oo-se" id="rOutlet">${outletOpts}</select>
      <label class="oo-l">Kode referral (opsional)</label>
      <input class="oo-in" id="rRef" placeholder="Punya kode teman? isi di sini" style="text-transform:uppercase">
      <label class="oo-ck"><input type="checkbox" id="rConsent"> Saya setuju data saya digunakan sebagai member & riset customer, serta menyetujui <b>Ketentuan Poin &amp; Reward</b> Oma Opa.</label>
      <button class="oo-btn" id="rGo">Daftar</button>
    </div>`;
    (function(){ var js=f.querySelector('#rJob'), jo=f.querySelector('#rJobOther'); if(js&&jo) js.onchange=function(){ jo.style.display=(js.value==='Lainnya')?'block':'none'; }; })();
    f.querySelector('#rGo').onclick = async (ev)=>{
      setErr(''); const b=ev.target; b.disabled=true; b.textContent='Memproses…';
      try{
        let occ=f.querySelector('#rJob').value; if(occ==='Lainnya') occ=(f.querySelector('#rJobOther').value||'').trim();
        await registerPhonePin({
          name:f.querySelector('#rName').value, phone:f.querySelector('#rPhone').value, pin:f.querySelector('#rPin').value,
          gender:f.querySelector('#rGender').value, dob:f.querySelector('#rDob').value, age:_ageBucket(f.querySelector('#rDob').value), occupation:occ,
          homeOutlet:f.querySelector('#rOutlet').value,
          consent:f.querySelector('#rConsent').checked, ref:f.querySelector('#rRef').value
        });
        closeLogin();
      }catch(e){ setErr(errMsg(e)); b.disabled=false; b.textContent='Daftar'; }
    };
  }
}
bk.querySelector('#ooX').onclick = closeLogin;
bk.addEventListener('click', e=>{ if(e.target===bk) closeLogin(); });

// ============================================================
//  REWARD / VOUCHER
// ============================================================
const REWARDS = [
  { id:'d5',      cost:100,  limit:500, title:'Diskon 5%' },
  { id:'d10',     cost:150,  limit:500, title:'Diskon 10%' },
  { id:'ft',      cost:200,  limit:500, title:'Gratis topping 1 malmil', note:'tiap pembelian 3 malmil' },
  { id:'d15',     cost:250,  limit:500, title:'Diskon 15%' },
  { id:'fm',      cost:350,  limit:500, title:'Gratis malmil polos' },
  { id:'d30',     cost:400,  limit:100, title:'Diskon 30%', note:'maksimal Rp50.000' },
  { id:'fmt',     cost:500,  limit:100, title:'Free Malmil Topping' },
  { id:'totebag', cost:750,  limit:200, title:'Tote Bag Oma Opa' },
  { id:'payung',  cost:1000, limit:200, title:'Payung Oma Opa' }
];
function rewardIcon(rw){
  const id=rw.id||''; const ic=rw.icon||''; const t=(rw.title||'').toLowerCase(); let bg, svg;
  const umbrella = ic==='umbrella'||id==='payung'||t.indexOf('payung')>=0;
  const tote = ic==='tote'||id==='totebag'||t.indexOf('tote')>=0;
  const bolu = ic==='bolu'||id==='ft'||id==='fm'||id==='fmt'||t.indexOf('malmil')>=0||t.indexOf('topping')>=0;
  if(umbrella){
    bg='#FFF3CC';
    svg='<svg viewBox="0 0 24 24" width="30" height="30" fill="none"><path d="M3 11 Q3 3.2 12 3 Q21 3.2 21 11 Q19 9.3 17 11 Q15 9.3 13 11 Q11 9.3 9 11 Q7 9.3 5 11 Q4 9.5 3 11 Z" fill="#FFC21A" stroke="#E5A100" stroke-width="1" stroke-linejoin="round"/><path d="M12 3 V2.1" stroke="#7A5A12" stroke-width="1.4" stroke-linecap="round"/><circle cx="12" cy="1.8" r=".9" fill="#7A5A12"/><path d="M12 11 V18.2" stroke="#7A5A12" stroke-width="1.6" stroke-linecap="round"/><path d="M12 18.2 Q12 20.4 9.6 20.4 Q8.2 20.4 8.2 19.2" fill="none" stroke="#7A5A12" stroke-width="1.6" stroke-linecap="round"/></svg>';
  } else if(tote){
    bg='#F3E6D2';
    svg='<svg viewBox="0 0 24 24" width="30" height="30" fill="none"><path d="M6 8.3h12l1 11.2a1 1 0 0 1-1 1.1H6a1 1 0 0 1-1-1.1Z" fill="#E0B17A" stroke="#A9743C" stroke-width="1.1" stroke-linejoin="round"/><path d="M9 8.5V6.7a3 3 0 0 1 6 0v1.8" stroke="#A9743C" stroke-width="1.6" stroke-linecap="round"/><path d="M9.4 12.5h5.2" stroke="#A9743C" stroke-width="1.3" stroke-linecap="round" opacity=".6"/></svg>';
  } else if(bolu){
    bg='#FDEFD3';
    svg='<svg viewBox="0 0 24 24" width="32" height="32" fill="none"><path d="M4 12h16v4a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3Z" fill="#F4D79B" stroke="#D9A94E" stroke-width="1" stroke-linejoin="round"/><path d="M3.4 12.3C3 8 6.6 5 12 5s9 3 8.6 7.3Z" fill="#C98A4B" stroke="#A96A2E" stroke-width="1" stroke-linejoin="round"/><ellipse cx="9" cy="8.2" rx="3.6" ry="1.3" fill="#fff" opacity=".35"/><ellipse cx="9.5" cy="15.4" rx="1" ry="1.3" fill="#5a3b2e"/><ellipse cx="14.5" cy="15.4" rx="1" ry="1.3" fill="#5a3b2e"/><path d="M11 16.7q1 .8 2 0" stroke="#5a3b2e" stroke-width=".9" fill="none" stroke-linecap="round"/><circle cx="7.3" cy="16.1" r=".9" fill="#F4A6B0" opacity=".6"/><circle cx="16.7" cy="16.1" r=".9" fill="#F4A6B0" opacity=".6"/></svg>';
  } else {
    bg='#E3F4EE';
    svg='<svg viewBox="0 0 24 24" width="30" height="30" fill="none"><path d="M12.6 3H20a1 1 0 0 1 1 1v7.4a2 2 0 0 1-.6 1.4l-7.1 7.1a2 2 0 0 1-2.8 0l-6.4-6.4a2 2 0 0 1 0-2.8l7.1-7.1A2 2 0 0 1 12.6 3Z" fill="#7CC9B5" stroke="#3E9B83" stroke-width="1.1" stroke-linejoin="round"/><circle cx="16.8" cy="7.2" r="1.4" fill="#fff"/><path d="M9.3 14.7l5.4-5.4" stroke="#fff" stroke-width="1.7" stroke-linecap="round"/><circle cx="9.7" cy="9.9" r="1.1" fill="#fff"/><circle cx="14.3" cy="14.5" r="1.1" fill="#fff"/></svg>';
  }
  return '<div class="rw-ic" style="background:'+bg+'">'+svg+'</div>';
}
let rewardStock = {};      // id -> jumlah klaim
let rewardCatalog = null;  // daftar efektif: default kode + override Firestore + reward custom
function defaultRewards(){ return REWARDS.map(rw=>Object.assign({ note:'', active:true, icon:'' }, rw, { claimed:0 })); }
async function loadRewardCatalog(){
  let docs={};
  try{ const snap=await getDocs(collection(db,'rewards')); snap.forEach(d=>{ docs[d.id]=d.data()||{}; }); }catch(e){}
  const num=(v)=> (typeof v==='number')?v:null;
  const list=[];
  REWARDS.forEach(rw=>{ const o=docs[rw.id]||{}; if(o.deleted){ delete docs[rw.id]; return; }
    list.push({ id:rw.id,
      title:(o.title!=null?o.title:rw.title), note:(o.note!=null?o.note:(rw.note||'')),
      cost:(num(o.cost)!=null?o.cost:rw.cost), limit:(num(o.limit)!=null?o.limit:(rw.limit!=null?rw.limit:null)),
      claimed:(num(o.claimed)!=null?o.claimed:0), active:(o.active!==false), icon:(o.icon||''),
      discType:(o.discType||'none'), discValue:(num(o.discValue)!=null?o.discValue:0), discMax:(num(o.discMax)!=null?o.discMax:0), freeItemId:(o.freeItemId||''), freeItemName:(o.freeItemName||''), freeItemPrice:(num(o.freeItemPrice)!=null?o.freeItemPrice:0), custom:false });
    delete docs[rw.id]; });
  Object.keys(docs).forEach(id=>{ const x=docs[id]; if(x.deleted) return; if(num(x.cost)==null) return;
    list.push({ id, title:x.title||id, note:x.note||'', cost:x.cost, limit:(num(x.limit)!=null?x.limit:null), claimed:(num(x.claimed)!=null?x.claimed:0), active:(x.active!==false), icon:x.icon||'', discType:(x.discType||'none'), discValue:(num(x.discValue)!=null?x.discValue:0), discMax:(num(x.discMax)!=null?x.discMax:0), freeItemId:(x.freeItemId||''), freeItemName:(x.freeItemName||''), freeItemPrice:(num(x.freeItemPrice)!=null?x.freeItemPrice:0), custom:true }); });
  list.sort((a,b)=>a.cost-b.cost);
  rewardCatalog=list; rewardStock={}; list.forEach(r=>rewardStock[r.id]=r.claimed);
  return list;
}
async function listRewardStock(){ await loadRewardCatalog(); return rewardStock; }
async function listRewardsPublic(){ try{ await loadRewardCatalog(); return (rewardCatalog||[]).filter(r=>r.active!==false).map(r=>({ id:r.id, title:r.title||'', cost:Number(r.cost)||0, note:r.note||'' })); }catch(e){ return []; } }
function genCode(){
  const t = Date.now().toString(36).toUpperCase().slice(-4);
  const r = Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,4).padEnd(4,'X');
  return 'OO-'+t+r;
}
async function redeem(rewardId){
  if(!user) throw {message:'Masuk dulu untuk menukar poin.'};
  if(staffFlag && !superFlag && !masterFlag) throw {message:'Akun staff (Kasir/Admin) tidak bisa menukar poin/voucher.'};
  const rw = (rewardCatalog||defaultRewards()).find(x=>x.id===rewardId); if(!rw) throw {message:'Hadiah tidak ditemukan.'};
  if(rw.active===false) throw {message:'Hadiah sedang tidak tersedia.'};
  const uref = doc(db,'users',user.uid);
  const rref = doc(db,'rewards',rw.id);
  const code = genCode();
  const vref = doc(db,'vouchers',code);
  const nm = (profile&&profile.name)||user.displayName||'';
  const today=_todayStr();
  await runTransaction(db, async (tx)=>{
    const us = await tx.get(uref);
    const rs = await tx.get(rref);
    if(us.exists() && us.data().lastRedeem===today) throw {message:'Kamu sudah menukar reward hari ini 🙂 Balik lagi besok ya!'};
    const cur = (us.exists() && typeof us.data().points==='number') ? us.data().points : 0;
    const claimed = (rs.exists() && typeof rs.data().claimed==='number') ? rs.data().claimed : 0;
    if(typeof rw.limit==='number' && claimed >= rw.limit) throw {message:'Yah, stok hadiah ini sudah habis 😢'};
    if(cur < rw.cost) throw {message:'Poin belum cukup.'};
    tx.set(uref, { points: cur - rw.cost, lastRedeem: today, updatedAt: serverTimestamp() }, {merge:true});
    tx.set(rref, { claimed: claimed + 1, limit: (rw.limit||null), title: rw.title, updatedAt: serverTimestamp() }, {merge:true});
    const _rd=(rs.exists()&&rs.data())||{};
    tx.set(vref, { code:code, uid:user.uid, name:nm, rewardId:rw.id, title:rw.title, note:rw.note||'', cost:rw.cost, status:'aktif', discType:(_rd.discType||rw.discType||'none'), discValue:(_rd.discValue!=null?_rd.discValue:(rw.discValue||0)), discMax:(_rd.discMax!=null?_rd.discMax:(rw.discMax||0)), freeItemId:(_rd.freeItemId||rw.freeItemId||''), freeItemName:(_rd.freeItemName||rw.freeItemName||''), freeItemPrice:(_rd.freeItemPrice!=null?_rd.freeItemPrice:(rw.freeItemPrice||0)), createdAt: serverTimestamp() });
  });
  if(profile) profile.lastRedeem=today;
  rewardStock[rw.id] = (rewardStock[rw.id]||0) + 1;
  return code;
}
async function listVouchers(){
  if(!user) return [];
  try{
    const q = query(collection(db,'vouchers'), where('uid','==',user.uid));
    const snap = await getDocs(q);
    const arr=[]; snap.forEach(d=>arr.push(Object.assign({id:d.id}, d.data())));
    arr.sort((a,b)=>{ const ta=(a.createdAt&&a.createdAt.seconds)||0, tb=(b.createdAt&&b.createdAt.seconds)||0; return tb-ta; });
    return arr;
  }catch(e){ return []; }
}
async function isStaff(){
  if(!user) return false;
  try{ const s = await getDoc(doc(db,'staff',user.uid)); return s.exists(); }catch(e){ return false; }
}
async function findVoucher(code){
  code=(code||'').trim().toUpperCase(); if(!code) return null;
  try{
    const s = await getDoc(doc(db,'vouchers',code)); if(!s.exists()) return null;
    const v=Object.assign({code:s.id}, s.data());
    if(v.expiresAt){ const expMs=(v.expiresAt.seconds)?v.expiresAt.seconds*1000:new Date(v.expiresAt).getTime(); v.isExpired = !isNaN(expMs) && Date.now()>expMs; }
    return v;
  }catch(e){ return null; }
}
async function getStaffOutlet(){
  if(!user) return '';
  try{ const s=await getDoc(doc(db,'staff',user.uid)); if(s.exists()){ const d=s.data(); return d.outlet||d.name||''; } }catch(e){}
  return '';
}
async function markVoucherUsed(code){
  code=(code||'').trim().toUpperCase(); if(!code) throw {message:'Kode kosong.'};
  const outlet=await getStaffOutlet();
  let data={};
  try{ const s=await getDoc(doc(db,'vouchers',code)); if(s.exists()) data=s.data(); }catch(e){}
  if(data.expiresAt){ const expMs=(data.expiresAt.seconds)?data.expiresAt.seconds*1000:new Date(data.expiresAt).getTime(); if(!isNaN(expMs) && Date.now()>expMs) throw {message:'Voucher ini udah kadaluarsa, gak bisa dipakai lagi.'}; }
  await setDoc(doc(db,'vouchers',code), { status:'terpakai', usedAt: serverTimestamp(), usedOutlet:outlet, usedBy:(user?user.uid:'') }, {merge:true});
  pushToSheet({ type:'voucher', waktu:new Date().toISOString(), outlet:outlet, kode:code, title:data.title||'', nama:data.name||'', uid:data.uid||'' });
}
async function getMemberByUid(uid){
  uid=(uid||'').trim(); if(!uid) return null;
  try{ const s=await getDoc(doc(db,'users',uid)); if(!s.exists()) return null; const d=s.data();
    return { uid:uid, name:d.name||'', phone:d.phone||'', points:(typeof d.points==='number')?d.points:0 }; }
  catch(e){ return null; }
}
async function getOrCreateMemberCode(){
  if(!auth.currentUser) throw {message:'Belum login.'};
  const uid=auth.currentUser.uid;
  try{
    const uSnap=await getDoc(doc(db,'users',uid));
    if(uSnap.exists() && uSnap.data().memberCode) return uSnap.data().memberCode;
  }catch(e){}
  for(let i=0;i<8;i++){
    const code=String(Math.floor(100000+Math.random()*900000)); // 6 digit
    try{
      const existing=await getDoc(doc(db,'memberCodes',code));
      if(existing.exists()) continue;
      await setDoc(doc(db,'memberCodes',code), { uid:uid, createdAt:serverTimestamp() });
      await setDoc(doc(db,'users',uid), { memberCode:code }, {merge:true});
      return code;
    }catch(e){ continue; }
  }
  throw {message:'Gagal bikin kode member, coba lagi.'};
}
async function getMemberByCode(code){
  code=(code||'').trim().replace(/\D/g,'');
  if(!code) return null;
  try{
    const cSnap=await getDoc(doc(db,'memberCodes',code));
    if(!cSnap.exists()) return null;
    return await getMemberByUid(cSnap.data().uid);
  }catch(e){ return null; }
}
const EARN_PER_POINT = 4000;   // Rp per 1 poin
async function awardPoints(uid, nominal){
  uid=(uid||'').trim(); nominal=Math.max(0, Math.floor(Number(nominal)||0));
  if(!uid) throw {message:'UID kosong.'};
  if(nominal<=0) throw {message:'Nominal belanja tidak valid.'};
  const pts=Math.floor(nominal/EARN_PER_POINT);
  if(pts<=0) throw {message:'Belanja minimal Rp'+EARN_PER_POINT.toLocaleString('id-ID')+' untuk dapat 1 poin.'};
  const outlet=await getStaffOutlet();
  const uref=doc(db,'users',uid); let newTotal=0, mname='';
  await runTransaction(db, async (tx)=>{
    const us=await tx.get(uref);
    if(!us.exists()) throw {message:'Member tidak ditemukan.'};
    const d=us.data(); const cur=(typeof d.points==='number')?d.points:0; mname=d.name||'';
    newTotal=cur+pts;
    tx.set(uref,{ points:newTotal, lastTxnAt:serverTimestamp(), updatedAt:serverTimestamp() },{merge:true});
    tx.set(doc(db,'leaderboard',uid), { name:mname, points:newTotal, updatedAt:serverTimestamp() }, {merge:true});
    const tref=doc(collection(db,'transactions'));
    tx.set(tref,{ uid:uid, name:mname, nominal:nominal, points:pts, outlet:outlet, staffUid:(user?user.uid:''), createdAt:serverTimestamp() });
  });
  pushToSheet({ type:'txn', waktu:new Date().toISOString(), outlet:outlet, nama:mname, uid:uid, nominal:nominal, poin:pts });
  try{ await maybePayReferral(uid); }catch(e){}
  return { points:pts, newTotal:newTotal, outlet:outlet };
}

// ---------- kategori Menu POS (posCategories/{id}) — tipe 'utama' (base) atau 'addon' (topping/lilin/dll) ----------
async function listPosCategories(){
  try{
    const snap=await getDocs(query(collection(db,'posCategories'), limit(100)));
    const arr=[]; snap.forEach(d=>{ const x=d.data(); arr.push({ id:d.id, name:x.name||'', type:(x.type==='addon'?'addon':'utama'), sortOrder:(typeof x.sortOrder==='number')?x.sortOrder:0 }); });
    arr.sort((a,b)=> (a.sortOrder-b.sortOrder) || a.name.localeCompare(b.name));
    return arr;
  }catch(e){ return []; }
}
async function savePosCategory(id, patch){
  if(!(await isSuper())) throw {message:'Khusus admin utama.'}; patch=patch||{};
  if(!id){ const t=(patch.name||'').trim(); if(!t) throw {message:'Nama kategori wajib.'}; id=slug(t)+'-'+Date.now().toString(36); }
  const data={};
  if(patch.name!=null) data.name=String(patch.name).trim();
  if(patch.type!=null) data.type=(patch.type==='addon'?'addon':'utama');
  if(patch.sortOrder!=null && patch.sortOrder!=='') data.sortOrder=Math.floor(Number(patch.sortOrder)||0);
  data.updatedAt=serverTimestamp();
  await setDoc(doc(db,'posCategories',id), data, {merge:true});
  return { id:id };
}
async function deletePosCategory(id){ if(!(await isMaster())) throw {message:'Khusus Master.'}; await deleteDoc(doc(db,'posCategories',(id||'').trim())); }

// ---------- katalog produk POS (products/{id}) ----------
async function listProductsAdmin(){
  try{
    const snap=await getDocs(query(collection(db,'products'), limit(300)));
    const arr=[]; snap.forEach(d=>{ const x=d.data(); arr.push({ id:d.id, name:x.name||'', categoryId:x.categoryId||'', categoryName:x.categoryName||'', categoryType:(x.categoryType==='addon'?'addon':'utama'), price:(typeof x.price==='number')?x.price:0, imageUrl:x.imageUrl||'', active:x.active!==false, sortOrder:(typeof x.sortOrder==='number')?x.sortOrder:0 }); });
    arr.sort((a,b)=> (a.sortOrder-b.sortOrder) || a.name.localeCompare(b.name));
    return arr;
  }catch(e){ return []; }
}
async function listProductsPublic(){
  try{
    const snap=await getDocs(query(collection(db,'products'), where('active','==',true), limit(300)));
    const arr=[]; snap.forEach(d=>{ const x=d.data(); arr.push({ id:d.id, name:x.name||'', categoryId:x.categoryId||'', categoryName:x.categoryName||'', categoryType:(x.categoryType==='addon'?'addon':'utama'), price:(typeof x.price==='number')?x.price:0, imageUrl:x.imageUrl||'', sortOrder:(typeof x.sortOrder==='number')?x.sortOrder:0 }); });
    arr.sort((a,b)=> (a.sortOrder-b.sortOrder) || a.name.localeCompare(b.name));
    return arr;
  }catch(e){ return []; }
}
async function saveProduct(id, patch, imageBlob){
  if(!(await isSuper())) throw {message:'Khusus admin utama.'}; patch=patch||{};
  const isNew=!id;
  if(!id){ const t=(patch.name||'').trim(); if(!t) throw {message:'Nama produk wajib.'}; id=slug(t)+'-'+Date.now().toString(36); }
  const data={};
  if(patch.name!=null) data.name=String(patch.name).trim();
  if(patch.categoryId!=null){
    data.categoryId=String(patch.categoryId).trim();
    // Denormalisasi nama+tipe kategori biar POS gak perlu join tiap kali render
    let cats=[]; try{ cats=await listPosCategories(); }catch(e){}
    const c=cats.find(function(x){ return x.id===data.categoryId; });
    data.categoryName=c?c.name:''; data.categoryType=c?c.type:'utama';
  }
  if(patch.price!=null && patch.price!=='') data.price=Math.max(0,Math.floor(Number(patch.price)||0));
  if(patch.active!=null) data.active=!!patch.active;
  if(patch.sortOrder!=null && patch.sortOrder!=='') data.sortOrder=Math.floor(Number(patch.sortOrder)||0);
  if(imageBlob){
    const sref=storageRef(storage, 'product-images/'+id+'.jpg');
    await uploadBytes(sref, imageBlob, {contentType:'image/jpeg'});
    data.imageUrl=await getDownloadURL(sref);
  }
  data.updatedAt=serverTimestamp();
  if(isNew){ if(data.active==null) data.active=true; data.createdAt=serverTimestamp(); }
  await setDoc(doc(db,'products',id), data, {merge:true});
  return { id:id };
}
async function setProductActive(id, active){ if(!(await isSuper())) throw {message:'Khusus admin utama.'}; await setDoc(doc(db,'products',(id||'').trim()), { active:!!active, updatedAt:serverTimestamp() }, {merge:true}); }
async function deleteProduct(id){ if(!(await isMaster())) throw {message:'Khusus Master.'}; await deleteDoc(doc(db,'products',(id||'').trim())); }

// ---------- transaksi POS (kasir: keranjang produk + member + voucher + metode bayar) ----------
async function recordPosTransaction(opts){
  opts=opts||{};
  const uid=(opts.uid||'').trim();
  const itemsIn=Array.isArray(opts.items)?opts.items:[];
  const paymentMethod=(opts.paymentMethod==='qris'||opts.paymentMethod==='debit')?opts.paymentMethod:'cash';
  const voucherCode=(opts.voucherCode||'').trim().toUpperCase();
  if(!uid) throw {message:'Member belum dipilih.'};
  if(!itemsIn.length) throw {message:'Keranjang masih kosong.'};
  let subtotal=0;
  const items=itemsIn.map(function(it){
    const qty=Math.max(1, Math.floor(Number(it.qty)||1));
    const price=Math.max(0, Math.floor(Number(it.price)||0));
    const lineTotal=qty*price; subtotal+=lineTotal;
    const addons=Array.isArray(it.addons)?it.addons.map(function(a){ return { id:String(a.id||''), name:String(a.name||''), price:Math.max(0,Math.floor(Number(a.price)||0)) }; }):[];
    return { productId:String(it.productId||''), name:String(it.name||''), qty:qty, price:price, subtotal:lineTotal, addons:addons };
  });
  let voucher=null, discount=0, freeItemName='';
  if(voucherCode){
    voucher=await findVoucher(voucherCode);
    if(!voucher) throw {message:'Voucher '+voucherCode+' tidak ditemukan.'};
    if(voucher.status==='terpakai') throw {message:'Voucher ini sudah pernah dipakai.'};
    if(voucher.isExpired) throw {message:'Voucher ini sudah kadaluarsa.'};
    if(voucher.uid && voucher.uid!==uid) throw {message:'Voucher ini bukan milik member yang dipilih.'};
    if(voucher.discType==='percent'){
      discount=Math.floor(subtotal*(Number(voucher.discValue)||0)/100);
      const cap=Number(voucher.discMax)||0; if(cap>0 && discount>cap) discount=cap;
    } else if(voucher.discType==='freeitem'){
      freeItemName=voucher.freeItemName||'';
    }
  }
  const nominal=Math.max(0, subtotal-discount);
  const pts=Math.floor(nominal/EARN_PER_POINT);
  const outlet=await getStaffOutlet();
  const cashReceived = paymentMethod==='cash' ? Math.max(0, Math.floor(Number(opts.cashReceived)||0)) : 0;
  if(paymentMethod==='cash' && cashReceived<nominal) throw {message:'Uang diterima kurang dari total belanja ('+rpFmt(nominal)+').'};
  const change = paymentMethod==='cash' ? (cashReceived-nominal) : 0;
  const uref=doc(db,'users',uid);
  let newTotal=0, mname='';
  await runTransaction(db, async (tx)=>{
    const us=await tx.get(uref);
    if(!us.exists()) throw {message:'Member tidak ditemukan.'};
    const d=us.data(); const cur=(typeof d.points==='number')?d.points:0; mname=d.name||'';
    newTotal=cur+pts;
    tx.set(uref, { points:newTotal, lastTxnAt:serverTimestamp(), updatedAt:serverTimestamp() }, {merge:true});
    tx.set(doc(db,'leaderboard',uid), { name:mname, points:newTotal, updatedAt:serverTimestamp() }, {merge:true});
    const tref=doc(collection(db,'transactions'));
    tx.set(tref, {
      uid:uid, name:mname, nominal:nominal, points:pts, kind:'', outlet:outlet, staffUid:(user?user.uid:''),
      items:items, paymentMethod:paymentMethod, cashReceived:cashReceived, change:Math.max(0,change),
      voucherCode:(voucher?voucherCode:''), voucherDiscount:discount, freeItemName:freeItemName,
      createdAt: serverTimestamp()
    });
    if(voucher){ tx.set(doc(db,'vouchers',voucherCode), { status:'terpakai', usedAt:serverTimestamp(), usedOutlet:outlet, usedBy:(user?user.uid:''), usedVia:'pos' }, {merge:true}); }
  });
  pushToSheet({ type:'txn', waktu:new Date().toISOString(), outlet:outlet, nama:mname, uid:uid, nominal:nominal, poin:pts, metode:paymentMethod, voucher:(voucher?voucherCode:'') });
  try{ await maybePayReferral(uid); }catch(e){}
  return { points:pts, newTotal:newTotal, outlet:outlet, nominal:nominal, subtotal:subtotal, discount:discount, change:Math.max(0,change), freeItemName:freeItemName, name:mname, items:items, paymentMethod:paymentMethod, cashReceived:cashReceived, voucherCode:(voucher?voucherCode:'') };
}

// ---------- katalog menu web-order (menuItems/{id}) — TERPISAH dari products (POS) ----------
async function listMenuItemsAdmin(){
  const byId={};
  try{ (window.OMA_MENU||[]).forEach(function(m){ byId[m.id]={ id:m.id, cat:m.cat||'', name:m.name||'', price:m.price||0, desc:m.desc||'', imageUrl:m.img||'', avail:m.avail!==false, sortOrder:0, fromStatic:true }; }); }catch(e){}
  try{
    const snap=await getDocs(query(collection(db,'menuItems'), limit(300)));
    snap.forEach(d=>{ const x=d.data(); byId[d.id]=Object.assign({}, byId[d.id]||{}, { id:d.id, cat:x.cat||(byId[d.id]?byId[d.id].cat:''), name:x.name||(byId[d.id]?byId[d.id].name:''), price:(typeof x.price==='number')?x.price:(byId[d.id]?byId[d.id].price:0), desc:(x.desc!=null?x.desc:(byId[d.id]?byId[d.id].desc:'')), imageUrl:(x.imageUrl||(byId[d.id]?byId[d.id].imageUrl:'')), avail:x.avail!==false, sortOrder:(typeof x.sortOrder==='number')?x.sortOrder:0, fromStatic:false }); });
  }catch(e){}
  const arr=Object.keys(byId).map(function(k){ return byId[k]; });
  arr.sort((a,b)=> (a.sortOrder-b.sortOrder) || a.cat.localeCompare(b.cat) || a.name.localeCompare(b.name));
  return arr;
}
async function listMenuItemsPublic(){
  try{
    const snap=await getDocs(query(collection(db,'menuItems'), limit(300)));
    const arr=[]; snap.forEach(d=>{ const x=d.data(); arr.push({ id:d.id, cat:x.cat||'', name:x.name||'', price:(typeof x.price==='number')?x.price:0, desc:x.desc||'', img:x.imageUrl||'', avail:x.avail!==false }); });
    return arr;
  }catch(e){ return []; }
}
async function saveMenuItem(id, patch, imageBlob){
  if(!(await isSuper())) throw {message:'Khusus admin utama.'}; patch=patch||{};
  const isNew=!id;
  if(!id){ const t=(patch.name||'').trim(); if(!t) throw {message:'Nama menu wajib.'}; id=slug((patch.cat||'')+'-'+t)+'-'+Date.now().toString(36); }
  const data={};
  if(patch.cat!=null) data.cat=String(patch.cat).trim();
  if(patch.name!=null) data.name=String(patch.name).trim();
  if(patch.price!=null && patch.price!=='') data.price=Math.max(0,Math.floor(Number(patch.price)||0));
  if(patch.desc!=null) data.desc=String(patch.desc).trim();
  if(patch.avail!=null) data.avail=!!patch.avail;
  if(patch.sortOrder!=null && patch.sortOrder!=='') data.sortOrder=Math.floor(Number(patch.sortOrder)||0);
  if(imageBlob){
    const sref=storageRef(storage, 'menu-images/'+id+'.jpg');
    await uploadBytes(sref, imageBlob, {contentType:'image/jpeg'});
    data.imageUrl=await getDownloadURL(sref);
  }
  data.updatedAt=serverTimestamp();
  if(isNew){ if(data.avail==null) data.avail=true; data.createdAt=serverTimestamp(); }
  await setDoc(doc(db,'menuItems',id), data, {merge:true});
  return { id:id };
}
async function setMenuItemAvail(id, avail){ if(!(await isSuper())) throw {message:'Khusus admin utama.'}; await setDoc(doc(db,'menuItems',(id||'').trim()), { avail:!!avail, updatedAt:serverTimestamp() }, {merge:true}); }
async function deleteMenuItem(id){ if(!(await isMaster())) throw {message:'Khusus Master.'}; await deleteDoc(doc(db,'menuItems',(id||'').trim())); }

// ---------- referral & poin pesanan ----------
const REF_REWARD = 25;    // poin untuk pemberi kode tiap referral berhasil
const REF_WELCOME = 25;   // poin welcome untuk pendaftar baru
const REF_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // tanpa O/0 & I/1
function genRefCode(){ var s=''; for(var i=0;i<6;i++) s+=REF_ABC.charAt(Math.floor(Math.random()*REF_ABC.length)); return s; }
async function ensureUniqueRefCode(){
  for(var i=0;i<6;i++){ var c=genRefCode(); try{ const s=await getDoc(doc(db,'refcodes',c)); if(!s.exists()) return c; }catch(e){ return c; } }
  return genRefCode();
}
async function ensureRefCode(){
  if(!user) return '';
  try{
    const uref=doc(db,'users',user.uid); const s=await getDoc(uref);
    if(s.exists() && s.data().refCode) return s.data().refCode;
    const code=await ensureUniqueRefCode();
    await setDoc(uref,{ refCode:code, updatedAt:serverTimestamp() },{merge:true});
    try{ await setDoc(doc(db,'refcodes',code),{ uid:user.uid, name:(s.exists()?(s.data().name||''):''), createdAt:serverTimestamp() }); }catch(e){}
    return code;
  }catch(e){ return ''; }
}
// kredit poin ke member (dipakai approve pesanan & referral). Dipanggil dari konteks staff/admin.
async function creditMember(uid, delta, info){
  uid=(uid||'').trim(); delta=Math.floor(Number(delta)||0); info=info||{};
  if(!uid || !delta) return null;
  const nom=Math.floor(Number(info.nominal)||0), out=info.outlet||'', kind=info.kind||'adjust';
  const uref=doc(db,'users',uid); let newTotal=0, mname='';
  try{
    await runTransaction(db, async(tx)=>{
      const us=await tx.get(uref); if(!us.exists()) return;
      const d=us.data(); const cur=(typeof d.points==='number')?d.points:0; mname=d.name||'';
      newTotal=Math.max(0, cur+delta);
      const patch={ points:newTotal, updatedAt:serverTimestamp() };
      if(kind==='order') patch.lastTxnAt=serverTimestamp(); // hanya transaksi belanja asli yang hitung "aktif"
      tx.set(uref, patch, {merge:true});
      tx.set(doc(db,'leaderboard',uid), { name:mname, points:newTotal, updatedAt:serverTimestamp() },{merge:true});
      const tref=doc(collection(db,'transactions'));
      tx.set(tref,{ uid:uid, name:mname, nominal:nom, points:delta, outlet:out, kind:kind, staffUid:(user?user.uid:''), createdAt:serverTimestamp() });
    });
    pushToSheet({ type:'txn', waktu:new Date().toISOString(), outlet:out, nama:mname, uid:uid, nominal:nom, poin:delta });
  }catch(e){}
  return { newTotal:newTotal, name:mname };
}
// bayar bonus referral (1x per akun) saat belanja pertama si pendaftar
async function maybePayReferral(uid){
  uid=(uid||'').trim(); if(!uid) return;
  let refBy='';
  try{
    const uref=doc(db,'users',uid);
    await runTransaction(db, async(tx)=>{                 // klaim atomik biar gak dobel
      const us=await tx.get(uref); if(!us.exists()){ refBy=''; return; }
      const d=us.data(); const rb=(d.referredBy||'').trim();
      if(!rb || d.refRewarded===true || rb===uid){ refBy=''; return; }
      refBy=rb; tx.set(uref,{ refRewarded:true, updatedAt:serverTimestamp() },{merge:true});
    });
    if(!refBy) return;
    await creditMember(uid, REF_WELCOME, { kind:'referral', nominal:0, outlet:'Referral (welcome)' });
    await creditMember(refBy, REF_REWARD, { kind:'referral', nominal:0, outlet:'Referral' });
  }catch(e){}
}
// kasih poin saat pesanan di-approve (sekali saja), lalu cek referral
async function awardOrderPoints(id, d){
  try{
    if(!d || d.pointsAwarded===true) return;
    const total=Math.floor(Number(d.total)||0);
    const pts=Math.floor(total/EARN_PER_POINT);
    let uid=(d.uid||'').trim();
    if(!uid){ try{ const m=await getMemberByPhone(d.telp||''); if(m) uid=m.uid; }catch(e){} }
    await setDoc(doc(db,'orders',id), { pointsAwarded:true, awardedUid:uid||'', awardedPts:(uid?pts:0), updatedAt:serverTimestamp() }, {merge:true});
    if(uid && pts>0) await creditMember(uid, pts, { kind:'order', nominal:total, outlet:d.outlet||'Pesanan web' });
    if(uid) await maybePayReferral(uid);
  }catch(e){}
}
async function getStaffInfo(){
  if(!user) return null;
  try{ const s=await getDoc(doc(db,'staff',user.uid)); if(!s.exists()) return null; const d=s.data(); return { outlet:d.outlet||d.name||'', admin: d.admin===true, super: d.super===true, master: d.master===true, hrd: d.hrd===true }; }catch(e){ return null; }
}
async function listTransactions(outlet){
  try{
    const q = outlet ? query(collection(db,'transactions'), where('outlet','==',outlet)) : collection(db,'transactions');
    const snap = await getDocs(q); const arr=[];
    snap.forEach(d=>{ const x=d.data(); arr.push({ id:d.id, uid:x.uid||'', name:x.name||'', nominal:x.nominal||0, points:x.points||0, kind:x.kind||'', outlet:x.outlet||'', ts:(x.createdAt&&x.createdAt.seconds)?x.createdAt.seconds*1000:0 }); });
    arr.sort((a,b)=>b.ts-a.ts); return arr;
  }catch(e){ return []; }
}
async function avgTransactionStats(fromMs, toMs){
  let txs=[];
  try{ const snap=await getDocs(collection(db,'transactions')); snap.forEach(d=>{ const x=d.data(); const ts=(x.createdAt&&x.createdAt.seconds)?x.createdAt.seconds*1000:0; txs.push({ outlet:(x.outlet||'').trim(), nominal:x.nominal||0, ts:ts }); }); }catch(e){ return { overall:{avg:0,count:0,total:0}, byOutlet:[] }; }
  txs=txs.filter(t=> t.nominal>0 && (!fromMs || t.ts>=fromMs) && (!toMs || t.ts<=toMs));
  const validKeys={}; (window.OMA_OUTLETS||[]).forEach(o=>{ if(o&&o.name){ const k=o.name.toLowerCase().replace(/^oma opa cakery\s*/i,'').replace(/\s+/g,' ').trim(); if(k) validKeys[k]=o.name; } });
  const byOutlet={};
  txs.forEach(t=>{ const key=t.outlet.toLowerCase().replace(/^oma opa cakery\s*/i,'').replace(/\s+/g,' ').trim(); if(!key || !validKeys[key]) return; if(!byOutlet[key]) byOutlet[key]={name:validKeys[key],count:0,total:0}; byOutlet[key].count++; byOutlet[key].total+=t.nominal; });
  const rows=Object.keys(byOutlet).map(k=>{ const o=byOutlet[k]; return { outlet:o.name, count:o.count, total:o.total, avg: o.count?Math.round(o.total/o.count):0 }; });
  rows.sort((a,b)=>b.total-a.total);
  const totalCount=txs.length, totalNominal=txs.reduce((s,t)=>s+t.nominal,0);
  return { overall:{ avg: totalCount?Math.round(totalNominal/totalCount):0, count:totalCount, total:totalNominal }, byOutlet:rows };
}
async function memberOutletSummary(outletNames){
  const cutoff=new Date(Date.now()-30*86400000);
  const names=(outletNames||[]).slice(0,30);
  try{
    let total=0, active=0;
    if(!names.length){
      total=(await getCountFromServer(collection(db,'users'))).data().count;
      active=(await getCountFromServer(query(collection(db,'users'), where('lastTxnAt','>=',cutoff)))).data().count;
    } else {
      total=(await getCountFromServer(query(collection(db,'users'), where('homeOutlet','in',names)))).data().count;
      active=(await getCountFromServer(query(collection(db,'users'), where('homeOutlet','in',names), where('lastTxnAt','>=',cutoff)))).data().count;
    }
    // kecualiin staff yang kebetulan juga punya akun member, biar konsisten sama hitungan di Ringkasan
    try{
      const staffSnap=await getDocs(collection(db,'staff'));
      for(const d of staffSnap.docs){
        const uSnap=await getDoc(doc(db,'users',d.id));
        if(!uSnap.exists()) continue;
        const ud=uSnap.data();
        if(names.length && names.indexOf(ud.homeOutlet)<0) continue;
        total=Math.max(0,total-1);
        if(ud.lastTxnAt && ud.lastTxnAt.toMillis && ud.lastTxnAt.toMillis()>=cutoff.getTime()) active=Math.max(0,active-1);
      }
    }catch(e){}
    return { total:total, active:active, ok:true };
  }catch(e){ return { total:0, active:0, ok:false, error:(e&&e.message)||String(e) }; }
}
async function backfillNameLower(){
  if(!(await isMaster())) throw {message:'Khusus Master.'};
  let n=0;
  try{
    const snap=await getDocs(collection(db,'users'));
    for(const d of snap.docs){
      const x=d.data();
      if(x.nameLower) continue;
      const nl=(x.name||'').trim().toLowerCase();
      if(!nl) continue;
      try{ await setDoc(doc(db,'users',d.id), { nameLower:nl }, {merge:true}); n++; }catch(e){}
    }
  }catch(e){}
  logAudit('backfill_namelower', 'Migrasi nameLower buat pencarian member ('+n+' member terupdate).');
  return { count:n };
}
async function backfillLastTxnAt(){
  if(!(await isMaster())) throw {message:'Khusus Master.'};
  let txs=[];
  try{ const snap=await getDocs(collection(db,'transactions')); snap.forEach(d=>{ const x=d.data(); if(x.kind!=='order' && x.kind) return; if(!x.uid) return; const ts=(x.createdAt&&x.createdAt.seconds)?x.createdAt.seconds*1000:0; txs.push({uid:x.uid, ts:ts}); }); }catch(e){}
  const last={}; txs.forEach(t=>{ if(!last[t.uid]||t.ts>last[t.uid]) last[t.uid]=t.ts; });
  let n=0;
  for(const uid of Object.keys(last)){
    try{ await setDoc(doc(db,'users',uid), { lastTxnAt:new Date(last[uid]) }, {merge:true}); n++; }catch(e){}
  }
  logAudit('backfill_lasttxn', 'Migrasi lastTxnAt dari riwayat transaksi ('+n+' member terupdate).');
  return { count:n };
}
async function repeatRateByOutlet(months){
  months = Math.max(1, Number(months)||1);
  const cutoff=(function(){ const d=new Date(); d.setMonth(d.getMonth()-months); return d.getTime(); })();
  const validKeys={}; (window.OMA_OUTLETS||[]).forEach(o=>{ if(o&&o.name){ const k=o.name.toLowerCase().replace(/^oma opa cakery\s*/i,'').replace(/\s+/g,' ').trim(); if(k) validKeys[k]=o.name; } });
  let txs=[];
  try{ const snap=await getDocs(collection(db,'transactions')); snap.forEach(d=>{ const x=d.data(); const ts=(x.createdAt&&x.createdAt.seconds)?x.createdAt.seconds*1000:0; txs.push({ uid:x.uid||'', outlet:(x.outlet||'').trim(), kind:x.kind||'', ts:ts }); }); }catch(e){ return []; }
  const byOutlet={};
  txs.forEach(t=>{ if(t.ts<cutoff) return; if(!t.uid) return; if(t.kind==='referral' || t.kind==='bonus') return; const o=t.outlet; if(!o) return;
    const key=o.toLowerCase().replace(/^oma opa cakery\s*/i,'').replace(/\s+/g,' ').trim();
    if(!validKeys[key]) return;
    if(!byOutlet[key]) byOutlet[key]={ name:validKeys[key], m:{} }; byOutlet[key].m[t.uid]=(byOutlet[key].m[t.uid]||0)+1; });
  const rows=[];
  Object.keys(byOutlet).forEach(k=>{ const g=byOutlet[k]; const m=g.m; const uids=Object.keys(m); const total=uids.length; const repeat=uids.filter(u=>m[u]>=2).length; const visits=uids.reduce((s,u)=>s+m[u],0); rows.push({ outlet:g.name, totalMembers:total, repeatMembers:repeat, visits:visits, rate:(total?(repeat/total):0) }); });
  rows.sort((a,b)=>b.totalMembers-a.totalMembers);
  return rows;
}
// ===== Traffic & Online (Firestore-only, rollup harian) =====
function _today(){ return _ymd(new Date()); }
async function trackVisit(){
  try{
    if(typeof sessionStorage!=='undefined'){ if(sessionStorage.getItem('oo_visited')) return; sessionStorage.setItem('oo_visited','1'); }
    const today=_today(); const h=new Date().getHours();
    const patch={ date:today, count:increment(1) }; patch[user?'members':'guests']=increment(1); patch['h'+h]=increment(1);
    await setDoc(doc(db,'stats','d_'+today), patch, {merge:true});
  }catch(e){}
}
let _presId=null, _presTimer=null;
function startPresence(){
  try{
    if(typeof sessionStorage==='undefined') return;
    if(!_presId){ _presId=sessionStorage.getItem('oo_pres')||('p_'+Date.now().toString(36)+Math.random().toString(36).slice(2,8)); sessionStorage.setItem('oo_pres',_presId); }
    const beat=function(){ try{ setDoc(doc(db,'presence',_presId), { lastSeen:serverTimestamp(), member:!!user, uid:(user?user.uid:'') }, {merge:true}); }catch(e){} };
    beat(); if(_presTimer) clearInterval(_presTimer); _presTimer=setInterval(beat, 45000);
    try{ window.addEventListener('beforeunload', function(){ try{ deleteDoc(doc(db,'presence',_presId)); }catch(e){} }); }catch(e){}
  }catch(e){}
}
async function getOnlineCount(){
  try{ const snap=await getDocs(collection(db,'presence')); const now=Date.now(); let total=0, members=0;
    snap.forEach(d=>{ const x=d.data(); const ls=(x.lastSeen&&x.lastSeen.seconds)?x.lastSeen.seconds*1000:0; if(now-ls<=90000){ total++; if(x.member) members++; } });
    return { total:total, members:members };
  }catch(e){ return { total:0, members:0 }; }
}
async function getTrafficStats(fromYmd, toYmd){
  try{
    const q=query(collection(db,'stats'), where('date','>=',fromYmd), where('date','<=',toYmd));
    const snap=await getDocs(q); let total=0, guests=0, members=0; const hours=new Array(24).fill(0); const series={};
    snap.forEach(d=>{ const x=d.data(); if(!x.date) return; total+=(x.count||0); guests+=(x.guests||0); members+=(x.members||0); for(let h=0;h<24;h++){ hours[h]+=(x['h'+h]||0); } series[x.date]=(x.count||0); });
    return { total:total, guests:guests, members:members, hours:hours, series:series };
  }catch(e){ return { total:0, guests:0, members:0, hours:new Array(24).fill(0), series:{} }; }
}
async function listUsedVouchers(outlet){
  try{
    const q = query(collection(db,'vouchers'), where('status','==','terpakai'));
    const snap = await getDocs(q); const arr=[];
    snap.forEach(d=>{ const x=d.data(); const o=x.usedOutlet||''; if(outlet && o!==outlet) return; arr.push({ code:d.id, title:x.title||'', name:x.name||'', uid:x.uid||'', outlet:o, ts:(x.usedAt&&x.usedAt.seconds)?x.usedAt.seconds*1000:0 }); });
    arr.sort((a,b)=>b.ts-a.ts); return arr;
  }catch(e){ return []; }
}
// ---- leaderboard / skor / riwayat (cermin publik: hanya nama + angka) ----
function mirrorLeaderboard(name, pts){
  if(!user) return;
  try{ setDoc(doc(db,'leaderboard',user.uid), { name:name||'', points:(typeof pts==='number'?pts:0), staff:staffFlag, updatedAt:serverTimestamp() }, {merge:true}); }catch(e){}
}
async function listPointLeaderboard(n){
  n=n||50;
  try{
    const q=query(collection(db,'leaderboard'), orderBy('points','desc'), limit(n+15));
    const snap=await getDocs(q); const arr=[];
    snap.forEach(d=>{ const x=d.data(); if(x.staff===true) return; arr.push({ uid:d.id, name:x.name||'Sahabat', points:(typeof x.points==='number')?x.points:0 }); });
    return arr.slice(0,n);
  }catch(e){ return []; }
}
async function submitScore(score){
  score=Math.round(Number(score)||0);
  if(!user || score<=0) return null;
  const nm=(profile&&profile.name)||user.displayName||'';
  const ref=doc(db,'scores',user.uid);
  try{
    const s=await getDoc(ref); const prev=(s.exists()&&typeof s.data().score==='number')?s.data().score:0;
    if(score>prev){ await setDoc(ref,{ name:nm, score:score, staff:staffFlag, updatedAt:serverTimestamp() },{merge:true}); return {best:score, prev:prev, improved:true}; }
    return {best:prev, prev:prev, improved:false};
  }catch(e){ return null; }
}
async function listScoreLeaderboard(n){
  n=n||50;
  try{
    const q=query(collection(db,'scores'), orderBy('score','desc'), limit(n+15));
    const snap=await getDocs(q); const arr=[];
    snap.forEach(d=>{ const x=d.data(); if(x.staff===true) return; arr.push({ uid:d.id, name:x.name||'Pemain', score:(typeof x.score==='number')?x.score:0 }); });
    return arr.slice(0,n);
  }catch(e){ return []; }
}
async function listMyTransactions(){
  if(!user) return [];
  try{
    const q=query(collection(db,'transactions'), where('uid','==',user.uid));
    const snap=await getDocs(q); const arr=[];
    snap.forEach(d=>{ const x=d.data(); arr.push({ id:d.id, nominal:x.nominal||0, points:x.points||0, outlet:x.outlet||'', ts:(x.createdAt&&x.createdAt.seconds)?x.createdAt.seconds*1000:0 }); });
    arr.sort((a,b)=>b.ts-a.ts); return arr;
  }catch(e){ return []; }
}
function escHtml(s){ return String(s==null?'':s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
function rpFmt(n){ try{ return 'Rp'+Number(n||0).toLocaleString('id-ID'); }catch(e){ return 'Rp'+n; } }
function dtFmt(ts){ try{ return ts?new Date(ts).toLocaleString('id-ID',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):'-'; }catch(e){ return '-'; } }
function ensureQRLib(){
  return new Promise((res,rej)=>{
    if(window.QRCode) return res();
    const s=document.createElement('script');
    s.src='https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
    s.onload=()=>res(); s.onerror=()=>rej(new Error('QR lib gagal dimuat'));
    document.head.appendChild(s);
  });
}

const styleR = document.createElement('style');
styleR.textContent = `
.rw-pts{display:block;width:max-content;margin:6px auto 12px;background:#fff;border:2px solid #F1E4CC;border-radius:999px;padding:6px 16px;font-weight:900;color:#7A5A12}
.rw-item{display:flex;align-items:center;gap:10px;background:#fff;border:2px solid #EFE2C4;border-radius:14px;padding:10px 12px;margin-bottom:9px}
.rw-info{flex:1;min-width:0}
.rw-t{font-weight:800;color:${CO};font-size:.92rem}
.rw-n{font-size:.72rem;color:#9a7a5e;font-weight:700;margin-top:1px}
.rw-c{font-size:.72rem;font-weight:900;color:#C98A1B;text-align:right;margin-bottom:4px}
.rw-btn{border:none;background:${K};color:${CO};font-weight:900;border-radius:10px;padding:7px 14px;font-size:.84rem;cursor:pointer;box-shadow:0 2px 0 ${KD};font-family:inherit}
.rw-btn:active{transform:translateY(2px);box-shadow:0 0 0 ${KD}}
.rw-btn[disabled]{background:#EFEDE6;color:#A9A498;box-shadow:none;cursor:default}
.rw-voucher{background:#fff;border:2px dashed #E5A100;border-radius:14px;padding:11px 13px;margin-bottom:9px}
.rw-vt{font-weight:800;color:${CO};font-size:.9rem}
.rw-vc{font-family:monospace;font-size:1.05rem;font-weight:800;letter-spacing:1px;color:#7A5A12;margin:3px 0}
.rw-vs{display:inline-block;font-size:.7rem;font-weight:900;border-radius:999px;padding:2px 9px}
.rw-vs.aktif{background:#E7F6E7;color:#2E7D32}
.rw-vs.terpakai{background:#F1EDE6;color:#9a8b78}
.rw-empty{text-align:center;color:#b59a7e;font-weight:700;font-size:.85rem;padding:18px 6px}
.rw-banner{background:#E7F6E7;color:#2E7D32;border-radius:11px;padding:9px 11px;font-size:.82rem;font-weight:800;text-align:center;margin-bottom:10px}
.rw-item{align-items:stretch}
.rw-ic{width:46px;height:46px;border-radius:13px;display:flex;align-items:center;justify-content:center;flex:0 0 auto;align-self:center}
.rw-act{display:flex;flex-direction:column;align-items:flex-end;justify-content:center;gap:5px;min-width:86px}
.rw-act .rw-c{margin-bottom:0}
.rw-stock{font-size:.66rem;font-weight:800;color:#9a7a5e;margin-top:6px}
.rw-bar{height:6px;background:#EFE6D2;border-radius:999px;overflow:hidden;margin-top:3px}
.rw-bar>span{display:block;height:100%;background:linear-gradient(90deg,#FFC21A,#E0915B);border-radius:999px;transition:width .4s}
.rw-badge{display:inline-block;font-size:.6rem;font-weight:900;background:#FFE2E2;color:#C0392B;border-radius:999px;padding:1px 7px;margin-left:4px;vertical-align:middle}
.rw-item.rw-out{opacity:.6}
.lb-body{max-height:60vh;overflow:auto;margin-top:4px}
.lb-loading,.lb-empty{text-align:center;color:#b59a7e;font-weight:700;font-size:.85rem;padding:22px 8px;line-height:1.5}
.lb-pts{display:block;width:max-content;margin:2px auto 12px;background:#fff;border:2px solid #F1E4CC;border-radius:999px;padding:6px 16px;font-weight:900;color:#7A5A12}
.lb-row{display:flex;align-items:center;gap:10px;background:#fff;border:2px solid #EFE2C4;border-radius:13px;padding:9px 12px;margin-bottom:7px}
.lb-row.lb-me{border-color:#FFC21A;background:#FFFBEC}
.lb-rank{font-weight:900;color:#C98A1B;min-width:28px;text-align:center;font-size:.98rem}
.lb-name{flex:1;min-width:0;font-weight:800;color:#5A3017;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lb-youtag{font-size:.58rem;font-weight:900;background:#FFC21A;color:#5A3A05;border-radius:999px;padding:1px 7px;vertical-align:middle;margin-left:4px}
.lb-val{font-weight:900;color:#7A5A12;font-size:.9rem;white-space:nowrap}
.hs-item{display:flex;align-items:center;justify-content:space-between;gap:10px;background:#fff;border:2px solid #EFE2C4;border-radius:13px;padding:9px 12px;margin-bottom:7px}
.hs-out{font-weight:800;color:#5A3017;font-size:.9rem}
.hs-date{font-size:.7rem;color:#9a7a5e;font-weight:700;margin-top:1px}
.hs-nom{font-weight:900;color:#5A3017;font-size:.9rem;text-align:right}
.hs-pts{font-size:.72rem;color:#2E7D32;font-weight:900;text-align:right;margin-top:1px}
`;
document.head.appendChild(styleR);

const rwBk = document.createElement('div');
rwBk.className='oo-bk';
rwBk.innerHTML = `<div class="oo-card" style="position:relative">
  <button class="oo-x" id="rwX">×</button>
  <div class="oo-h">Tukar Poin 🎁</div>
  <div class="rw-pts" id="rwPts">🪙 0 poin</div>
  <div class="oo-tabs">
    <div class="oo-tab" data-rt="katalog">Katalog</div>
    <div class="oo-tab" data-rt="voucher">Voucher Saya</div>
  </div>
  <div id="rwBanner"></div>
  <div id="rwBody"></div>
</div>`;
function mountRw(){ if(!document.body.contains(rwBk)) document.body.appendChild(rwBk); }
if(document.body) mountRw(); else document.addEventListener('DOMContentLoaded', mountRw);
let rwTab='katalog', rwBanner='';
function openRewards(){ mountRw(); rwTab='katalog'; rwBanner=''; renderRewards(); rwBk.classList.add('show'); refreshStock(); }
function openVouchers(){ mountRw(); rwTab='voucher'; rwBanner=''; renderRewards(); rwBk.classList.add('show'); }
function closeRewards(){ rwBk.classList.remove('show'); rwBanner=''; }
function refreshStock(){ loadRewardCatalog().then(()=>{ if(rwBk.classList.contains('show') && rwTab==='katalog') renderRewards(); }); }
rwBk.querySelector('#rwX').onclick = closeRewards;
rwBk.addEventListener('click', e=>{ if(e.target===rwBk) closeRewards(); });
rwBk.querySelectorAll('.oo-tab').forEach(t=> t.onclick = ()=>{ rwTab=t.dataset.rt; rwBanner=''; renderRewards(); if(rwTab==='katalog') refreshStock(); });

function renderRewards(){
  const rp=rwBk.querySelector('#rwPts'); if(rp) rp.innerHTML='🪙 '+points+' poin';
  rwBk.querySelectorAll('.oo-tab').forEach(t=> t.classList.toggle('on', t.dataset.rt===rwTab));
  const ban=rwBk.querySelector('#rwBanner'); if(ban) ban.innerHTML = rwBanner? `<div class="rw-banner">${rwBanner}</div>`:'';
  const body=rwBk.querySelector('#rwBody'); if(!body) return;
  if(rwTab==='katalog'){
    body.innerHTML = (rewardCatalog||defaultRewards()).filter(rw=>rw.active!==false).map(rw=>{
      const claimed = rewardStock[rw.id]||0;
      const lim = rw.limit||0;
      const remain = lim ? Math.max(0, lim-claimed) : null;
      const habis = remain!==null && remain<=0;
      const low = remain!==null && remain>0 && remain<=Math.max(10, Math.round(lim*0.1));
      const enough = !!user && points>=rw.cost;
      const label = !user ? 'Masuk' : (habis ? 'Habis' : (enough ? 'Tukar' : 'Kurang'));
      const dis = (!user) ? '' : ((habis||!enough) ? 'disabled' : '');
      const pct = lim ? Math.min(100, Math.round(claimed/lim*100)) : 0;
      const stockTxt = remain===null ? '' : (habis ? '🚫 Stok habis' : ('Sisa '+remain+' / '+lim+' pcs'));
      return `<div class="rw-item${habis?' rw-out':''}">`
        +rewardIcon(rw)
        +`<div class="rw-info"><div class="rw-t">${rw.title}${low?' <span class="rw-badge">Hampir habis!</span>':''}</div>`
        +`${rw.note?`<div class="rw-n">${rw.note}</div>`:''}`
        +`${remain!==null?`<div class="rw-stock">${stockTxt}</div><div class="rw-bar"><span style="width:${pct}%"></span></div>`:''}</div>`
        +`<div class="rw-act"><div class="rw-c">${rw.cost} poin</div>`
        +`<button class="rw-btn" data-rid="${rw.id}" ${dis}>${label}</button></div></div>`;
    }).join('') + `<div class="oo-mini"><b>Maksimal tukar 1 reward per hari per akun.</b> Stok terbatas — siapa cepat dia dapat! Tunjukkan kode/QR voucher ke kasir Oma Opa.</div><div class="oo-tc">Jumlah poin & ketentuan reward sepenuhnya kebijakan Oma Opa Cakery dan dapat berubah sewaktu-waktu. Poin dari kecurangan atau pemanfaatan celah dapat dibatalkan & akun ditangguhkan.</div>`;
  } else {
    body.innerHTML = `<div class="rw-empty">Memuat voucher…</div>`;
    listVouchers().then(list=>{
      if(rwTab!=='voucher') return;
      if(!user){ body.innerHTML = `<div class="rw-empty">Masuk dulu untuk melihat voucher kamu.</div>`; return; }
      if(!list.length){ body.innerHTML = `<div class="rw-empty">Belum ada voucher.<br>Tukarkan poin di tab Katalog ya!</div>`; return; }
      body.innerHTML = list.map(v=>{
        const st = (v.status==='terpakai')?'terpakai':'aktif';
        return `<div class="rw-voucher"><div class="rw-vt">${v.title||'Voucher'}</div>`
          +`${v.note?`<div class="rw-n">${v.note}</div>`:''}`
          +`<div class="rw-vc">${v.code||'-'}</div>`
          +`<span class="rw-vs ${st}">${st==='aktif'?'Aktif':'Sudah dipakai'}</span>`
          +(st==='aktif'?`<div class="vqr" data-vq="${v.code}" style="width:122px;height:122px;margin:9px auto 0;background:#fff;border:1.5px solid #F1E4CC;border-radius:11px;display:flex;align-items:center;justify-content:center"></div>`:'')
          +`</div>`;
      }).join('');
      ensureQRLib().then(()=>{ body.querySelectorAll('.vqr').forEach(el=>{ if(el.dataset.done)return; el.dataset.done='1'; el.innerHTML=''; try{ new QRCode(el,{text:'OMAOPA:VOUCHER:'+el.dataset.vq, width:114, height:114, correctLevel:QRCode.CorrectLevel.H}); }catch(e){} }); }).catch(()=>{});
    });
  }
}
rwBk.querySelector('#rwBody').addEventListener('click', async (e)=>{
  const b=e.target.closest('[data-rid]'); if(!b) return;
  if(!user){ closeRewards(); openLogin(); return; }
  const rid=b.dataset.rid; const rw=(rewardCatalog||defaultRewards()).find(x=>x.id===rid); if(!rw) return;
  if(points<rw.cost){ rwBanner='Poin belum cukup.'; renderRewards(); return; }
  if(!window.confirm('Tukar '+rw.cost+' poin untuk "'+rw.title+'"?')) return;
  b.disabled=true; b.textContent='…';
  try{
    const code = await redeem(rid);
    rwTab='voucher'; rwBanner='Berhasil! Kode voucher: '+code+' — tunjukkan ke kasir.'; renderRewards(); refreshStock();
  }catch(err){ rwBanner=(err&&err.message)||'Gagal menukar.'; renderRewards(); }
});

// ====== Kartu Member (QR) ======
const mcBk = document.createElement('div');
mcBk.className='oo-bk';
mcBk.innerHTML = `<div class="oo-card" style="position:relative;text-align:center">
  <button class="oo-x" id="mcX">×</button>
  <div class="oo-h">Kartu Member 🎫</div>
  <div id="mcName" style="font-weight:900;color:${CO};font-size:1.05rem;margin-bottom:2px"></div>
  <div id="mcTier" style="margin-bottom:6px"></div>
  <div class="rw-pts" id="mcPts">🪙 0 poin</div>
  <div id="mcQR" style="width:200px;height:200px;margin:6px auto 8px;background:#fff;border:2px solid #F1E4CC;border-radius:14px;display:flex;align-items:center;justify-content:center"></div>
  <div class="oo-mini">Tunjukkan QR ini ke kasir buat dapat poin tiap belanja.</div>
  <div style="margin-top:10px;padding:10px;background:#FFF8EC;border:1.5px dashed #E7D8BE;border-radius:12px">
    <div class="oo-mini" style="margin-bottom:4px">Kalau QR gagal discan, kasih kode ini ke kasir:</div>
    <div id="mcCode" style="font-weight:900;font-size:1.3rem;letter-spacing:3px;color:${CO}">••••••</div>
  </div>
  <button class="oo-out" id="mcOut" style="margin-top:12px">Keluar akun</button>
</div>`;
function mountMc(){ if(!document.body.contains(mcBk)) document.body.appendChild(mcBk); }
if(document.body) mountMc(); else document.addEventListener('DOMContentLoaded', mountMc);
mcBk.querySelector('#mcX').onclick = ()=> mcBk.classList.remove('show');
mcBk.querySelector('#mcOut').onclick = async ()=>{ try{ await doSignOut(); }catch(e){} mcBk.classList.remove('show'); };
mcBk.addEventListener('click', e=>{ if(e.target===mcBk) mcBk.classList.remove('show'); });
async function openMemberCard(){
  if(!user){ openLogin(); return; }
  mountMc();
  mcBk.querySelector('#mcName').textContent=(profile&&profile.name)||'Member';
  mcBk.querySelector('#mcPts').innerHTML='🪙 '+points+' poin';
  (async()=>{ try{ const txs=await listMyTransactions(); const spend=txs.reduce((s,t)=>s+(t.nominal||0),0); const tr=tierOf(spend); const el=mcBk.querySelector('#mcTier'); if(el) el.innerHTML='<span style="display:inline-block;background:'+tr.color+';color:#fff;font-weight:900;font-size:.72rem;border-radius:999px;padding:3px 12px">★ '+tr.name+'</span>'; }catch(e){} })();
  const box=mcBk.querySelector('#mcQR'); box.innerHTML='<span style="color:#b59a7e;font-weight:700;font-size:.8rem">Memuat QR…</span>';
  mcBk.classList.add('show');
  try{ await ensureQRLib(); box.innerHTML=''; new QRCode(box,{text:'OMAOPA:MEMBER:'+user.uid, width:188, height:188, correctLevel:QRCode.CorrectLevel.H}); }
  catch(e){ box.innerHTML='<span style="color:#C0392B;font-weight:700;font-size:.8rem">QR gagal dimuat</span>'; }
  (async()=>{ try{ const code=await getOrCreateMemberCode(); const el=mcBk.querySelector('#mcCode'); if(el) el.textContent=code; }catch(e){} })();
}

// ====== Profil (rincian member, read-only) ======
const pfBk = document.createElement('div');
pfBk.className='oo-bk';
pfBk.innerHTML = `<div class="oo-card" style="position:relative">
  <button class="oo-x" id="pfX">×</button>
  <div class="oo-h">Profil Saya 👤</div>
  <div id="pfName" style="font-weight:900;color:${CO};font-size:1.1rem;text-align:center"></div>
  <div id="pfTier" style="text-align:center;margin:4px 0 12px"></div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
    <div style="background:#fff;border:2px solid #EFE2C4;border-radius:13px;padding:10px 12px"><div id="pfPts" style="font-family:Fredoka,sans-serif;font-size:1.3rem;font-weight:700;color:#C98A1B">0</div><div style="font-size:.7rem;font-weight:800;color:#9a7a5e">Poin kamu</div></div>
    <div style="background:#fff;border:2px solid #EFE2C4;border-radius:13px;padding:10px 12px"><div id="pfSpent" style="font-family:Fredoka,sans-serif;font-size:1.15rem;font-weight:700;color:${CO}">Rp0</div><div style="font-size:.7rem;font-weight:800;color:#9a7a5e">Total belanja</div></div>
    <div style="background:#fff;border:2px solid #EFE2C4;border-radius:13px;padding:10px 12px"><div id="pfTx" style="font-family:Fredoka,sans-serif;font-size:1.3rem;font-weight:700;color:${CO}">0</div><div style="font-size:.7rem;font-weight:800;color:#9a7a5e">Transaksi</div></div>
    <div style="background:#fff;border:2px solid #EFE2C4;border-radius:13px;padding:10px 12px"><div id="pfScore" style="font-family:Fredoka,sans-serif;font-size:1.3rem;font-weight:700;color:${CO}">0</div><div style="font-size:.7rem;font-weight:800;color:#9a7a5e">Skor game</div></div>
  </div>
  <div style="font-weight:900;color:${CO};font-size:.9rem;margin:14px 2px 6px">Data diri</div>
  <div id="pfData" style="background:#fff;border:2px solid #EFE2C4;border-radius:13px;padding:2px 12px"></div>
  <div id="pfRefCode" class="oo-ref" style="margin-top:10px"></div>
  <div class="oo-mini" style="margin-top:8px">Data tidak bisa diubah sendiri. Untuk koreksi data, hubungi kasir Oma Opa ya 🙏</div>
  <button class="oo-out" id="pfCard" style="margin-top:12px;background:${K};color:#5A3A05;border-color:${K}">Lihat Kartu Member (QR) →</button>
  <button class="oo-out" id="pfPin" style="margin-top:8px">🔑 Ganti PIN</button>
  <div id="pfPinBox" style="display:none;background:#fff;border:2px solid #EFE2C4;border-radius:13px;padding:12px;margin-top:8px">
    <input class="oo-in" id="pfPinOld" type="password" inputmode="numeric" maxlength="6" placeholder="PIN lama" style="margin-bottom:8px">
    <input class="oo-in" id="pfPinNew" type="password" inputmode="numeric" maxlength="6" placeholder="PIN baru (6 angka)" style="margin-bottom:8px">
    <input class="oo-in" id="pfPin2" type="password" inputmode="numeric" maxlength="6" placeholder="Ulangi PIN baru" style="margin-bottom:8px">
    <div id="pfPinMsg" style="font-size:.8rem;margin-bottom:8px"></div>
    <button class="oo-out" id="pfPinSave" style="background:${K};color:#5A3A05;border-color:${K}">Simpan PIN baru</button>
  </div>
  <button class="oo-out" id="pfOut" style="margin-top:8px">Keluar akun</button>
  <button class="oo-out" id="pfDel" style="margin-top:8px;color:#a11;border-color:#e5b4b4;font-size:.82rem">Hapus akun</button>
</div>`;
function mountPf(){ if(!document.body.contains(pfBk)) document.body.appendChild(pfBk); }
if(document.body) mountPf(); else document.addEventListener('DOMContentLoaded', mountPf);
pfBk.querySelector('#pfX').onclick = ()=> pfBk.classList.remove('show');
pfBk.querySelector('#pfOut').onclick = async ()=>{ try{ await doSignOut(); }catch(e){} pfBk.classList.remove('show'); };
pfBk.querySelector('#pfCard').onclick = ()=>{ pfBk.classList.remove('show'); openMemberCard(); };
pfBk.querySelector('#pfPin').onclick = ()=>{ const b=pfBk.querySelector('#pfPinBox'); b.style.display=(b.style.display==='none'?'block':'none'); };
pfBk.querySelector('#pfPinSave').onclick = async ()=>{
  const q=(id)=>pfBk.querySelector(id); const msg=q('#pfPinMsg');
  const o=q('#pfPinOld').value, n=q('#pfPinNew').value, n2=q('#pfPin2').value;
  msg.style.color='#C0392B';
  if(!validPin(n)){ msg.textContent='PIN baru harus 6 angka.'; return; }
  if(n!==n2){ msg.textContent='Ulangi PIN belum sama.'; return; }
  msg.style.color='#7A5A12'; msg.textContent='Menyimpan…';
  try{ await changeMyPin(o, n); msg.style.color='#1E7A46'; msg.textContent='✓ PIN berhasil diganti!'; q('#pfPinOld').value=''; q('#pfPinNew').value=''; q('#pfPin2').value=''; }
  catch(e){ msg.style.color='#C0392B'; msg.textContent=(e&&e.message)||'Gagal — coba lagi.'; }
};
var _pfDel=pfBk.querySelector('#pfDel'); if(_pfDel) _pfDel.onclick=async ()=>{
  if(!confirm('Hapus akunmu? Poin & riwayat akan hilang PERMANEN dan tidak bisa dikembalikan.')) return;
  var pin=prompt('Ketik PIN kamu untuk konfirmasi hapus akun:');
  if(pin==null || !pin) return;
  try{ await deleteMyAccount(pin); alert('Akunmu sudah dihapus. Sampai jumpa 👋'); try{ location.reload(); }catch(e){} }
  catch(e){ alert((e&&e.message)||'Gagal menghapus akun.'); }
};
pfBk.addEventListener('click', e=>{ if(e.target===pfBk) pfBk.classList.remove('show'); });
async function openProfile(){
  if(!user){ openLogin(); return; }
  mountPf();
  const esc=(s)=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  pfBk.querySelector('#pfName').textContent=(profile&&profile.name)||'Member';
  pfBk.querySelector('#pfPts').textContent=points;
  const ph=(((profile&&profile.phone)||'')+'').replace(/^62/,'0');
  const rows=[['No. HP',ph],['Jenis kelamin',(profile&&profile.gender)||''],['Usia',(profile&&profile.age)||''],['Pekerjaan',(profile&&profile.occupation)||'']];
  pfBk.querySelector('#pfData').innerHTML=rows.map((r,i)=>'<div style="display:flex;justify-content:space-between;gap:10px;padding:9px 0;'+(i?'border-top:1px solid #F2E8D5;':'')+'font-size:.86rem"><span style="color:#9a7a5e;font-weight:700">'+r[0]+'</span><span style="font-weight:800;color:'+CO+';text-align:right">'+esc(r[1]||'-')+'</span></div>').join('');
  var _rc=(profile&&profile.refCode)||'';
  var _rcEl=pfBk.querySelector('#pfRefCode'); if(_rcEl){ _rcEl.innerHTML = _rc
    ? ('Kode referral kamu<b id="pfRefVal">'+esc(_rc)+'</b><span style="font-size:.72rem;color:#8a6a3a">Ajak teman daftar pakai kodemu, kalian berdua dapat poin 🎉</span><button class="oo-out" id="pfRefShare" style="margin-top:8px;padding:9px">Bagikan kode</button>')
    : 'Menyiapkan kode referral…';
    var _rsb=pfBk.querySelector('#pfRefShare'); if(_rsb) _rsb.onclick=()=>shareRef(_rc);
    if(!_rc){ ensureRefCode().then(function(c){ var el=document.getElementById('pfRefVal'); if(c && pfBk.classList.contains('show')) openProfile(); }).catch(()=>{}); }
  }
  pfBk.querySelector('#pfTier').innerHTML='';
  pfBk.classList.add('show');
  if(profile && profile.mustChangePin){ const pb=pfBk.querySelector('#pfPinBox'); if(pb) pb.style.display='block'; const pm=pfBk.querySelector('#pfPinMsg'); if(pm){ pm.style.color='#C0392B'; pm.textContent='PIN kamu baru direset admin. Isi PIN sementara sebagai "PIN lama", lalu buat PIN baru.'; } }
  (async()=>{ try{ const txs=await listMyTransactions(); const spend=txs.reduce((s,t)=>s+(t.nominal||0),0); const tr=tierOf(spend);
    pfBk.querySelector('#pfSpent').textContent='Rp'+spend.toLocaleString('id-ID');
    pfBk.querySelector('#pfTx').textContent=txs.length;
    const te=pfBk.querySelector('#pfTier'); if(te) te.innerHTML='<span style="display:inline-block;background:'+tr.color+';color:#fff;font-weight:900;font-size:.72rem;border-radius:999px;padding:3px 14px">★ '+tr.name+'</span>';
  }catch(e){} })();
  (async()=>{ try{ const sc=await getMemberScore(user.uid); const se=pfBk.querySelector('#pfScore'); if(se) se.textContent=sc; }catch(e){} })();
}

// ====== Check-in harian ======
const CHECKIN_REWARDS=[1,1,5,2,3,4,10]; // hari ke-1..7 (hari ke-7 bonus)
function _ymd(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function _todayStr(){ return _ymd(new Date()); }
function _offsetStr(n){ const d=new Date(); d.setDate(d.getDate()+n); return _ymd(d); }
function getCheckinStatus(){
  const last=(profile&&profile.lastCheckin)||''; const cur=(profile&&profile.streak)||0; const today=_todayStr();
  const claimedToday=(last===today);
  let nextDay; if(claimedToday) nextDay=cur; else if(last===_offsetStr(-1)) nextDay=(cur>=7?1:cur+1); else nextDay=1;
  return { claimedToday:claimedToday, streak:cur, nextDay:nextDay, nextReward:CHECKIN_REWARDS[(nextDay||1)-1], rewards:CHECKIN_REWARDS.slice() };
}
async function dailyCheckin(){
  if(!user){ openLogin(); throw {message:'Masuk dulu ya.'}; }
  const today=_todayStr(); const last=(profile&&profile.lastCheckin)||''; const cur=(profile&&profile.streak)||0;
  if(last===today) return { already:true, streak:cur, reward:0 };
  let ns; if(last===_offsetStr(-1)) ns=(cur>=7?1:cur+1); else ns=1;
  const reward=CHECKIN_REWARDS[ns-1]||0;
  await addPoints(reward, 'checkin');
  try{ await setDoc(doc(db,'users',user.uid), { lastCheckin:today, streak:ns }, {merge:true}); }catch(e){}
  if(profile){ profile.lastCheckin=today; profile.streak=ns; }
  return { claimed:true, streak:ns, reward:reward, bonus:(ns===7) };
}
const ciBk=document.createElement('div'); ciBk.className='oo-bk';
ciBk.innerHTML=`<div class="oo-card" style="position:relative;text-align:center">
  <button class="oo-x" id="ciX">×</button>
  <div class="oo-h">Check-in Harian 🔥</div>
  <div id="ciMsg" class="oo-mini" style="margin-bottom:10px"></div>
  <div id="ciGrid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:7px"></div>
  <button class="oo-out" id="ciBtn" style="margin-top:14px;background:${K};color:#5A3A05;border-color:${K}">Klaim</button>
  <div class="oo-mini" style="margin-top:8px">Login & klaim tiap hari. Lewat sehari, streak mulai dari awal ya 😊</div>
</div>`;
function mountCi(){ if(!document.body.contains(ciBk)) document.body.appendChild(ciBk); }
if(document.body) mountCi(); else document.addEventListener('DOMContentLoaded', mountCi);
ciBk.querySelector('#ciX').onclick=()=>ciBk.classList.remove('show');
ciBk.addEventListener('click',e=>{ if(e.target===ciBk) ciBk.classList.remove('show'); });
function renderCheckin(){
  const st=getCheckinStatus(); const grid=ciBk.querySelector('#ciGrid');
  grid.innerHTML=st.rewards.map((rw,i)=>{ const day=i+1; const big=(day===7);
    const done = st.claimedToday ? (day<=st.streak) : (day<st.nextDay);
    const isNext = !st.claimedToday && day===st.nextDay;
    const bd = done?'#2E9E5B':(isNext?K:'#EFE2C4'); const bg = done?'#E7F6E7':(isNext?'#FFF7E0':'#fff');
    return '<div style="border:2px solid '+bd+';background:'+bg+';border-radius:12px;padding:8px 2px">'
      +'<div style="font-size:.58rem;font-weight:800;color:#9a7a5e">Hari '+day+'</div>'
      +'<div style="font-size:'+(big?'1.05rem':'.95rem')+';font-weight:900;color:'+(big?'#C98A1B':CO)+'">'+(done?'✓':('+'+rw))+'</div>'
      +(big?'<div style="font-size:.52rem;font-weight:900;color:#C98A1B">BONUS</div>':'')+'</div>';
  }).join('');
  const btn=ciBk.querySelector('#ciBtn'), msg=ciBk.querySelector('#ciMsg');
  if(st.claimedToday){ btn.disabled=true; btn.style.opacity='.55'; btn.textContent='Sudah check-in hari ini 🎉'; msg.textContent='Streak kamu '+st.streak+' hari. Balik lagi besok biar makin panjang!'; }
  else { btn.disabled=false; btn.style.opacity='1'; btn.textContent='Klaim +'+st.nextReward+' poin'; msg.textContent=(st.nextDay===1?'Mulai streak check-in kamu hari ini!':('Lanjutkan streak — hari ke-'+st.nextDay+'!')); }
}
ciBk.querySelector('#ciBtn').onclick=async function(){
  if(!user){ openLogin(); return; } const b=this; if(b.disabled) return; b.disabled=true; b.textContent='Memproses…';
  try{ const r=await dailyCheckin(); renderCheckin(); if(r.claimed){ ciBk.querySelector('#ciMsg').innerHTML=(r.bonus?'🎉 BONUS! ':'🎉 ')+'+'+r.reward+' poin masuk! Streak '+r.streak+' hari.'; } }
  catch(e){ renderCheckin(); }
};
async function openCheckin(){ if(!user){ openLogin(); return; } mountCi(); renderCheckin(); ciBk.classList.add('show'); }

// ====== Leaderboard / Riwayat ======
function makeListOverlay(){
  const bk=document.createElement('div'); bk.className='oo-bk';
  bk.innerHTML=`<div class="oo-card" style="position:relative"><button class="oo-x">×</button><div class="oo-h"></div><div class="lb-body"></div></div>`;
  function mount(){ if(!document.body.contains(bk)) document.body.appendChild(bk); }
  if(document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
  bk.querySelector('.oo-x').onclick=()=>bk.classList.remove('show');
  bk.addEventListener('click',e=>{ if(e.target===bk) bk.classList.remove('show'); });
  return { bk, mount, head:bk.querySelector('.oo-h'), body:bk.querySelector('.lb-body') };
}
const lbO=makeListOverlay(), sbO=makeListOverlay(), hsO=makeListOverlay();
const MEDAL=['🥇','🥈','🥉'];
function renderRankList(list, key, emoji){
  if(!list.length) return '<div class="lb-empty">Belum ada data.<br>Jadilah yang pertama di papan ini! 🚀</div>';
  const myUid = user? user.uid : null;
  return list.map((r,i)=>{
    const me = myUid && r.uid===myUid;
    const rank = i<3? MEDAL[i] : (i+1);
    return `<div class="lb-row${me?' lb-me':''}"><div class="lb-rank">${rank}</div>`
      +`<div class="lb-name">${escHtml(r.name)}${me?' <span class="lb-youtag">kamu</span>':''}</div>`
      +`<div class="lb-val">${emoji} ${r[key]}</div></div>`;
  }).join('');
}
async function openLeaderboard(){
  lbO.mount(); lbO.head.textContent='🏆 Peringkat Poin';
  lbO.body.innerHTML='<div class="lb-loading">Memuat peringkat…</div>'; lbO.bk.classList.add('show');
  const list=await listPointLeaderboard(10);
  lbO.body.innerHTML='<div class="oo-mini" style="margin:0 0 10px">Siapa raja poin Oma Opa? Kumpulkan poin biar naik peringkat!</div>'+renderRankList(list,'points','🪙');
}
async function openScoreboard(){
  sbO.mount(); sbO.head.textContent='🏆 Raja Skor Menopping';
  sbO.body.innerHTML='<div class="lb-loading">Memuat peringkat…</div>'; sbO.bk.classList.add('show');
  const list=await listScoreLeaderboard(10);
  sbO.body.innerHTML='<div class="oo-mini" style="margin:0 0 10px">Skor tertinggi para pemain. Pecahkan rekornya!</div>'+renderRankList(list,'score','⭐');
}
async function openHistory(){
  hsO.mount(); hsO.head.textContent='🧾 Riwayat Belanja';
  if(!user){ hsO.body.innerHTML='<div class="lb-empty">Masuk dulu untuk melihat riwayat belanja & poinmu.</div>'; hsO.bk.classList.add('show'); return; }
  hsO.body.innerHTML='<div class="lb-pts">🪙 '+points+' poin</div><div class="lb-loading">Memuat riwayat…</div>'; hsO.bk.classList.add('show');
  const list=await listMyTransactions();
  let html='<div class="lb-pts">🪙 '+points+' poin</div>';
  if(!list.length){ html+='<div class="lb-empty">Belum ada transaksi.<br>Belanja di outlet & tunjukkan QR member buat dapat poin! 🛍️</div>'; }
  else { html+=list.map(x=>`<div class="hs-item"><div><div class="hs-out">${escHtml(x.outlet||'Oma Opa Cakery')}</div><div class="hs-date">${dtFmt(x.ts)}</div></div>`
      +`<div><div class="hs-nom">${rpFmt(x.nominal)}</div><div class="hs-pts">+${x.points} poin</div></div></div>`).join(''); }
  hsO.body.innerHTML=html;
}

// ============================================================
//  ADMIN / AKUN MASTER — kelola member, poin, skor, outlet
// ============================================================
async function isAdmin(){ const s=await getStaffInfo(); return !!(s&&(s.admin||s.super)); }
async function isSuper(){ const s=await getStaffInfo(); return !!(s&&s.super); }
async function isHRD(){ const s=await getStaffInfo(); return !!(s&&(s.hrd||s.master)); }
async function isMaster(){ if(masterFlag) return true; const s=await getStaffInfo(); if(s&&s.master) return true; if(s && user && user.email && user.email.split('@')[0]===normPhone(BOOTSTRAP_MASTER_PHONE)) return true; return false; }
async function getMemberByPhone(phone){
  const p=normPhone(phone); if(!p) return null;
  try{ const snap=await getDocs(query(collection(db,'users'), where('phone','==',p), limit(1)));
    let r=null; snap.forEach(d=>{ if(!r){ const x=d.data(); r={uid:d.id,name:x.name||'',phone:x.phone||'',points:(typeof x.points==='number')?x.points:0}; } }); return r;
  }catch(e){ return null; }
}
async function listMembers(qstr, n){
  n=n||500; qstr=(qstr||'').trim();
  if(!qstr){
    try{ const snap=await getDocs(query(collection(db,'users'), limit(n))); const arr=[];
      snap.forEach(d=>{ const x=d.data(); arr.push({uid:d.id,name:x.name||'',phone:x.phone||'',points:(typeof x.points==='number')?x.points:0, gender:x.gender||'', age:x.age||'', dob:x.dob||'', occupation:x.occupation||'', homeOutlet:x.homeOutlet||'', createdAt:(x.createdAt&&x.createdAt.seconds)?x.createdAt.seconds*1000:0, earnGame:(typeof x.earn_game==='number')?x.earn_game:0, earnCheckin:(typeof x.earn_checkin==='number')?x.earn_checkin:0}); });
      arr.sort((a,b)=>b.points-a.points); return arr;
    }catch(e){ return []; }
  }
  const qLower=qstr.toLowerCase();
  const seen={}; const arr=[];
  function pushDoc(d){
    if(seen[d.id]) return; seen[d.id]=true;
    const x=d.data();
    arr.push({uid:d.id,name:x.name||'',phone:x.phone||'',points:(typeof x.points==='number')?x.points:0, gender:x.gender||'', age:x.age||'', dob:x.dob||'', occupation:x.occupation||'', homeOutlet:x.homeOutlet||'', createdAt:(x.createdAt&&x.createdAt.seconds)?x.createdAt.seconds*1000:0, earnGame:(typeof x.earn_game==='number')?x.earn_game:0, earnCheckin:(typeof x.earn_checkin==='number')?x.earn_checkin:0});
  }
  try{
    const nameSnap=await getDocs(query(collection(db,'users'), where('nameLower','>=',qLower), where('nameLower','<=',qLower+'\uf8ff'), limit(n)));
    nameSnap.forEach(pushDoc);
  }catch(e){ console.error('listMembers nameLower query gagal (mungkin belum ada nameLower/index):', e); }
  try{
    if(/^[0-9+]/.test(qstr)){
      const phoneSnap=await getDocs(query(collection(db,'users'), where('phone','>=',qstr), where('phone','<=',qstr+'\uf8ff'), limit(n)));
      phoneSnap.forEach(pushDoc);
    }
  }catch(e){ console.error('listMembers phone query gagal:', e); }
  arr.sort((a,b)=>b.points-a.points);
  return arr;
}
async function getMemberScore(uid){ try{ const s=await getDoc(doc(db,'scores',(uid||'').trim())); return s.exists()?(s.data().score||0):0; }catch(e){ return 0; } }
async function listMembersPage(n, after){
  n=n||100;
  try{
    const base=collection(db,'users');
    const q = after ? query(base, orderBy(documentId()), startAfter(after), limit(n))
                    : query(base, orderBy(documentId()), limit(n));
    const snap=await getDocs(q); const arr=[];
    snap.forEach(d=>{ const x=d.data(); arr.push({uid:d.id,name:x.name||'',phone:x.phone||'',points:(typeof x.points==='number')?x.points:0, gender:x.gender||'', age:x.age||'', dob:x.dob||'', occupation:x.occupation||'', homeOutlet:x.homeOutlet||''}); });
    return { rows:arr, lastDoc: snap.docs.length? snap.docs[snap.docs.length-1] : null, hasMore: snap.docs.length===n };
  }catch(e){ return { rows:[], lastDoc:null, hasMore:false }; }
}
function logAudit(action, detail){
  try{
    addDoc(collection(db,'auditlog'), {
      action:String(action||''), detail:String(detail||''),
      byUid:(user?user.uid:''), byName:(profile&&profile.name)||'',
      createdAt:serverTimestamp()
    }).catch(()=>{});
  }catch(e){}
}
async function listAudit(opts){
  opts=opts||{}; const n=opts.limit||100;
  const fromMs=opts.from?new Date(opts.from+'T00:00:00').getTime():0;
  const toMs=opts.to?new Date(opts.to+'T23:59:59').getTime():0;
  try{
    let qy;
    if(fromMs||toMs){
      const parts=[collection(db,'auditlog')];
      if(fromMs) parts.push(where('createdAt','>=', new Date(fromMs)));
      if(toMs) parts.push(where('createdAt','<=', new Date(toMs)));
      parts.push(orderBy('createdAt','desc')); parts.push(limit(n));
      qy=query.apply(null, parts);
    } else {
      qy=query(collection(db,'auditlog'), orderBy('createdAt','desc'), limit(n));
    }
    const snap=await getDocs(qy); const arr=[];
    snap.forEach(d=>{ const x=d.data(); arr.push({ id:d.id, action:x.action||'', detail:x.detail||'', byName:x.byName||'', byUid:x.byUid||'', ts:(x.createdAt&&x.createdAt.seconds)?x.createdAt.seconds*1000:0 }); });
    return arr;
  }catch(e){ return []; }
}
async function adminAdjustPoints(uid, delta, reason){
  uid=(uid||'').trim(); delta=Math.floor(Number(delta)||0);
  if(!(await isSuper())) throw {message:'Khusus admin utama.'};
  if(!uid) throw {message:'Member belum dipilih.'};
  if(!delta) throw {message:'Jumlah poin tidak boleh 0.'};
  const uref=doc(db,'users',uid); let newTotal=0, mname='', applied=0;
  await runTransaction(db, async(tx)=>{
    const us=await tx.get(uref); if(!us.exists()) throw {message:'Member tidak ditemukan.'};
    const d=us.data(); const cur=(typeof d.points==='number')?d.points:0; mname=d.name||'';
    newTotal=Math.max(0, cur+delta); applied=newTotal-cur;
    tx.set(uref,{ points:newTotal, updatedAt:serverTimestamp() },{merge:true});
    tx.set(doc(db,'leaderboard',uid), { name:mname, points:newTotal, updatedAt:serverTimestamp() },{merge:true});
    const tref=doc(collection(db,'transactions'));
    tx.set(tref,{ uid:uid, name:mname, nominal:0, points:applied, outlet:(reason||'Penyesuaian admin'), kind:'adjust', staffUid:(user?user.uid:''), createdAt:serverTimestamp() });
  });
  logAudit('adjust_poin', 'Member '+(mname||uid)+' '+(applied>=0?'+':'')+applied+' poin (jadi '+newTotal+'). Alasan: '+(reason||'-'));
  return { newTotal:newTotal, applied:applied, name:mname };
}
async function adminSetPoints(uid, value, reason){
  value=Math.max(0, Math.floor(Number(value)||0));
  const m=await getMemberByUid(uid); if(!m) throw {message:'Member tidak ditemukan.'};
  return adminAdjustPoints(uid, value-m.points, reason||'Set poin admin');
}
async function adminSetScore(uid, value){
  uid=(uid||'').trim(); value=Math.max(0, Math.floor(Number(value)||0));
  if(!(await isSuper())) throw {message:'Khusus admin utama.'};
  if(!uid) throw {message:'Member belum dipilih.'};
  const m=await getMemberByUid(uid);
  await setDoc(doc(db,'scores',uid), { name:(m&&m.name)||'Pemain', score:value, updatedAt:serverTimestamp() },{merge:true});
  return { score:value };
}
async function adminResetPoints(opts){
  if(!(await isMaster())) throw {message:'Khusus Master.'};
  opts=opts||{};
  const fromMs=opts.from?new Date(opts.from+'T00:00:00').getTime():0;
  const toMs=opts.to?new Date(opts.to+'T23:59:59').getTime():0;
  if(fromMs||toMs){
    // Mode rentang: hanya KURANGI poin yang didapat dari transaksi pada periode ini (saldo di luar rentang tidak disentuh)
    let txs=[];
    try{ const snap=await getDocs(collection(db,'transactions')); snap.forEach(d=>{ const x=d.data(); const ts=(x.createdAt&&x.createdAt.seconds)?x.createdAt.seconds*1000:0; if((!fromMs||ts>=fromMs)&&(!toMs||ts<=toMs)) txs.push({ uid:x.uid||'', points:x.points||0 }); }); }catch(e){}
    const byUid={}; txs.forEach(t=>{ if(!t.uid) return; byUid[t.uid]=(byUid[t.uid]||0)+t.points; });
    let n=0;
    for(const uid of Object.keys(byUid)){
      const delta=byUid[uid]; if(!delta) continue;
      try{
        await runTransaction(db, async (tx)=>{
          const ref=doc(db,'users',uid); const s=await tx.get(ref); if(!s.exists()) return;
          const cur=(typeof s.data().points==='number')?s.data().points:0; const nt=Math.max(0, cur-delta);
          tx.set(ref, { points:nt, updatedAt:serverTimestamp() }, {merge:true});
          tx.set(doc(db,'leaderboard',uid), { points:nt, updatedAt:serverTimestamp() }, {merge:true});
        });
        n++;
      }catch(e){}
    }
    logAudit('reset_poin_periode', 'Kurangi poin dari transaksi periode '+(opts.from||'awal')+' s/d '+(opts.to||'sekarang')+' — '+n+' member terdampak (saldo di luar periode tidak disentuh).');
    return { count:n };
  }
  const usnap=await getDocs(collection(db,'users')); let n=0;
  for(const ds of usnap.docs){ const uid=ds.id;
    try{ await setDoc(doc(db,'users',uid), { points:0, earn_game:0, earn_checkin:0, lastCheckin:'', streak:0, updatedAt:serverTimestamp() }, {merge:true}); }catch(e){}
    try{ await setDoc(doc(db,'leaderboard',uid), { points:0, updatedAt:serverTimestamp() }, {merge:true}); }catch(e){}
    if(opts.scores){ try{ await deleteDoc(doc(db,'scores',uid)); }catch(e){} }
    n++;
  }
  logAudit('reset_semua_poin', 'Reset poin SEMUA member ('+n+' akun) ke 0'+(opts.scores?' + reset skor game/streak':'')+'.');
  return { count:n };
}
async function adminClearTransactions(range){
  if(!(await isMaster())) throw {message:'Khusus Master.'};
  const fromMs=(range&&range.from)?new Date(range.from+'T00:00:00').getTime():0;
  const toMs=(range&&range.to)?new Date(range.to+'T23:59:59').getTime():0;
  const snap=await getDocs(collection(db,'transactions')); let n=0;
  for(const ds of snap.docs){
    const x=ds.data(); const ts=(x.createdAt&&x.createdAt.seconds)?x.createdAt.seconds*1000:0;
    if(fromMs && ts<fromMs) continue; if(toMs && ts>toMs) continue;
    try{ await deleteDoc(doc(db,'transactions',ds.id)); n++; }catch(e){}
  }
  logAudit('hapus_semua_transaksi', 'Hapus transaksi kasir'+((range&&(range.from||range.to))?(' periode '+(range.from||'awal')+' s/d '+(range.to||'sekarang')):' (SEMUA)')+' ('+n+' baris).');
  return { count:n };
}
async function adminDeleteTransactions(ids){
  if(!(await isMaster())) throw {message:'Khusus Master.'};
  ids=(ids||[]).map(x=>String(x||'').trim()).filter(Boolean);
  if(!ids.length) throw {message:'Pilih transaksi dulu.'};
  let n=0; const detail=[];
  for(const id of ids){
    try{ const s=await getDoc(doc(db,'transactions',id)); if(s.exists()){ const x=s.data(); detail.push((x.name||'?')+'/'+(x.outlet||'-')+'/Rp'+(x.nominal||0)); } await deleteDoc(doc(db,'transactions',id)); n++; }catch(e){}
  }
  logAudit('hapus_transaksi', 'Hapus '+n+' transaksi terpilih: '+detail.slice(0,8).join('; ')+(detail.length>8?(' … (+'+(detail.length-8)+' lagi)'):''));
  return { count:n };
}
async function deleteTransaction(id){ if(!(await isMaster())) throw {message:'Khusus Master.'}; id=(id||'').trim(); if(!id) throw {message:'ID kosong.'}; let info=''; try{ const s=await getDoc(doc(db,'transactions',id)); if(s.exists()){ const x=s.data(); info=(x.name||'?')+' · '+(x.outlet||'-')+' · '+(x.nominal||0)+' · '+(x.points||0)+' poin'; } }catch(e){} await deleteDoc(doc(db,'transactions',id)); logAudit('hapus_transaksi', 'Hapus 1 transaksi: '+info+' (id:'+id+')'); }
function slug(s){ return String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60) || ('o'+Date.now()); }
function parseMapsLatLng(input){
  if(!input) return null;
  const raw=String(input).trim();
  let decoded=raw; try{ decoded=decodeURIComponent(raw); }catch(e){}
  const candidates=[decoded, raw];
  const patterns=[
    /[?&]query=(-?\d+\.\d+),\s*(-?\d+\.\d+)/,
    /[?&]q=(-?\d+\.\d+),\s*(-?\d+\.\d+)/,
    /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,
    /@(-?\d+\.\d+),(-?\d+\.\d+)/,
    /^(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)$/
  ];
  for(const c of candidates){ for(const p of patterns){ const m=c.match(p); if(m){ const lat=parseFloat(m[1]), lng=parseFloat(m[2]); if(!isNaN(lat)&&!isNaN(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180) return {lat, lng}; } } }
  return null;
}
function buildMapsLink(lat,lng){ return 'https://www.google.com/maps/search/?api=1&query='+lat+'%2C'+lng; }
async function listOutlets(){
  try{ const snap=await getDocs(collection(db,'outlets')); const arr=[];
    snap.forEach(d=>{ const x=d.data(); arr.push({ id:d.id, name:x.name||'', area:x.area||'Lainnya', maps:x.maps||'', lat:(typeof x.lat==='number'?x.lat:null), lng:(typeof x.lng==='number'?x.lng:null), internalOnly:x.internalOnly===true, active:x.active!==false }); });
    arr.sort((a,b)=>(a.area||'').localeCompare(b.area||'')||(a.name||'').localeCompare(b.name||'')); return arr;
  }catch(e){ return []; }
}
async function listPublicOutlets(){
  try{ const snap=await getDocs(collection(db,'outlets')); const arr=[];
    snap.forEach(d=>{ const x=d.data(); if(x.active===false || x.internalOnly===true) return; arr.push({ name:x.name||'', area:x.area||'Lainnya', maps:x.maps||'', lat:(typeof x.lat==='number'?x.lat:null), lng:(typeof x.lng==='number'?x.lng:null) }); });
    return arr;
  }catch(e){ return []; }
}
async function addOutlet(o){
  if(!(await isSuper()) && !(await isHRD())) throw {message:'Khusus admin utama/HRD.'};
  o=o||{}; if(!o.name||!o.name.trim()) throw {message:'Nama outlet wajib diisi.'};
  const id=slug(o.name);
  const data={ name:o.name.trim(), area:(o.area||'Lainnya').trim(), maps:(o.maps||'').trim(), internalOnly:o.internalOnly===true, active:true, updatedAt:serverTimestamp() };
  if(typeof o.lat==='number' && typeof o.lng==='number' && !isNaN(o.lat) && !isNaN(o.lng)){ data.lat=o.lat; data.lng=o.lng; }
  await setDoc(doc(db,'outlets',id), data, {merge:true});
  return { id:id };
}
async function updateOutlet(id, patch){
  if(!(await isSuper()) && !(await isHRD())) throw {message:'Khusus admin utama/HRD.'};
  if(!id) throw {message:'ID kosong.'};
  await setDoc(doc(db,'outlets',id), Object.assign({updatedAt:serverTimestamp()}, patch||{}), {merge:true});
}
async function deleteOutlet(id){
  if(!(await isSuper()) && !(await isHRD())) throw {message:'Khusus admin utama/HRD.'};
  if(!id) throw {message:'ID kosong.'};
  await deleteDoc(doc(db,'outlets',id));
}
async function seedOutlets(arr){
  if(!(await isSuper())) throw {message:'Khusus admin utama.'};
  arr=arr||[]; let n=0;
  for(const o of arr){ if(!o||!o.name) continue;
    const data={ name:o.name, area:o.area||'Lainnya', maps:o.maps||'', active:true, updatedAt:serverTimestamp() };
    if(typeof o.lat==='number' && typeof o.lng==='number') { data.lat=o.lat; data.lng=o.lng; }
    await setDoc(doc(db,'outlets',slug(o.name)), data, {merge:true}); n++; }
  return { count:n };
}

// ---- kasir individual (absensi) ----
// ---- data HR sensitif karyawan (divisi, kontrak, data pribadi) — cuma Admin Utama ----
// ---- cuti ----
// ---- email (lewat Apps Script yang udah ada) ----
// ---- notifikasi personal karyawan (kotak pesan) ----
// ---- pengelompokan area outlet (terpusat, dipakai admin/rekap/broadcast) ----
const KRON_EXCEPT=['umy','nusa indah','godean','tajem','jakal uii']; // Jogja -> Area 1/Metavest; "jakal uii" spesifik; kecuali nama mengandung "kyai mojo"
function outletGroup(name){
  const key=(name||'').replace(/^Oma Opa Cakery\s*/i,'').toLowerCase().replace(/\s+/g,' ').trim();
  if(!key) return '';
  let area='';
  (window.OMA_OUTLETS||[]).some(o=>{ const k=((o&&o.name)||'').replace(/^Oma Opa Cakery\s*/i,'').toLowerCase().replace(/\s+/g,' ').trim(); if(k===key){ area=(o.area||'').toLowerCase(); return true; } return false; });
  const isYogya=area.indexOf('yogya')>=0;
  const is5=KRON_EXCEPT.some(k=>key.indexOf(k)>=0) && key.indexOf('kyai mojo')<0;
  if(isYogya && !is5) return 'kronggahan';
  if(area.indexOf('klaten')>=0 || area.indexOf('magelang')>=0 || (isYogya && is5)) return 'area1';
  if(area.indexOf('solo')>=0) return 'area2';
  if(area.indexOf('semarang')>=0 || area.indexOf('salatiga')>=0) return 'area3';
  return '';
}
function matchOutletKey(memberOutlet, targetKey){
  if(!targetKey) return false;
  if(targetKey==='__metavest'){ const g=outletGroup(memberOutlet); return g==='area1'||g==='area2'||g==='area3'; }
  if(targetKey==='__kronggahan'||targetKey==='__area1'||targetKey==='__area2'||targetKey==='__area3'){ return outletGroup(memberOutlet)===targetKey.replace('__',''); }
  const a=(memberOutlet||'').replace(/^Oma Opa Cakery\s*/i,'').toLowerCase().replace(/\s+/g,' ').trim();
  const b=(targetKey||'').replace(/^Oma Opa Cakery\s*/i,'').toLowerCase().replace(/\s+/g,' ').trim();
  return !!a && a===b;
}

// ---- blast pesan (broadcast) ----
function inBirthdayRange(dob, tp){
  const dobKey=(dob.getMonth()+1)*100+dob.getDate();
  const from=(tp.fromMonth||1)*100+(tp.fromDay||1);
  const to=(tp.toMonth||12)*100+(tp.toDay||31);
  if(from<=to) return dobKey>=from && dobKey<=to;
  return dobKey>=from || dobKey<=to; // rentang muter tahun, misal Des -> Jan
}
async function resolveBlastRecipientUids(targetType, targetParams){
  const tp=targetParams||{};
  const uids=[];
  if(targetType==='specific'){
    return (tp.uids||[]).slice();
  }
  if(targetType==='outlet'){
    const outlets=await listOutlets();
    const nameSet={};
    (tp.keys||[]).forEach(k=>{
      if(k.indexOf('__')===0){ outlets.forEach(o=>{ if(matchOutletKey(o.name,k)) nameSet[o.name]=true; }); }
      else nameSet[k]=true;
    });
    const names=Object.keys(nameSet);
    for(let i=0;i<names.length;i+=30){
      const chunk=names.slice(i,i+30);
      try{ const snap=await getDocs(query(collection(db,'users'), where('homeOutlet','in',chunk))); snap.forEach(d=>uids.push(d.id)); }catch(e){}
    }
    return uids;
  }
  if(targetType==='daterange'){
    let constraints=[];
    if(tp.fromMs) constraints.push(where('createdAt','>=', new Date(tp.fromMs)));
    if(tp.toMs) constraints.push(where('createdAt','<=', new Date(tp.toMs)));
    try{ const snap=await getDocs(constraints.length? query(collection(db,'users'), ...constraints) : collection(db,'users')); snap.forEach(d=>uids.push(d.id)); }catch(e){}
    return uids;
  }
  if(targetType==='birthday'){
    try{ const snap=await getDocs(collection(db,'users')); snap.forEach(d=>{ const x=d.data(); if(x.dob){ const dob=new Date(x.dob); if(!isNaN(dob) && inBirthdayRange(dob, tp)) uids.push(d.id); } }); }catch(e){}
    return uids;
  }
  // 'all'
  try{ const snap=await getDocs(collection(db,'users')); snap.forEach(d=>uids.push(d.id)); }catch(e){}
  return uids;
}
async function grantVouchersForBroadcast(targetType, targetParams, voucherConfig, broadcastId){
  const uids=await resolveBlastRecipientUids(targetType, targetParams);
  let count=0, fail=0;
  for(const uid of uids){
    try{
      const code=genCode();
      let nm=''; try{ const us=await getDoc(doc(db,'users',uid)); if(us.exists()) nm=us.data().name||''; }catch(e){}
      await setDoc(doc(db,'vouchers',code), {
        code:code, uid:uid, name:nm, rewardId:'', title:voucherConfig.title||'Voucher Promo', note:voucherConfig.note||'',
        cost:0, status:'aktif',
        discType:voucherConfig.discType||'none', discValue:voucherConfig.discValue||0, discMax:voucherConfig.discMax||0,
        freeItemId:voucherConfig.freeItemId||'', freeItemName:voucherConfig.freeItemName||'', freeItemPrice:voucherConfig.freeItemPrice||0,
        expiresAt: voucherConfig.expiresAt || null,
        fromBroadcast: broadcastId||'',
        createdAt: serverTimestamp()
      });
      count++;
    }catch(e){ fail++; }
  }
  return { count, fail, total:uids.length };
}
async function sendBroadcast(data, imageBlob, voucherConfig){
  if(!(await isSuper())) throw {message:'Khusus admin utama.'};
  const d=data||{}; const body=(d.body||'').trim();
  const title=(d.title||'').trim();
  if(!title) throw {message:'Judul wajib diisi.'};
  if(!body) throw {message:'Isi pesan wajib diisi.'};
  if(!d.targetType) throw {message:'Target wajib dipilih.'};
  const ref=doc(collection(db,'broadcasts'));
  let imageUrl='';
  if(imageBlob){
    const sref=storageRef(storage, 'broadcast-images/'+ref.id+'.jpg');
    await uploadBytes(sref, imageBlob, {contentType:'image/jpeg'});
    imageUrl=await getDownloadURL(sref);
  }
  await setDoc(ref, {
    title:title, body:body, targetType:d.targetType, targetParams:d.targetParams||{}, imageUrl:imageUrl,
    expiresAt: d.expiresAt || null, hasVoucher: !!voucherConfig,
    active:true, createdBy:(auth.currentUser?auth.currentUser.uid:''), createdAt:serverTimestamp()
  });
  let voucherResult=null;
  if(voucherConfig){
    voucherResult=await grantVouchersForBroadcast(d.targetType, d.targetParams||{}, voucherConfig, ref.id);
  }
  return { id:ref.id, voucherResult:voucherResult };
}
async function listBroadcasts(n){
  if(!(await isAdmin())) return [];
  try{
    const q=query(collection(db,'broadcasts'), orderBy('createdAt','desc'), limit(n||50));
    const snap=await getDocs(q); const arr=[];
    snap.forEach(d=>{ const x=d.data(); arr.push({ id:d.id, title:x.title||'', body:x.body||'', targetType:x.targetType||'', targetParams:x.targetParams||{}, imageUrl:x.imageUrl||'', active:x.active!==false, createdAt:(x.createdAt&&x.createdAt.seconds)?x.createdAt.seconds*1000:0 }); });
    return arr;
  }catch(e){ return []; }
}
async function deactivateBroadcast(id){
  if(!(await isSuper())) throw {message:'Khusus admin utama.'};
  if(!id) throw {message:'ID kosong.'};
  await setDoc(doc(db,'broadcasts',id), { active:false }, {merge:true});
}
async function deleteBroadcast(id){
  if(!(await isMaster())) throw {message:'Khusus master.'};
  if(!id) throw {message:'ID kosong.'};
  await deleteDoc(doc(db,'broadcasts',id));
}
async function getMemberBroadcasts(){
  if(!user) return [];
  try{
    const q=query(collection(db,'broadcasts'), where('active','==',true), orderBy('createdAt','desc'), limit(50));
    const snap=await getDocs(q);
    const read=(profile&&profile.readBroadcasts)||[];
    const dob=(profile&&profile.dob)?new Date(profile.dob):null;
    const regTs=(profile&&profile.createdAt&&profile.createdAt.seconds)?profile.createdAt.seconds*1000:0;
    const outlet=(profile&&profile.homeOutlet)||'';
    const arr=[];
    snap.forEach(d=>{
      const x=d.data();
      if(x.expiresAt){ const expMs=(x.expiresAt.seconds)?x.expiresAt.seconds*1000:new Date(x.expiresAt).getTime(); if(!isNaN(expMs) && Date.now()>expMs) return; }
      const tp=x.targetParams||{}; let match=false;
      if(x.targetType==='all') match=true;
      else if(x.targetType==='birthday' && dob) match=inBirthdayRange(dob, tp);
      else if(x.targetType==='daterange') match=(!tp.fromMs||regTs>=tp.fromMs)&&(!tp.toMs||regTs<=tp.toMs);
      else if(x.targetType==='outlet') match=(tp.keys||[]).some(k=>matchOutletKey(outlet,k));
      else if(x.targetType==='specific') match=(tp.uids||[]).indexOf(user.uid)>=0;
      if(match) arr.push({ id:d.id, title:x.title||'', body:x.body||'', imageUrl:x.imageUrl||'', createdAt:(x.createdAt&&x.createdAt.seconds)?x.createdAt.seconds*1000:0, isRead: read.indexOf(d.id)>=0 });
    });
    return arr;
  }catch(e){ console.error('getMemberBroadcasts gagal:', e); return []; }
}
async function markBroadcastRead(id){
  if(!user || !id) return;
  try{ await setDoc(doc(db,'users',user.uid), { readBroadcasts: arrayUnion(id) }, {merge:true}); }catch(e){}
}


// ---- laporan kerja WFA ----

// ---- jadwal & lembur (SPV/Manajer/GM) ----

// ---- staff / kasir ----
async function listStaff(){
  if(!(await isAdmin())) return [];
  try{ const snap=await getDocs(collection(db,'staff')); const base=[];
    snap.forEach(d=>{ const x=d.data()||{}; base.push({ uid:d.id, outlet:x.outlet||x.name||'', admin:x.admin===true, super:x.super===true, master:x.master===true, hrd:x.hrd===true }); });
    for(const s of base){ try{ const u=await getDoc(doc(db,'users',s.uid)); if(u.exists()){ const d=u.data(); s.name=d.name||''; s.phone=d.phone||''; } }catch(e){} }
    base.sort((a,b)=>(a.outlet||'').localeCompare(b.outlet||'')); return base;
  }catch(e){ return []; }
}
async function addStaff(uid, outlet, admin){ if(!(await isSuper())) throw {message:'Khusus admin utama.'}; uid=(uid||'').trim(); if(!uid) throw {message:'UID wajib diisi.'};
  await setDoc(doc(db,'staff',uid), { outlet:(outlet||'').trim(), admin:!!admin, updatedAt:serverTimestamp() },{merge:true});
  logAudit('tambah_staff', 'Tambah staff (uid:'+uid+') outlet:'+(outlet||'-')+' admin:'+(!!admin)); }
async function updateStaff(uid, patch){ if(!(await isSuper())) throw {message:'Khusus admin utama.'}; if(patch && patch.master===true && !(await isMaster())) throw {message:'Hanya Master yang bisa mengangkat Master.'}; await setDoc(doc(db,'staff',(uid||'').trim()), Object.assign({updatedAt:serverTimestamp()}, patch||{}),{merge:true});
  logAudit('ubah_peran_staff', 'Ubah peran staff (uid:'+uid+'): '+JSON.stringify(patch||{})); }
async function removeStaff(uid){ if(!(await isSuper())) throw {message:'Khusus admin utama.'}; await deleteDoc(doc(db,'staff',(uid||'').trim()));
  logAudit('cabut_staff', 'Cabut akses staff (uid:'+uid+').'); }

// ---- kelola reward ----
async function listRewardsAdmin(){ return await loadRewardCatalog(); }
async function saveReward(id, patch){
  if(!(await isSuper())) throw {message:'Khusus admin utama.'}; patch=patch||{};
  if(!id){ const t=(patch.title||'').trim(); if(!t) throw {message:'Judul reward wajib.'}; id=slug(t); }
  const data={}; ['title','note','icon'].forEach(k=>{ if(patch[k]!=null) data[k]=String(patch[k]); });
  if(patch.cost!=null && patch.cost!=='') data.cost=Math.max(0,Math.floor(Number(patch.cost)||0));
  if(patch.limit!=null && patch.limit!=='') data.limit=Math.max(0,Math.floor(Number(patch.limit)||0));
  if(patch.active!=null) data.active=!!patch.active;
  if(patch.discType!=null) data.discType=String(patch.discType||'none');
  if(patch.discValue!=null && patch.discValue!=='') data.discValue=Math.max(0,Number(patch.discValue)||0);
  if(patch.discMax!=null && patch.discMax!=='') data.discMax=Math.max(0,Math.floor(Number(patch.discMax)||0));
  if(patch.freeItemId!=null) data.freeItemId=String(patch.freeItemId||'');
  if(patch.freeItemName!=null) data.freeItemName=String(patch.freeItemName||'');
  if(patch.freeItemPrice!=null && patch.freeItemPrice!=='') data.freeItemPrice=Math.max(0,Math.floor(Number(patch.freeItemPrice)||0));
  data.updatedAt=serverTimestamp();
  await setDoc(doc(db,'rewards',id), data, {merge:true}); return { id:id };
}
async function setRewardActive(id, active){ if(!(await isSuper())) throw {message:'Khusus admin utama.'}; await setDoc(doc(db,'rewards',(id||'').trim()), { active:!!active, updatedAt:serverTimestamp() },{merge:true}); }
async function resetRewardClaimed(id){ if(!(await isSuper())) throw {message:'Khusus admin utama.'}; await setDoc(doc(db,'rewards',(id||'').trim()), { claimed:0, updatedAt:serverTimestamp() },{merge:true}); }
async function deleteReward(id){ if(!(await isSuper())) throw {message:'Khusus admin utama.'}; id=(id||'').trim(); if(REWARDS.some(function(r){return r.id===id;})){ await setDoc(doc(db,'rewards',id), { deleted:true, active:false, updatedAt:serverTimestamp() }, {merge:true}); } else { await deleteDoc(doc(db,'rewards',id)); } }

// ---- voucher (admin) ----
async function adminClearUsedVouchers(range){
  if(!(await isMaster())) throw {message:'Khusus Master.'};
  const fromMs=(range&&range.from)?new Date(range.from+'T00:00:00').getTime():0;
  const toMs=(range&&range.to)?new Date(range.to+'T23:59:59').getTime():0;
  const q=query(collection(db,'vouchers'), where('status','==','terpakai'));
  const snap=await getDocs(q); let n=0;
  for(const ds of snap.docs){
    const x=ds.data(); const ts=(x.usedAt&&x.usedAt.seconds)?x.usedAt.seconds*1000:0;
    if(fromMs && ts<fromMs) continue; if(toMs && ts>toMs) continue;
    try{ await deleteDoc(doc(db,'vouchers',ds.id)); n++; }catch(e){}
  }
  logAudit('hapus_voucher_terpakai', 'Hapus voucher terpakai'+((range&&(range.from||range.to))?(' periode '+(range.from||'awal')+' s/d '+(range.to||'sekarang')):' (SEMUA)')+' ('+n+' baris).');
  return { count:n };
}
async function deleteVoucherRec(code){ if(!(await isMaster())) throw {message:'Khusus Master.'}; code=(code||'').trim(); if(!code) throw {message:'Kode kosong.'}; let info=''; try{ const s=await getDoc(doc(db,'vouchers',code)); if(s.exists()){ const x=s.data(); info=(x.name||'?')+' · '+(x.title||code)+' · '+(x.status||''); } }catch(e){} await deleteDoc(doc(db,'vouchers',code)); logAudit('hapus_voucher', 'Hapus 1 voucher: '+info+' (kode:'+code+')'); }
async function adminSetVoucherStatus(code, active){
  if(!(await isSuper())) throw {message:'Khusus admin utama.'}; code=(code||'').trim().toUpperCase(); if(!code) throw {message:'Kode kosong.'};
  if(active){ await setDoc(doc(db,'vouchers',code), { status:'aktif', usedAt:null, usedOutlet:null, usedBy:null, updatedAt:serverTimestamp() },{merge:true}); }
  else { await setDoc(doc(db,'vouchers',code), { status:'terpakai', usedAt:serverTimestamp(), updatedAt:serverTimestamp() },{merge:true}); }
}
async function listVouchersByUid(uid){ uid=(uid||'').trim(); if(!uid) return [];
  try{ const snap=await getDocs(query(collection(db,'vouchers'), where('uid','==',uid))); const arr=[];
    snap.forEach(d=>{ const x=d.data(); arr.push({ code:d.id, title:x.title||'', status:x.status||'aktif', ts:(x.createdAt&&x.createdAt.seconds)?x.createdAt.seconds*1000:0 }); });
    arr.sort((a,b)=>b.ts-a.ts); return arr; }catch(e){ return []; }
}

// ---- pengumuman / banner ----
async function getAnnouncement(){
  try{ const s=await getDoc(doc(db,'settings','announcement')); if(!s.exists()) return {text:'',active:false,image:'',link:''}; const x=s.data(); return {text:x.text||'', active:x.active===true, image:x.image||'', link:x.link||''}; }catch(e){ return {text:'',active:false,image:'',link:''}; }
}
async function setAnnouncement(text, active){ if(!(await isSuper())) throw {message:'Khusus admin utama.'};
  await setDoc(doc(db,'settings','announcement'), { text:String(text||''), active:!!active, updatedAt:serverTimestamp() },{merge:true}); }
async function saveBanner(opts){ if(!(await isSuper())) throw {message:'Khusus admin utama.'}; opts=opts||{};
  const patch={ updatedAt:serverTimestamp() };
  if(opts.image!==undefined) patch.image=String(opts.image||'');
  if(opts.link!==undefined) patch.link=String(opts.link||'');
  if(opts.text!==undefined) patch.text=String(opts.text||'');
  if(opts.active!==undefined) patch.active=!!opts.active;
  await setDoc(doc(db,'settings','announcement'), patch, {merge:true}); }

// ===== Pesan otomatis WA (CC & order) — editable admin =====
const DEF_CC_MSG='Halo minmil, saya ingin menyampaikan kritik / kendala nih';
const DEF_ORDER_MSG='Halo Minmil, aku mau pesan dongg 🙏';
const DEF_LUPAPIN_MSG='Halo Minmil, aku lupa PIN akunku 🙏 Tolong bantu reset ya.\nNama: \nNo HP terdaftar: ';
const WA_CC='6288216106216';
async function getMessages(){ try{ const s=await getDoc(doc(db,'settings','messages')); const d=(s.exists()&&s.data())||{}; return { cc:(d.cc||DEF_CC_MSG), order:(d.order||DEF_ORDER_MSG), lupapin:(d.lupapin||DEF_LUPAPIN_MSG) }; }catch(e){ return { cc:DEF_CC_MSG, order:DEF_ORDER_MSG, lupapin:DEF_LUPAPIN_MSG }; } }
async function setMessages(m){ if(!(await isSuper())) throw {message:'Khusus admin utama.'}; m=m||{}; await setDoc(doc(db,'settings','messages'), { cc:String(m.cc||''), order:String(m.order||''), lupapin:String(m.lupapin||''), updatedAt:serverTimestamp() }, {merge:true});
  logAudit('ubah_pesan_wa', 'Ubah pesan otomatis WhatsApp.'); }
async function getPromo(){ try{ const s=await getDoc(doc(db,'settings','promo')); const d=(s.exists()&&s.data())||{}; return { active:!!d.active, start:d.start||'', end:d.end||'', bonus:(typeof d.bonus==='number'?d.bonus:parseInt(d.bonus||0,10)||0) }; }catch(e){ return { active:false, start:'', end:'', bonus:0 }; } }
async function setPromo(p){ if(!(await isSuper())) throw {message:'Khusus admin utama.'}; p=p||{}; await setDoc(doc(db,'settings','promo'), { active:!!p.active, start:String(p.start||''), end:String(p.end||''), bonus:Math.max(0,parseInt(p.bonus||0,10)||0), updatedAt:serverTimestamp() }, {merge:true});
  logAudit('pasang_promo', (p.active?('Aktifkan promo bonus pendaftaran: '+p.start+' s/d '+p.end+', +'+p.bonus+' poin.'):'Nonaktifkan promo bonus pendaftaran.')); }
let _regBonusChecked=false, _promoCache=null;
async function maybeGrantRegBonus(){
  if(_regBonusChecked || !user || !profile) return;
  _regBonusChecked=true;
  try{
    if(!_promoCache) _promoCache=await getPromo();
    const p=_promoCache;
    if(!p || !p.active || !(p.bonus>0) || !p.start || !p.end) return;
    const sig=p.start+'_'+p.end;
    if(profile.regBonusClaimed===sig) return;
    const c=profile.createdAt; const cms=(c&&c.seconds)?c.seconds*1000:0; if(!cms) return;
    const cd=new Date(cms); const cdStr=cd.getFullYear()+'-'+String(cd.getMonth()+1).padStart(2,'0')+'-'+String(cd.getDate()).padStart(2,'0');
    if(cdStr<p.start || cdStr>p.end) return;
    await runTransaction(db, async (tx)=>{ const ref=doc(db,'users',user.uid); const snap=await tx.get(ref); const d=snap.exists()?snap.data():{}; if(d.regBonusClaimed===sig) return; tx.set(ref, { points: increment(p.bonus), regBonusClaimed: sig, updatedAt: serverTimestamp() }, {merge:true}); });
    try{ await addDoc(collection(db,'transactions'), { uid:user.uid, name:(profile.name||''), nominal:0, points:p.bonus, kind:'bonus', outlet:'Bonus pendaftaran', createdAt:serverTimestamp() }); }catch(e){}
    setTimeout(function(){ try{ showRegBonusPopupWhenClear(p.bonus); }catch(e){} }, 1000);
  }catch(e){}
}
function showRegBonusPopupWhenClear(bonus, tries){
  tries=tries||0;
  var pfOpen = (pfBk && pfBk.classList && pfBk.classList.contains('show'));
  if((document.getElementById('ooOutletAsk') || document.getElementById('ooDobAsk') || pfOpen) && tries<40){
    setTimeout(function(){ showRegBonusPopupWhenClear(bonus, tries+1); }, 1000);
    return;
  }
  showRegBonusPopup(bonus);
}
function showRegBonusPopup(bonus){
  if(document.getElementById('ooBonusPop')) return;
  var bk=document.createElement('div'); bk.id='ooBonusPop';
  bk.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px';
  bk.innerHTML='<div style="background:#FFF9EC;border-radius:18px;padding:24px 20px;max-width:340px;width:100%;text-align:center;box-shadow:0 12px 40px rgba(0,0,0,.3)">'
    +'<div style="font-size:2.6rem;line-height:1;margin-bottom:8px">🎁</div>'
    +'<div style="font-weight:900;font-size:1.15rem;color:#5A3017;margin-bottom:6px">Yeay, dapat poin bonus!</div>'
    +'<div style="font-size:.9rem;color:#7A5A3A;margin-bottom:16px">Sebagai member Oma Opa, kamu dapat hadiah <b>+'+bonus+' poin</b> otomatis dari promo yang sedang berlangsung 🎉</div>'
    +'<button id="ooBonusOk" style="width:100%;padding:12px;border:none;border-radius:11px;background:#FACC1A;color:#5A3A05;font-weight:800;font-size:.95rem;cursor:pointer">Asiiap, makasih!</button>'
    +'</div>';
  document.body.appendChild(bk);
  bk.querySelector('#ooBonusOk').onclick=function(){ bk.remove(); };
}

// ===== Multi-banner carousel (koleksi 'banners', slot b1..b3) =====
async function _bumpBannerVer(){ try{ await setDoc(doc(db,'settings','bannerVer'), { v:Date.now() }, {merge:true}); }catch(e){} }
async function listBanners(){ if(!(await isSuper())) throw {message:'Khusus admin utama.'};
  const snap=await getDocs(collection(db,'banners'));
  const rows=snap.docs.map(d=>({ id:d.id, image:d.data().image||'', link:d.data().link||'', active:d.data().active!==false, order:Number(d.data().order)||0 }));
  rows.sort((a,b)=>(a.order||0)-(b.order||0));
  return rows;
}
async function saveBannerItem(id, data){ if(!(await isSuper())) throw {message:'Khusus admin utama.'}; data=data||{};
  const rid=(id||('bn_'+Date.now().toString(36))).trim();
  await setDoc(doc(db,'banners',rid), { image:String(data.image||''), link:String(data.link||''), active:data.active!==false, order:Number(data.order)||0, updatedAt:serverTimestamp() }, {merge:true});
  await _bumpBannerVer();
  logAudit('upload_banner', 'Simpan banner ('+rid+'), aktif:'+(data.active!==false)+'.');
  return { id:rid };
}
async function deleteBannerItem(id){ if(!(await isSuper())) throw {message:'Khusus admin utama.'}; await deleteDoc(doc(db,'banners',(id||'').trim())); await _bumpBannerVer();
  logAudit('hapus_banner', 'Kosongkan banner ('+id+').'); }
async function listBannersPublic(){
  try{
    let ver=0;
    try{ const vs=await getDoc(doc(db,'settings','bannerVer')); if(vs.exists()) ver=vs.data().v||0; }catch(e){}
    try{ const c=JSON.parse(localStorage.getItem('omaopa_banners')||'null'); if(c && c.v===ver && Array.isArray(c.items)) return c.items; }catch(e){}
    const snap=await getDocs(query(collection(db,'banners'), where('active','==',true)));
    let items=snap.docs.map(d=>({ image:d.data().image||'', link:d.data().link||'', order:Number(d.data().order)||0 })).filter(b=>b.image);
    items.sort((a,b)=>(a.order||0)-(b.order||0));
    items=items.map(b=>({ image:b.image, link:b.link }));
    try{ localStorage.setItem('omaopa_banners', JSON.stringify({ v:ver, items:items })); }catch(e){}
    return items;
  }catch(e){ return []; }
}

// ---- order (pesanan web) ----
async function logOrder(o){
  o=o||{}; const items=(o.items||[]).map(it=>({ id:it.id||'', cat:it.cat||'', name:it.name||'', price:it.price||0, qty:it.qty||0 }));
  try{ await addDoc(collection(db,'orders'), { items:items, total:o.total||0, count:items.reduce((s,i)=>s+(i.qty||0),0),
    outlet:o.outlet||'', nama:o.nama||'', telp:o.telp||'', tgl:o.tgl||'', jam:o.jam||'', note:o.note||'',
    voucherCode:o.voucherCode||'', voucherDisc:o.voucherDisc||0,
    uid:(user?user.uid:''), status:'baru', createdAt:serverTimestamp() }); }catch(e){}
}
async function listOrders(n){ n=n||1000;
  function row(d){ const x=d.data(); return { id:d.id, items:x.items||[], total:x.total||0, count:x.count||0, outlet:x.outlet||'', nama:x.nama||'', telp:x.telp||'', jam:x.jam||'', tgl:x.tgl||'', note:x.note||'', voucherCode:x.voucherCode||'', voucherDisc:x.voucherDisc||0, status:x.status||'baru', ts:(x.createdAt&&x.createdAt.seconds)?x.createdAt.seconds*1000:0 }; }
  try{ const snap=await getDocs(query(collection(db,'orders'), orderBy('createdAt','desc'), limit(n))); const arr=[]; snap.forEach(d=>arr.push(row(d))); return arr;
  }catch(e){ try{ const snap=await getDocs(collection(db,'orders')); const arr=[]; snap.forEach(d=>arr.push(row(d))); arr.sort((a,b)=>b.ts-a.ts); return arr; }catch(e2){ return []; } }
}
function itemLabel(it){ it=it||{}; var base=String(it.cat||'').trim(); var nm=String(it.name||it.id||'').trim(); if(base && nm && base.toLowerCase()!==nm.toLowerCase()) return base+' – '+nm; return nm||base; }
function pushOrderRow(id, x, action){
  const items=(x.items||[]).map(it=>((it.qty||0)+'x '+itemLabel(it))).join('; ');
  pushToSheet({ type:'pesanan', action:action||'upsert', id:id, waktu:new Date().toISOString(),
    tgl_ambil:x.tgl||'', jam:x.jam||'', outlet:x.outlet||'', nama:x.nama||'', telp:("'"+(x.telp||'')),
    items:items, pcs:x.count||0, total:x.total||0, status:x.status||'' });
}
function pushOrderItems(id, x, action){
  if(action==='delete'||action==='clear'){ pushToSheet({ type:'item', action:action, id:id }); return; }
  const rows=(x.items||[]).map(function(it){ var q=Number(it.qty)||0, h=Number(it.price)||0; return { kue:it.cat||'', topping:it.name||it.id||'', qty:q, harga:h, subtotal:h*q }; });
  pushToSheet({ type:'item', action:'replace', id:id, waktu:new Date().toISOString(),
    tgl_ambil:x.tgl||'', jam:x.jam||'', outlet:x.outlet||'', nama:x.nama||'', status:x.status||'', rows:rows });
}
async function setOrderStatus(id, status){ if(!(await isSuper())) throw {message:'Khusus admin utama.'}; id=(id||'').trim();
  await setDoc(doc(db,'orders',id), { status:String(status||'baru'), updatedAt:serverTimestamp() },{merge:true});
  let voucherWarn=false, voucherCode='';
  try{ if(String(status)==='approved'){ const s=await getDoc(doc(db,'orders',id)); if(s.exists()){ const d=s.data(); pushOrderRow(id, d, 'upsert'); pushOrderItems(id, d, 'replace'); await awardOrderPoints(id, d);
        voucherCode=String(d.voucherCode||'').trim();
        if(voucherCode){
          try{ await runTransaction(db, async (tx)=>{ const vref=doc(db,'vouchers',voucherCode); const vs=await tx.get(vref); if(!vs.exists()){ voucherWarn=true; return; } const vd=vs.data()||{}; if(vd.status && vd.status!=='aktif'){ voucherWarn=true; return; } tx.set(vref, { status:'terpakai', usedAt:serverTimestamp(), usedVia:'order', usedOrder:id, usedBy:(user?user.uid:'') }, {merge:true}); }); }catch(e){ voucherWarn=true; }
          if(!voucherWarn){ try{ pushToSheet({ type:'voucher', waktu:new Date().toISOString(), outlet:(d.outlet||''), kode:voucherCode, title:'', nama:(d.nama||''), uid:(d.uid||'') }); }catch(e){} }
        }
      } }
       else { pushToSheet({ type:'pesanan', action:'delete', id:id }); pushOrderItems(id, null, 'delete'); } }catch(e){}
  return { voucherWarn:voucherWarn, voucherCode:voucherCode };
}
async function updateOrder(id, patch){ if(!(await isSuper())) throw {message:'Khusus admin utama.'}; id=(id||'').trim(); const data=Object.assign({updatedAt:serverTimestamp()}, patch||{}); if(data.total!=null) data.total=Math.round(Number(data.total)||0); await setDoc(doc(db,'orders',id), data, {merge:true});
  try{ const s=await getDoc(doc(db,'orders',id)); if(s.exists()){ const d=s.data(); if((d.status||'baru')==='approved'){ pushOrderRow(id, d, 'upsert'); pushOrderItems(id, d, 'replace'); } } }catch(e){}
}
async function deleteOrder(id){ if(!(await isMaster())) throw {message:'Khusus Master.'}; id=(id||'').trim(); let info=''; try{ const s=await getDoc(doc(db,'orders',id)); if(s.exists()){ const x=s.data(); info=(x.nama||'?')+' · '+(x.outlet||'-')+' · Rp'+(x.total||0); } }catch(e){} await deleteDoc(doc(db,'orders',id));
  try{ pushToSheet({ type:'pesanan', action:'delete', id:id }); pushOrderItems(id, null, 'delete'); }catch(e){}
  logAudit('hapus_pesanan', 'Hapus 1 pesanan web: '+info+' (id:'+id+')');
}
async function adminClearOrders(){
  if(!(await isMaster())) throw {message:'Khusus Master.'};
  const snap=await getDocs(collection(db,'orders')); let n=0;
  for(const ds of snap.docs){ try{ await deleteDoc(doc(db,'orders',ds.id)); n++; }catch(e){} }
  try{ pushToSheet({ type:'pesanan', action:'clear' }); pushOrderItems(null, null, 'clear'); }catch(e){}
  logAudit('hapus_semua_pesanan', 'Hapus SEMUA pesanan web ('+n+' baris).');
  return { count:n };
}

// ---- tier member (berdasarkan total belanja) ----
const TIERS=[{name:'Cucu Kesayangan',min:3000000,color:'#E5A100'},{name:'Bestie',min:1000000,color:'#FF9E2C'},{name:'Sahabat',min:500000,color:'#FF8FA3'},{name:'Teman Baru',min:0,color:'#B98A5E'}];
function tierOf(spend){ spend=Number(spend)||0; for(let i=0;i<TIERS.length;i++){ if(spend>=TIERS[i].min) return TIERS[i]; } return TIERS[TIERS.length-1]; }
async function getMyTier(){ try{ if(!user) return null; const txs=await listMyTransactions(); const spend=txs.reduce((s,t)=>s+(t.nominal||0),0); const tr=tierOf(spend); return { name:tr.name, color:tr.color, spend:spend }; }catch(e){ return null; } }

// ============================================================
//  API publik
// ============================================================
window.OmaOpa = {
  openLogin, closeLogin,
  openRewards, openVouchers, closeRewards,
  openMemberCard, openProfile, changeMyPin, getCheckinStatus, dailyCheckin, openCheckin,
  openLeaderboard, openScoreboard, openHistory,
  submitScore, listPointLeaderboard, listScoreLeaderboard, listMyTransactions,
  redeem, listVouchers, listRewardsPublic,
  isStaff, findVoucher, markVoucherUsed,
  getMemberByUid, getOrCreateMemberCode, getMemberByCode, awardPoints, getStaffOutlet,
  getStaffInfo, listTransactions, listUsedVouchers, repeatRateByOutlet, avgTransactionStats, memberOutletSummary, backfillLastTxnAt, backfillNameLower, trackVisit, startPresence, getOnlineCount, getTrafficStats, listAudit, adminDeleteTransactions,
  isAdmin, isSuper, isMaster, isHRD, getMemberByPhone, listMembers, listMembersPage, getMemberScore,
  listProductsAdmin, listProductsPublic, saveProduct, setProductActive, deleteProduct, recordPosTransaction,
  listPosCategories, savePosCategory, deletePosCategory,
  listMenuItemsAdmin, listMenuItemsPublic, saveMenuItem, setMenuItemAvail, deleteMenuItem,
  adminAdjustPoints, adminSetPoints, adminSetScore, adminResetPoints, adminClearTransactions, deleteTransaction,
  listOutlets, listPublicOutlets, addOutlet, updateOutlet, deleteOutlet, seedOutlets, parseMapsLatLng, buildMapsLink,
  outletGroup, matchOutletKey,
  sendBroadcast, listBroadcasts, deactivateBroadcast, deleteBroadcast, getMemberBroadcasts, markBroadcastRead,
  listStaff, addStaff, updateStaff, removeStaff,
  listRewardsAdmin, saveReward, setRewardActive, resetRewardClaimed, deleteReward,
  adminSetVoucherStatus, adminClearUsedVouchers, deleteVoucherRec, listVouchersByUid,
  getAnnouncement, setAnnouncement, getMessages, setMessages, getPromo, setPromo, saveBanner, listBanners, saveBannerItem, deleteBannerItem, listBannersPublic, logOrder, listOrders,
  setOrderStatus, updateOrder, deleteOrder, adminClearOrders, itemLabel, adminResetPin, deleteMyAccount, adminDeleteMember,
  tierOf, TIERS, getMyTier,
  signOut: doSignOut,
  getUser: ()=> user ? { uid:user.uid, name:(profile&&profile.name)||user.displayName||'', phone:(profile&&profile.phone)||'' } : null,
  getPoints: ()=> points,
  addPoints,                  // dipanggil game saat dapat poin
  onChange: (cb)=>{ listeners.push(cb); try{ cb(snapshot()); }catch(e){} return ()=>{ const i=listeners.indexOf(cb); if(i>=0) listeners.splice(i,1); }; }
};
emit();
try{ window.dispatchEvent(new CustomEvent('omaopa:ready',{detail:snapshot()})); }catch(e){}
// Gabungkan outlet dari database (termasuk yang ditambah via admin, mis. Kronggahan) ke daftar picker
(async function(){ try{ const fs=await listOutlets(); if(fs && fs.length){ const byName={}; (window.OMA_OUTLETS||[]).forEach(o=>{ byName[(o.name||'').toLowerCase().trim()]=o; }); fs.forEach(o=>{ if(o && o.name && o.active!==false) byName[(o.name||'').toLowerCase().trim()]={ name:o.name, area:o.area, maps:o.maps, lat:o.lat, lng:o.lng, internalOnly:o.internalOnly }; }); window.OMA_OUTLETS=Object.keys(byName).map(k=>byName[k]); } }catch(e){} })();
// Gabungkan menu web-order dari Firestore (menuItems, diedit admin) ke atas data statis menu-data.js — override per-field (fallback ke data statis kalau field kosong), avail=false beneran disembunyikan
(async function(){ try{ const extra=await listMenuItemsPublic(); if(extra && extra.length){ const byId={}; (window.OMA_MENU||[]).forEach(m=>{ byId[m.id]=m; });
  extra.forEach(o=>{
    if(o.avail===false){ delete byId[o.id]; return; }
    const base=byId[o.id]||{};
    byId[o.id]={ id:o.id, cat:(o.cat||base.cat||''), name:(o.name||base.name||''), price:(o.price||base.price||0), desc:((o.desc!=null&&o.desc!=='')?o.desc:(base.desc||'')), img:(o.img||base.img||''), avail:true };
  });
  window.OMA_MENU=Object.keys(byId).map(k=>byId[k]);
} }catch(e){} })();
