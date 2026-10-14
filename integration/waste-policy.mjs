export function wastePeriodComplete(periodEnd,asOf,graceDays=3){
 const end=Date.parse(periodEnd+'T00:00:00Z'),now=Date.parse(asOf+'T00:00:00Z');
 if(!Number.isFinite(end)||!Number.isFinite(now)||graceDays<0)throw Error('Invalid waste cutoff');
 return now-end>=graceDays*86400000;
}
export function resolveWaste(value,date,asOf){
 if(value!==null&&value!==undefined&&value!=='')return Number.isFinite(Number(value))?Number(value):null;
 return wastePeriodComplete(date,asOf)?0:null;
}
