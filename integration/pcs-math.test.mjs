import test from 'node:test';import assert from 'node:assert/strict';import{createRequire}from'node:module';
const math=createRequire(import.meta.url)('../forecast/pcs-math.js');
const sales={days:[{date:'2026-09-01',id:'a',qty:[20],complete:true},{date:'2026-09-01',id:'b',qty:[10],complete:true}]};
test('subtract matched outlet/date/product orders; exclude factory and keep partial explicit',()=>{
 const o={coveredDates:['2026-09-01'],blockedDates:[],days:[{date:'2026-09-01',id:'a',qty:[5]},{date:'2026-09-01',id:'__factory__',qty:[100]}]};
 const a=math.pure(sales,o,['a','b'],0,['2026-09-01'])[0];assert.equal(a.value,25);assert.equal(a.complete,true);
 const b=math.pure(sales,o,['a','b','c'],0,['2026-09-01'])[0];assert.equal(b.value,25);assert.equal(b.complete,false);assert.equal(b.valid,2);
});
test('unknown orders, no register coverage, or preorder quantity greater than sales never become zero',()=>{
 for(const o of [{coveredDates:[],days:[]},{coveredDates:['2026-09-01'],days:[{date:'2026-09-01',id:'a',qty:[null]}]},{coveredDates:['2026-09-01'],days:[{date:'2026-09-01',id:'a',qty:[21]}]}]){
  const a=math.pure(sales,o,['a'],0,['2026-09-01'])[0];assert.equal(a.value,null);assert.equal(a.complete,false);
 }
});
test('monthly comparison percentage is withheld when coverage differs or is incomplete',()=>{
 assert.equal(math.change({value:50,complete:false},{value:40,complete:true}),null);
 assert.equal(math.change({value:50,complete:true},{value:40,complete:true}),25);
});
