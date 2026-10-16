export function splitObservedSales({total,fulfilledOrders,ordersComplete=false,sameScope=false}){
 if(!ordersComplete||!sameScope)return{spontaneous:null,reason:'Pesanan belum lengkap atau cakupannya berbeda.'};
 if(![total,fulfilledOrders].every(v=>Number.isFinite(v)&&v>=0)||fulfilledOrders>total)return{spontaneous:null,reason:'Jumlah pesanan dan penjualan perlu dicocokkan.'};
 return{spontaneous:total-fulfilledOrders,reason:null};
}
// Only orders already confirmed at the decision cutoff may influence a forecast.
// Factory orders never become outlet orders through an inferred allocation.
export function confirmedOrders(orders,{date,cutoff,outletId=null}={}){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||!Number.isFinite(Date.parse(cutoff)))throw Error('Tanggal atau batas keputusan tidak valid.');
 const result={outlet:[],factory:[],unallocated:[]},seen=new Set();
 for(const o of orders){
  if(!o.id||seen.has(o.id))throw Error('Pesanan duplikat atau tanpa identitas.');seen.add(o.id);
  if(o.fulfilmentDate!==date||o.status!=='confirmed')continue;
  if(!Number.isFinite(Date.parse(o.confirmedAt))) {result.unallocated.push({...o,reason:'Waktu konfirmasi belum tersedia'});continue;}
  if(Date.parse(o.confirmedAt)>Date.parse(cutoff))continue;
  if(!o.product||!Number.isInteger(o.quantity)||o.quantity<0||o.unit!=='pcs')throw Error('Jumlah atau satuan pesanan tidak valid.');
  if(o.channel==='factory'){result.factory.push(o);continue;}
  if(o.channel!=='outlet'||!o.outletId){result.unallocated.push({...o,reason:'Outlet belum diketahui'});continue;}
  if(!outletId||o.outletId===outletId)result.outlet.push(o);
 }
 return result;
}
