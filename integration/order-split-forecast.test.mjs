import test from 'node:test';import assert from 'node:assert/strict';
import {orderSplitForecast} from './order-split-forecast.mjs';
const records=['2026-09-01','2026-09-08','2026-09-15','2026-09-22'].map(date=>({date,quantity:20}));
test('subtract historical orders before adding known target orders exactly once',()=>{
 const getOrders=(id,date,p,cutoff)=>cutoff?7:5;
 const p=orderSplitForecast(records,'2026-09-29',{id:'a',product:'cake',getOrders});
 assert.equal(p.central,22);assert.equal(p.walkIn,15);assert.equal(p.knownOrders,7);assert.equal(p.low,22);
});
test('unknown target and insufficient or impossible historical splits fall back without clamping negatives',()=>{
 for(const getOrders of [(id,d,p,c)=>c?null:0,(id,d,p,c)=>c?0:30]){
  const p=orderSplitForecast(records,'2026-09-29',{id:'a',product:'cake',getOrders});assert.equal(p.central,20);assert.equal(p.orderSplit,false);
 }
});
test('target and future actuals cannot change forecast; booking cutoff cannot exceed generation day',()=>{
 let cutoff;const getOrders=(id,d,p,c)=>{if(c)cutoff=c;return 0;};
 const opts={id:'a',product:'cake',getOrders,asOf:'2026-09-28'};
 const p=orderSplitForecast(records,'2026-09-29',opts);
 assert.deepEqual(orderSplitForecast([...records,{date:'2026-09-29',quantity:9999},{date:'2026-10-06',quantity:9999}],'2026-09-29',opts),p);
 assert.equal(cutoff,'2026-09-29');
 orderSplitForecast(records,'2026-10-06',opts);assert.equal(cutoff,'2026-09-29');
});
