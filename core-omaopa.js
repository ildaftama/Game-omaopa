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
  getFirestore, doc, getDoc, setDoc, deleteDoc, addDoc, onSnapshot, increment, serverTimestamp,
  runTransaction, collection, getDocs, query, orderBy, where, limit
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
let staffFlag=false;
onAuthStateChanged(auth, async (u)=>{
  if(unsubDoc){ unsubDoc(); unsubDoc=null; }
  mergedOnce = false;
  user = u || null;
  staffFlag = false;
  if(user){
    try{ await ensureDoc(); }catch(e){}
    try{ const si=await getStaffInfo(); staffFlag=!!si;
      if(staffFlag){ try{ setDoc(doc(db,'leaderboard',user.uid),{staff:true},{merge:true}); }catch(e){} try{ setDoc(doc(db,'scores',user.uid),{staff:true},{merge:true}); }catch(e){} }
    }catch(e){ staffFlag=false; }
    const ref = doc(db,'users',user.uid);
    unsubDoc = onSnapshot(ref,(d)=>{
      const data = d.exists()? d.data() : {};
      profile = data;
      points = (typeof data.points==='number') ? data.points : 0;
      emit();
      if(d.exists()) mirrorLeaderboard(data.name, points);
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
    type: 'member',
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
    svg='<svg viewBox="0 0 24 24" width="30" height="30" fill="none"><path d="M3 11 Q3 3.2 12 3 Q21 3.2 21 11 Q19 9.3 17 11 Q15 9.3 13 11 Q11 9.3 9 11 Q7 9.3 5 11 Q4 9.5 3 11 Z" fill="#FACC1A" stroke="#E0B100" stroke-width="1" stroke-linejoin="round"/><path d="M12 3 V2.1" stroke="#7A5A12" stroke-width="1.4" stroke-linecap="round"/><circle cx="12" cy="1.8" r=".9" fill="#7A5A12"/><path d="M12 11 V18.2" stroke="#7A5A12" stroke-width="1.6" stroke-linecap="round"/><path d="M12 18.2 Q12 20.4 9.6 20.4 Q8.2 20.4 8.2 19.2" fill="none" stroke="#7A5A12" stroke-width="1.6" stroke-linecap="round"/></svg>';
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
  REWARDS.forEach(rw=>{ const o=docs[rw.id]||{};
    list.push({ id:rw.id,
      title:(o.title!=null?o.title:rw.title), note:(o.note!=null?o.note:(rw.note||'')),
      cost:(num(o.cost)!=null?o.cost:rw.cost), limit:(num(o.limit)!=null?o.limit:(rw.limit!=null?rw.limit:null)),
      claimed:(num(o.claimed)!=null?o.claimed:0), active:(o.active!==false), icon:(o.icon||''), custom:false });
    delete docs[rw.id]; });
  Object.keys(docs).forEach(id=>{ const x=docs[id]; if(num(x.cost)==null) return;
    list.push({ id, title:x.title||id, note:x.note||'', cost:x.cost, limit:(num(x.limit)!=null?x.limit:null), claimed:(num(x.claimed)!=null?x.claimed:0), active:(x.active!==false), icon:x.icon||'', custom:true }); });
  list.sort((a,b)=>a.cost-b.cost);
  rewardCatalog=list; rewardStock={}; list.forEach(r=>rewardStock[r.id]=r.claimed);
  return list;
}
async function listRewardStock(){ await loadRewardCatalog(); return rewardStock; }
function genCode(){
  const t = Date.now().toString(36).toUpperCase().slice(-4);
  const r = Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,4).padEnd(4,'X');
  return 'OO-'+t+r;
}
async function redeem(rewardId){
  if(!user) throw {message:'Masuk dulu untuk menukar poin.'};
  const rw = (rewardCatalog||defaultRewards()).find(x=>x.id===rewardId); if(!rw) throw {message:'Hadiah tidak ditemukan.'};
  if(rw.active===false) throw {message:'Hadiah sedang tidak tersedia.'};
  const uref = doc(db,'users',user.uid);
  const rref = doc(db,'rewards',rw.id);
  const code = genCode();
  const vref = doc(db,'vouchers',code);
  const nm = (profile&&profile.name)||user.displayName||'';
  await runTransaction(db, async (tx)=>{
    const us = await tx.get(uref);
    const rs = await tx.get(rref);
    const cur = (us.exists() && typeof us.data().points==='number') ? us.data().points : 0;
    const claimed = (rs.exists() && typeof rs.data().claimed==='number') ? rs.data().claimed : 0;
    if(typeof rw.limit==='number' && claimed >= rw.limit) throw {message:'Yah, stok hadiah ini sudah habis 😢'};
    if(cur < rw.cost) throw {message:'Poin belum cukup.'};
    tx.set(uref, { points: cur - rw.cost, updatedAt: serverTimestamp() }, {merge:true});
    tx.set(rref, { claimed: claimed + 1, limit: (rw.limit||null), title: rw.title, updatedAt: serverTimestamp() }, {merge:true});
    tx.set(vref, { code:code, uid:user.uid, name:nm, rewardId:rw.id, title:rw.title, note:rw.note||'', cost:rw.cost, status:'aktif', createdAt: serverTimestamp() });
  });
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
  let data={};
  try{ const s=await getDoc(doc(db,'vouchers',code)); if(s.exists()) data=s.data(); }catch(e){}
  await setDoc(doc(db,'vouchers',code), { status:'terpakai', usedAt: serverTimestamp(), usedOutlet:outlet, usedBy:(user?user.uid:'') }, {merge:true});
  pushToSheet({ type:'voucher', waktu:new Date().toISOString(), outlet:outlet, kode:code, title:data.title||'', nama:data.name||'', uid:data.uid||'' });
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
  const uref=doc(db,'users',uid); let newTotal=0, mname='';
  await runTransaction(db, async (tx)=>{
    const us=await tx.get(uref);
    if(!us.exists()) throw {message:'Member tidak ditemukan.'};
    const d=us.data(); const cur=(typeof d.points==='number')?d.points:0; mname=d.name||'';
    newTotal=cur+pts;
    tx.set(uref,{ points:newTotal, updatedAt:serverTimestamp() },{merge:true});
    tx.set(doc(db,'leaderboard',uid), { name:mname, points:newTotal, updatedAt:serverTimestamp() }, {merge:true});
    const tref=doc(collection(db,'transactions'));
    tx.set(tref,{ uid:uid, name:mname, nominal:nominal, points:pts, outlet:outlet, staffUid:(user?user.uid:''), createdAt:serverTimestamp() });
  });
  pushToSheet({ type:'txn', waktu:new Date().toISOString(), outlet:outlet, nama:mname, uid:uid, nominal:nominal, poin:pts });
  return { points:pts, newTotal:newTotal, outlet:outlet };
}
async function getStaffInfo(){
  if(!user) return null;
  try{ const s=await getDoc(doc(db,'staff',user.uid)); if(!s.exists()) return null; const d=s.data(); return { outlet:d.outlet||d.name||'', admin: d.admin===true, super: d.super===true }; }catch(e){ return null; }
}
async function listTransactions(outlet){
  try{
    const q = outlet ? query(collection(db,'transactions'), where('outlet','==',outlet)) : collection(db,'transactions');
    const snap = await getDocs(q); const arr=[];
    snap.forEach(d=>{ const x=d.data(); arr.push({ id:d.id, uid:x.uid||'', name:x.name||'', nominal:x.nominal||0, points:x.points||0, kind:x.kind||'', outlet:x.outlet||'', ts:(x.createdAt&&x.createdAt.seconds)?x.createdAt.seconds*1000:0 }); });
    arr.sort((a,b)=>b.ts-a.ts); return arr;
  }catch(e){ return []; }
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
.rw-voucher{background:#fff;border:2px dashed #E0B100;border-radius:14px;padding:11px 13px;margin-bottom:9px}
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
.rw-bar>span{display:block;height:100%;background:linear-gradient(90deg,#FACC1A,#E0915B);border-radius:999px;transition:width .4s}
.rw-badge{display:inline-block;font-size:.6rem;font-weight:900;background:#FFE2E2;color:#C0392B;border-radius:999px;padding:1px 7px;margin-left:4px;vertical-align:middle}
.rw-item.rw-out{opacity:.6}
.lb-body{max-height:60vh;overflow:auto;margin-top:4px}
.lb-loading,.lb-empty{text-align:center;color:#b59a7e;font-weight:700;font-size:.85rem;padding:22px 8px;line-height:1.5}
.lb-pts{display:block;width:max-content;margin:2px auto 12px;background:#fff;border:2px solid #F1E4CC;border-radius:999px;padding:6px 16px;font-weight:900;color:#7A5A12}
.lb-row{display:flex;align-items:center;gap:10px;background:#fff;border:2px solid #EFE2C4;border-radius:13px;padding:9px 12px;margin-bottom:7px}
.lb-row.lb-me{border-color:#FACC1A;background:#FFFBEC}
.lb-rank{font-weight:900;color:#C98A1B;min-width:28px;text-align:center;font-size:.98rem}
.lb-name{flex:1;min-width:0;font-weight:800;color:#613925;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lb-youtag{font-size:.58rem;font-weight:900;background:#FACC1A;color:#5A3A05;border-radius:999px;padding:1px 7px;vertical-align:middle;margin-left:4px}
.lb-val{font-weight:900;color:#7A5A12;font-size:.9rem;white-space:nowrap}
.hs-item{display:flex;align-items:center;justify-content:space-between;gap:10px;background:#fff;border:2px solid #EFE2C4;border-radius:13px;padding:9px 12px;margin-bottom:7px}
.hs-out{font-weight:800;color:#613925;font-size:.9rem}
.hs-date{font-size:.7rem;color:#9a7a5e;font-weight:700;margin-top:1px}
.hs-nom{font-weight:900;color:#613925;font-size:.9rem;text-align:right}
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
    }).join('') + `<div class="oo-mini">Stok terbatas — siapa cepat dia dapat! Tunjukkan kode/QR voucher ke kasir Oma Opa.</div>`;
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
  (async()=>{ try{ const txs=await listMyTransactions(); const spend=txs.reduce((s,t)=>s+(t.nominal||0),0); const tr=tierOf(spend); const el=mcBk.querySelector('#mcTier'); if(el) el.innerHTML='<span style="display:inline-block;background:'+tr.color+';color:#fff;font-weight:900;font-size:.72rem;border-radius:999px;padding:3px 12px">★ Member '+tr.name+'</span>'; }catch(e){} })();
  const box=mcBk.querySelector('#mcQR'); box.innerHTML='<span style="color:#b59a7e;font-weight:700;font-size:.8rem">Memuat QR…</span>';
  mcBk.classList.add('show');
  try{ await ensureQRLib(); box.innerHTML=''; new QRCode(box,{text:'OMAOPA:MEMBER:'+user.uid, width:188, height:188, correctLevel:QRCode.CorrectLevel.M}); }
  catch(e){ box.innerHTML='<span style="color:#C0392B;font-weight:700;font-size:.8rem">QR gagal dimuat</span>'; }
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
  <div class="oo-mini" style="margin-top:8px">Data tidak bisa diubah sendiri. Untuk koreksi data, hubungi kasir Oma Opa ya 🙏</div>
  <button class="oo-out" id="pfCard" style="margin-top:12px;background:${K};color:#5A3A05;border-color:${K}">Lihat Kartu Member (QR) →</button>
  <button class="oo-out" id="pfOut" style="margin-top:8px">Keluar akun</button>
</div>`;
function mountPf(){ if(!document.body.contains(pfBk)) document.body.appendChild(pfBk); }
if(document.body) mountPf(); else document.addEventListener('DOMContentLoaded', mountPf);
pfBk.querySelector('#pfX').onclick = ()=> pfBk.classList.remove('show');
pfBk.querySelector('#pfOut').onclick = async ()=>{ try{ await doSignOut(); }catch(e){} pfBk.classList.remove('show'); };
pfBk.querySelector('#pfCard').onclick = ()=>{ pfBk.classList.remove('show'); openMemberCard(); };
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
  pfBk.querySelector('#pfTier').innerHTML='';
  pfBk.classList.add('show');
  (async()=>{ try{ const txs=await listMyTransactions(); const spend=txs.reduce((s,t)=>s+(t.nominal||0),0); const tr=tierOf(spend);
    pfBk.querySelector('#pfSpent').textContent='Rp'+spend.toLocaleString('id-ID');
    pfBk.querySelector('#pfTx').textContent=txs.length;
    const te=pfBk.querySelector('#pfTier'); if(te) te.innerHTML='<span style="display:inline-block;background:'+tr.color+';color:#fff;font-weight:900;font-size:.72rem;border-radius:999px;padding:3px 14px">★ Member '+tr.name+'</span>';
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
  const list=await listPointLeaderboard(50);
  lbO.body.innerHTML='<div class="oo-mini" style="margin:0 0 10px">Siapa raja poin Oma Opa? Kumpulkan poin biar naik peringkat!</div>'+renderRankList(list,'points','🪙');
}
async function openScoreboard(){
  sbO.mount(); sbO.head.textContent='🏆 Raja Skor Menopping';
  sbO.body.innerHTML='<div class="lb-loading">Memuat peringkat…</div>'; sbO.bk.classList.add('show');
  const list=await listScoreLeaderboard(50);
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
async function getMemberByPhone(phone){
  const p=normPhone(phone); if(!p) return null;
  try{ const snap=await getDocs(query(collection(db,'users'), where('phone','==',p), limit(1)));
    let r=null; snap.forEach(d=>{ if(!r){ const x=d.data(); r={uid:d.id,name:x.name||'',phone:x.phone||'',points:(typeof x.points==='number')?x.points:0}; } }); return r;
  }catch(e){ return null; }
}
async function listMembers(qstr, n){
  n=n||500; qstr=(qstr||'').trim().toLowerCase();
  try{ const snap=await getDocs(query(collection(db,'users'), limit(n))); const arr=[];
    snap.forEach(d=>{ const x=d.data(); const nm=(x.name||''), ph=(x.phone||'');
      if(qstr && nm.toLowerCase().indexOf(qstr)<0 && ph.indexOf(qstr)<0) return;
      arr.push({uid:d.id,name:nm,phone:ph,points:(typeof x.points==='number')?x.points:0, gender:x.gender||'', age:x.age||'', occupation:x.occupation||'', earnGame:(typeof x.earn_game==='number')?x.earn_game:0, earnCheckin:(typeof x.earn_checkin==='number')?x.earn_checkin:0}); });
    arr.sort((a,b)=>b.points-a.points); return arr;
  }catch(e){ return []; }
}
async function getMemberScore(uid){ try{ const s=await getDoc(doc(db,'scores',(uid||'').trim())); return s.exists()?(s.data().score||0):0; }catch(e){ return 0; } }
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
  if(!(await isSuper())) throw {message:'Khusus admin utama.'};
  opts=opts||{};
  const usnap=await getDocs(collection(db,'users')); let n=0;
  for(const ds of usnap.docs){ const uid=ds.id;
    try{ await setDoc(doc(db,'users',uid), { points:0, earn_game:0, earn_checkin:0, lastCheckin:'', streak:0, updatedAt:serverTimestamp() }, {merge:true}); }catch(e){}
    try{ await setDoc(doc(db,'leaderboard',uid), { points:0, updatedAt:serverTimestamp() }, {merge:true}); }catch(e){}
    if(opts.scores){ try{ await deleteDoc(doc(db,'scores',uid)); }catch(e){} }
    n++;
  }
  return { count:n };
}
async function adminClearTransactions(){
  if(!(await isSuper())) throw {message:'Khusus admin utama.'};
  const snap=await getDocs(collection(db,'transactions')); let n=0;
  for(const ds of snap.docs){ try{ await deleteDoc(doc(db,'transactions',ds.id)); n++; }catch(e){} }
  return { count:n };
}
function slug(s){ return String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60) || ('o'+Date.now()); }
async function listOutlets(){
  try{ const snap=await getDocs(collection(db,'outlets')); const arr=[];
    snap.forEach(d=>{ const x=d.data(); arr.push({ id:d.id, name:x.name||'', area:x.area||'Lainnya', maps:x.maps||'', active:x.active!==false }); });
    arr.sort((a,b)=>(a.area||'').localeCompare(b.area||'')||(a.name||'').localeCompare(b.name||'')); return arr;
  }catch(e){ return []; }
}
async function listPublicOutlets(){
  try{ const snap=await getDocs(collection(db,'outlets')); const arr=[];
    snap.forEach(d=>{ const x=d.data(); if(x.active===false) return; arr.push({ name:x.name||'', area:x.area||'Lainnya', maps:x.maps||'' }); });
    return arr;
  }catch(e){ return []; }
}
async function addOutlet(o){
  if(!(await isSuper())) throw {message:'Khusus admin utama.'};
  o=o||{}; if(!o.name||!o.name.trim()) throw {message:'Nama outlet wajib diisi.'};
  const id=slug(o.name);
  await setDoc(doc(db,'outlets',id), { name:o.name.trim(), area:(o.area||'Lainnya').trim(), maps:(o.maps||'').trim(), active:true, updatedAt:serverTimestamp() },{merge:true});
  return { id:id };
}
async function updateOutlet(id, patch){
  if(!(await isSuper())) throw {message:'Khusus admin utama.'};
  if(!id) throw {message:'ID kosong.'};
  await setDoc(doc(db,'outlets',id), Object.assign({updatedAt:serverTimestamp()}, patch||{}), {merge:true});
}
async function deleteOutlet(id){
  if(!(await isSuper())) throw {message:'Khusus admin utama.'};
  if(!id) throw {message:'ID kosong.'};
  await deleteDoc(doc(db,'outlets',id));
}
async function seedOutlets(arr){
  if(!(await isSuper())) throw {message:'Khusus admin utama.'};
  arr=arr||[]; let n=0;
  for(const o of arr){ if(!o||!o.name) continue;
    await setDoc(doc(db,'outlets',slug(o.name)), { name:o.name, area:o.area||'Lainnya', maps:o.maps||'', active:true, updatedAt:serverTimestamp() },{merge:true}); n++; }
  return { count:n };
}

// ---- staff / kasir ----
async function listStaff(){
  if(!(await isAdmin())) return [];
  try{ const snap=await getDocs(collection(db,'staff')); const base=[];
    snap.forEach(d=>{ const x=d.data()||{}; base.push({ uid:d.id, outlet:x.outlet||x.name||'', admin:x.admin===true, super:x.super===true }); });
    for(const s of base){ try{ const u=await getDoc(doc(db,'users',s.uid)); if(u.exists()){ const d=u.data(); s.name=d.name||''; s.phone=d.phone||''; } }catch(e){} }
    base.sort((a,b)=>(a.outlet||'').localeCompare(b.outlet||'')); return base;
  }catch(e){ return []; }
}
async function addStaff(uid, outlet, admin){ if(!(await isSuper())) throw {message:'Khusus admin utama.'}; uid=(uid||'').trim(); if(!uid) throw {message:'UID wajib diisi.'};
  await setDoc(doc(db,'staff',uid), { outlet:(outlet||'').trim(), admin:!!admin, updatedAt:serverTimestamp() },{merge:true}); }
async function updateStaff(uid, patch){ if(!(await isSuper())) throw {message:'Khusus admin utama.'}; await setDoc(doc(db,'staff',(uid||'').trim()), Object.assign({updatedAt:serverTimestamp()}, patch||{}),{merge:true}); }
async function removeStaff(uid){ if(!(await isSuper())) throw {message:'Khusus admin utama.'}; await deleteDoc(doc(db,'staff',(uid||'').trim())); }

// ---- kelola reward ----
async function listRewardsAdmin(){ return await loadRewardCatalog(); }
async function saveReward(id, patch){
  if(!(await isSuper())) throw {message:'Khusus admin utama.'}; patch=patch||{};
  if(!id){ const t=(patch.title||'').trim(); if(!t) throw {message:'Judul reward wajib.'}; id=slug(t); }
  const data={}; ['title','note','icon'].forEach(k=>{ if(patch[k]!=null) data[k]=String(patch[k]); });
  if(patch.cost!=null && patch.cost!=='') data.cost=Math.max(0,Math.floor(Number(patch.cost)||0));
  if(patch.limit!=null && patch.limit!=='') data.limit=Math.max(0,Math.floor(Number(patch.limit)||0));
  if(patch.active!=null) data.active=!!patch.active;
  data.updatedAt=serverTimestamp();
  await setDoc(doc(db,'rewards',id), data, {merge:true}); return { id:id };
}
async function setRewardActive(id, active){ if(!(await isSuper())) throw {message:'Khusus admin utama.'}; await setDoc(doc(db,'rewards',(id||'').trim()), { active:!!active, updatedAt:serverTimestamp() },{merge:true}); }
async function resetRewardClaimed(id){ if(!(await isSuper())) throw {message:'Khusus admin utama.'}; await setDoc(doc(db,'rewards',(id||'').trim()), { claimed:0, updatedAt:serverTimestamp() },{merge:true}); }
async function deleteReward(id){ if(!(await isSuper())) throw {message:'Khusus admin utama.'}; await deleteDoc(doc(db,'rewards',(id||'').trim())); }

// ---- voucher (admin) ----
async function adminClearUsedVouchers(){
  if(!(await isSuper())) throw {message:'Khusus admin utama.'};
  const q=query(collection(db,'vouchers'), where('status','==','terpakai'));
  const snap=await getDocs(q); let n=0;
  for(const ds of snap.docs){ try{ await deleteDoc(doc(db,'vouchers',ds.id)); n++; }catch(e){} }
  return { count:n };
}
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

// ---- order (pesanan web) ----
async function logOrder(o){
  o=o||{}; const items=(o.items||[]).map(it=>({ id:it.id||'', cat:it.cat||'', name:it.name||'', price:it.price||0, qty:it.qty||0 }));
  try{ await addDoc(collection(db,'orders'), { items:items, total:o.total||0, count:items.reduce((s,i)=>s+(i.qty||0),0),
    outlet:o.outlet||'', nama:o.nama||'', telp:o.telp||'', tgl:o.tgl||'', jam:o.jam||'', note:o.note||'',
    uid:(user?user.uid:''), status:'baru', createdAt:serverTimestamp() }); }catch(e){}
}
async function listOrders(n){ n=n||1000;
  function row(d){ const x=d.data(); return { id:d.id, items:x.items||[], total:x.total||0, count:x.count||0, outlet:x.outlet||'', nama:x.nama||'', telp:x.telp||'', jam:x.jam||'', tgl:x.tgl||'', note:x.note||'', status:x.status||'baru', ts:(x.createdAt&&x.createdAt.seconds)?x.createdAt.seconds*1000:0 }; }
  try{ const snap=await getDocs(query(collection(db,'orders'), orderBy('createdAt','desc'), limit(n))); const arr=[]; snap.forEach(d=>arr.push(row(d))); return arr;
  }catch(e){ try{ const snap=await getDocs(collection(db,'orders')); const arr=[]; snap.forEach(d=>arr.push(row(d))); arr.sort((a,b)=>b.ts-a.ts); return arr; }catch(e2){ return []; } }
}
async function setOrderStatus(id, status){ if(!(await isSuper())) throw {message:'Khusus admin utama.'}; await setDoc(doc(db,'orders',(id||'').trim()), { status:String(status||'baru'), updatedAt:serverTimestamp() },{merge:true}); }
async function updateOrder(id, patch){ if(!(await isSuper())) throw {message:'Khusus admin utama.'}; const data=Object.assign({updatedAt:serverTimestamp()}, patch||{}); if(data.total!=null) data.total=Math.round(Number(data.total)||0); await setDoc(doc(db,'orders',(id||'').trim()), data, {merge:true}); }
async function deleteOrder(id){ if(!(await isSuper())) throw {message:'Khusus admin utama.'}; await deleteDoc(doc(db,'orders',(id||'').trim())); }

// ---- tier member (berdasarkan total belanja) ----
const TIERS=[{name:'Gold',min:2000000,color:'#E0B100'},{name:'Silver',min:500000,color:'#9AA0A6'},{name:'Bronze',min:0,color:'#C98A4B'}];
function tierOf(spend){ spend=Number(spend)||0; for(let i=0;i<TIERS.length;i++){ if(spend>=TIERS[i].min) return TIERS[i]; } return TIERS[TIERS.length-1]; }

// ============================================================
//  API publik
// ============================================================
window.OmaOpa = {
  openLogin, closeLogin,
  openRewards, closeRewards,
  openMemberCard, openProfile, getCheckinStatus, dailyCheckin, openCheckin,
  openLeaderboard, openScoreboard, openHistory,
  submitScore, listPointLeaderboard, listScoreLeaderboard, listMyTransactions,
  redeem, listVouchers,
  isStaff, findVoucher, markVoucherUsed,
  getMemberByUid, awardPoints, getStaffOutlet,
  getStaffInfo, listTransactions, listUsedVouchers,
  isAdmin, isSuper, getMemberByPhone, listMembers, getMemberScore,
  adminAdjustPoints, adminSetPoints, adminSetScore, adminResetPoints, adminClearTransactions,
  listOutlets, listPublicOutlets, addOutlet, updateOutlet, deleteOutlet, seedOutlets,
  listStaff, addStaff, updateStaff, removeStaff,
  listRewardsAdmin, saveReward, setRewardActive, resetRewardClaimed, deleteReward,
  adminSetVoucherStatus, adminClearUsedVouchers, listVouchersByUid,
  getAnnouncement, setAnnouncement, saveBanner, logOrder, listOrders,
  setOrderStatus, updateOrder, deleteOrder,
  tierOf, TIERS,
  signOut: doSignOut,
  getUser: ()=> user ? { uid:user.uid, name:(profile&&profile.name)||user.displayName||'', phone:(profile&&profile.phone)||'' } : null,
  getPoints: ()=> points,
  addPoints,                  // dipanggil game saat dapat poin
  onChange: (cb)=>{ listeners.push(cb); try{ cb(snapshot()); }catch(e){} return ()=>{ const i=listeners.indexOf(cb); if(i>=0) listeners.splice(i,1); }; }
};
emit();
try{ window.dispatchEvent(new CustomEvent('omaopa:ready',{detail:snapshot()})); }catch(e){}
