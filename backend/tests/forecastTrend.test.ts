import test from 'node:test';
import assert from 'node:assert/strict';
import {forecastTrend} from '../../frontend/src/utils/forecastTrend';
// Trend line borrowed from Behavior (>=5% AND >=100 baht, both directions), DECISIONS 3 Nov 2026.
test('trend needs both 5% and 100 baht, in either direction',()=>{
 assert.equal(forecastTrend('60.00','1000.00'),'flat');    // 6% but 60 baht
 assert.equal(forecastTrend('150.00','5000.00'),'flat');   // 150 baht but 3%
 assert.equal(forecastTrend('150.00','1000.00'),'up');     // 15% and 150 baht
 assert.equal(forecastTrend('-150.00','1000.00'),'down');  // falling, both lines met
 assert.equal(forecastTrend('100.00','2000.00'),'up');     // exactly 5% and 100 baht count
 assert.equal(forecastTrend('10.00','1081.00'),'flat');    // the +1.0% page example
 assert.equal(forecastTrend(null,'0'),null);
});
test('no previous spending: only the 100-baht line applies',()=>{
 assert.equal(forecastTrend('99.99','0'),'flat');
 assert.equal(forecastTrend('100.00','0'),'up');
});
