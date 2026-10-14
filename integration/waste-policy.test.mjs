import test from 'node:test';import assert from 'node:assert/strict';
import {resolveWaste,wastePeriodComplete} from './waste-policy.mjs';
test('Empty waste becomes zero only when H+3 has elapsed',()=>{
 assert.equal(resolveWaste(null,'2026-10-12','2026-10-14'),null);
 assert.equal(resolveWaste(null,'2026-10-11','2026-10-14'),0);
 assert.equal(resolveWaste(4,'2026-10-13','2026-10-14'),4);
 assert.equal(resolveWaste(0,'2026-10-13','2026-10-14'),0);
 assert.equal(wastePeriodComplete('2026-09-30','2026-10-14'),true);
 assert.equal(wastePeriodComplete('2026-10-31','2026-10-14'),false);
});
