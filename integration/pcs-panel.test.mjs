import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs';import{createRequire}from'node:module';
const math=createRequire(import.meta.url)('../forecast/pcs-math.js');
test('variant-product monthly and daily render and orders partial counts stay explicit',async()=>{
 const sales=JSON.parse(fs.readFileSync(new URL('../forecast/pcs-sales.json',import.meta.url))),orders=JSON.parse(fs.readFileSync(new URL('../forecast/pcs-orders.json',import.meta.url)));
 const profiles=JSON.parse(fs.readFileSync(new URL('../forecast/outlet-intelligence-data.js',import.meta.url),'utf8').split('=').slice(1).join('=').trim().replace(/;$/,''));
 const window={PcsMath:math,OUTLET_INTELLIGENCE:profiles,dispatchEvent(){}},context=vm.createContext({window,fetch:async url=>({ok:true,json:async()=>url==='pcs-sales.json'?sales:orders}),Intl,Date,Event,console});
 vm.runInContext(fs.readFileSync(new URL('../forecast/pcs-panel.js',import.meta.url),'utf8'),context);
 await new Promise(r=>setImmediate(r));const p=window.PcsPanels;
 assert.match(p.render('__all__'),/Malmil Cheese/);assert.match(p.render('__all__'),/Chiffon Classic Keju/);assert.match(p.render('__all__'),/Lite Keju/);assert.match(p.render('__all__'),/Chiffon Butter/);
 assert.match(p.render('__all__'),/sebagian/);
 p.change({target:{id:'pcs-month',value:'09'}});p.change({target:{id:'pcs-product',value:'2'}});
 assert.match(p.render('jakal-uii'),/Penjualan harian/);assert.match(p.render('jakal-uii'),/2026-09-26/);assert.match(p.render('jakal-uii'),/stroke-width="0.9"/);assert.ok(!p.render('jakal-uii').includes('r="3.4"'));assert.match(p.render('jakal-uii'),/fill="transparent"/);
 p.change({target:{id:'pcs-product',value:'7'}});assert.match(p.render('jakal-uii'),/Chiffon Classic Keju/);p.change({target:{id:'pcs-product',value:'8'}});assert.match(p.render('jakal-uii'),/Chiffon Classic Ekstra Keju/);p.change({target:{id:'pcs-product',value:'11'}});assert.match(p.render('jakal-uii'),/Lite Keju/);
 assert.match(p.orders('__all__'),/Rincian harian/);assert.match(p.orders('__all__'),/Grafik jumlah kue pesanan/);assert.match(p.orders('__all__'),/5 produk paling banyak dipesan/);p.change({target:{id:'pcso-month',value:'10'}});p.change({target:{id:'pcso-product',value:'8'}});assert.match(p.orders('__all__'),/Pesanan harian/);assert.match(p.orders('__all__'),/Chiffon Classic Ekstra Keju/);p.change({target:{id:'pcso-product',value:'all'}});assert.match(p.orders('__all__'),/sebagian/);
 p.change({target:{id:'pcso-year',value:'2025'}});assert.match(p.orders('nusa-indah'),/2025-/);
});
