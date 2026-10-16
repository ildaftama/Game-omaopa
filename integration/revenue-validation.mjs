// Retrospective study only. Never read target-day revenue to construct a forecast.
const shift=(d,n)=>new Date(Date.parse(d+'T00:00:00Z')+n*864e5).toISOString().slice(0,10);
const median=xs=>{const a=xs.slice().sort((a,b)=>a-b);return(a[Math.floor((a.length-1)/2)]+a[Math.ceil((a.length-1)/2)])/2;};
const mean=xs=>xs.reduce((a,b)=>a+b,0)/xs.length;
export const METHODS=['weekday-median-4','weekday-mean-4','weekday-median-8','weekday-weighted-4','blend-25','blend-50','weekday-trend','weekday-median-4-event-controls','weekday-median-4-event-lift'];
export function makeSeries(records){
 const s=new Map();for(const r of records){if(!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||!Number.isFinite(r.amount)||r.amount<0)throw Error('Invalid revenue record');if(s.has(r.date))throw Error('Duplicate revenue date');s.set(r.date,r.amount);}return s;
}
const localEvents=(events,outlet)=>events.filter(e=>e.outletHints?.includes(outlet));
const active=(e,d)=>e.start<=d&&e.end>=d;
function priorWeekdays(series,target,weeks=4,excluded=[]){const a=[];for(let w=1;w<=weeks;w++){const d=shift(target,-7*w);if(series.has(d)&&!excluded.some(e=>active(e,d)))a.push({date:d,value:series.get(d),week:w});}return a;}
function eventLift(series,events,outlet,target){
 const local=localEvents(events,outlet),current=local.filter(e=>active(e,target)&&e.family);
 // Simultaneous events cannot support an isolated multiplier.
 if(current.length!==1||local.filter(e=>active(e,target)).length!==1)return {factor:1,observations:0};
 const event=current[0],past=local.filter(e=>e.family===event.family&&e.end<target),lifts=[];
 for(const e of past){
  if(local.some(x=>x.id!==e.id&&x.start<=e.end&&x.end>=e.start))continue;
  let actual=0,expected=0,complete=true;
  for(let d=e.start;d<=e.end;d=shift(d,1)){
   const controls=priorWeekdays(series,d,4,local.filter(x=>x.end<d));
   if(!series.has(d)||controls.length<3){complete=false;break;}
   const base=median(controls.map(x=>x.value));if(base<=0){complete=false;break;}
   actual+=series.get(d);expected+=base;
  }
  if(complete&&expected>0)lifts.push(actual/expected-1);
 }
 // Require two distinct completed events, shrink to zero, cap any adjustment at 30%.
 return {factor:lifts.length>=2?1+Math.max(-.3,Math.min(.3,median(lifts)*lifts.length/(lifts.length+2))):1,observations:lifts.length};
}
export function forecastRevenue(series,target,method,{events=[],outlet=''}={}){
 if(!METHODS.includes(method))throw Error('Unknown revenue method');
 const prior=priorWeekdays(series,target);if(prior.length<3)return null;
 const base=median(prior.map(x=>x.value));let prediction=base;
 if(method==='weekday-mean-4')prediction=mean(prior.map(x=>x.value));
 if(method==='weekday-median-8'){const p=priorWeekdays(series,target,8);if(p.length>=4)prediction=median(p.map(x=>x.value));}
 if(method==='weekday-weighted-4'){const weights=prior.map(p=>5-p.week);prediction=prior.reduce((s,p,i)=>s+p.value*weights[i],0)/weights.reduce((s,v)=>s+v,0);}
 const recent=Array.from({length:7},(_,i)=>series.get(shift(target,-i-1))).filter(x=>x!==undefined);
 if(method==='blend-25'&&recent.length>=5)prediction=.75*base+.25*mean(recent);
 if(method==='blend-50'&&recent.length>=5)prediction=.5*base+.5*mean(recent);
 if(method==='weekday-trend'&&recent.length>=5){const previous=Array.from({length:21},(_,i)=>series.get(shift(target,-i-8))).filter(x=>x!==undefined);if(previous.length>=15&&mean(previous)>0)prediction=base*Math.max(.8,Math.min(1.2,mean(recent)/mean(previous)));}
 let observations=0;
 if(method.startsWith('weekday-median-4-event-')){
  const local=localEvents(events,outlet),clean=priorWeekdays(series,target,4,local.filter(e=>e.end<target));
  if(clean.length>=3)prediction=median(clean.map(x=>x.value));
  if(method.endsWith('event-lift')){const lift=eventLift(series,events,outlet,target);prediction*=lift.factor;observations=lift.observations;}
 }
 return {prediction:Math.max(0,Math.round(prediction)),eventObservations:observations};
}
export function errors(pairs){
 const actual=pairs.reduce((s,p)=>s+p.actual,0),absolute=pairs.reduce((s,p)=>s+Math.abs(p.prediction-p.actual),0),signed=pairs.reduce((s,p)=>s+p.prediction-p.actual,0);
 return {pairs:pairs.length,wape:actual>0?100*absolute/actual:null,bias:actual>0?100*signed/actual:null,within3Percent:pairs.filter(p=>p.actual>0&&Math.abs(p.prediction-p.actual)/p.actual<=.03).length};
}
export function study(groups,events,protocol){
 const pairs=[];
 for(const g of groups){const series=makeSeries(g.records);for(const [date,actual]of series){if(date<protocol.selectionFrom||date>protocol.holdoutTo)continue;const values=Object.fromEntries(METHODS.map(m=>[m,forecastRevenue(series,date,m,{events,outlet:g.name})]));if(Object.values(values).some(v=>v===null))continue;pairs.push({id:g.id,name:g.name,date,actual,predictions:Object.fromEntries(Object.entries(values).map(([k,v])=>[k,v.prediction])),eventObservations:values['weekday-median-4-event-lift'].eventObservations});}}
 const metrics=(selected,network=false)=>Object.fromEntries(METHODS.map(method=>{let rows=selected.map(p=>({...p,prediction:p.predictions[method]}));if(network){const days=new Map();for(const p of rows){if(!days.has(p.date))days.set(p.date,[]);days.get(p.date).push(p);}rows=[...days].filter(([,ps])=>ps.length===groups.length&&new Set(ps.map(p=>p.id)).size===groups.length).map(([date,ps])=>({date,actual:ps.reduce((s,p)=>s+p.actual,0),prediction:ps.reduce((s,p)=>s+p.prediction,0)}));}return[method,errors(rows)];}));
 const selection=pairs.filter(p=>p.date<=protocol.selectionTo),holdout=pairs.filter(p=>p.date>=protocol.holdoutFrom);
 const result={selection:{outlet:metrics(selection),network:metrics(selection,true)},holdout:{outlet:metrics(holdout),network:metrics(holdout,true)}};
 // Exploratory backfilled calendars are excluded from the production method contest.
 const eligible=METHODS.filter(m=>!m.includes('-event-'));
 const best=objective=>eligible.slice().sort((a,b)=>result.selection[objective][a].wape-result.selection[objective][b].wape)[0];
 result.chosen={outlet:best('outlet'),network:best('network')};
 result.outlets=groups.map(g=>{const ps=holdout.filter(p=>p.id===g.id);return{id:g.id,name:g.name,baseline:errors(ps.map(p=>({...p,prediction:p.predictions[METHODS[0]]}))),chosen:errors(ps.map(p=>({...p,prediction:p.predictions[result.chosen.outlet]})))};});
 result.eventDates=holdout.filter(p=>localEvents(events,p.name).some(e=>active(e,p.date))).map(p=>({id:p.id,date:p.date,eventIds:localEvents(events,p.name).filter(e=>active(e,p.date)).map(e=>e.id),priorEvents:p.eventObservations,baselineError:p.actual>0?100*(p.predictions[METHODS[0]]/p.actual-1):null,eventError:p.actual>0?100*(p.predictions['weekday-median-4-event-lift']/p.actual-1):null}));
 return {summary:result,pairs};
}
