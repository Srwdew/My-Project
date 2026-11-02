import { DISMISS_SUPPRESS_CYCLES, MAX_SHOWN, REPEAT_LIMIT_CYCLES, SUPPRESSIONS, type Matcher } from "./config";
import type { LogEntry, Scored } from "./types";

export type Suppression = { item: Scored; reason: "covered_by" | "dismissed_recently" | "repeated_without_response"; by?: Matcher };

const matches = (m: Matcher, i: { ruleId: string; subject: string | null }) => m.ruleId === i.ruleId && (m.subject === undefined || m.subject === i.subject);

// cycleKeys: the current cycle first, then previous ones, all from cycle.ts.
export function rank(items: readonly Scored[], history: readonly LogEntry[], cycleKeys: readonly string[]) {
  const sameItem = (a: { ruleId: string; subject: string | null }, b: { ruleId: string; subject: string | null }) =>
    a.ruleId === b.ruleId && a.subject === b.subject;
  const suppressed: Suppression[] = [];
  // Dismissed in cycle c → gone for the rest of c, then hidden c+1..c+3; back in c+4.
  const dismissWindow = new Set(cycleKeys.slice(0, 1 + DISMISS_SUPPRESS_CYCLES));
  const previous = cycleKeys.slice(1, 1 + REPEAT_LIMIT_CYCLES);

  const coveredBy = (item: Scored) =>
    SUPPRESSIONS.find((s) => items.some((t) => matches(s.by, t)) && s.hides.some((h) => matches(h, item)))?.by;
  const reasonFor = (item: Scored): Omit<Suppression, "item"> | null => {
    const by = coveredBy(item);
    if (by) return { reason: "covered_by", by };
    if (history.some((h) => sameItem(h, item) && h.userAction === "dismissed" && dismissWindow.has(h.cycleId))) return { reason: "dismissed_recently" };
    if (
      previous.length === REPEAT_LIMIT_CYCLES &&
      previous.every((k) => history.some((h) => sameItem(h, item) && h.cycleId === k)) &&
      !history.some((h) => sameItem(h, item) && previous.includes(h.cycleId) && h.userAction !== null)
    )
      return { reason: "repeated_without_response" };
    return null;
  };

  const remaining = [...items]
    .sort((a, b) => b.score.total - a.score.total)
    .filter((item) => {
      const r = reasonFor(item);
      if (r) suppressed.push({ item, ...r });
      return !r;
    });
  // One recommendation per subject (categoryId, goalId…): R3/R5/R7 on one category describe the same baht, so only
  // the highest score is a recommendation; the others go to the full list marked with what superseded them.
  const lead = new Map<string, Ranked>();
  const primary: Ranked[] = [], superseded: Ranked[] = [];
  for (const item of remaining) {
    const first = item.subject === null ? undefined : lead.get(item.subject);
    if (first) superseded.push({ ...item, supersededBy: { ruleId: first.ruleId, subject: first.subject } });
    else {
      const r: Ranked = { ...item, supersededBy: null };
      if (item.subject !== null) lead.set(item.subject, r);
      primary.push(r);
    }
  }
  return { shown: primary.slice(0, MAX_SHOWN), more: [...primary.slice(MAX_SHOWN), ...superseded], suppressed };
}

export type Ranked = Scored & { supersededBy: { ruleId: string; subject: string | null } | null };
