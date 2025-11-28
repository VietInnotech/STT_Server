import { Router } from "express";
import busboy from "busboy";
import crypto from "crypto";
import { createWriteStream } from "fs";
import { unlink } from "fs/promises";
import path from "path";
import os from "os";
import { Readable } from "stream";
import { prisma } from "../lib/prisma";
import { authenticate, type AuthRequest } from "../middleware/auth";
import { uploadLimiter } from "../middleware/rateLimiter";
import {
  submitToMaie,
  getMaieStatus,
  submitTextToMaie,
  checkMaieHealth,
  MAIE_STATUS_PROGRESS,
} from "../lib/maieProxy";
import logger from "../lib/logger";
import { emitToUser } from "../lib/socketBus";
import { encrypt } from "../utils/encryption";
import {
  saveAudioToFilesystem,
  getMaxAudioSizeBytes,
  getDefaultAudioRetentionDays,
  getAudioBuffer,
  cleanupTempFile,
} from "../services/audioStorageService";
import {
  checkStorageQuota,
  updateUserStorageUsage,
} from "../services/storageService";

const router = Router();

// ============================================
// Helper Functions
// ============================================

/**
 * Add tags to a processing result via the junction table.
 * Creates tags if they don't exist, normalizes to lowercase.
 */
async function addTagsToResult(
  resultId: string,
  tags: string[]
): Promise<void> {
  // Normalize tags to lowercase and dedupe
  const normalizedTags = [
    ...new Set(tags.map((t) => t.toLowerCase().trim()).filter(Boolean)),
  ];

  for (const tagName of normalizedTags) {
    // Upsert tag
    const tag = await prisma.tag.upsert({
      where: { name: tagName },
      update: {},
      create: { name: tagName },
    });

    // Create junction record (ignore if exists)
    await prisma.processingResultTag.upsert({
      where: {
        processingResultId_tagId: {
          processingResultId: resultId,
          tagId: tag.id,
        },
      },
      update: {},
      create: {
        processingResultId: resultId,
        tagId: tag.id,
      },
    });
  }
}

/**
 * Audit log helper for processing events
 */
async function logProcessingAudit(
  userId: string,
  action: string,
  resourceId: string,
  details: Record<string, unknown>,
  req: AuthRequest
) {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        resource: "processing_result",
        resourceId,
        details: details as object,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        success: true,
      },
    });
  } catch (err) {
    logger.error("Failed to create audit log", { err, action, resourceId });
  }
}

// ============================================
// Routes
// ============================================

/**
 * POST /api/process
 *
 * Submit audio for AI processing (MAIE proxy) with automatic audio persistence.
 *
 * New flow with audio persistence:
 * 1. Create PENDING ProcessingResult
 * 2. Stream audio to temp file while parsing multipart fields
 * 3. Validate file size against admin-configured limit
 * 4. Check storage quota
 * 5. Either use existing sourceAudioId or persist audio to filesystem
 * 6. Submit audio to MAIE
 * 7. Update ProcessingResult with maieTaskId and sourceAudioId
 * 8. Clean up temp file
 *
 * Request fields:
 * - file: Audio file (required unless sourceAudioId provided)
 * - template_id: MAIE template ID (optional)
 * - features: Features to request, default "summary" (optional)
 * - sourceAudioId: Link to existing AudioFile instead of creating new (optional)
 * - sourceTextFilePairId: Link to TextFilePair for live transcript comparison (optional)
 * - deleteAfterDays: Retention period override (optional)
 * - deviceId: Android device identifier (optional)
 */
router.post("/", authenticate, uploadLimiter, async (req: AuthRequest, res) => {
  const userId = req.user!.userId;
  const internalTaskId = crypto.randomUUID();

  // Temp file path for streaming upload
  let tempFilePath: string | null = null;
  let responseSent = false;

  // Helper to send response only once
  const sendResponse = (status: number, body: object) => {
    if (!responseSent) {
      responseSent = true;
      res.status(status).json(body);
    }
  };

  // Helper to cleanup and send error
  const handleError = async (
    status: number,
    error: string,
    taskId?: string
  ) => {
    if (tempFilePath) {
      await cleanupTempFile(tempFilePath);
    }
    if (taskId) {
      prisma.processingResult.delete({ where: { id: taskId } }).catch(() => {});
    }
    sendResponse(status, { error, taskId });
  };

  // Step 1: Create PENDING record
  let processingResult;
  try {
    processingResult = await prisma.processingResult.create({
      data: {
        id: internalTaskId,
        status: "pending",
        uploadedById: userId,
      },
    });
    logger.info("Created pending processing result", {
      taskId: internalTaskId,
      userId,
    });
  } catch (dbError) {
    logger.error("Failed to create processing result", { error: dbError });
    sendResponse(500, { error: "Failed to initiate processing" });
    return;
  }

  // Get max file size limit
  const maxAudioSize = await getMaxAudioSizeBytes();

  // Parse multipart form data with streaming to temp file
  // defParamCharset: 'utf8' ensures proper handling of Vietnamese/non-ASCII filenames
  const bb = busboy({
    headers: req.headers,
    limits: { fileSize: maxAudioSize },
    defParamCharset: "utf8",
  });

  // Form field values
  let templateId: string | undefined;
  let features = "summary";
  let sourceAudioId: string | undefined;
  let sourceTextFilePairId: string | undefined;
  let deleteAfterDays: number | undefined;
  let deviceId: string | undefined;

  // File info
  let fileInfo: { filename: string; mimeType: string; size: number } | null =
    null;
  let fileTruncated = false;

  bb.on("field", (name, val) => {
    logger.debug("Received field", { name, val });
    switch (name) {
      case "template_id":
        templateId = val;
        break;
      case "features":
        features = val;
        break;
      case "sourceAudioId":
        sourceAudioId = val;
        break;
      case "sourceTextFilePairId":
        sourceTextFilePairId = val;
        break;
      case "deleteAfterDays":
        const parsed = parseInt(val, 10);
        if (!isNaN(parsed)) deleteAfterDays = parsed;
        break;
      case "deviceId":
        deviceId = val;
        break;
    }
  });

  bb.on("file", (name, file, info) => {
    const { filename, mimeType } = info;

    // Generate temp file path
    tempFilePath = path.join(os.tmpdir(), `upload-${crypto.randomUUID()}.tmp`);
    const writeStream = createWriteStream(tempFilePath);
    let bytesWritten = 0;

    logger.info("Streaming file to temp", {
      taskId: internalTaskId,
      filename,
      mimeType,
      tempFilePath,
    });

    file.on("data", (chunk: Buffer) => {
      bytesWritten += chunk.length;
      writeStream.write(chunk);
    });

    file.on("limit", () => {
      fileTruncated = true;
      logger.warn("File exceeded size limit", {
        taskId: internalTaskId,
        maxAudioSize,
        bytesWritten,
      });
    });

    file.on("end", () => {
      writeStream.end();
      fileInfo = { filename, mimeType, size: bytesWritten };
      logger.info("File streamed to temp", {
        taskId: internalTaskId,
        filename,
        size: bytesWritten,
      });
    });

    file.on("error", (err) => {
      writeStream.destroy();
      logger.error("File stream error", { err, taskId: internalTaskId });
    });
  });

  bb.on("close", async () => {
    // Check if file was truncated due to size limit
    if (fileTruncated) {
      await handleError(
        413,
        `File exceeds maximum size of ${Math.round(
          maxAudioSize / 1024 / 1024
        )}MB`,
        internalTaskId
      );
      return;
    }

    // If sourceAudioId provided, we don't need a file upload
    if (sourceAudioId) {
      // Validate sourceAudioId exists and belongs to user
      const existingAudio = await prisma.audioFile.findFirst({
        where: { id: sourceAudioId, uploadedById: userId },
      });

      if (!existingAudio) {
        await handleError(
          400,
          "Invalid sourceAudioId: audio file not found or not owned by user",
          internalTaskId
        );
        return;
      }

      // Use existing audio - get buffer for MAIE
      try {
        const {
          buffer: audioBuffer,
          filename,
          mimeType,
        } = await getAudioBuffer(sourceAudioId);

        // Validate sourceTextFilePairId if provided
        if (sourceTextFilePairId) {
          const existingPair = await prisma.textFilePair.findFirst({
            where: { id: sourceTextFilePairId, uploadedById: userId },
          });
          if (!existingPair) {
            await handleError(
              400,
              "Invalid sourceTextFilePairId: pair not found or not owned by user",
              internalTaskId
            );
            return;
          }
        }

        // Submit to MAIE
        const fileStream = Readable.from(audioBuffer);
        const maieResponse = await submitToMaie(
          fileStream,
          filename,
          templateId,
          features
        );

        // Update ProcessingResult with links
        await prisma.processingResult.update({
          where: { id: internalTaskId },
          data: {
            maieTaskId: maieResponse.task_id,
            maieStatus: maieResponse.status,
            templateId,
            sourceAudioId,
            sourceTextFilePairId: sourceTextFilePairId || null,
          },
        });

        logger.info("Processing submitted with existing audio", {
          internalTaskId,
          maieTaskId: maieResponse.task_id,
          sourceAudioId,
          userId,
        });

        await logProcessingAudit(
          userId,
          "process_audio_submitted",
          internalTaskId,
          {
            sourceAudioId,
            sourceTextFilePairId,
            templateId,
            features,
            reusedExistingAudio: true,
          },
          req
        );

        sendResponse(202, {
          success: true,
          taskId: internalTaskId,
          status: "PENDING",
          message: "Processing started",
          audioFileId: sourceAudioId,
        });
        return;
      } catch (err) {
        logger.error("Failed to process with existing audio", {
          err,
          sourceAudioId,
        });
        await handleError(
          500,
          "Failed to read existing audio file",
          internalTaskId
        );
        return;
      }
    }

    // No sourceAudioId - require uploaded file
    if (!fileInfo || !tempFilePath) {
      await handleError(400, "No audio file provided", internalTaskId);
      return;
    }

    // Check storage quota
    const quotaCheck = await checkStorageQuota(userId, fileInfo.size);
    if (!quotaCheck.allowed) {
      await handleError(
        413,
        quotaCheck.reason || "Storage quota exceeded",
        internalTaskId
      );
      return;
    }

    // Validate sourceTextFilePairId if provided
    if (sourceTextFilePairId) {
      const existingPair = await prisma.textFilePair.findFirst({
        where: { id: sourceTextFilePairId, uploadedById: userId },
      });
      if (!existingPair) {
        await handleError(
          400,
          "Invalid sourceTextFilePairId: pair not found or not owned by user",
          internalTaskId
        );
        return;
      }
    }

    // Resolve deviceId
    let resolvedDeviceId: string | null = null;
    if (deviceId) {
      const deviceById = await prisma.device
        .findUnique({ where: { id: deviceId } })
        .catch(() => null);
      if (deviceById) {
        resolvedDeviceId = deviceById.id;
      } else {
        const deviceByDeviceId = await prisma.device
          .findFirst({ where: { deviceId } })
          .catch(() => null);
        resolvedDeviceId = deviceByDeviceId?.id ?? null;
      }
    }

    try {
      // Save audio to filesystem
      const { audioFileId, filePath } = await saveAudioToFilesystem({
        userId,
        tempFilePath,
        filename: fileInfo.filename,
        mimeType: fileInfo.mimeType,
        fileSize: fileInfo.size,
        deviceId: resolvedDeviceId,
        deleteAfterDays,
      });

      logger.info("Audio persisted to filesystem", {
        audioFileId,
        filePath,
        taskId: internalTaskId,
      });

      // Get audio buffer for MAIE submission
      const { buffer: audioBuffer } = await getAudioBuffer(audioFileId);
      const fileStream = Readable.from(audioBuffer);

      // Submit to MAIE
      const maieResponse = await submitToMaie(
        fileStream,
        fileInfo.filename,
        templateId,
        features
      );

      // Update ProcessingResult with MAIE task_id and source audio link
      await prisma.processingResult.update({
        where: { id: internalTaskId },
        data: {
          maieTaskId: maieResponse.task_id,
          maieStatus: maieResponse.status,
          templateId,
          sourceAudioId: audioFileId,
          sourceTextFilePairId: sourceTextFilePairId || null,
          deviceId: resolvedDeviceId,
        },
      });

      // Update storage usage
      await updateUserStorageUsage(userId);

      logger.info("Processing submitted to MAIE with persisted audio", {
        internalTaskId,
        maieTaskId: maieResponse.task_id,
        audioFileId,
        userId,
      });

      // Audit log
      await logProcessingAudit(
        userId,
        "process_audio_submitted",
        internalTaskId,
        {
          filename: fileInfo.filename,
          fileSize: fileInfo.size,
          audioFileId,
          sourceTextFilePairId,
          templateId,
          features,
          deviceId: resolvedDeviceId,
        },
        req
      );

      // Clean up temp file (encrypted file is now in storage)
      await cleanupTempFile(tempFilePath);
      tempFilePath = null;

      sendResponse(202, {
        success: true,
        taskId: internalTaskId,
        status: "PENDING",
        message: "Processing started",
        audioFileId,
      });
    } catch (err) {
      logger.error("Failed to process and persist audio", {
        err,
        taskId: internalTaskId,
      });

      // Mark processing result as failed
      await prisma.processingResult.update({
        where: { id: internalTaskId },
        data: {
          status: "failed",
          errorMessage: err instanceof Error ? err.message : "Unknown error",
        },
      });

      // Clean up temp file
      if (tempFilePath) {
        await cleanupTempFile(tempFilePath);
      }

      // Determine appropriate error response
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      if (errorMessage.includes("MAIE")) {
        sendResponse(502, {
          error: "AI processing service unavailable",
          taskId: internalTaskId,
        });
      } else {
        sendResponse(500, {
          error: "Failed to process audio",
          taskId: internalTaskId,
        });
      }
    }
  });

  bb.on("error", async (error) => {
    logger.error("Busboy parsing error", { error, taskId: internalTaskId });
    await handleError(400, "Failed to parse upload", internalTaskId);
  });

  req.pipe(bb);
});

/**
 * GET /api/process/:taskId/status
 *
 * Check processing status (polls MAIE internally)
 */
router.get("/:taskId/status", authenticate, async (req: AuthRequest, res) => {
  const taskId = req.params.taskId as string;
  const userId = req.user!.userId;

  // Find the processing result by internal ID
  const result = await prisma.processingResult.findFirst({
    where: {
      id: taskId,
      uploadedById: userId, // Ensure user owns this task
    },
    include: {
      tags: { include: { tag: true } },
    },
  });

  if (!result) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  // If already complete/failed in DB, return cached result
  if (result.status === "completed" || result.status === "failed") {
    res.json({
      taskId,
      status: result.status === "completed" ? "COMPLETE" : "FAILED",
      sourceAudioId: result.sourceAudioId,
      sourceTextFilePairId: result.sourceTextFilePairId,
      result:
        result.status === "completed"
          ? {
              title: result.title,
              summary: result.summaryPreview,
              tags: result.tags.map((t) => t.tag.name),
              asrConfidence: result.confidence,
              processingTime: result.processingTime,
              audioDuration: result.audioDuration,
              // Note: Full encrypted content requires separate endpoint with decryption
            }
          : undefined,
      error: result.errorMessage,
      errorCode: result.errorCode,
    });
    return;
  }

  // No MAIE task_id yet - still creating
  if (!result.maieTaskId) {
    res.json({
      taskId,
      status: "PENDING",
      progress: 0,
      sourceAudioId: result.sourceAudioId,
      sourceTextFilePairId: result.sourceTextFilePairId,
    });
    return;
  }

  // Poll MAIE for current status
  try {
    const maieStatus = await getMaieStatus(result.maieTaskId);

    logger.debug("MAIE status response", {
      taskId,
      status: maieStatus.status,
      hasResults: !!maieStatus.results,
      resultsKeys: maieStatus.results ? Object.keys(maieStatus.results) : [],
    });

    // If complete, store results and emit Socket.IO event
    if (maieStatus.status === "COMPLETE" && maieStatus.results) {
      const summary = maieStatus.results.summary;
      const transcript =
        maieStatus.results.clean_transcript ||
        maieStatus.results.raw_transcript;

      // Encrypt the FULL summary object (JSON) for secure storage
      // This preserves all fields: title, summary/content, attendees, decisions, action_items, key_topics, etc.
      const summaryJson = JSON.stringify(summary);
      const { encryptedData: summaryEncrypted, encryptedIV: summaryIv } =
        encrypt(Buffer.from(summaryJson.normalize("NFC")));

      // Extract summary text for preview (try various field names used by templates)
      const summaryText = summary.summary || summary.content || "";

      let transcriptEncrypted: Buffer | null = null;
      let transcriptIv: string | null = null;
      if (transcript) {
        const enc = encrypt(Buffer.from(transcript.normalize("NFC")));
        transcriptEncrypted = enc.encryptedData;
        transcriptIv = enc.encryptedIV;
      }

      // Update DB with results
      await prisma.processingResult.update({
        where: { id: taskId },
        data: {
          status: "completed",
          maieStatus: "COMPLETE",
          title: (summary.title || "").normalize("NFC"),
          summaryData: summaryEncrypted,
          summaryIv,
          summaryPreview: summaryText.normalize("NFC").slice(0, 200),
          summarySize: Buffer.byteLength(summaryJson, "utf8"),
          transcriptData: transcriptEncrypted,
          transcriptIv,
          transcriptSize: transcript
            ? Buffer.byteLength(transcript, "utf8")
            : null,
          confidence: maieStatus.metrics?.asr_confidence_avg,
          processingTime: maieStatus.metrics?.processing_time_seconds,
          audioDuration: maieStatus.metrics?.input_duration_seconds,
          rtf: maieStatus.metrics?.rtf,
          processedAt: new Date(),
        },
      });

      // Store tags if provided
      if (
        summary.tags &&
        Array.isArray(summary.tags) &&
        summary.tags.length > 0
      ) {
        await addTagsToResult(taskId, summary.tags as string[]);
      }

      // Emit Socket.IO event for real-time notification
      emitToUser(userId, "task:complete", {
        taskId,
        status: "COMPLETE",
        result: {
          title: summary.title,
          summary: summary.summary,
          transcript,
          tags: summary.tags || [],
          keyTopics: summary.key_topics || [],
          asrConfidence: maieStatus.metrics?.asr_confidence_avg,
          processingTime: maieStatus.metrics?.processing_time_seconds,
          audioDuration: maieStatus.metrics?.input_duration_seconds,
        },
      });

      logger.info("Processing completed", { taskId, title: summary.title });

      res.json({
        taskId,
        status: "COMPLETE",
        result: {
          title: summary.title,
          summary: summary.summary,
          transcript,
          tags: summary.tags || [],
          keyTopics: summary.key_topics || [],
          asrConfidence: maieStatus.metrics?.asr_confidence_avg,
          processingTime: maieStatus.metrics?.processing_time_seconds,
          audioDuration: maieStatus.metrics?.input_duration_seconds,
        },
      });
      return;
    }

    if (maieStatus.status === "FAILED") {
      await prisma.processingResult.update({
        where: { id: taskId },
        data: {
          status: "failed",
          maieStatus: "FAILED",
          errorMessage: maieStatus.error,
          errorCode: maieStatus.error_code,
        },
      });

      emitToUser(userId, "task:complete", {
        taskId,
        status: "FAILED",
        error: maieStatus.error,
        errorCode: maieStatus.error_code,
      });

      logger.warn("Processing failed", {
        taskId,
        error: maieStatus.error,
        errorCode: maieStatus.error_code,
      });

      res.json({
        taskId,
        status: "FAILED",
        error: maieStatus.error,
        errorCode: maieStatus.error_code,
      });
      return;
    }

    // Still processing - or COMPLETE without result payload yet
    // Update status in DB and return current progress
    await prisma.processingResult.update({
      where: { id: taskId },
      data: { maieStatus: maieStatus.status },
    });

    // If MAIE says COMPLETE but no result yet, keep returning PROCESSING_LLM
    // to indicate work is still being done on our side
    const effectiveStatus =
      maieStatus.status === "COMPLETE" && !maieStatus.results
        ? "PROCESSING_LLM"
        : maieStatus.status;

    res.json({
      taskId,
      status: effectiveStatus,
      progress: MAIE_STATUS_PROGRESS[effectiveStatus] || 0,
    });
  } catch (error) {
    logger.error("Failed to get MAIE status", { taskId, error });
    res.status(502).json({
      error: "AI processing service unavailable",
    });
  }
});

/**
 * POST /api/process/text
 *
 * Submit text for summarization (no audio transcription)
 */
router.post("/text", authenticate, async (req: AuthRequest, res) => {
  const { text, templateId } = req.body;
  const userId = req.user!.userId;

  if (!text || typeof text !== "string") {
    res.status(400).json({ error: "text is required" });
    return;
  }

  if (text.length > 100000) {
    res
      .status(400)
      .json({ error: "Text exceeds maximum length (100,000 characters)" });
    return;
  }

  const internalTaskId = crypto.randomUUID();

  try {
    // Create PENDING record first
    await prisma.processingResult.create({
      data: {
        id: internalTaskId,
        status: "pending",
        uploadedById: userId,
        templateId,
      },
    });

    const maieResponse = await submitTextToMaie(text, templateId);

    await prisma.processingResult.update({
      where: { id: internalTaskId },
      data: {
        maieTaskId: maieResponse.task_id,
        maieStatus: maieResponse.status,
      },
    });

    // Audit log
    await logProcessingAudit(
      userId,
      "process_text_submitted",
      internalTaskId,
      {
        textLength: text.length,
        templateId,
      },
      req
    );

    logger.info("Text processing submitted to MAIE", {
      internalTaskId,
      maieTaskId: maieResponse.task_id,
      userId,
      textLength: text.length,
    });

    res.status(202).json({
      success: true,
      taskId: internalTaskId,
      status: "PENDING",
    });
  } catch (error) {
    await prisma.processingResult.update({
      where: { id: internalTaskId },
      data: {
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      },
    });

    logger.error("Text processing submission failed", {
      internalTaskId,
      error,
    });

    res.status(502).json({
      error: "AI processing service unavailable",
      taskId: internalTaskId,
    });
  }
});

/**
 * GET /api/process/health
 *
 * Check MAIE service health
 */
router.get("/health", authenticate, async (req: AuthRequest, res) => {
  const isHealthy = await checkMaieHealth();

  res.json({
    maie: isHealthy ? "healthy" : "unavailable",
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/process/pending
 *
 * Get list of user's pending processing tasks (for fallback polling)
 */
router.get("/pending", authenticate, async (req: AuthRequest, res) => {
  const userId = req.user!.userId;

  const pendingTasks = await prisma.processingResult.findMany({
    where: {
      uploadedById: userId,
      status: "pending",
    },
    select: {
      id: true,
      maieStatus: true,
      templateId: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  res.json({
    success: true,
    tasks: pendingTasks.map((t) => ({
      taskId: t.id,
      status: t.maieStatus || "PENDING",
      progress: MAIE_STATUS_PROGRESS[t.maieStatus || "PENDING"] || 0,
      templateId: t.templateId,
      createdAt: t.createdAt.toISOString(),
    })),
  });
});

export default router;
