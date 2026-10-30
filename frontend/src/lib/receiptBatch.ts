import type { ReceiptResult } from '../utils/receiptParser';

export const MAX_BATCH_RECEIPTS = 10;
export type BatchFields = {
  amount: string; transactionDate: string; transactionTime: string;
  description: string; categoryId: string;
};
export type ExistingTransaction = {
  type: string; amount: string | number; transactionDate: string; transactionTime: string | null;
};

/** Value problems that turn a row red; category is checked separately so it never masks a misread. */
export function batchRowProblems(f: BatchFields, today: string): string[] {
  const problems: string[] = [];
  const money = f.amount.replace(/,/g, '').trim();
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(money) || !(Number(money) > 0)) problems.push('จำนวนเงินไม่ถูกต้อง');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.transactionDate)) problems.push('ไม่พบวันที่');
  else if (f.transactionDate > today) problems.push('วันที่อยู่ในอนาคต');
  if (f.transactionTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(f.transactionTime)) problems.push('เวลาไม่ถูกต้อง');
  return problems;
}

// OCR cannot report its own misreads; these parser signals mark values the user must check.
export function ocrDoubts(r: ReceiptResult): string[] {
  const doubts: string[] = [];
  // Time is optional, so an ambiguous time does not block saving.
  if (r.issues.some(i => i !== 'time_ambiguous' && (i.endsWith('_ambiguous') || i.endsWith('_requires_review')))
      || new Set(r.amountCandidates.map(c => c.value)).size > 1) doubts.push('พบหลายค่าที่อาจเป็นยอดเงินหรือวันที่');
  if (r.issues.includes('currency_ocr_uncertain')) doubts.push('อ่านตัวเลขยอดเงินไม่ชัด');
  return doubts;
}

const money = (v: string | number) => Number(String(v).replace(/,/g, '')).toFixed(2);
const sameTime = (a: string, b: string) => !a || !b || a === b;

/** Row id → reason, for rows that match an earlier row in the batch or an existing expense. */
export function findDuplicates(rows: { id: string; fields: BatchFields }[], existing: ExistingTransaction[]) {
  const found = new Map<string, string>();
  rows.forEach((row, i) => {
    const { amount, transactionDate: date, transactionTime: time } = row.fields;
    if (!amount || !date) return;
    const matches = (a: string | number, d: string, t: string) => money(a) === money(amount) && d === date && sameTime(t, time);
    if (rows.slice(0, i).some(o => matches(o.fields.amount, o.fields.transactionDate, o.fields.transactionTime)))
      found.set(row.id, 'ยอด วันที่ และเวลาตรงกับสลิปอื่นในชุดนี้');
    else if (existing.some(t => t.type === 'expense' && matches(t.amount, t.transactionDate.slice(0, 10), t.transactionTime?.slice(11, 16) ?? '')))
      found.set(row.id, 'ยอด วันที่ และเวลาตรงกับรายการที่บันทึกไว้แล้ว');
  });
  return found;
}
