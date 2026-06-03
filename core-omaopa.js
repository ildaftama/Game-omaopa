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
  signOut as fbSignOut, updateProfile
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, onSnapshot, increment, serverTimestamp,
  runTransaction, collection, getDocs, query, orderBy, where
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

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
setPersistence(auth, browserLocalPersistence).catch(()=>{});

const LS_PTS = 'omaopa_points';        // cermin dompet (dipakai game utk tampilan)
const LS_UNSYNCED = 'omaopa_unsynced'; // poin yg didapat saat belum login (digabung saat login)
const PHONE_DOMAIN = '@phone.omaopa.fun';

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

let user = null, profile = null, points = 0, unsubDoc = null, mergedOnce = false;
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

function addPoints(n){
  n = Math.round(n)||0; if(!n) return;
  if(user){
    const ref = doc(db,'users',user.uid);
    setDoc(ref,{ points: increment(n), updatedAt: serverTimestamp() },{merge:true}).catch(()=>{});
    // tampilan diupdate oleh onSnapshot
  } else {
    points += n;
    const u = (parseInt(lsGet(LS_UNSYNCED)||'0',10)||0) + n;
    lsSet(LS_UNSYNCED, u);
    emit();
  }
}

// ---------- auth flow ----------
onAuthStateChanged(auth, async (u)=>{
  if(unsubDoc){ unsubDoc(); unsubDoc=null; }
  mergedOnce = false;
  user = u || null;
  if(user){
    try{ await ensureDoc(); }catch(e){}
    const ref = doc(db,'users',user.uid);
    unsubDoc = onSnapshot(ref,(d)=>{
      const data = d.exists()? d.data() : {};
      profile = data;
      points = (typeof data.points==='number') ? data.points : 0;
      emit();
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
async function registerPhonePin(data){
  const { phone, pin, name, gender, age, occupation, consent } = data;
  if(!name || name.trim().length<2) throw {message:'Isi nama dulu ya.'};
  if(!normPhone(phone)) throw {message:'Nomor HP belum benar.'};
  if(!validPin(pin)) throw {message:'PIN harus 6 angka.'};
  if(!gender) throw {message:'Pilih jenis kelamin dulu ya.'};
  if(!age) throw {message:'Pilih usia dulu ya.'};
  if(!occupation) throw {message:'Isi/pilih pekerjaan dulu ya.'};
  if(!consent) throw {message:'Centang persetujuan dulu ya.'};
  const res = await createUserWithEmailAndPassword(auth, phoneEmail(phone), pin);
  user = res.user;
  try{ await updateProfile(user,{displayName:name.trim()}); }catch(e){}
  await ensureDoc({ name:name.trim(), phone:normPhone(phone), gender, age, occupation, consent:true, provider:'phone', profileComplete:true });
  pushToSheet({
    waktu: new Date().toISOString(),
    uid: user.uid,
    nama: name.trim(),
    no_hp: normPhone(phone),
    gender: gender,
    usia: age,
    pekerjaan: occupation
  });
}
async function doSignOut(){ await fbSignOut(auth); }

// ============================================================
//  UI LOGIN (disuntik sendiri ke halaman manapun)
// ============================================================
const K='#FACC1A', KD='#E0B100', CO='#613925', CR='#FFF8EC';
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

function renderOverlay(){
  const body = bk.querySelector('#ooBody'); if(!body) return;
  if(user){
    const nm = (profile&&profile.name)||user.displayName||'Sahabat Oma Opa';
    body.innerHTML = `<div class="oo-prof">
      <div class="oo-av">${(nm[0]||'O').toUpperCase()}</div>
      <div class="oo-h" style="margin-bottom:0">Hai, ${nm}!</div>
      <div class="oo-pts">🪙 ${points} poin</div>
      <button class="oo-out" id="ooOut">Keluar</button>
      <div class="oo-mini">Poinmu tersimpan di akun & bisa dipakai di semua game.</div>
    </div>`;
    body.querySelector('#ooOut').onclick = async ()=>{ try{ await doSignOut(); }catch(e){} closeLogin(); };
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
    </div>`;
    f.querySelector('#ooGo').onclick = async (ev)=>{
      setErr(''); const b=ev.target; b.disabled=true; b.textContent='Memproses…';
      try{ await loginPhonePin(f.querySelector('#ooPhone').value, f.querySelector('#ooPin').value); closeLogin(); }
      catch(e){ setErr(errMsg(e)); b.disabled=false; b.textContent='Masuk'; }
    };
  } else {
    f.innerHTML = `<div class="oo-f">
      <label class="oo-l">Nama</label>
      <input class="oo-in" id="rName" placeholder="Nama panggilan">
      <label class="oo-l">No HP</label>
      <input class="oo-in" id="rPhone" type="tel" inputmode="numeric" placeholder="0812xxxxxxx">
      <label class="oo-l">PIN (6 angka)</label>
      <input class="oo-in" id="rPin" type="password" inputmode="numeric" maxlength="6" placeholder="buat PIN">
      <div class="oo-row">
        <div><label class="oo-l">Jenis kelamin</label>
          <select class="oo-se" id="rGender"><option value="">—</option><option>Laki-laki</option><option>Perempuan</option><option>Lainnya</option></select></div>
        <div><label class="oo-l">Usia</label>
          <select class="oo-se" id="rAge"><option value="">—</option><option>≤17</option><option>18-24</option><option>25-34</option><option>35-44</option><option>45+</option></select></div>
      </div>
      <label class="oo-l">Pekerjaan</label>
      <select class="oo-se" id="rJob"><option value="">—</option><option>PNS</option><option>Pelajar</option><option>Mahasiswa</option><option>Karyawan swasta</option><option>Pengusaha</option><option>Ibu Rumah Tangga</option><option>Lainnya</option></select>
      <input class="oo-in" id="rJobOther" placeholder="Tulis pekerjaanmu" style="display:none">
      <label class="oo-ck"><input type="checkbox" id="rConsent"> Saya setuju data saya digunakan sebagai member dan riset customer.</label>
      <button class="oo-btn" id="rGo">Daftar</button>
    </div>`;
    (function(){ var js=f.querySelector('#rJob'), jo=f.querySelector('#rJobOther'); if(js&&jo) js.onchange=function(){ jo.style.display=(js.value==='Lainnya')?'block':'none'; }; })();
    f.querySelector('#rGo').onclick = async (ev)=>{
      setErr(''); const b=ev.target; b.disabled=true; b.textContent='Memproses…';
      try{
        let occ=f.querySelector('#rJob').value; if(occ==='Lainnya') occ=(f.querySelector('#rJobOther').value||'').trim();
        await registerPhonePin({
          name:f.querySelector('#rName').value, phone:f.querySelector('#rPhone').value, pin:f.querySelector('#rPin').value,
          gender:f.querySelector('#rGender').value, age:f.querySelector('#rAge').value, occupation:occ,
          consent:f.querySelector('#rConsent').checked
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
  { id:'d5',  cost:100, title:'Diskon 5%' },
  { id:'d10', cost:150, title:'Diskon 10%' },
  { id:'ft',  cost:200, title:'Gratis topping 1 malmil', note:'tiap pembelian 3 malmil' },
  { id:'d15', cost:250, title:'Diskon 15%' },
  { id:'fm',  cost:350, title:'Gratis malmil polos', note:'tiap transaksi Rp50.000' },
  { id:'tb',  cost:500, title:'Gratis totebag', note:'tiap pembelian ogura topping' }
];
function genCode(){
  const t = Date.now().toString(36).toUpperCase().slice(-4);
  const r = Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,4).padEnd(4,'X');
  return 'OO-'+t+r;
}
async function redeem(rewardId){
  if(!user) throw {message:'Masuk dulu untuk menukar poin.'};
  const rw = REWARDS.find(x=>x.id===rewardId); if(!rw) throw {message:'Voucher tidak ditemukan.'};
  const uref = doc(db,'users',user.uid);
  const code = genCode();
  const vref = doc(db,'vouchers',code);
  const nm = (profile&&profile.name)||user.displayName||'';
  await runTransaction(db, async (tx)=>{
    const us = await tx.get(uref);
    const cur = (us.exists() && typeof us.data().points==='number') ? us.data().points : 0;
    if(cur < rw.cost) throw {message:'Poin belum cukup.'};
    tx.set(uref, { points: cur - rw.cost, updatedAt: serverTimestamp() }, {merge:true});
    tx.set(vref, { code:code, uid:user.uid, name:nm, rewardId:rw.id, title:rw.title, note:rw.note||'', cost:rw.cost, status:'aktif', createdAt: serverTimestamp() });
  });
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
  try{ const s = await getDoc(doc(db,'vouchers',code)); return s.exists()? Object.assign({code:s.id}, s.data()) : null; }catch(e){ return null; }
}
async function getStaffOutlet(){
  if(!user) return '';
  try{ const s=await getDoc(doc(db,'staff',user.uid)); if(s.exists()){ const d=s.data(); return d.outlet||d.name||''; } }catch(e){}
  return '';
}
async function markVoucherUsed(code){
  code=(code||'').trim().toUpperCase(); if(!code) throw {message:'Kode kosong.'};
  const outlet=await getStaffOutlet();
  await setDoc(doc(db,'vouchers',code), { status:'terpakai', usedAt: serverTimestamp(), usedOutlet:outlet, usedBy:(user?user.uid:'') }, {merge:true});
}
async function getMemberByUid(uid){
  uid=(uid||'').trim(); if(!uid) return null;
  try{ const s=await getDoc(doc(db,'users',uid)); if(!s.exists()) return null; const d=s.data();
    return { uid:uid, name:d.name||'', phone:d.phone||'', points:(typeof d.points==='number')?d.points:0 }; }
  catch(e){ return null; }
}
const EARN_PER_POINT = 4000;   // Rp per 1 poin
async function awardPoints(uid, nominal){
  uid=(uid||'').trim(); nominal=Math.max(0, Math.floor(Number(nominal)||0));
  if(!uid) throw {message:'UID kosong.'};
  if(nominal<=0) throw {message:'Nominal belanja tidak valid.'};
  const pts=Math.floor(nominal/EARN_PER_POINT);
  if(pts<=0) throw {message:'Belanja minimal Rp'+EARN_PER_POINT.toLocaleString('id-ID')+' untuk dapat 1 poin.'};
  const outlet=await getStaffOutlet();
  const uref=doc(db,'users',uid); let newTotal=0;
  await runTransaction(db, async (tx)=>{
    const us=await tx.get(uref);
    if(!us.exists()) throw {message:'Member tidak ditemukan.'};
    const cur=(typeof us.data().points==='number')?us.data().points:0;
    newTotal=cur+pts;
    tx.set(uref,{ points:newTotal, updatedAt:serverTimestamp() },{merge:true});
    const tref=doc(collection(db,'transactions'));
    tx.set(tref,{ uid:uid, nominal:nominal, points:pts, outlet:outlet, staffUid:(user?user.uid:''), createdAt:serverTimestamp() });
  });
  return { points:pts, newTotal:newTotal, outlet:outlet };
}
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
.rw-voucher{background:#fff;border:2px dashed #E0B100;border-radius:14px;padding:11px 13px;margin-bottom:9px}
.rw-vt{font-weight:800;color:${CO};font-size:.9rem}
.rw-vc{font-family:monospace;font-size:1.05rem;font-weight:800;letter-spacing:1px;color:#7A5A12;margin:3px 0}
.rw-vs{display:inline-block;font-size:.7rem;font-weight:900;border-radius:999px;padding:2px 9px}
.rw-vs.aktif{background:#E7F6E7;color:#2E7D32}
.rw-vs.terpakai{background:#F1EDE6;color:#9a8b78}
.rw-empty{text-align:center;color:#b59a7e;font-weight:700;font-size:.85rem;padding:18px 6px}
.rw-banner{background:#E7F6E7;color:#2E7D32;border-radius:11px;padding:9px 11px;font-size:.82rem;font-weight:800;text-align:center;margin-bottom:10px}
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
function openRewards(){ mountRw(); rwTab='katalog'; rwBanner=''; renderRewards(); rwBk.classList.add('show'); }
function closeRewards(){ rwBk.classList.remove('show'); rwBanner=''; }
rwBk.querySelector('#rwX').onclick = closeRewards;
rwBk.addEventListener('click', e=>{ if(e.target===rwBk) closeRewards(); });
rwBk.querySelectorAll('.oo-tab').forEach(t=> t.onclick = ()=>{ rwTab=t.dataset.rt; rwBanner=''; renderRewards(); });

function renderRewards(){
  const rp=rwBk.querySelector('#rwPts'); if(rp) rp.innerHTML='🪙 '+points+' poin';
  rwBk.querySelectorAll('.oo-tab').forEach(t=> t.classList.toggle('on', t.dataset.rt===rwTab));
  const ban=rwBk.querySelector('#rwBanner'); if(ban) ban.innerHTML = rwBanner? `<div class="rw-banner">${rwBanner}</div>`:'';
  const body=rwBk.querySelector('#rwBody'); if(!body) return;
  if(rwTab==='katalog'){
    body.innerHTML = REWARDS.map(rw=>{
      const can = !!user && points>=rw.cost;
      const label = !user ? 'Masuk' : (points>=rw.cost ? 'Tukar' : 'Kurang');
      const dis = (!user) ? '' : (points>=rw.cost ? '' : 'disabled');
      return `<div class="rw-item"><div class="rw-info"><div class="rw-t">${rw.title}</div>${rw.note?`<div class="rw-n">${rw.note}</div>`:''}</div>`
        +`<div><div class="rw-c">${rw.cost} poin</div><button class="rw-btn" data-rid="${rw.id}" ${dis}>${label}</button></div></div>`;
    }).join('') + `<div class="oo-mini">Tukarkan kode voucher ke kasir Oma Opa saat membeli.</div>`;
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
      ensureQRLib().then(()=>{ body.querySelectorAll('.vqr').forEach(el=>{ if(el.dataset.done)return; el.dataset.done='1'; el.innerHTML=''; try{ new QRCode(el,{text:'OMAOPA:VOUCHER:'+el.dataset.vq, width:114, height:114, correctLevel:QRCode.CorrectLevel.M}); }catch(e){} }); }).catch(()=>{});
    });
  }
}
rwBk.querySelector('#rwBody').addEventListener('click', async (e)=>{
  const b=e.target.closest('[data-rid]'); if(!b) return;
  if(!user){ closeRewards(); openLogin(); return; }
  const rid=b.dataset.rid; const rw=REWARDS.find(x=>x.id===rid); if(!rw) return;
  if(points<rw.cost){ rwBanner='Poin belum cukup.'; renderRewards(); return; }
  if(!window.confirm('Tukar '+rw.cost+' poin untuk "'+rw.title+'"?')) return;
  b.disabled=true; b.textContent='…';
  try{
    const code = await redeem(rid);
    rwTab='voucher'; rwBanner='Berhasil! Kode voucher: '+code+' — tunjukkan ke kasir.'; renderRewards();
  }catch(err){ rwBanner=(err&&err.message)||'Gagal menukar.'; renderRewards(); }
});

// ====== Kartu Member (QR) ======
const mcBk = document.createElement('div');
mcBk.className='oo-bk';
mcBk.innerHTML = `<div class="oo-card" style="position:relative;text-align:center">
  <button class="oo-x" id="mcX">×</button>
  <div class="oo-h">Kartu Member 🎫</div>
  <div id="mcName" style="font-weight:900;color:${CO};font-size:1.05rem;margin-bottom:2px"></div>
  <div class="rw-pts" id="mcPts">🪙 0 poin</div>
  <div id="mcQR" style="width:200px;height:200px;margin:6px auto 8px;background:#fff;border:2px solid #F1E4CC;border-radius:14px;display:flex;align-items:center;justify-content:center"></div>
  <div class="oo-mini">Tunjukkan QR ini ke kasir buat dapat poin tiap belanja.</div>
</div>`;
function mountMc(){ if(!document.body.contains(mcBk)) document.body.appendChild(mcBk); }
if(document.body) mountMc(); else document.addEventListener('DOMContentLoaded', mountMc);
mcBk.querySelector('#mcX').onclick = ()=> mcBk.classList.remove('show');
mcBk.addEventListener('click', e=>{ if(e.target===mcBk) mcBk.classList.remove('show'); });
async function openMemberCard(){
  if(!user){ openLogin(); return; }
  mountMc();
  mcBk.querySelector('#mcName').textContent=(profile&&profile.name)||'Member';
  mcBk.querySelector('#mcPts').innerHTML='🪙 '+points+' poin';
  const box=mcBk.querySelector('#mcQR'); box.innerHTML='<span style="color:#b59a7e;font-weight:700;font-size:.8rem">Memuat QR…</span>';
  mcBk.classList.add('show');
  try{ await ensureQRLib(); box.innerHTML=''; new QRCode(box,{text:'OMAOPA:MEMBER:'+user.uid, width:188, height:188, correctLevel:QRCode.CorrectLevel.M}); }
  catch(e){ box.innerHTML='<span style="color:#C0392B;font-weight:700;font-size:.8rem">QR gagal dimuat</span>'; }
}

// ============================================================
//  API publik
// ============================================================
window.OmaOpa = {
  openLogin, closeLogin,
  openRewards, closeRewards,
  openMemberCard,
  redeem, listVouchers,
  isStaff, findVoucher, markVoucherUsed,
  getMemberByUid, awardPoints, getStaffOutlet,
  signOut: doSignOut,
  getUser: ()=> user ? { uid:user.uid, name:(profile&&profile.name)||user.displayName||'' } : null,
  getPoints: ()=> points,
  addPoints,                  // dipanggil game saat dapat poin
  onChange: (cb)=>{ listeners.push(cb); try{ cb(snapshot()); }catch(e){} return ()=>{ const i=listeners.indexOf(cb); if(i>=0) listeners.splice(i,1); }; }
};
emit();
try{ window.dispatchEvent(new CustomEvent('omaopa:ready',{detail:snapshot()})); }catch(e){}
