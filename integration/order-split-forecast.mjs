import {baseline,median} from './forecast-evaluation.mjs';
const shift=(date,n)=>new Date(Date.parse(date+'T00:00:00Z')+n*864e5).toISOString().slice(0,10);
const valid=q=>Number.isFinite(q)&&q>=0;
const percentile=(values,p)=>{const a=values.toSorted((a,b)=>a-b),i=(a.length-1)*p;return a[Math.floor(i)]+(a[Math.ceil(i)]-a[Math.floor(i)])*(i%1);};

// getOrders returns null for ambiguous quantities, dates or destinations. Absence
// is zero only on a day covered by the explicitly declared order register.
export function orderSplitForecast(records,target,{id,product,getOrders,asOf=target,weeks=4}={}){
 const ordinary=baseline(records,target),fallback=reason=>({...ordinary,method:'median-same-weekday',orderSplit:false,orderSplitReason:reason});
 const cutoff=target<shift(asOf,1)?target:shift(asOf,1);
 const booked=getOrders(id,target,product,cutoff);
 if(!valid(booked))return fallback('target-orders-unresolved');
 const rows=new Map(records.filter(r=>r.date<target).map(r=>[r.date,r.quantity])),history=[];
 for(let w=1;w<=weeks;w++){
  const date=shift(target,-7*w),sold=rows.get(date),orders=getOrders(id,date,product);
  if(valid(sold)&&valid(orders)&&orders<=sold)history.push(sold-orders);
 }
 if(history.length<3)return fallback('walk-in-history-insufficient');
 return {date:target,samples:history.length,central:Math.round(median(history))+booked,low:Math.floor(percentile(history,.25))+booked,high:Math.ceil(percentile(history,.75))+booked,method:'orders-split-4',orderSplit:true,knownOrders:booked,walkIn:Math.round(median(history))};
}
