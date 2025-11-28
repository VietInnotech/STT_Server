-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_text_file_pairs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "summaryFileId" TEXT,
    "realtimeFileId" TEXT NOT NULL,
    "uploadedById" TEXT,
    "deleteAfterDays" INTEGER,
    "scheduledDeleteAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "text_file_pairs_summaryFileId_fkey" FOREIGN KEY ("summaryFileId") REFERENCES "text_files" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "text_file_pairs_realtimeFileId_fkey" FOREIGN KEY ("realtimeFileId") REFERENCES "text_files" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "text_file_pairs_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_text_file_pairs" ("createdAt", "deleteAfterDays", "id", "name", "realtimeFileId", "scheduledDeleteAt", "summaryFileId", "updatedAt", "uploadedById") SELECT "createdAt", "deleteAfterDays", "id", "name", "realtimeFileId", "scheduledDeleteAt", "summaryFileId", "updatedAt", "uploadedById" FROM "text_file_pairs";
DROP TABLE "text_file_pairs";
ALTER TABLE "new_text_file_pairs" RENAME TO "text_file_pairs";
CREATE UNIQUE INDEX "text_file_pairs_summaryFileId_key" ON "text_file_pairs"("summaryFileId");
CREATE UNIQUE INDEX "text_file_pairs_realtimeFileId_key" ON "text_file_pairs"("realtimeFileId");
CREATE INDEX "text_file_pairs_uploadedById_idx" ON "text_file_pairs"("uploadedById");
CREATE INDEX "text_file_pairs_createdAt_idx" ON "text_file_pairs"("createdAt");
CREATE INDEX "text_file_pairs_scheduledDeleteAt_idx" ON "text_file_pairs"("scheduledDeleteAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
