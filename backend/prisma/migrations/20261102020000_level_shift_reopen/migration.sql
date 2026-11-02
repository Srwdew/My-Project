-- ISSUE-ANOM-1: after two rejections in a row the system stops asking; "reopened" (from Settings) lifts that.
-- It is one more link in the append-only chain, never an edit. Same ⚠️ as 20261102010000: isolated test DBs only.
ALTER TABLE "AnomalyLevelShiftAction" DROP CONSTRAINT "AnomalyLevelShiftAction_action_check";
ALTER TABLE "AnomalyLevelShiftAction" ADD CONSTRAINT "AnomalyLevelShiftAction_action_check" CHECK ("action" IN ('confirmed', 'rejected', 'reopened'));
