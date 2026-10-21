import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs';import{createRequire}from'node:module';
const math=createRequire(import.meta.url)('../forecast/pcs-math.js');
async function setup(width=1400,extraDates=[]){
 const dates=['2025-08-01','2026-08-01','2026-08-02',...extraDates],qty=n=>Array(12).fill(n);
 const sales={schemaVersion:1,outletIds:['a','b'],days:dates.flatMap(date=>[{date,id:'a',qty:qty(20),complete:true},...(date==='2026-08-02'?[]:[{date,id:'b',qty:qty(30),complete:true}])])};
 const orders={schemaVersion:1,coveredDates:dates,days:dates.flatMap(date=>[{date,id:'a',qty:qty(2)},{date,id:'b',qty:qty(3)}])};
 class Clock extends Date{constructor(...args){super(...(args.length?args:['2026-10-21T02:00:00Z']));}}
 const window={PcsMath:math,innerWidth:width,dispatchEvent(){}},context=vm.createContext({window,fetch:async url=>({ok:true,json:async()=>url==='pcs-sales.json'?sales:orders}),document:{getElementById:()=>null},Intl,Date:Clock,Event,console});
 vm.runInContext(fs.readFileSync(new URL('../forecast/pcs-compare.js',import.meta.url),'utf8'),context);
 vm.runInContext(fs.readFileSync(new URL('../forecast/pcs-panel.js',import.meta.url),'utf8'),context);await new Promise(r=>setImmediate(r));return window.PcsPanels;
}
test('overview is one total chart, preserves variant choices, and never turns missing months into zeros',async()=>{
 const p=await setup(),html=p.render('__all__');assert.equal((html.match(/role="img"/g)||[]).length,1);assert.match(html,/Semua produk · total/);assert.match(html,/Chiffon Classic Keju/);assert.match(html,/Chiffon Classic Ekstra Keju/);assert.match(html,/Lite Keju/);assert.match(html,/Lite Ekstra Keju/);assert.match(html,/Chiffon Butter/);assert.match(html,/>567 <small>PCS/);assert.match(html,/Januari<\/td><td>—<\/td><td>Belum tersedia/);assert.ok(!html.includes('5 produk paling banyak'));
 p.change({target:{id:'pcs-year',value:'2025'}});assert.match(p.render('__all__'),/>405 <small>PCS/);
});
test('month and product navigation keep the same SKU and distinguish partial totals',async()=>{
 const p=await setup();p.change({target:{id:'pcs-month',value:'08'}});p.change({target:{id:'pcs-product',value:'7'}});let html=p.render('__all__');assert.match(html,/>63 <small>PCS \*/);assert.match(html,/Harian · Agustus/);assert.match(html,/Garis putus-putus/);assert.match(html,/fill="transparent"/);assert.match(html,/stroke-width="1.2"/);
 assert.equal(p.click({target:{closest:s=>s==='[data-pcs-pick]'?{dataset:{pcsKind:'sales',pcsPick:'8'}}:null}}),true);assert.match(p.render('__all__'),/pcs-tag">Chiffon Classic Ekstra Keju/);
 assert.equal(p.click({target:{closest:s=>s==='[data-pcs-month]'?{dataset:{pcsKind:'sales',pcsMonth:'09'}}:null}}),true);assert.match(p.render('__all__'),/Data periode ini belum tersedia/);
});
test('orders also use a single total chart and product selection; narrow screens keep readable tick spacing',async()=>{
 const p=await setup(390);let html=p.orders('__all__');assert.equal((html.match(/role="img"/g)||[]).length,1);assert.match(html,/Grafik jumlah kue pesanan/);assert.match(html,/Termasuk pesanan mendatang/);assert.match(html,/viewBox="0 0 302 300"/);
 p.change({target:{id:'pcso-month',value:'08'}});p.change({target:{id:'pcso-product',value:'11'}});html=p.orders('__all__');assert.match(html,/pcs-tag">Lite Keju/);assert.match(html,/>10 <small>PCS/);assert.match(html,/1 Agustus/);
});
test('a fully matched month-to-date is still labelled as an unfinished monthly total',async()=>{
 const p=await setup(1400,Array.from({length:20},(_,i)=>'2026-10-'+String(i+1).padStart(2,'0')));p.change({target:{id:'pcs-product',value:'7'}});
 assert.match(p.render('__all__'),/Oktober: 900 PCS · sebagian data/);assert.match(p.render('__all__'),/Data s.d. 20 Oktober/);
 p.change({target:{id:'pcs-month',value:'10'}});assert.match(p.render('__all__'),/Data s.d. 20 Oktober/);assert.match(p.render('__all__'),/>900 <small>PCS<\/small>/);
});
test('comparison mode is available beside the trend without changing the other tab',async()=>{
 const p=await setup(),mode=value=>({target:{closest:s=>s==='[data-pcs-mode]'?{dataset:{pcsKind:'sales',pcsMode:value}}:null}});
 assert.equal(p.click(mode('compare')),true);assert.match(p.render('__all__'),/Atur perbandingan/);assert.match(p.render('__all__'),/Bandingkan jenis penjualan/);assert.match(p.orders('__all__'),/Tren pesanan/);
 p.click(mode('trend'));assert.match(p.render('__all__'),/Tren penjualan kue/);assert.ok(!p.render('__all__').includes('Atur perbandingan'));
});
