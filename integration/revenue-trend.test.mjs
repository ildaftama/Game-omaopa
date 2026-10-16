import test from 'node:test';import assert from 'node:assert/strict';
import {buildRevenueTrend} from './revenue-trend.mjs';
const serial=d=>Date.parse(d+'T00:00:00Z')/864e5+25569;
const source=(date,scope='Tanpa mini cisfon, tanpa pesanan')=>({values:[['Outlet',serial(date)],['Outlet','Omset Forecast Murni','Omset Prediksi','Omset Real','Selisih','Malmil','Ogura','Mini','Cisfon','Waste','Lost sales'],['',scope],['A',0,0,100,0,60,40],['B',0,0,0,0,0,0]]});
test('orders scope is mandatory; future observations and different years are excluded',()=>{
 assert.throws(()=>buildRevenueTrend({a:source('2026-07-01','Omzet termasuk pesanan')},{a:'a',b:'b'},{a:{},b:{}}),/scope/);
 const s=buildRevenueTrend({a:source('2026-07-01'),b:source('2026-10-16'),c:source('2025-07-01')},{a:'a',b:'b'},{a:{},b:{}});
 assert.equal(s.private.records.length,2);assert.equal(s.public.network.monthly[6].amount,100);
});
test('network requires all outlets, missing is a gap, observed zero is preserved',()=>{
 const a=source('2026-07-01'),b=source('2026-07-02'),c=source('2026-07-03');b.values[4][3]=null;
 const s=buildRevenueTrend({a,b,c},{a:'a',b:'b'},{a:{name:'A'},b:{name:'B'}});
 assert.deepEqual(s.public.network.daily.map(r=>r.amount),[100,null,100]);assert.equal(s.public.network.monthly[6].days,2);assert.equal(s.public.outlets.b.daily[0].amount,0);assert.equal(s.public.network.monthly[0].amount,null);
 assert.throws(()=>buildRevenueTrend({a,b:source('2026-07-01')},{a:'a',b:'b'},{a:{},b:{}}),/Duplicate/);
});
test('the recorded actual is not silently replaced by a different product sum',()=>{
 const a=source('2026-07-01');a.values[3][5]=50;
 const s=buildRevenueTrend({a},{a:'a',b:'b'},{a:{},b:{}});
 assert.equal(s.public.network.daily[0].amount,100);assert.equal(s.private.issues[0].reason,'component-reconciliation-pending');
});
