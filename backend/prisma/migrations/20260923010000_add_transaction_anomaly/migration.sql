ALTER TABLE "Transaction" ADD COLUMN "transactionTimeConfirmed" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN "anomalyRevision" INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN "anomalyPending" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Transaction" ADD CONSTRAINT "transaction_anomaly_revision_check" CHECK ("anomalyRevision" >= 0),
 ADD CONSTRAINT "transaction_time_confirmed_check" CHECK (NOT "transactionTimeConfirmed" OR "transactionTime" IS NOT NULL),
 ADD CONSTRAINT "transaction_anomaly_pending_check" CHECK (NOT "anomalyPending" OR type = 'expense');
CREATE INDEX "Transaction_userId_categoryId_transactionDate_idx" ON "Transaction" ("userId", "categoryId", "transactionDate");
-- Intentionally partial; Prisma schema cannot express this WHERE clause in current configuration.
CREATE INDEX "transaction_anomaly_pending_idx" ON "Transaction" ("userId", id) WHERE "anomalyPending" = true;
CREATE TABLE "AnomalyNotificationSetting" (
 "userId" TEXT PRIMARY KEY REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 enabled BOOLEAN NOT NULL DEFAULT false, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "AnomalyEvaluation" (
 id TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "originalTransactionId" TEXT NOT NULL, revision INTEGER NOT NULL CHECK (revision >= 0),
 "ruleVersion" VARCHAR(100) NOT NULL, "evaluatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 outcome VARCHAR(32) NOT NULL CHECK (outcome IN ('not_evaluated','not_flagged','flagged')),
 snapshot JSONB NOT NULL CHECK (jsonb_typeof(snapshot) = 'object')
);
CREATE UNIQUE INDEX "anomaly_evaluation_revision_key" ON "AnomalyEvaluation" ("userId","originalTransactionId",revision,"ruleVersion");
CREATE INDEX "AnomalyEvaluation_userId_originalTransactionId_revision_idx" ON "AnomalyEvaluation" ("userId","originalTransactionId",revision);
CREATE FUNCTION anomaly_evaluation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'AnomalyEvaluation is append-only'; END IF;
 IF NOT EXISTS (SELECT 1 FROM "Transaction" WHERE id=NEW."originalTransactionId" AND "userId"=NEW."userId" AND "anomalyRevision"=NEW.revision AND type='expense') THEN
  RAISE EXCEPTION 'AnomalyEvaluation source ownership or revision mismatch';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER anomaly_evaluation_guard BEFORE INSERT OR UPDATE OR DELETE ON "AnomalyEvaluation" FOR EACH ROW EXECUTE FUNCTION anomaly_evaluation_guard();
CREATE FUNCTION anomaly_numeric_median(values_sorted numeric[]) RETURNS numeric LANGUAGE SQL IMMUTABLE STRICT AS $$
 SELECT avg(value) FROM unnest(values_sorted) WITH ORDINALITY AS v(value,position)
 WHERE position IN ((cardinality(values_sorted)+1)/2, (cardinality(values_sorted)+2)/2)
$$;