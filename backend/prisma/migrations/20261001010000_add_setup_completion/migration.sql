-- Existing and new accounts remain incomplete until a successful Setup save.
ALTER TABLE "User" ADD COLUMN "setupCompletedAt" TIMESTAMP(3);
