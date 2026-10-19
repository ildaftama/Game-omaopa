import test from 'node:test';import assert from 'node:assert/strict';import {summarize}from './esb-net-sales.mjs';
test('reconciliation keeps package components separate and rejects wrong dates',()=>{
 const row={salesDate:'2025-01-01',branchName:'A',salesType:'Sales',rowType:'PACKAGE_HEADER',total:20000,discountTotal:2000,qty:1};
 const groups=summarize([row,{...row,rowType:'PACKAGE_DETAIL',total:7000}],'2025-01-01','A');
 assert.equal(groups.PACKAGE_HEADER.total,20000);assert.equal(groups.PACKAGE_DETAIL.total,7000);
 assert.throws(()=>summarize([row],'2025-01-02','A'));assert.throws(()=>summarize([{...row,total:null}],'2025-01-01','A'));
});
