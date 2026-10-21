import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs';import{createRequire}from'node:module';
const math=createRequire(import.meta.url)('../forecast/pcs-math.js');
async function setup({width=1400,gap=false,unmatched=false}={}){
 const qty=n=>Array(12).fill(n),dates=['2025-08','2026-08'].flatMap(month=>Array.from({length:31},(_,i)=>month+'-'+String(i+1).padStart(2,'0'))).concat(Array.from({length:20},(_,i)=>'2026-10-'+String(i+1).padStart(2,'0')));
 const sales={schemaVersion:1,outletIds:['a','b'],days:dates.flatMap(date=>[{date,id:'a',qty:qty(20),mappingVersion:2,complete:true},...(gap&&date==='2026-08-02'?[]:[{date,id:'b',qty:qty(30),mappingVersion:2,complete:true}])])};
 const orders={schemaVersion:1,coveredDates:dates,days:dates.flatMap(date=>[{date,id:'a',qty:qty(2),esbMatchedQty:qty(2)},{date,id:'b',qty:qty(3),...(unmatched&&date==='2026-08-02'?{}:{esbMatchedQty:qty(3)})},{date,id:'__factory__',qty:qty(100)}])};
 class Clock extends Date{constructor(...args){super(...(args.length?args:['2026-10-21T02:00:00Z']));}}
 const window={PcsMath:math,ForecastSecureData:{"pcs-sales.json":sales,"pcs-orders.json":orders},innerWidth:width,dispatchEvent(){}},context=vm.createContext({window,fetch:async url=>({ok:true,json:async()=>url==='pcs-sales.json'?sales:orders}),document:{getElementById:()=>null},Intl,Date:Clock,Event,console});
 vm.runInContext(fs.readFileSync(new URL('../forecast/pcs-panel.js',import.meta.url),'utf8'),context);await new Promise(r=>setImmediate(r));return window.PcsPanels;
}
const change=(p,id,value)=>p.change({target:{id,value}}),toggle=(p,id,checked)=>p.change({target:{id,checked}}),mode=(p,m)=>toggle(p,'pcs-type-'+m,true);
const action=(p,key,kind='sales')=>p.click({target:{closest:s=>s===`[data-pcs-${key}]`?{dataset:{[key==='all'?'pcsAll':'pcsNone']:kind}}:null}});
const radioCount=html=>(html.match(/type="radio"[^>]* checked/g)||[]).length;

test('one sales mode at a time; total equals its verified retail and preorder components',async()=>{
 const p=await setup();p.render('__all__');change(p,'pcs-month','08');let html=p.render('__all__');assert.equal(radioCount(html),1);assert.match(html,/>3\.100 <small>PCS/);
 mode(p,'retail');html=p.render('__all__');assert.equal(radioCount(html),1);assert.match(html,/>2\.790 <small>PCS/);assert.ok(!html.includes('data-pcs-point="Malmil Cheese · Total penjualan'));
 mode(p,'orders');html=p.render('__all__');assert.equal(radioCount(html),1);assert.match(html,/>310 <small>PCS/);assert.ok(!html.includes('data-pcs-point="Malmil Cheese · Tanpa pesanan'));
 assert.equal(toggle(p,'pcs-type-orders',false),false);assert.equal(radioCount(p.render('__all__')),1);
 mode(p,'sales');assert.match(p.render('__all__'),/>3\.100 <small>PCS/);assert.ok(!p.render('__all__').includes('Jumlah pada grafik'));
});
test('product switches remove only their curve and keep one chart',async()=>{
 const p=await setup();p.render('__all__');change(p,'pcs-month','08');let html=p.render('__all__');assert.equal((html.match(/role="img"/g)||[]).length,1);assert.match(html,/data-pcs-point="Malmil Choco/);
 toggle(p,'pcs-product-3',false);html=p.render('__all__');assert.match(html,/>1\.550 <small>PCS/);assert.ok(!html.includes('data-pcs-point="Malmil Choco'));toggle(p,'pcs-product-3',true);assert.match(p.render('__all__'),/>3\.100 <small>PCS/);
 action(p,'none');assert.match(p.render('__all__'),/Aktifkan produk di bawah/);action(p,'all');html=p.render('__all__');assert.match(html,/>13\.950 <small>PCS/);for(const label of ['Chiffon Classic Keju','Chiffon Classic Ekstra Keju','Lite Keju','Lite Ekstra Keju','Chiffon Butter'])assert.ok(html.includes(label));
});
test('outlet choices deduplicate, preserve mode and never interpret an empty selection as all',async()=>{
 const p=await setup();p.render('__all__');change(p,'pcs-month','08');p.setOutlets(['a','a','invalid']);assert.match(p.render('__all__'),/>1\.240 <small>PCS/);p.setOutlets(['b']);assert.match(p.render('__all__'),/>1\.860 <small>PCS/);mode(p,'retail');assert.match(p.render('__all__'),/>1\.674 <small>PCS/);p.setOutlets([]);assert.match(p.render('__all__'),/Pilih outlet di atas/);assert.ok(!p.render('__all__').includes('role="img"'));
});
test('missing source rows cannot turn a partial monthly sum into a reported total',async()=>{
 const p=await setup({gap:true});p.render('__all__');change(p,'pcs-month','08');let html=p.render('__all__');assert.match(html,/<strong>— <small>PCS/);assert.match(html,/2 Agustus<\/td><td>—<\/td>/);
 change(p,'pcs-month','all');html=p.render('__all__');assert.ok(!html.includes('data-pcs-point="Malmil Cheese · Total penjualan · Agustus'));assert.match(html,/Agustus<\/td><td>—<\/td>/);
});
test('available sheet orders render both estimated components instead of blanking every month',async()=>{
 const p=await setup({unmatched:true});p.render('__all__');change(p,'pcs-month','08');assert.match(p.render('__all__'),/>3\.100 <small>PCS/);
 mode(p,'retail');let html=p.render('__all__');assert.match(html,/>2\.790 <small>PCS/);assert.match(html,/Estimasi/);assert.match(html,/2 Agustus<\/td><td>45<\/td>/);
 mode(p,'orders');html=p.render('__all__');assert.match(html,/>310 <small>PCS/);assert.match(html,/2 Agustus<\/td><td>5<\/td>/);
 change(p,'pcs-month','all');html=p.render('__all__');assert.match(html,/Agustus<\/td><td>155<\/td>/);assert.match(html,/data-pcs-point="Malmil Cheese.*Pesanan.*Agustus/);
});
test('raw CS reference is clearly separated and never added to another sales mode',async()=>{
 const p=await setup({width:390,unmatched:true});p.render('__all__');change(p,'pcso-month','08');let html=p.orders('__all__');assert.match(html,/Rekap pesanan/);assert.match(html,/Sheet PESANAN/);assert.match(html,/>310 <small>PCS/);assert.ok(!html.includes('type="radio"'));assert.match(html,/viewBox="0 0 302 300"/);
 action(p,'none','orders');toggle(p,'pcso-product-11',true);html=p.orders('__all__');assert.match(html,/>155 <small>PCS/);
});
test('comparable modes share the same year, month and completed-day cutoff',async()=>{
 const p=await setup();p.render('__all__');change(p,'pcs-month','10');let html=p.render('__all__');assert.match(html,/>2\.000 <small>PCS/);assert.match(html,/Penjualan s.d. 20 Oktober/);assert.ok(!html.includes('21 Oktober</td>'));assert.match(html,/stroke-width="1.2"/);
 mode(p,'retail');assert.match(p.render('__all__'),/>1\.800 <small>PCS/);mode(p,'orders');assert.match(p.render('__all__'),/>200 <small>PCS/);mode(p,'sales');change(p,'pcs-year','2025');change(p,'pcs-month','08');assert.match(p.render('__all__'),/>3\.100 <small>PCS/);
});
