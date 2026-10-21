CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');
ALTER TABLE "User" ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'USER',
                   ADD COLUMN "lastLoginAt" TIMESTAMP(3);
CREATE INDEX "User_role_deletedAt_createdAt_id_idx" ON "User"("role", "deletedAt", "createdAt", "id");
