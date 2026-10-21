import { moneyText } from '../utils/dashboard';
export type Feasibility = {
  status: string;
  requiredMonthlyAmount: string | null;
  cashFlow: { period: { month: string; startDate: string; endDate: string }; incomeAmount: string; expenseAmount: string; netCashFlow: string; transactionCount: number };
};
const labels: Record<string, string> = {
  archived: 'เป้าหมายจัดเก็บแล้ว ไม่ประเมินแผนออม',
  completed: 'ครบเป้าหมายแล้ว',
  no_target_date: 'ยังประเมินไม่ได้: ต้องกำหนดวันเป้าหมายก่อน',
  overdue: 'เลยวันเป้าหมายแล้ว กรุณาทบทวนกำหนดเวลา',
  no_transactions: 'ยังประเมินไม่ได้: ไม่มีธุรกรรมในเดือนอ้างอิง',
  no_income: 'ยังประเมินไม่ได้: ไม่มีรายรับที่บันทึกในเดือนอ้างอิง',
  non_positive_cash_flow: 'เดือนอ้างอิงไม่มีเงินเหลือสุทธิสำหรับเทียบกับแผนออม',
  exceeds_observed_cash_flow: 'ยอดที่ต้องออมต่อเดือนสูงกว่ากระแสเงินสดสุทธิที่บันทึกในเดือนอ้างอิง',
  within_observed_cash_flow: 'ยอดที่ต้องออมต่อเดือนไม่เกินกระแสเงินสดสุทธิที่บันทึกในเดือนอ้างอิง',
};
export default function GoalFeasibility({ value }: { value?: Feasibility }) {
  if (!value) return <p>ยังไม่มีผลประเมินกระแสเงินสด</p>;
  const cash = value.cashFlow;
  return <div className="goal-plan" data-testid="goal-feasibility">
    <strong>ประเมินจากกระแสเงินสดจริง</strong>
    <span>เดือนปฏิทินเต็มล่าสุด {cash.period.month} ({cash.period.startDate} ถึง {cash.period.endDate})</span>
    <span>รายรับ {moneyText(cash.incomeAmount)} − รายจ่าย {moneyText(cash.expenseAmount)} = สุทธิ {moneyText(cash.netCashFlow)} บาท</span>
    <span>{labels[value.status] ?? 'ยังประเมินไม่ได้'}</span>
    <small>ใช้เฉพาะข้อมูลที่บันทึกในเดือนที่ผ่านมา ไม่รับประกันรายได้ในอนาคตหรือความครบถ้วนของข้อมูล ประเมินแยกแต่ละเป้าหมาย ไม่ใช่เงินพร้อมจัดสรรรวมทุกเป้าหมาย และไม่ถือว่าเงินสุทธิทั้งหมดต้องนำมาออม ไม่มีการจัดสรรเงินอัตโนมัติ</small>
  </div>;
}
