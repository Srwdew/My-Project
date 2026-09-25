import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
const D = Prisma.Decimal.clone({ precision: 40 });
export const ANOMALY_RULE = Object.freeze({ algorithm: 'expense-screen-v1', baselineEligibility: 'current-revision-review-v1', windowDays: 180, amountMin: 30, amountDays: 10, amountSpan: 28, timeMin: 60, timeDays: 20, timeSpan: 42, timeCoverage: '0.80', bucketMinutes: 240, neighborhoodMinutes: 120, rareFrequency: '0.05', zScale: '0.6745', zThreshold: '3.5', zHigh: '5', iqrMultiplier: '3', minimumDifference: '100', medianDifferenceRatio: '0.5', comparison: 'strict', quartile: 'median-halves-exclude-center', baseline: 'prior-dates-only', time: 'confirmed-bangkok-wall-clock' });
export const RULE_VERSION = ANOMALY_RULE.algorithm + '-' + createHash('sha256').update(JSON.stringify(ANOMALY_RULE)).digest('hex').slice(0,24);
export type Baseline = { n: number; days: number; span: number; median: string | null; mad: string | null; q1: string | null; q3: string | null; min: string | null; max: string | null; timeN: number; timeDays: number; timeSpan: number; bucketCount: number; nearbyCount: number };
export type Dimension = { status: 'not_evaluated' | 'not_flagged' | 'flagged'; reasonCode: string; high?: boolean };
const result = (status: Dimension['status'], reasonCode: string, high = false): Dimension => ({status,reasonCode,high});
export function screenExpense(amount: string, confirmedTime: boolean, b: Baseline) {
 const r=ANOMALY_RULE; let money: Dimension;
 if(b.n<r.amountMin || b.days<r.amountDays || b.span<r.amountSpan || b.median===null) money=result('not_evaluated','amount_insufficient_history');
 else {
  const x=new D(amount),m=new D(b.median),mad=new D(b.mad!),iqr=new D(b.q3!).minus(b.q1!),diff=x.minus(m),floor=D.max(r.minimumDifference,m.mul(r.medianDifferenceRatio));
  if(mad.gt(0)){const score=diff.mul(r.zScale);const flagged=score.gt(mad.mul(r.zThreshold))&&diff.gt(floor);money=result(flagged?'flagged':'not_flagged','amount_modified_z',flagged&&score.gt(mad.mul(r.zHigh)));}
  else if(iqr.gt(0)){money=result(x.gt(new D(b.q3!).plus(iqr.mul(r.iqrMultiplier)))&&diff.gt(floor)?'flagged':'not_flagged','amount_iqr');}
  else if(new D(b.min!).eq(b.max!)){money=result(x.gt(m)&&diff.gt(floor)?'flagged':'not_flagged','amount_zero_dispersion');}
  else money=result('not_evaluated','amount_zero_iqr_nonconstant');
 }
 let time: Dimension;
 if(!confirmedTime) time=result('not_evaluated','time_not_confirmed');
 else if(b.timeN<r.timeMin||b.timeDays<r.timeDays||b.timeSpan<r.timeSpan||new D(b.timeN).lt(new D(b.n).mul(r.timeCoverage))) time=result('not_evaluated','time_insufficient_history');
 else time=result(new D(b.bucketCount).lt(new D(b.timeN).mul(r.rareFrequency))&&new D(b.nearbyCount).lt(new D(b.timeN).mul(r.rareFrequency))?'flagged':'not_flagged','time_rare_frequency');
 const flags=[money,time].filter(x=>x.status==='flagged').length;
 return { amount:money,time,outcome:flags?'flagged':money.status==='not_evaluated'&&time.status==='not_evaluated'?'not_evaluated':'not_flagged',level:flags?(flags===2||money.high?'review_priority':'review'):null };
}