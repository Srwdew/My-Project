// Temporary, per-tab retry journal. Contains only the normalized create request,
// never a receipt image, raw OCR text or an authentication token.
export const PENDING_TRANSACTION_KEY = 'spendsense.pending-transaction.v1';
export type TransactionDraft = {
  categoryId: string; type: 'income' | 'expense'; amount: string;
  transactionDate: string; transactionTime: string | null;
  transactionTimeConfirmed: false; paymentMethod: string | null;
  description: string | null; note: string | null;
};
export type PendingTransaction = { key: string; body: string; createdAt: string };
type Journal = PendingTransaction & { version: 1; owner: string };
export function normalizedTransactionBody(input: TransactionDraft): string {
  const money = input.amount.trim();
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(money)) throw Error('INVALID_AMOUNT');
  const [whole, fraction = ''] = money.split('.');
  if (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0')) <= 0n) throw Error('INVALID_AMOUNT');
  const optional = (s: string | null) => {
    if (s !== null && typeof s !== 'string') throw Error('INVALID_FIELD');
    return s?.trim() || null;
  };
  if (!['income', 'expense'].includes(input.type) || typeof input.categoryId !== 'string' || !input.categoryId.trim()
      || !/^\d{4}-\d{2}-\d{2}$/.test(input.transactionDate)
      || (input.transactionTime !== null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.transactionTime))) throw Error('INVALID_FIELD');
  return JSON.stringify({
    categoryId: input.categoryId.trim(), type: input.type,
    amount: BigInt(whole).toString() + '.' + fraction.padEnd(2, '0'),
    transactionDate: input.transactionDate, transactionTime: input.transactionTime,
    transactionTimeConfirmed: false, paymentMethod: optional(input.paymentMethod),
    description: optional(input.description), note: optional(input.note),
  });
}
async function sessionOwner(session: string) {
  // Session binding also prevents a later login of the same account reusing stale state.
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(session));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}
function validateRequest(value: PendingTransaction) {
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(value.key) || typeof value.body !== 'string'
      || !Number.isFinite(Date.parse(value.createdAt))) throw Error('INVALID_PENDING_REQUEST');
  const body = JSON.parse(value.body);
  if (body.transactionTimeConfirmed !== false || normalizedTransactionBody(body) !== value.body) throw Error('INVALID_PENDING_REQUEST');
}
export async function loadPendingTransaction(session: string, isCurrent: () => boolean, storage: Storage = sessionStorage): Promise<PendingTransaction | null> {
  const owner = await sessionOwner(session);
  if (!isCurrent()) return null;
  const raw = storage.getItem(PENDING_TRANSACTION_KEY);
  if (!raw) return null;
  const value: Journal = JSON.parse(raw);
  if (value.owner !== owner) { storage.removeItem(PENDING_TRANSACTION_KEY); return null; }
  if (value.version !== 1) throw Error('INVALID_PENDING_REQUEST');
  validateRequest(value);
  return { key: value.key, body: value.body, createdAt: value.createdAt };
}
export async function storePendingTransaction(session: string, request: PendingTransaction, isCurrent: () => boolean, storage: Storage = sessionStorage) {
  validateRequest(request);
  const owner = await sessionOwner(session);
  if (!isCurrent()) throw Error('SESSION_CHANGED');
  const value: Journal = { version: 1, owner, ...request };
  storage.setItem(PENDING_TRANSACTION_KEY, JSON.stringify(value)); // Must succeed before POST.
}
export function clearPendingTransaction(key?: string, storage: Storage = sessionStorage) {
  try {
    if (key) {
      const raw = storage.getItem(PENDING_TRANSACTION_KEY);
      if (!raw || JSON.parse(raw).key !== key) return;
    }
    storage.removeItem(PENDING_TRANSACTION_KEY);
  } catch { /* Logout must still complete if browser storage is unavailable. */ }
}
export function definitiveTransactionRejection(status: number, body: { code?: string }) {
  return [400,404,409].includes(status) && [
    'INVALID_IDEMPOTENCY_KEY','INVALID_BODY','MISSING_FIELDS','INVALID_TYPE',
    'INVALID_TRANSACTION','CATEGORY_NOT_FOUND','CATEGORY_TYPE',
    'INVALID_TIME_CONFIRMATION','TIME_REQUIRED','IDEMPOTENCY_CONFLICT',
  ].includes(body.code ?? '');
}
