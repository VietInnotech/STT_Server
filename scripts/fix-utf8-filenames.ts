/**
 * Script to fix UTF-8 filename encoding issues in the database.
 *
 * Some Vietnamese filenames were incorrectly stored due to multer/busboy
 * defaulting to Latin-1 encoding for the Content-Disposition header.
 * This script re-interprets those garbled filenames as UTF-8.
 *
 * Usage:
 *   bun run scripts/fix-utf8-filenames.ts [--dry-run]
 *
 * Options:
 *   --dry-run   Show what would be fixed without making changes
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Fix UTF-8 filename encoding issues.
 * Re-interprets incorrectly decoded Latin-1 strings as UTF-8.
 */
function fixUtf8Filename(filename: string): string {
  try {
    // Check if the filename looks like it was incorrectly decoded
    // (contains high-byte Latin-1 characters that should be UTF-8)
    const hasHighBytes = /[\x80-\xff]/.test(filename);
    if (!hasHighBytes) {
      return filename; // Already clean ASCII or properly decoded
    }

    // Convert the string to bytes (treating each char as a byte) then decode as UTF-8
    const bytes = new Uint8Array(filename.length);
    for (let i = 0; i < filename.length; i++) {
      bytes[i] = filename.charCodeAt(i);
    }
    const decoded = new TextDecoder("utf-8").decode(bytes);

    // Verify the decoded string is valid (doesn't contain replacement chars)
    if (!decoded.includes("\ufffd")) {
      return decoded;
    }
    return filename; // Return original if decoding failed
  } catch {
    return filename; // Return original on any error
  }
}

async function main() {
  const isDryRun = process.argv.includes("--dry-run");

  console.log(`\n${"=".repeat(60)}`);
  console.log(`UTF-8 Filename Fix Script ${isDryRun ? "(DRY RUN)" : ""}`);
  console.log(`${"=".repeat(60)}\n`);

  let audioFixed = 0;
  let textFixed = 0;
  let processingResultFixed = 0;

  // Fix AudioFile filenames
  console.log("Checking AudioFile records...");
  const audioFiles = await prisma.audioFile.findMany({
    select: { id: true, filename: true, originalName: true },
  });

  for (const file of audioFiles) {
    const fixedFilename = fixUtf8Filename(file.filename);
    const fixedOriginalName = file.originalName
      ? fixUtf8Filename(file.originalName)
      : null;

    if (
      fixedFilename !== file.filename ||
      fixedOriginalName !== file.originalName
    ) {
      console.log(`  AudioFile ${file.id}:`);
      if (fixedFilename !== file.filename) {
        console.log(`    filename: "${file.filename}" → "${fixedFilename}"`);
      }
      if (fixedOriginalName !== file.originalName) {
        console.log(
          `    originalName: "${file.originalName}" → "${fixedOriginalName}"`
        );
      }

      if (!isDryRun) {
        await prisma.audioFile.update({
          where: { id: file.id },
          data: {
            filename: fixedFilename,
            originalName: fixedOriginalName || fixedFilename,
          },
        });
      }
      audioFixed++;
    }
  }

  // Fix TextFile filenames
  console.log("\nChecking TextFile records...");
  const textFiles = await prisma.textFile.findMany({
    select: { id: true, filename: true, originalName: true },
  });

  for (const file of textFiles) {
    const fixedFilename = fixUtf8Filename(file.filename);
    const fixedOriginalName = file.originalName
      ? fixUtf8Filename(file.originalName)
      : null;

    if (
      fixedFilename !== file.filename ||
      fixedOriginalName !== file.originalName
    ) {
      console.log(`  TextFile ${file.id}:`);
      if (fixedFilename !== file.filename) {
        console.log(`    filename: "${file.filename}" → "${fixedFilename}"`);
      }
      if (fixedOriginalName !== file.originalName) {
        console.log(
          `    originalName: "${file.originalName}" → "${fixedOriginalName}"`
        );
      }

      if (!isDryRun) {
        await prisma.textFile.update({
          where: { id: file.id },
          data: {
            filename: fixedFilename,
            originalName: fixedOriginalName || fixedFilename,
          },
        });
      }
      textFixed++;
    }
  }

  // Fix ProcessingResult titles (if they contain garbled text)
  console.log("\nChecking ProcessingResult records...");
  const processingResults = await prisma.processingResult.findMany({
    select: { id: true, title: true },
  });

  for (const result of processingResults) {
    if (result.title) {
      const fixedTitle = fixUtf8Filename(result.title);

      if (fixedTitle !== result.title) {
        console.log(`  ProcessingResult ${result.id}:`);
        console.log(`    title: "${result.title}" → "${fixedTitle}"`);

        if (!isDryRun) {
          await prisma.processingResult.update({
            where: { id: result.id },
            data: { title: fixedTitle },
          });
        }
        processingResultFixed++;
      }
    }
  }

  // Summary
  console.log(`\n${"=".repeat(60)}`);
  console.log("Summary:");
  console.log(`  AudioFiles fixed: ${audioFixed}`);
  console.log(`  TextFiles fixed: ${textFixed}`);
  console.log(`  ProcessingResults fixed: ${processingResultFixed}`);
  console.log(
    `  Total fixed: ${audioFixed + textFixed + processingResultFixed}`
  );

  if (isDryRun) {
    console.log(
      "\n⚠️  This was a dry run. Run without --dry-run to apply changes."
    );
  } else {
    console.log("\n✅ All changes have been applied.");
  }
  console.log(`${"=".repeat(60)}\n`);
}

main()
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
