import test from 'node:test';import assert from 'node:assert/strict';
import {candidateDays,chooseMethod,evaluateSeries,selectPlan,aggregateValidation} from './demand-validation.mjs';
const daily=Array.from({length:70},(_,i)=>({date:new Date(Date.UTC(2026,7,1+i)).toISOString().slice(0,10),quantity:10+i}));
test('three prior weekdays required; zero is observed and duplicates rejected',()=>{
 const rows=[0,7,14,21].map(i=>({...daily[i],quantity:i===21?0:10}));const v=evaluateSeries(rows);assert.equal(v.days,1);assert.equal(v.pairs[0].actual,0);assert.equal(v.adaptive.wape,null);assert.throws(()=>candidateDays([...rows,rows[0]]),/Duplicate/);
});
test('future outcomes cannot influence target prediction or method selection',()=>{
 const target=daily[55].date,prior=daily.filter(r=>r.date<target),all=[...prior,...daily.filter(r=>r.date>=target).map(r=>({...r,quantity:999999}))];
 assert.deepEqual(selectPlan(prior,target),selectPlan(all,target));
 assert.deepEqual(evaluateSeries(prior).pairs,evaluateSeries(all).pairs.filter(r=>r.date<target));
 assert.equal(selectPlan(daily,target).method,'previous');
});
test('selector requires fourteen past outcomes; ignores target error; tie keeps baseline',()=>{
 const days=daily.slice(0,14).map(r=>({date:r.date,actual:20,median:10,previous:20}));assert.equal(chooseMethod(days.slice(0,13),daily[14].date).method,'median');assert.equal(chooseMethod(days,daily[14].date).method,'previous');assert.equal(chooseMethod(days,days[13].date).method,'median');assert.equal(chooseMethod(days.map(r=>({...r,median:20})),daily[14].date).method,'median');
});
test('aggregate error does not cancel across products or combine pcs and boxes',()=>{
 const groups=[{unit:'pcs',validation:{pairs:[{actual:10,median:20,previous:10,prediction:20,method:'median'},{actual:10,median:0,previous:10,prediction:0,method:'median'}]}},{unit:'boks',validation:{pairs:[{actual:2,median:2,previous:3,prediction:2,method:'median'}]}}];const a=aggregateValidation(groups);assert.equal(a.pcs.medianWape,100);assert.equal(a.boks.medianWape,0);assert.equal(a.boks.previousWape,50);
});
