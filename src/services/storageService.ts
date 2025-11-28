/**
 * Storage Quota Service
 *
 * Manages user storage quotas and usage tracking for files.
 * Tracks storage consumption from: AudioFiles, TextFiles, ProcessingResults
 */

import prisma from "../lib/prisma";
import logger from "../lib/logger";

// Default storage quota: 1GB in bytes
export const DEFAULT_STORAGE_QUOTA_BYTES = BigInt(1073741824); // 1024^3

/**
 * Storage usage breakdown by file type
 */
export interface StorageUsageBreakdown {
  audioBytes: bigint;
  textBytes: bigint;
  processingResultBytes: bigint;
  totalBytes: bigint;
}

/**
 * Full storage info for a user
 */
export interface StorageInfo {
  userId: string;
  quotaBytes: bigint;
  usedBytes: bigint;
  availableBytes: bigint;
  usagePercent: number;
  breakdown: StorageUsageBreakdown;
}

/**
 * Calculate storage usage for a user by summing file sizes
 * from AudioFile, TextFile, and ProcessingResult tables.
 */
export async function calculateUserStorageUsage(
  userId: string
): Promise<StorageUsageBreakdown> {
  // Query all file sizes in parallel
  const [audioResult, textResult, processingResult] = await Promise.all([
    // Sum of audio file sizes
    prisma.audioFile.aggregate({
      where: { uploadedById: userId },
      _sum: { fileSize: true },
    }),
    // Sum of text file sizes
    prisma.textFile.aggregate({
      where: { uploadedById: userId },
      _sum: { fileSize: true },
    }),
    // Sum of processing result sizes (summary + transcript)
    prisma.processingResult.aggregate({
      where: { uploadedById: userId },
      _sum: {
        summarySize: true,
        transcriptSize: true,
      },
    }),
  ]);

  const audioBytes = BigInt(audioResult._sum.fileSize || 0);
  const textBytes = BigInt(textResult._sum.fileSize || 0);
  const processingResultBytes = BigInt(
    (processingResult._sum.summarySize || 0) +
      (processingResult._sum.transcriptSize || 0)
  );
  const totalBytes = audioBytes + textBytes + processingResultBytes;

  return {
    audioBytes,
    textBytes,
    processingResultBytes,
    totalBytes,
  };
}

/**
 * Update the cached storage usage for a user in UserSettings.
 * This should be called after file uploads/deletes.
 */
export async function updateUserStorageUsage(userId: string): Promise<bigint> {
  const breakdown = await calculateUserStorageUsage(userId);

  // Upsert user settings with updated storage usage
  await prisma.userSettings.upsert({
    where: { userId },
    update: {
      storageUsedBytes: breakdown.totalBytes,
    },
    create: {
      userId,
      storageQuotaBytes: DEFAULT_STORAGE_QUOTA_BYTES,
      storageUsedBytes: breakdown.totalBytes,
    },
  });

  logger.debug("Updated storage usage for user", {
    userId,
    usedBytes: breakdown.totalBytes.toString(),
  });

  return breakdown.totalBytes;
}

/**
 * Get full storage info for a user including quota, usage, and breakdown.
 */
export async function getUserStorageInfo(userId: string): Promise<StorageInfo> {
  // Get or create user settings
  let settings = await prisma.userSettings.findUnique({
    where: { userId },
  });

  if (!settings) {
    // Create default settings
    settings = await prisma.userSettings.create({
      data: {
        userId,
        storageQuotaBytes: DEFAULT_STORAGE_QUOTA_BYTES,
        storageUsedBytes: BigInt(0),
      },
    });
  }

  // Calculate current breakdown
  const breakdown = await calculateUserStorageUsage(userId);

  // Update cached usage if it differs
  if (settings.storageUsedBytes !== breakdown.totalBytes) {
    await prisma.userSettings.update({
      where: { userId },
      data: { storageUsedBytes: breakdown.totalBytes },
    });
    settings.storageUsedBytes = breakdown.totalBytes;
  }

  const quotaBytes = settings.storageQuotaBytes;
  const usedBytes = breakdown.totalBytes;
  const availableBytes =
    quotaBytes > usedBytes ? quotaBytes - usedBytes : BigInt(0);
  const usagePercent =
    quotaBytes > 0 ? Number((usedBytes * BigInt(10000)) / quotaBytes) / 100 : 0;

  return {
    userId,
    quotaBytes,
    usedBytes,
    availableBytes,
    usagePercent: Math.round(usagePercent * 100) / 100, // Round to 2 decimal places
    breakdown,
  };
}

/**
 * Check if a user has enough storage quota for an upload.
 * Returns { allowed: true } if upload is allowed, or { allowed: false, reason: string } if not.
 */
export async function checkStorageQuota(
  userId: string,
  uploadSizeBytes: number
): Promise<{ allowed: boolean; reason?: string; availableBytes?: bigint }> {
  const info = await getUserStorageInfo(userId);
  const uploadSize = BigInt(uploadSizeBytes);

  if (info.availableBytes < uploadSize) {
    const quotaMB = Number(info.quotaBytes) / (1024 * 1024);
    const usedMB = Number(info.usedBytes) / (1024 * 1024);
    const availableMB = Number(info.availableBytes) / (1024 * 1024);
    const uploadMB = uploadSizeBytes / (1024 * 1024);

    return {
      allowed: false,
      reason: `Storage quota exceeded. You have ${availableMB.toFixed(
        2
      )} MB available but tried to upload ${uploadMB.toFixed(
        2
      )} MB. Current usage: ${usedMB.toFixed(2)} MB / ${quotaMB.toFixed(2)} MB`,
      availableBytes: info.availableBytes,
    };
  }

  return { allowed: true, availableBytes: info.availableBytes };
}

/**
 * Set a custom storage quota for a user (admin function).
 */
export async function setUserStorageQuota(
  userId: string,
  quotaBytes: bigint
): Promise<void> {
  await prisma.userSettings.upsert({
    where: { userId },
    update: { storageQuotaBytes: quotaBytes },
    create: {
      userId,
      storageQuotaBytes: quotaBytes,
      storageUsedBytes: BigInt(0),
    },
  });

  logger.info("Updated storage quota for user", {
    userId,
    quotaBytes: quotaBytes.toString(),
  });
}

/**
 * Helper to format bytes into human-readable string
 */
export function formatBytes(bytes: bigint | number): string {
  const b = typeof bytes === "bigint" ? Number(bytes) : bytes;
  if (b === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  const k = 1024;
  const i = Math.floor(Math.log(b) / Math.log(k));

  return `${(b / Math.pow(k, i)).toFixed(2)} ${units[i]}`;
}
