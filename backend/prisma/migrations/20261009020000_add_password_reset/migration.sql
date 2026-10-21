CREATE TABLE "PasswordResetToken" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL UNIQUE,
  "authVersionAtIssue" INTEGER NOT NULL CHECK ("authVersionAtIssue" >= 0),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PasswordResetToken_hash_check" CHECK ("tokenHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "PasswordResetToken_expiry_check" CHECK ("expiresAt" > "createdAt"),
  CONSTRAINT "PasswordResetToken_terminal_check" CHECK ("usedAt" IS NULL OR "revokedAt" IS NULL)
);
CREATE INDEX "PasswordResetToken_userId_expiresAt_idx" ON "PasswordResetToken"("userId","expiresAt");
CREATE TABLE "PasswordResetRateLimit" (
  "scope" TEXT NOT NULL,
  "subjectHash" TEXT NOT NULL,
  "windowStart" TIMESTAMP(3) NOT NULL,
  "hits" INTEGER NOT NULL CHECK ("hits">0),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  PRIMARY KEY ("scope","subjectHash","windowStart"),
  CONSTRAINT "PasswordResetRateLimit_hash_check" CHECK ("subjectHash" ~ '^[0-9a-f]{64}$')
);
CREATE INDEX "PasswordResetRateLimit_expiresAt_idx" ON "PasswordResetRateLimit"("expiresAt");
