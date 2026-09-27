import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';

export const D = Prisma.Decimal.clone({ precision: 40, rounding: Prisma.Decimal.ROUND_HALF_UP });
export const BEHAVIOR_RULE = Object.freeze({
  algorithm: 'behavior-v1', minimumCount: 30, minimumSpan: 30, maximumDays: 366,
  categoryCount: 5, categoryDays: 3, timeCount: 30, timeCoverage: '0.80',
  bucketHours: 4, bucketShare: '0.50', bucketDays: 5, recurrenceDays: 3,
  recurrenceLimit: 50, findingPreview: 3, today: 'excluded', span: 'inclusive-first-last',
  comparison: 'preceding-equal-days-both-ready', recurrence: 'exact-weekly-or-consecutive-months-same-day-or-month-end',
  weekday: 'amount-per-calendar-occurrence', missing: 'no-record-not-confirmed-zero',
  category: 'left-join-unknown', rounding: 'half-up-display-only',
});
export const BEHAVIOR_VERSION = BEHAVIOR_RULE.algorithm + '-' + createHash('sha256').update(JSON.stringify(BEHAVIOR_RULE)).digest('hex').slice(0, 24);
export const money = (value: Prisma.Decimal.Value) => new D(value).toFixed(2);
export const total = (values: Prisma.Decimal.Value[]) => values.reduce<Prisma.Decimal>((s,v) => s.plus(v), new D(0));
export const shiftDay = (day: string, amount: number) => {
  const date = new Date(day + 'T00:00:00Z'); date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0,10);
};
export const dayCount = (start: string, end: string) => Math.round((Date.parse(end+'T00:00:00Z')-Date.parse(start+'T00:00:00Z'))/86400000)+1;
export class BehaviorInputError extends Error {}
export function behaviorPeriod(query: Record<string, unknown>, asOfDate: string) {
  if (Object.keys(query).some(k => !['startDate','endDate','categoryId'].includes(k))) throw new BehaviorInputError('รับเฉพาะ startDate, endDate และ categoryId');
  const validDate = (v: unknown): v is string => typeof v === 'string' && /^(?!0000)\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v+'T00:00:00Z')) && new Date(v+'T00:00:00Z').toISOString().slice(0,10) === v;
  const yesterday = shiftDay(asOfDate,-1);
  const start = query.startDate === undefined && query.endDate === undefined ? shiftDay(yesterday,-29) : query.startDate;
  const end = query.startDate === undefined && query.endDate === undefined ? yesterday : query.endDate;
  if (!validDate(start) || !validDate(end) || start > end || end > yesterday) throw new BehaviorInputError('กรุณาเลือกวันที่จริง โดยวันสิ้นสุดไม่เกินเมื่อวานตาม Asia/Bangkok');
  const days = dayCount(start,end);
  if (days > BEHAVIOR_RULE.maximumDays) throw new BehaviorInputError('เลือกช่วงไม่เกิน 366 วัน');
  const previousStart = shiftDay(start,-days);
  if (!validDate(previousStart)) throw new BehaviorInputError('ช่วงก่อนหน้าอยู่นอกขอบเขตวันที่รองรับ');
  const categoryId = query.categoryId;
  if (categoryId !== undefined && (typeof categoryId !== 'string' || !(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(categoryId) || categoryId === 'uncategorized'))) throw new BehaviorInputError('หมวดไม่ถูกต้อง');
  return { current: { startDate:start, endDate:end }, previous: { startDate:previousStart, endDate:shiftDay(start,-1) }, days, categoryId:categoryId ?? null };
}
export type Period = ReturnType<typeof behaviorPeriod>;
export type BehaviorRow = { categoryId:string|null; categoryName:string; date:string; bucket:number; count:number; amount:string };
export type Recurrence = { categoryId:string|null; categoryName:string; amount:string; dates:string[]; counts:number[] };
export function recurrenceKind(dates: string[], counts: number[]) {
  if (dates.length < BEHAVIOR_RULE.recurrenceDays || counts.length !== dates.length || counts.some(n=>n!==1)) return null;
  const sorted = [...dates].sort();
  if (new Set(sorted).size !== sorted.length) return null;
  if (sorted.slice(1).every((d,i)=>dayCount(sorted[i]!,d)===8)) return 'weekly' as const;
  const monthIndex = (d:string)=>Number(d.slice(0,4))*12+Number(d.slice(5,7));
  const consecutive = sorted.slice(1).every((d,i)=>monthIndex(d)-monthIndex(sorted[i]!)===1);
  const sameDay = sorted.every(d=>d.slice(8)===sorted[0]!.slice(8));
  const monthEnd = sorted.every(d=>shiftDay(d,1).slice(5,7)!==d.slice(5,7));
  return consecutive&&(sameDay||monthEnd) ? 'monthly' as const : null;
}
