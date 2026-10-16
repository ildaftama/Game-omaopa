import test from 'node:test';
import assert from 'node:assert/strict';
import {previousJakartaDate,runDaily} from './esb-daily.mjs';

test('Jakarta midnight selects the completed local date, not the UTC date',()=>{
  assert.equal(previousJakartaDate(new Date('2026-10-16T16:59:59Z')),'2026-10-15');
  assert.equal(previousJakartaDate(new Date('2026-10-16T17:00:00Z')),'2026-10-16');
  assert.equal(previousJakartaDate(new Date('2026-10-16T18:23:00Z')),'2026-10-16');
});
test('month, year, leap boundaries and invalid time',()=>{
  assert.equal(previousJakartaDate(new Date('2026-12-31T17:00:00Z')),'2026-12-31');
  assert.equal(previousJakartaDate(new Date('2024-02-29T17:00:00Z')),'2024-02-29');
  assert.equal(previousJakartaDate(new Date('2026-02-28T17:00:00Z')),'2026-02-28');
  assert.throws(()=>previousJakartaDate(new Date('invalid')),/tidak valid/);
});
test('daily runner passes yesterday once and propagates failures',async()=>{
  const seen=[];
  const result=await runDaily({now:new Date('2026-10-16T17:00:00Z'),sync:async d=>{seen.push(d);return {date:d};}});
  assert.deepEqual(seen,['2026-10-16']);assert.deepEqual(result,{date:'2026-10-16'});
  await assert.rejects(runDaily({sync:async()=>{throw Error('Connection unavailable');}}),/Connection unavailable/);
});
