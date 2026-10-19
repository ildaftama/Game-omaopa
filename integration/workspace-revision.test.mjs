import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const dir=new URL('../forecast/',import.meta.url),context=()=>({window:{},Intl,Date,URL,Event,document:{},console});
const run=(c,f)=>vm.runInNewContext(fs.readFileSync(new URL(f,dir),'utf8'),c);
test('month filter keeps calendar gaps and compares with preceding calendar day, including prior month',()=>{
 const c=context();run(c,'seasonality-panel.js');const p=c.window.SeasonalityPanel;
 const s={daily:[{date:'2026-09-30',amount:100},{date:'2026-10-01',amount:120},{date:'2026-10-02',amount:null},{date:'2026-10-03',amount:130},{date:'2026-10-04',amount:0},{date:'2026-10-05',amount:140}],monthly:[]};
 p.change({target:{id:'trend-month',value:'10'}});const r=p.pointsFor(s);assert.equal(r.daily,true);assert.equal(r.points.length,5);assert.ok(Math.abs(r.points[0].change-20)<1e-9);assert.equal(r.points[2].change,null);assert.equal(r.points[3].change,-100);assert.equal(r.points[4].change,null);
});
test('trend has thin connecting line, both change colors and no line through missing values',()=>{
 const c=context();run(c,'revenue-trend-data.js');run(c,'seasonality-panel.js');const p=c.window.SeasonalityPanel;
 p.change({target:{id:'trend-month',value:'09'}});const s=p.render('__all__');assert.match(s,/stroke-width="1.2"/);assert.match(s,/change-up/);assert.match(s,/change-down/);assert.match(s,/September/);
});
test('source links accept Google Sheets only; reject executable URLs and lookalike hosts',()=>{
 const c=context();run(c,'source-settings.js');const v=c.window.SourceSettings.validLink;
 assert.equal(v('https://docs.google.com/spreadsheets/d/abc_123/edit'),true);for(const u of ['javascript:alert(1)','https://docs.google.com.evil.com/spreadsheets/d/x/edit','https://evil.com/a','http://docs.google.com/spreadsheets/d/x/edit'])assert.equal(v(u),false);
});
test('history retains actual zero, pending null, and archived October18 plans',()=>{
 const c=context();run(c,'forecast-history-data.js');const d=c.window.FORECAST_HISTORY;
 assert.ok(d.rows.some(r=>r[0]==='2026-10-18'&&r[5]==='archive'&&r[4]!==null));assert.ok(d.rows.some(r=>r[0]==='2026-10-20'&&r[5]==='archive'&&r[4]===null));assert.ok(d.rows.some(r=>r[4]===0));assert.ok(d.rows.filter(r=>r[5]==='archive').every(r=>r[6]<r[0]));
});
test('published order summary contains aggregates only, and network product shares are weighted from money',()=>{
 const c=context();run(c,'orders-summary-data.js');run(c,'network-products-data.js');const d=c.window.ORDERS_SUMMARY;
 assert.ok(d.daily.length>7000);assert.ok(d.daily.every(r=>r.length===5&&r[3]>0&&r[4]>0));assert.ok(d.days.every(r=>r.length===5));assert.ok(!/sourceRow|bookingDate|phone|customer|receipt|paymentKind/.test(JSON.stringify(d)));
 const ps=c.window.NETWORK_PRODUCTS.products;assert.ok(Math.abs(ps.reduce((s,p)=>s+p.salesShare,0)-100)<.5);assert.ok(ps.every((p,i)=>p.salesRank===i+1));
});
