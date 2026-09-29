export type Dimension = {status: string; reasonCode: string};
export type Evaluation = {
  id: string; revision: number; ruleVersion: string; evaluatedAt: string; outcome: string;
  snapshot: {
    transaction: {id?: string; type?: string; amount: string; categoryName: string; date: string; time: string|null; timeConfirmed: boolean};
    window: {startDate: string; endExclusive: string};
    baseline: {n: number; days: number; span: number; median: string|null; mad: string|null; q1: string|null; q3: string|null; timeN: number; timeDays: number; timeSpan: number; bucketCount: number; nearbyCount: number};
    rules: {amountMin: number; amountDays: number; amountSpan: number; timeMin: number; timeDays: number; timeSpan: number; timeCoverage: string; zScale?: string; zThreshold: string; iqrMultiplier: string; minimumDifference: string; medianDifferenceRatio: string; rareFrequency: string};
    assessment: {amount: Dimension; time: Dimension};
  };
};
export type AnomalyDetail = {
  currentRevision: number|null; pending: boolean; sourceState: string;
  notificationSnapshot: Evaluation|null; latestEvaluation: Evaluation|null; latestAppliesToCurrent: boolean;
  transactionLink: string|null; amountBaselineEligible: boolean; amountBaselineReasons: string[];
  timeBaselineEligible: boolean; timeBaselineReasons: string[];
};
export function assessmentLabel(d: Dimension): string {
  if(d.status==='flagged')return 'พบสัญญาณ';
  if(d.status==='not_flagged')return 'ไม่พบสัญญาณ';
  if(d.reasonCode==='amount_insufficient_history'||d.reasonCode==='time_insufficient_history')return 'ข้อมูลไม่พอ';
  return 'ยังประเมินไม่ได้';
}
export const explanation: Record<string,string> = {
  amount_insufficient_history:'ประวัติหมวดเดียวกันยังไม่ถึงจำนวนรายการ จำนวนวัน หรือระยะเวลาที่กฎกำหนด',
  amount_modified_z:'เปรียบเทียบยอดกับค่ากลางและการกระจายของประวัติหมวดเดียวกัน',
  amount_iqr:'ใช้การกระจายระหว่างควอไทล์ เพราะ MAD ของประวัติเป็นศูนย์',
  amount_zero_dispersion:'ยอดในประวัติเท่ากันทุกครั้ง จึงตรวจส่วนต่างจากยอดนั้น',
  amount_zero_iqr_nonconstant:'ประวัติมีหลายยอด แต่ MAD และ IQR เป็นศูนย์ ระบบจึงงดประเมินด้านจำนวนเงิน',
  time_not_confirmed:'ไม่มีเวลาที่ผู้ใช้ยืนยัน จึงไม่ประเมินด้านเวลา',
  time_insufficient_history:'จำนวนเวลา วันที่ ระยะเวลา หรือสัดส่วนเวลาที่ยืนยันยังไม่ถึงเกณฑ์',
  time_rare_frequency:'ตรวจความถี่ของช่วง 4 ชั่วโมงและช่วงรอบเวลาเกิดรายการ ต้องพบน้อยทั้งสองส่วนจึงเป็นสัญญาณ',
};
export const eligibilityExplanation: Record<string,string> = {
  confirmed_normal:'ผู้ใช้ยืนยัน revision นี้ว่าปกติ', no_evaluation_history:'ยังไม่มีผลตรวจและไม่ได้รอประเมิน',
  insufficient_history_allowed:'อนุญาตให้สะสมประวัติเมื่อข้อมูลยังไม่พอ', current_not_flagged:'revision ปัจจุบันไม่พบสัญญาณ',
  confirmed_time_available:'มีเวลาที่ยืนยันแล้ว', transaction_deleted:'ต้นทางถูกลบ', not_expense:'ไม่ใช่รายจ่าย',
  evaluation_pending:'รอประเมิน revision ล่าสุด', confirmed_problem:'ผู้ใช้ยืนยัน revision นี้ว่ามีปัญหา',
  flagged_unreviewed:'พบสัญญาณและยังไม่ได้ยืนยันว่าปกติ', evaluation_not_eligible:'ผลตรวจนี้ยังไม่เข้าเกณฑ์อ้างอิง',
  time_not_confirmed:'ยังไม่ยืนยันเวลา', time_missing:'ไม่มีเวลา',
};
export function evaluationChoices(detail: AnomalyDetail): Evaluation[] {
  const values=[detail.notificationSnapshot,detail.latestEvaluation].filter((v):v is Evaluation=>v!==null);
  return values.filter((v,i)=>values.findIndex(x=>x.id===v.id)===i);
}
export function currentAssessmentLabel(detail: AnomalyDetail): string {
  if(detail.sourceState==='deleted')return 'รายการต้นทางถูกลบแล้ว';
  if(detail.pending)return 'รอประเมิน';
  if(!detail.latestEvaluation || !detail.latestAppliesToCurrent)return 'ยังไม่ตรวจ';
  if(detail.latestEvaluation.outcome==='flagged')return 'พบสัญญาณ';
  if(detail.latestEvaluation.outcome==='not_flagged')return 'ไม่พบสัญญาณ';
  const {amount,time}=detail.latestEvaluation.snapshot.assessment;
  return [amount,time].some(d=>assessmentLabel(d)==='ข้อมูลไม่พอ')?'ข้อมูลไม่พอ':'ยังประเมินไม่ได้';
}
export function amountFormula(e: Evaluation): string|null {
  const r=e.snapshot.rules, reason=e.snapshot.assessment.amount.reasonCode;
  const floor='X − median > max('+r.minimumDifference+' บาท, '+r.medianDifferenceRatio+' × median)';
  if(reason==='amount_modified_z')return 'Z = '+(r.zScale??'0.6745')+' × (X − median) / MAD; Z > '+r.zThreshold+' และ '+floor;
  if(reason==='amount_iqr')return 'X > Q3 + '+r.iqrMultiplier+' × (Q3 − Q1) และ '+floor;
  if(reason==='amount_zero_dispersion')return 'X > median และ '+floor;
  return null;
}
