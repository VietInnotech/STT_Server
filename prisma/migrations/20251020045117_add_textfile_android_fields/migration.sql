-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_text_files" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filename" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "encryptedData" BLOB NOT NULL,
    "encryptedIV" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'text/plain',
    "encoding" TEXT NOT NULL DEFAULT 'utf-8',
    "lineCount" INTEGER,
    "wordCount" INTEGER,
    "origin" TEXT NOT NULL DEFAULT 'web',
    "androidSummary" JSONB,
    "androidRealtime" JSONB,
    "deviceId" TEXT,
    "uploadedById" TEXT,
    "deleteAfterDays" INTEGER,
    "scheduledDeleteAt" DATETIME,
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "text_files_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "text_files_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_text_files" ("deleteAfterDays", "deviceId", "encoding", "encryptedData", "encryptedIV", "fileSize", "filename", "id", "lineCount", "mimeType", "originalName", "scheduledDeleteAt", "updatedAt", "uploadedAt", "uploadedById", "wordCount") SELECT "deleteAfterDays", "deviceId", "encoding", "encryptedData", "encryptedIV", "fileSize", "filename", "id", "lineCount", "mimeType", "originalName", "scheduledDeleteAt", "updatedAt", "uploadedAt", "uploadedById", "wordCount" FROM "text_files";
DROP TABLE "text_files";
ALTER TABLE "new_text_files" RENAME TO "text_files";
CREATE INDEX "text_files_uploadedAt_idx" ON "text_files"("uploadedAt");
CREATE INDEX "text_files_deviceId_idx" ON "text_files"("deviceId");
CREATE INDEX "text_files_uploadedById_idx" ON "text_files"("uploadedById");
CREATE INDEX "text_files_scheduledDeleteAt_idx" ON "text_files"("scheduledDeleteAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
