-- Manual cadence patterns only. Automatic amount matching remains disabled.
CREATE TABLE "AnomalyPattern" (
 id TEXT PRIMARY KEY,"userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE("userId",id)
);
CREATE TABLE "AnomalyPatternEvent" (
 id TEXT PRIMARY KEY,"userId" TEXT NOT NULL,"patternId" TEXT NOT NULL,
 sequence INTEGER NOT NULL CHECK(sequence>0),"supersedesId" TEXT UNIQUE,
 kind TEXT NOT NULL CHECK(kind IN ('create','occurrence','lifecycle','restore')),
 snapshot JSONB NOT NULL CHECK(jsonb_typeof(snapshot)='object'),
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE("userId",id),UNIQUE("userId","patternId",sequence),
 FOREIGN KEY("userId","patternId") REFERENCES "AnomalyPattern"("userId",id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 FOREIGN KEY("userId","supersedesId") REFERENCES "AnomalyPatternEvent"("userId",id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 CHECK((sequence=1 AND "supersedesId" IS NULL AND kind='create') OR(sequence>1 AND "supersedesId" IS NOT NULL AND kind<>'create'))
);
CREATE TABLE "AnomalyPatternRequest"(
 "userId" TEXT NOT NULL,"idempotencyKey" UUID NOT NULL,fingerprint VARCHAR(64) NOT NULL,"eventId" TEXT NOT NULL,
 PRIMARY KEY("userId","idempotencyKey"),
 FOREIGN KEY("userId","eventId") REFERENCES "AnomalyPatternEvent"("userId",id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE TRIGGER anomaly_pattern_immutable BEFORE UPDATE OR DELETE ON "AnomalyPattern" FOR EACH ROW EXECUTE FUNCTION anomaly_history_immutable();
CREATE TRIGGER anomaly_pattern_request_immutable BEFORE UPDATE OR DELETE ON "AnomalyPatternRequest" FOR EACH ROW EXECUTE FUNCTION anomaly_history_immutable();
CREATE FUNCTION anomaly_pattern_event_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE prior "AnomalyPatternEvent"%ROWTYPE;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Pattern history is append-only'; END IF;
 PERFORM id FROM "User" WHERE id=NEW."userId" AND "deletedAt" IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Pattern account unavailable'; END IF;
 SELECT * INTO prior FROM "AnomalyPatternEvent" WHERE "userId"=NEW."userId" AND "patternId"=NEW."patternId" ORDER BY sequence DESC LIMIT 1;
 IF NEW.sequence<>coalesce(prior.sequence,0)+1 OR NEW."supersedesId" IS DISTINCT FROM prior.id THEN RAISE EXCEPTION 'Pattern supersession conflict'; END IF;
 IF NEW.snapshot->>'status' NOT IN ('active','paused','expired') OR NOT (NEW.snapshot ? 'status') THEN RAISE EXCEPTION 'Invalid pattern status'; END IF;
 IF NEW.snapshot->>'cadence' NOT IN ('weekly','fortnightly','monthly','quarterly','half_yearly','yearly') OR NOT (NEW.snapshot ? 'cadence') THEN RAISE EXCEPTION 'Invalid cadence'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER anomaly_pattern_event_guard BEFORE INSERT OR UPDATE OR DELETE ON "AnomalyPatternEvent" FOR EACH ROW EXECUTE FUNCTION anomaly_pattern_event_guard();
ALTER TABLE "AnomalyDecision" ADD COLUMN "patternId" TEXT,
 ADD FOREIGN KEY("userId","patternId") REFERENCES "AnomalyPattern"("userId",id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "AnomalyDecision" DROP CONSTRAINT "AnomalyDecision_action_check";
ALTER TABLE "AnomalyDecision" ADD CHECK(action IN ('normal','occasional','problem','recurring')),
 ADD CHECK((action='recurring')=("patternId" IS NOT NULL));
CREATE OR REPLACE FUNCTION anomaly_dimension_exclusion(pending BOOLEAN,transaction_type TEXT,dimension_status TEXT,dimension_reason TEXT,decision_action TEXT,legacy_exclusion TEXT)
RETURNS TEXT LANGUAGE SQL IMMUTABLE AS $$
 SELECT CASE WHEN transaction_type<>'expense' THEN 'not_expense'
 WHEN pending THEN 'evaluation_pending'
 WHEN decision_action='problem' THEN 'confirmed_problem'
 WHEN decision_action='occasional' THEN 'confirmed_occasional'
 WHEN decision_action='recurring' THEN 'confirmed_recurring'
 WHEN decision_action='normal' THEN NULL
 WHEN decision_action='legacy_problem' THEN 'confirmed_problem'
 WHEN decision_action='legacy_normal' THEN NULL
 WHEN dimension_status='flagged' THEN 'flagged_unreviewed'
 WHEN dimension_status='not_flagged' THEN NULL
 WHEN dimension_status='not_evaluated' AND dimension_reason IN ('amount_insufficient_history','time_insufficient_history','time_not_confirmed','global_gate_not_ready') THEN NULL
 WHEN dimension_status='not_evaluated' THEN 'evaluation_not_eligible'
 ELSE legacy_exclusion END
$$;
