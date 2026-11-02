-- ISSUE-ANOM-1 stage 1: level-shift detections (immutable) and the user's confirm/reject chain (append-only).
-- ⚠️ The same change adds levelShiftWindow/levelShiftRequired to ANOMALY_RULE, so RULE_VERSION changes:
-- reconcileAnomalies re-evaluates every past expense of users with anomaly notifications enabled.
-- Do NOT apply to the main database until the work is finished and the user approves. Isolated test DBs only.
-- Additive only: no existing row, function or trigger is changed. anomaly_dimension_exclusion is untouched.

-- AlterTable
ALTER TABLE "AnomalyDecision" ADD COLUMN     "levelShiftId" TEXT;

-- CreateTable
CREATE TABLE "AnomalyLevelShift" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "direction" VARCHAR(8) NOT NULL CHECK ("direction" IN ('up', 'down')),
    "startDate" DATE NOT NULL,
    "ruleVersion" VARCHAR(100) NOT NULL,
    "evidence" JSONB NOT NULL CHECK (jsonb_typeof("evidence") = 'object'),
    "detectedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AnomalyLevelShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnomalyLevelShiftAction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "levelShiftId" TEXT NOT NULL,
    "action" VARCHAR(16) NOT NULL CHECK ("action" IN ('confirmed', 'rejected')),
    "sequence" INTEGER NOT NULL CHECK ("sequence" >= 1),
    "supersedesId" TEXT,
    "decidedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AnomalyLevelShiftAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnomalyLevelShift_userId_categoryId_direction_idx" ON "AnomalyLevelShift"("userId", "categoryId", "direction");
CREATE UNIQUE INDEX "AnomalyLevelShift_userId_id_key" ON "AnomalyLevelShift"("userId", "id");
CREATE UNIQUE INDEX "AnomalyLevelShiftAction_userId_id_key" ON "AnomalyLevelShiftAction"("userId", "id");
CREATE UNIQUE INDEX "AnomalyLevelShiftAction_userId_levelShiftId_sequence_key" ON "AnomalyLevelShiftAction"("userId", "levelShiftId", "sequence");

-- AddForeignKey
ALTER TABLE "AnomalyDecision" ADD CONSTRAINT "AnomalyDecision_userId_levelShiftId_fkey" FOREIGN KEY ("userId", "levelShiftId") REFERENCES "AnomalyLevelShift"("userId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "AnomalyLevelShift" ADD CONSTRAINT "AnomalyLevelShift_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "AnomalyLevelShift" ADD CONSTRAINT "AnomalyLevelShift_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "AnomalyLevelShiftAction" ADD CONSTRAINT "AnomalyLevelShiftAction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "AnomalyLevelShiftAction" ADD CONSTRAINT "AnomalyLevelShiftAction_userId_levelShiftId_fkey" FOREIGN KEY ("userId", "levelShiftId") REFERENCES "AnomalyLevelShift"("userId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "AnomalyLevelShiftAction" ADD CONSTRAINT "AnomalyLevelShiftAction_userId_supersedesId_fkey" FOREIGN KEY ("userId", "supersedesId") REFERENCES "AnomalyLevelShiftAction"("userId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Detections never change.
CREATE TRIGGER anomaly_level_shift_immutable BEFORE UPDATE OR DELETE ON "AnomalyLevelShift" FOR EACH ROW EXECUTE FUNCTION anomaly_history_immutable();

-- Actions are insert-only and form one unbroken chain per shift (same rule as anomaly_decision_guard).
CREATE FUNCTION anomaly_level_shift_action_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE previous "AnomalyLevelShiftAction"%ROWTYPE;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Level-shift actions are append-only'; END IF;
 PERFORM id FROM "User" WHERE id=NEW."userId" AND "deletedAt" IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Level-shift account unavailable'; END IF;
 SELECT * INTO previous FROM "AnomalyLevelShiftAction" WHERE "userId"=NEW."userId" AND "levelShiftId"=NEW."levelShiftId" ORDER BY sequence DESC LIMIT 1;
 IF NEW.sequence<>coalesce(previous.sequence,0)+1 OR NEW."supersedesId" IS DISTINCT FROM previous.id THEN RAISE EXCEPTION 'Level-shift action supersession conflict'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER anomaly_level_shift_action_guard BEFORE INSERT OR UPDATE OR DELETE ON "AnomalyLevelShiftAction" FOR EACH ROW EXECUTE FUNCTION anomaly_level_shift_action_guard();
