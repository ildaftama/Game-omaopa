import test from 'node:test';import assert from 'node:assert/strict';
import {makeSeries,forecastRevenue,errors,study,METHODS} from './revenue-validation.mjs';
const dates=(a,b)=>{const out=[];for(let t=Date.parse(a+'T00:00Z');t<=Date.parse(b+'T00:00Z');t+=864e5)out.push(new Date(t).toISOString().slice(0,10));return out;};
test('all numerical methods ignore target and future revenue',()=>{
 const rs=dates('2026-06-01','2026-09-30').map(date=>({date,amount:100+new Date(date).getUTCDay()*20}));
 const target='2026-09-15',past=makeSeries(rs.filter(r=>r.date<target)),contaminated=makeSeries(rs.map(r=>r.date>=target?{...r,amount:999999}:r));
 for(const method of METHODS)assert.deepEqual(forecastRevenue(past,target,method),forecastRevenue(contaminated,target,method));
 assert.equal(forecastRevenue(makeSeries(rs.slice(0,3)),'2026-06-04',METHODS[0]),null);
 assert.throws(()=>makeSeries([rs[0],rs[0]]),/Duplicate/);
});
test('event evidence requires same outlet, same family and two completed distinct events',()=>{
 const eventDays=['2026-07-04','2026-08-01'],rs=dates('2026-06-01','2026-09-30').map(date=>({date,amount:eventDays.includes(date)?300:100})),s=makeSeries(rs);
 const e=(id,date)=>({id,start:date,end:date,family:'graduation',outletHints:['A']});
 const events=[e('one',eventDays[0]),e('two',eventDays[1]),e('target','2026-09-05')];
 const a=forecastRevenue(s,'2026-09-05','weekday-median-4-event-lift',{events,outlet:'A'});assert.equal(a.eventObservations,2);assert.equal(a.prediction,130);
 assert.equal(forecastRevenue(s,'2026-09-05','weekday-median-4-event-lift',{events,outlet:'B'}).prediction,100);
 assert.equal(forecastRevenue(s,'2026-09-05','weekday-median-4-event-lift',{events:events.slice(1),outlet:'A'}).prediction,100);
 assert.equal(forecastRevenue(s,'2026-09-05','weekday-median-4-event-lift',{events:events.map(e=>e.id==='two'?{...e,family:'other'}:e),outlet:'A'}).prediction,100);
});
test('error keeps observed zero, avoids division by zero, and does not cancel opposite errors',()=>{
 const m=errors([{actual:100,prediction:110},{actual:100,prediction:90},{actual:0,prediction:10}]);assert.equal(m.wape,15);assert.equal(m.bias,5);assert.equal(errors([{actual:0,prediction:10}]).wape,null);
});
test('holdout outcomes cannot change selected method; incomplete network days are excluded',()=>{
 const records=dates('2026-06-01','2026-09-30').map(date=>({date,amount:100+new Date(date).getUTCDay()*20})),p={selectionFrom:'2026-09-01',selectionTo:'2026-09-14',holdoutFrom:'2026-09-15',holdoutTo:'2026-09-30'};
 const groups=[{id:'a',name:'A',records},{id:'b',name:'B',records:records.filter(r=>r.date!=='2026-09-20')}],a=study(groups,[],p);
 const b=study(groups.map(g=>({...g,records:g.records.map(r=>r.date>=p.holdoutFrom?{...r,amount:r.amount*4}:r)})),[],p);
 assert.deepEqual(a.summary.chosen,b.summary.chosen);assert.equal(a.summary.holdout.network[METHODS[0]].pairs,15);assert.equal(a.summary.holdout.outlet[METHODS[0]].pairs,31);
});
