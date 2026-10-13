import test from 'node:test';import assert from 'node:assert/strict';import {analyse,days} from './analyse-history.mjs';
const history={from:'2026-07-13',to:'2026-08-10',records:days('2026-07-13','2026-08-10').map(date=>({date,scope:'all-outlets-ledger',metric:'netSales',amount:100}))};
test('Compares weekdays, excludes known events, preserves missing and zero, exports no raw amounts',()=>{
 const events=[{id:'prior',start:'2026-07-20',end:'2026-07-20'},{id:'test',start:'2026-08-10',end:'2026-08-10'}];
 const h=structuredClone(history);h.records.find(r=>r.date==='2026-07-20').amount=999;h.records.find(r=>r.date==='2026-08-10').amount=150;
 const result=analyse(h,events);assert.equal(result.events[1].changePct,50);assert.equal(result.events[1].comparisonDays,3);assert.equal(result.events[0].changePct,null);
 const serialized=JSON.stringify(result);assert.ok(!serialized.includes('"amount"'));assert.ok(!serialized.includes('"normal"'));assert.equal(result.coverage.trafficDays,0);
 h.records=h.records.filter(r=>r.date!=='2026-08-10');assert.equal(analyse(h,events).events[1].changePct,null);assert.deepEqual(analyse(h,events).coverage.missingDates,['2026-08-10']);
 h.records.push({date:'2026-08-10',scope:'all-outlets-ledger',metric:'netSales',amount:0});assert.equal(analyse(h,events).events[1].changePct,-100);
});
test('Multi-day change is a ratio of sums and fails closed for a missing event date',()=>{
 const h=structuredClone(history);h.records.find(r=>r.date==='2026-08-03').amount=200;h.records.find(r=>r.date==='2026-08-04').amount=100;
 const e=[{id:'x',start:'2026-08-03',end:'2026-08-04'}];assert.equal(analyse(h,e).events[0].changePct,50);
 h.records=h.records.filter(r=>r.date!=='2026-08-04');assert.equal(analyse(h,e).events[0].changePct,null);
 h.records.push(h.records[0]);assert.throws(()=>analyse(h,e),/duplicate/);
});
