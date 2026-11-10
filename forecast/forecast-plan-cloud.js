'use strict';
// The same three website roles protect reference data and team plans.
window.ForecastPlanCloud={state:'loading',message:'Menyambungkan akun staf…',records:[],allRecords:[],log:[],watch(){},async deletePlans(){throw Error('Penyimpanan tim belum siap.');},staffName(){return '';},async getRevisions(){return [];},async restorePlan(){throw Error('Penyimpanan tim belum siap.');},async save(){throw Error('Penyimpanan tim belum siap.');},async getFulfillment(){return null;},async saveFulfillment(){throw Error('Penyimpanan tim belum siap.');}};
(async()=>{
 const cloud=window.ForecastPlanCloud,emit=()=>window.dispatchEvent(new Event('forecast-plans-changed'));
 try{
  const policy=window.ForecastRolePolicy;
  const [appSDK,authSDK,dbSDK]=await Promise.all(['app','auth','firestore'].map(n=>import(`https://www.gstatic.com/firebasejs/12.14.0/firebase-${n}.js`)));
  const app=appSDK.getApps().some(a=>a.name==='[DEFAULT]')?appSDK.getApp():appSDK.initializeApp({apiKey:'AIzaSyAJ8gae4YgP8FOk1VAA6EC2dFlwhzhV9wg',authDomain:'oma-opa-game.firebaseapp.com',projectId:'oma-opa-game',appId:'1:737187594894:web:07e8fdd4dbb2e5fa903fdf'});
  const auth=authSDK.getAuth(app),db=dbSDK.getFirestore(app);let stop=null,stopLog=null,range=null,generation=0,staffName='';
  // Rencana yang dihapus (soft delete) tetap ada di allRecords & log, tapi TIDAK ikut records --
  // semua tampilan (monitoring/akurasi, Dari omzet, rincian kirim) memakai records saja.
  const refilter=()=>{cloud.records=cloud.allRecords.filter(r=>!r.deleted);};
  // Beberapa bagian Dashboard/Forecast minta rentang tanggal BERBEDA-BEDA ke watch() dalam
  // satu render (7 hari untuk waste, 56 hari untuk akurasi, 56+62 hari untuk grafik omzet).
  // Dulu watch() cuma mengingat SATU rentang terakhir dan selalu berlangganan ULANG kalau beda
  // dari sebelumnya -- tiap langganan ulang memicu onSnapshot (emit 'forecast-plans-changed')
  // yang memicu render lagi, yang memanggil watch() lagi dengan rentang lain, dst: OSILASI
  // tanpa henti antar 2-3 rentang (terukur: 1x ganti outlet = 15x render, 19x event dalam 3
  // detik). Sekarang watch() cuma MELEBARKAN rentang yang sudah dilanggan (gabungan/union),
  // tidak pernah menyempit -- begitu rentang terlebar sudah tercakup, permintaan rentang yang
  // lebih sempit tidak perlu berlangganan ulang sama sekali.
  cloud.watch=(from,to)=>{
   if(range&&from>=range[0]&&to<=range[1])return;
   range=range?[from<range[0]?from:range[0],to>range[1]?to:range[1]]:[from,to];
   subscribe();
  };
  function subscribe(){
   // Records lama TIDAK dikosongkan saat rentang melebar -- dulu dikosongkan, jadi render di
   // antara langganan ulang & snapshot baru menampilkan tabel kosong sesaat (layar berkedip).
   stop?.();stop=null;stopLog?.();stopLog=null;if(cloud.state!=='ready'||!range)return;
   stopLog=dbSDK.onSnapshot(dbSDK.query(dbSDK.collection(db,'forecastPlanLog'),dbSDK.where('date','>=',range[0]),dbSDK.where('date','<=',range[1]),dbSDK.orderBy('date')),s=>{cloud.log=s.docs.map(d=>({...d.data(),id:d.id})).sort((a,b)=>(b.at?.toMillis?.()||0)-(a.at?.toMillis?.()||0));emit();},()=>{cloud.log=[];});
   const q=dbSDK.query(dbSDK.collection(db,'forecastPlans'),dbSDK.where('date','>=',range[0]),dbSDK.where('date','<=',range[1]),dbSDK.orderBy('date'));
   stop=dbSDK.onSnapshot(q,s=>{cloud.allRecords=s.docs.map(d=>({...d.data(),key:d.id})).filter(r=>r.schemaVersion===1&&window.ForecastPlanner.validPlan(r.plan)&&window.ForecastPlanner.validPlan(r.baseline));refilter();cloud.message='Penyimpanan tim tersambung.';cloud.readError=false;emit();},()=>{cloud.readError=true;cloud.message='Izin membaca rencana tim belum tersedia. Draft tetap aman di perangkat ini.';emit();});
  }
  authSDK.onAuthStateChanged(auth,async u=>{
   const current=++generation;stop?.();stopLog?.();cloud.records=[];cloud.allRecords=[];cloud.log=[];cloud.canManage=false;cloud.uid=null;cloud.state='loading';emit();
   if(!u){cloud.state='signed-out';cloud.message='Masuk dengan akun staf untuk melihat dan menyimpan rencana tim.';emit();return;}
   try{const s=await dbSDK.getDoc(dbSDK.doc(db,'staff',u.uid));if(current!==generation)return;
    if(!s.exists()){cloud.state='not-staff';cloud.message='Akun ini belum terdaftar sebagai staf.';emit();return;}
    const role=s.data(),privileged=policy.planner(role);staffName=String(role.name||role.nama||role.displayName||u.displayName||u.email||'').slice(0,100);cloud.canManage=role.super===true||role.master===true;cloud.isForecaster=policy.forecasterOnly(role);
    if(!privileged){cloud.state='no-access';cloud.message='Khusus Admin, Admin Utama, Master, dan Forecaster.';emit();return;}
    cloud.state='ready';cloud.uid=u.uid;cloud.message='Akun staf tersambung.';subscribe();emit();
   }catch{if(current!==generation)return;cloud.state='error';cloud.message='Akun staf belum bisa diperiksa. Coba muat ulang halaman.';emit();}
  });
  cloud.save=async(plan,expectedRevision)=>{
   if(cloud.state!=='ready'||!auth.currentUser)throw Error('Masuk dengan akun staf terlebih dahulu.');
   const uid=auth.currentUser.uid,ref=dbSDK.doc(db,'forecastPlans',plan.date+'_'+plan.outlet);
   // Rencana yang dihapus tidak ada di records, jadi pemanggil mengirim revisi 0 -> pakai revisi dokumen yang dihapus.
   if(!expectedRevision){const del=cloud.allRecords.find(r=>r.key===plan.date+'_'+plan.outlet&&r.deleted);if(del)expectedRevision=del.revision;}
   try{
    const revision=await dbSDK.runTransaction(db,async tx=>{
     const snap=await tx.get(ref),previous=snap.exists()?snap.data():null;
     if((previous?.revision||0)!==expectedRevision)throw Error('CONFLICT');
     const revision=(previous?.revision||0)+1,stamp=dbSDK.serverTimestamp(),fresh=!previous||!!previous.deleted,record={schemaVersion:1,date:plan.date,outlet:plan.outlet,revision,plan,baseline:fresh?plan:previous.baseline,firstSavedAt:fresh?stamp:previous.firstSavedAt,savedAt:stamp,savedBy:uid};
     tx.set(ref,record);tx.set(dbSDK.doc(ref,'revisions',String(revision)),record);return revision;
    });return revision;
   }catch(e){if(e.message==='CONFLICT')throw Error('Rencana ini baru diubah rekan tim. Buka rencana tim terbaru sebelum menyimpan lagi. Draft Anda tetap tersimpan.');if(e.code==='permission-denied')throw Error('Izin menyimpan rencana tim belum aktif. Draft belum dikirim dan tetap tersimpan di perangkat ini.');throw Error('Rencana belum tersimpan ke tim. Periksa koneksi dan coba lagi.');}
  };
  // Riwayat: nama staf dari uid (dibaca sekali per uid, disimpan di memori) & semua versi satu
  // rencana. Staf yang tidak boleh membaca dokumen staf lain cukup melihat "Akun staf".
  const names=new Map();
  cloud.staffName=uid=>{if(!uid)return '';if(uid===cloud.uid)return staffName||'Anda';if(names.has(uid))return names.get(uid);names.set(uid,null);
   dbSDK.getDoc(dbSDK.doc(db,'staff',uid)).then(s=>{const d=s.exists()?s.data():{};names.set(uid,String(d.name||d.nama||d.displayName||'').slice(0,60)||'Akun staf');emit();}).catch(()=>{names.set(uid,'Akun staf');emit();});return null;};
  cloud.getRevisions=async key=>{const s=await dbSDK.getDocs(dbSDK.collection(db,'forecastPlans',key,'revisions'));return s.docs.map(d=>d.data()).sort((a,b)=>a.revision-b.revision);};
  // Hapus rencana: dokumen & semua revisinya TETAP ada; hanya diberi tanda "deleted" + entri
  // log permanen (alasan wajib) dalam satu tulisan. Satu outlet per tulisan.
  cloud.deletePlans=async(records,reason,onProgress)=>{
   if(cloud.state!=='ready'||!auth.currentUser)throw Error('Masuk dengan akun staf terlebih dahulu.');
   reason=String(reason||'').trim();if(reason.length<5)throw Error('Tulis alasan penghapusan (minimal 5 huruf).');
   const uid=auth.currentUser.uid,fail=[];let ok=0;
   const one=async(r,i)=>{
    const logId=`${r.key}_r${r.revision}_del_${Date.now()}_${i}`,stamp=dbSDK.serverTimestamp(),b=dbSDK.writeBatch(db);
    b.set(dbSDK.doc(db,'forecastPlanLog',logId),{schemaVersion:1,action:'delete',key:r.key,date:r.date,outlet:r.outlet,revision:r.revision,reason,by:uid,byName:staffName,at:stamp,regular:r.plan.regular,orders:r.plan.orders});
    b.update(dbSDK.doc(db,'forecastPlans',r.key),{deleted:{reason,by:uid,byName:staffName,at:stamp,revision:r.revision,logId}});
    try{await b.commit();ok++;}catch(e){fail.push({r,error:e.code==='permission-denied'?'izin hapus belum aktif':'gagal tersimpan'});}
    onProgress?.(ok+fail.length,records.length,r);
   };
   // 5 outlet sekaligus (tiap outlet tetap satu tulisan atomik rencana+log).
   for(let i=0;i<records.length;i+=5)await Promise.all(records.slice(i,i+5).map((r,j)=>one(r,i+j)));
   return {ok,fail};
  };
  cloud.restorePlan=async(record,reason)=>{
   if(cloud.state!=='ready'||!auth.currentUser)throw Error('Masuk dengan akun staf terlebih dahulu.');
   if(!cloud.canManage)throw Error('Hanya Admin Utama atau Master yang dapat memulihkan rencana.');
   reason=String(reason||'').trim();if(reason.length<5)throw Error('Tulis alasan pemulihan (minimal 5 huruf).');
   const uid=auth.currentUser.uid,stamp=dbSDK.serverTimestamp(),b=dbSDK.writeBatch(db);
   b.set(dbSDK.doc(db,'forecastPlanLog',`${record.key}_r${record.revision}_restore_${Date.now()}`),{schemaVersion:1,action:'restore',key:record.key,date:record.date,outlet:record.outlet,revision:record.revision,reason,by:uid,byName:staffName,at:stamp,regular:record.plan.regular,orders:record.plan.orders});
   b.update(dbSDK.doc(db,'forecastPlans',record.key),{deleted:dbSDK.deleteField()});
   try{await b.commit();}catch(e){throw Error(e.code==='permission-denied'?'Izin memulihkan belum aktif (aturan Firestore belum dipublikasikan).':'Pemulihan gagal. Periksa koneksi.');}
  };
  // Realisasi kirim: dicatat terpisah dari plan/baseline, tidak membuat revisi baru.
  cloud.getFulfillment=async key=>{
   const snap=await dbSDK.getDoc(dbSDK.doc(db,'forecastPlans',key,'fulfillment','current'));return snap.exists()?snap.data():null;
  };
  cloud.saveFulfillment=async(key,shipped,note)=>{
   if(cloud.state!=='ready'||!auth.currentUser)throw Error('Masuk dengan akun staf terlebih dahulu.');
   if(!window.ForecastPlanner.validShipped(shipped))throw Error('Jumlah kue real dikirim harus bilangan bulat 0–10000 untuk setiap produk aktif.');
   try{
    await dbSDK.setDoc(dbSDK.doc(db,'forecastPlans',key,'fulfillment','current'),{schemaVersion:1,shipped,recordedAt:dbSDK.serverTimestamp(),recordedBy:auth.currentUser.uid,note:note||''});
   }catch(e){if(e.code==='permission-denied')throw Error('Izin menyimpan realisasi kirim belum aktif.');throw Error('Realisasi kirim belum tersimpan. Periksa koneksi dan coba lagi.');}
  };
 }catch{cloud.state='error';cloud.message='Penyimpanan tim belum tersambung. Draft tersimpan di perangkat ini.';emit();}
})();
