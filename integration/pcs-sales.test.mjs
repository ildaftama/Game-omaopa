import test from 'node:test';import assert from 'node:assert/strict';
import {summarize,sku,range,mergeSales,collect}from './pcs-sales.mjs';
const job={id:'test',branchName:'Outlet Test',date:'2026-09-01'},row=(name,qty=1,extra={})=>({salesDate:job.date,branchName:job.branchName,salesType:'Sales',rowType:'ALACARTE',menuName:name,qty,total:13000*qty,discountTotal:0,...extra});
test('one cake per confirmed bundle, no topping/package double-count, no void/free',()=>{
 const a=summarize([row('Malmil Cheese',3,{rowType:'PACKAGE_HEADER'}),row('Malmil Cheese',3,{rowType:'PACKAGE_COMPONENT'}),row('Topping Malmil Full Cheese',3),row('PE Malmil',3),row('Paket Cemal-Cemil Malmil Cheese',2),row('Paket Hantaran - Chiffon Classic Ekstra Keju',4),row('Ogura Cheese',2,{salesType:'Void'}),row('Malmil Chocolate',1,{discountTotal:13000})],job);
 assert.equal(a.qty[2],5);assert.equal(a.qty[8],4);assert.equal(a.qty[3],0);assert.equal(a.free[3],1);assert.equal(a.qty.reduce((a,b)=>a+b,0),9);
});
test('mapping and source validation fail safely on new cake types or foreign rows',()=>{
 assert.equal(sku('Mini Satuan - Coklat'),5);assert.equal(sku('Box Mini'),null);
 assert.throws(()=>summarize([row('Malmil New Flavor')],job),/menu/);
 assert.throws(()=>summarize([row('Malmil Cheese',1,{salesDate:'2026-09-02'})],job),/berbeda/);
 assert.throws(()=>summarize([row('Malmil Cheese',1.5)],job),/valid/);
});
test('old Cisfon menu names join the corresponding Chiffon variant without merging variants',()=>{
 for(const [name,index]of [['Cisfon - Keju',7],['Cisfon - Ekstra Keju',8],['Cisfon - Butter',9],['Cisfon Lite - Keju',11],['Cisfon Lite - Ekstra Keju',10],['Paket Hantaran - Cisfon Classic Ekstra Keju',8]])assert.equal(sku(name),index,name);
 const a=summarize([row('Cisfon - Keju',2),row('Chiffon Classic Keju',3),row('Cisfon - Ekstra Keju',4)],job);
 assert.equal(a.qty[7],5);assert.equal(a.qty[8],4);
});
test('failed or empty refresh preserves an existing snapshot, valid data replaces it',async()=>{
 const old={days:[{id:'test',date:job.date,qty:[20],complete:true}]};
 assert.equal(mergeSales(old,[{id:'test',date:job.date,complete:false}]).days[0].qty[0],20);
 const results=await collect([{id:'test',branchName:job.branchName,branchID:1}],[job.date],{pages:async()=>({complete:true,rows:[]})});assert.equal(results[0].complete,false);
 assert.equal(mergeSales(old,[{id:'test',date:job.date,qty:[21],complete:true}]).days[0].qty[0],21);
});
test('date range has calendar validation and bounded history',()=>{assert.equal(range('2026-09-01','2026-09-30').length,30);assert.throws(()=>range('2026-02-30','2026-03-01'));assert.throws(()=>range('2026-01-01','2026-10-01'));});
