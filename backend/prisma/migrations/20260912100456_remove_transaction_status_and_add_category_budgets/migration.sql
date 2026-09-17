/*
  Warnings:

  - You are about to drop the column `status` on the `Transaction` table. All the data in the column will be lost.

*/
BEGIN;

LOCK TABLE "Transaction" IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Transaction"
    WHERE "status"::text = 'planned'
  ) THEN
    RAISE EXCEPTION
      'Cannot remove status: planned transactions still exist';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "Transaction"
    WHERE "transactionDate" >
      (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date
  ) THEN
    RAISE EXCEPTION
      'Cannot remove status: future transactions still exist';
  END IF;
END
$$;


-- AlterTable
ALTER TABLE "Transaction" DROP COLUMN "status";

-- CreateTable
CREATE TABLE "CategoryBudget" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategoryBudget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CategoryBudget_categoryId_idx" ON "CategoryBudget"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "CategoryBudget_userId_year_month_categoryId_key" ON "CategoryBudget"("userId", "year", "month", "categoryId");

-- AddForeignKey
ALTER TABLE "CategoryBudget" ADD CONSTRAINT "CategoryBudget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryBudget" ADD CONSTRAINT "CategoryBudget_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
