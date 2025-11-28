-- AlterTable
ALTER TABLE "user_settings" ADD COLUMN "defaultAudioDeleteAfterDays" INTEGER;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_audio_files" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filename" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "encryptedData" BLOB,
    "encryptedIV" TEXT NOT NULL,
    "filePath" TEXT,
    "mimeType" TEXT NOT NULL DEFAULT 'audio/wav',
    "duration" REAL,
    "sampleRate" INTEGER,
    "channels" INTEGER,
    "bitrate" INTEGER,
    "deviceId" TEXT,
    "uploadedById" TEXT,
    "deleteAfterDays" INTEGER,
    "scheduledDeleteAt" DATETIME,
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "audio_files_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "audio_files_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_audio_files" ("bitrate", "channels", "deleteAfterDays", "deviceId", "duration", "encryptedData", "encryptedIV", "fileSize", "filename", "id", "mimeType", "originalName", "sampleRate", "scheduledDeleteAt", "updatedAt", "uploadedAt", "uploadedById") SELECT "bitrate", "channels", "deleteAfterDays", "deviceId", "duration", "encryptedData", "encryptedIV", "fileSize", "filename", "id", "mimeType", "originalName", "sampleRate", "scheduledDeleteAt", "updatedAt", "uploadedAt", "uploadedById" FROM "audio_files";
DROP TABLE "audio_files";
ALTER TABLE "new_audio_files" RENAME TO "audio_files";
CREATE INDEX "audio_files_uploadedAt_idx" ON "audio_files"("uploadedAt");
CREATE INDEX "audio_files_deviceId_idx" ON "audio_files"("deviceId");
CREATE INDEX "audio_files_uploadedById_idx" ON "audio_files"("uploadedById");
CREATE INDEX "audio_files_scheduledDeleteAt_idx" ON "audio_files"("scheduledDeleteAt");
CREATE TABLE "new_processing_results" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT,
    "templateId" TEXT,
    "templateName" TEXT,
    "maieTaskId" TEXT,
    "maieStatus" TEXT,
    "sourceAudioId" TEXT,
    "sourceTextFilePairId" TEXT,
    "summaryData" BLOB,
    "summaryIv" TEXT,
    "transcriptData" BLOB,
    "transcriptIv" TEXT,
    "summaryPreview" TEXT,
    "summarySize" INTEGER,
    "transcriptSize" INTEGER,
    "confidence" REAL,
    "processingTime" REAL,
    "audioDuration" REAL,
    "rtf" REAL,
    "rawMaieOutput" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "errorMessage" TEXT,
    "errorCode" TEXT,
    "deviceId" TEXT,
    "uploadedById" TEXT,
    "processedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deleteAfterDays" INTEGER,
    "scheduledDeleteAt" DATETIME,
    CONSTRAINT "processing_results_sourceAudioId_fkey" FOREIGN KEY ("sourceAudioId") REFERENCES "audio_files" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "processing_results_sourceTextFilePairId_fkey" FOREIGN KEY ("sourceTextFilePairId") REFERENCES "text_file_pairs" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "processing_results_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "processing_results_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_processing_results" ("audioDuration", "confidence", "createdAt", "deleteAfterDays", "deviceId", "errorCode", "errorMessage", "id", "maieStatus", "maieTaskId", "processedAt", "processingTime", "rawMaieOutput", "rtf", "scheduledDeleteAt", "sourceAudioId", "status", "summaryData", "summaryIv", "summaryPreview", "summarySize", "templateId", "templateName", "title", "transcriptData", "transcriptIv", "transcriptSize", "updatedAt", "uploadedById") SELECT "audioDuration", "confidence", "createdAt", "deleteAfterDays", "deviceId", "errorCode", "errorMessage", "id", "maieStatus", "maieTaskId", "processedAt", "processingTime", "rawMaieOutput", "rtf", "scheduledDeleteAt", "sourceAudioId", "status", "summaryData", "summaryIv", "summaryPreview", "summarySize", "templateId", "templateName", "title", "transcriptData", "transcriptIv", "transcriptSize", "updatedAt", "uploadedById" FROM "processing_results";
DROP TABLE "processing_results";
ALTER TABLE "new_processing_results" RENAME TO "processing_results";
CREATE UNIQUE INDEX "processing_results_maieTaskId_key" ON "processing_results"("maieTaskId");
CREATE INDEX "processing_results_title_idx" ON "processing_results"("title");
CREATE INDEX "processing_results_templateId_idx" ON "processing_results"("templateId");
CREATE INDEX "processing_results_status_idx" ON "processing_results"("status");
CREATE INDEX "processing_results_processedAt_idx" ON "processing_results"("processedAt");
CREATE INDEX "processing_results_uploadedById_idx" ON "processing_results"("uploadedById");
CREATE INDEX "processing_results_deviceId_idx" ON "processing_results"("deviceId");
CREATE INDEX "processing_results_scheduledDeleteAt_idx" ON "processing_results"("scheduledDeleteAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
