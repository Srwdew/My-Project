CREATE UNIQUE INDEX "AnomalyEvaluation_userId_id_revision_key" ON "AnomalyEvaluation" ("userId",id,revision);
CREATE TABLE "AnomalyReview" (
 id TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "evaluationId" TEXT NOT NULL,
 "originalTransactionId" TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision>=0),
 action VARCHAR(32) NOT NULL CHECK(action IN ('confirmed_normal','confirmed_problem')),
 sequence INTEGER NOT NULL CHECK(sequence>0), "reviewedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 FOREIGN KEY ("userId","evaluationId",revision) REFERENCES "AnomalyEvaluation"("userId",id,revision) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "AnomalyReview_userId_id_key" ON "AnomalyReview"("userId",id);
CREATE UNIQUE INDEX "AnomalyReview_userId_originalTransactionId_revision_sequence_key" ON "AnomalyReview"("userId","originalTransactionId",revision,sequence);
CREATE TABLE "AnomalyReviewRequest" (
 "userId" TEXT NOT NULL, "idempotencyKey" UUID NOT NULL, "requestFingerprint" VARCHAR(64) NOT NULL,
 "reviewId" TEXT NOT NULL, "responseStatus" INTEGER NOT NULL CHECK("responseStatus" IN (200,201)),
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY("userId","idempotencyKey"),
 FOREIGN KEY("userId") REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 FOREIGN KEY("userId","reviewId") REFERENCES "AnomalyReview"("userId",id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX "AnomalyReviewRequest_userId_reviewId_idx" ON "AnomalyReviewRequest"("userId","reviewId");
CREATE FUNCTION anomaly_review_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE last_sequence INTEGER; last_action TEXT;
BEGIN
 IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Anomaly review history is append-only'; END IF;
 PERFORM id FROM "User" WHERE id=NEW."userId" AND "deletedAt" IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Review user unavailable'; END IF;
 IF TG_TABLE_NAME='AnomalyReview' THEN
  IF NOT EXISTS(SELECT 1 FROM "AnomalyEvaluation" WHERE id=NEW."evaluationId" AND "userId"=NEW."userId" AND revision=NEW.revision AND "originalTransactionId"=NEW."originalTransactionId") THEN
   RAISE EXCEPTION 'Review evaluation identity mismatch';
  END IF;
  SELECT sequence,action INTO last_sequence,last_action FROM "AnomalyReview" WHERE "userId"=NEW."userId" AND "originalTransactionId"=NEW."originalTransactionId" AND revision=NEW.revision ORDER BY sequence DESC LIMIT 1;
  IF NEW.sequence<>coalesce(last_sequence,0)+1 OR NEW.action=last_action THEN RAISE EXCEPTION 'Review sequence conflict or duplicate action'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER anomaly_review_guard BEFORE INSERT OR UPDATE OR DELETE ON "AnomalyReview" FOR EACH ROW EXECUTE FUNCTION anomaly_review_guard();
CREATE TRIGGER anomaly_review_request_guard BEFORE INSERT OR UPDATE OR DELETE ON "AnomalyReviewRequest" FOR EACH ROW EXECUTE FUNCTION anomaly_review_guard();
-- NULL means eligible. Shared by aggregate queries and the detail endpoint.
CREATE FUNCTION anomaly_amount_exclusion(pending BOOLEAN,transaction_type TEXT,outcome TEXT,amount_reason TEXT,review_action TEXT)
RETURNS TEXT LANGUAGE SQL IMMUTABLE AS $$
 SELECT CASE
 WHEN transaction_type<>'expense' THEN 'not_expense'
 WHEN pending THEN 'evaluation_pending'
 WHEN review_action='confirmed_problem' THEN 'confirmed_problem'
 WHEN review_action='confirmed_normal' THEN NULL
 WHEN outcome='flagged' THEN 'flagged_unreviewed'
 WHEN outcome IS NULL OR outcome='not_flagged' THEN NULL
 WHEN outcome='not_evaluated' AND amount_reason='amount_insufficient_history' THEN NULL
 ELSE 'evaluation_not_eligible' END
$$;