import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';import zlib from 'node:zlib';import {validateJobs,seal,collect}from './esb-private-review.mjs';
test('bounded request list rejects duplicates, impossible dates and future reports',()=>{
 for(const jobs of [[],[{branchID:1,salesDate:'2026-02-30'}],[{branchID:1,salesDate:'2026-10-20'}],[{branchID:1,salesDate:'2026-01-01'},{branchID:1,salesDate:'2026-01-01'}]])assert.throws(()=>validateJobs(jobs));
});
test('only local private key decrypts authenticated, compressed report; ciphertext has no raw financial fields',()=>{
 const {publicKey,privateKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});const raw={privateInvoice:'PRIVATE-INVOICE-TEST',amount:12345};const s=seal(raw,publicKey);
 assert.ok(!JSON.stringify(s).includes(raw.privateInvoice));const key=crypto.privateDecrypt({key:privateKey,oaepHash:'sha256',padding:crypto.constants.RSA_PKCS1_OAEP_PADDING},Buffer.from(s.wrappedKey,'base64'));
 const decipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(s.iv,'base64'));decipher.setAuthTag(Buffer.from(s.tag,'base64'));
 const clear=zlib.gunzipSync(Buffer.concat([decipher.update(Buffer.from(s.data,'base64')),decipher.final()]));assert.deepEqual(JSON.parse(clear),raw);
 const broken=Buffer.from(s.data,'base64');broken[0]^=1;const bad=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(s.iv,'base64'));bad.setAuthTag(Buffer.from(s.tag,'base64'));bad.update(broken);assert.throws(()=>bad.final());
});
test('failed or mismatched days stay incomplete; successful pages retain their original counts',async()=>{
 const jobs=[{branchID:1,salesDate:'2026-01-01'},{branchID:2,salesDate:'2026-01-01'}],client={pages:async(n,p)=>{assert.equal(p.showMenuPackage,'1');return p.branchID==='1'?{complete:true,count:1,rows:[{salesDate:p.salesDate}]}:{complete:true,count:1,rows:[{salesDate:'2026-01-02'}]};}};
 const result=await collect(jobs,client);assert.equal(result.filter(r=>r.complete).length,1);assert.equal(result.find(r=>r.branchID===1).count,1);
});
