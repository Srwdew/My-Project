export function bangkokDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  return ['year', 'month', 'day'].map(k => parts.find(p => p.type === k)!.value).join('-');
}
export function validDashboardMonth(month: string, today = bangkokDate()) { return /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(month) && month <= today.slice(0, 7); }
export function shiftMonth(month: string, step: number) { const d = new Date(month + '-01T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + step); return d.toISOString().slice(0, 7); }
export function moneyText(amount: string) {
  if (!/^-?\d+\.\d{2}$/.test(amount)) return '—';
  const negative = amount.startsWith('-'); const [integer, fraction] = amount.replace(/^-/, '').split('.');
  return (negative ? '-' : '') + BigInt(integer!).toLocaleString('th-TH') + '.' + fraction;
}
export type DailyAmount = { date: string; transactionCount: number; incomeAmount: string; expenseAmount: string };
export function calendarDays(month: string, asOfDate: string, daily: DailyAmount[]) {
  const d = new Date(month + '-01T00:00:00Z'), result = []; const data = new Map(daily.map(row => [row.date, row]));
  while (d.toISOString().slice(0, 7) === month) {
    const date = d.toISOString().slice(0, 10), row = data.get(date);
    result.push({ date, state: date > asOfDate ? 'future' : row ? 'recorded' : 'unrecorded', row });
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return result;
}