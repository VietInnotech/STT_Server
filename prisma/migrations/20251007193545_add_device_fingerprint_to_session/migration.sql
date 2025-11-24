/*
  Warnings:

  - A unique constraint covering the columns `[deviceFingerprint]` on the table `sessions` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "sessions" ADD COLUMN "deviceFingerprint" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "sessions_deviceFingerprint_key" ON "sessions"("deviceFingerprint");
