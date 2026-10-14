import test from 'node:test';
import assert from 'node:assert/strict';
import {compareEvent,buildAnalysis,days,summarizePatterns} from './analyse-branches.mjs';
test('Missing is not zero; real zero is retained; fewer than two controls cannot imply a lift',()=>{
 const e={start:'2026-09-28',end:'2026-09-28'},s=new Map([['2026-09-28',0],['2026-09-21',100],['2026-09-14',100]]);
 assert.equal(compareEvent(s,e,new Set()).changePercent,-100);
 assert.equal(compareEvent(s,e,new Set(['2026-09-21'])).changePercent,null);
 assert.equal(compareEvent(new Map(),e,new Set()).changePercent,null);
});
test('An unrelated campus event cannot change another outlet baseline',()=>{
 const profiles={outlets:[{id:'a',name:'A'},{id:'b',name:'B'}]},raw={toDate:'2026-10-12',records:days('2026-06-15','2026-10-12').map(date=>({branch:'A',date,amount:date==='2026-09-21'?200:100}))};
 const main={id:'main',title:'Main',start:'2026-09-28',end:'2026-09-28',outletHints:['A'],region:'A'};
 const unrelated={id:'other',title:'Other',start:'2026-09-21',end:'2026-09-21',outletHints:['B'],region:'B'};
 const a=buildAnalysis(raw,profiles,[main]).periods[3].events[0].results[0];
 const b=buildAnalysis(raw,profiles,[main,unrelated]).periods[3].events[0].results[0];
 assert.equal(a.changePercent,-20);assert.deepEqual(a,b);
});
test('Repeated conclusion requires three positive, stable, non-overlapping observations',()=>{
 const outlets=[{id:'a',name:'A'}],events=[1,2,3].map(n=>({id:'e'+n,start:'2026-09-0'+n,title:'Graduation',family:'graduation',scope:'outlet-terkait',results:[{id:'a',changePercent:n*10,medianBaselineChange:n*9,overlaps:[]}]}));
 assert.equal(summarizePatterns(events,outlets)[0].level,'repeated');
 assert.equal(summarizePatterns(events,outlets)[0].medianChange,20);
 assert.equal(summarizePatterns(events.slice(0,2),outlets)[0].level,'early');
 events[2].results[0].medianBaselineChange=-1;assert.equal(summarizePatterns(events,outlets)[0].level,'early');
 events[2].results[0].medianBaselineChange=5;events[2].results[0].overlaps=['Other'];assert.equal(summarizePatterns(events,outlets)[0].level,'early');
});
test('Multi-day event requires every event day and weights expected sales',()=>{
 const s=new Map([['2026-09-28',200],['2026-09-29',300],['2026-09-21',100],['2026-09-14',100],['2026-09-22',300],['2026-09-15',300]]);
 assert.equal(compareEvent(s,{start:'2026-09-28',end:'2026-09-29'},new Set()).changePercent,25);
 s.delete('2026-09-29');assert.equal(compareEvent(s,{start:'2026-09-28',end:'2026-09-29'},new Set()).changePercent,null);
});
test('Unknown names never silently map to an outlet; duplicate rows fail',()=>{
 const p={outlets:[{id:'a',name:'A'},{id:'b',name:'B'}]},raw={toDate:'2026-10-12',records:[{branch:'Unknown',date:'2026-10-12',amount:999}]};
 const a=buildAnalysis(raw,p,[]);assert.equal(a.periods[3].outletCount,0);assert.equal(a.periods[3].outlets[0].index,null);assert.equal(a.periods[3].pairedTrafficDays,0);
 assert.deepEqual(a.unmatchedBranches,['Unknown']);raw.records.push(raw.records[0]);assert.throws(()=>buildAnalysis(raw,p,[]),/Duplicate/);
});
test('Public summary excludes raw amounts, short-lived outlets, and unrelated outlet event results',()=>{
 const p={outlets:[{id:'a',name:'A'},{id:'b',name:'B'}]},raw={toDate:'2026-10-12',records:days('2026-06-15','2026-10-12').map(date=>({branch:'A',date,amount:date==='2026-09-28'?200:100}))};
 raw.records.push({branch:'B',date:'2026-10-12',amount:999});
 const a=buildAnalysis(raw,p,[{id:'event',title:'Event',start:'2026-09-28',end:'2026-09-28',outletHints:['A'],region:'test'}]);
 assert.equal(a.periods[3].outletCount,1);assert.equal(a.periods[3].outlets.find(x=>x.id==='b').category,'unavailable');
 assert.equal(a.periods[3].events[0].results[0].changePercent,100);assert.equal(a.periods[3].events[0].results.length,1);
 assert.equal(JSON.stringify(a).includes('"amount"'),false);assert.equal(JSON.stringify(a).includes('"expected"'),false);
 assert.equal(a.periods[3].from,'2026-07-13');assert.equal(a.periods[1].requestedDays,30);
});
