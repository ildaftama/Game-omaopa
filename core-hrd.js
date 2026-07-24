// ============================================================
//  Oma Opa Cakery — CORE HRD (jadwal, cuti, lembur, WFA, absensi, profil karyawan, struktur organisasi)
//  Dipakai oleh: karyawan.html, absensi.html, hrd.html, pabrik.html
//  WAJIB dimuat SETELAH <script type="module" src="core-omaopa.js">
//  (butuh window.OmaOpa buat cek peran isHRD/isStaff/dst yang udah didefinisikan di sana)
// ============================================================
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, deleteDoc, addDoc, serverTimestamp,
  collection, getDocs, getCountFromServer, query, orderBy, where, limit, startAfter
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

// Reuse app Firebase yang sama kalau core-omaopa.js udah initializeApp duluan (harusnya iya, ini file wajib dimuat belakangan)
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const PHONE_DOMAIN = '@phone.omaopa.fun';

// ---- helper kecil yang didup dari core-omaopa.js (stabil, jarang berubah) ----
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

// ---- cek peran: delegasi ke window.OmaOpa (satu-satunya sumber kebenaran, didefinisikan di core-omaopa.js) ----
function isHRD(){ return window.OmaOpa.isHRD(); }
function isSuper(){ return window.OmaOpa.isSuper(); }
function isMaster(){ return window.OmaOpa.isMaster(); }
function isStaff(){ return window.OmaOpa.isStaff(); }
function isAdmin(){ return window.OmaOpa.isAdmin(); }

function haversineMeters(lat1, lng1, lat2, lng2){
  if([lat1,lng1,lat2,lng2].some(v=>typeof v!=='number'||isNaN(v))) return null;
  const R=6371000; const toRad=d=>d*Math.PI/180;
  const dLat=toRad(lat2-lat1), dLng=toRad(lng2-lng1);
  const a=Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLng/2)**2;
  return R * 2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

async function registerKaryawan(data){
  const { phone, pin, name, outlet, shift, email, claimDivisi, claimSubDivisi, claimPosisi, claimStrukturalLevel } = data||{};
  if(!name || name.trim().length<2) throw {message:'Isi nama lengkap dulu ya.'};
  if(!normPhone(phone)) throw {message:'Nomor HP belum benar.'};
  if(!validPin(pin)) throw {message:'PIN harus 6 angka.'};
  if(!outlet) throw {message:'Pilih lokasi absen dulu ya.'};
  const emailTrim=(email||'').trim();
  if(!emailTrim || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim)) throw {message:'Isi email yang valid dulu ya.'};
  const acc = await createOrReuseAuthAccount(phone, pin, name.trim());
  const u = acc.user;
  if(!acc.isNew){
    const existing = await getDoc(doc(db,'karyawan',u.uid));
    if(existing.exists()) throw {message:'Nomor HP ini udah pernah daftar jadi karyawan sebelumnya. Coba masuk (login) aja.'};
  }
  await setDoc(doc(db,'karyawan',u.uid), {
    namaLengkap:name.trim(), phone:normPhone(phone), outlet:outlet,
    shift:(shift||'').trim(), fotoProfil:'',
    claimDivisi:(claimDivisi||'').trim(), claimSubDivisi:(claimSubDivisi||'').trim(), claimPosisi:(claimPosisi||'').trim(), claimStrukturalLevel:(claimStrukturalLevel||'staff').trim(),
    approvalStatus:'pending', active:true,
    registeredAt:serverTimestamp(), updatedAt:serverTimestamp()
  });
  try{ await setDoc(doc(db,'karyawanHR',u.uid), { email:emailTrim, updatedAt:serverTimestamp() }, {merge:true}); }catch(e){}
  return { uid:u.uid };
}

async function loginKaryawan(phone, pin){
  if(!normPhone(phone)) throw {message:'Nomor HP belum benar.'};
  if(!validPin(pin)) throw {message:'PIN harus 6 angka.'};
  await signInWithEmailAndPassword(auth, phoneEmail(phone), pin);
}

async function getKaryawanProfile(){
  if(!auth.currentUser) return null;
  try{ const snap=await getDoc(doc(db,'karyawan',auth.currentUser.uid));
    return snap.exists() ? Object.assign({id:snap.id}, snap.data()) : null;
  }catch(e){ return null; }
}

async function listKaryawan(){
  if(!(await isHRD())) return [];
  try{ const snap=await getDocs(collection(db,'karyawan')); const arr=[];
    snap.forEach(d=>{ const x=d.data()||{}; arr.push({ id:d.id, namaLengkap:x.namaLengkap||'', phone:x.phone||'', outlet:x.outlet||'', jabatan:x.jabatan||'', shift:x.shift||'', status:x.status||'', approvalStatus:x.approvalStatus||'pending', active:x.active!==false, fotoProfil:x.fotoProfil||'', nomorPegawai:x.nomorPegawai||'' }); });
    arr.sort((a,b)=>(a.outlet||'').localeCompare(b.outlet||'')||(a.namaLengkap||'').localeCompare(b.namaLengkap||''));
    return arr;
  }catch(e){ return []; }
}

async function approveKaryawan(uid){
  if(!(await isHRD())) throw {message:'Khusus HRD/admin utama.'};
  if(!uid) throw {message:'ID kosong.'};
  await setDoc(doc(db,'karyawan',uid), { approvalStatus:'approved', approvedBy:(auth.currentUser&&auth.currentUser.uid)||'', approvedAt:serverTimestamp(), updatedAt:serverTimestamp() }, {merge:true});
}

async function rejectKaryawan(uid){
  if(!(await isHRD())) throw {message:'Khusus HRD/admin utama.'};
  if(!uid) throw {message:'ID kosong.'};
  await setDoc(doc(db,'karyawan',uid), { approvalStatus:'ditolak', updatedAt:serverTimestamp() }, {merge:true});
}

async function updateKaryawanProfile(uid, patch){
  if(!(await isHRD())) throw {message:'Khusus HRD/admin utama.'};
  if(!uid) throw {message:'ID kosong.'};
  await setDoc(doc(db,'karyawan',uid), Object.assign({updatedAt:serverTimestamp()}, patch||{}), {merge:true});
}

async function deleteKaryawan(uid){
  if(!(await isMaster())) throw {message:'Khusus master.'};
  if(!uid) throw {message:'ID kosong.'};
  await deleteDoc(doc(db,'karyawan',uid));
  try{ await deleteDoc(doc(db,'karyawanHR',uid)); }catch(e){}
}

async function getKaryawanHRProfile(){
  if(!auth.currentUser) return null;
  try{ const snap=await getDoc(doc(db,'karyawanHR',auth.currentUser.uid));
    return snap.exists() ? snap.data() : {};
  }catch(e){ return {}; }
}

function computeOrgLabel(h){
  h=h||{}; const lvl=h.strukturalLevel||'staff';
  if(lvl==='gm') return 'General Manager';
  if(lvl==='manajer') return 'Manajer'+(h.divisi?(' '+h.divisi):'');
  if(lvl==='spv') return 'SPV'+(h.subDivisi?(' '+h.subDivisi):'');
  var base=h.posisi||'';
  if(h.grade) base = base + (base?' - ':'') + h.grade;
  return base || '-';
}

async function fetchAllPages(pagedFn, opts){
  let all=[]; let cursor=null; let guard=0;
  while(guard<200){
    const res = await pagedFn(Object.assign({}, opts||{}, {cursor}));
    all = all.concat(res.items||[]);
    if(!res.hasMore || !res.cursor) break;
    cursor = res.cursor; guard++;
  }
  return all;
}

async function listKontrakExpiringSoon(){
  if(!(await isHRD())) return [];
  try{
    const today=new Date(); const in45=new Date(); in45.setDate(today.getDate()+45);
    const todayStr=today.toISOString().slice(0,10), in45Str=in45.toISOString().slice(0,10);
    const snap=await getDocs(query(collection(db,'karyawanHR'), where('kontrakSelesai','>=',todayStr), where('kontrakSelesai','<=',in45Str)));
    const arr=[];
    for(const d of snap.docs){
      const x=d.data(); let nama='(tidak ditemukan)';
      try{ const kw=await getDoc(doc(db,'karyawan',d.id)); if(kw.exists()) nama=kw.data().namaLengkap||nama; }catch(e){}
      arr.push({ uid:d.id, namaKaryawan:nama, kontrakSelesai:x.kontrakSelesai||'', kontrakJenis:x.kontrakJenis||'', divisi:x.divisi||'' });
    }
    arr.sort((a,b)=>a.kontrakSelesai.localeCompare(b.kontrakSelesai));
    return arr;
  }catch(e){ return []; }
}

async function getManajerEmailForDivisi(divisi){
  if(!divisi) return '';
  try{
    const snap=await getDocs(query(collection(db,'karyawan'), where('divisi','==',divisi), where('strukturalLevel','==','manajer')));
    for(const d of snap.docs){
      const hr=await getDoc(doc(db,'karyawanHR',d.id));
      if(hr.exists() && hr.data().email) return hr.data().email;
    }
    return '';
  }catch(e){ return ''; }
}

async function listKaryawanHR(opts){
  if(!(await isHRD())) return {items:[], hasMore:false, cursor:null};
  opts=opts||{};
  try{
    let qBase = collection(db,'karyawan');
    let constraints=[orderBy('registeredAt','desc')];
    if(opts.approvalStatus) constraints.unshift(where('approvalStatus','==',opts.approvalStatus));
    if(opts.divisi) constraints.unshift(where('divisi','==',opts.divisi));
    if(opts.fromDate) constraints.push(where('registeredAt','>=', new Date(opts.fromDate+'T00:00:00')));
    if(opts.toDate) constraints.push(where('registeredAt','<=', new Date(opts.toDate+'T23:59:59')));
    if(opts.cursor) constraints.push(startAfter(opts.cursor));
    constraints.push(limit(10));
    const basicSnap = await getDocs(query(qBase, ...constraints));
    const uids=[]; const basic={};
    basicSnap.forEach(d=>{ uids.push(d.id); basic[d.id]=d.data()||{}; });
    const arr=[];
    for(const uid of uids){
      let h={}; try{ const hSnap=await getDoc(doc(db,'karyawanHR',uid)); if(hSnap.exists()) h=hSnap.data(); }catch(e){}
      const b=basic[uid];
      const item={ id:uid, namaLengkap:b.namaLengkap||'', phone:b.phone||'', outlet:b.outlet||'', shift:b.shift||'', approvalStatus:b.approvalStatus||'pending', active:b.active!==false, nomorPegawai:b.nomorPegawai||'',
        claimDivisi:b.claimDivisi||'', claimSubDivisi:b.claimSubDivisi||'', claimPosisi:b.claimPosisi||'', claimStrukturalLevel:b.claimStrukturalLevel||'',
        posisi:h.posisi||'', divisi:h.divisi||'', subDivisi:h.subDivisi||'', strukturalLevel:h.strukturalLevel||'', grade:h.grade||'',
        kontrakJenis:h.kontrakJenis||'', kontrakMulai:h.kontrakMulai||'', kontrakSelesai:h.kontrakSelesai||'',
        dob:h.dob||'', alamat:h.alamat||'', noKtp:h.noKtp||'', kontakDaruratNama:h.kontakDaruratNama||'', kontakDaruratHp:h.kontakDaruratHp||'', email:h.email||'', customFields:h.customFields||{} };
      item.orgLabel = computeOrgLabel(h);
      arr.push(item);
    }
    const lastDoc = basicSnap.docs.length ? basicSnap.docs[basicSnap.docs.length-1] : null;
    return { items:arr, hasMore: basicSnap.docs.length===10, cursor:lastDoc };
  }catch(e){ return { items:[], hasMore:false, cursor:null }; }
}

async function updateKaryawanHR(uid, patch){
  if(!(await isHRD())) throw {message:'Khusus HRD/admin utama.'};
  if(!uid) throw {message:'ID kosong.'};
  await setDoc(doc(db,'karyawanHR',uid), Object.assign({updatedAt:serverTimestamp()}, patch||{}), {merge:true});
  // salin divisi/subDivisi/strukturalLevel ke koleksi karyawan basic (dipakai buat cari tim SPV/Manajer,
  // tanpa perlu buka akses ke data HR sensitif lain kayak KTP/alamat)
  const p=patch||{};
  if('divisi' in p || 'subDivisi' in p || 'strukturalLevel' in p || 'posisi' in p){
    const denorm={}; if('divisi' in p) denorm.divisi=p.divisi; if('subDivisi' in p) denorm.subDivisi=p.subDivisi; if('strukturalLevel' in p) denorm.strukturalLevel=p.strukturalLevel; if('posisi' in p) denorm.posisi=p.posisi;
    try{ await setDoc(doc(db,'karyawan',uid), denorm, {merge:true}); }catch(e){}
  }
}

async function countKaryawanByDivisi(divisi){
  if(!(await isHRD())) return 0;
  if(!divisi) return 0;
  try{
    const snap = await getCountFromServer(query(collection(db,'karyawan'), where('divisi','==',divisi), where('approvalStatus','==','approved')));
    return snap.data().count;
  }catch(e){ return 0; }
}

async function getOrgStructure(){
  try{ const snap=await getDoc(doc(db,'settings','orgStructure')); return snap.exists() ? Object.assign({divisi:[],subDivisi:{},posisi:{},posisiKode:{}}, snap.data()) : {divisi:[],subDivisi:{},posisi:{},posisiKode:{}}; }catch(e){ return {divisi:[],subDivisi:{},posisi:{},posisiKode:{}}; }
}

async function saveOrgStructure(data){
  if(!(await isHRD())) throw {message:'Khusus HRD/Master.'};
  await setDoc(doc(db,'settings','orgStructure'), { divisi:data.divisi||[], subDivisi:data.subDivisi||{}, posisi:data.posisi||{}, posisiKode:data.posisiKode||{}, updatedAt:serverTimestamp() });
}

async function listGrade(){
  try{ const snap=await getDoc(doc(db,'settings','gradeList')); return snap.exists() ? (snap.data().list||[]) : []; }catch(e){ return []; }
}

async function saveGradeList(list){
  if(!(await isHRD())) throw {message:'Khusus HRD/Master.'};
  await setDoc(doc(db,'settings','gradeList'), { list: (list||[]).filter(Boolean), updatedAt:serverTimestamp() }, {merge:true});
}

async function listJabatan(){
  try{ const snap=await getDoc(doc(db,'settings','jabatanList')); return snap.exists() ? (snap.data().list||[]) : []; }catch(e){ return []; }
}

async function saveJabatanList(list){
  if(!(await isSuper())) throw {message:'Khusus admin utama.'};
  await setDoc(doc(db,'settings','jabatanList'), { list: (list||[]).filter(Boolean), updatedAt:serverTimestamp() }, {merge:true});
}

async function updateKaryawanOwnProfile(patch){
  if(!auth.currentUser) throw {message:'Belum login.'};
  const allowed=['dob','alamat','noKtp','kontakDaruratNama','kontakDaruratHp','email','customFields'];
  const clean={}; Object.keys(patch||{}).forEach(k=>{ if(allowed.indexOf(k)>=0) clean[k]=patch[k]; });
  clean.updatedAt=serverTimestamp();
  await setDoc(doc(db,'karyawanHR',auth.currentUser.uid), clean, {merge:true});
  if('email' in clean){ try{ await setDoc(doc(db,'karyawan',auth.currentUser.uid), { email:clean.email }, {merge:true}); }catch(e){} }
}

async function listJenisCuti(){
  try{ const snap=await getDoc(doc(db,'settings','jenisCutiList')); return snap.exists() ? (snap.data().list||[]) : []; }catch(e){ return []; }
}

async function saveJenisCutiList(list){
  if(!(await isHRD())) throw {message:'Khusus HRD/Master.'};
  await setDoc(doc(db,'settings','jenisCutiList'), { list: (list||[]).filter(Boolean), updatedAt:serverTimestamp() }, {merge:true});
}

async function submitCuti(data){
  if(!auth.currentUser) throw {message:'Belum login.'};
  const { jenisCuti, tanggalMulai, tanggalSelesai, alasan } = data||{};
  if(!jenisCuti) throw {message:'Pilih jenis cuti dulu.'};
  if(!tanggalMulai || !tanggalSelesai) throw {message:'Isi tanggal mulai & selesai.'};
  const hrSnap = await getDoc(doc(db,'karyawanHR',auth.currentUser.uid));
  const hr = hrSnap.exists() ? hrSnap.data() : {};
  await addDoc(collection(db,'cuti'), {
    karyawanUid: auth.currentUser.uid,
    jenisCuti: jenisCuti, tanggalMulai: tanggalMulai, tanggalSelesai: tanggalSelesai, alasan:(alasan||'').trim(),
    divisi: hr.divisi||'', subDivisi: hr.subDivisi||'',
    status:'pending', createdAt: serverTimestamp()
  });
}

async function listMyCuti(){
  if(!auth.currentUser) return [];
  try{
    const q=query(collection(db,'cuti'), where('karyawanUid','==',auth.currentUser.uid), orderBy('createdAt','desc'));
    const snap=await getDocs(q); const arr=[];
    snap.forEach(d=>{ const x=d.data(); arr.push({ id:d.id, jenisCuti:x.jenisCuti||'', tanggalMulai:x.tanggalMulai||'', tanggalSelesai:x.tanggalSelesai||'', alasan:x.alasan||'', status:x.status||'pending', catatanHRD:x.catatanHRD||'', ts:(x.createdAt&&x.createdAt.seconds)?x.createdAt.seconds*1000:0 }); });
    return arr;
  }catch(e){ return []; }
}

async function listCutiHRD(opts){
  if(!(await isHRD())) return { items:[], hasMore:false, cursor:null };
  opts=opts||{};
  try{
    let constraints=[orderBy('tanggalMulai','desc')];
    if(opts.status) constraints.unshift(where('status','==',opts.status));
    if(opts.fromDate) constraints.push(where('tanggalMulai','>=',opts.fromDate));
    if(opts.toDate) constraints.push(where('tanggalMulai','<=',opts.toDate));
    if(opts.cursor) constraints.push(startAfter(opts.cursor));
    constraints.push(limit(10));
    const snap = await getDocs(query(collection(db,'cuti'), ...constraints));
    const arr=[];
    for(const d of snap.docs){
      const x=d.data(); let nama='(tidak ditemukan)';
      try{ const kw=await getDoc(doc(db,'karyawan',x.karyawanUid)); if(kw.exists()) nama=kw.data().namaLengkap||nama; }catch(e){}
      arr.push({ id:d.id, karyawanUid:x.karyawanUid||'', namaKaryawan:nama, jenisCuti:x.jenisCuti||'', tanggalMulai:x.tanggalMulai||'', tanggalSelesai:x.tanggalSelesai||'', alasan:x.alasan||'', status:x.status||'pending', catatanHRD:x.catatanHRD||'', validatedByHRD:x.validatedByHRD===true, ts:(x.createdAt&&x.createdAt.seconds)?x.createdAt.seconds*1000:0 });
    }
    const lastDoc = snap.docs.length ? snap.docs[snap.docs.length-1] : null;
    return { items:arr, hasMore: snap.docs.length===10, cursor:lastDoc };
  }catch(e){ return { items:[], hasMore:false, cursor:null }; }
}

async function listCutiToApprove(){
  const scope=await getMyOrgScope();
  if(!scope || scope.strukturalLevel==='staff') return [];
  try{
    let q;
    if(scope.strukturalLevel==='gm') q=collection(db,'cuti');
    else if(scope.strukturalLevel==='manajer') q=query(collection(db,'cuti'), where('divisi','==',scope.divisi));
    else q=query(collection(db,'cuti'), where('divisi','==',scope.divisi), where('subDivisi','==',scope.subDivisi));
    const snap=await getDocs(q); const arr=[];
    const kwSnap=await getDocs(collection(db,'karyawan')); const names={};
    kwSnap.forEach(d=>{ const x=d.data()||{}; names[d.id]=x.namaLengkap||''; });
    snap.forEach(d=>{ const x=d.data(); if(x.status==='pending') arr.push({ id:d.id, karyawanUid:x.karyawanUid||'', namaKaryawan:names[x.karyawanUid]||'', jenisCuti:x.jenisCuti||'', tanggalMulai:x.tanggalMulai||'', tanggalSelesai:x.tanggalSelesai||'', alasan:x.alasan||'' }); });
    return arr;
  }catch(e){ return []; }
}

async function validateCutiHRD(id){
  if(!(await isHRD())) throw {message:'Khusus HRD/Master.'};
  if(!id) throw {message:'ID kosong.'};
  await setDoc(doc(db,'cuti',id), { validatedByHRD:true, validatedBy:(auth.currentUser&&auth.currentUser.uid)||'', validatedAt:serverTimestamp() }, {merge:true});
}

async function getEmailTemplates(){
  try{ const snap=await getDoc(doc(db,'settings','emailTemplates')); return snap.exists() ? snap.data() : {}; }catch(e){ return {}; }
}

async function saveEmailTemplates(templates){
  if(!(await isHRD())) throw {message:'Khusus HRD/Master.'};
  await setDoc(doc(db,'settings','emailTemplates'), Object.assign({updatedAt:serverTimestamp()}, templates||{}), {merge:true});
}

function fillTemplate(str, vars){
  str = str||'';
  Object.keys(vars||{}).forEach(k=>{ str = str.split('{'+k+'}').join(vars[k]==null?'':String(vars[k])); });
  return str;
}

async function sendEmailNotif(to, subject, body){
  if(!to) return;
  try{
    await fetch(SHEET_URL, { method:'POST', redirect:'follow', headers:{'Content-Type':'text/plain;charset=utf-8'}, body: JSON.stringify({ type:'sendemail', to:to, subject:subject||'', body:body||'' }) });
  }catch(e){ /* best-effort, notif in-app tetap jadi jalur utama */ }
}

async function sendEventEmail(karyawanUid, templateKey, vars){
  try{
    const kwSnap = await getDoc(doc(db,'karyawan',karyawanUid));
    const email = kwSnap.exists() ? (kwSnap.data().email||'') : '';
    if(!email) return;
    const tpls = await getEmailTemplates();
    const t = tpls[templateKey];
    if(!t || !t.subject) return;
    await sendEmailNotif(email, fillTemplate(t.subject, vars), fillTemplate(t.body||'', vars));
  }catch(e){}
}

async function approveCuti(id, catatan){
  if(!auth.currentUser) throw {message:'Belum login.'};
  if(!id) throw {message:'ID kosong.'};
  const snap=await getDoc(doc(db,'cuti',id));
  await setDoc(doc(db,'cuti',id), { status:'approved', catatanHRD:(catatan||'').trim(), approvedBy:auth.currentUser.uid, approvedAt:serverTimestamp() }, {merge:true});
  if(snap.exists()){ const c=snap.data();
    try{ await sendKaryawanNotif(c.karyawanUid, 'Cuti Disetujui', 'Pengajuan '+(c.jenisCuti||'cuti')+' kamu ('+(c.tanggalMulai||'')+' s/d '+(c.tanggalSelesai||'')+') sudah disetujui.'+(catatan?(' Catatan: '+catatan):'')); }catch(e){}
    try{ await sendEventEmail(c.karyawanUid, 'cuti_approved', { jenisCuti:c.jenisCuti, tanggalMulai:c.tanggalMulai, tanggalSelesai:c.tanggalSelesai, catatan:catatan||'' }); }catch(e){}
  }
}

async function rejectCuti(id, catatan){
  if(!auth.currentUser) throw {message:'Belum login.'};
  if(!id) throw {message:'ID kosong.'};
  const snap=await getDoc(doc(db,'cuti',id));
  await setDoc(doc(db,'cuti',id), { status:'ditolak', catatanHRD:(catatan||'').trim(), approvedBy:auth.currentUser.uid, approvedAt:serverTimestamp() }, {merge:true});
  if(snap.exists()){ const c=snap.data();
    try{ await sendKaryawanNotif(c.karyawanUid, 'Cuti Ditolak', 'Pengajuan '+(c.jenisCuti||'cuti')+' kamu ('+(c.tanggalMulai||'')+' s/d '+(c.tanggalSelesai||'')+') ditolak.'+(catatan?(' Alasan: '+catatan):'')); }catch(e){}
    try{ await sendEventEmail(c.karyawanUid, 'cuti_rejected', { jenisCuti:c.jenisCuti, tanggalMulai:c.tanggalMulai, tanggalSelesai:c.tanggalSelesai, catatan:catatan||'' }); }catch(e){}
  }
}

async function sendKaryawanNotif(karyawanUid, title, body){
  const scope=await getMyOrgScope();
  const elevated = !!(scope && ['spv','manajer','gm'].indexOf(scope.strukturalLevel)>=0);
  if(!(await isHRD()) && !elevated) throw {message:'Khusus HRD/SPV/Manajer/GM.'};
  if(!karyawanUid) throw {message:'Karyawan kosong.'};
  await addDoc(collection(db,'karyawanNotif'), { karyawanUid:karyawanUid, title:title||'', body:body||'', isRead:false, createdAt:serverTimestamp() });
}

async function listMyKaryawanNotif(){
  if(!auth.currentUser) return [];
  try{
    const q=query(collection(db,'karyawanNotif'), where('karyawanUid','==',auth.currentUser.uid), orderBy('createdAt','desc'), limit(50));
    const snap=await getDocs(q); const arr=[];
    snap.forEach(d=>{ const x=d.data(); arr.push({ id:d.id, title:x.title||'', body:x.body||'', isRead:x.isRead===true, ts:(x.createdAt&&x.createdAt.seconds)?x.createdAt.seconds*1000:0 }); });
    return arr;
  }catch(e){ return []; }
}

async function markKaryawanNotifRead(id){
  if(!auth.currentUser || !id) return;
  try{ await setDoc(doc(db,'karyawanNotif',id), { isRead:true }, {merge:true}); }catch(e){}
}

async function uploadAttendancePhoto(blob){
  if(!auth.currentUser) throw {message:'Belum login.'};
  if(!blob) throw {message:'Foto kosong.'};
  const path = 'attendance-photos/'+auth.currentUser.uid+'/'+Date.now()+'.jpg';
  const sref = storageRef(storage, path);
  await uploadBytes(sref, blob, {contentType:'image/jpeg'});
  return path;
}

async function uploadKaryawanProfilePhoto(blob){
  if(!auth.currentUser) throw {message:'Belum login.'};
  if(!blob) throw {message:'Foto kosong.'};
  const path = 'karyawan-profile/'+auth.currentUser.uid+'/foto.jpg';
  const sref = storageRef(storage, path);
  await uploadBytes(sref, blob, {contentType:'image/jpeg'});
  await setDoc(doc(db,'karyawan',auth.currentUser.uid), { fotoProfil:path, updatedAt:serverTimestamp() }, {merge:true});
  return path;
}

async function getKaryawanProfilePhotoUrl(path){
  if(!path) return '';
  try{ const bytes = await getBytes(storageRef(storage, path)); return URL.createObjectURL(new Blob([bytes], {type:'image/jpeg'})); }
  catch(e){ return ''; }
}

async function recordAttendance(outlet, type, lat, lng, akurasi, jarak, photoPath, faceCheckFailed, mode){
  if(!auth.currentUser) throw {message:'Belum login.'};
  if(type!=='masuk' && type!=='keluar') throw {message:'Tipe absen tidak valid.'};
  if(!outlet) throw {message:'Outlet kosong.'};
  await addDoc(collection(db,'attendance'), {
    karyawanUid: auth.currentUser.uid,
    outlet: outlet,
    type: type,
    mode: mode==='wfa' ? 'wfa' : 'normal',
    lokasi: { lat:(typeof lat==='number'?lat:null), lng:(typeof lng==='number'?lng:null), akurasi:(typeof akurasi==='number'?akurasi:null) },
    jarak: (typeof jarak==='number'?jarak:null),
    photoPath: photoPath||'',
    faceCheckFailed: !!faceCheckFailed,
    createdAt: serverTimestamp()
  });
  if(mode==='wfa' && type==='keluar'){
    try{
      const tglHariIni = new Date().toISOString().slice(0,10);
      await addDoc(collection(db,'wfaLaporan'), { karyawanUid:auth.currentUser.uid, tanggalWfa:tglHariIni, status:'perlu_lapor', createdAt:serverTimestamp() });
      await sendKaryawanNotif(auth.currentUser.uid, 'Wajib Lapor WFA', 'Kamu baru aja selesai WFA. Jangan lupa isi & submit laporan kerjanya ya, ada di halaman Profil Karyawan.');
      await sendEventEmail(auth.currentUser.uid, 'wfa_wajib_lapor', { nama:'' });
    }catch(e){}
  }
  if(mode!=='wfa' && type==='keluar'){
    try{
      const tglHariIni = new Date().toISOString().slice(0,10);
      const jadwalId = auth.currentUser.uid+'_'+tglHariIni;
      const jadwalSnap = await getDoc(doc(db,'jadwal',jadwalId));
      if(jadwalSnap.exists()){
        const jd=jadwalSnap.data();
        const now=new Date();
        const jamKeluarAktual = now.toTimeString().slice(0,5);
        if(jd.jamSelesai && jamKeluarAktual > jd.jamSelesai){
          const [h1,m1]=jd.jamSelesai.split(':').map(Number);
          const [h2,m2]=jamKeluarAktual.split(':').map(Number);
          const durasiMenit = (h2*60+m2) - (h1*60+m1);
          if(durasiMenit > 0){
            const hrSnap = await getDoc(doc(db,'karyawanHR',auth.currentUser.uid));
            const hr = hrSnap.exists() ? hrSnap.data() : {};
            await addDoc(collection(db,'lembur'), {
              karyawanUid:auth.currentUser.uid, tanggal:tglHariIni, jamKeluarAktual:jamKeluarAktual, jamSelesaiJadwal:jd.jamSelesai,
              durasiLemburMenit:durasiMenit, divisi:hr.divisi||'', subDivisi:hr.subDivisi||'',
              status:'pending', createdAt:serverTimestamp()
            });
          }
        }
      }
    }catch(e){}
  }
}

async function getLastAttendance(){
  if(!auth.currentUser) return null;
  try{
    const q = query(collection(db,'attendance'), where('karyawanUid','==',auth.currentUser.uid), orderBy('createdAt','desc'), limit(1));
    const snap = await getDocs(q);
    let result=null;
    snap.forEach(d=>{ const x=d.data(); result={ type:x.type||'', outlet:x.outlet||'', ts:(x.createdAt&&x.createdAt.seconds)?x.createdAt.seconds*1000:0 }; });
    return result;
  }catch(e){ return null; }
}

async function listAttendance(){
  if(!(await isHRD())) return [];
  try{
    const snap=await getDocs(collection(db,'attendance')); const arr=[];
    snap.forEach(d=>{ const x=d.data(); arr.push({ id:d.id, karyawanUid:x.karyawanUid||'', outlet:x.outlet||'', type:x.type||'', mode:x.mode||'normal', jarak:(typeof x.jarak==='number'?x.jarak:null), faceCheckFailed:x.faceCheckFailed===true, ts:(x.createdAt&&x.createdAt.seconds)?x.createdAt.seconds*1000:0 }); });
    const kwSnap=await getDocs(collection(db,'karyawan')); const names={};
    kwSnap.forEach(d=>{ const x=d.data()||{}; names[d.id]=x.namaLengkap||''; });
    arr.forEach(a=>{ a.namaKaryawan=names[a.karyawanUid]||''; });
    arr.sort((a,b)=>b.ts-a.ts);
    return arr;
  }catch(e){ return []; }
}

async function uploadWfaTemplate(blob){
  if(!(await isHRD())) throw {message:'Khusus HRD/Master.'};
  if(!blob) throw {message:'File kosong.'};
  const path = 'wfa-template/template.xlsx';
  const sref = storageRef(storage, path);
  await uploadBytes(sref, blob, {contentType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const url = await getDownloadURL(sref);
  await setDoc(doc(db,'settings','wfaReportFormat'), { templateUrl:url, updatedAt:serverTimestamp() }, {merge:true});
  return url;
}

async function getWfaTemplateUrl(){
  try{ const snap=await getDoc(doc(db,'settings','wfaReportFormat')); return snap.exists() ? (snap.data().templateUrl||'') : ''; }catch(e){ return ''; }
}

async function listMyWfaLaporan(){
  if(!auth.currentUser) return [];
  try{
    const q=query(collection(db,'wfaLaporan'), where('karyawanUid','==',auth.currentUser.uid), orderBy('createdAt','desc'), limit(30));
    const snap=await getDocs(q); const arr=[];
    snap.forEach(d=>{ const x=d.data(); arr.push({ id:d.id, tanggalWfa:x.tanggalWfa||'', status:x.status||'perlu_lapor', fileUrl:x.fileUrl||'', managerEmail:x.managerEmail||'', ts:(x.createdAt&&x.createdAt.seconds)?x.createdAt.seconds*1000:0 }); });
    return arr;
  }catch(e){ return []; }
}

async function uploadWfaLaporanFile(blob, reportId){
  if(!auth.currentUser) throw {message:'Belum login.'};
  if(!blob) throw {message:'File kosong.'};
  const path = 'wfa-laporan/'+auth.currentUser.uid+'/'+reportId+'.xlsx';
  const sref = storageRef(storage, path);
  await uploadBytes(sref, blob, {contentType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  return await getDownloadURL(sref);
}

async function submitWfaLaporan(reportId, fileBlob, managerEmail){
  if(!auth.currentUser) throw {message:'Belum login.'};
  if(!reportId) throw {message:'Laporan tidak valid.'};
  if(!fileBlob) throw {message:'Upload file laporan dulu.'};
  const email=(managerEmail||'').trim();
  if(!email) throw {message:'Isi email manajer dulu.'};
  const fileUrl = await uploadWfaLaporanFile(fileBlob, reportId);
  await setDoc(doc(db,'wfaLaporan',reportId), { status:'submitted', fileUrl:fileUrl, managerEmail:email, submittedAt:serverTimestamp() }, {merge:true});
  try{
    const kwSnap=await getDoc(doc(db,'karyawan',auth.currentUser.uid));
    const nama=(kwSnap.exists()?kwSnap.data().namaLengkap:'')||'Karyawan';
    await sendEmailNotif(email, 'Laporan Kerja WFA — '+nama, 'Laporan kerja WFA dari '+nama+' udah masuk. Cek/download di link berikut:\n'+fileUrl);
  }catch(e){}
}

async function listWfaLaporanHRD(opts){
  if(!(await isHRD())) return { items:[], hasMore:false, cursor:null };
  opts=opts||{};
  try{
    let constraints=[orderBy('tanggalWfa','desc')];
    if(opts.status) constraints.unshift(where('status','==',opts.status));
    if(opts.fromDate) constraints.push(where('tanggalWfa','>=',opts.fromDate));
    if(opts.toDate) constraints.push(where('tanggalWfa','<=',opts.toDate));
    if(opts.cursor) constraints.push(startAfter(opts.cursor));
    constraints.push(limit(10));
    const snap = await getDocs(query(collection(db,'wfaLaporan'), ...constraints));
    const arr=[];
    for(const d of snap.docs){
      const x=d.data(); let nama='(tidak ditemukan)';
      try{ const kw=await getDoc(doc(db,'karyawan',x.karyawanUid)); if(kw.exists()) nama=kw.data().namaLengkap||nama; }catch(e){}
      arr.push({ id:d.id, karyawanUid:x.karyawanUid||'', namaKaryawan:nama, tanggalWfa:x.tanggalWfa||'', status:x.status||'perlu_lapor', fileUrl:x.fileUrl||'', managerEmail:x.managerEmail||'', ts:(x.createdAt&&x.createdAt.seconds)?x.createdAt.seconds*1000:0 });
    }
    const lastDoc = snap.docs.length ? snap.docs[snap.docs.length-1] : null;
    return { items:arr, hasMore: snap.docs.length===10, cursor:lastDoc };
  }catch(e){ return { items:[], hasMore:false, cursor:null }; }
}

async function getMyOrgScope(){
  if(!auth.currentUser) return null;
  try{ const snap=await getDoc(doc(db,'karyawanHR',auth.currentUser.uid)); if(!snap.exists()) return null;
    const x=snap.data(); return { strukturalLevel:x.strukturalLevel||'staff', divisi:x.divisi||'', subDivisi:x.subDivisi||'' };
  }catch(e){ return null; }
}

async function listTeamKaryawan(){
  const scope=await getMyOrgScope();
  if(!scope || scope.strukturalLevel==='staff') return [];
  const myUid = auth.currentUser ? auth.currentUser.uid : null;
  try{
    let q;
    if(scope.strukturalLevel==='gm') q=collection(db,'karyawan');
    else if(scope.strukturalLevel==='manajer') q=query(collection(db,'karyawan'), where('divisi','==',scope.divisi));
    else q=query(collection(db,'karyawan'), where('divisi','==',scope.divisi), where('subDivisi','==',scope.subDivisi));
    const snap=await getDocs(q); const arr=[];
    snap.forEach(d=>{ const x=d.data()||{};
      if(x.approvalStatus!=='approved') return;
      if(d.id===myUid) return; // jangan tampilin diri sendiri
      const lvl=x.strukturalLevel||'staff';
      if(lvl==='manajer' || lvl==='gm') return; // jam kerja fleksibel, gak perlu dijadwalin
      arr.push({ uid:d.id, namaLengkap:x.namaLengkap||'', divisi:x.divisi||'', subDivisi:x.subDivisi||'', posisi:x.posisi||'', strukturalLevel:lvl });
    });
    arr.sort((a,b)=>(a.namaLengkap||'').localeCompare(b.namaLengkap||''));
    return arr;
  }catch(e){ return []; }
}

async function listTeamKaryawanPaged(opts){
  const scope=await getMyOrgScope();
  if(!scope || scope.strukturalLevel==='staff') return { items:[], hasMore:false, cursor:null };
  opts=opts||{};
  const myUid = auth.currentUser ? auth.currentUser.uid : null;
  try{
    let constraints=[orderBy('subDivisi'), orderBy('namaLengkap')];
    if(scope.strukturalLevel==='manajer') constraints.unshift(where('divisi','==',scope.divisi));
    else if(scope.strukturalLevel==='spv'){ constraints.unshift(where('subDivisi','==',scope.subDivisi)); constraints.unshift(where('divisi','==',scope.divisi)); }
    if(opts.subDivisi) constraints.push(where('subDivisi','==',opts.subDivisi));
    if(opts.cursor) constraints.push(startAfter(opts.cursor));
    constraints.push(limit(10));
    const snap=await getDocs(query(collection(db,'karyawan'), ...constraints));
    const arr=[];
    snap.forEach(d=>{ const x=d.data()||{};
      if(x.approvalStatus!=='approved') return;
      if(d.id===myUid) return;
      const lvl=x.strukturalLevel||'staff';
      if(lvl==='manajer' || lvl==='gm') return;
      arr.push({ uid:d.id, namaLengkap:x.namaLengkap||'', divisi:x.divisi||'', subDivisi:x.subDivisi||'', posisi:x.posisi||'', strukturalLevel:lvl });
    });
    const lastDoc = snap.docs.length ? snap.docs[snap.docs.length-1] : null;
    return { items:arr, hasMore: snap.docs.length===10, cursor:lastDoc };
  }catch(e){ return { items:[], hasMore:false, cursor:null }; }
}

async function generateDummyKaryawan(){
  if(!(await isHRD())) throw {message:'Khusus HRD/Master.'};
  const dummies = [];
  for(let i=1;i<=19;i++) dummies.push({ nama:'Baker '+String(i).padStart(2,'0'), divisi:'Pabrik', subDivisi:'Produksi', posisi:'Baker', level:'staff' });
  for(let i=1;i<=9;i++) dummies.push({ nama:'Packing '+String(i).padStart(2,'0'), divisi:'Pabrik', subDivisi:'Produksi', posisi:'Packing', level:'staff' });
  dummies.push({ nama:'Dedi Supervisor', divisi:'Pabrik', subDivisi:'Produksi', posisi:'', level:'spv' });
  dummies.push({ nama:'Eka Driver', divisi:'Pabrik', subDivisi:'Logistik', posisi:'Driver', level:'staff' });
  dummies.push({ nama:'Fajar Gudang', divisi:'Pabrik', subDivisi:'Logistik', posisi:'Warehouse', level:'staff' });
  dummies.push({ nama:'Gita Supervisor', divisi:'Pabrik', subDivisi:'Logistik', posisi:'', level:'spv' });
  dummies.push({ nama:'Hendra Manajer', divisi:'Pabrik', subDivisi:'', posisi:'', level:'manajer' });
  const ts = Date.now();
  for(let i=0;i<dummies.length;i++){
    const d = dummies[i];
    const uid = 'dummy_'+ts+'_'+i;
    await setDoc(doc(db,'karyawan',uid), {
      namaLengkap:d.nama, phone:'0800000'+(1000+i), outlet:'', fotoProfil:'',
      approvalStatus:'approved', active:true, isDummy:true,
      registeredAt:serverTimestamp(), updatedAt:serverTimestamp(),
      divisi:d.divisi, subDivisi:d.subDivisi, strukturalLevel:d.level, posisi:d.posisi
    });
    await setDoc(doc(db,'karyawanHR',uid), {
      divisi:d.divisi, subDivisi:d.subDivisi, posisi:d.posisi, strukturalLevel:d.level, grade:'',
      email:'dummy'+i+'@contoh.com', isDummy:true, updatedAt:serverTimestamp()
    });
  }
  // daftarin posisi & kode singkatnya ke Struktur Organisasi biar langsung kepake di kalender (BR/PK/DR/WH)
  try{
    const org = await getOrgStructure();
    const next = { divisi:org.divisi.slice(), subDivisi:Object.assign({},org.subDivisi), posisi:Object.assign({},org.posisi), posisiKode:Object.assign({},org.posisiKode) };
    if(next.divisi.indexOf('Pabrik')<0) next.divisi.push('Pabrik');
    next.subDivisi['Pabrik'] = Array.from(new Set((next.subDivisi['Pabrik']||[]).concat(['Produksi','Logistik'])));
    const pkProduksi='Pabrik::Produksi', pkLogistik='Pabrik::Logistik';
    next.posisi[pkProduksi] = Array.from(new Set((next.posisi[pkProduksi]||[]).concat(['Baker','Packing'])));
    next.posisi[pkLogistik] = Array.from(new Set((next.posisi[pkLogistik]||[]).concat(['Driver','Warehouse'])));
    Object.assign(next.posisiKode, { Baker:'●', Packing:'★', Driver:'▲', Warehouse:'■' });
    await saveOrgStructure(next);
  }catch(e){}
  return dummies.length;
}

async function deleteAllDummyKaryawan(){
  if(!(await isHRD())) throw {message:'Khusus HRD/Master.'};
  const snap = await getDocs(query(collection(db,'karyawan'), where('isDummy','==',true)));
  let count=0;
  for(const d of snap.docs){
    try{ await deleteDoc(doc(db,'karyawan',d.id)); }catch(e){}
    try{ await deleteDoc(doc(db,'karyawanHR',d.id)); }catch(e){}
    try{
      const jSnap = await getDocs(query(collection(db,'jadwal'), where('karyawanUid','==',d.id)));
      for(const jd of jSnap.docs){ try{ await deleteDoc(doc(db,'jadwal',jd.id)); }catch(e){} }
    }catch(e){}
    count++;
  }
  return count;
}

async function saveJadwal(karyawanUid, tanggal, jamMulai, jamSelesai){
  if(!auth.currentUser) throw {message:'Belum login.'};
  if(!karyawanUid || !tanggal || !jamMulai || !jamSelesai) throw {message:'Lengkapi semua isian jadwal.'};
  const kwSnap=await getDoc(doc(db,'karyawan',karyawanUid));
  if(!kwSnap.exists()) throw {message:'Karyawan tidak ditemukan.'};
  const kw=kwSnap.data();
  const id=karyawanUid+'_'+tanggal;
  await setDoc(doc(db,'jadwal',id), {
    karyawanUid:karyawanUid, tanggal:tanggal, jamMulai:jamMulai, jamSelesai:jamSelesai,
    divisi:kw.divisi||'', subDivisi:kw.subDivisi||'',
    createdBy:auth.currentUser.uid, createdAt:serverTimestamp()
  }, {merge:true});
}

async function deleteJadwal(karyawanUid, tanggal){
  if(!auth.currentUser) throw {message:'Belum login.'};
  if(!karyawanUid || !tanggal) throw {message:'Data gak lengkap.'};
  await deleteDoc(doc(db,'jadwal',karyawanUid+'_'+tanggal));
}

async function deleteJadwalByDateShift(tanggal, shiftName){
  const scope = await getMyOrgScope();
  if(!scope || scope.strukturalLevel==='staff') throw {message:'Gak punya akses.'};
  if(!tanggal || !shiftName) throw {message:'Data gak lengkap.'};
  let constraints=[where('tanggal','==',tanggal)];
  if(scope.strukturalLevel==='manajer') constraints.unshift(where('divisi','==',scope.divisi));
  else if(scope.strukturalLevel==='spv'){ constraints.unshift(where('subDivisi','==',scope.subDivisi)); constraints.unshift(where('divisi','==',scope.divisi)); }
  const snap = await getDocs(query(collection(db,'jadwal'), ...constraints));
  let count=0;
  for(const d of snap.docs){
    const x=d.data();
    const h=parseInt((x.jamMulai||'').split(':')[0],10);
    const sh = isNaN(h) ? null : (h<12?'Pagi':(h<18?'Middle':'Malam'));
    if(sh===shiftName){ try{ await deleteDoc(doc(db,'jadwal',d.id)); count++; }catch(e){} }
  }
  return count;
}

async function getPriorDayJadwal(karyawanUid, tanggal){
  try{
    const d=new Date(tanggal+'T00:00:00'); d.setDate(d.getDate()-1);
    const prevStr=d.toISOString().slice(0,10);
    const snap=await getDoc(doc(db,'jadwal',karyawanUid+'_'+prevStr));
    return snap.exists() ? { tanggal:prevStr, jamMulai:snap.data().jamMulai||'' } : null;
  }catch(e){ return null; }
}

async function listJadwalSummary(fromDate, toDate){
  const scope = await getMyOrgScope();
  if(!scope || scope.strukturalLevel==='staff') return [];
  try{
    let constraints=[where('tanggal','>=',fromDate), where('tanggal','<=',toDate)];
    if(scope.strukturalLevel==='manajer') constraints.unshift(where('divisi','==',scope.divisi));
    else if(scope.strukturalLevel==='spv'){ constraints.unshift(where('subDivisi','==',scope.subDivisi)); constraints.unshift(where('divisi','==',scope.divisi)); }
    const snap = await getDocs(query(collection(db,'jadwal'), ...constraints));
    const arr=[];
    snap.forEach(d=>{ const x=d.data(); arr.push({ tanggal:x.tanggal||'', jamMulai:x.jamMulai||'', karyawanUid:x.karyawanUid||'' }); });
    return arr;
  }catch(e){ return []; }
}

async function listJadwalForKaryawan(karyawanUid, fromDate, toDate){
  try{
    let q=query(collection(db,'jadwal'), where('karyawanUid','==',karyawanUid));
    const snap=await getDocs(q); const arr=[];
    snap.forEach(d=>{ const x=d.data(); if((!fromDate||x.tanggal>=fromDate)&&(!toDate||x.tanggal<=toDate)) arr.push({ id:d.id, tanggal:x.tanggal||'', jamMulai:x.jamMulai||'', jamSelesai:x.jamSelesai||'' }); });
    arr.sort((a,b)=>a.tanggal.localeCompare(b.tanggal));
    return arr;
  }catch(e){ return []; }
}

async function listMyJadwal(){
  if(!auth.currentUser) return [];
  const todayStr=new Date().toISOString().slice(0,10);
  return listJadwalForKaryawan(auth.currentUser.uid, todayStr, null);
}

async function listLemburToApprove(){
  const scope=await getMyOrgScope();
  if(!scope || scope.strukturalLevel==='staff') return [];
  try{
    let q;
    if(scope.strukturalLevel==='gm') q=collection(db,'lembur');
    else if(scope.strukturalLevel==='manajer') q=query(collection(db,'lembur'), where('divisi','==',scope.divisi));
    else q=query(collection(db,'lembur'), where('divisi','==',scope.divisi), where('subDivisi','==',scope.subDivisi));
    const snap=await getDocs(q); const arr=[];
    const kwSnap=await getDocs(collection(db,'karyawan')); const names={};
    kwSnap.forEach(d=>{ const x=d.data()||{}; names[d.id]=x.namaLengkap||''; });
    snap.forEach(d=>{ const x=d.data(); if(x.status==='pending') arr.push({ id:d.id, karyawanUid:x.karyawanUid||'', namaKaryawan:names[x.karyawanUid]||'', tanggal:x.tanggal||'', jamKeluarAktual:x.jamKeluarAktual||'', jamSelesaiJadwal:x.jamSelesaiJadwal||'', durasiLemburMenit:x.durasiLemburMenit||0 }); });
    arr.sort((a,b)=>b.tanggal.localeCompare(a.tanggal));
    return arr;
  }catch(e){ return []; }
}

async function approveLembur(id, catatan){
  if(!auth.currentUser) throw {message:'Belum login.'};
  if(!id) throw {message:'ID kosong.'};
  await setDoc(doc(db,'lembur',id), { status:'approved', catatan:(catatan||'').trim(), approvedBy:auth.currentUser.uid, approvedAt:serverTimestamp() }, {merge:true});
}

async function rejectLembur(id, catatan){
  if(!auth.currentUser) throw {message:'Belum login.'};
  if(!id) throw {message:'ID kosong.'};
  await setDoc(doc(db,'lembur',id), { status:'ditolak', catatan:(catatan||'').trim(), approvedBy:auth.currentUser.uid, approvedAt:serverTimestamp() }, {merge:true});
}

async function listMyLembur(){
  if(!auth.currentUser) return [];
  try{
    const q=query(collection(db,'lembur'), where('karyawanUid','==',auth.currentUser.uid), orderBy('createdAt','desc'), limit(30));
    const snap=await getDocs(q); const arr=[];
    snap.forEach(d=>{ const x=d.data(); arr.push({ id:d.id, tanggal:x.tanggal||'', jamKeluarAktual:x.jamKeluarAktual||'', jamSelesaiJadwal:x.jamSelesaiJadwal||'', durasiLemburMenit:x.durasiLemburMenit||0, status:x.status||'pending', catatan:x.catatan||'' }); });
    return arr;
  }catch(e){ return []; }
}

async function listLemburHRD(opts){
  if(!(await isHRD())) return { items:[], hasMore:false, cursor:null };
  opts=opts||{};
  try{
    let constraints=[orderBy('tanggal','desc')];
    if(opts.status) constraints.unshift(where('status','==',opts.status));
    if(opts.fromDate) constraints.push(where('tanggal','>=',opts.fromDate));
    if(opts.toDate) constraints.push(where('tanggal','<=',opts.toDate));
    if(opts.cursor) constraints.push(startAfter(opts.cursor));
    constraints.push(limit(10));
    const snap = await getDocs(query(collection(db,'lembur'), ...constraints));
    const arr=[];
    for(const d of snap.docs){
      const x=d.data(); let nama='';
      try{ const kw=await getDoc(doc(db,'karyawan',x.karyawanUid)); if(kw.exists()) nama=kw.data().namaLengkap||''; }catch(e){}
      arr.push({ id:d.id, karyawanUid:x.karyawanUid||'', namaKaryawan:nama, tanggal:x.tanggal||'', jamKeluarAktual:x.jamKeluarAktual||'', jamSelesaiJadwal:x.jamSelesaiJadwal||'', durasiLemburMenit:x.durasiLemburMenit||0, status:x.status||'pending', validatedByHRD:x.validatedByHRD===true });
    }
    const lastDoc = snap.docs.length ? snap.docs[snap.docs.length-1] : null;
    return { items:arr, hasMore: snap.docs.length===10, cursor:lastDoc };
  }catch(e){ return { items:[], hasMore:false, cursor:null }; }
}

async function validateLemburHRD(id){
  if(!(await isHRD())) throw {message:'Khusus HRD/Master.'};
  if(!id) throw {message:'ID kosong.'};
  await setDoc(doc(db,'lembur',id), { validatedByHRD:true, validatedBy:(auth.currentUser&&auth.currentUser.uid)||'', validatedAt:serverTimestamp() }, {merge:true});
}

// Gabungkan ke window.OmaOpa yang udah ada (dibikin duluan sama core-omaopa.js)
Object.assign(window.OmaOpa, {
  registerKaryawan, loginKaryawan, getKaryawanProfile, listKaryawan, approveKaryawan, rejectKaryawan, updateKaryawanProfile, deleteKaryawan, haversineMeters,
  getKaryawanHRProfile, computeOrgLabel, fetchAllPages, listKontrakExpiringSoon, getManajerEmailForDivisi,
  listKaryawanHR, updateKaryawanHR, countKaryawanByDivisi, getOrgStructure, saveOrgStructure,
  listGrade, saveGradeList, listJabatan, saveJabatanList, updateKaryawanOwnProfile,
  listJenisCuti, saveJenisCutiList, submitCuti, listMyCuti, listCutiHRD, listCutiToApprove, validateCutiHRD,
  getEmailTemplates, saveEmailTemplates, sendEmailNotif, sendEventEmail,
  approveCuti, rejectCuti, sendKaryawanNotif, listMyKaryawanNotif, markKaryawanNotifRead,
  uploadAttendancePhoto, uploadKaryawanProfilePhoto, getKaryawanProfilePhotoUrl, recordAttendance,
  getLastAttendance, listAttendance,
  uploadWfaTemplate, getWfaTemplateUrl, listMyWfaLaporan, uploadWfaLaporanFile, submitWfaLaporan, listWfaLaporanHRD,
  getMyOrgScope, listTeamKaryawan, listTeamKaryawanPaged, generateDummyKaryawan, deleteAllDummyKaryawan,
  saveJadwal, deleteJadwal, deleteJadwalByDateShift, getPriorDayJadwal, listJadwalSummary, listJadwalForKaryawan, listMyJadwal,
  listLemburToApprove, approveLembur, rejectLembur, listMyLembur, listLemburHRD, validateLemburHRD,
});
console.log('core-hrd.js dimuat, fungsi HRD siap.');
