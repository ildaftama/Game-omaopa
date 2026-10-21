const {test}=require('node:test'),assert=require('node:assert/strict'),model=require('../forecast/forecast-planner-model.js');
const arrays=v=>Array(12).fill(v),sales={days:[]},orders={days:[],coveredDates:[]};
for(let i=0;i<56;i++){const date=model.shift('2026-10-01',i);sales.days.push({date,id:'a',complete:true,mappingVersion:2,qty:arrays(20)});orders.days.push({date,id:'a',qty:arrays(5)});orders.coveredDates.push(date);}
test('recommendation uses only earlier dates, excludes preorder units and is outlet-specific',()=>{
 const before=model.recommend(sales,orders,'a','2026-10-22');assert.equal(before[2].central,15);assert.equal(before[2].samples,3);
 const future={...sales,days:[...sales.days,{date:'2026-10-22',id:'a',complete:true,qty:arrays(9000)},{date:'2026-10-21',id:'b',complete:true,qty:arrays(999)}]};assert.deepEqual(model.recommend(future,orders,'a','2026-10-22'),before);
});
test('large orders do not produce over-range warning when regular is within range',()=>{
 const draft={active:arrays(false),regular:arrays(''),orders:arrays('')};draft.active[2]=true;draft.regular[2]='15';draft.orders[2]='300';const r=model.calculate(draft,model.recommend(sales,orders,'a','2026-10-22'),arrays({value:19000}));assert.equal(r.warnings,0);assert.equal(r.pcs,315);assert.equal(r.revenue,5985000);
 draft.regular[2]='50';assert.equal(model.calculate(draft,model.recommend(sales,orders,'a','2026-10-22'),arrays({value:19000})).warnings,1);
});
test('blank, fractional or negative active quantities never display a complete revenue',()=>{
 const draft={active:arrays(false),regular:arrays('0'),orders:arrays('0')};draft.active[2]=true;const rec=arrays({low:0,high:100});for(const value of ['',-1,2.5,'1e9']){draft.regular[2]=value;const r=model.calculate(draft,rec,arrays({value:19000}));assert.equal(r.complete,false);assert.equal(r.revenue,null);}draft.regular[2]='0';assert.equal(model.calculate(draft,rec,arrays({value:19000})).revenue,0);
});
test('missing prices stay missing, target cannot use later price periods',()=>{
 const prices={through:'2026-09-30',period:'September 2026',outlets:{a:{'Malmil Cheese':{price:19001}}}};
 assert.equal(model.prices(prices,'a','2026-10-22')[2].value,19001);assert.equal(model.prices(prices,'a','2026-09-01')[2].value,null);assert.equal(model.prices(prices,'b','2026-10-22')[2].value,null);assert.equal(model.prices(prices,'a','2026-10-22')[4].value,57000/9);
});
test('monitoring preserves original plan, excludes late plans and respects missing actuals',()=>{
 const baseline={active:arrays(false),regular:arrays(0),orders:arrays(0)};baseline.active[2]=true;baseline.regular[2]=15;const record={outlet:'a',date:'2026-10-21',firstSavedAt:'2026-10-20T14:00:00Z',baseline,plan:{regular:arrays(999)}};
 const oneSales={...sales,days:sales.days.map(r=>({...r,qty:r.qty.map((v,p)=>p===2?v:0)}))},oneOrders={...orders,days:orders.days.map(r=>({...r,qty:r.qty.map((v,p)=>p===2?v:0)}))};
 const c=model.compare(record,oneSales,oneOrders);assert.equal(c.planned,15);assert.equal(c.actual,15);assert.equal(c.wape,0);assert.equal(model.compare({...record,firstSavedAt:'2026-10-21T01:00:00+07:00'},oneSales,oneOrders).wape,null);assert.equal(model.compare({...record,outlet:'missing'},sales,orders).actual,null);
 const all=model.compare(record,sales,orders);assert.equal(all.actual,180);assert.equal(all.absolute,165);assert.ok(all.wape>90,'Unselected products must not hide actual sales or inflate accuracy');
});
