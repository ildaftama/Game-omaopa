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
  group(rows,key){const map=new Map();for(const r of rows){const k=key(r),g=map.get(k)||{date:k,value:null,valid:0,expected:0,complete:true,reasons:{}};if(r.value!==null)g.value=(g.value??0)+r.value;g.valid+=r.valid;g.expected+=r.expected;g.complete=g.complete&&r.complete;map.set(k,g);}return [...map.values()];},
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
