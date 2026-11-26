import test from 'node:test';import assert from 'node:assert/strict';
import {soldVector,mergeStockLive,PCS_TO_STOCK} from './stock-live.mjs';
import {STOCK_LABELS} from './daily-stock.mjs';
const r=(id,qty,free=[])=>({id,complete:true,qty,free});
test('PCS products map onto Daily Report labels, Mini flavors combined, free lines counted',()=>{
 assert.equal(PCS_TO_STOCK.length,20);assert.equal(STOCK_LABELS[PCS_TO_STOCK[18]],'Malmil Cheese Less Sugar');assert.equal(STOCK_LABELS[PCS_TO_STOCK[15]],'Roti Coklat Pisang');
 const q=Array(20).fill(0);q[4]=2;q[5]=3;q[6]=1;q[0]=5;const f=Array(20).fill(0);f[0]=1;
 const v=soldVector(r('a',q,f));assert.equal(v[6],6);assert.equal(v[0],6);
});
test('snapshots append per pull, same minute replaces, failed outlets keep earlier values, new day resets',()=>{
 const q=Array(20).fill(0);q[2]=4;
 let d=mergeStockLive(null,{date:'2026-11-26',asOf:'2026-11-26T03:08:00Z',results:[r('a',q),{id:'b',complete:false}],daily:{a:{2:[0,10,0,0,0,null]}},dailyAt:'x'});
 assert.equal(d.snaps.length,1);assert.equal(d.snaps[0].t,'10:08');assert.deepEqual(Object.keys(d.snaps[0].s),['a']);
 d=mergeStockLive(d,{date:'2026-11-26',asOf:'2026-11-26T03:23:00Z',results:[{id:'a',complete:false}],daily:null});
 assert.equal(d.snaps.length,1,'no complete outlet -> no snapshot');assert.deepEqual(d.daily.a[2],[0,10,0,0,0,null],'daily kept when pull fails');
 d=mergeStockLive(d,{date:'2026-11-26',asOf:'2026-11-26T03:38:00Z',results:[r('a',q)],daily:{}});
 assert.equal(d.snaps.length,2);assert.ok(d.daily.a);
 d=mergeStockLive(d,{date:'2026-11-27',asOf:'2026-11-27T02:08:00Z',results:[r('a',q)],daily:null});
 assert.equal(d.snaps.length,1);assert.deepEqual(d.daily,{});
});
