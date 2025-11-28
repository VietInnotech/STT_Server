-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_user_settings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "defaultDeleteAfterDays" INTEGER,
    "storageQuotaBytes" BIGINT NOT NULL DEFAULT 1073741824,
    "storageUsedBytes" BIGINT NOT NULL DEFAULT 0,
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
