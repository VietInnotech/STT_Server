-- AlterTable
ALTER TABLE "file_shares" ADD COLUMN "expiresAt" DATETIME;
ALTER TABLE "file_shares" ADD COLUMN "expiresInDays" INTEGER;
