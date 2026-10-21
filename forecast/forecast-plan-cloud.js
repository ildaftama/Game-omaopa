'use strict';
// Plans are private to existing staff accounts. Public reference data stays readable.
window.ForecastPlanCloud={state:'loading',message:'Menyambungkan akun staf…',records:[],watch(){},async save(){throw Error('Penyimpanan tim belum siap.');}};
(async()=>{
 const cloud=window.ForecastPlanCloud,emit=()=>window.dispatchEvent(new Event('forecast-plans-changed'));
 try{
  const [appSDK,authSDK,dbSDK]=await Promise.all(['app','auth','firestore'].map(n=>import(`https://www.gstatic.com/firebasejs/12.14.0/firebase-${n}.js`)));
  const app=appSDK.getApps().some(a=>a.name==='[DEFAULT]')?appSDK.getApp():appSDK.initializeApp({apiKey:'AIzaSyAJ8gae4YgP8FOk1VAA6EC2dFlwhzhV9wg',authDomain:'oma-opa-game.firebaseapp.com',projectId:'oma-opa-game',appId:'1:737187594894:web:07e8fdd4dbb2e5fa903fdf'});
  const auth=authSDK.getAuth(app),db=dbSDK.getFirestore(app);let stop=null,range=null,generation=0;
  cloud.watch=(from,to)=>{
   if(range?.[0]===from&&range?.[1]===to)return;range=[from,to];subscribe();
  };
  function subscribe(){
   stop?.();stop=null;cloud.records=[];if(cloud.state!=='ready'||!range)return;
   const q=dbSDK.query(dbSDK.collection(db,'forecastPlans'),dbSDK.where('date','>=',range[0]),dbSDK.where('date','<=',range[1]),dbSDK.orderBy('date'));
   stop=dbSDK.onSnapshot(q,s=>{cloud.records=s.docs.map(d=>({...d.data(),key:d.id})).filter(r=>r.schemaVersion===1&&window.ForecastPlanner.validPlan(r.plan)&&window.ForecastPlanner.validPlan(r.baseline));cloud.message='Rencana tersimpan bersama tim.';cloud.readError=false;emit();},()=>{cloud.readError=true;cloud.message='Izin membaca rencana tim belum tersedia. Draft tetap aman di perangkat ini.';emit();});
  }
  authSDK.onAuthStateChanged(auth,async u=>{
   const current=++generation;stop?.();cloud.records=[];cloud.canManage=false;cloud.uid=null;cloud.state='loading';emit();
   if(!u){cloud.state='signed-out';cloud.message='Masuk dengan akun staf untuk melihat dan menyimpan rencana tim.';emit();return;}
   try{const s=await dbSDK.getDoc(dbSDK.doc(db,'staff',u.uid));if(current!==generation)return;
    if(!s.exists()){cloud.state='not-staff';cloud.message='Akun ini belum terdaftar sebagai staf.';emit();return;}
    const role=s.data(),privileged=role.admin===true||role.super===true||role.master===true;cloud.canManage=role.super===true||role.master===true;
    if(!privileged){let granted=false;try{const a=await dbSDK.getDoc(dbSDK.doc(db,'forecastAccess',u.uid));granted=a.exists()&&a.data().enabled===true;}catch{}
     if(current!==generation)return;if(!granted){cloud.state='no-access';cloud.message='Akun ini belum memiliki akses forecast tim. Hubungi Admin Utama atau Master.';emit();return;}
    }
    cloud.state='ready';cloud.uid=u.uid;cloud.message='Akun staf tersambung.';subscribe();emit();
   }catch{if(current!==generation)return;cloud.state='error';cloud.message='Akun staf belum bisa diperiksa. Coba muat ulang halaman.';emit();}
  });
  cloud.listStaff=async()=>{
   if(!cloud.canManage)throw Error('Pengaturan akses hanya untuk Admin Utama dan Master.');
   const [staff,access]=await Promise.all([dbSDK.getDocs(dbSDK.collection(db,'staff')),dbSDK.getDocs(dbSDK.collection(db,'forecastAccess'))]),grants=new Map(access.docs.map(d=>[d.id,d.data().enabled===true]));
   return Promise.all(staff.docs.map(async s=>{const r=s.data();let profile={};try{const u=await dbSDK.getDoc(dbSDK.doc(db,'users',s.id));if(u.exists())profile=u.data();}catch{}
    return {uid:s.id,name:profile.name||r.name||r.outlet||'Akun staf',outlet:r.outlet||'',phone:profile.phone||'',automatic:r.admin===true||r.super===true||r.master===true,enabled:grants.get(s.id)===true};
   }));
  };
  cloud.grant=async(uid,enabled)=>{
   if(!cloud.canManage||!auth.currentUser)throw Error('Pengaturan akses hanya untuk Admin Utama dan Master.');
   try{await dbSDK.setDoc(dbSDK.doc(db,'forecastAccess',uid),{enabled,updatedAt:dbSDK.serverTimestamp(),updatedBy:auth.currentUser.uid});}catch{throw Error('Akses belum tersimpan. Periksa izin dan koneksi.');}
  };
  cloud.save=async(plan,expectedRevision)=>{
   if(cloud.state!=='ready'||!auth.currentUser)throw Error('Masuk dengan akun staf terlebih dahulu.');
   const uid=auth.currentUser.uid,ref=dbSDK.doc(db,'forecastPlans',plan.date+'_'+plan.outlet);
   try{
    const revision=await dbSDK.runTransaction(db,async tx=>{
     const snap=await tx.get(ref),previous=snap.exists()?snap.data():null;
     if((previous?.revision||0)!==expectedRevision)throw Error('CONFLICT');
     const revision=(previous?.revision||0)+1,stamp=dbSDK.serverTimestamp(),record={schemaVersion:1,date:plan.date,outlet:plan.outlet,revision,plan,baseline:previous?.baseline||plan,firstSavedAt:previous?.firstSavedAt||stamp,savedAt:stamp,savedBy:uid};
     tx.set(ref,record);tx.set(dbSDK.doc(ref,'revisions',String(revision)),record);return revision;
    });return revision;
   }catch(e){if(e.message==='CONFLICT')throw Error('Rencana ini baru diubah rekan tim. Buka rencana tim terbaru sebelum menyimpan lagi. Draft Anda tetap tersimpan.');if(e.code==='permission-denied')throw Error('Izin menyimpan rencana tim belum aktif. Draft belum dikirim dan tetap tersimpan di perangkat ini.');throw Error('Rencana belum tersimpan ke tim. Periksa koneksi dan coba lagi.');}
  };
 }catch{cloud.state='error';cloud.message='Penyimpanan tim belum tersambung. Draft tersimpan di perangkat ini.';emit();}
})();
