-- CreateEnum
CREATE TYPE "GoalSourceKind" AS ENUM ('OPENING_BALANCE', 'INCOME_TRANSACTION');

-- CreateEnum
CREATE TYPE "GoalEntryKind" AS ENUM ('ALLOCATE', 'RELEASE');

-- CreateEnum
CREATE TYPE "GoalOperationKind" AS ENUM ('CREATE_GOAL', 'ALLOCATE', 'RELEASE', 'CORRECT_ALLOCATION', 'CREATE_OPENING_BALANCE', 'CORRECT_OPENING_BALANCE');

-- CreateTable
CREATE TABLE "Goal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "targetAmount" DECIMAL(12,2) NOT NULL,
    "targetDate" DATE,
    "plannedMonthlyAmount" DECIMAL(12,2),
    "categoryKey" VARCHAR(40) NOT NULL,
    "note" VARCHAR(1000),
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoalFundingSource" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "GoalSourceKind" NOT NULL,
    "sourceKey" VARCHAR(100) NOT NULL,
    "openingAmount" DECIMAL(12,2),
    "cutoffDate" DATE,
    "note" VARCHAR(1000),
    "originalTransactionId" TEXT,
    "transactionId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "GoalFundingSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoalOperation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "idempotencyKey" VARCHAR(100) NOT NULL,
    "kind" "GoalOperationKind" NOT NULL,
    "requestHash" VARCHAR(64) NOT NULL,
    "reason" VARCHAR(1000),
    "correctsOperationId" TEXT,
    "responseStatus" INTEGER NOT NULL,
    "responseBody" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoalOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoalLedgerEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "kind" "GoalEntryKind" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "allocationId" TEXT,
    "sourceSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoalLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoalOpeningRevision" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "beforeAmount" DECIMAL(12,2),
    "afterAmount" DECIMAL(12,2) NOT NULL,
    "beforeCutoffDate" DATE,
    "afterCutoffDate" DATE NOT NULL,
    "beforeNote" VARCHAR(1000),
    "afterNote" VARCHAR(1000) NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoalOpeningRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Goal_userId_archivedAt_createdAt_id_idx" ON "Goal"("userId", "archivedAt", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Goal_userId_id_key" ON "Goal"("userId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "GoalFundingSource_transactionId_key" ON "GoalFundingSource"("transactionId");

-- CreateIndex
CREATE INDEX "GoalFundingSource_userId_kind_idx" ON "GoalFundingSource"("userId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "GoalFundingSource_userId_id_key" ON "GoalFundingSource"("userId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "GoalFundingSource_userId_sourceKey_key" ON "GoalFundingSource"("userId", "sourceKey");

-- CreateIndex
CREATE INDEX "GoalOperation_userId_createdAt_id_idx" ON "GoalOperation"("userId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "GoalOperation_userId_correctsOperationId_idx" ON "GoalOperation"("userId", "correctsOperationId");

-- CreateIndex
CREATE UNIQUE INDEX "GoalOperation_userId_id_key" ON "GoalOperation"("userId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "GoalOperation_userId_idempotencyKey_key" ON "GoalOperation"("userId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "GoalLedgerEntry_userId_goalId_createdAt_id_idx" ON "GoalLedgerEntry"("userId", "goalId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "GoalLedgerEntry_userId_sourceId_kind_idx" ON "GoalLedgerEntry"("userId", "sourceId", "kind");

-- CreateIndex
CREATE INDEX "GoalLedgerEntry_userId_goalId_sourceId_allocationId_idx" ON "GoalLedgerEntry"("userId", "goalId", "sourceId", "allocationId");

-- CreateIndex
CREATE UNIQUE INDEX "GoalLedgerEntry_userId_goalId_sourceId_id_key" ON "GoalLedgerEntry"("userId", "goalId", "sourceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "GoalLedgerEntry_operationId_sequence_key" ON "GoalLedgerEntry"("operationId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "GoalOpeningRevision_operationId_key" ON "GoalOpeningRevision"("operationId");

-- CreateIndex
CREATE INDEX "GoalOpeningRevision_userId_sourceId_createdAt_id_idx" ON "GoalOpeningRevision"("userId", "sourceId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "GoalOpeningRevision_userId_operationId_key" ON "GoalOpeningRevision"("userId", "operationId");

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "GoalFundingSource" ADD CONSTRAINT "GoalFundingSource_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "GoalFundingSource" ADD CONSTRAINT "GoalFundingSource_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "GoalOperation" ADD CONSTRAINT "GoalOperation_userId_correctsOperationId_fkey" FOREIGN KEY ("userId", "correctsOperationId") REFERENCES "GoalOperation"("userId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "GoalOperation" ADD CONSTRAINT "GoalOperation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "GoalLedgerEntry" ADD CONSTRAINT "GoalLedgerEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "GoalLedgerEntry" ADD CONSTRAINT "GoalLedgerEntry_userId_goalId_fkey" FOREIGN KEY ("userId", "goalId") REFERENCES "Goal"("userId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "GoalLedgerEntry" ADD CONSTRAINT "GoalLedgerEntry_userId_sourceId_fkey" FOREIGN KEY ("userId", "sourceId") REFERENCES "GoalFundingSource"("userId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "GoalLedgerEntry" ADD CONSTRAINT "GoalLedgerEntry_userId_operationId_fkey" FOREIGN KEY ("userId", "operationId") REFERENCES "GoalOperation"("userId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "GoalLedgerEntry" ADD CONSTRAINT "GoalLedgerEntry_userId_goalId_sourceId_allocationId_fkey" FOREIGN KEY ("userId", "goalId", "sourceId", "allocationId") REFERENCES "GoalLedgerEntry"("userId", "goalId", "sourceId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "GoalOpeningRevision" ADD CONSTRAINT "GoalOpeningRevision_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "GoalOpeningRevision" ADD CONSTRAINT "GoalOpeningRevision_userId_sourceId_fkey" FOREIGN KEY ("userId", "sourceId") REFERENCES "GoalFundingSource"("userId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "GoalOpeningRevision" ADD CONSTRAINT "GoalOpeningRevision_userId_operationId_fkey" FOREIGN KEY ("userId", "operationId") REFERENCES "GoalOperation"("userId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
-- This is an empty migration.
-- Financial checks not expressible in Prisma schema.
ALTER TABLE "Goal" ADD CONSTRAINT goal_amounts CHECK ("targetAmount" > 0 AND ("plannedMonthlyAmount" IS NULL OR "plannedMonthlyAmount" > 0)), ADD CONSTRAINT goal_category CHECK ("categoryKey" IN ('home','travel','education','emergency','other'));
ALTER TABLE "GoalFundingSource" ADD CONSTRAINT source_shape CHECK (
 (kind = 'OPENING_BALANCE' AND "sourceKey" = 'opening' AND "openingAmount" >= 0 AND "openingAmount" IS NOT NULL AND "cutoffDate" IS NOT NULL AND note IS NOT NULL AND length(trim(note)) > 0 AND "originalTransactionId" IS NULL AND "transactionId" IS NULL)
 OR (kind = 'INCOME_TRANSACTION' AND "originalTransactionId" IS NOT NULL AND "sourceKey" = 'income:' || "originalTransactionId" AND "openingAmount" IS NULL AND "cutoffDate" IS NULL AND note IS NULL AND ("transactionId" IS NULL OR "transactionId" = "originalTransactionId")));
ALTER TABLE "GoalLedgerEntry" ADD CONSTRAINT ledger_amount CHECK (amount > 0 AND sequence > 0), ADD CONSTRAINT ledger_kind CHECK ((kind = 'ALLOCATE' AND "allocationId" IS NULL) OR (kind = 'RELEASE' AND "allocationId" IS NOT NULL));
ALTER TABLE "GoalOpeningRevision" ADD CONSTRAINT revision_amount CHECK ("afterAmount" >= 0 AND ("beforeAmount" IS NULL OR "beforeAmount" >= 0)), ADD CONSTRAINT revision_reason CHECK (length(trim(reason)) > 0);
ALTER TABLE "GoalOperation" ADD CONSTRAINT operation_success CHECK ("responseStatus" BETWEEN 200 AND 299);

CREATE FUNCTION goals_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Goals financial history is append-only' USING ERRCODE = '23514'; END $$;
CREATE TRIGGER goals_ledger_append_only BEFORE UPDATE OR DELETE ON "GoalLedgerEntry" FOR EACH ROW EXECUTE FUNCTION goals_append_only();
CREATE TRIGGER goals_operation_append_only BEFORE UPDATE OR DELETE ON "GoalOperation" FOR EACH ROW EXECUTE FUNCTION goals_append_only();
CREATE TRIGGER goals_revision_append_only BEFORE UPDATE OR DELETE ON "GoalOpeningRevision" FOR EACH ROW EXECUTE FUNCTION goals_append_only();

CREATE FUNCTION goals_source_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE reserved numeric; owner_id text;
BEGIN
 IF TG_OP = 'UPDATE' AND (NEW.id,NEW."userId",NEW.kind,NEW."sourceKey",NEW."originalTransactionId") IS DISTINCT FROM (OLD.id,OLD."userId",OLD.kind,OLD."sourceKey",OLD."originalTransactionId") THEN
  RAISE EXCEPTION 'Source identity is immutable' USING ERRCODE = '23514';
 END IF;
 IF NEW."transactionId" IS NOT NULL THEN
  SELECT "userId" INTO owner_id FROM "Transaction" WHERE id=NEW."transactionId";
  IF owner_id IS DISTINCT FROM NEW."userId" THEN RAISE EXCEPTION 'Source owner mismatch' USING ERRCODE = '23514'; END IF;
 END IF;
 IF TG_OP='UPDATE' AND OLD."transactionId" IS NULL AND NEW."transactionId" IS NOT NULL THEN RAISE EXCEPTION 'Detached source cannot be relinked' USING ERRCODE='23514'; END IF;
 IF NEW.kind='OPENING_BALANCE' THEN
  SELECT COALESCE(SUM(CASE WHEN kind='ALLOCATE' THEN amount ELSE -amount END),0) INTO reserved FROM "GoalLedgerEntry" WHERE "sourceId"=NEW.id;
  IF NEW."openingAmount" < reserved THEN RAISE EXCEPTION 'Opening balance below allocated' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' AND NEW."cutoffDate" IS DISTINCT FROM OLD."cutoffDate" AND EXISTS(SELECT 1 FROM "GoalLedgerEntry" WHERE "sourceId"=NEW.id) THEN RAISE EXCEPTION 'Opening cutoff is locked' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER goals_source_identity_owner BEFORE INSERT OR UPDATE ON "GoalFundingSource" FOR EACH ROW EXECUTE FUNCTION goals_source_guard();

CREATE FUNCTION goals_transaction_owner_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."userId" IS DISTINCT FROM OLD."userId" AND EXISTS(SELECT 1 FROM "GoalFundingSource" WHERE "transactionId"=OLD.id) THEN RAISE EXCEPTION 'Funding transaction ownership is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER goals_transaction_owner BEFORE UPDATE ON "Transaction" FOR EACH ROW EXECUTE FUNCTION goals_transaction_owner_guard();

CREATE FUNCTION goals_release_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE lot "GoalLedgerEntry";
BEGIN
 IF NEW.kind='RELEASE' THEN
  SELECT * INTO lot FROM "GoalLedgerEntry" WHERE id=NEW."allocationId";
  IF lot.kind IS DISTINCT FROM 'ALLOCATE'::"GoalEntryKind" THEN RAISE EXCEPTION 'Release must reference allocation' USING ERRCODE='23514'; END IF;
  IF NEW.amount + COALESCE((SELECT SUM(amount) FROM "GoalLedgerEntry" WHERE "allocationId"=lot.id),0) > lot.amount THEN RAISE EXCEPTION 'Release exceeds lot' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER goals_release_lot BEFORE INSERT ON "GoalLedgerEntry" FOR EACH ROW EXECUTE FUNCTION goals_release_guard();

