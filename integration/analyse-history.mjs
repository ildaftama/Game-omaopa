import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const dayMs=86400000;
export function days(from,to){const result=[];for(let t=Date.parse(from+'T00:00:00Z');t<=Date.parse(to+'T00:00:00Z');t+=dayMs)result.push(new Date(t).toISOString().slice(0,10));return result;}
const shifted=(d,n)=>new Date(Date.parse(d+'T00:00:00Z')+n*dayMs).toISOString().slice(0,10);
const round=x=>Math.round(x*10)/10;
export function analyse(history,events){
  const records=history.records.filter(r=>r.metric==='netSales'&&r.scope==='all-outlets-ledger');
  const byDate=new Map();for(const r of records){if(byDate.has(r.date)||!Number.isFinite(r.amount)||r.amount<0)throw Error('Invalid or duplicate daily sales.');byDate.set(r.date,r);}
  const eventDays=new Set([...events.flatMap(e=>days(e.start,e.end)),...(history.comparisonExcludeDates||[])]);
  const compare=date=>{const actual=byDate.get(date);const controls=[1,2,3,4].map(n=>shifted(date,-7*n)).filter(d=>!eventDays.has(d)&&byDate.has(d));if(!actual||controls.length<2)return {date,changePct:null,comparisonDays:controls.length};const normal=controls.reduce((s,d)=>s+byDate.get(d).amount,0)/controls.length;if(normal<=0)return {date,changePct:null,comparisonDays:controls.length};return {date,changePct:round((actual.amount/normal-1)*100),comparisonDays:controls.length,normal};};
  const summaries=events.map(e=>{const dates=days(e.start,e.end),pairs=dates.map(compare),complete=pairs.every(p=>p.changePct!==null);const actual=complete?dates.reduce((s,d)=>s+byDate.get(d).amount,0):null;const normal=complete?pairs.reduce((s,p)=>s+p.normal,0):null;return {...e,changePct:complete?round((actual/normal-1)*100):null,availableDays:dates.filter(d=>byDate.has(d)).length,totalDays:dates.length,comparisonDays: [...new Set(dates.flatMap(d=>[1,2,3,4].map(n=>shifted(d,-7*n)).filter(x=>!eventDays.has(x)&&byDate.has(x))))].length,daily:pairs.map(({date,changePct,comparisonDays})=>({date,changePct,comparisonDays})),trafficStatus:'unavailable',scope:'all-outlets-ledger'};});
  const requested=days(history.from,history.to),available=requested.filter(d=>byDate.has(d));
  const mean=available.reduce((s,d)=>s+byDate.get(d).amount,0)/available.length;
  return {schemaVersion:1,updatedAt:'2026-10-13',from:history.from,to:history.to,sourceLabel:'Laporan keuangan harian outlet 2026',scope:'all-outlets-ledger',coverage:{salesDays:available.length,requestedDays:requested.length,branchSalesDays:0,trafficDays:0,missingDates:requested.filter(d=>!byDate.has(d))},method:'same-weekday-prior-4-weeks-excluding-known-event-days-minimum-2',events:summaries,trend:available.map(date=>({date,index:round(byDate.get(date).amount/mean*100)}))};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const [input,eventsPath,output]=process.argv.slice(2);if(!input||!eventsPath||!output)throw Error('Provide private history, events and public summary paths.');
  const history=JSON.parse(await readFile(input,'utf8')),events=JSON.parse(await readFile(eventsPath,'utf8')).events;
  const summary=analyse(history,events);await writeFile(output,'window.ANALYSIS_DATA='+JSON.stringify(summary)+';\n');
  console.log('Summary created: '+summary.coverage.salesDays+' sales days, '+summary.events.length+' events. No raw amounts exported.');
}
