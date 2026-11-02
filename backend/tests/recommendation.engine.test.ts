import test from 'node:test';
import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { cycleContextFromProfile, getCurrentCycle, previousCycle } from '../src/lib/cycle';
import { evaluate, toLogRow } from '../src/lib/recommendation/evaluate';
import { rank } from '../src/lib/recommendation/rank';
import { scoreResult } from '../src/lib/recommendation/score';
import { actualBaht, forecastBaht, render } from '../src/lib/recommendation/text';
import type { LogEntry, Rule, RuleContext, RuleId, RuleResult, Scored } from '../src/lib/recommendation/types';
const D = (v: number | string) => new Prisma.Decimal(v);
const cctx = cycleContextFromProfile('u', null);
const cycle = getCurrentCycle(cctx, '2026-11-15');
const prev1 = previousCycle(cctx, cycle), prev2 = previousCycle(cctx, prev1), prev3 = previousCycle(cctx, prev2), prev4 = previousCycle(cctx, prev3);
const keys = [cycle.key, prev1.key, prev2.key, prev3.key, prev4.key];
const ctx = (over: Partial<RuleContext> = {}): RuleContext => ({
    userId: 'u', today: '2026-11-15', cycle, previousCycles: [prev1, prev2, prev3],
    incomeThisCycle: D(20000), incomeSource: 'transactions', spendThisCycle: D(9000),
    readiness: { behavior: true, forecast: true, goals: true },
    behavior: null, dailyExpense: new Map(), priorWindows: [], lastCycleCashFlow: null, cashFlowBeforeLast: null, previousCycleByCategory: new Map(), forecast: null, goals: [], flexibleCategoryIds: new Set(['c-food', 'c-fun']),
    profile: { savingRateFloorPercent: D(10) }, ...over,
});
const result = (ruleId: RuleId, baht: number, items = 16, subject: string | null = null, forecastFactor: number | null = null): RuleResult => ({
    ruleId, ruleVersion: 1, subject, what: { n: 1 }, action: { n: 2 }, outcome: { n: 3 },
    outcomeValueBaht: D(baht), confidence: { itemCount: items, forecastFactor }, inputs: { threshold: 0.15 }, computed: { x: 1 },
});
const fake = (id: RuleId, sources: Rule['sources'], r: RuleResult | null): Rule => ({ id, version: 1, sources, evaluate: () => (r ? [r] : []) });
const scored = (r: RuleResult) => ({ ...r, score: scoreResult(r, D(20000), D(9000))! });

test('score = value × urgency × confidence, each 0–1', () => {
    const s = scoreResult(result('R1', 2000), D(20000), D(9000))!;
    assert.deepEqual([s.value, s.urgency, s.confidence, s.denominator], [0.1, 1, 1, 'income']);
    assert.equal(s.total, 0.1);
    assert.equal(scoreResult(result('R9', 2000), D(20000), D(9000))!.total, 0.1 * 0.1); // R9 lowest urgency
    assert.equal(scoreResult(result('R4', 50000), D(20000), D(9000))!.value, 1); // capped at 1
    assert.equal(scoreResult(result('R3', 2000, 8), D(20000), D(9000))!.confidence, 0.5); // 8 of 16 items
    assert.equal(scoreResult(result('R1', 2000, 16, null, 0.5), D(20000), D(9000))!.confidence, 0.5); // forecast factor stacks
    assert.equal(scoreResult(result('R3', 2000, 40), D(20000), D(9000))!.confidence, 1); // capped at 1
    // No income: divide by spending instead. Neither: no data, no score.
    const bySpend = scoreResult(result('R3', 900), D(0), D(9000))!;
    assert.deepEqual([bySpend.value, bySpend.denominator], [0.1, 'spend']);
    assert.equal(scoreResult(result('R1', 2000), D(0), D(0)), null);
});

test('evaluator skips rules whose upstream gate is closed and never calls them', () => {
    let called = 0;
    const spy: Rule = { id: 'R1', version: 1, sources: ['forecast'], evaluate: () => (called++, [result('R1', 1000)]) };
    const out = evaluate(ctx({ readiness: { behavior: true, forecast: false, goals: true } }), [spy, fake('R3', ['behavior'], result('R3', 500))]);
    assert.equal(called, 0);
    assert.deepEqual(out.skipped, [{ ruleId: 'R1', closedSources: ['forecast'] }]);
    assert.deepEqual(out.scored.map((s) => s.ruleId), ['R3']);
    const both = evaluate(ctx({ readiness: { behavior: true, forecast: true, goals: false } }), [fake('R7', ['goals', 'behavior'], result('R7', 1))]);
    assert.deepEqual(both.skipped, [{ ruleId: 'R7', closedSources: ['goals'] }]);
    assert.equal(evaluate(ctx(), [fake('R2', ['forecast'], null)]).scored.length, 0); // rule not triggered
    assert.equal(evaluate(ctx({ incomeThisCycle: D(0), incomeSource: 'none' }), [fake('R3', ['behavior'], result('R3', 500))]).scored[0]!.score.denominator, 'spend');
    assert.equal(evaluate(ctx({ incomeThisCycle: D(0), incomeSource: 'none', spendThisCycle: D(0) }), [fake('R3', ['behavior'], result('R3', 500))]).unscored.length, 1);
    assert.throws(() => evaluate(ctx(), [fake('R3', ['behavior'], result('R4', 500))]), /RULE_RESULT_MISMATCH/);
    const many: Rule = { id: 'R3', version: 1, sources: ['behavior'], evaluate: () => [result('R3', 500, 16, 'a'), result('R3', 600, 16, 'b')] };
    assert.deepEqual(evaluate(ctx(), [many]).scored.map((s) => s.subject), ['a', 'b']); // one result per subject
});

test('ranking: by score, R1 removes R2 and R5, top 3 shown and the rest kept for the full list', () => {
    const items = [result('R9', 9000), result('R2', 3000), result('R5', 2500), result('R3', 2000), result('R4', 6000), result('R6', 5000), result('R8', 1000)].map(scored);
    const noR1 = rank(items, [], keys);
    assert.deepEqual(noR1.shown.map((s) => s.ruleId), ['R2', 'R4', 'R5']);
    assert.deepEqual(noR1.more.map((s) => s.ruleId), ['R6', 'R3', 'R9', 'R8']);
    const withR1 = rank([...items, scored(result('R1', 500))], [], keys);
    assert.deepEqual(withR1.suppressed.map((s) => [s.item.ruleId, s.reason, s.by?.ruleId]), [['R2', 'covered_by', 'R1'], ['R5', 'covered_by', 'R1']]);
    assert.ok(!withR1.shown.concat(withR1.more).some((s) => s.ruleId === 'R2' || s.ruleId === 'R5'));
    // R9 surfaces when nothing else triggers.
    assert.deepEqual(rank([scored(result('R9', 100))], [], keys).shown.map((s) => s.ruleId), ['R9']);
});

test('overspend stories: R1 covers R2, R5, R8 current; R8 current covers R8 last; every combination', () => {
    const r1 = scored(result('R1', 1900)), r2 = scored(result('R2', 800)), r5 = scored(result('R5', 700, 16, 'food'));
    const now = scored(result('R8', 1500, 16, 'current')), last = scored(result('R8', 1200, 16, 'last')), r3 = scored(result('R3', 600, 16, 'food'));
    const left = (xs: Scored[]) => { const r = rank(xs, [], keys); return r.shown.concat(r.more).map((s) => s.ruleId + (s.subject ? ':' + s.subject : '')).sort(); };
    assert.deepEqual(left([r1, r2, r5, now, last, r3]), ['R1', 'R3:food']); // R8 last goes too: its trigger R8 current exists even though R1 hid it
    assert.deepEqual(left([now, last]), ['R8:current']);
    assert.deepEqual(left([r1, last]), ['R1', 'R8:last']); // R1 does not cover the finished month
    assert.deepEqual(left([r1, now]), ['R1']);
    assert.deepEqual(left([r2, r5, now, last]), ['R2', 'R5:food', 'R8:current']); // no R1: R2/R5 stay
    assert.deepEqual(left([last]), ['R8:last']);
    const reasons = rank([r1, now, last], [], keys).suppressed.map((s) => [s.item.subject, s.by?.ruleId, s.by?.subject]);
    assert.deepEqual(reasons, [['current', 'R1', undefined], ['last', 'R8', 'current']]);
});

test('advice worth under 100 baht is dropped for R2–R7, R9 but never for R1/R8', () => {
    const at = (id: RuleId, baht: string) => evaluate(ctx(), [{ id, version: 1, sources: [], evaluate: () => [{ ...result(id, 0), outcomeValueBaht: D(baht) }] }]);
    for (const id of ['R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R9'] as RuleId[]) {
        assert.equal(at(id, '99.99').belowMinimum.length, 1, id);
        assert.equal(at(id, '100').scored.length, 1, id);
    }
    for (const id of ['R1', 'R8'] as RuleId[]) assert.equal(at(id, '15').scored.length, 1, id);
    const row = toLogRow(ctx(), at('R3', '150').scored[0]!);
    assert.equal(row.inputs.minOutcomeBaht, '100');
    assert.equal(toLogRow(ctx(), at('R1', '15').scored[0]!).inputs.minOutcomeBaht, null);
});

test('one recommendation per subject: R3/R5/R7 on one category describe the same baht', () => {
    const r3 = scored(result('R3', 1800, 16, 'c-food')), r5 = scored(result('R5', 1000, 16, 'c-food')), r7 = scored(result('R7', 1800, 8, 'c-food'));
    const r9 = scored(result('R9', 600, 16, 'c-travel')), r2 = scored(result('R2', 500)), r1 = scored(result('R1', 400));
    const out = rank([r5, r7, r3, r9, r2, r1], [], keys);
    // food: R3 has the top score of the three (same baht as R7 but full confidence); R5 and R7 are kept, marked.
    assert.deepEqual(out.shown.map((s) => s.ruleId + ':' + s.subject), ['R3:c-food', 'R1:null', 'R9:c-travel']); // 0.054, 0.02, 0.018
    assert.deepEqual(out.more.map((s) => [s.ruleId, s.supersededBy]), [['R7', { ruleId: 'R3', subject: 'c-food' }]]);
    assert.ok(out.shown.every((s) => s.supersededBy === null));
    assert.deepEqual(out.suppressed.map((s) => s.item.ruleId), ['R5', 'R2']); // R1 covers these first
    // No subject (R1/R2) never collides.
    assert.deepEqual(rank([r2, scored(result('R2', 300))], [], keys).more.map((s) => s.supersededBy), []);
    // The subject is the categoryId, never the name: two categories called the same are two subjects.
    const twin = scored(result('R5', 900, 16, 'c-food-2'));
    assert.deepEqual(rank([r3, twin], [], keys).shown.length, 2);
});

test('no flexible flags: report which flag-dependent rules were silenced (for the step 6 invitation)', () => {
    const rules = (['R1', 'R7', 'R9', 'R3'] as RuleId[]).map((id) => fake(id, id === 'R7' ? ['goals'] : [], null));
    assert.deepEqual(evaluate(ctx({ flexibleCategoryIds: new Set() }), rules).silencedByNoFlags, ['R1', 'R7', 'R9']);
    assert.deepEqual(evaluate(ctx({ flexibleCategoryIds: new Set(), readiness: { behavior: true, forecast: true, goals: false } }), rules).silencedByNoFlags, ['R1', 'R9']); // R7's gate is closed anyway
    assert.deepEqual(evaluate(ctx(), rules).silencedByNoFlags, []);
});

test('dismissed in cycle c: gone for the rest of c, hidden c+1..c+3, back in c+4', () => {
    const item = [scored(result('R3', 2000, 16, 'c-food'))];
    const dismissedIn = (k: string): LogEntry[] => [{ ruleId: 'R3', cycleId: k, subject: 'c-food', userAction: 'dismissed' }];
    // Current cycle is c, c+1, c+2, c+3 when dismissed this cycle, or 1, 2, 3 cycles ago.
    for (const k of [cycle.key, prev1.key, prev2.key, prev3.key]) assert.equal(rank(item, dismissedIn(k), keys).suppressed[0]?.reason, 'dismissed_recently', k);
    assert.equal(rank(item, dismissedIn(prev4.key), keys).shown.length, 1); // dismissed 4 cycles ago: current is c+4
    assert.equal(rank(item, [{ ruleId: 'R3', cycleId: cycle.key, subject: 'c-fun', userAction: 'dismissed' }], keys).shown.length, 1); // other category
    assert.equal(rank(item, [{ ruleId: 'R5', cycleId: cycle.key, subject: 'c-food', userAction: 'dismissed' }], keys).shown.length, 1); // other rule
});

test('same rule + category shown 2 cycles in a row with no response is skipped', () => {
    const item = [scored(result('R3', 2000, 16, 'c-food'))];
    const shown = (k: string, userAction: LogEntry['userAction'] = null): LogEntry => ({ ruleId: 'R3', cycleId: k, subject: 'c-food', userAction });
    assert.equal(rank(item, [shown(prev1.key), shown(prev2.key)], keys).suppressed[0]?.reason, 'repeated_without_response');
    assert.equal(rank(item, [shown(prev1.key)], keys).shown.length, 1); // only once before
    assert.equal(rank(item, [shown(prev1.key), shown(prev3.key)], keys).shown.length, 1); // not consecutive
    assert.equal(rank(item, [shown(prev1.key, 'followed'), shown(prev2.key)], keys).shown.length, 1); // user responded
    assert.equal(rank(item, [shown(prev1.key), { ...shown(prev2.key), subject: 'c-fun' }], keys).shown.length, 1);
});

test('log row snapshots every shared input, so provenance never reads current values', () => {
    const c = ctx();
    const row = toLogRow(c, scored(result('R7', 1500, 16, 'c-food')));
    assert.deepEqual(row.inputs.flexibleCategoryIds, ['c-food', 'c-fun']);
    assert.equal(row.inputs.savingRateFloorPercent, '10');
    assert.equal(row.inputs.threshold, 0.15); // rule's own inputs kept
    assert.deepEqual([row.cycleId, row.citationTier, row.citationRef, row.ruleVersion], [cycle.key, 1, null, 1]);
    (c.flexibleCategoryIds as Set<string>).delete('c-fun'); // later change must not alter the row already built
    assert.deepEqual(row.inputs.flexibleCategoryIds, ['c-food', 'c-fun']);
    assert.equal(row.computed.subject, 'c-food');
});

test('text: forecast figures round to the hundred, past actuals stay exact, missing template is loud', () => {
    assert.equal(forecastBaht(D('1850')), '1,900');
    assert.equal(forecastBaht(D('1849.99')), '1,800');
    assert.equal(actualBaht(D('1200')), '1,200');
    assert.equal(actualBaht(D('1234.5')), '1,235'); // whole baht on screen only
    assert.equal(actualBaht(D('1234.49')), '1,234');
    const r = result('R3', 1);
    assert.deepEqual(render(r, { R3: (x) => ({ what: 'w' + x.what.n, action: 'a' + x.action.n, outcome: 'o' + x.outcome.n }) }), { what: 'w1', action: 'a2', outcome: 'o3' });
    assert.throws(() => render(r, {}), /NO_TEMPLATE:R3/);
    const s: Scored = scored(r);
    assert.equal(typeof s.score.total, 'number');
});
