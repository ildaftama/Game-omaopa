import test from 'node:test';import assert from 'node:assert/strict';import{createRequire}from'node:module';
const math=createRequire(import.meta.url)('../forecast/pcs-math.js');
const sales={days:[{date:'2026-09-01',id:'a',qty:[20],complete:true},{date:'2026-09-01',id:'b',qty:[10],complete:true}]};
test('subtract matched outlet/date/product orders; exclude factory and keep partial explicit',()=>{
 const o={coveredDates:['2026-09-01'],blockedDates:[],days:[{date:'2026-09-01',id:'a',qty:[5],esbMatchedQty:[5]},{date:'2026-09-01',id:'__factory__',qty:[100]}]};
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
test('classic and lite add constituent pure PCS only for the same complete outlet/date',()=>{
 const s={days:[{date:'2026-09-01',id:'a',qty:[0,0,0,0,0,0,0,10,20,7,8,12],complete:true}]},o={coveredDates:['2026-09-01'],days:[{date:'2026-09-01',id:'a',qty:[0,0,0,0,0,0,0,2,5,1,3,4],esbMatchedQty:[0,0,0,0,0,0,0,2,5,1,3,4]}]};
 assert.equal(math.pure(s,o,['a'],[7,8],['2026-09-01'])[0].value,23);
 assert.equal(math.pure(s,o,['a'],[10,11],['2026-09-01'])[0].value,13);
 assert.equal(math.pure(s,o,['a'],9,['2026-09-01'])[0].value,6);
 o.days[0].qty[8]=null;assert.equal(math.pure(s,o,['a'],[7,8],['2026-09-01'])[0].value,null);
 o.days[0].qty[8]=21;o.days[0].esbMatchedQty[8]=21;assert.equal(math.pure(s,o,['a'],[7,8],['2026-09-01'])[0].value,null);
});
test('orders chart preserves zero, known partial quantities, and missing dates separately',()=>{
 const o={coveredDates:['2026-10-01','2026-10-02'],days:[{date:'2026-10-01',id:'a',qty:[null],knownQty:[4]},{date:'2026-10-01',id:'b',qty:[3],knownQty:[3]}]};
 const rows=math.ordered(o,['a','b'],0,['2026-10-01','2026-10-02','2026-10-03']);
 assert.equal(rows[0].value,7);assert.equal(rows[0].complete,false);assert.equal(rows[0].valid,1);
 assert.equal(rows[1].value,0);assert.equal(rows[1].complete,true);
 assert.equal(rows[2].value,null);assert.equal(rows[2].complete,false);
});

test('CS orders without a POS registration match never get subtracted merely because quantities fit',()=>{const o={coveredDates:['2026-09-01'],days:[{date:'2026-09-01',id:'a',qty:[5]}]};let r=math.pure(sales,o,['a'],0,['2026-09-01'])[0];assert.equal(r.value,null);assert.equal(r.reasons.reconciliation,1);o.days[0].esbMatchedQty=[0];r=math.pure(sales,o,['a'],0,['2026-09-01'])[0];assert.equal(r.value,20);o.days[0].esbMatchedQty=[3];assert.equal(math.pure(sales,o,['a'],0,['2026-09-01'])[0].value,17);assert.equal(math.sold(sales,['a'],0,['2026-09-01'])[0].value,20);});

test('verified partitions obey the accounting identity without inferring POS membership from destination',()=>{const ds=['2026-09-01'],o={coveredDates:ds,days:[{date:ds[0],id:'a',qty:[5],esbMatchedQty:[3]},{date:ds[0],id:'b',qty:[2],esbMatchedQty:[0]},{date:ds[0],id:'__factory__',qty:[100]}]};let r=math.partition(sales,o,['a','b'],0,ds)[0];assert.equal(r.total.value,30);assert.equal(r.retail.value,27);assert.equal(r.orders.value,3);assert.equal(r.total.value,r.retail.value+r.orders.value);delete o.days[0].esbMatchedQty;r=math.partition(sales,o,['a','b'],0,ds)[0];assert.equal(r.total.value,30);assert.equal(r.retail.value,null);assert.equal(r.orders.value,null);assert.equal(r.retail.complete,false);});
