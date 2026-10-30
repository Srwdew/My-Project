-- Goal icons: allow the five new keys added to the goal form (categoryKey enum in goalCalculations.ts).
ALTER TABLE "Goal" DROP CONSTRAINT goal_category;
ALTER TABLE "Goal" ADD CONSTRAINT goal_category CHECK ("categoryKey" IN ('home','car','travel','education','emergency','gift','gadget','health','savings','other'));
