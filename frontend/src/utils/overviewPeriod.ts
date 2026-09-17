export type PeriodPreset =
  | "this_month"
  | "last_month"
  | "last_3_months"
  | "last_6_months"
  | "this_year"
  | "custom";

export type DateRange = {
  startDate: string;
  endDate: string;
};

export function getPresetRange(
  preset: Exclude<PeriodPreset, "custom">
): DateRange {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(new Date());

  const part = (type: string) =>
    Number(parts.find((item) => item.type === type)?.value);

  const year = part("year");
  const month = part("month");
  const day = part("day");

  const dateString = (y: number, m: number, d: number) =>
    new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);

  const today = dateString(year, month, day);

  switch (preset) {
    case "this_month":
      return {
        startDate: dateString(year, month, 1),
        endDate: today,
      };

    case "last_month":
      return {
        startDate: dateString(year, month - 1, 1),
        endDate: dateString(year, month, 0),
      };

    case "last_3_months":
      return {
        startDate: dateString(year, month - 2, 1),
        endDate: today,
      };

    case "last_6_months":
      return {
        startDate: dateString(year, month - 5, 1),
        endDate: today,
      };

    case "this_year":
      return {
        startDate: dateString(year, 1, 1),
        endDate: today,
      };
  }
}

export function validateRange(range: DateRange): string {
  const parse = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

    const year = Number(value.slice(0, 4));
    if (year < 1900 || year > 9999) return null;

    const date = new Date(`${value}T00:00:00Z`);

    if (
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== value
    ) {
      return null;
    }

    return date;
  };

  const start = parse(range.startDate);
  const end = parse(range.endDate);

  if (!start || !end) return "กรุณาระบุวันที่ให้ครบและถูกต้อง";
  if (start > end) return "วันเริ่มต้นต้องไม่อยู่หลังวันสิ้นสุด";

  const days = (end.getTime() - start.getTime()) / 86400000 + 1;

  if (days > 366) return "กรุณาเลือกช่วงเวลาไม่เกิน 366 วัน";

  return "";
}