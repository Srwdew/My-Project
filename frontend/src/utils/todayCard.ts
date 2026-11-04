// Wording only: every figure comes from the API (Tier 0 pace, forecast readiness, /behavior readiness).
export type Pace = { daysLeft: number; spent: string; cycleBudget: string | null; budgetLeft: string | null; overBudget: string | null; perDay: string | null; paceGap: string | null };
export type TodayInput = { pace: Pace; recordedExpenseToday: string; forecastReadiness: { transactionCount: number } };
export type Tone = 'ok' | 'info' | 'warn' | 'bad';
export type TodayCard = { tone: Tone; status: string; text: string; action: string; to: string; recordedNote: boolean };

const ADD = '/transactions/add', BUDGET = '/budget';
const baht = (v: string) => Number(v).toLocaleString('th-TH', { maximumFractionDigits: 2 });

export function todayCard({ pace, recordedExpenseToday, forecastReadiness }: TodayInput): TodayCard {
  const nothingToday = Number(recordedExpenseToday) === 0;
  const card = (tone: Tone, status: string, text: string, action = 'ดูงบ', to = BUDGET, recordedNote = true) => ({ tone, status, text, action, to, recordedNote });
  if (forecastReadiness.transactionCount === 0 && nothingToday && Number(pace.spent) === 0)
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
  if (Number(pace.paceGap) > 0) return card('warn', 'ใช้เร็วกว่าแผน', `เร็วกว่าแผน ${baht(pace.paceGap!)} บาท ${perDay}`);
  return card('ok', 'ตามงบ', perDay);
}
