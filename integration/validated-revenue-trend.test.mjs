import test from 'node:test';import assert from 'node:assert/strict';import {buildValidatedRevenueTrend} from './revenue-trend.mjs';
const p=(date,walkIn)=>({date,walkIn,reasons:walkIn===null?['unresolved']:[]});
test('unresolved days stay gaps and zero remains observed; monthly mean uses only verified days',()=>{
 const history={network:[p('2026-01-01',0),p('2026-01-02',null),p('2026-01-04',100)],outlets:[]};
 const d=buildValidatedRevenueTrend(history,{a:{name:'A'}},{minimumMonthlyDays:2});
 assert.deepEqual(d.network.daily.map(p=>p.amount),[0,null,null,100]);assert.equal(d.network.monthly[0].amount,50);assert.equal(d.network.monthly[0].days,2);assert.equal(d.network.observedDays,3);
 assert.equal(d.outlets.a.validDays,0);
});
test('sparse months are not presented as full monthly averages and branches are not summed into LK network',()=>{
 const h={network:[p('2026-01-01',100)],outlets:[{id:'a',...p('2026-01-01',900)}]};
 const d=buildValidatedRevenueTrend(h,{a:{name:'A'}});assert.equal(d.network.monthly[0].amount,null);assert.equal(d.network.daily[0].amount,100);assert.equal(d.outlets.a.daily[0].amount,900);
 assert.throws(()=>buildValidatedRevenueTrend({...h,network:[p('2026-01-01',100),p('2026-01-01',200)]},{}),/Duplicate/);
 assert.throws(()=>buildValidatedRevenueTrend({...h,network:[{date:'2026-01-01',walkIn:100,reasons:['unresolved']}]},{}),/Unverified/);
});
