import test from 'node:test';import assert from 'node:assert/strict';import {buildPrices,cakeFamily} from './lk-esb-prices.mjs';
test('only cake sales count; packaging, topping and package components do not duplicate cakes',()=>{
 assert.equal(cakeFamily({salesType:'Sales',rowType:'PACKAGE_HEADER',menuName:'Ogura Cheese'}),'ogura');
 assert.equal(cakeFamily({salesType:'Sales',rowType:'ALACARTE',menuName:'Paket Oleh-Oleh Ogura Choco'}),'ogura');
 assert.equal(cakeFamily({salesType:'Sales',rowType:'ALACARTE',menuName:'Paket Cemal-Cemil Malmil Cheese'}),'malmil');
 for(const r of [{salesType:'Void',menuName:'Ogura Cheese'},{salesType:'Sales',menuName:'PE Ogura'},{salesType:'Sales',menuName:'Mini Ogura - Cheese'},{salesType:'Sales',menuName:'Ogura Cheese',rowType:'PACKAGE_COMPONENT'}])assert.equal(cakeFamily(r),null);
});
test('price divides LK family revenue by complete ESB family quantity, ignoring ESB revenue',()=>{
 const profiles={outlets:{a:{name:'A',hasProfile:true}}},lk=[{outlet:'A',url:'private',values:[['Period','2026'],['Month','September'],['Branch','A'],['4 1 01 06','Ogura',0,3000000],['4 1 01 07','Malmil',0,1200000]]}];
 const days=Array.from({length:30},(_,i)=>({date:'2026-09-'+String(i+1).padStart(2,'0'),complete:true,expected:2,branch:{branchName:'A'},rows:[{salesType:'Sales',rowType:'PACKAGE_HEADER',menuName:'Ogura Cheese',qty:2,total:1},{salesType:'Sales',rowType:'ALACARTE',menuName:'Malmil Choco',qty:2,total:9999999}]}));
 for(const d of days)for(const r of d.rows){r.salesDate=d.date;r.branchName='A';}
 const p=buildPrices(lk,days,profiles).public.outlets.a;assert.equal(p['Ogura Cheese'].price,50000);assert.equal(p['Ogura Chocolate'].price,50000);assert.equal(p['Malmil Cheese'].price,20000);
 assert.equal(Object.keys(buildPrices(lk,days.slice(1),profiles).public.outlets.a).length,0);
 const wrong=structuredClone(lk);wrong[0].values[1][1]='Agustus';assert.throws(()=>buildPrices(wrong,days,profiles),/mismatch/);
});
