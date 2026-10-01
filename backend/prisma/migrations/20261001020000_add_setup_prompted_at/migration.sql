-- Track the first Setup invitation independently from successful completion.
ALTER TABLE "User" ADD COLUMN "setupPromptedAt" TIMESTAMP(3);
