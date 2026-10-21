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

test('estimated components use source quantities, respect POS limits and leave factory/raw orders intact',()=>{
 const date='2026-09-01',s={days:[{date,id:'a',qty:[10],complete:true},{date,id:'b',qty:[20],complete:true}]},o={coveredDates:[date],days:[{date,id:'a',qty:[13]},{date,id:'b',qty:[3]},{date,id:'__factory__',qty:[100]}]};
 const r=math.estimatedPartition(s,o,['a','b'],0,[date])[0];assert.equal(r.total.value,30);assert.equal(r.orders.value,13);assert.equal(r.retail.value,17);assert.equal(r.orders.estimated,true);assert.equal(r.methods.capped,1);assert.equal(o.days[0].qty[0],13);assert.equal(r.total.value,r.orders.value+r.retail.value);
 o.days[0].esbMatchedQty=[0];const p=math.estimatedPartition(s,o,['a','b'],0,[date])[0];assert.equal(p.orders.value,3);assert.equal(p.retail.value,27);
});
test('missing quantities use the median of prior 56-day positive order shares without future leakage',()=>{
 const make=(date,n)=>({date,id:'a',qty:[n],complete:true}),s={days:[make('2026-01-01',100),make('2026-08-01',100),make('2026-08-02',100),make('2026-08-03',100),make('2026-08-04',100)]},o={coveredDates:s.days.map(r=>r.date),days:[{date:'2026-01-01',id:'a',qty:[90]},{date:'2026-08-01',id:'a',qty:[10]},{date:'2026-08-02',id:'a',qty:[20]},{date:'2026-08-03',id:'a',qty:[null],knownQty:[4]},{date:'2026-08-04',id:'a',qty:[100]}]};
 let r=math.estimatedPartition(s,o,['a'],0,['2026-08-03'])[0];assert.equal(r.orders.value,15);assert.equal(r.retail.value,85);assert.equal(r.methods.history,1);o.days[3].knownQty=[18];r=math.estimatedPartition(s,o,['a'],0,['2026-08-03'])[0];assert.equal(r.orders.value,18);
 const early=math.estimatedPartition(s,{coveredDates:['2026-01-01'],days:[{date:'2026-01-01',id:'a',qty:[null],knownQty:[2]}]},['a'],0,['2026-01-01'])[0];assert.equal(early.orders.value,2);assert.equal(early.methods.knownOnly,1);
});
test('estimated partition always balances for zero, missing, excess, or ordinary order quantities',()=>{
 for(const n of[0,1,10,100])for(const q of[null,0,1,10,110]){const date='2026-08-01',s={days:[{date,id:'a',qty:[n],complete:true}]},o={coveredDates:[date],days:[{date,id:'a',qty:[q]}]},r=math.estimatedPartition(s,o,['a'],0,[date])[0];assert.equal(r.total.value,r.orders.value+r.retail.value);assert.ok(r.orders.value>=0&&r.orders.value<=n);assert.ok(r.retail.value>=0);}
});
