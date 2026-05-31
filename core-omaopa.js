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
  getFirestore, doc, getDoc, setDoc, onSnapshot, increment, serverTimestamp
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
  if(!consent) throw {message:'Centang persetujuan dulu ya.'};
  const res = await createUserWithEmailAndPassword(auth, phoneEmail(phone), pin);
  user = res.user;
  try{ await updateProfile(user,{displayName:name.trim()}); }catch(e){}
  await ensureDoc({ name:name.trim(), phone:normPhone(phone), gender, age, occupation, consent:true, provider:'phone', profileComplete:true });
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
    <button class="oo-g" id="ooGoogle">
      <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.6 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.3C29.2 35 26.7 36 24 36c-5.3 0-9.7-3.1-11.3-7.6l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.5l6.3 5.3C41.8 35.7 44 30.3 44 24c0-1.3-.1-2.3-.4-3.5z"/></svg>
      Lanjut dengan Google
    </button>
    <div class="oo-or">atau pakai No HP</div>
    <div class="oo-tabs">
      <div class="oo-tab ${tab==='masuk'?'on':''}" data-tab="masuk">Masuk</div>
      <div class="oo-tab ${tab==='daftar'?'on':''}" data-tab="daftar">Daftar</div>
    </div>
    <div id="ooErr"></div>
    <div id="ooForm"></div>
    <div class="oo-mini">Dengan masuk, kamu setuju datamu dipakai untuk program member Oma Opa.</div>`;
  body.querySelector('#ooGoogle').onclick = async ()=>{ setErr(''); try{ await signInGoogle(); closeLogin(); }catch(e){ setErr(errMsg(e)); } };
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
      <select class="oo-se" id="rJob"><option value="">—</option><option>Pelajar/Mahasiswa</option><option>Karyawan</option><option>Wiraswasta</option><option>Ibu Rumah Tangga</option><option>Lainnya</option></select>
      <label class="oo-ck"><input type="checkbox" id="rConsent"> Saya setuju data saya digunakan untuk program member Oma Opa Cakery.</label>
      <button class="oo-btn" id="rGo">Daftar</button>
    </div>`;
    f.querySelector('#rGo').onclick = async (ev)=>{
      setErr(''); const b=ev.target; b.disabled=true; b.textContent='Memproses…';
      try{
        await registerPhonePin({
          name:f.querySelector('#rName').value, phone:f.querySelector('#rPhone').value, pin:f.querySelector('#rPin').value,
          gender:f.querySelector('#rGender').value, age:f.querySelector('#rAge').value, occupation:f.querySelector('#rJob').value,
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
//  API publik
// ============================================================
window.OmaOpa = {
  openLogin, closeLogin,
  signOut: doSignOut,
  getUser: ()=> user ? { uid:user.uid, name:(profile&&profile.name)||user.displayName||'' } : null,
  getPoints: ()=> points,
  addPoints,                  // dipanggil game saat dapat poin
  onChange: (cb)=>{ listeners.push(cb); try{ cb(snapshot()); }catch(e){} return ()=>{ const i=listeners.indexOf(cb); if(i>=0) listeners.splice(i,1); }; }
};
emit();
try{ window.dispatchEvent(new CustomEvent('omaopa:ready',{detail:snapshot()})); }catch(e){}
