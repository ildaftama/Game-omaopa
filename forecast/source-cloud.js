'use strict';
// Reuses the website's existing Firebase session and settings permissions.
// No public write rule, new credential, or wider access is introduced.
window.ForecastSourceCloud={status:'Memuat pengaturan tim…',save:async()=>{throw Error('Koneksi penyimpanan belum siap. Coba kembali.');}};
(async()=>{
 try{
  const [{getApps,getApp,initializeApp},{getAuth,onAuthStateChanged},{getFirestore,doc,getDoc,setDoc,onSnapshot,serverTimestamp,writeBatch,collection,Timestamp}]=await Promise.all([
   import('https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js'),import('https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js'),import('https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js')]);
  const app=getApps().some(a=>a.name==='[DEFAULT]')?getApp():initializeApp({apiKey:'AIzaSyAJ8gae4YgP8FOk1VAA6EC2dFlwhzhV9wg',authDomain:'oma-opa-game.firebaseapp.com',projectId:'oma-opa-game',appId:'1:737187594894:web:07e8fdd4dbb2e5fa903fdf'});
  const db=getFirestore(app),auth=getAuth(app);await new Promise(resolve=>{const off=onAuthStateChanged(auth,()=>{off();resolve();});});
  const ref=doc(db,'settings','forecastSources');
  // Sinkron langsung (owner 2026-11-24): pengaturan (produk, ambang, warna, HPP) didengarkan
  // terus, bukan dibaca sekali saat halaman dibuka. Simpanan rekan tim langsung tampil di
  // semua akun yang sedang membuka web, dan pembacaan awal yang selesai setelah halaman
  // tergambar ikut menggambar ulang halaman (sebelumnya akun yang memuat cepat, seperti
  // forecaster, bisa tertinggal di daftar produk bawaan).
  const apply=s=>{if(!s.exists())return false;const d=s.data().config;if(!(d?.schemaVersion===1&&Array.isArray(d.sources)&&d.sources.every(x=>window.SourceSettings.validLink(x.url))))return false;
   const base=window.DATA_SOURCES?.sources||[];window.DATA_SOURCES={...d,sources:base.map(x=>d.sources.find(y=>y.key===x.key)||x)};return true;};
  await new Promise(resolve=>{let first=true;const done=()=>{if(first){first=false;resolve();}};setTimeout(done,10000);
   try{onSnapshot(ref,s=>{
     if(first){try{apply(s);}catch{}done();return;}
     // Simpanan sendiri sudah dipakai langsung oleh forecast-settings.js; yang didengar hanya versi dari server.
     if(s.metadata.hasPendingWrites)return;
     try{if(apply(s))window.dispatchEvent(new CustomEvent('forecast-sources-loaded',{detail:{remote:true}}));}catch{}
    },()=>done());}catch{done();}});
  window.ForecastSourceCloud.status=auth.currentUser?'Memakai sesi pengelola website. Izin penyimpanan diperiksa saat menyimpan.':'Untuk menyimpan bagi tim, masuk sebagai pengelola di website utama, lalu buka kembali halaman ini.';
  window.ForecastSourceCloud.save=async(config,changes=[])=>{
   if(!auth.currentUser)throw Error('Masuk sebagai pengelola di omaopa.fun terlebih dahulu, lalu buka kembali halaman ini. Halaman Forecast memerlukan akun pengelola.');
   const role=window.ForecastAuth?.role||{};
   if(!window.ForecastRolePolicy?.settingsEditor?.(role))throw Error('Akun ini tidak punya izin mengubah pengaturan.');
   try{const who=window.ForecastWhoAmI?.()||{name:'Akun tim',role:''},batch=writeBatch(db),logRef=doc(collection(db,'forecastChangeLog'));
    batch.set(logRef,{type:'settings',summary:changes.length?`${changes.length} pengaturan diubah`:'Pengaturan disimpan tanpa perubahan nilai',changes:changes.map(s=>String(s).slice(0,80)).slice(0,60),by:auth.currentUser.uid,byName:String(who.name).slice(0,60),role:String(who.role).slice(0,20),at:serverTimestamp(),expireAt:Timestamp.fromMillis(Date.now()+90*864e5)});
    batch.set(ref,{config,updatedAt:serverTimestamp(),updatedBy:auth.currentUser.uid,logId:logRef.id});
    try{await batch.commit();}catch(e){if(e?.code!=='permission-denied')throw e;await setDoc(ref,{config,updatedAt:serverTimestamp(),updatedBy:auth.currentUser.uid});}
   }catch{throw Error('Izin penyimpanan pengaturan belum tersedia. Pengaturan belum berubah; gunakan Unduh pengaturan untuk menyimpan salinannya.');}
  };
 }catch{window.ForecastSourceCloud.status='Penyimpanan tim belum tersambung. Sumber bawaan tetap tersedia.';}
 window.dispatchEvent(new Event('forecast-sources-loaded'));
})();
