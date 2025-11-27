-- CreateTable
CREATE TABLE "processing_results" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT,
    "templateId" TEXT,
    "templateName" TEXT,
    "maieTaskId" TEXT,
    "maieStatus" TEXT,
    "sourceAudioId" TEXT,
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
    CONSTRAINT "processing_results_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "processing_results_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "tags" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "processing_result_tags" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "processingResultId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "processing_result_tags_processingResultId_fkey" FOREIGN KEY ("processingResultId") REFERENCES "processing_results" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "processing_result_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tags" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "processing_results_maieTaskId_key" ON "processing_results"("maieTaskId");

-- CreateIndex
CREATE INDEX "processing_results_title_idx" ON "processing_results"("title");

-- CreateIndex
CREATE INDEX "processing_results_templateId_idx" ON "processing_results"("templateId");

-- CreateIndex
CREATE INDEX "processing_results_status_idx" ON "processing_results"("status");

-- CreateIndex
CREATE INDEX "processing_results_processedAt_idx" ON "processing_results"("processedAt");

-- CreateIndex
CREATE INDEX "processing_results_uploadedById_idx" ON "processing_results"("uploadedById");

-- CreateIndex
CREATE INDEX "processing_results_deviceId_idx" ON "processing_results"("deviceId");

-- CreateIndex
CREATE INDEX "processing_results_scheduledDeleteAt_idx" ON "processing_results"("scheduledDeleteAt");

-- CreateIndex
CREATE UNIQUE INDEX "tags_name_key" ON "tags"("name");

-- CreateIndex
CREATE INDEX "tags_name_idx" ON "tags"("name");

-- CreateIndex
CREATE INDEX "processing_result_tags_processingResultId_idx" ON "processing_result_tags"("processingResultId");

-- CreateIndex
CREATE INDEX "processing_result_tags_tagId_idx" ON "processing_result_tags"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "processing_result_tags_processingResultId_tagId_key" ON "processing_result_tags"("processingResultId", "tagId");
