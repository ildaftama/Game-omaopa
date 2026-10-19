import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validDate,normalize,run,firebaseFailure,createSyncSession} from './esb-sync.mjs';
test('historical session reuses both logins across dates and cannot run after close',async()=>{
 const original=global.fetch,calls=[];
 const env={ESB_USERNAME:'u',ESB_PASSWORD:'p',FIREBASE_SYNC_EMAIL:'test@example.test',FIREBASE_SYNC_PASSWORD:'p',FIREBASE_WEB_API_KEY:'key'};
 global.fetch=async(url,options)=>{
  calls.push(url);let body={};
  if(url.includes('identitytoolkit'))body={idToken:'private-test',expiresIn:'3600'};
  else if(url.endsWith('auth/login'))body={result:{accessToken:'private-test'}};
  else if(url.includes('/report/'))body={result:[{branchCode:'A',branchName:'A',salesDate:new URL(url).searchParams.get('salesDate'),payments:[]}]};
  return {ok:true,status:200,json:async()=>body};
 };
 const session=createSyncSession(env);
 try{for(const date of ['2025-02-20','2025-02-21','2025-02-22'])await session.sync(date);
 assert.equal(calls.filter(x=>x.includes('identitytoolkit')).length,1);
 assert.equal(calls.filter(x=>x.endsWith('auth/login')).length,1);
 assert.equal(calls.filter(x=>x.includes('/documents/')).length,3);
 session.close();await assert.rejects(session.sync('2025-02-23'),/ditutup/);
 }finally{session.close();global.fetch=original;}
});
test('calendar validation and aggregate preserves zero and negative adjustments',()=>{
  assert.equal(validDate('2026-02-30'),false);assert.equal(validDate('2026-13-01'),false);assert.equal(validDate('2026-10-12'),true);
  assert.deepEqual(normalize([{branchCode:'A',branchName:'Outlet A',salesDate:'2026-10-12',payments:[{paymentAmount:100,paymentCount:2},{paymentAmount:-10,paymentCount:1}]}],'2026-10-12'),[{branchCode:'A',outlet:'Outlet A',totalPayment:90,paymentCount:3}]);
  assert.throws(()=>normalize([{branchCode:'A',branchName:'A',salesDate:'2026-10-11',payments:[]}],'2026-10-12'));
  assert.throws(()=>normalize([{branchCode:'A',branchName:'A',salesDate:'2026-10-12',payments:[{paymentAmount:'bad',paymentCount:1}]}],'2026-10-12'));
});
test('Firebase login is tested first, once; failures stop before ESB reads or database writes',async()=>{
 const original=global.fetch,calls=[],env={ESB_USERNAME:'u',ESB_PASSWORD:'secret-esb',FIREBASE_SYNC_EMAIL:'a@example.test',FIREBASE_SYNC_PASSWORD:'secret-firebase',FIREBASE_WEB_API_KEY:'key'};
 global.fetch=async(url)=>{calls.push(url);return{ok:false,status:400,json:async()=>({error:{message:'INVALID_LOGIN_CREDENTIALS'}})};};
 try{await assert.rejects(run('2026-10-15',env),/Email atau kata sandi/);assert.equal(calls.length,1);assert.ok(calls[0].includes('identitytoolkit'));}finally{global.fetch=original;}
 assert.ok(!firebaseFailure(400,{error:{message:'secret-firebase'}}).includes('secret-firebase'));assert.match(firebaseFailure(400,{error:{message:'EMAIL_NOT_FOUND'}}),/belum ditemukan/);
});
test('complete sync writes only normalized data to deterministic date document; empty response preserves old data',async()=>{
  const original=global.fetch, calls=[];
  const env={ESB_USERNAME:'test-user',ESB_PASSWORD:'test-password',FIREBASE_SYNC_EMAIL:'writer@example.test',FIREBASE_SYNC_PASSWORD:'test-firebase',FIREBASE_WEB_API_KEY:'test-key'};
  let empty=false;
  global.fetch=async(url,opts)=>{
    calls.push({url,opts}); let data={};
    if(url.endsWith('/auth/login')) data={result:{accessToken:'test-token'}};
    else if(url.includes('/report/'))data={result:empty?[]:[{branchCode:'A',branchName:'A',salesDate:'2026-10-12',payments:[{paymentAmount:100,paymentCount:1}]}]};
    else if(url.includes('identitytoolkit'))data={idToken:'test-firebase-token'};
    return {ok:true,status:200,json:async()=>data};
  };
  try {
    await run('2026-10-12',env);await run('2026-10-12',env);
    const writes=calls.filter(c=>c.opts.method==='PATCH');assert.equal(writes.length,2);assert.equal(writes[0].url,writes[1].url);
    assert.ok(writes[0].url.endsWith('/radarSalesDays/2026-10-12'));
    assert.ok(!writes[0].opts.body.includes('test-password'));assert.ok(!writes[0].opts.body.includes('test-token'));
    empty=true;await assert.rejects(run('2026-10-12',env));assert.equal(calls.filter(c=>c.opts.method==='PATCH').length,2);
    global.fetch=async()=>({ok:false,status:401});await assert.rejects(run('2026-10-12',env));
  } finally {global.fetch=original;}
});
