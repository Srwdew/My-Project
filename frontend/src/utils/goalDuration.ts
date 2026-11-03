// Past this a year count tells the user nothing they can act on (owner's starting point, 4 Nov 2026).
const MAX_USEFUL_MONTHS = 50 * 12;

// Tier 3 "extend" option; null months means no option at all.
export function extendText(months: number) {
  if (months > MAX_USEFUL_MONTHS) return 'ยืดเวลาอย่างเดียวไม่พอสำหรับเป้านี้';
  const years = Math.floor(months / 12), rest = months % 12;
  const parts = [years ? `${years} ปี` : '', rest ? `${rest} เดือน` : ''].filter(Boolean).join(' ');
  return `ยืดเวลาเป็น ${parts}`;
}
