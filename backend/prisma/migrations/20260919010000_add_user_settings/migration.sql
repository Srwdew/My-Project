-- Preserve legacy planning text; never create financial transactions or goals.
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM "Profile" WHERE income IS NOT NULL AND (income::text IN ('NaN','Infinity','-Infinity') OR income < 0 OR income > 9999999999.99 OR income::numeric <> round(income::numeric,2))) THEN
 RAISE EXCEPTION 'Legacy planning income needs explicit review before Decimal conversion'; END IF;
END $$;
ALTER TABLE "User" ADD COLUMN "authVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Profile" ALTER COLUMN "income" TYPE DECIMAL(12,2) USING income::numeric;
ALTER TABLE "Profile" ADD COLUMN "paydayDay" INTEGER, ADD COLUMN "primaryGoalId" TEXT, ADD COLUMN "avatarData" BYTEA, ADD COLUMN "avatarMime" VARCHAR(32);
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_payday_check" CHECK ("paydayDay" BETWEEN 1 AND 31);
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_income_check" CHECK (income >= 0);
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_avatar_check" CHECK (("avatarData" IS NULL AND "avatarMime" IS NULL) OR ("avatarData" IS NOT NULL AND "avatarMime" IS NOT NULL AND "avatarMime" IN ('image/jpeg','image/png','image/webp') AND octet_length("avatarData") BETWEEN 1 AND 1048576));
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_primaryGoal_fkey" FOREIGN KEY ("userId", "primaryGoalId") REFERENCES "Goal"("userId", id) ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE INDEX "Profile_userId_primaryGoalId_idx" ON "Profile"("userId", "primaryGoalId");
ALTER TABLE "BudgetNotificationSetting" ADD COLUMN "notifyNearLimit" BOOLEAN NOT NULL DEFAULT false;
UPDATE "BudgetNotificationSetting" SET "notifyNearLimit" = enabled, "notifyExceeded" = enabled AND "notifyExceeded";
ALTER TABLE "BudgetNotificationSetting" ALTER COLUMN "notifyExceeded" SET DEFAULT false;
ALTER TABLE "BudgetNotificationSetting" ADD CONSTRAINT "BudgetNotificationSetting_enabled_check" CHECK (enabled = ("notifyNearLimit" OR "notifyExceeded"));
