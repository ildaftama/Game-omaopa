import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs';import{createRequire}from'node:module';
const math=createRequire(import.meta.url)('../forecast/pcs-math.js');
function setup(){
 class Clock extends Date{constructor(...args){super(...(args.length?args:['2026-10-21T02:00:00Z']));}}
 const dates=['2026-08-01','2026-08-02','2026-09-01'],qty=n=>Array(12).fill(n),labels=['Ogura Cheese','Ogura Choco','Malmil Cheese','Malmil Choco','Mini Cheese','Mini Choco','Mini Durian','Chiffon Classic Keju','Chiffon Classic Ekstra Keju','Chiffon Butter','Lite Ekstra Keju','Lite Keju'];
 const sales={outletIds:['a','b'],days:dates.flatMap(date=>[{date,id:'a',qty:qty(20),complete:true},{date,id:'b',qty:qty(30),complete:true}])},orders={coveredDates:dates,days:dates.flatMap(date=>[{date,id:'a',qty:qty(2)},{date,id:'b',qty:qty(3)},{date,id:'__factory__',qty:qty(100)}])};
 const window={PcsMath:math,innerWidth:1100,OUTLET_INTELLIGENCE:{outlets:{a:{name:'Outlet A'},b:{name:'Outlet B'}}}},context=vm.createContext({window,document:{getElementById:()=>null},Intl,Date:Clock});
 vm.runInContext(fs.readFileSync(new URL('../forecast/pcs-compare.js',import.meta.url),'utf8'),context);
 const cmp=window.PcsCompare,data={sales,orders,labels,outletId:'__all__',year:'2026',month:'all',product:'all'},click=(attr,dataset={})=>cmp.click({target:{closest:s=>s===`[${attr}]`?{dataset}:null}}),field=(k,v,checked)=>cmp.change({target:{dataset:{cmpField:k},value:v,checked}});
 return {cmp,data,click,field,render:()=>cmp.render(data)};
}
test('default compares retail and preorders from matched PCS, excluding factory orders',()=>{
 const t=setup(),html=t.render();assert.match(html,/Bandingkan jenis penjualan/);assert.match(html,/Malmil Cheese \+ Malmil Choco · Outlet A \+ Outlet B · Agu, Sep 2026/);assert.equal((html.match(/stroke-width="1.3"/g)||[]).length,2);assert.match(html,/>270 <small>PCS \*/);assert.match(html,/>30 <small>PCS \*/);assert.ok(!html.includes('>0 PCS'));
});
test('multi-product, outlet and channel choices form distinct labelled curves without a Cartesian explosion',()=>{
 const t=setup();t.render();t.click('data-cmp-config',{cmpConfig:'products'});t.field('by','products');t.click('data-cmp-apply');let html=t.render();assert.match(html,/Malmil Cheese · Tanpa pesanan/);assert.match(html,/Malmil Choco · Pesanan/);assert.equal((html.match(/stroke-width="1.3"/g)||[]).length,4);
 t.click('data-cmp-config',{cmpConfig:'products'});t.field('products','0',true);t.field('products','1',true);html=t.render();assert.match(html,/8 garis/);assert.match(html,/data-cmp-apply[^>]*disabled/);assert.equal(t.click('data-cmp-apply'),false);
 t.click('data-cmp-cancel');t.click('data-cmp-config',{cmpConfig:'outlets'});t.field('by','outlets');t.click('data-cmp-apply');html=t.render();assert.match(html,/Outlet A · Tanpa pesanan/);assert.match(html,/Outlet B · Pesanan/);
});
test('month comparison aligns day-of-month and keeps absent days as gaps',()=>{
 const t=setup();t.render();t.click('data-cmp-config',{cmpConfig:'months'});t.field('by','months');t.click('data-cmp-apply');const html=t.render();assert.match(html,/tanggal 1–31/);assert.match(html,/Agustus · Tanpa pesanan/);assert.match(html,/September · Pesanan/);assert.match(html,/2026-08-01: 90 PCS/);assert.match(html,/2026-09-01: 10 PCS/);assert.ok(!html.includes('2026-09-02: 0 PCS'));assert.match(html,/>31<\/text>/);
});
test('empty filters and overly long daily views are blocked before applying',()=>{
 const t=setup();t.render();t.click('data-cmp-config',{cmpConfig:'months'});t.field('view','daily');t.field('months','07',true);assert.match(t.render(),/harian maksimal dua bulan/);assert.equal(t.click('data-cmp-apply'),false);
 t.field('view','monthly');t.field('types','retail',false);t.field('types','orders',false);assert.match(t.render(),/Pilih setidaknya satu/);assert.equal(t.click('data-cmp-apply'),false);
});
