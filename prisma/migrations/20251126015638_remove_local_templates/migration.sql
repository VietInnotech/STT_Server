/*
  Warnings:

  - You are about to drop the `templates` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `defaultTemplateId` on the `user_settings` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "templates_ownerId_idx";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "templates";
PRAGMA foreign_keys=on;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_user_settings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "defaultDeleteAfterDays" INTEGER,
    "theme" TEXT DEFAULT 'light',
    "language" TEXT DEFAULT 'en',
    "timezone" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "user_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_user_settings" ("createdAt", "defaultDeleteAfterDays", "id", "language", "theme", "timezone", "updatedAt", "userId") SELECT "createdAt", "defaultDeleteAfterDays", "id", "language", "theme", "timezone", "updatedAt", "userId" FROM "user_settings";
DROP TABLE "user_settings";
ALTER TABLE "new_user_settings" RENAME TO "user_settings";
CREATE UNIQUE INDEX "user_settings_userId_key" ON "user_settings"("userId");
CREATE INDEX "user_settings_userId_idx" ON "user_settings"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
