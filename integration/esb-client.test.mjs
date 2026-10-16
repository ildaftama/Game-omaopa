import test from 'node:test';import assert from 'node:assert/strict';import {createEsbClient} from './esb-client.mjs';
const response=(status,result)=>({status,ok:status>=200&&status<300,headers:{get:()=>null},json:async()=>({result})});
test('renews an expired token once and reuses new token for subsequent requests',async()=>{
 let logins=0,reports=0;const calls=[];
 const c=createEsbClient({username:'u',password:'p',fetcher:async(url,opts)=>{calls.push({url,opts});if(url.endsWith('auth/login'))return response(200,{accessToken:'token-'+(++logins)});reports++;return reports===2?response(401):response(200,{data:[]});}});
 await c.report('stock-movement',{branchCode:'A'});await c.report('stock-movement',{branchCode:'A'});await c.report('stock-movement',{branchCode:'B'});assert.equal(logins,2);assert.equal(calls.at(-1).opts.headers.Authorization,'Bearer token-2');assert.ok(calls.every(x=>!x.url.includes('token')&&!x.url.includes('password')));c.close();await assert.rejects(c.report('stock-movement'),/konfigurasi/);
});
test('repeated 401 stops rather than asking for endless logins; 403 does not renew',async()=>{
 for(const status of [401,403]){let logins=0;const c=createEsbClient({username:'u',password:'p',fetcher:async url=>url.endsWith('auth/login')?(logins++,response(200,{accessToken:'t'})):response(status)});await assert.rejects(c.report('stock-movement'),new RegExp('HTTP '+status));assert.equal(logins,status===401?2:1);}
});
test('pagination verifies full count and rejects partial or changing snapshots',async()=>{
 let mode='ok';const c=createEsbClient({username:'u',password:'p',fetcher:async url=>{if(url.endsWith('auth/login'))return response(200,{accessToken:'t'});const page=Number(new URL(url).searchParams.get('page'));return response(200,{count:mode==='change'&&page===2?3:2,data:page===1?[{id:1}]:mode==='partial'?[]:[{id:2}]});}});
 const r=await c.pages('stock-movement');assert.equal(r.count,2);assert.equal(r.pages,2);mode='partial';await assert.rejects(c.pages('stock-movement'),/belum lengkap/);mode='change';await assert.rejects(c.pages('stock-movement'),/berubah/);await assert.rejects(c.report('arbitrary'),/tidak didukung/);
});
test('temporary service failures retry within a fixed limit',async()=>{
 let calls=0;const c=createEsbClient({username:'u',password:'p',pause:async()=>{},fetcher:async url=>url.endsWith('auth/login')?response(200,{accessToken:'t'}):response(++calls<3?503:200,[])});await c.report('sales-payment-summary');assert.equal(calls,3);
});
