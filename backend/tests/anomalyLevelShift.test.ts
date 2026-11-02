import test from 'node:test';import assert from 'node:assert/strict';
import {newShift,blocked,type ShiftState} from '../src/lib/anomalyLevelShift';
import type {Direction} from '../src/lib/anomalyRules';

// Results one per day from 2026-03-01; dirs oldest first.
const results=(dirs:(Direction|null)[],from='2026-03-01')=>dirs.map((direction,i)=>({date:new Date(Date.parse(from+'T00:00:00Z')+i*864e5).toISOString().slice(0,10),direction}));
const shift=(status:ShiftState['status'],actedOn:string|null,direction:Direction='up'):ShiftState=>({id:status+actedOn,direction,startDate:'2026-01-01',status,actionId:actedOn,actedOn});
const up='up' as const,no=null;
const five=[no,no,up,up,up,up,up];

test('first shift opens with the start at the first matching day in the window',()=>{
 assert.deepEqual(newShift(results(five),[])?.startDate,'2026-03-03');
 assert.equal(newShift(results([no,no,no,up,up,up,up]),[]),null,'4 of 7');
});
test('a waiting shift in the same direction blocks a second one',()=>{
 assert.equal(newShift(results(five),[shift('pending',null)]),null);
 assert.equal(newShift(results(five),[shift('pending',null,'down')])?.direction,'up','other direction does not block');
});
test('after one rejection only results dated after it count',()=>{
 assert.equal(newShift(results(five),[shift('rejected','2026-03-07')]),null,'all results on or before the rejection');
 // Needs a full window of 7 fresh results: 6 after the rejection are not enough.
 assert.equal(newShift(results([...five,no,up,up,up,up,up]),[shift('rejected','2026-03-07')]),null,'only 6 fresh results');
 const later=results([...five,no,up,up,up,up,up,up]);
 assert.equal(newShift(later,[shift('rejected','2026-03-07')])?.startDate,'2026-03-09');
});
test('two rejections in a row stop asking; reopening lifts it',()=>{
 const later=results([...five,no,up,up,up,up,up,up]);
 assert.equal(blocked([shift('rejected','2026-02-01'),shift('rejected','2026-02-10')]),true);
 assert.equal(newShift(later,[shift('rejected','2026-02-01'),shift('rejected','2026-02-10')]),null,'blocked even with fresh results');
 assert.equal(blocked([shift('rejected','2026-02-01'),shift('confirmed','2026-02-10')]),false,'not in a row');
 assert.equal(newShift(later,[shift('rejected','2026-02-01'),shift('reopened','2026-03-07')])?.startDate,'2026-03-09','reopened: counts from the reopen day');
 assert.equal(blocked([shift('rejected','2026-02-01'),shift('rejected','2026-02-10')].map(s=>({...s,direction:'down' as const}))),true,'same rule downwards');
});
