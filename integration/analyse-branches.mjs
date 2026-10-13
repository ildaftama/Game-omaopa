import fs from 'node:fs';
import vm from 'node:vm';
import {pathToFileURL} from 'node:url';
const DAY=86400000;
export const days=(a,b)=>{const out=[];for(let t=Date.parse(a+'T00:00:00Z');t<=Date.parse(b+'T00:00:00Z');t+=DAY)out.push(new Date(t).toISOString().slice(0,10));return out;};
export function quantile(values,p){if(!values.length)return null;const s=values.slice().sort((a,b)=>a-b),i=(s.length-1)*p,a=Math.floor(i);return s[a]+(s[Math.ceil(i)]-s[a])*(i-a);}
export function compareEvent(series,event,excluded){
 let actual=0,expected=0;const matched=[],controls=new Set();
 const requested=days(event.start,event.end);
 for(const day of requested){
  if(!series.has(day))continue;
  const pool=[];
  for(let week=1;week<=4;week++){const d=new Date(Date.parse(day+'T00:00:00Z')-week*7*DAY).toISOString().slice(0,10);if(series.has(d)&&!excluded.has(d)){pool.push(series.get(d));controls.add(d);}}
  if(pool.length<2)continue;
  const baseline=pool.reduce((a,b)=>a+b,0)/pool.length;
  if(baseline<=0)continue;
  actual+=series.get(day);expected+=baseline;matched.push(day);
 }
 return {changePercent:matched.length===requested.length&&expected>0?Math.round((actual/expected-1)*1000)/10:null,matchedDays:matched.length,eventDays:requested.length,controlDays:controls.size,comparisonDates:[...controls].sort()};
}
export function buildAnalysis(raw,profiles,events,aliases={}){
 const byName=new Map(profiles.outlets.map(o=>[o.name.toLowerCase().replace(/\s/g,''),o.id]));
 const names={...Object.fromEntries(byName),...aliases};
 const grouped=new Map(),seen=new Set(),unmatched=new Set();
 for(const r of raw.records){
  const key=r.branch+'|'+r.date;if(seen.has(key))throw Error('Duplicate branch/date');seen.add(key);
  if(!Number.isFinite(r.amount))throw Error('Invalid amount');
  const id=names[r.branch.toLowerCase().replace(/\s/g,'')];if(!id){unmatched.add(r.branch);continue;}
  if(!grouped.has(id))grouped.set(id,new Map());const series=grouped.get(id);if(series.has(r.date))throw Error('Alias collision');series.set(r.date,r.amount);
 }
 const excluded=new Set(events.flatMap(e=>days(e.start,e.end)));
 // A known UII graduation before the displayed window is also removed from controls.
 ['2026-06-27','2026-06-28'].forEach(d=>excluded.add(d));
 const end=raw.toDate,periods={};
 for(const months of [1,2,3]){
  const startDate=new Date(end+'T00:00:00Z');startDate.setUTCMonth(startDate.getUTCMonth()-months);startDate.setUTCDate(startDate.getUTCDate()+1);const start=startDate.toISOString().slice(0,10),dates=days(start,end);
  const means=new Map();
  for(const [id,series] of grouped){const vals=dates.filter(d=>series.has(d)).map(d=>series.get(d));if(vals.length/dates.length>=.9)means.set(id,vals.reduce((a,b)=>a+b,0)/vals.length);}
  const values=[...means.values()],q1=quantile(values,.25),q3=quantile(values,.75),mean=values.reduce((a,b)=>a+b,0)/values.length;
  const periodEvents=events.filter(e=>e.start>=start&&e.end<=end).map(e=>{
   const ids=e.outletHints.length?profiles.outlets.filter(o=>e.outletHints.includes(o.name)).map(o=>o.id):e.region==='DIY'?profiles.outlets.filter(o=>['godean','umy','jakal-uii','nusa-indah','tajem'].includes(o.id)).map(o=>o.id):[];
   return {...e,outletIds:ids,scope:e.outletHints.length?'outlet-terkait':'agenda-wilayah',results:ids.map(id=>({id,...compareEvent(grouped.get(id)||new Map(),e,excluded)}))};
  });
  const outlets=profiles.outlets.map(o=>{const series=grouped.get(o.id)||new Map(),available=dates.filter(d=>series.has(d)),m=means.get(o.id);return {id:o.id,name:o.name,days:available.length,missingDates:dates.filter(d=>!series.has(d)),category:m===undefined?'unavailable':values.every(x=>x===values[0])?'middle':m>=q3?'high':m<=q1?'low':'middle',index:m===undefined||mean<=0?null:Math.round(m/mean*100),events:periodEvents.filter(e=>e.outletIds.includes(o.id)).map(e=>({eventId:e.id,...e.results.find(r=>r.id===o.id)}))};}).sort((a,b)=>(b.index??-1)-(a.index??-1));
  periods[months]={from:start,to:end,requestedDays:dates.length,outletCount:means.size,pairedTrafficDays:0,outlets,events:periodEvents};
 }
 return {schemaVersion:2,updatedAt:'2026-10-13',metric:raw.metric,source:raw.source,sourceUrl:raw.sourceUrl,importedRecords:raw.records.length,unmatchedBranches:[...unmatched].sort(),periods};
}
function browserData(file,key){const c={window:{}};vm.runInNewContext(fs.readFileSync(file,'utf8'),c);return c.window[key];}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const root=new URL('../',import.meta.url),raw=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
 const profiles=browserData(new URL('forecast/traffic-baseline-data.js',root),'TRAFFIC_BASELINE_DATA');
 const events=JSON.parse(fs.readFileSync(new URL('integration/historical-events.json',root),'utf8')).events;
 const aliases={chiffongajahraya:'gajah-raya',merbabuklaten:'merbabu',rajawaliklaten:'rajawali',muhammadiyahsurakarta:'ums',muntilan:'muntilann'};
 const extra=process.argv[3]?JSON.parse(fs.readFileSync(process.argv[3],'utf8')):{};
 const result=buildAnalysis(raw,profiles,events,{...aliases,...extra});
 fs.writeFileSync(new URL('forecast/analysis-data.js',root),'window.ANALYSIS_DATA = '+JSON.stringify(result)+';\n');
 console.log(JSON.stringify({outlets:result.periods[3].outletCount,events:result.periods[3].events.length,unmatched:result.unmatchedBranches,top:result.periods[3].outlets.slice(0,3).map(o=>({name:o.name,index:o.index})),wisuda:result.periods[3].events.filter(e=>e.title.includes('Wisuda')).map(e=>({title:e.title,results:e.results.map(r=>({id:r.id,changePercent:r.changePercent}))}))}));
}
