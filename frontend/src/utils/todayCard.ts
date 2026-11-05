// Wording only: every figure comes from the API (Tier 0 pace, forecast readiness, /behavior readiness).
export type Pace = { daysLeft: number; spent: string; cycleBudget: string | null; budgetLeft: string | null; overBudget: string | null; perDay: string | null; paceGap: string | null };
export type TodayInput = { pace: Pace; recordedExpenseToday: string; paceNoticeMinimum: string; forecastReadiness: { transactionCount: number } };
export type Tone = 'ok' | 'info' | 'warn' | 'bad';
export type TodayCard = { tone: Tone; status: string; text: string; action: string; to: string; recordedNote: boolean };

const ADD = '/transactions/add', BUDGET = '/budget';
const baht = (v: string) => Number(v).toLocaleString('th-TH', { maximumFractionDigits: 2 });

/** Days with an expense in the month the API returned; backdated entries count because `daily` follows the transaction date. */
export const recordedDaysText = (daily: readonly { expenseAmount: string }[]) => {
  const days = daily.filter((d) => Number(d.expenseAmount) > 0).length;
  return days ? `บันทึกแล้ว ${days} วันในเดือนนี้` : null;
};

export const isNewAccount =({ pace, recordedExpenseToday, forecastReadiness }: TodayInput) =>
  forecastReadiness.transactionCount === 0 && Number(recordedExpenseToday) === 0 && Number(pace.spent) === 0;

export function todayCard(input: TodayInput): TodayCard {
  const { pace, recordedExpenseToday, paceNoticeMinimum } = input;
  const nothingToday = Number(recordedExpenseToday) === 0;
  const card = (tone: Tone, status: string, text: string, action = 'ดูงบ', to = BUDGET, recordedNote = true) => ({ tone, status, text, action, to, recordedNote });
  if (isNewAccount(input))
    return card('info', 'เริ่มต้น', 'ยังไม่มีรายจ่ายที่บันทึก เริ่มจากรายการแรกของคุณ', 'บันทึกรายจ่ายรายการแรก', ADD, false);
  if (pace.cycleBudget === null)
    return card('info', 'ยังไม่ตั้งงบ', `รอบนี้บันทึกรายจ่ายแล้ว ${baht(pace.spent)} บาท ตั้งงบเพื่อดูว่าใช้ได้อีกวันละเท่าไร`, 'ตั้งงบ');
  if (Number(pace.overBudget) > 0)
    return card('bad', 'เกินงบ', `ใช้เกินงบรอบนี้ ${baht(pace.overBudget!)} บาท อีก ${pace.daysLeft} วันจะเริ่มรอบใหม่`);
  // No "per day 0" (FINANCIAL_PROFILE_DESIGN 3.2): perDay is null below one baht a day.
  if (pace.perDay === null)
    return card('warn', 'งบใกล้หมด', Number(pace.budgetLeft) > 0 ? `งบเหลือ ${baht(pace.budgetLeft!)} บาท อีก ${pace.daysLeft} วัน` : `ใช้งบครบพอดี อีก ${pace.daysLeft} วันจะเริ่มรอบใหม่`);
  const perDay = `งบที่เหลือใช้ได้เฉลี่ยวันละ ${baht(pace.perDay)} บาท อีก ${pace.daysLeft} วัน`;
  if (nothingToday) return card('info', 'วันนี้ยังไม่มีรายการ', `วันนี้ยังไม่มีรายจ่ายที่บันทึก ${perDay}`, 'บันทึกรายจ่ายวันนี้', ADD);
  if (Number(pace.paceGap) > Number(paceNoticeMinimum)) return card('warn', 'ใช้เร็วกว่าแผน', `เร็วกว่าแผน ${baht(pace.paceGap!)} บาท ${perDay}`);
  return card('ok', 'ตามงบ', perDay);
}

export type Gate = { ready: boolean; count: number; days: number; moreCount: number; moreDays: number };
export type UnlockRow = { name: string; ready: boolean; percent: number; text: string };

export const missingText = (count: number, days: number) =>
  'ขาดอีก ' + [count > 0 && `${count} รายการ`, days > 0 && (count > 0 ? `อีก ${days} วัน` : `${days} วัน`)].filter(Boolean).join(' และ');
// Today's entries can fill the display while the real gate, which stops at yesterday, is closed.
// No date promised: Behavior's window moves daily, so its oldest entry can drop out and the count fall back.
export const READY_WAITING = 'ครบตามจำนวนแล้ว ระบบจะเริ่มวิเคราะห์เมื่อข้อมูลพร้อม';
const need = (g: Gate) => (g.moreCount || g.moreDays ? missingText(g.moreCount, g.moreDays) : READY_WAITING);
/** Stages are in DECISIONS. Uses the row furthest from done, so the heading never claims more than the bar shows. */
export function unlockHeading(rows: UnlockRow[]) {
  // A fifth case apart from the 90-99 stage: the display is full and only the real gate is still closed.
  if (rows.every((r) => r.ready || r.text === READY_WAITING)) return 'ครบแล้ว';
  const p = Math.min(...rows.map((r) => r.percent));
  if (p === 0) return 'เริ่มบันทึกเพื่อให้ระบบวิเคราะห์ได้';
  if (p < 50) return 'เริ่มสะสมข้อมูลแล้ว';
  return p < 90 ? 'ผ่านครึ่งทางแล้ว' : 'ใกล้ครบแล้ว';
}
// The less complete of count and days, capped so the bar is never full before the real gate opens.
const percent = (g: Gate) => g.ready ? 100 : Math.min(99, Math.floor(Math.min(g.moreCount ? g.count / (g.count + g.moreCount) : 1, g.moreDays ? g.days / (g.days + g.moreDays) : 1) * 100));

/** Forecast counts all history, so once it is open this is a returning account: Overview shows nothing and the Behavior page speaks for itself. */
export function unlockRows(forecast: Gate, behavior: Gate): UnlockRow[] {
  if (forecast.ready) return [];
  if (forecast.moreCount === behavior.moreCount && forecast.moreDays === behavior.moreDays)
    return [{ name: 'สรุปพฤติกรรมและคาดการณ์รายจ่าย', ready: false, percent: percent(forecast), text: need(forecast) }];
  return ([['สรุปพฤติกรรม', behavior], ['คาดการณ์รายจ่าย', forecast]] as const).map(([name, g]) => ({ name, ready: g.ready, percent: percent(g), text: g.ready ? '' : need(g) }));
}
