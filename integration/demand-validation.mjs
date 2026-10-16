// Forecasts and method selection must never see the target day or later.
const shift=(d,n)=>new Date(Date.parse(d+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
const median=a=>{a=a.slice().sort((x,y)=>x-y);return(a[Math.floor((a.length-1)/2)]+a[Math.ceil((a.length-1)/2)])/2;};
export function candidateDays(records){
 const map=new Map();
 for(const r of records){if(map.has(r.date))throw Error('Duplicate date');if(!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||new Date(r.date+'T00:00:00Z').toISOString().slice(0,10)!==r.date||!Number.isFinite(r.quantity)||r.quantity<0)throw Error('Invalid demand record');map.set(r.date,r.quantity);}
 return [...map].sort(([a],[b])=>a.localeCompare(b)).flatMap(([date,actual])=>{
  const history=[1,2,3,4].map(w=>map.get(shift(date,-7*w))).filter(x=>x!==undefined),previous=map.get(shift(date,-7));
  return history.length>=3&&previous!==undefined?[{date,actual,median:Math.round(median(history)),previous}]:[];
 });
}
export function chooseMethod(days,target){
 const recent=days.filter(d=>d.date<target&&d.date>=shift(target,-28));
 // Two complete weekly cycles of comparable outcomes before any switch.
 if(recent.length<14)return{method:'median',selectionDays:recent.length};
 const error=key=>recent.reduce((s,d)=>s+Math.abs(d[key]-d.actual),0);
 const baseline=error('median'),challenger=error('previous');
 return{method:baseline>0&&challenger<baseline*.95?'previous':'median',selectionDays:recent.length};
}
export function evaluateSeries(records){
 const days=candidateDays(records),pairs=days.map(d=>{const s=chooseMethod(days,d.date);return{...d,method:s.method,selectionDays:s.selectionDays,prediction:d[s.method]};});
 const total=pairs.reduce((s,d)=>s+d.actual,0),metrics=key=>({wape:total>0?100*pairs.reduce((s,d)=>s+Math.abs(d[key]-d.actual),0)/total:null,bias:total>0?100*pairs.reduce((s,d)=>s+d[key]-d.actual,0)/total:null});
 return{days:pairs.length,median:metrics('median'),previous:metrics('previous'),adaptive:metrics('prediction'),switchedDays:pairs.filter(d=>d.method==='previous').length,pairs};
}
export function selectPlan(records,target){
 const earlier=records.filter(r=>r.date<target),selection=chooseMethod(candidateDays(earlier),target),previous=earlier.find(r=>r.date===shift(target,-7));
 return{...selection,method:selection.method==='previous'&&previous?'previous':'median',previous:previous?.quantity??null};
}
export function aggregateValidation(groups){
 const totals={pcs:{pairs:0,actual:0,median:0,previous:0,adaptive:0,switched:0},boks:{pairs:0,actual:0,median:0,previous:0,adaptive:0,switched:0}};
 for(const g of groups){const t=totals[g.unit];if(!t)continue;for(const p of g.validation.pairs){t.pairs++;t.actual+=p.actual;t.median+=Math.abs(p.median-p.actual);t.previous+=Math.abs(p.previous-p.actual);t.adaptive+=Math.abs(p.prediction-p.actual);t.switched+=Number(p.method==='previous');}}
 return Object.fromEntries(Object.entries(totals).map(([unit,t])=>[unit,{pairs:t.pairs,switched:t.switched,medianWape:t.actual>0?100*t.median/t.actual:null,previousWape:t.actual>0?100*t.previous/t.actual:null,adaptiveWape:t.actual>0?100*t.adaptive/t.actual:null}]));
}
