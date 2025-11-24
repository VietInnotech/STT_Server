-- CreateTable
CREATE TABLE "file_shares" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fileId" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "sharedById" TEXT,
    "sharedWithId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "file_shares_sharedWithId_idx" ON "file_shares"("sharedWithId");

-- CreateIndex
CREATE INDEX "file_shares_fileId_idx" ON "file_shares"("fileId");
