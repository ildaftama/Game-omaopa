'use strict';
(function(root){
 const math=typeof module!=='undefined'&&module.exports?require('./pcs-math.js'):root.PcsMath;
 const names=['Ogura Cheese','Ogura Choco','Malmil Cheese','Malmil Choco','Mini Cheese','Mini Choco','Mini Durian','Chiffon Classic Keju','Chiffon Classic Ekstra Keju','Chiffon Butter','Lite Ekstra Keju','Lite Keju'];
 const integer=n=>Number.isSafeInteger(n)&&n>=0&&n<=10000;
 const day=s=>new Date(s+'T12:00:00Z');
 const shift=(s,n)=>{const d=day(s);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
 const quantile=(a,p)=>{const b=[...a].sort((x,y)=>x-y),i=(b.length-1)*p,l=Math.floor(i);return b.length?b[l]+(b[Math.ceil(i)]-b[l])*(i-l):null;};
 const total=a=>a.reduce((s,n)=>s+n,0);
 const indices=new WeakMap();
 function scoped(source,id,from,to){if(!source)return {days:[]};let index=indices.get(source);if(!index){index=new Map();for(const r of source.days||[]){if(!index.has(r.id))index.set(r.id,[]);index.get(r.id).push(r);}indices.set(source,index);}return {...source,days:(index.get(id)||[]).filter(r=>r.date>=from&&r.date<=to)};}
 function recommend(sales,orders,id,target){
  const snapshot=root.ForecastStudy?.recommendations;
  if(snapshot){const i=snapshot.ids.indexOf(id),qty=snapshot.dates[target]?.[i];return names.map((name,p)=>{const central=qty?.[p]??null,delta=central===null?null:Math.max(1,Math.ceil(central*snapshot.tolerance));return {name,central,low:central===null?null:Math.max(0,central-delta),high:central===null?null:central+delta,samples:0,through:snapshot.through,estimated:true,method:snapshot.method,tolerance:true,uncertainty80Pcs:snapshot.validationAbsolute80Pcs[p]};});}

  sales=scoped(sales,id,shift(target,-112),shift(target,-1));orders=scoped(orders,id,shift(target,-112),shift(target,-1));
  const from=shift(target,-56),dates=[...new Set((sales?.days||[]).filter(r=>r.id===id&&r.date>=from&&r.date<target).map(r=>r.date))].sort();
  return names.map((name,p)=>{
   const rows=math.estimatedPartition(sales,orders,[id],p,dates).map(r=>r.retail).filter(r=>r.complete);
   const same=rows.filter(r=>day(r.date).getUTCDay()===day(target).getUTCDay());
   const selected=same.length>=3?same:rows.slice(-14),values=selected.map(r=>r.value);
   if(!values.length)return {name,low:null,high:null,central:null,samples:0,through:null,estimated:true};
   const recent=rows.filter(r=>r.date>=shift(target,-14)).map(r=>r.value),prior=rows.filter(r=>r.date<shift(target,-14)&&r.date>=shift(target,-28)).map(r=>r.value);
   const a=quantile(recent,.5),b=quantile(prior,.5),trend=a!==null&&b>0?Math.max(.85,Math.min(1.15,a/b)):1;
   const central=Math.round(quantile(values,.5)*trend),low=Math.max(0,Math.floor(Math.min(central,quantile(values,.2)*trend))),high=Math.max(central,Math.ceil(quantile(values,.8)*trend));
   return {name,low,high,central,samples:values.length,through:rows.at(-1).date,estimated:selected.some(r=>r.estimated),fallback:same.length<3};
  });
 }
 function prices(source,id,target){
  const refs={4:57000/9,5:57000/9,6:57000/9,7:33000,8:34000,9:34000,10:19000,11:18000};
  const keys=['Ogura Cheese','Ogura Chocolate','Malmil Cheese','Malmil Chocolate'];
  return names.map((name,p)=>{const observed=source?.outlets?.[id]?.[keys[p]];
   if(p<4&&observed?.price>0&&source.through<target)return {value:observed.price,method:'observed',period:source.period,through:source.through,stale:shift(source.through,45)<target};
   return p in refs?{value:refs[p],method:'reference',period:'Harga acuan',through:null,stale:false}:{value:null,method:'missing',period:'Belum tersedia',through:null,stale:false};
  });
 }
 function calculate(draft,recs,valuation){
  const rows=names.map((name,p)=>{const active=draft.active[p],a=draft.regular[p],b=draft.orders[p],regular=a===''?null:Number(a),orders=b===''?null:Number(b),valid=!active||(integer(regular)&&integer(orders)),r=recs[p];
   return {p,name,active,valid,regular:active?regular:0,orders:active?orders:0,total:valid&&active?regular+orders:0,warning:active&&integer(regular)&&r?.low!=null?(regular<r.low?'low':regular>r.high?'high':null):null};
  });
  const active=rows.filter(r=>r.active),complete=active.length>0&&active.every(r=>r.valid),priced=active.every(r=>Number.isFinite(valuation[r.p]?.value)&&valuation[r.p].value>0);
  return {rows,complete,regular:complete?total(rows.map(r=>r.regular)):null,orders:complete?total(rows.map(r=>r.orders)):null,pcs:complete?total(rows.map(r=>r.total)):null,revenue:complete&&priced?total(rows.map(r=>r.active?r.total*valuation[r.p].value:0)):null,warnings:rows.filter(r=>r.warning).length};
 }
 function compare(record,sales,orders){
  sales=scoped(sales,record.outlet,shift(record.date,-56),record.date);orders=scoped(orders,record.outlet,shift(record.date,-56),record.date);
  const plan=record.baseline,first=record.firstSavedAt?.toDate?record.firstSavedAt.toDate():new Date(record.firstSavedAt),eligible=Number.isFinite(+first)&&first<new Date(record.date+'T00:00:00+07:00');
  // Inactive variants are zero forecasts, not permission to omit their actual sales.
  const rows=names.map((name,p)=>{const r=math.estimatedPartition(sales,orders,[record.outlet],p,[record.date])[0];return{p,name,planned:plan.active[p]?plan.regular[p]:0,actual:r.retail.value,totalActual:r.total.value,estimated:r.retail.estimated,complete:r.retail.complete};});
  const complete=rows.length>0&&rows.every(r=>r.complete),actual=complete?total(rows.map(r=>r.actual)):null,planned=total(rows.map(r=>r.planned)),absolute=complete?total(rows.map(r=>Math.abs(r.planned-r.actual))):null;
  return {rows,eligible,complete,actual,planned,absolute,wape:eligible&&complete&&actual>0?absolute/actual*100:null};
 }
 function validPlan(p){return p&&/^\d{4}-\d{2}-\d{2}$/.test(p.date)&&typeof p.outlet==='string'&&Array.isArray(p.active)&&p.active.length===12&&p.active.every(v=>typeof v==='boolean')&&['regular','orders'].every(k=>Array.isArray(p[k])&&p[k].length===12&&p[k].every(integer))&&Array.isArray(p.prices)&&p.prices.length===12&&p.prices.every(v=>v&&(v.value===null||(Number.isFinite(v.value)&&v.value>0)))&&typeof p.note==='string';}
 const api={names,integer,shift,quantile,recommend,prices,calculate,compare,validPlan};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ForecastPlanner=api;
})(typeof window!=='undefined'?window:this);
