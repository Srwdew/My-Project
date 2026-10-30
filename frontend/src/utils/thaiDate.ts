// Display-only formatting for API date keys; values stay ISO everywhere else.
const dayFormat = new Intl.DateTimeFormat("th-TH", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });
const monthFormat = new Intl.DateTimeFormat("th-TH", { timeZone: "UTC", month: "short", year: "numeric" });

// "2026-10-24" -> "24 ต.ค. 2569"; anything not a YYYY-MM-DD key is returned unchanged.
export function thaiDate(value: string | null | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return value ?? "";
  return dayFormat.format(new Date(`${value}T00:00:00Z`));
}

// "2026-10" -> "ต.ค. 2569"; anything not a YYYY-MM key is returned unchanged.
export function thaiMonth(value: string | null | undefined) {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return value ?? "";
  return monthFormat.format(new Date(`${value}-01T00:00:00Z`));
}
