import test from 'node:test';import assert from 'node:assert/strict';import {splitObservedSales,confirmedOrders} from './orders-policy.mjs';
test('LK including orders is split once; factory scope and incomplete orders prevent subtraction',()=>{
 assert.equal(splitObservedSales({total:100,fulfilledOrders:30,ordersComplete:true,sameScope:true}).spontaneous,70);
 assert.equal(splitObservedSales({total:100,fulfilledOrders:30,ordersComplete:true,sameScope:false}).spontaneous,null);
 assert.equal(splitObservedSales({total:100,fulfilledOrders:130,ordersComplete:true,sameScope:true}).spontaneous,null);
 assert.equal(splitObservedSales({total:100,fulfilledOrders:0}).spontaneous,null);
 assert.equal(splitObservedSales({total:0,fulfilledOrders:0,ordersComplete:true,sameScope:true}).spontaneous,0);
});
test('future and cancelled bookings excluded; factory and unknown outlet remain separate',()=>{
 const base={id:'1',fulfilmentDate:'2026-10-04',confirmedAt:'2026-10-03T12:00:00+07:00',status:'confirmed',channel:'outlet',outletId:'nusa-indah',product:'Mini Cheese',quantity:9,unit:'pcs'};
 const orders=[base,{...base,id:'2',channel:'factory',outletId:null},{...base,id:'3',outletId:null},{...base,id:'4',confirmedAt:'2026-10-04T10:00:00+07:00'},{...base,id:'5',status:'cancelled'},{...base,id:'6',confirmedAt:null}];
 const r=confirmedOrders(orders,{date:'2026-10-04',cutoff:'2026-10-03T23:59:59+07:00',outletId:'nusa-indah'});assert.equal(r.outlet.length,1);assert.equal(r.factory.length,1);assert.equal(r.unallocated.length,2);
 assert.throws(()=>confirmedOrders([base,base],{date:'2026-10-04',cutoff:'2026-10-03T23:59:59+07:00'}),/duplikat/);
});
