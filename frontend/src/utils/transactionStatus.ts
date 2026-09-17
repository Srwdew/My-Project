export function getBangkokTodayKey(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function getTransactionMaxDate(): Date {
  return new Date(`${getBangkokTodayKey()}T00:00:00`);
}

export function isFutureTransactionDate(date: Date): boolean {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}` > getBangkokTodayKey();
}

// transactionDate is a calendar date represented at UTC midnight, not an instant.
export function getTransactionDateLabel(dateString: string, now = new Date()): string {
  const todayKey = getBangkokTodayKey(now);
  const yesterday = new Date(`${todayKey}T00:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const formatted = new Date(`${dateString}T00:00:00Z`).toLocaleDateString('th-TH', {
    timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric',
  });
  if (dateString === todayKey) return `วันนี้ - ${formatted}`;
  if (dateString === yesterday.toISOString().slice(0, 10)) return `เมื่อวาน - ${formatted}`;
  return formatted;
}
