import { addDays, isMonday, type WeeklyResponse } from './weeklyExpenses';

const baht = (v: number) => v.toLocaleString('th-TH', { maximumFractionDigits: 2 });
const cents = (v: number) => Math.round(v * 100);

export const mondayRange = (today: string) => (isMonday(today) ? { startDate: addDays(today, -14), endDate: addDays(today, -1) } : null);

/** Last week's facts from /overview/weekly. No card without entries, no comparison with an empty week, no named top category on a tie. */
export function mondaySummary(data: Pick<WeeklyResponse, 'weeks'>, today: string) {
  const last = data.weeks.find((w) => w.startDate === addDays(today, -7));
  if (!last?.transactionCount) return null;
  const previous = data.weeks.find((w) => w.startDate === addDays(today, -14));
  const diff = previous?.transactionCount ? cents(last.totalExpense) - cents(previous.totalExpense) : null;
  const sorted = [...last.categories].sort((a, b) => b.amount - a.amount);
  const top = sorted[0] && cents(sorted[0].amount) !== cents(sorted[1]?.amount ?? -1) ? sorted[0] : null;
  return {
    total: `ใช้ไป ${baht(last.totalExpense)} บาท จาก ${last.transactionCount} รายการ`,
    comparison: diff === null ? null : diff === 0 ? 'เท่ากับสัปดาห์ก่อน' : `${diff > 0 ? 'มากกว่า' : 'น้อยกว่า'}สัปดาห์ก่อน ${baht(Math.abs(diff) / 100)} บาท`,
    top: top ? `ใช้กับ${top.name}มากที่สุด ${baht(top.amount)} บาท` : null,
  };
}
