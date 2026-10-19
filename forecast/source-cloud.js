'use strict';
// Reuses the website's existing Firebase session and settings permissions.
// No public write rule, new credential, or wider access is introduced.
window.ForecastSourceCloud={status:'Memuat pengaturan tim…',save:async()=>{throw Error('Koneksi penyimpanan belum siap. Coba kembali.');}};
(async()=>{
 try{
  const [{getApps,getApp,initializeApp},{getAuth,onAuthStateChanged},{getFirestore,doc,getDoc,setDoc,serverTimestamp}]=await Promise.all([
   import('https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js'),import('https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js'),import('https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js')]);
  const app=getApps().some(a=>a.name==='[DEFAULT]')?getApp():initializeApp({apiKey:'AIzaSyAJ8gae4YgP8FOk1VAA6EC2dFlwhzhV9wg',authDomain:'oma-opa-game.firebaseapp.com',projectId:'oma-opa-game',appId:'1:737187594894:web:07e8fdd4dbb2e5fa903fdf'});
  const db=getFirestore(app),auth=getAuth(app);await new Promise(resolve=>{const off=onAuthStateChanged(auth,()=>{off();resolve();});});
  const ref=doc(db,'settings','forecastSources');
  try{const s=await getDoc(ref);if(s.exists()){const d=s.data().config;if(d?.schemaVersion===1&&Array.isArray(d.sources)&&d.sources.every(s=>window.SourceSettings.validLink(s.url)))window.DATA_SOURCES={...d,sources:window.DATA_SOURCES.sources.map(s=>d.sources.find(x=>x.key===s.key)||s)};}}catch{/* Original configuration remains usable offline or if settings reads are restricted. */}
  window.ForecastSourceCloud.status=auth.currentUser?'Memakai sesi pengelola website. Izin penyimpanan diperiksa saat menyimpan.':'Untuk menyimpan bagi tim, masuk sebagai pengelola di website utama, lalu buka kembali halaman ini.';
  window.ForecastSourceCloud.save=async config=>{
   if(!auth.currentUser)throw Error('Masuk sebagai pengelola di omaopa.fun terlebih dahulu, lalu buka kembali halaman ini. Melihat data tidak memerlukan login.');
   const staff=await getDoc(doc(db,'staff',auth.currentUser.uid));const role=staff.exists()?staff.data():{};
   if(!(role.super||role.master))throw Error('Pengaturan sumber hanya dapat disimpan oleh pengelola utama.');
   try{await setDoc(ref,{config,updatedAt:serverTimestamp(),updatedBy:auth.currentUser.uid});}catch{throw Error('Izin penyimpanan pengaturan belum tersedia. Pengaturan belum berubah; gunakan Unduh pengaturan untuk menyimpan salinannya.');}
  };
 }catch{window.ForecastSourceCloud.status='Penyimpanan tim belum tersambung. Sumber bawaan tetap tersedia.';}
 window.dispatchEvent(new Event('forecast-sources-loaded'));
})();
