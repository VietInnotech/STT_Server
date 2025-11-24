-- CreateTable
CREATE TABLE "text_file_pairs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "summaryFileId" TEXT NOT NULL,
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

-- CreateIndex
CREATE UNIQUE INDEX "text_file_pairs_summaryFileId_key" ON "text_file_pairs"("summaryFileId");

-- CreateIndex
CREATE UNIQUE INDEX "text_file_pairs_realtimeFileId_key" ON "text_file_pairs"("realtimeFileId");

-- CreateIndex
CREATE INDEX "text_file_pairs_uploadedById_idx" ON "text_file_pairs"("uploadedById");

-- CreateIndex
CREATE INDEX "text_file_pairs_createdAt_idx" ON "text_file_pairs"("createdAt");

-- CreateIndex
CREATE INDEX "text_file_pairs_scheduledDeleteAt_idx" ON "text_file_pairs"("scheduledDeleteAt");
