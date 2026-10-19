import fs from 'node:fs';import crypto from 'node:crypto';import zlib from 'node:zlib';import {pathToFileURL}from 'node:url';
import {createEsbClient}from './esb-client.mjs';import {validDate}from './esb-sync.mjs';
export function validateJobs(jobs){
 if(!Array.isArray(jobs)||!jobs.length||jobs.length>240)throw Error('Jumlah permintaan di luar batas.');
 const seen=new Set();
 for(const j of jobs){if(!Number.isSafeInteger(j.branchID)||j.branchID<1||j.branchID>1000||!validDate(j.salesDate)||j.salesDate<'2026-01-01'||j.salesDate>'2026-10-18')throw Error('Periode atau cabang tidak valid.');const k=j.branchID+'|'+j.salesDate;if(seen.has(k))throw Error('Permintaan ganda.');seen.add(k);}
 return jobs;
}
export function seal(value,publicKey){
 const key=crypto.randomBytes(32),iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
 const clear=zlib.gzipSync(Buffer.from(JSON.stringify(value)));if(clear.length>80*1024*1024)throw Error('Batas ukuran hasil terlampaui.');
 const data=Buffer.concat([cipher.update(clear),cipher.final()]);
 const wrapped=crypto.publicEncrypt({key:publicKey,oaepHash:'sha256',padding:crypto.constants.RSA_PKCS1_OAEP_PADDING},key);key.fill(0);clear.fill(0);
 return {version:1,format:'gzip-json/aes-256-gcm/rsa-oaep-sha256',wrappedKey:wrapped.toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')};
}
export async function collect(jobs,client){
 validateJobs(jobs);const results=[];let cursor=0;
 async function worker(){while(cursor<jobs.length){const job=jobs[cursor++];try{const r=await client.pages('sales-menu-cogs',{branchID:String(job.branchID),salesDate:job.salesDate,salesMenuCogsType:'Standard',showMenuPackage:'1'});if(r.rows.some(x=>x.salesDate!==job.salesDate||job.branchName&&x.branchName!==job.branchName))throw Error('Identitas tanggal/cabang laporan tidak cocok.');results.push({...job,view:'with-package-detail',...r});}catch{results.push({...job,complete:false,error:'Laporan tanggal/cabang ini belum berhasil dibaca.'});}}}
 await Promise.all([worker(),worker()]);return results;
}
async function run(){
 const manifest=JSON.parse(fs.readFileSync(new URL('./esb-review-request.json',import.meta.url),'utf8'));validateJobs(manifest.jobs);
 crypto.createPublicKey(manifest.publicKey);
 const client=createEsbClient({username:process.env.ESB_USERNAME,password:process.env.ESB_PASSWORD});let results;
 try{results=await collect(manifest.jobs,client);}finally{client.close();}
 const payload={createdAt:new Date().toISOString(),requestId:manifest.requestId,results};
 fs.mkdirSync('private-review-out',{recursive:true});fs.writeFileSync('private-review-out/esb-review.encrypted.json',JSON.stringify(seal(payload,manifest.publicKey)));
 console.log(`Laporan terbaca: ${results.filter(r=>r.complete).length}/${results.length}. Hanya hasil terenkripsi disimpan sebagai artefak; tidak ada isi nota pada log.`);
 if(results.some(r=>!r.complete))process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)run().catch(()=>{console.error('Pemeriksaan belum berhasil; isi laporan tidak ditampilkan.');process.exitCode=1;});
