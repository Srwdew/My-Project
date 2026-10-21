-- Additive: preserve legacy evaluation/review/receipt history verbatim.
CREATE TABLE "AnomalyIdentity" (
 "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 "transactionId" TEXT NOT NULL, "recordedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY ("userId","transactionId")
);
CREATE TABLE "AnomalyRevision" (
 "userId" TEXT NOT NULL, "transactionId" TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision>=0),
 snapshot JSONB NOT NULL CHECK(jsonb_typeof(snapshot)='object'),
 provenance TEXT NOT NULL CHECK(provenance IN ('migration_current','transaction_write')),
 "recordedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY ("userId","transactionId",revision),
 FOREIGN KEY ("userId","transactionId") REFERENCES "AnomalyIdentity" ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE FUNCTION anomaly_history_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Anomaly history is append-only'; END $$;
CREATE TRIGGER anomaly_identity_immutable BEFORE UPDATE OR DELETE ON "AnomalyIdentity" FOR EACH ROW EXECUTE FUNCTION anomaly_history_immutable();
CREATE TRIGGER anomaly_revision_immutable BEFORE UPDATE OR DELETE ON "AnomalyRevision" FOR EACH ROW EXECUTE FUNCTION anomaly_history_immutable();
-- Only observable current revisions are backfilled. No invented historical revisions.
INSERT INTO "AnomalyIdentity"("userId","transactionId") SELECT "userId",id FROM "Transaction";
INSERT INTO "AnomalyRevision"("userId","transactionId",revision,snapshot,provenance)
 SELECT "userId",id,"anomalyRevision",jsonb_build_object('categoryId',"categoryId",'amount',amount::text,'date',"transactionDate",'time',"transactionTime",'timeConfirmed',"transactionTimeConfirmed",'type',type),'migration_current' FROM "Transaction";
CREATE FUNCTION anomaly_capture_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.id<>OLD.id OR NEW."userId"<>OLD."userId" THEN RAISE EXCEPTION 'Transaction identity is immutable'; END IF;
  IF ROW(NEW."categoryId",NEW.amount,NEW."transactionDate",NEW."transactionTime",NEW."transactionTimeConfirmed",NEW.type)
    IS DISTINCT FROM ROW(OLD."categoryId",OLD.amount,OLD."transactionDate",OLD."transactionTime",OLD."transactionTimeConfirmed",OLD.type)
    AND NEW."anomalyRevision"<=OLD."anomalyRevision" THEN
    NEW."anomalyRevision":=OLD."anomalyRevision"+1;
    NEW."anomalyPending":=NEW.type='expense' AND EXISTS(SELECT 1 FROM "AnomalyNotificationSetting" WHERE "userId"=NEW."userId" AND enabled);
  END IF;
  IF NEW."anomalyRevision"<OLD."anomalyRevision" THEN RAISE EXCEPTION 'Revision cannot go backwards'; END IF;
  IF NEW."anomalyRevision"=OLD."anomalyRevision" THEN RETURN NEW; END IF;
 END IF;
 INSERT INTO "AnomalyIdentity"("userId","transactionId") VALUES(NEW."userId",NEW.id) ON CONFLICT DO NOTHING;
 INSERT INTO "AnomalyRevision"("userId","transactionId",revision,snapshot,provenance)
 VALUES(NEW."userId",NEW.id,NEW."anomalyRevision",jsonb_build_object('categoryId',NEW."categoryId",'amount',NEW.amount::text,'date',NEW."transactionDate",'time',NEW."transactionTime",'timeConfirmed',NEW."transactionTimeConfirmed",'type',NEW.type),'transaction_write');
 RETURN NEW;
END $$;
CREATE TRIGGER anomaly_capture_revision BEFORE INSERT OR UPDATE ON "Transaction" FOR EACH ROW EXECUTE FUNCTION anomaly_capture_revision();

CREATE TABLE "AnomalyDecision" (
 id TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 "evaluationId" TEXT NOT NULL, "originalTransactionId" TEXT NOT NULL,
 revision INTEGER NOT NULL CHECK(revision>=0), dimension TEXT NOT NULL CHECK(dimension IN ('amount','time')),
 action TEXT NOT NULL CHECK(action IN ('normal','occasional','problem')),
 sequence INTEGER NOT NULL CHECK(sequence>0), "supersedesId" TEXT,
 "decidedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE("userId",id), UNIQUE("userId","originalTransactionId",revision,dimension,sequence),
 FOREIGN KEY("userId","evaluationId",revision) REFERENCES "AnomalyEvaluation"("userId",id,revision) ON DELETE RESTRICT ON UPDATE RESTRICT,
 FOREIGN KEY("userId","supersedesId") REFERENCES "AnomalyDecision"("userId",id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 CHECK((sequence=1 AND "supersedesId" IS NULL) OR (sequence>1 AND "supersedesId" IS NOT NULL))
);
CREATE UNIQUE INDEX anomaly_decision_no_branch ON "AnomalyDecision"("supersedesId") WHERE "supersedesId" IS NOT NULL;
CREATE TABLE "AnomalyDecisionRequest" (
 "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 "idempotencyKey" UUID NOT NULL, fingerprint VARCHAR(64) NOT NULL, "decisionId" TEXT NOT NULL,
 status INTEGER NOT NULL CHECK(status IN (200,201)), "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY("userId","idempotencyKey"),
 FOREIGN KEY("userId","decisionId") REFERENCES "AnomalyDecision"("userId",id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE FUNCTION anomaly_decision_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE previous "AnomalyDecision"%ROWTYPE;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Decisions and receipts are append-only'; END IF;
 PERFORM id FROM "User" WHERE id=NEW."userId" AND "deletedAt" IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Decision account unavailable'; END IF;
 IF TG_TABLE_NAME='AnomalyDecision' THEN
  IF NOT EXISTS(SELECT 1 FROM "AnomalyEvaluation" WHERE id=NEW."evaluationId" AND "userId"=NEW."userId" AND revision=NEW.revision AND "originalTransactionId"=NEW."originalTransactionId") THEN
   RAISE EXCEPTION 'Decision evaluation identity mismatch';
  END IF;
  SELECT * INTO previous FROM "AnomalyDecision" WHERE "userId"=NEW."userId" AND "originalTransactionId"=NEW."originalTransactionId" AND revision=NEW.revision AND dimension=NEW.dimension ORDER BY sequence DESC LIMIT 1;
  IF NEW.sequence<>coalesce(previous.sequence,0)+1 OR NEW."supersedesId" IS DISTINCT FROM previous.id THEN RAISE EXCEPTION 'Decision supersession conflict'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER anomaly_decision_guard BEFORE INSERT OR UPDATE OR DELETE ON "AnomalyDecision" FOR EACH ROW EXECUTE FUNCTION anomaly_decision_guard();
CREATE TRIGGER anomaly_decision_request_guard BEFORE INSERT OR UPDATE OR DELETE ON "AnomalyDecisionRequest" FOR EACH ROW EXECUTE FUNCTION anomaly_decision_guard();

-- Separate dimension membership; legacy rows keep their documented bootstrap policy.
CREATE FUNCTION anomaly_dimension_exclusion(pending BOOLEAN,transaction_type TEXT,dimension_status TEXT,dimension_reason TEXT,decision_action TEXT,legacy_exclusion TEXT)
RETURNS TEXT LANGUAGE SQL IMMUTABLE AS $$
 SELECT CASE WHEN transaction_type<>'expense' THEN 'not_expense'
 WHEN pending THEN 'evaluation_pending'
 WHEN decision_action='problem' THEN 'confirmed_problem'
 WHEN decision_action='occasional' THEN 'confirmed_occasional'
 WHEN decision_action='normal' THEN NULL
 WHEN decision_action='legacy_problem' THEN 'confirmed_problem'
 WHEN decision_action='legacy_normal' THEN NULL
 WHEN dimension_status='flagged' THEN 'flagged_unreviewed'
 WHEN dimension_status='not_flagged' THEN NULL
 WHEN dimension_status='not_evaluated' AND dimension_reason IN ('amount_insufficient_history','time_insufficient_history','time_not_confirmed','global_gate_not_ready') THEN NULL
 WHEN dimension_status='not_evaluated' THEN 'evaluation_not_eligible'
 ELSE legacy_exclusion END
$$;
