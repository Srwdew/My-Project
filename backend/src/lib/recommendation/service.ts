import { isDeepStrictEqual } from "node:util";
import { Prisma } from "@prisma/client";
import { previousCycle } from "../cycle";
import { prisma } from "../prisma";
import { DISMISS_SUPPRESS_CYCLES, REPEAT_LIMIT_CYCLES } from "./config";
import { buildRecommendationContext } from "./context";
import { evaluate, toLogRow } from "./evaluate";
import { rank, type Ranked } from "./rank";
import { RULES } from "./rules";
import { render } from "./text";
import type { LogEntry, RuleId, RuleResult } from "./types";

type Range = { kind: "window" | "cycle" | "month" | "forecast"; startDate: string; endDate: string };
// The dates a logged recommendation was computed from, read from its own inputs (never from today's data):
// Behavior-window rules use the 30-day window; cycle rules the cycle; goal/saving rules the completed month.
function dataRange(ruleId: string, inputs: any, computed: any): Range | null {
  const w = inputs?.behavior?.window?.current, month = (p: any): Range | null => (p ? { kind: "month", startDate: p.startDate, endDate: p.endDate } : null);
  switch (ruleId) {
    case "R3": case "R4": case "R5": case "R7":
      return w ? { kind: "window", startDate: w.startDate, endDate: w.endDate } : null;
    case "R9":
      return computed?.what?.kind === "saving_rate" ? month(inputs?.last?.period) : w ? { kind: "window", startDate: w.startDate, endDate: w.endDate } : null;
    case "R2":
      return inputs?.window ? { kind: "cycle", startDate: inputs.window.startDate, endDate: inputs.window.endDate } : null;
    case "R8":
      return inputs?.scope === "current_cycle" ? { kind: "cycle", ...inputs.window } : month(inputs?.cashFlow?.period);
    case "R6":
      return month(inputs?.feasibility?.cashFlow?.period);
    case "R1":
      return inputs?.cycle ? { kind: "forecast", startDate: inputs.today, endDate: inputs.cycle.endDate } : null;
    default:
      return null;
  }
}

const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue; // Decimal → string, drops undefined
const subjectOf = (computed: Prisma.JsonValue) => ((computed as { subject?: string | null } | null)?.subject ?? null);

// One evaluation: build the context once, run every rule, rank against this user's log, and log what is returned.
export async function runRecommendations(userId: string, today: string) {
  return prisma.$transaction(
    async (tx) => {
      const { ctx, readinessDetail, cycleContext } = await buildRecommendationContext(tx, userId, today);
      const out = evaluate(ctx, RULES);
      const cycleKeys = [ctx.cycle.key];
      for (let c = ctx.cycle, i = 0; i < Math.max(DISMISS_SUPPRESS_CYCLES, REPEAT_LIMIT_CYCLES); i++) cycleKeys.push((c = previousCycle(cycleContext, c)).key);
      const logged = await tx.recommendationLog.findMany({
        where: { userId, cycleId: { in: cycleKeys } },
        select: { id: true, ruleId: true, ruleVersion: true, cycleId: true, computed: true, userAction: true },
      });
      const history: LogEntry[] = logged.map((r) => ({ ruleId: r.ruleId, cycleId: r.cycleId, subject: subjectOf(r.computed), userAction: r.userAction }));
      const ranked = rank(out.scored, history, cycleKeys);
      // Every item returned is logged. The same advice with the same numbers in this cycle reuses its row, so reloading
      // the page does not multiply rows; any change in numbers gets a new row, so provenance always matches the text.
      const present = async (item: Ranked) => {
        const row = toLogRow(ctx, item);
        const computed = json(row.computed);
        // jsonb reorders keys, so compare structurally, not as strings.
        const same = logged.find((l) => l.cycleId === row.cycleId && l.ruleId === row.ruleId && l.ruleVersion === row.ruleVersion && isDeepStrictEqual(l.computed, computed));
        const id = same?.id ?? (await tx.recommendationLog.create({ data: { ...row, inputs: json(row.inputs), computed, score: json(row.score) }, select: { id: true } })).id;
        return { id, ruleId: item.ruleId, subject: item.subject, score: item.score.total, text: render(item), supersededBy: item.supersededBy };
      };
      const shown = [], more = [];
      for (const i of ranked.shown) shown.push(await present(i));
      for (const i of ranked.more) more.push(await present(i));
      return {
        asOfDate: today,
        cycle: { key: ctx.cycle.key, startDate: ctx.cycle.startDate, endDate: ctx.cycle.endDate },
        shown,
        more,
        silencedByNoFlags: out.silencedByNoFlags,
        closedRules: out.skipped,
        readiness: readinessDetail,
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}

// "Where did this come from": the log row only, never today's values.
export async function recommendationProvenance(userId: string, id: string) {
  const r = await prisma.recommendationLog.findFirst({ where: { id, userId } });
  if (!r) return null;
  const c = r.computed as unknown as Pick<RuleResult, "what" | "action" | "outcome">;
  return {
    id: r.id, ruleId: r.ruleId, ruleVersion: r.ruleVersion, cycleId: r.cycleId, shownAt: r.shownAt,
    text: render({ ruleId: r.ruleId as RuleId, ...c } as RuleResult),
    dataRange: dataRange(r.ruleId, r.inputs, r.computed),
    cycle: (r.inputs as any)?.cycle ?? null,
    inputs: r.inputs, computed: r.computed, score: r.score,
    citationTier: r.citationTier, citationRef: r.citationRef, userAction: r.userAction, outcomeVerified: r.outcomeVerified,
  };
}
