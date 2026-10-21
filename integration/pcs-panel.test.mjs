import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs';import{createRequire}from'node:module';
const math=createRequire(import.meta.url)('../forecast/pcs-math.js');
async function setup(width=1400,extraDates=[]){
 const dates=['2025-08-01','2026-08-01','2026-08-02',...extraDates],qty=n=>Array(12).fill(n);
 const sales={schemaVersion:1,outletIds:['a','b'],days:dates.flatMap(date=>[{date,id:'a',qty:qty(20),complete:true},...(date==='2026-08-02'?[]:[{date,id:'b',qty:qty(30),complete:true}])])};
 const orders={schemaVersion:1,coveredDates:dates,days:dates.flatMap(date=>[{date,id:'a',qty:qty(2),esbMatchedQty:qty(2)},{date,id:'b',qty:qty(3),esbMatchedQty:qty(3)}])};
 class Clock extends Date{constructor(...args){super(...(args.length?args:['2026-10-21T02:00:00Z']));}}
 const window={PcsMath:math,innerWidth:width,dispatchEvent(){}},context=vm.createContext({window,fetch:async url=>({ok:true,json:async()=>url==='pcs-sales.json'?sales:orders}),document:{getElementById:()=>null},Intl,Date:Clock,Event,console});
 vm.runInContext(fs.readFileSync(new URL('../forecast/pcs-panel.js',import.meta.url),'utf8'),context);await new Promise(r=>setImmediate(r));return window.PcsPanels;
}
const change=(p,id,value)=>p.change({target:{id,value}}),toggle=(p,id,checked)=>p.change({target:{id,checked}});
const action=(p,key,kind='sales')=>p.click({target:{closest:s=>s===`[data-pcs-${key}]`?{dataset:{[key==='all'?'pcsAll':'pcsNone']:kind}}:null}});
test('two products start on one chart; switching off a product removes its curve and quantities',async()=>{
 const p=await setup();let html=p.render('__all__');assert.equal((html.match(/role="img"/g)||[]).length,1);assert.match(html,/>126 <small>PCS \*/);assert.match(html,/data-pcs-point="Malmil Cheese/);assert.match(html,/data-pcs-point="Malmil Choco/);
 assert.equal(toggle(p,'pcs-product-3',false),true);html=p.render('__all__');assert.match(html,/>63 <small>PCS \*/);assert.ok(!html.includes('data-pcs-point="Malmil Choco'));assert.match(html,/role="switch" id="pcs-product-3" >/);
 toggle(p,'pcs-product-3',true);assert.match(p.render('__all__'),/>126 <small>PCS \*/);assert.ok(!html.includes('Atur perbandingan'));
});
test('outlet selection sums only chosen outlets, deduplicates values, and never treats no selection as all',async()=>{
 const p=await setup();p.render('__all__');change(p,'pcs-month','08');p.setOutlets(['a','a','invalid']);let html=p.render('__all__');assert.match(html,/>72 <small>PCS \*/);assert.match(html,/pcs-tag">a<\/span>/);
 p.setOutlets(['b']);html=p.render('__all__');assert.match(html,/>54 <small>PCS \*/);assert.match(html,/2 Agustus<\/td><td>—<\/td>/);
 p.setOutlets(['a','b']);assert.match(p.render('__all__'),/>126 <small>PCS \*/);p.setOutlets([]);html=p.render('__all__');assert.match(html,/Pilih outlet di atas/);assert.ok(!html.includes('role="img"'));
});
test('all and hide-all actions preserve separate variant toggles and provide a way back from an empty chart',async()=>{
 const p=await setup();p.render('__all__');action(p,'none');let html=p.render('__all__');assert.match(html,/Aktifkan produk di bawah/);assert.ok(!html.includes('role="img"'));action(p,'all');html=p.render('__all__');assert.match(html,/>567 <small>PCS \*/);for(const label of ['Chiffon Classic Keju','Chiffon Classic Ekstra Keju','Lite Keju','Lite Ekstra Keju','Chiffon Butter'])assert.ok(html.includes(label));
});
test('sales and preorders can share the graph with distinct line styles; switching sources off is safe',async()=>{
 const p=await setup();p.render('__all__');change(p,'pcs-month','08');toggle(p,'pcs-type-orders',true);let html=p.render('__all__');assert.match(html,/Penjualan & pesanan/);assert.match(html,/>146 <small>PCS \*/);assert.match(html,/stroke-dasharray="7 4"/);
 toggle(p,'pcs-type-retail',false);html=p.render('__all__');assert.match(html,/>20 <small>PCS \*/);assert.ok(!html.includes('data-pcs-point="Malmil Cheese · Tanpa pesanan'));
 toggle(p,'pcs-type-orders',false);assert.match(p.render('__all__'),/Aktifkan jenis penjualan/);
});
test('orders keep their own product switches and period; the yearly view leaves unavailable months blank',async()=>{
 const p=await setup(390);p.render('__all__');change(p,'pcs-year','2025');assert.match(p.render('__all__'),/>90 <small>PCS \*/);assert.match(p.render('__all__'),/Januari<\/td><td>—<\/td>/);
 action(p,'none','orders');toggle(p,'pcso-product-11',true);change(p,'pcso-month','08');let html=p.orders('__all__');assert.match(html,/Harian · Agustus 2026/);assert.match(html,/>10 <small>PCS \*/);assert.match(html,/viewBox="0 0 302 300"/);assert.ok(!html.includes('data-pcs-point="Malmil Cheese'));assert.match(p.render('__all__'),/Tren bulanan 2025/);
});
test('month to date remains partial in the annual view while fully matched daily values are valid',async()=>{
 const p=await setup(1400,Array.from({length:20},(_,i)=>'2026-10-'+String(i+1).padStart(2,'0')));let html=p.render('__all__');assert.match(html,/Oktober: 900 PCS · sebagian data/);change(p,'pcs-month','10');html=p.render('__all__');assert.match(html,/>1\.800 <small>PCS<\/small>/);assert.match(html,/Penjualan s.d. 20 Oktober/);assert.match(html,/stroke-width="1.2"/);
});
