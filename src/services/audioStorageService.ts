/**
 * Audio Storage Service
 *
 * Manages filesystem-based audio storage with streaming encryption.
 * Audio files are stored encrypted on disk with metadata in the database.
 */

import { mkdir, unlink, stat, access, constants } from "fs/promises";
import { createWriteStream, createReadStream } from "fs";
import path from "path";
import crypto from "crypto";
import os from "os";
import prisma from "../lib/prisma";
import logger from "../lib/logger";
import {
  encryptFileToPath,
  decryptFileToStream,
  decryptFileToBuffer,
} from "../utils/encryption";
import { checkStorageQuota, updateUserStorageUsage } from "./storageService";

// ============================================
// CONFIGURATION
// ============================================

// Storage path from environment or default
export const AUDIO_STORAGE_PATH =
  process.env.AUDIO_STORAGE_PATH || "./data/audio";

// Default max audio size: 50MB
const DEFAULT_MAX_AUDIO_SIZE_BYTES = 50 * 1024 * 1024;

// Default audio retention: 90 days
const DEFAULT_AUDIO_AUTO_DELETE_DAYS = 90;

// ============================================
// TYPES
// ============================================

export interface SaveAudioOptions {
  userId: string;
  tempFilePath: string;
  filename: string;
  mimeType: string;
  fileSize: number;
  deviceId?: string | null;
  deleteAfterDays?: number | null;
}

export interface SaveAudioResult {
  audioFileId: string;
  filePath: string; // Relative path
}

// ============================================
// INITIALIZATION
// ============================================

/**
 * Initialize the audio storage directory.
 * Creates the base directory with proper permissions if it doesn't exist.
 */
export async function initAudioStorage(): Promise<void> {
  try {
    await mkdir(AUDIO_STORAGE_PATH, { recursive: true, mode: 0o700 });
    logger.info("Audio storage directory initialized", {
      path: AUDIO_STORAGE_PATH,
    });
  } catch (err) {
    logger.error("Failed to initialize audio storage directory", {
      err,
      path: AUDIO_STORAGE_PATH,
    });
    throw err;
  }
}

/**
 * Ensure user's audio directory exists.
 */
async function ensureUserDir(userId: string): Promise<string> {
  const userDir = path.join(AUDIO_STORAGE_PATH, userId);
  await mkdir(userDir, { recursive: true, mode: 0o700 });
  return userDir;
}

// ============================================
// SYSTEM CONFIGURATION HELPERS
// ============================================

/**
 * Get maximum allowed audio file size from SystemConfig.
 */
export async function getMaxAudioSizeBytes(): Promise<number> {
  try {
    const config = await prisma.systemConfig.findUnique({
      where: { key: "system:maxAudioSizeBytes" },
    });
    if (config) {
      const parsed = JSON.parse(config.value);
      return typeof parsed === "number" ? parsed : Number(parsed);
    }
  } catch (err) {
    logger.warn("Failed to read system:maxAudioSizeBytes config", { err });
  }
  return DEFAULT_MAX_AUDIO_SIZE_BYTES;
}

/**
 * Get system-wide default audio retention days from SystemConfig.
 */
export async function getSystemAudioAutoDeleteDays(): Promise<number | null> {
  try {
    const config = await prisma.systemConfig.findUnique({
      where: { key: "system:audioAutoDeleteDays" },
    });
    if (config) {
      const parsed = JSON.parse(config.value);
      return typeof parsed === "number" ? parsed : Number(parsed);
    }
  } catch (err) {
    logger.warn("Failed to read system:audioAutoDeleteDays config", { err });
  }
  return DEFAULT_AUDIO_AUTO_DELETE_DAYS;
}

/**
 * Get the effective audio retention days for a user.
 * Priority: explicit param > user setting > system setting
 */
export async function getDefaultAudioRetentionDays(
  userId: string,
  explicitDays?: number | null
): Promise<number | null> {
  // If explicitly provided, use it
  if (explicitDays !== undefined && explicitDays !== null) {
    return explicitDays;
  }

  // Check user settings
  try {
    const userSettings = await prisma.userSettings.findUnique({
      where: { userId },
      select: { defaultAudioDeleteAfterDays: true },
    });
    if (
      userSettings?.defaultAudioDeleteAfterDays !== undefined &&
      userSettings?.defaultAudioDeleteAfterDays !== null
    ) {
      return userSettings.defaultAudioDeleteAfterDays;
    }
  } catch (err) {
    logger.warn("Failed to read user audio delete settings", { err, userId });
  }

  // Fall back to system setting
  return getSystemAudioAutoDeleteDays();
}

// ============================================
// TEMP FILE MANAGEMENT
// ============================================

/**
 * Generate a temporary file path for upload processing.
 */
export function getTempFilePath(): string {
  const tempDir = os.tmpdir();
  const tempFileName = `upload-${crypto.randomUUID()}.tmp`;
  return path.join(tempDir, tempFileName);
}

/**
 * Create a write stream to a temp file and return the path.
 */
export function createTempFileStream(): {
  path: string;
  stream: ReturnType<typeof createWriteStream>;
} {
  const tempPath = getTempFilePath();
  const stream = createWriteStream(tempPath);
  return { path: tempPath, stream };
}

/**
 * Clean up a temp file safely.
 */
export async function cleanupTempFile(tempPath: string): Promise<void> {
  try {
    await unlink(tempPath);
  } catch (err) {
    // Ignore errors if file doesn't exist
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      logger.warn("Failed to clean up temp file", { err, path: tempPath });
    }
  }
}

// ============================================
// AUDIO FILE OPERATIONS
// ============================================

/**
 * Save audio file from temp location to encrypted filesystem storage.
 * Creates AudioFile record in database.
 */
export async function saveAudioToFilesystem(
  opts: SaveAudioOptions
): Promise<SaveAudioResult> {
  const {
    userId,
    tempFilePath,
    filename,
    mimeType,
    fileSize,
    deviceId,
    deleteAfterDays,
  } = opts;

  // Generate unique ID and file path
  const audioFileId = crypto.randomUUID();
  const userDir = await ensureUserDir(userId);
  const encryptedFileName = `${audioFileId}.enc`;
  const absolutePath = path.join(userDir, encryptedFileName);
  const relativePath = path.join(userId, encryptedFileName);

  // Get effective retention days
  const effectiveDeleteDays = await getDefaultAudioRetentionDays(
    userId,
    deleteAfterDays
  );
  const scheduledDeleteAt = effectiveDeleteDays
    ? new Date(Date.now() + effectiveDeleteDays * 24 * 60 * 60 * 1000)
    : null;

  try {
    // Encrypt and save to filesystem
    const iv = await encryptFileToPath(tempFilePath, absolutePath);

    // Create database record
    await prisma.audioFile.create({
      data: {
        id: audioFileId,
        filename,
        originalName: filename,
        fileSize,
        encryptedIV: iv,
        filePath: relativePath,
        mimeType,
        deviceId,
        uploadedById: userId,
        deleteAfterDays: effectiveDeleteDays,
        scheduledDeleteAt,
        // encryptedData is null for filesystem storage
      },
    });

    logger.info("Audio file saved to filesystem", {
      audioFileId,
      relativePath,
      fileSize,
      userId,
    });

    return { audioFileId, filePath: relativePath };
  } catch (err) {
    // Clean up encrypted file if database insert fails
    try {
      await unlink(absolutePath);
    } catch {
      // Ignore cleanup errors
    }
    throw err;
  }
}

/**
 * Get the absolute path to an audio file on disk.
 */
export function getAudioFilePath(relativePath: string): string {
  return path.join(AUDIO_STORAGE_PATH, relativePath);
}

/**
 * Get an audio file's decrypted content as a stream.
 * Supports both filesystem and legacy DB storage.
 */
export async function getAudioStream(audioFileId: string): Promise<{
  stream: NodeJS.ReadableStream;
  mimeType: string;
  filename: string;
  fileSize: number;
}> {
  const audioFile = await prisma.audioFile.findUnique({
    where: { id: audioFileId },
  });

  if (!audioFile) {
    throw new Error("Audio file not found");
  }

  // Check if stored on filesystem or legacy DB
  if (audioFile.filePath) {
    // Filesystem storage - stream decrypt
    const absolutePath = getAudioFilePath(audioFile.filePath);
    const stream = await decryptFileToStream(absolutePath);
    return {
      stream,
      mimeType: audioFile.mimeType,
      filename: audioFile.filename,
      fileSize: audioFile.fileSize,
    };
  } else if (audioFile.encryptedData) {
    // Legacy DB storage - decrypt from buffer
    const { decrypt } = await import("../utils/encryption");
    const decrypted = decrypt(
      Buffer.from(audioFile.encryptedData),
      audioFile.encryptedIV
    );

    // Convert buffer to readable stream
    const { Readable } = await import("stream");
    const stream = Readable.from(decrypted);

    return {
      stream,
      mimeType: audioFile.mimeType,
      filename: audioFile.filename,
      fileSize: audioFile.fileSize,
    };
  } else {
    throw new Error(
      "Audio file has no content (neither filePath nor encryptedData)"
    );
  }
}

/**
 * Get an audio file's decrypted content as a Buffer.
 * Useful for smaller files or when full content is needed at once.
 */
export async function getAudioBuffer(audioFileId: string): Promise<{
  buffer: Buffer;
  mimeType: string;
  filename: string;
  fileSize: number;
}> {
  const audioFile = await prisma.audioFile.findUnique({
    where: { id: audioFileId },
  });

  if (!audioFile) {
    throw new Error("Audio file not found");
  }

  // Check if stored on filesystem or legacy DB
  if (audioFile.filePath) {
    // Filesystem storage
    const absolutePath = getAudioFilePath(audioFile.filePath);
    const buffer = await decryptFileToBuffer(absolutePath);
    return {
      buffer,
      mimeType: audioFile.mimeType,
      filename: audioFile.filename,
      fileSize: audioFile.fileSize,
    };
  } else if (audioFile.encryptedData) {
    // Legacy DB storage
    const { decrypt } = await import("../utils/encryption");
    const buffer = decrypt(
      Buffer.from(audioFile.encryptedData),
      audioFile.encryptedIV
    );
    return {
      buffer,
      mimeType: audioFile.mimeType,
      filename: audioFile.filename,
      fileSize: audioFile.fileSize,
    };
  } else {
    throw new Error("Audio file has no content");
  }
}

/**
 * Delete an audio file from filesystem and database.
 */
export async function deleteAudioFile(audioFileId: string): Promise<void> {
  const audioFile = await prisma.audioFile.findUnique({
    where: { id: audioFileId },
    select: { id: true, filePath: true, uploadedById: true },
  });

  if (!audioFile) {
    throw new Error("Audio file not found");
  }

  // Delete from filesystem if stored there
  if (audioFile.filePath) {
    const absolutePath = getAudioFilePath(audioFile.filePath);
    try {
      await unlink(absolutePath);
      logger.info("Deleted audio file from filesystem", {
        audioFileId,
        path: absolutePath,
      });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        logger.error("Failed to delete audio file from filesystem", {
          err,
          audioFileId,
          path: absolutePath,
        });
        // Continue to delete DB record anyway
      }
    }
  }

  // Delete from database (including related FileShare records)
  await prisma.$transaction(async (tx) => {
    await tx.fileShare.deleteMany({
      where: { fileId: audioFileId, fileType: "audio" },
    });
    await tx.audioFile.delete({ where: { id: audioFileId } });
  });

  // Update user's storage usage
  if (audioFile.uploadedById) {
    try {
      await updateUserStorageUsage(audioFile.uploadedById);
    } catch (err) {
      logger.warn("Failed to update storage usage after audio delete", {
        err,
        userId: audioFile.uploadedById,
      });
    }
  }
}

/**
 * Check if an audio file exists on disk.
 */
export async function audioFileExists(relativePath: string): Promise<boolean> {
  try {
    const absolutePath = getAudioFilePath(relativePath);
    await access(absolutePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get file size on disk (encrypted size, not original).
 */
export async function getEncryptedFileSize(
  relativePath: string
): Promise<number> {
  const absolutePath = getAudioFilePath(relativePath);
  const stats = await stat(absolutePath);
  return stats.size;
}
