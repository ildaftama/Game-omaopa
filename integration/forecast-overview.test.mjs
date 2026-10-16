import fs from 'node:fs';import vm from 'node:vm';import test from 'node:test';import assert from 'node:assert/strict';
const ctx={window:{}};vm.runInNewContext(fs.readFileSync(new URL('../forecast/forecast-overview.js',import.meta.url),'utf8'),ctx);const summarize=ctx.window.ForecastOverview.summarize;
const product=(name,quantity,unit='pcs',through='2026-10-13')=>({name,unit,through,plans:[{date:'2026-10-17',central:quantity}]});
test('all outlets sums SKU revenue at observed prices; excludes Kurma and keeps units separate',()=>{
 const data={outlets:{a:{name:'A',products:[product('Ogura Cheese',10),product('Mini Ogura - Cheese',9),product('Cisfon - Keju',2,'boks'),product('Cisfon - Kurma',99,'boks')]},b:{name:'B',products:[product('Ogura Cheese',5)]}}};
 const prices={outlets:{a:{'Ogura Cheese':{price:41000,method:'outlet-observed'}},b:{'Ogura Cheese':{price:42000,method:'network-estimate'}}}};
 const m=summarize(data,['a','b'],'__all__','2026-10-17','2026-10-16',prices);
 assert.equal(m.revenue,410000+57000+66000+210000);assert.equal(m.expected,4);assert.equal(m.units.pcs,24);assert.equal(m.units.boks,2);assert.equal(m.complete,true);assert.equal(m.estimatedPriceOutlets[0],'B');
});
test('unknown price and missing/stale forecast are excluded, observed zero remains valid',()=>{
 const data={outlets:{a:{name:'A',products:[product('Ogura Cheese',10),product('Malmil Cheese',null),product('Cisfon - Keju',3,'boks','2026-09-01'),product('Mini Ogura - Cheese',0)]}}};
 const m=summarize(data,['a'],'__all__','2026-10-17','2026-10-16',{outlets:{}});assert.equal(m.expected,4);assert.equal(m.ready,2);assert.equal(m.priced,1);assert.equal(m.revenue,0);assert.equal(m.complete,false);
 const past=summarize(data,['a'],'__all__','2026-10-17','2026-10-18',{outlets:{}});assert.equal(past.revenue,null);assert.equal(past.ready,0);
});
test('a zero median with positive historical sales is not presented as a stock-zero recommendation',()=>{
 const p={...product('Mini Ogura - Cheese',0),activeDays:8,validation:{days:10,medianWape:120}};
 const data={outlets:{a:{name:'A',products:[p]}}},m=summarize(data,['a'],'__all__','2026-10-17','2026-10-16',{outlets:{}});
 assert.equal(m.rows[0].products[0].quantity,0);assert.match(m.rows[0].products[0].review,/bukan saran stok nol/);assert.equal(m.rows[0].products[0].validation.days,10);
});
test('high error and sparse validation remain visible and do not silently remove estimated sales',()=>{
 const data={outlets:{a:{name:'A',products:[{...product('Mini Ogura - Cheese',9),validation:{days:20,medianWape:70}},{...product('Cisfon - Keju',2,'boks'),validation:{days:5,medianWape:10}},{...product('Mini Ogura - Choco',9),validation:{days:20,medianWape:20}}]}}};
 const m=summarize(data,['a'],'__all__','2026-10-17','2026-10-16',{outlets:{}});
 assert.equal(m.reviewCount,2);assert.equal(m.revenue,180000);assert.equal(m.ready,3);
 assert.match(m.rows[0].products[0].review,/Selisih besar/);assert.match(m.rows[0].products[1].review,/Hari uji/);assert.equal(m.rows[0].products[2].review,null);
 const past=summarize(data,['a'],'__all__','2026-10-17','2026-10-18',{outlets:{}});assert.equal(past.reviewCount,0);
});
test('target-date events appear for the matching outlet in the all-product plan',()=>{
 ctx.window.INSIGHT_DATA={events:[{title:'Graduation A',start:'2026-10-17',end:'2026-10-17',outletHint:'A',source:'https://example.org/a'},{title:'Other outlet',start:'2026-10-17',end:'2026-10-17',outletHint:'B'},{title:'Future A',start:'2026-10-24',end:'2026-10-24',outletHint:'A'}]};
 const data={outlets:{a:{name:'A',products:[product('Mini Ogura - Cheese',9)]}}},m=summarize(data,['a'],'__all__','2026-10-17','2026-10-16',{outlets:{}});
 assert.equal(m.rows[0].events.length,1);assert.equal(m.rows[0].events[0].title,'Graduation A');assert.equal(m.revenue,57000);
 assert.match(ctx.window.ForecastOverview.render(m,false),/Graduation A/);assert.match(ctx.window.ForecastOverview.render(m,true),/ada kegiatan/);
 delete ctx.window.INSIGHT_DATA;
});

test('forecast display omits ambiguous mixed-unit totals while preserving SKU quantities and revenue',()=>{
 const data={outlets:{a:{name:'A',products:[product('Mini Ogura - Cheese',9),product('Cisfon - Keju',2,'boks')]}}};
 const m=summarize(data,['a'],'__all__','2026-10-17','2026-10-16',{outlets:{}});
 assert.equal(m.revenue,123000);assert.equal(m.units.boks,2);
 for(const all of [true,false]){const html=ctx.window.ForecastOverview.render(m,all);assert.doesNotMatch(html,/boks|forecast-outlet-units|PERKIRAAN TERJUAL/);assert.match(html,/Cisfon - Keju/);}
});
