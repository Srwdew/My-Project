// Borrowed Behavior line (>=5% and >=100 baht, both directions; DECISIONS 3 Nov 2026): smaller moves are "close to last week", not a trend.
// With no previous spending there is no percentage, so only the 100-baht line applies (locked 3 Nov 2026).
export function forecastTrend(diff: string | null, previous: string): "up" | "down" | "flat" | null {
  if (diff === null) return null;
  const d = Number(diff), prev = Number(previous);
  const significant = Math.abs(d) >= 100 && (prev <= 0 || Math.abs(d / prev) * 100 >= 5);
  return !significant ? "flat" : d > 0 ? "up" : "down";
}
