-- Invalidate only later evaluations whose prior-date window may include the changed row.
-- No historical evaluation is updated; reconciliation appends a new version.
CREATE FUNCTION anomaly_invalidate_successors() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner_id TEXT; source_id TEXT; old_day DATE; new_day DATE;
BEGIN
 IF TG_TABLE_NAME='Transaction' THEN
  IF TG_OP='UPDATE' AND ROW(NEW."categoryId",NEW.amount,NEW."transactionDate",NEW."transactionTime",NEW."transactionTimeConfirmed",NEW.type,NEW."anomalyRevision") IS NOT DISTINCT FROM ROW(OLD."categoryId",OLD.amount,OLD."transactionDate",OLD."transactionTime",OLD."transactionTimeConfirmed",OLD.type,OLD."anomalyRevision") AND NOT (OLD."anomalyPending" AND NOT NEW."anomalyPending") THEN RETURN NEW; END IF;
  IF TG_OP<>'INSERT' THEN owner_id:=OLD."userId";source_id:=OLD.id;old_day:=OLD."transactionDate"; END IF;
  IF TG_OP<>'DELETE' THEN owner_id:=NEW."userId";source_id:=NEW.id;new_day:=NEW."transactionDate"; END IF;
 ELSE
  owner_id:=NEW."userId";source_id:=NEW."originalTransactionId";
  SELECT "transactionDate" INTO new_day FROM "Transaction" WHERE id=source_id AND "userId"=owner_id AND "anomalyRevision"=NEW.revision;
 END IF;
 IF EXISTS(SELECT 1 FROM "AnomalyNotificationSetting" WHERE "userId"=owner_id AND enabled) THEN
  UPDATE "Transaction" t SET "anomalyPending"=true WHERE t."userId"=owner_id AND t.id<>source_id AND t.type='expense' AND NOT t."anomalyPending"
  AND ((t."transactionDate">old_day AND t."transactionDate"<=old_day+180) OR (t."transactionDate">new_day AND t."transactionDate"<=new_day+180))
  AND EXISTS(SELECT 1 FROM "AnomalyEvaluation" e WHERE e."userId"=owner_id AND e."originalTransactionId"=t.id AND e.revision=t."anomalyRevision");
 END IF;
 RETURN coalesce(NEW,OLD);
END $$;
CREATE TRIGGER anomaly_invalidate_successors AFTER INSERT OR UPDATE OR DELETE ON "Transaction" FOR EACH ROW EXECUTE FUNCTION anomaly_invalidate_successors();
CREATE TRIGGER anomaly_decision_invalidate AFTER INSERT ON "AnomalyDecision" FOR EACH ROW EXECUTE FUNCTION anomaly_invalidate_successors();
CREATE TRIGGER anomaly_review_invalidate AFTER INSERT ON "AnomalyReview" FOR EACH ROW EXECUTE FUNCTION anomaly_invalidate_successors();
