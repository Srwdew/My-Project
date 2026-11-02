-- Recommendation Engine: provenance log of every recommendation shown, the user's own R8 saving-rate floor,
-- and per-user flexible-category flags (no row = fixed category).
--
-- Known drift, found 1 Nov 2026 and deliberately not fixed here: `prisma migrate diff` from a fully migrated
-- database to schema.prisma also reports two renames that predate this migration:
--   * index "AnomalyReview_userId_originalTransactionId_revision_sequence_ke" (63-char truncated) vs Prisma's
--     "AnomalyReview_userId_originalTransactionId_revision_sequenc_key"
--   * foreign key "Profile_primaryGoal_fkey" vs Prisma's "Profile_userId_primaryGoalId_fkey"
-- When generating a new migration, delete those two renames from the generated SQL unless fixing them is the task.
-- CreateEnum
CREATE TYPE "RecommendationAction" AS ENUM ('followed', 'dismissed', 'ignored');

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "savingRateFloorPercent" DECIMAL(5,2);

-- CreateTable
CREATE TABLE "recommendation_log" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ruleId" VARCHAR(8) NOT NULL,
    "ruleVersion" INTEGER NOT NULL,
    "cycleId" VARCHAR(16) NOT NULL,
    "inputs" JSONB NOT NULL,
    "computed" JSONB NOT NULL,
    "score" JSONB NOT NULL,
    "citationTier" INTEGER NOT NULL DEFAULT 1,
    "citationRef" TEXT,
    "shownAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAction" "RecommendationAction",
    "outcomeVerified" BOOLEAN,

    CONSTRAINT "recommendation_log_pkey" PRIMARY KEY ("id"),
    CONSTRAINT recommendation_rule CHECK ("ruleId" ~ '^R[1-9]$'),
    CONSTRAINT recommendation_version CHECK ("ruleVersion" >= 1),
    CONSTRAINT recommendation_citation CHECK ("citationTier" IN (1, 2))
);

-- CreateTable
CREATE TABLE "UserCategoryFlag" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "flexible" BOOLEAN NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserCategoryFlag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserCategoryFlag_userId_categoryId_key" ON "UserCategoryFlag"("userId", "categoryId");

-- AddForeignKey
ALTER TABLE "UserCategoryFlag" ADD CONSTRAINT "UserCategoryFlag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCategoryFlag" ADD CONSTRAINT "UserCategoryFlag_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "recommendation_log_userId_cycleId_idx" ON "recommendation_log"("userId", "cycleId");

-- CreateIndex
CREATE INDEX "recommendation_log_userId_ruleId_shownAt_idx" ON "recommendation_log"("userId", "ruleId", "shownAt");

-- AddForeignKey
ALTER TABLE "recommendation_log" ADD CONSTRAINT "recommendation_log_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
