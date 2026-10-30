export function bangkokDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  return ['year', 'month', 'day'].map(k => parts.find(p => p.type === k)!.value).join('-');
}
// Format check only; whether a month is in the future is decided by the backend.
export function validDashboardMonth(month: string) { return /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(month); }
export function moneyText(amount: string) {
  if (!/^-?\d+\.\d{2}$/.test(amount)) return '—';
  const negative = amount.startsWith('-'); const [integer, fraction] = amount.replace(/^-/, '').split('.');
  return (negative ? '-' : '') + BigInt(integer!).toLocaleString('th-TH') + '.' + fraction;
}
export type DailyAmount = { date: string; transactionCount: number; incomeAmount: string; expenseAmount: string };
