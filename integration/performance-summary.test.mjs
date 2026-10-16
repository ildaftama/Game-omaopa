import test from 'node:test';import assert from 'node:assert/strict';import {estimateLostSales,performanceSummary} from './performance-summary.mjs';
test('monthly duration includes final date even if merged header is trimmed',()=>{
 const row=['A'];for(let d=0;d<30;d++)row[10+d*10]=d===29?90:0;
 const result=performanceSummary({values:[[],['','A','September',10,1,0,0,10,100,10],['','A','Agustus',20,1,0,0,10,100,10]]},{september:{values:[[],[],[],row]},august:{values:[]}},{outlets:{a:{name:'A',hasProfile:true}}});
 const p=result.outlets.a.periods['2026-09'];assert.equal(p.lossObservedDays,30);assert.equal(p.stockoutDays,1);assert.equal(p.stockoutMinutes,90);assert.equal(p.estimatedLostSalesPercent,.4);
 row[300]='';const incomplete=performanceSummary({values:[[],['','A','September',10,1,0,0,10,100,10]]},{september:{values:[[],[],[],row]},august:{values:[]}},{outlets:{a:{name:'A',hasProfile:true}}});assert.equal(incomplete.outlets.a.periods['2026-09'].estimatedLostSalesPercent,null);
 assert.equal(estimateLostSales(720,30),3.3);assert.equal(estimateLostSales(null,30),null);
});
