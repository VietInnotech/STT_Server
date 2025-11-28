import { Router } from "express";
import busboy from "busboy";
import crypto from "crypto";
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
 * Submit audio for AI processing (MAIE proxy)
 *
 * ⚠️ TRANSACTION SAFETY PATTERN:
 * 1. Create DB record as PENDING first (with internal UUID)
 * 2. Stream to MAIE
 * 3. Update DB record with MAIE task_id (or mark failed)
 *
 * This ensures we have a record even if the connection drops.
 */
router.post("/", authenticate, uploadLimiter, async (req: AuthRequest, res) => {
  const userId = req.user!.userId;

  // Generate internal task ID (never expose MAIE's task_id to clients)
  const internalTaskId = crypto.randomUUID();

  // Step 1: Create PENDING record BEFORE calling MAIE
  let processingResult;
  try {
    processingResult = await prisma.processingResult.create({
      data: {
        id: internalTaskId,
        status: "pending",
        uploadedById: userId,
        // maieTaskId will be set after MAIE responds
      },
    });
    logger.info("Created pending processing result", {
      taskId: internalTaskId,
      userId,
    });
  } catch (dbError) {
    logger.error("Failed to create processing result", { error: dbError });
    res.status(500).json({ error: "Failed to initiate processing" });
    return;
  }

  // Parse multipart form data
  // ⚠️ We need to buffer the file because fields may arrive AFTER the file
  // in the multipart stream (order depends on client), and we need template_id
  // before calling MAIE
  const bb = busboy({ headers: req.headers });

  let templateId: string | undefined;
  let features = "summary";
  let fileInfo: { filename: string; mimeType: string; data: Buffer } | null =
    null;
  let responseSent = false;

  bb.on("field", (name, val) => {
    logger.debug("Received field", { name, val });
    if (name === "template_id") templateId = val;
    if (name === "features") features = val;
  });

  bb.on("file", (name, file, info) => {
    const { filename, mimeType } = info;
    const chunks: Buffer[] = [];

    logger.info("Receiving file for processing", {
      taskId: internalTaskId,
      filename,
      mimeType,
    });

    file.on("data", (chunk) => {
      chunks.push(chunk);
    });

    file.on("end", () => {
      fileInfo = {
        filename,
        mimeType,
        data: Buffer.concat(chunks),
      };
      logger.info("File received completely", {
        taskId: internalTaskId,
        filename,
        size: fileInfo.data.length,
      });
    });
  });

  bb.on("close", async () => {
    // All fields and file have been parsed - now we can process
    if (!fileInfo) {
      // Clean up orphan record
      prisma.processingResult
        .delete({ where: { id: internalTaskId } })
        .catch(() => {});
      if (!responseSent) {
        responseSent = true;
        res.status(400).json({ error: "No audio file provided" });
      }
      return;
    }

    logger.info("Form parsing complete, submitting to MAIE", {
      taskId: internalTaskId,
      templateId,
      features,
      filename: fileInfo.filename,
      fileSize: fileInfo.data.length,
    });

    try {
      // Convert buffer to readable stream for submitToMaie
      const fileStream = Readable.from(fileInfo.data);

      // Step 2: Submit to MAIE with all fields available
      const maieResponse = await submitToMaie(
        fileStream,
        fileInfo.filename,
        templateId,
        features
      );

      // Step 3: Update DB record with MAIE task_id
      await prisma.processingResult.update({
        where: { id: internalTaskId },
        data: {
          maieTaskId: maieResponse.task_id,
          maieStatus: maieResponse.status,
          templateId,
        },
      });

      logger.info("Processing submitted to MAIE", {
        internalTaskId,
        maieTaskId: maieResponse.task_id,
        userId,
      });

      // Audit log
      await logProcessingAudit(
        userId,
        "process_audio_submitted",
        internalTaskId,
        {
          filename: fileInfo.filename,
          templateId,
          features,
        },
        req
      );

      // Return internal ID only - never expose MAIE's task_id
      if (!responseSent) {
        responseSent = true;
        res.status(202).json({
          success: true,
          taskId: internalTaskId,
          status: "PENDING",
          message: "Processing started",
        });
      }
    } catch (maieError) {
      // Mark record as failed if MAIE request fails
      await prisma.processingResult.update({
        where: { id: internalTaskId },
        data: {
          status: "failed",
          errorMessage:
            maieError instanceof Error ? maieError.message : "Unknown error",
        },
      });

      logger.error("MAIE submission failed", {
        internalTaskId,
        error: maieError,
      });

      if (!responseSent) {
        responseSent = true;
        res.status(502).json({
          error: "AI processing service unavailable",
          taskId: internalTaskId,
        });
      }
    }
  });

  bb.on("error", (error) => {
    logger.error("Busboy parsing error", { error, taskId: internalTaskId });
    prisma.processingResult
      .delete({ where: { id: internalTaskId } })
      .catch(() => {});
    if (!responseSent) {
      responseSent = true;
      res.status(400).json({ error: "Failed to parse upload" });
    }
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

      // Encrypt summary and transcript for secure storage
      const summaryText = summary.summary || "";
      const { encryptedData: summaryEncrypted, encryptedIV: summaryIv } =
        encrypt(Buffer.from(summaryText.normalize("NFC")));

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
          summarySize: Buffer.byteLength(summaryText, "utf8"),
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
