'use strict';
// Shared browser / Node quantity join. Missing data never becomes a zero sale.
(function(root){
 const core={
  pure(sales,orders,ids,product,dates){
   const products=[...new Set(Array.isArray(product)?product:[product])];
   const sold=new Map((sales?.days||[]).map(r=>[r.date+'|'+r.id,r])),pre=new Map((orders?.days||[]).map(r=>[r.date+'|'+r.id,r])),covered=new Set(orders?.coveredDates||[]),blocked=new Set(orders?.blockedDates||[]);
   return dates.map(date=>{let value=0,valid=0,reasons={};
    for(const id of ids){const k=date+'|'+id,s=sold.get(k),o=pre.get(k),qs=products.map(p=>o?o.qty[p]:0);let reason=null;
     if(!s?.complete||products.some(p=>!Number.isSafeInteger(s.qty?.[p])||s.qty[p]<0))reason='sales';
     else if(!covered.has(date)||blocked.has(date)||qs.some(q=>!Number.isSafeInteger(q)||q<0))reason='orders';
     // Destination is not proof that CS units were registered in this outlet's POS.
     // Positive orders need independently reconciled POS quantities, including an explicit zero.
     const included=products.map((p,i)=>qs[i]===0?0:o?.esbMatchedQty?.[p]);
     if(!reason&&included.some((q,i)=>!Number.isSafeInteger(q)||q<0||q>qs[i]))reason='reconciliation';
     if(!reason&&products.some((p,i)=>included[i]>s.qty[p]))reason='mismatch';
     if(!reason&&products.some(p=>p>=4&&p<=6&&(s.mappingVersion||1)<2))reason='mapping';
     if(reason)reasons[reason]=(reasons[reason]||0)+1;else{value+=products.reduce((sum,p,i)=>sum+s.qty[p]-included[i],0);valid++;}
    }
    return {date,value:valid?value:null,valid,expected:ids.length,complete:valid===ids.length,reasons};
   });
  },
  sold(sales,ids,product,dates){
   const pre=new Map((sales?.days||[]).map(r=>[r.date+'|'+r.id,r]));
   return dates.map(date=>{let value=0,valid=0;for(const id of ids){const r=pre.get(date+'|'+id),q=r?.qty?.[product];if(r?.complete&&Number.isSafeInteger(q)&&q>=0&&(!(product>=4&&product<=6)||(r.mappingVersion||1)>=2)){value+=q;valid++;}}return{date,value:valid?value:null,valid,expected:ids.length,complete:valid===ids.length};});
  },
  partition(sales,orders,ids,product,dates){
   const total=this.sold(sales,ids,product,dates),retail=this.pure(sales,orders,ids,product,dates);
   return dates.map((date,i)=>{
    const t=total[i],r=retail[i],complete=t.complete&&r.complete;
    // Both components use the same date/outlet/product population as the total.
    // Sheet orders not proven to be in this POS population cannot be forced into it.
    return {date,total:{...t,value:t.complete?t.value:null},retail:{...r,value:complete?r.value:null,complete},orders:{...r,value:complete?t.value-r.value:null,complete}};
   });
  },
  estimatedPartition(sales,orders,ids,product,dates){
   const sold=new Map((sales?.days||[]).map(r=>[r.date+'|'+r.id,r])),pre=new Map((orders?.days||[]).map(r=>[r.date+'|'+r.id,r])),covered=new Set(orders?.coveredDates||[]),blocked=new Set(orders?.blockedDates||[]),history=new Map();
   const integer=q=>Number.isSafeInteger(q)&&q>=0;
   for(const s of sales?.days||[]){
    const q=pre.get(s.date+'|'+s.id)?.qty?.[product],total=s.qty?.[product];
    if(s.complete&&covered.has(s.date)&&!blocked.has(s.date)&&integer(q)&&q>0&&integer(total)&&total>0&&q<=total){const a=history.get(s.id)||[];a.push({date:s.date,ratio:q/total});history.set(s.id,a);}
   }
   function previousShare(id,date){
    const since=new Date(date+'T00:00:00Z');since.setUTCDate(since.getUTCDate()-56);
    // Prior dates only: no future sales/order information enters a historical estimate.
    const a=(history.get(id)||[]).filter(r=>r.date<date&&r.date>=since.toISOString().slice(0,10)).map(r=>r.ratio).sort((a,b)=>a-b);
    return a.length?(a[Math.floor((a.length-1)/2)]+a[Math.floor(a.length/2)])/2:null;
   }
   return dates.map(date=>{
    let total=0,ordered=0,valid=0,estimated=false;const methods={confirmed:0,sheet:0,capped:0,history:0,knownOnly:0},reasons={};
    for(const id of ids){
     const s=sold.get(date+'|'+id),o=pre.get(date+'|'+id),n=s?.qty?.[product];
     if(!s?.complete||!integer(n)||(product>=4&&product<=6&&(s.mappingVersion||1)<2)){reasons.sales=(reasons.sales||0)+1;continue;}
     const known=integer(o?.knownQty?.[product])?o.knownQty[product]:0,q=covered.has(date)&&!blocked.has(date)?(o?o.qty?.[product]:0):null,matched=o?.esbMatchedQty?.[product];let candidate,method;
     if(integer(q)&&integer(matched)&&matched<=q&&matched<=n){candidate=matched;method='confirmed';}
     else if(integer(q)){candidate=q;method=q===0?'confirmed':'sheet';}
     else{const share=previousShare(id,date);candidate=Math.max(known,share===null?known:Math.round(n*share));method=share===null?'knownOnly':'history';}
     // This is an explicitly estimated POS allocation, never a change to the CS source.
     if(candidate>n){candidate=n;method='capped';}
     methods[method]++;estimated=estimated||method!=='confirmed';total+=n;ordered+=candidate;valid++;
    }
    const complete=valid===ids.length,base={date,valid,expected:ids.length,complete,reasons};
    return {date,methods,total:{...base,value:complete?total:null},orders:{...base,value:complete?ordered:null,estimated,methods},retail:{...base,value:complete?total-ordered:null,estimated,methods}};
   });
  },
  group(rows,key){const map=new Map();for(const r of rows){const k=key(r),g=map.get(k)||{date:k,value:null,valid:0,expected:0,complete:true,reasons:{}};if(r.value!==null)g.value=(g.value??0)+r.value;g.valid+=r.valid;g.expected+=r.expected;g.complete=g.complete&&r.complete;if(r.estimated)g.estimated=true;map.set(k,g);}return [...map.values()];},
  ordered(orders,ids,product,dates){
   const pre=new Map((orders?.days||[]).map(r=>[r.date+'|'+r.id,r])),covered=new Set(orders?.coveredDates||[]),blocked=new Set(orders?.blockedDates||[]);
   return dates.map(date=>{let value=0,valid=0,known=false;
    if(!covered.has(date))return{date,value:null,valid:0,expected:ids.length,complete:false};
    for(const id of ids){const row=pre.get(date+'|'+id),q=row?row.qty[product]:0;
     if(Number.isSafeInteger(q)&&q>=0){value+=q;valid++;known=true;}
     else if(Number.isSafeInteger(row?.knownQty?.[product])&&row.knownQty[product]>0){value+=row.knownQty[product];known=true;}
    }
    return{date,value:known?value:null,valid,expected:ids.length,complete:valid===ids.length&&!blocked.has(date)};
   });
  },
  change(current,previous){return current?.complete&&previous?.complete&&previous.value>0?(current.value-previous.value)/previous.value*100:null;}
 };
 if(typeof module!=='undefined'&&module.exports)module.exports=core;else root.PcsMath=core;
})(typeof window!=='undefined'?window:this);
