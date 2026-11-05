import test from 'node:test';import assert from 'node:assert/strict';
import {monthFromReport,collectMonths,mergeNetSales}from './pcs-net-sales.mjs';
const row=(description,values)=>({description,hasViewAccess:true,details:[{periods:Object.entries(values).map(([key,value])=>({key,value}))}]});

test('monthFromReport sums every description except Transfer, per day, for the whole month',()=>{
 const report={sales:[row('Penjualan - Makanan',{'01':40000000,'02':46868700}),row('Penjualan - Minuman',{'01':6000000,'02':0}),row('Penjualan - Transfer',{'01':500000,'02':271700})]};
 const out=monthFromReport(report,2026,11,'test');
 assert.equal(out.length,30);
 assert.deepEqual(out[0],{id:'test',date:'2026-11-01',netSales:46000000,complete:true});
 assert.deepEqual(out[1],{id:'test',date:'2026-11-02',netSales:46868700,complete:true});
 assert.equal(out[2].complete,false);assert.equal(out[2].netSales,null);
});

test('an incomplete ledger row (no view access, missing periods) marks that day invalid, not zero',()=>{
 const report={sales:[row('Penjualan - Makanan',{'01':1000}),{description:'Penjualan - Lainnya',hasViewAccess:false,details:[{periods:[{key:'01',value:0}]}]}]};
 const out=monthFromReport(report,2026,2,'test');
 assert.equal(out[0].complete,false);assert.equal(out[0].netSales,null);
});

test('collectMonths fetches one report per outlet-month job and keeps going after one failure',async()=>{
 const calls=[];
 const client={report:async(name,params)=>{calls.push(params);if(params.branchIDs==='99')throw Error('HTTP 500');return {sales:[row('Penjualan - Makanan',{'05':46868700})]};}};
 const results=await collectMonths([{id:'a',branchID:1,year:2026,month:11},{id:'b',branchID:99,year:2026,month:11}],client);
 assert.equal(calls.length,2);
 const a=results.filter(r=>r.id==='a'&&r.date==='2026-11-05');assert.equal(a[0].netSales,46868700);
 const bFail=results.find(r=>r.id==='b'&&r.monthFailed);assert.ok(bFail);assert.equal(bFail.reason,'HTTP 500');
});

test('mergeNetSales keeps prior days, overwrites only newly completed ones, drops nothing on a failed re-fetch',()=>{
 const previous={outletIds:['a'],days:[{date:'2026-10-31',id:'a',netSales:9000000,complete:true}]};
 const merged=mergeNetSales(previous,[{id:'a',date:'2026-11-01',netSales:46000000,complete:true},{id:'a',date:'2026-11',complete:false,monthFailed:true}]);
 assert.equal(merged.days.length,2);
 assert.equal(merged.days.find(r=>r.date==='2026-10-31').netSales,9000000);
 assert.equal(merged.days.find(r=>r.date==='2026-11-01').netSales,46000000);
 const reRun=mergeNetSales(merged,[{id:'a',date:'2026-11',complete:false,monthFailed:true}]);
 assert.equal(reRun.days.length,2,'a failed re-fetch must not erase previously stored days');
});
