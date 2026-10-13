import test from 'node:test';import assert from 'node:assert/strict';import {backfill,range} from './esb-backfill.mjs';
test('Backfill retains successful dates and retries can safely revisit deterministic daily documents',async()=>{
 const saved=[];await assert.rejects(backfill('2026-07-13','2026-07-15',{},async date=>{if(date==='2026-07-14')throw Error('service failed');saved.push(date);}),/belum berhasil/);
 assert.deepEqual(saved,['2026-07-13','2026-07-15']);const result=await backfill('2026-07-14','2026-07-14',{},async date=>saved.push(date));assert.equal(result.saved,1);
});
test('Bounds prevent accidental long or invalid pulls',()=>{assert.equal(range('2026-07-13','2026-10-12').length,92);assert.throws(()=>range('2026-07-01','2026-10-12'),/93/);assert.throws(()=>range('2026-02-30','2026-03-01'),/tidak valid/);});
