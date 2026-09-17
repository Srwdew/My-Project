import { Prisma } from '@prisma/client';
import { z } from 'zod';
export const D = Prisma.Decimal;
export function bangkokToday(now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    return ['year', 'month', 'day'].map(k => parts.find(p => p.type === k)!.value).join('-');
}
export const dateKey = (date: Date) => date.toISOString().slice(0, 10);
export const dateSchema = z.string().regex(/^(?!0000)\d{4}-\d{2}-\d{2}$/).refine(s => { const d = new Date(s + 'T00:00:00Z'); return !isNaN(d.getTime()) && dateKey(d) === s; }, 'วันที่ไม่ถูกต้อง');
export const moneySchema = z.string().regex(/^\d{1,10}(\.\d{1,2})?$/).refine(s => new D(s).gt(0), 'จำนวนเงินต้องมากกว่า 0').transform(s => new D(s).toFixed(2));
export const openingMoneySchema = z.string().regex(/^\d{1,10}(\.\d{1,2})?$/).transform(s => new D(s).toFixed(2));
export const reasonSchema = z.string().trim().min(1).max(1000);
export const goalSchema = z.object({
    name: z.string().trim().min(1).max(120), targetAmount: moneySchema,
    targetDate: dateSchema.nullable().optional(), plannedMonthlyAmount: moneySchema.nullable().optional(),
    categoryKey: z.enum(['home', 'travel', 'education', 'emergency', 'other']), note: z.string().trim().max(1000).nullable().optional(),
}).strict();
export const sourceSchema = z.discriminatedUnion('type', [
    z.object({ type: z.literal('OPENING_BALANCE') }).strict(),
    z.object({ type: z.literal('INCOME_TRANSACTION'), transactionId: z.string().uuid() }).strict(),
]);
export type SourceInput = z.infer<typeof sourceSchema>;
export function calculateGoal(goal: {
    targetAmount: Prisma.Decimal.Value;
    targetDate: Date | null;
    plannedMonthlyAmount: Prisma.Decimal.Value | null;
}, savedInput: Prisma.Decimal.Value, today = bangkokToday()) {
    const target = new D(goal.targetAmount), saved = new D(savedInput);
    const remaining = D.max(target.minus(saved), 0), overfunded = D.max(saved.minus(target), 0);
    const deadline = goal.targetDate ? dateKey(goal.targetDate) : null;
    const months = deadline === null ? null : deadline < today ? 0 : (Number(deadline.slice(0, 4)) - Number(today.slice(0, 4))) * 12 + Number(deadline.slice(5, 7)) - Number(today.slice(5, 7)) + 1;
    const required = remaining.isZero() ? new D(0) : months && months > 0 ? remaining.div(months).toDecimalPlaces(2, D.ROUND_CEIL) : null;
    const percent = target.gt(0) ? saved.div(target).mul(100) : new D(0);
    const status = saved.gte(target) ? 'completed' : deadline !== null && deadline < today ? 'overdue' : saved.isZero() ? 'not_started' : 'active';
    const warnings: string[] = [];
    if (status === 'overdue')
        warnings.push('OVERDUE');
    if (required !== null && goal.plannedMonthlyAmount !== null && new D(goal.plannedMonthlyAmount).lt(required))
        warnings.push('PLAN_INSUFFICIENT');
    return { savedAmount: saved.toFixed(2), remainingAmount: remaining.toFixed(2), overfundedAmount: overfunded.toFixed(2), progressPercent: percent.toFixed(2), progressBarPercent: D.min(D.max(percent, 0), 100).toFixed(2), monthsRemaining: months, requiredMonthlyAmount: required?.toFixed(2) ?? null, calculatedStatus: status, warnings, asOfDate: today };
}
