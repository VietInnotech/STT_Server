#!/usr/bin/env bun
/**
 * Migration Script: Migrate Audio Files from Database to Filesystem
 *
 * This script migrates existing AudioFile records that have encryptedData stored
 * in the database to the new filesystem-based storage.
 *
 * The script:
 * 1. Finds all AudioFile records with encryptedData but no filePath
 * 2. Decrypts the data from the database
 * 3. Re-encrypts and saves to filesystem
 * 4. Updates the database record with the new filePath
 * 5. Optionally clears the encryptedData blob to free up space
 *
 * Usage:
 *   bun run scripts/migrate-audio-to-filesystem.ts [--dry-run] [--clear-blobs] [--batch-size=N]
 *
 * Options:
 *   --dry-run      Show what would be migrated without making changes
 *   --clear-blobs  After successful migration, set encryptedData to null (saves DB space)
 *   --batch-size=N Process N files at a time (default: 10)
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { mkdir, writeFile, unlink } from "fs/promises";
import { createWriteStream } from "fs";
import path from "path";
import crypto from "crypto";
import os from "os";

// Initialize Prisma
const prisma = new PrismaClient();

// Configuration
const AUDIO_STORAGE_PATH = process.env.AUDIO_STORAGE_PATH || "./data/audio";
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;

// Parse command line arguments
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const CLEAR_BLOBS = args.includes("--clear-blobs");
const BATCH_SIZE = parseInt(
  args.find((a) => a.startsWith("--batch-size="))?.split("=")[1] || "10",
  10
);

// Get encryption key from environment
function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error("ENCRYPTION_KEY not set in environment variables");
  }
  if (key.length !== 64) {
    throw new Error("ENCRYPTION_KEY must be 64 hex characters (32 bytes)");
  }
  return Buffer.from(key, "hex");
}

// Decrypt data from database format (salt + authTag + encrypted)
function decryptFromDb(encryptedData: Buffer, encryptedIV: string): Buffer {
  const salt = encryptedData.subarray(0, SALT_LENGTH);
  const authTag = encryptedData.subarray(
    SALT_LENGTH,
    SALT_LENGTH + AUTH_TAG_LENGTH
  );
  const encrypted = encryptedData.subarray(SALT_LENGTH + AUTH_TAG_LENGTH);
  const iv = Buffer.from(encryptedIV, "hex");

  const key = crypto.pbkdf2Sync(getEncryptionKey(), salt, 100000, 32, "sha256");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

// Encrypt and write to filesystem (new format: salt + iv + authTag + encrypted)
async function encryptToFilesystem(
  plaintext: Buffer,
  outputPath: string
): Promise<string> {
  const iv = crypto.randomBytes(IV_LENGTH);
  const salt = crypto.randomBytes(SALT_LENGTH);

  const key = crypto.pbkdf2Sync(getEncryptionKey(), salt, 100000, 32, "sha256");
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Write: salt + iv + authTag + encrypted
  const output = Buffer.concat([salt, iv, authTag, encrypted]);
  await writeFile(outputPath, output);

  return iv.toString("hex");
}

// Ensure user directory exists
async function ensureUserDir(userId: string): Promise<string> {
  const userDir = path.join(AUDIO_STORAGE_PATH, userId);
  await mkdir(userDir, { recursive: true, mode: 0o700 });
  return userDir;
}

// Main migration function
async function migrateAudioFiles() {
  console.log("=".repeat(60));
  console.log("Audio File Migration: Database → Filesystem");
  console.log("=".repeat(60));
  console.log();
  console.log("Configuration:");
  console.log(`  Storage path: ${AUDIO_STORAGE_PATH}`);
  console.log(`  Dry run: ${DRY_RUN}`);
  console.log(`  Clear blobs after migration: ${CLEAR_BLOBS}`);
  console.log(`  Batch size: ${BATCH_SIZE}`);
  console.log();

  // Initialize storage directory
  if (!DRY_RUN) {
    await mkdir(AUDIO_STORAGE_PATH, { recursive: true, mode: 0o700 });
    console.log(`✓ Storage directory initialized: ${AUDIO_STORAGE_PATH}`);
  }

  // Count files to migrate
  const totalCount = await prisma.audioFile.count({
    where: {
      encryptedData: { not: null },
      filePath: null,
    },
  });

  console.log(`\nFound ${totalCount} audio files to migrate`);

  if (totalCount === 0) {
    console.log(
      "\n✓ No files need migration. All audio files are already on filesystem."
    );
    return;
  }

  if (DRY_RUN) {
    console.log("\n[DRY RUN] Would migrate the following files:");
  }

  let migratedCount = 0;
  let errorCount = 0;
  let offset = 0;

  while (offset < totalCount) {
    // Fetch batch
    const files = await prisma.audioFile.findMany({
      where: {
        encryptedData: { not: null },
        filePath: null,
      },
      select: {
        id: true,
        filename: true,
        fileSize: true,
        encryptedData: true,
        encryptedIV: true,
        uploadedById: true,
        uploadedAt: true,
      },
      take: BATCH_SIZE,
      skip: offset,
    });

    if (files.length === 0) break;

    for (const file of files) {
      const userId = file.uploadedById || "orphaned";
      const relativePath = path.join(userId, `${file.id}.enc`);
      const absolutePath = path.join(AUDIO_STORAGE_PATH, relativePath);

      console.log(
        `\n[${migratedCount + errorCount + 1}/${totalCount}] ${file.filename}`
      );
      console.log(`  ID: ${file.id}`);
      console.log(`  Size: ${(file.fileSize / 1024).toFixed(2)} KB`);
      console.log(`  Owner: ${userId}`);
      console.log(`  Target: ${relativePath}`);

      if (DRY_RUN) {
        migratedCount++;
        continue;
      }

      try {
        // Decrypt from database
        const plaintext = decryptFromDb(
          Buffer.from(file.encryptedData!),
          file.encryptedIV
        );

        // Ensure user directory
        await ensureUserDir(userId);

        // Encrypt and write to filesystem
        const newIV = await encryptToFilesystem(plaintext, absolutePath);

        // Update database record
        const updateData: any = {
          filePath: relativePath,
          // Note: We keep encryptedIV as-is since it's used for audit/reference
          // The new IV is stored in the file header
        };

        if (CLEAR_BLOBS) {
          updateData.encryptedData = null;
        }

        await prisma.audioFile.update({
          where: { id: file.id },
          data: updateData,
        });

        console.log(`  ✓ Migrated successfully`);
        migratedCount++;
      } catch (err) {
        console.error(`  ✗ Error: ${(err as Error).message}`);
        errorCount++;

        // Clean up partial file if it exists
        try {
          await unlink(absolutePath);
        } catch {
          // Ignore cleanup errors
        }
      }
    }

    offset += BATCH_SIZE;
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("Migration Summary");
  console.log("=".repeat(60));
  console.log(`  Total files: ${totalCount}`);
  console.log(`  Migrated: ${migratedCount}`);
  console.log(`  Errors: ${errorCount}`);

  if (DRY_RUN) {
    console.log("\n[DRY RUN] No changes were made.");
    console.log("Run without --dry-run to perform actual migration.");
  } else if (CLEAR_BLOBS) {
    console.log("\n✓ Database blobs cleared for migrated files.");
    console.log("  Consider running VACUUM on SQLite to reclaim space.");
  } else {
    console.log("\n✓ Migration complete.");
    console.log(
      "  Database blobs were preserved (run with --clear-blobs to remove)."
    );
  }
}

// Run migration
migrateAudioFiles()
  .catch((err) => {
    console.error("\nFatal error:", err);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
