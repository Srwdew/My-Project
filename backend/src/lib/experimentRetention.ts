import { GoalError, type GoalTx } from "./goalWriteTransaction";
export const EXPERIMENT_COLLECTION_ENABLED = false;
export const AUTOMATIC_AMOUNT_MATCHING = false;
export const CONSENT_CUTOFF = new Date("2026-10-07T14:22:28.000Z");
export const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export type RetentionTx = Pick<GoalTx, "$queryRawUnsafe" | "$executeRawUnsafe">;
export async function retentionInstalled(tx: RetentionTx) {
  const rows = await tx.$queryRawUnsafe<{ name: string | null }[]>(
    "SELECT to_regclass($1)::text AS name",
    "experiment_retention.subject",
  );
  return !!rows[0]?.name;
}
export async function lockExperiment(tx: RetentionTx) {
  await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(18082026, 30)");
}
// Called under existing account lock. Unknown copy locations keep completion blocked.
export async function withdrawExperiment(tx: RetentionTx, userId: string) {
  if (!(await retentionInstalled(tx)))
    return { status: "stopped" as const, installed: false };
  await lockExperiment(tx);
  await tx.$executeRawUnsafe(
    "INSERT INTO experiment_retention.subject(user_id) VALUES ($1) ON CONFLICT(user_id) DO NOTHING",
    userId,
  );
  // Pair collection has not been implemented. Refuse to claim purge for unknown future stores.
  const tables = await tx.$queryRawUnsafe<{ tablename: string }[]>(
    "SELECT tablename FROM pg_tables WHERE schemaname='experiment_retention' AND tablename NOT IN ('subject','artifact','artifact_subject','control')",
  );
  if (tables.length)
    throw new GoalError(
      503,
      "EXPERIMENT_PURGE_ADAPTER_REQUIRED",
      "Experiment storage requires a reviewed purge adapter",
    );
  await tx.$executeRawUnsafe(
    "UPDATE experiment_retention.subject SET database_purged_at=COALESCE(database_purged_at,clock_timestamp()) WHERE user_id=$1",
    userId,
  );
  return { status: await purgeStatus(tx, userId), installed: true };
}
export async function assertExperimentCollection(
  tx: RetentionTx,
  _userId: string,
): Promise<never> {
  await lockExperiment(tx);
  // No grant endpoint until uncontrolled-copy inventory and pair collection are reviewed.
  throw new GoalError(
    503,
    "EXPERIMENT_COLLECTION_DISABLED",
    "Experiment collection is disabled",
  );
}
export async function purgeStatus(
  tx: RetentionTx,
  userId: string,
): Promise<"stopped" | "waiting_backups" | "complete"> {
  const rows = await tx.$queryRawUnsafe<
    {
      database_purged_at: Date | null;
      inventory_verified: boolean;
      pending: boolean;
    }[]
  >(
    "SELECT s.database_purged_at,s.inventory_verified,EXISTS(SELECT 1 FROM experiment_retention.artifact_subject m JOIN experiment_retention.artifact a ON a.id=m.artifact_id WHERE m.user_id=s.user_id AND a.state<>'deleted') AS pending FROM experiment_retention.subject s WHERE user_id=$1",
    userId,
  );
  const s = rows[0];
  if (!s?.database_purged_at || !s.inventory_verified) return "stopped";
  return s.pending ? "waiting_backups" : "complete";
}
export async function replayWithdrawals(
  tx: RetentionTx,
  ids: readonly string[],
) {
  await lockExperiment(tx);
  await tx.$executeRawUnsafe(
    "UPDATE experiment_retention.control SET restore_verified=false",
  );
  for (const id of [...new Set(ids)]) await withdrawExperiment(tx, id);
  // Replay cannot establish external backup inventory or completeness by itself.
  return { collectionEnabled: false, restoreVerified: false };
}
