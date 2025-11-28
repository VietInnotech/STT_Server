import { Router, type Request, type Response } from "express";
import { uploadLimiter } from "../middleware/rateLimiter";
import path from "path";
import os from "os";
import crypto from "crypto";
import { createWriteStream } from "fs";
import { unlink } from "fs/promises";
import multer from "multer";
import busboy from "busboy";
import prisma from "../lib/prisma";
import { encrypt, decrypt } from "../utils/encryption";
import {
  authenticate,
  requireRole,
  requirePermission,
  type AuthRequest,
} from "../middleware/auth";
import { PERMISSIONS } from "../types/permissions";
import logger from "../lib/logger";
import { getIo, userRoom } from "../lib/socketBus";
import {
  checkStorageQuota,
  updateUserStorageUsage,
} from "../services/storageService";
import {
  saveAudioToFilesystem,
  getAudioStream,
  getAudioBuffer,
  deleteAudioFile,
  getMaxAudioSizeBytes,
  getDefaultAudioRetentionDays,
  cleanupTempFile,
} from "../services/audioStorageService";

const router = Router();

// Require auth for all file routes
router.use(authenticate);

/**
 * Fix UTF-8 filename encoding issues from multer.
 * Multer/busboy may incorrectly decode UTF-8 filenames as Latin-1,
 * causing Vietnamese and other non-ASCII characters to appear garbled.
 * This function re-interprets the incorrectly decoded string as UTF-8.
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

// Configure multer to store files in memory
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
});

/**
 * @swagger
 * /api/files/audio:
 *   post:
 *     summary: Upload audio file
 *     description: Upload an audio file with optional device association and auto-deletion schedule. File content is encrypted and stored on filesystem.
 *     tags: [Files]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Audio file to upload (max configurable via system:maxAudioSizeBytes)
 *               deviceId:
 *                 type: string
 *                 description: Device UUID or Android device identifier
 *                 example: "550e8400-e29b-41d4-a716-446655440000"
 *               deleteAfterDays:
 *                 type: integer
 *                 description: Number of days before automatic deletion (overrides user/system default)
 *                 example: 30
 *     responses:
 *       201:
 *         description: File uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 file:
 *                   $ref: '#/components/schemas/File'
 *       400:
 *         description: Bad request - no file or invalid references
 *       413:
 *         description: File too large or storage quota exceeded
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post(
  "/audio",
  uploadLimiter,
  requirePermission(PERMISSIONS.FILES_WRITE),
  async (req: AuthRequest, res: Response): Promise<any> => {
    const uploadedById = req.user?.userId;
    if (!uploadedById) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    // Get max file size limit
    const maxAudioSize = await getMaxAudioSizeBytes();

    // Use busboy for streaming upload to temp file
    // defParamCharset: 'utf8' ensures proper handling of Vietnamese/non-ASCII filenames
    const bb = busboy({
      headers: req.headers,
      limits: { fileSize: maxAudioSize },
      defParamCharset: "utf8",
    });

    let tempFilePath: string | null = null;
    let deviceId: string | undefined;
    let deleteAfterDays: number | undefined;
    let fileInfo: { filename: string; mimeType: string; size: number } | null =
      null;
    let fileTruncated = false;
    let responseSent = false;

    const sendResponse = (status: number, body: object) => {
      if (!responseSent) {
        responseSent = true;
        res.status(status).json(body);
      }
    };

    bb.on("field", (name, val) => {
      if (name === "deviceId") deviceId = val;
      if (name === "deleteAfterDays") {
        const parsed = parseInt(val, 10);
        if (!isNaN(parsed)) deleteAfterDays = parsed;
      }
    });

    bb.on("file", (name, file, info) => {
      const { filename, mimeType } = info;

      // Validate MIME type
      const allowedAudioMimes = [
        "audio/wav",
        "audio/x-wav",
        "audio/mpeg",
        "audio/mp3",
        "audio/ogg",
        "audio/webm",
        "audio/x-m4a",
        "audio/aac",
      ];
      const allowedAudioExts = [
        ".wav",
        ".mp3",
        ".ogg",
        ".webm",
        ".m4a",
        ".aac",
        ".flac",
      ];
      const mime = mimeType || "";
      const ext = path.extname(filename || "").toLowerCase();

      if (
        !allowedAudioMimes.includes(mime) &&
        !allowedAudioExts.includes(ext)
      ) {
        file.resume(); // Drain the stream
        sendResponse(400, {
          error:
            "Invalid audio file type. Allowed: wav, mp3, ogg, webm, m4a, aac, flac",
        });
        return;
      }

      // Stream to temp file
      tempFilePath = path.join(
        os.tmpdir(),
        `upload-${crypto.randomUUID()}.tmp`
      );
      const writeStream = createWriteStream(tempFilePath);
      let bytesWritten = 0;

      file.on("data", (chunk: Buffer) => {
        bytesWritten += chunk.length;
        writeStream.write(chunk);
      });

      file.on("limit", () => {
        fileTruncated = true;
        logger.warn("Audio file exceeded size limit", {
          maxAudioSize,
          bytesWritten,
        });
      });

      file.on("end", () => {
        writeStream.end();
        fileInfo = {
          filename,
          mimeType: mimeType || "audio/wav",
          size: bytesWritten,
        };
      });

      file.on("error", (err) => {
        writeStream.destroy();
        logger.error("File stream error", { err });
      });
    });

    bb.on("close", async () => {
      // Check if file was truncated
      if (fileTruncated) {
        if (tempFilePath) await cleanupTempFile(tempFilePath);
        sendResponse(413, {
          error: `File exceeds maximum size of ${Math.round(
            maxAudioSize / 1024 / 1024
          )}MB`,
        });
        return;
      }

      if (!fileInfo || !tempFilePath) {
        sendResponse(400, { error: "No file uploaded" });
        return;
      }

      try {
        // Check storage quota
        const quotaCheck = await checkStorageQuota(uploadedById, fileInfo.size);
        if (!quotaCheck.allowed) {
          await cleanupTempFile(tempFilePath);
          return sendResponse(413, {
            error: "Storage quota exceeded",
            message: quotaCheck.reason,
          });
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

        // Save to filesystem
        const { audioFileId, filePath } = await saveAudioToFilesystem({
          userId: uploadedById,
          tempFilePath,
          filename: fileInfo.filename,
          mimeType: fileInfo.mimeType,
          fileSize: fileInfo.size,
          deviceId: resolvedDeviceId,
          deleteAfterDays,
        });

        // Clean up temp file
        await cleanupTempFile(tempFilePath);

        // Get the created record for response
        const audioFile = await prisma.audioFile.findUnique({
          where: { id: audioFileId },
        });

        // Update storage usage
        await updateUserStorageUsage(uploadedById);

        // Audit log
        try {
          await prisma.auditLog.create({
            data: {
              userId: uploadedById,
              action: "files.upload",
              resource: "audio",
              resourceId: audioFileId,
              details: {
                filename: fileInfo.filename,
                fileSize: fileInfo.size,
                mimeType: fileInfo.mimeType,
                deviceId: resolvedDeviceId,
                storagePath: filePath,
              },
              ipAddress: req.ip || req.socket.remoteAddress || "unknown",
              userAgent: req.headers["user-agent"] || "unknown",
              success: true,
            },
          });
        } catch (logErr) {
          logger.error("Failed to create audit log for audio upload", logErr);
        }

        sendResponse(201, {
          success: true,
          file: {
            id: audioFile?.id,
            filename: audioFile?.filename,
            fileSize: audioFile?.fileSize,
            mimeType: audioFile?.mimeType,
            uploadedAt: audioFile?.uploadedAt,
          },
        });
      } catch (error) {
        logger.error("Error uploading audio file:", error);
        if (tempFilePath) await cleanupTempFile(tempFilePath);
        sendResponse(500, { error: "Failed to upload audio file" });
      }
    });

    bb.on("error", async (error) => {
      logger.error("Busboy error:", error);
      if (tempFilePath) await cleanupTempFile(tempFilePath);
      sendResponse(400, { error: "Failed to parse upload" });
    });

    req.pipe(bb);
  }
);

/**
 * @swagger
 * /api/files/text:
 *   post:
 *     summary: Upload text file
 *     description: Upload a text file with optional device association and auto-deletion schedule. File content is encrypted before storage.
 *     tags: [Files]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Text file to upload (max 50MB)
 *               deviceId:
 *                 type: string
 *                 description: Device UUID or Android device identifier
 *                 example: "550e8400-e29b-41d4-a716-446655440000"
 *               deleteAfterDays:
 *                 type: integer
 *                 description: Number of days before automatic deletion
 *                 example: 30
 *     responses:
 *       201:
 *         description: File uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 file:
 *                   $ref: '#/components/schemas/File'
 *       400:
 *         description: Bad request - no file or invalid references
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post(
  "/text",
  uploadLimiter,
  upload.single("file"),
  requirePermission(PERMISSIONS.FILES_WRITE),
  async (req: AuthRequest, res: Response): Promise<any> => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const { deviceId, deleteAfterDays, source } = req.body as {
        deviceId?: string;
        deleteAfterDays?: number;
        source?: string;
      };
      const uploadedById = req.user?.userId; // Get from authenticated user

      if (!uploadedById) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      // Check storage quota before processing
      const quotaCheck = await checkStorageQuota(uploadedById, req.file.size);
      if (!quotaCheck.allowed) {
        return res.status(413).json({
          error: "Storage quota exceeded",
          message: quotaCheck.reason,
        });
      }

      // Get user's default deleteAfterDays if not explicitly provided
      let finalDeleteAfterDays = deleteAfterDays;
      if (finalDeleteAfterDays === undefined) {
        const userSettings = await prisma.userSettings.findUnique({
          where: { userId: uploadedById },
          select: { defaultDeleteAfterDays: true },
        });
        if (
          userSettings &&
          userSettings.defaultDeleteAfterDays !== undefined &&
          userSettings.defaultDeleteAfterDays !== null
        ) {
          finalDeleteAfterDays = userSettings.defaultDeleteAfterDays;
        } else {
          const systemSetting = await prisma.systemConfig
            .findUnique({ where: { key: "system:autoDeleteDays" } })
            .catch(() => null);
          if (systemSetting) {
            try {
              const parsed = JSON.parse(systemSetting.value);
              finalDeleteAfterDays =
                typeof parsed === "number" ? parsed : Number(parsed);
            } catch {
              const raw = systemSetting.value;
              const n = Number(raw);
              finalDeleteAfterDays = Number.isNaN(n) ? undefined : n;
            }
          } else {
            finalDeleteAfterDays = undefined;
          }
        }
      }

      // Resolve deviceId similar to audio upload
      let resolvedDeviceId: string | null = null;
      if (deviceId) {
        const deviceById = await prisma.device
          .findUnique({ where: { id: String(deviceId) } })
          .catch(() => null);
        if (deviceById) {
          resolvedDeviceId = deviceById.id;
        } else {
          const deviceByDeviceId = await prisma.device
            .findFirst({ where: { deviceId: String(deviceId) } })
            .catch(() => null);
          if (deviceByDeviceId) resolvedDeviceId = deviceByDeviceId.id;
          else resolvedDeviceId = null;
        }
      }

      // Verify uploadedById exists in users table; if not, set to null to avoid FK violation
      const uploaderExists = await prisma.user
        .findUnique({ where: { id: uploadedById } })
        .catch(() => null);
      const resolvedUploadedById = uploaderExists ? uploadedById : null;

      // Prepare storage values
      const { encryptedData, encryptedIV } = encrypt(req.file.buffer);

      // If source === 'android', attempt to parse structured JSON payload from a 'json' form field
      let androidSummary: any = null;
      let androidRealtime: any = null;
      if (source === "android") {
        // try to read a 'json' text field in the multipart form
        const rawJson = (req.body &&
          (req.body.json || req.body.data || req.body.payload)) as
          | string
          | undefined;
        // If not provided as a text field, and the uploaded file is application/json, try to parse file buffer
        if (rawJson) {
          try {
            const parsed = JSON.parse(rawJson);
            // Expecting { summary: string, realtime: string }
            const s = parsed.summary ?? null;
            const r = parsed.realtime ?? null;
            androidSummary = s !== null && s !== undefined ? String(s) : null;
            androidRealtime = r !== null && r !== undefined ? String(r) : null;
          } catch (err) {
            return res
              .status(400)
              .json({ error: "Invalid JSON payload from android upload" });
          }
        } else if (
          req.file.mimetype === "application/json" ||
          req.file.mimetype === "text/json"
        ) {
          try {
            const parsed = JSON.parse(req.file.buffer.toString("utf-8"));
            const s = parsed.summary ?? null;
            const r = parsed.realtime ?? null;
            androidSummary = s !== null && s !== undefined ? String(s) : null;
            androidRealtime = r !== null && r !== undefined ? String(r) : null;
          } catch (err) {
            return res
              .status(400)
              .json({ error: "Invalid JSON file from android upload" });
          }
        }
      }

      // Save to database (use resolved IDs to avoid FK violations)
      let textFile;
      try {
        // Fix UTF-8 filename encoding (multer may incorrectly decode Vietnamese characters)
        const fixedFilename = fixUtf8Filename(req.file.originalname);

        // Prisma client may need to be regenerated after schema changes; cast to any here to avoid type errors
        textFile = await prisma.textFile.create({
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore - dynamic fields for new schema fields
          data: {
            filename: fixedFilename,
            originalName: fixedFilename,
            fileSize: req.file.size,
            encryptedData,
            encryptedIV,
            mimeType: req.file.mimetype || "text/plain",
            deviceId: resolvedDeviceId,
            uploadedById: resolvedUploadedById,
            deleteAfterDays: finalDeleteAfterDays
              ? Number(finalDeleteAfterDays)
              : null,
            scheduledDeleteAt: finalDeleteAfterDays
              ? new Date(
                  Date.now() +
                    Number(finalDeleteAfterDays) * 24 * 60 * 60 * 1000
                )
              : null,
            origin: source === "android" ? "android" : "web",
            androidSummary: androidSummary ? androidSummary : null,
            androidRealtime: androidRealtime ? androidRealtime : null,
          },
        } as any);
      } catch (err: any) {
        if (err?.code === "P2003") {
          logger.error("Foreign key constraint when creating text file", {
            err,
            deviceId,
            uploadedById,
          });
          return res.status(400).json({
            error:
              "Invalid deviceId or uploadedById. Make sure the device and user exist.",
          });
        }
        throw err;
      }

      // Create audit log for text upload
      try {
        await prisma.auditLog.create({
          data: {
            userId: resolvedUploadedById,
            action: "files.upload",
            resource: "text",
            resourceId: textFile.id,
            details: {
              filename: textFile.filename,
              fileSize: textFile.fileSize,
              mimeType: textFile.mimeType,
              deviceId: resolvedDeviceId,
            },
            ipAddress: req.ip || req.socket.remoteAddress || "unknown",
            userAgent: req.headers["user-agent"] || "unknown",
            success: true,
          },
        });
      } catch (logErr) {
        logger.error("Failed to create audit log for text upload", logErr);
      }

      // Update user's storage usage after successful upload
      if (resolvedUploadedById) {
        try {
          await updateUserStorageUsage(resolvedUploadedById);
        } catch (err) {
          logger.warn("Failed to update storage usage after text upload", {
            err,
          });
        }
      }

      return res.status(201).json({
        success: true,
        file: {
          id: textFile.id,
          filename: textFile.filename,
          fileSize: textFile.fileSize,
          mimeType: textFile.mimeType,
          uploadedAt: textFile.uploadedAt,
        },
      });
    } catch (error) {
      logger.error("Error uploading text file:", error);
      return res.status(500).json({ error: "Failed to upload text file" });
    }
  }
);

/**
 * @swagger
 * /api/files/audio:
 *   get:
 *     summary: List audio files
 *     description: Retrieve a paginated list of audio files with optional device filter
 *     tags: [Files]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: deviceId
 *         schema:
 *           type: string
 *         description: Filter by device UUID
 *         example: "550e8400-e29b-41d4-a716-446655440000"
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Maximum number of files to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Number of files to skip for pagination
 *     responses:
 *       200:
 *         description: Audio files retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 files:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/File'
 *                 count:
 *                   type: integer
 *                   example: 10
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get(
  "/audio",
  requirePermission(PERMISSIONS.FILES_READ),
  async (req: AuthRequest, res: Response): Promise<any> => {
    try {
      const { deviceId, limit = "50", offset = "0" } = req.query as any;
      const isAdmin = req.user?.roleName === "admin";

      // For non-admin users, include files they uploaded OR files shared with them
      let sharedAudioIds: string[] = [];
      const now = new Date();
      if (!isAdmin && req.user?.userId) {
        const shares = await prisma.fileShare.findMany({
          where: {
            sharedWithId: req.user.userId,
            fileType: "audio",
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
          select: { fileId: true },
        });
        sharedAudioIds = shares.map((s) => s.fileId);
      }

      const where: any = {};
      if (deviceId) where.deviceId = String(deviceId);
      if (!isAdmin && req.user?.userId) {
        // Include files uploaded by user OR shared with user
        where.OR = [
          { uploadedById: req.user.userId },
          ...(sharedAudioIds.length ? [{ id: { in: sharedAudioIds } }] : []),
        ];
      }

      const audioFiles = await prisma.audioFile.findMany({
        where,
        select: {
          id: true,
          filename: true,
          fileSize: true,
          mimeType: true,
          deviceId: true,
          uploadedById: true,
          uploadedBy: {
            select: {
              id: true,
              username: true,
              fullName: true,
            },
          },
          uploadedAt: true,
        },
        orderBy: { uploadedAt: "desc" },
        take: parseInt(String(limit)),
        skip: parseInt(String(offset)),
      });

      return res.json({
        success: true,
        files: audioFiles,
        count: audioFiles.length,
      });
    } catch (error) {
      logger.error("Error fetching audio files:", error);
      return res.status(500).json({ error: "Failed to fetch audio files" });
    }
  }
);

/**
 * GET /api/files/all - List both audio and text files in a single request
 * This endpoint is intended to reduce client-side request count (helps avoid rate limits)
 */
router.get(
  "/all",
  requirePermission(PERMISSIONS.FILES_READ),
  async (req: AuthRequest, res: Response): Promise<any> => {
    try {
      const { deviceId, limit = "50", offset = "0" } = req.query as any;
      const isAdmin = req.user?.roleName === "admin";

      // For non-admin users, include files they uploaded OR files that have been shared with them (and not expired)
      const baseWhere: any = {};
      if (deviceId) baseWhere.deviceId = String(deviceId);

      // Prepare shared file ids for this user (separately for audio/text)
      let sharedAudioIds: string[] = [];
      let sharedTextIds: string[] = [];
      const now = new Date();
      if (!isAdmin && req.user?.userId) {
        const shares = await prisma.fileShare.findMany({
          where: {
            sharedWithId: req.user.userId,
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
          select: {
            fileId: true,
            fileType: true,
            expiresInDays: true,
            expiresAt: true,
            sharedById: true,
          },
        });
        for (const s of shares) {
          if (s.fileType === "audio") sharedAudioIds.push(s.fileId);
          if (s.fileType === "text") sharedTextIds.push(s.fileId);
        }
      }

      const audioWhere: any = { ...baseWhere };
      const textWhere: any = { ...baseWhere };
      if (!isAdmin && req.user?.userId) {
        audioWhere.AND = [
          baseWhere,
          {
            OR: [
              { uploadedById: req.user.userId },
              ...(sharedAudioIds.length
                ? [{ id: { in: sharedAudioIds } }]
                : []),
            ],
          },
        ];
        textWhere.AND = [
          baseWhere,
          {
            OR: [
              { uploadedById: req.user.userId },
              ...(sharedTextIds.length ? [{ id: { in: sharedTextIds } }] : []),
            ],
          },
        ];
      } else {
        if (!isAdmin && req.user?.userId) {
          // fallback but should not reach here
          audioWhere.uploadedById = req.user.userId;
          textWhere.uploadedById = req.user.userId;
        }
      }

      const [audioFiles, textFiles] = await Promise.all([
        prisma.audioFile.findMany({
          where: audioWhere,
          select: {
            id: true,
            filename: true,
            fileSize: true,
            mimeType: true,
            deviceId: true,
            uploadedById: true,
            uploadedBy: {
              select: {
                id: true,
                username: true,
                fullName: true,
              },
            },
            deleteAfterDays: true,
            uploadedAt: true,
          },
          orderBy: { uploadedAt: "desc" },
          take: parseInt(String(limit)),
          skip: parseInt(String(offset)),
        }),
        prisma.textFile.findMany({
          where: textWhere,
          // @ts-ignore - select includes newly added fields (origin/androidSummary/androidRealtime)
          select: {
            id: true,
            filename: true,
            fileSize: true,
            mimeType: true,
            origin: true,
            androidSummary: true,
            androidRealtime: true,
            deviceId: true,
            uploadedById: true,
            uploadedBy: {
              select: {
                id: true,
                username: true,
                fullName: true,
              },
            },
            deleteAfterDays: true,
            uploadedAt: true,
          } as any,
          orderBy: { uploadedAt: "desc" },
          take: parseInt(String(limit)),
          skip: parseInt(String(offset)),
        }),
      ]);

      // Attach share info (expiresInDays/expiresAt/sharedById) per file when applicable
      const shareMap = new Map<
        string,
        {
          expiresInDays?: number | null;
          expiresAt?: Date | null;
          sharedById?: string | null;
          sharedByName?: string | null;
        }
      >();
      if (!isAdmin && req.user?.userId) {
        const activeShares = await prisma.fileShare.findMany({
          where: {
            sharedWithId: req.user.userId,
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
          select: {
            fileId: true,
            expiresInDays: true,
            expiresAt: true,
            sharedById: true,
            fileType: true,
          },
        });

        // Fetch sharedBy user names in batch to avoid per-row queries
        const sharedByIds = Array.from(
          new Set(activeShares.map((s) => s.sharedById).filter(Boolean))
        ) as string[];
        let sharedByUsers: any[] = [];
        if (sharedByIds.length > 0) {
          sharedByUsers = await prisma.user.findMany({
            where: { id: { in: sharedByIds } },
            select: { id: true, username: true, fullName: true },
          });
        }
        const userNameMap: Record<string, string> = {};
        for (const u of sharedByUsers)
          userNameMap[u.id] = u.fullName || u.username;

        for (const s of activeShares) {
          const sharedByName = s.sharedById
            ? userNameMap[s.sharedById] || null
            : null;
          shareMap.set(s.fileId, {
            expiresInDays: s.expiresInDays ?? null,
            expiresAt: s.expiresAt ?? null,
            sharedById: s.sharedById ?? null,
            sharedByName,
          });
        }
      }

      // For owners, attach list/count of shares they created for their files (to show shared indicator and allow revoke)
      const ownerShareMap = new Map<
        string,
        Array<{ sharedWithId: string; expiresAt?: Date | null }>
      >();
      if (req.user?.userId) {
        // collect file IDs returned to query owner shares only for those files
        const returnedFileIds = [
          ...audioFiles.map((f) => f.id),
          ...textFiles.map((f) => f.id),
        ].filter((id): id is string => id !== undefined);
        if (returnedFileIds.length > 0) {
          const ownerShares = await prisma.fileShare.findMany({
            where: {
              fileId: { in: returnedFileIds },
              sharedById: req.user.userId,
              OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            },
            select: { fileId: true, sharedWithId: true, expiresAt: true },
          });
          for (const s of ownerShares) {
            const arr = ownerShareMap.get(s.fileId) || [];
            arr.push({
              sharedWithId: s.sharedWithId,
              expiresAt: s.expiresAt ?? null,
            });
            ownerShareMap.set(s.fileId, arr);
          }
        }
      }

      // Map files to include share info if present
      const audioEnriched = audioFiles.map((f) => ({
        ...f,
        _share: f.id ? shareMap.get(f.id) ?? null : null,
        _ownerShares: f.id ? ownerShareMap.get(f.id) ?? null : null,
      }));
      const textEnriched = textFiles.map((f) => ({
        ...f,
        _share: f.id ? shareMap.get(f.id) ?? null : null,
        _ownerShares: f.id ? ownerShareMap.get(f.id) ?? null : null,
      }));

      return res.json({
        success: true,
        audio: audioEnriched,
        text: textEnriched,
        count: audioEnriched.length + textEnriched.length,
      });
    } catch (error) {
      logger.error("Error fetching all files:", error);
      return res.status(500).json({ error: "Failed to fetch files" });
    }
  }
);

/**
 * GET /api/files/text - List all text files
 */
router.get(
  "/text",
  requirePermission(PERMISSIONS.FILES_READ),
  async (req: AuthRequest, res: Response): Promise<any> => {
    try {
      const { deviceId, limit = "50", offset = "0" } = req.query as any;
      const isAdmin = req.user?.roleName === "admin";

      // For non-admin users, include files they uploaded OR files shared with them
      let sharedTextIds: string[] = [];
      const now = new Date();
      if (!isAdmin && req.user?.userId) {
        const shares = await prisma.fileShare.findMany({
          where: {
            sharedWithId: req.user.userId,
            fileType: "text",
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
          select: { fileId: true },
        });
        sharedTextIds = shares.map((s) => s.fileId);
      }

      const where: any = {};
      if (deviceId) where.deviceId = String(deviceId);
      if (!isAdmin && req.user?.userId) {
        // Include files uploaded by user OR shared with user
        where.OR = [
          { uploadedById: req.user.userId },
          ...(sharedTextIds.length ? [{ id: { in: sharedTextIds } }] : []),
        ];
      }

      const textFiles = await prisma.textFile.findMany({
        where,
        // @ts-ignore - select includes newly added fields
        select: {
          id: true,
          filename: true,
          fileSize: true,
          mimeType: true,
          origin: true,
          androidSummary: true,
          androidRealtime: true,
          deviceId: true,
          uploadedById: true,
          uploadedBy: {
            select: {
              id: true,
              username: true,
              fullName: true,
            },
          },
          uploadedAt: true,
        } as any,
        orderBy: { uploadedAt: "desc" },
        take: parseInt(String(limit)),
        skip: parseInt(String(offset)),
      });

      return res.json({
        success: true,
        files: textFiles,
        count: textFiles.length,
      });
    } catch (error) {
      logger.error("Error fetching text files:", error);
      return res.status(500).json({ error: "Failed to fetch text files" });
    }
  }
);

/**
 * GET /api/files/audio/:id - Download audio file
 * Decrypts and returns file (supports both filesystem and legacy DB storage)
 */
router.get(
  "/audio/:id",
  async (req: AuthRequest, res: Response): Promise<any> => {
    try {
      const { id } = req.params;

      const audioFile = await prisma.audioFile.findUnique({
        where: { id },
      });

      if (!audioFile) {
        return res.status(404).json({ error: "Audio file not found" });
      }

      // Ownership / share check for non-admins
      const isAdmin = req.user?.roleName === "admin";
      if (!isAdmin && audioFile.uploadedById !== req.user?.userId) {
        // Not the owner; check if the file was shared with the requester and the share is still active
        const now = new Date();
        const activeShare = await prisma.fileShare
          .findFirst({
            where: {
              fileId: id,
              fileType: "audio",
              sharedWithId: req.user?.userId,
              OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            },
          })
          .catch(() => null);

        if (!activeShare) {
          return res
            .status(403)
            .json({ error: "Forbidden: You do not have access to this file" });
        }

        logger.debug("Download permitted via active share", {
          fileId: id,
          sharedWith: req.user?.userId,
        });
      }

      // Get decrypted content (handles both filesystem and legacy DB storage)
      try {
        const { stream, mimeType, filename, fileSize } = await getAudioStream(
          audioFile.id
        );

        // Set headers
        res.setHeader("Content-Type", mimeType);
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${filename}"`
        );
        res.setHeader("Content-Length", fileSize);

        // Pipe the stream to response
        stream.pipe(res);
      } catch (streamErr) {
        logger.error("Failed to stream audio file", { id, error: streamErr });
        return res.status(500).json({ error: "Failed to retrieve audio file" });
      }
    } catch (error) {
      logger.error("Error downloading audio file:", error);
      return res.status(500).json({ error: "Failed to download audio file" });
    }
  }
);

/**
 * GET /api/files/text/:id - Download text file
 * Decrypts and returns file
 */
router.get(
  "/text/:id",
  async (req: AuthRequest, res: Response): Promise<any> => {
    try {
      const { id } = req.params;

      const textFile = await prisma.textFile.findUnique({
        where: { id },
      });

      if (!textFile) {
        return res.status(404).json({ error: "Text file not found" });
      }

      // Ownership / share check for non-admins
      const isAdmin = req.user?.roleName === "admin";
      if (!isAdmin && textFile.uploadedById !== req.user?.userId) {
        // Not the owner; check if the file was shared with the requester and the share is still active
        const now = new Date();
        const activeShare = await prisma.fileShare
          .findFirst({
            where: {
              fileId: id,
              fileType: "text",
              sharedWithId: req.user?.userId,
              OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            },
          })
          .catch(() => null);

        if (!activeShare) {
          return res
            .status(403)
            .json({ error: "Forbidden: You do not have access to this file" });
        }

        logger.debug("Download permitted via active share", {
          fileId: id,
          sharedWith: req.user?.userId,
        });
      }

      // Decrypt file content
      const decryptedData = decrypt(
        Buffer.from(textFile.encryptedData),
        textFile.encryptedIV
      );

      // Set headers
      res.setHeader("Content-Type", textFile.mimeType);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${textFile.filename}"`
      );
      res.setHeader("Content-Length", decryptedData.length);

      return res.send(decryptedData);
    } catch (error) {
      logger.error("Error downloading text file:", error);
      return res.status(500).json({ error: "Failed to download text file" });
    }
  }
);

/**
 * DELETE /api/files/audio/:id - Delete audio file
 * Also cascade-deletes associated FileShare records and filesystem storage
 */
router.delete(
  "/audio/:id",
  requirePermission(PERMISSIONS.FILES_DELETE),
  async (req: AuthRequest, res: Response): Promise<any> => {
    try {
      const { id } = req.params;
      const isAdmin = req.user?.roleName === "admin";

      // Fetch file to check ownership
      const file = await prisma.audioFile.findUnique({ where: { id } });
      if (!file) {
        return res.status(404).json({ error: "Audio file not found" });
      }

      if (!isAdmin && file.uploadedById !== req.user?.userId) {
        return res
          .status(403)
          .json({ error: "Forbidden: You cannot delete this file" });
      }

      // Delete from filesystem (if applicable) and database
      // This handles FileShare cascade, storage update, and filesystem cleanup
      await deleteAudioFile(file.id);

      // Audit log
      try {
        await prisma.auditLog.create({
          data: {
            userId: req.user?.userId,
            action: "files.delete",
            resource: "audio",
            resourceId: id,
            details: {
              filename: file.filename,
              fileSize: file.fileSize,
              hadFilePath: !!file.filePath,
            },
            ipAddress: req.ip || req.socket.remoteAddress || "unknown",
            userAgent: req.headers["user-agent"] || "unknown",
            success: true,
          },
        });
      } catch (logErr) {
        logger.error("Failed to create audit log for audio delete", logErr);
      }

      return res.json({ success: true, message: "Audio file deleted" });
    } catch (error) {
      logger.error("Error deleting audio file:", error);
      return res.status(500).json({ error: "Failed to delete audio file" });
    }
  }
);

/**
 * DELETE /api/files/text/:id - Delete text file
 * Also cascade-deletes associated FileShare records
 */
router.delete(
  "/text/:id",
  requirePermission(PERMISSIONS.FILES_DELETE),
  async (req: AuthRequest, res: Response): Promise<any> => {
    try {
      const { id } = req.params;
      const isAdmin = req.user?.roleName === "admin";

      // Fetch file to check ownership and get size for storage update
      const file = await prisma.textFile.findUnique({ where: { id } });
      if (!file) {
        return res.status(404).json({ error: "Text file not found" });
      }

      if (!isAdmin && file.uploadedById !== req.user?.userId) {
        return res
          .status(403)
          .json({ error: "Forbidden: You cannot delete this file" });
      }

      // Use transaction to delete FileShare records and the file atomically
      await prisma.$transaction(async (tx) => {
        // Delete all FileShare records referencing this text file
        await tx.fileShare.deleteMany({
          where: { fileId: id, fileType: "text" },
        });
        // Delete the text file
        await tx.textFile.delete({ where: { id } });
      });

      // Update user's storage usage if file had an owner
      if (file.uploadedById) {
        try {
          const { updateUserStorageUsage } = await import(
            "../services/storageService"
          );
          await updateUserStorageUsage(file.uploadedById);
        } catch (err) {
          logger.warn("Failed to update storage usage after text delete", {
            err,
          });
        }
      }

      // Audit log
      try {
        await prisma.auditLog.create({
          data: {
            userId: req.user?.userId,
            action: "files.delete",
            resource: "text",
            resourceId: id,
            details: { filename: file.filename, fileSize: file.fileSize },
            ipAddress: req.ip || req.socket.remoteAddress || "unknown",
            userAgent: req.headers["user-agent"] || "unknown",
            success: true,
          },
        });
      } catch (logErr) {
        logger.error("Failed to create audit log for text delete", logErr);
      }

      return res.json({ success: true, message: "Text file deleted" });
    } catch (error) {
      logger.error("Error deleting text file:", error);
      return res.status(500).json({ error: "Failed to delete text file" });
    }
  }
);

/**
 * POST /api/files/share - Share one or more files with users
 * Body: { shares: Array<{ fileId: string, fileType: 'audio'|'text', userId: string }> }
 */
router.post(
  "/share",
  requirePermission(PERMISSIONS.FILES_WRITE),
  async (req: AuthRequest, res: Response): Promise<any> => {
    try {
      const { shares } = req.body as {
        shares?: Array<{ fileId: string; fileType: string; userId: string }>;
      };
      if (!Array.isArray(shares) || shares.length === 0) {
        return res.status(400).json({ error: "No shares provided" });
      }

      const created: any[] = [];
      for (const s of shares) {
        const { fileId, fileType, userId, expiresInDays } = s as any;
        if (!fileId || !fileType || !userId) continue;

        // Verify file exists and caller is the owner (admin CANNOT share others' files anymore)
        let fileOwnerId: string | null = null;
        if (fileType === "audio") {
          const f = await prisma.audioFile.findUnique({
            where: { id: fileId },
          });
          if (!f) continue;
          fileOwnerId = f.uploadedById || null;
        } else if (fileType === "text") {
          const f = await prisma.textFile.findUnique({ where: { id: fileId } });
          if (!f) continue;
          fileOwnerId = f.uploadedById || null;
        } else {
          continue;
        }

        // Must be owner to share
        if (!req.user?.userId || fileOwnerId !== req.user.userId) {
          // skip creating share for files not owned by the requester
          continue;
        }

        // Compute expiresAt if provided
        let expiresAt: Date | null = null;
        if (expiresInDays !== undefined && expiresInDays !== null) {
          const n = Number(expiresInDays);
          if (!Number.isNaN(n) && n > 0) {
            expiresAt = new Date(Date.now() + n * 24 * 60 * 60 * 1000);
          }
        }

        // Create file share record
        const share = await prisma.fileShare.create({
          data: {
            fileId,
            fileType,
            sharedById: req.user?.userId || null,
            sharedWithId: userId,
            expiresInDays: expiresInDays ? Number(expiresInDays) : null,
            expiresAt: expiresAt,
          },
        });

        // Audit log
        try {
          await prisma.auditLog.create({
            data: {
              userId: req.user?.userId || null,
              action: "files.share",
              resource: fileType,
              resourceId: fileId,
              details: { sharedWith: userId },
              ipAddress: req.ip || req.socket.remoteAddress || "unknown",
              userAgent: req.headers["user-agent"] || "unknown",
              success: true,
            },
          });
        } catch (logErr) {
          // ignore
        }

        // Emit socket notification to recipient if connected
        try {
          const io = getIo();
          const payload: any = {
            action: "file.shared",
            fileId,
            fileType,
            sharedById: req.user?.userId || null,
            expiresAt: expiresAt ? expiresAt.toISOString() : null,
            timestamp: new Date().toISOString(),
          };
          io.to(userRoom(userId)).emit("files:shared", payload);
        } catch (emitErr) {
          // If socket server not available, ignore
          logger.debug("Socket emit failed for share", {
            err: (emitErr as Error).message,
          });
        }

        created.push(share);
      }

      return res.json({ success: true, created: created.length });
    } catch (error) {
      logger.error("Error creating file shares:", error);
      return res.status(500).json({ error: "Failed to create file shares" });
    }
  }
);

/**
 * @swagger
 * /api/files/text-pair-android:
 *   post:
 *     summary: Upload text file pair from Android app
 *     description: |
 *       Android endpoint to upload summary and/or realtime text content in a single JSON request.
 *       Creates TextFile records and links them with TextFilePair.
 *
 *       **Note:** The `summary` field is now optional (soft deprecated). New implementations
 *       should prefer sending only the `realtime` content. Legacy clients sending both fields
 *       will continue to work as before.
 *     tags: [Files]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - realtime
 *               - deviceId
 *             properties:
 *               summary:
 *                 type: string
 *                 description: Summary text content (optional, soft deprecated)
 *                 example: "System status report..."
 *               realtime:
 *                 type: string
 *                 description: Real-time monitoring text content
 *                 example: "Real-time monitoring data..."
 *               deviceId:
 *                 type: string
 *                 description: Android device identifier
 *                 example: "device-uuid-123"
 *               deleteAfterDays:
 *                 type: integer
 *                 description: Number of days before automatic deletion
 *                 example: 30
 *               pairName:
 *                 type: string
 *                 description: Optional name for the file pair
 *                 example: "Analysis 2025-11-20"
 *     responses:
 *       201:
 *         description: File pair created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 pair:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     summaryFileId:
 *                       type: string
 *                       nullable: true
 *                       description: Null if no summary was provided
 *                     realtimeFileId:
 *                       type: string
 *                     uploadedAt:
 *                       type: string
 *       400:
 *         description: Bad request - missing required fields
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post(
  "/text-pair-android",
  uploadLimiter,
  requirePermission(PERMISSIONS.FILES_WRITE),
  async (req: AuthRequest, res: Response): Promise<any> => {
    try {
      const { summary, realtime, deviceId, deleteAfterDays, pairName } =
        req.body as {
          summary?: string;
          realtime?: string;
          deviceId?: string;
          deleteAfterDays?: number;
          pairName?: string;
        };

      // Validate required fields (summary is now optional / soft deprecated)
      if (!realtime) {
        return res.status(400).json({ error: "Realtime content is required" });
      }

      const uploadedById = req.user?.userId;
      if (!uploadedById) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      // Check storage quota before processing (calculate combined size)
      const summarySize = summary ? Buffer.byteLength(summary, "utf8") : 0;
      const combinedSize = summarySize + Buffer.byteLength(realtime, "utf8");
      const quotaCheck = await checkStorageQuota(uploadedById, combinedSize);
      if (!quotaCheck.allowed) {
        return res.status(413).json({
          error: "Storage quota exceeded",
          message: quotaCheck.reason,
        });
      }

      // Get default deleteAfterDays if not provided
      let finalDeleteAfterDays = deleteAfterDays;
      if (finalDeleteAfterDays === undefined) {
        const userSettings = await prisma.userSettings.findUnique({
          where: { userId: uploadedById },
          select: { defaultDeleteAfterDays: true },
        });
        finalDeleteAfterDays =
          userSettings?.defaultDeleteAfterDays ?? undefined;
      }

      // Resolve deviceId
      let resolvedDeviceId: string | null = null;
      if (deviceId) {
        const deviceById = await prisma.device
          .findUnique({ where: { id: String(deviceId) } })
          .catch(() => null);
        if (deviceById) {
          resolvedDeviceId = deviceById.id;
        } else {
          const deviceByDeviceId = await prisma.device
            .findFirst({ where: { deviceId: String(deviceId) } })
            .catch(() => null);
          resolvedDeviceId = deviceByDeviceId?.id ?? null;
        }
      }

      // Verify uploader exists
      const uploaderExists = await prisma.user
        .findUnique({ where: { id: uploadedById } })
        .catch(() => null);
      const resolvedUploadedById = uploaderExists ? uploadedById : null;

      // Calculate scheduled delete time if deleteAfterDays is set
      const scheduledDeleteAt = finalDeleteAfterDays
        ? new Date(Date.now() + finalDeleteAfterDays * 24 * 60 * 60 * 1000)
        : null;

      // Create files and pair in transaction (summary is optional)
      const result = await prisma.$transaction(async (tx) => {
        let summaryFile: { id: string } | null = null;

        // Create summary file only if summary content provided
        if (summary) {
          const { encryptedData: summaryEncrypted, encryptedIV: summaryIV } =
            encrypt(Buffer.from(summary));

          summaryFile = await tx.textFile.create({
            data: {
              filename: `${pairName || "summary"}_${Date.now()}.txt`,
              originalName: `${pairName || "summary"}.txt`,
              fileSize: Buffer.byteLength(summary, "utf8"),
              encryptedData: summaryEncrypted,
              encryptedIV: summaryIV,
              origin: "android",
              deviceId: resolvedDeviceId,
              uploadedById: resolvedUploadedById,
              deleteAfterDays: finalDeleteAfterDays,
              scheduledDeleteAt: scheduledDeleteAt,
              // Also store the android summary payload for UI quick preview
              androidSummary: summary,
            },
          });
        }

        // Encrypt realtime content
        const { encryptedData: realtimeEncrypted, encryptedIV: realtimeIV } =
          encrypt(Buffer.from(realtime));

        // Create realtime file
        const realtimeFile = await tx.textFile.create({
          data: {
            filename: `${pairName || "realtime"}_${Date.now()}.txt`,
            originalName: `${pairName || "realtime"}.txt`,
            fileSize: Buffer.byteLength(realtime, "utf8"),
            encryptedData: realtimeEncrypted,
            encryptedIV: realtimeIV,
            origin: "android",
            deviceId: resolvedDeviceId,
            uploadedById: resolvedUploadedById,
            deleteAfterDays: finalDeleteAfterDays,
            scheduledDeleteAt: scheduledDeleteAt,
            // Also store the android realtime payload for UI quick preview
            androidRealtime: realtime,
          },
        });

        // Create pair (summaryFileId is optional now)
        const pair = await tx.textFilePair.create({
          data: {
            name: pairName,
            summaryFileId: summaryFile?.id || null,
            realtimeFileId: realtimeFile.id,
            uploadedById: resolvedUploadedById,
            deleteAfterDays: finalDeleteAfterDays,
            scheduledDeleteAt: scheduledDeleteAt,
          },
        });

        return { pair, summaryFile, realtimeFile };
      });

      // Audit log
      try {
        await prisma.auditLog.create({
          data: {
            userId: resolvedUploadedById,
            action: "files.text_pair_upload",
            resource: "text_pair",
            resourceId: result.pair.id,
            details: {
              pairName,
              summaryFileId: result.summaryFile?.id || null,
              realtimeFileId: result.realtimeFile.id,
              deviceId: resolvedDeviceId,
              hasSummary: !!result.summaryFile,
            },
            ipAddress: req.ip || req.socket.remoteAddress || "unknown",
            userAgent: req.headers["user-agent"] || "unknown",
            success: true,
          },
        });
      } catch (logErr) {
        logger.error("Failed to create audit log", logErr);
      }

      // Update user's storage usage after successful upload
      if (resolvedUploadedById) {
        try {
          await updateUserStorageUsage(resolvedUploadedById);
        } catch (err) {
          logger.warn("Failed to update storage usage after text pair upload", {
            err,
          });
        }
      }

      // Socket notification
      try {
        const io = getIo();
        io.to(req.user?.userId || "").emit("files:text_pair_created", {
          pairId: result.pair.id,
          pairName,
          summaryFileId: result.summaryFile?.id || null,
          realtimeFileId: result.realtimeFile.id,
          timestamp: new Date().toISOString(),
        });
      } catch (emitErr) {
        logger.debug("Socket emit failed", { err: (emitErr as Error).message });
      }

      return res.status(201).json({
        success: true,
        pair: {
          id: result.pair.id,
          name: result.pair.name,
          summaryFileId: result.summaryFile?.id || null,
          realtimeFileId: result.realtimeFile.id,
          uploadedAt: result.pair.createdAt,
        },
      });
    } catch (error) {
      logger.error("Error uploading text pair from Android:", error);
      return res.status(500).json({ error: "Failed to upload text pair" });
    }
  }
);

/**
 * @swagger
 * /api/files/text-pair:
 *   post:
 *     summary: Upload text file pair from WebUI
 *     description: WebUI endpoint to upload one or both text files as multipart form data. Creates TextFile records and links them with TextFilePair.
 *     tags: [Files]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               summary:
 *                 type: string
 *                 format: binary
 *                 description: Summary text file (optional)
 *               realtime:
 *                 type: string
 *                 format: binary
 *                 description: Realtime text file (optional)
 *               deleteAfterDays:
 *                 type: integer
 *               pairName:
 *                 type: string
 *     responses:
 *       201:
 *         description: File pair created successfully
 *       400:
 *         description: Bad request - at least one file required
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post(
  "/text-pair",
  uploadLimiter,
  upload.fields([
    { name: "summary", maxCount: 1 },
    { name: "realtime", maxCount: 1 },
  ]),
  requirePermission(PERMISSIONS.FILES_WRITE),
  async (req: AuthRequest, res: Response): Promise<any> => {
    try {
      const files = req.files as
        | { [fieldname: string]: Express.Multer.File[] }
        | undefined;
      const summaryFile = files?.summary?.[0];
      const realtimeFile = files?.realtime?.[0];

      // Require at least one file
      if (!summaryFile && !realtimeFile) {
        return res.status(400).json({
          error: "At least one file (summary or realtime) is required",
        });
      }

      const { deleteAfterDays, pairName } = req.body as {
        deleteAfterDays?: number;
        pairName?: string;
      };
      const uploadedById = req.user?.userId;
      if (!uploadedById) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      // Check storage quota before processing (calculate combined size)
      const combinedSize = (summaryFile?.size || 0) + (realtimeFile?.size || 0);
      const quotaCheck = await checkStorageQuota(uploadedById, combinedSize);
      if (!quotaCheck.allowed) {
        return res.status(413).json({
          error: "Storage quota exceeded",
          message: quotaCheck.reason,
        });
      }

      // Get default deleteAfterDays if not provided
      let finalDeleteAfterDays = deleteAfterDays;
      if (finalDeleteAfterDays === undefined) {
        const userSettings = await prisma.userSettings.findUnique({
          where: { userId: uploadedById },
          select: { defaultDeleteAfterDays: true },
        });
        finalDeleteAfterDays =
          userSettings?.defaultDeleteAfterDays ?? undefined;
      }

      // Verify uploader exists
      const uploaderExists = await prisma.user
        .findUnique({ where: { id: uploadedById } })
        .catch(() => null);
      const resolvedUploadedById = uploaderExists ? uploadedById : null;

      // Calculate scheduled delete time
      const scheduledDeleteAt = finalDeleteAfterDays
        ? new Date(Date.now() + finalDeleteAfterDays * 24 * 60 * 60 * 1000)
        : null;

      // Create files and pair in transaction
      const result = await prisma.$transaction(async (tx) => {
        let summaryTextFile = null;
        let realtimeTextFile = null;

        if (summaryFile) {
          const { encryptedData, encryptedIV } = encrypt(summaryFile.buffer);
          // Fix UTF-8 filename encoding (multer may incorrectly decode Vietnamese characters)
          const fixedSummaryName = fixUtf8Filename(summaryFile.originalname);
          summaryTextFile = await tx.textFile.create({
            data: {
              filename: `summary_${Date.now()}.txt`,
              originalName: fixedSummaryName,
              fileSize: summaryFile.size,
              encryptedData,
              encryptedIV,
              origin: "web",
              uploadedById: resolvedUploadedById,
              deleteAfterDays: finalDeleteAfterDays,
              scheduledDeleteAt: scheduledDeleteAt,
            },
          });
        }

        if (realtimeFile) {
          const { encryptedData, encryptedIV } = encrypt(realtimeFile.buffer);
          // Fix UTF-8 filename encoding (multer may incorrectly decode Vietnamese characters)
          const fixedRealtimeName = fixUtf8Filename(realtimeFile.originalname);
          realtimeTextFile = await tx.textFile.create({
            data: {
              filename: `realtime_${Date.now()}.txt`,
              originalName: fixedRealtimeName,
              fileSize: realtimeFile.size,
              encryptedData,
              encryptedIV,
              origin: "web",
              uploadedById: resolvedUploadedById,
              deleteAfterDays: finalDeleteAfterDays,
              scheduledDeleteAt: scheduledDeleteAt,
            },
          });
        }

        // Both files must exist to create pair
        if (!summaryTextFile || !realtimeTextFile) {
          throw new Error(
            "Both summary and realtime files must be provided to create a pair"
          );
        }

        // Create pair
        const pair = await tx.textFilePair.create({
          data: {
            name: pairName,
            summaryFileId: summaryTextFile.id,
            realtimeFileId: realtimeTextFile.id,
            uploadedById: resolvedUploadedById,
            deleteAfterDays: finalDeleteAfterDays,
            scheduledDeleteAt: scheduledDeleteAt,
          },
        });

        return { pair, summaryTextFile, realtimeTextFile };
      });

      // Audit log
      try {
        await prisma.auditLog.create({
          data: {
            userId: resolvedUploadedById,
            action: "files.text_pair_upload",
            resource: "text_pair",
            resourceId: result.pair.id,
            details: {
              pairName,
              summaryFileName: summaryFile
                ? fixUtf8Filename(summaryFile.originalname)
                : undefined,
              realtimeFileName: realtimeFile
                ? fixUtf8Filename(realtimeFile.originalname)
                : undefined,
              source: "web",
            },
            ipAddress: req.ip || req.socket.remoteAddress || "unknown",
            userAgent: req.headers["user-agent"] || "unknown",
            success: true,
          },
        });
      } catch (logErr) {
        logger.error("Failed to create audit log", logErr);
      }

      // Update user's storage usage after successful upload
      if (resolvedUploadedById) {
        try {
          await updateUserStorageUsage(resolvedUploadedById);
        } catch (err) {
          logger.warn("Failed to update storage usage after text pair upload", {
            err,
          });
        }
      }

      // Socket notification
      try {
        const io = getIo();
        io.to(req.user?.userId || "").emit("files:text_pair_created", {
          pairId: result.pair.id,
          pairName,
          summaryFileId: result.summaryTextFile.id,
          realtimeFileId: result.realtimeTextFile.id,
          timestamp: new Date().toISOString(),
        });
      } catch (emitErr) {
        logger.debug("Socket emit failed", { err: (emitErr as Error).message });
      }

      return res.status(201).json({
        success: true,
        pair: {
          id: result.pair.id,
          name: result.pair.name,
          summaryFileId: result.summaryTextFile.id,
          realtimeFileId: result.realtimeTextFile.id,
          uploadedAt: result.pair.createdAt,
        },
      });
    } catch (error) {
      logger.error("Error uploading text pair:", error);
      return res.status(500).json({ error: "Failed to upload text pair" });
    }
  }
);

/**
 * @swagger
 * /api/files/pairs/{pairId}:
 *   get:
 *     summary: Get text file pair details
 *     tags: [Files]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: pairId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Pair details with both files
 *       404:
 *         description: Pair not found
 */
router.get(
  "/pairs/:pairId",
  requirePermission(PERMISSIONS.FILES_READ),
  async (req: AuthRequest, res: Response): Promise<any> => {
    try {
      const { pairId } = req.params;

      const pair = await prisma.textFilePair.findUnique({
        where: { id: pairId },
        include: {
          summaryFile: true,
          realtimeFile: true,
          uploadedBy: {
            select: {
              id: true,
              username: true,
              fullName: true,
            },
          },
        },
      });

      if (!pair) {
        return res.status(404).json({ error: "Pair not found" });
      }

      // Check access permission (owner or admin)
      const isAdmin = req.user?.roleName === "admin";
      if (!isAdmin && pair.uploadedById !== req.user?.userId) {
        return res
          .status(403)
          .json({ error: "Forbidden: You do not have access to this pair" });
      }

      return res.json({
        success: true,
        pair: {
          id: pair.id,
          name: pair.name,
          uploadedById: pair.uploadedById,
          uploadedBy: pair.uploadedBy,
          summaryFile: pair.summaryFile
            ? {
                id: pair.summaryFile.id,
                filename: pair.summaryFile.filename,
                originalName: pair.summaryFile.originalName,
                fileSize: pair.summaryFile.fileSize,
                origin: pair.summaryFile.origin,
                uploadedAt: pair.summaryFile.uploadedAt,
              }
            : null,
          realtimeFile: {
            id: pair.realtimeFile.id,
            filename: pair.realtimeFile.filename,
            originalName: pair.realtimeFile.originalName,
            fileSize: pair.realtimeFile.fileSize,
            origin: pair.realtimeFile.origin,
            uploadedAt: pair.realtimeFile.uploadedAt,
          },
          createdAt: pair.createdAt,
        },
      });
    } catch (error) {
      logger.error("Error fetching pair:", error);
      return res.status(500).json({ error: "Failed to fetch pair" });
    }
  }
);

/**
 * @swagger
 * /api/files/pairs:
 *   get:
 *     summary: List all text file pairs
 *     tags: [Files]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: limit
 *         in: query
 *         schema:
 *           type: integer
 *         required: false
 *       - name: offset
 *         in: query
 *         schema:
 *           type: integer
 *         required: false
 *     responses:
 *       200:
 *         description: List of pairs
 */
router.get(
  "/pairs",
  requirePermission(PERMISSIONS.FILES_READ),
  async (req: AuthRequest, res: Response): Promise<any> => {
    try {
      const { limit, offset } = req.query as any;
      const l = limit ? Number(limit) : 50;
      const o = offset ? Number(offset) : 0;
      const isAdmin = req.user?.roleName === "admin";

      // Build where clause - admin sees all, others see only their own pairs
      const where: any = {};
      if (!isAdmin && req.user?.userId) {
        where.uploadedById = req.user.userId;
      }

      const pairs = await prisma.textFilePair.findMany({
        where,
        include: {
          summaryFile: true,
          realtimeFile: true,
          uploadedBy: {
            select: {
              id: true,
              username: true,
              fullName: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: l,
        skip: o,
      });

      return res.json({ pairs });
    } catch (error) {
      logger.error("Error listing pairs:", error);
      return res.status(500).json({ error: "Failed to fetch pairs" });
    }
  }
);

/**
 * @swagger
 * /api/files/pairs/{pairId}:
 *   delete:
 *     summary: Delete text file pair (cascades to both files)
 *     tags: [Files]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: pairId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Pair and both files deleted
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Pair not found
 */
router.delete(
  "/pairs/:pairId",
  requirePermission(PERMISSIONS.FILES_DELETE),
  async (req: AuthRequest, res: Response): Promise<any> => {
    try {
      const { pairId } = req.params;

      const pair = await prisma.textFilePair.findUnique({
        where: { id: pairId },
      });
      if (!pair) {
        return res.status(404).json({ error: "Pair not found" });
      }

      // Check ownership (owner or admin)
      const isAdmin = req.user?.roleName === "admin";
      if (!isAdmin && pair.uploadedById !== req.user?.userId) {
        return res
          .status(403)
          .json({ error: "Forbidden: You cannot delete this pair" });
      }

      // Delete pair (cascade will delete both TextFile records due to onDelete: Cascade)
      await prisma.textFilePair.delete({ where: { id: pairId } });

      // Audit log
      try {
        await prisma.auditLog.create({
          data: {
            userId: req.user?.userId,
            action: "files.text_pair_delete",
            resource: "text_pair",
            resourceId: pairId,
            details: { cascadeDeletedFiles: true },
            ipAddress: req.ip || req.socket.remoteAddress || "unknown",
            userAgent: req.headers["user-agent"] || "unknown",
            success: true,
          },
        });
      } catch (logErr) {
        logger.error("Failed to create audit log", logErr);
      }

      return res.json({
        success: true,
        message: "Pair and both files deleted",
      });
    } catch (error) {
      logger.error("Error deleting pair:", error);
      return res.status(500).json({ error: "Failed to delete pair" });
    }
  }
);

// ============================================
// PHASE 1: PROCESSING RESULTS (AI-Processed Results)
// ============================================

/**
 * Helper: Add tags to a processing result via the junction table.
 * Creates tags if they don't exist, normalizes to lowercase.
 */
async function addTagsToResult(
  resultId: string,
  tags: string[]
): Promise<void> {
  // Normalize tags to lowercase, NFC Unicode form, and dedupe
  const normalizedTags = [
    ...new Set(
      tags.map((t) => t.toLowerCase().trim().normalize("NFC")).filter(Boolean)
    ),
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
 * @swagger
 * /api/files/processing-result:
 *   post:
 *     summary: Save a completed AI processing result
 *     description: Upload/save a processing result with metadata. Used by Android app to persist completed results.
 *     tags: [Files]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - summary
 *             properties:
 *               title:
 *                 type: string
 *                 description: Title of the result
 *               summary:
 *                 type: string
 *                 description: Summary text
 *               transcript:
 *                 type: string
 *                 description: Full transcript
 *               templateId:
 *                 type: string
 *                 description: Template ID used for processing
 *               templateName:
 *                 type: string
 *                 description: Template name
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Tags/keywords
 *               keyTopics:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Key topics identified
 *               confidence:
 *                 type: number
 *                 description: ASR confidence (0.0-1.0)
 *               processingTime:
 *                 type: number
 *                 description: Processing time in seconds
 *               audioDuration:
 *                 type: number
 *                 description: Audio duration in seconds
 *               deviceId:
 *                 type: string
 *                 description: Device ID if from Android
 *               deleteAfterDays:
 *                 type: integer
 *                 description: Auto-delete after N days
 *     responses:
 *       201:
 *         description: Processing result saved successfully
 *       400:
 *         description: Bad request - missing required fields
 *       401:
 *         description: Unauthorized
 */
router.post(
  "/processing-result",
  uploadLimiter,
  requirePermission(PERMISSIONS.FILES_WRITE),
  async (req: AuthRequest, res: Response): Promise<any> => {
    try {
      const {
        title,
        summary,
        transcript,
        templateId,
        templateName,
        tags,
        keyTopics,
        confidence,
        processingTime,
        audioDuration,
        deviceId,
        deleteAfterDays,
        sourceAudioId,
      } = req.body as {
        title?: string;
        summary?: string;
        transcript?: string;
        templateId?: string;
        templateName?: string;
        tags?: string[];
        keyTopics?: string[];
        confidence?: number;
        processingTime?: number;
        audioDuration?: number;
        deviceId?: string;
        deleteAfterDays?: number;
        sourceAudioId?: string;
      };

      // Validate required fields
      if (!title || !summary) {
        return res
          .status(400)
          .json({ error: "title and summary are required" });
      }

      const uploadedById = req.user?.userId;
      if (!uploadedById) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      // Get default deleteAfterDays if not provided
      let finalDeleteAfterDays = deleteAfterDays;
      if (finalDeleteAfterDays === undefined) {
        const userSettings = await prisma.userSettings.findUnique({
          where: { userId: uploadedById },
          select: { defaultDeleteAfterDays: true },
        });
        finalDeleteAfterDays =
          userSettings?.defaultDeleteAfterDays ?? undefined;
      }

      // Resolve deviceId
      let resolvedDeviceId: string | null = null;
      if (deviceId) {
        const deviceById = await prisma.device
          .findUnique({ where: { id: String(deviceId) } })
          .catch(() => null);
        if (deviceById) {
          resolvedDeviceId = deviceById.id;
        } else {
          const deviceByDeviceId = await prisma.device
            .findFirst({ where: { deviceId: String(deviceId) } })
            .catch(() => null);
          resolvedDeviceId = deviceByDeviceId?.id ?? null;
        }
      }

      // Calculate scheduled delete time
      const scheduledDeleteAt = finalDeleteAfterDays
        ? new Date(Date.now() + finalDeleteAfterDays * 24 * 60 * 60 * 1000)
        : null;

      // Encrypt summary and transcript for secure storage
      const { encryptedData: summaryEncrypted, encryptedIV: summaryIv } =
        encrypt(Buffer.from(summary));
      let transcriptEncrypted: Buffer | null = null;
      let transcriptIv: string | null = null;
      if (transcript) {
        const enc = encrypt(Buffer.from(transcript));
        transcriptEncrypted = enc.encryptedData;
        transcriptIv = enc.encryptedIV;
      }

      // Create processing result
      // Normalize Unicode strings to NFC for consistent search
      const normalizedTitle = title.normalize("NFC");
      const normalizedSummary = summary.normalize("NFC");
      const normalizedTranscript = transcript?.normalize("NFC");

      const result = await prisma.processingResult.create({
        data: {
          title: normalizedTitle,
          templateId,
          templateName,
          summaryData: summaryEncrypted,
          summaryIv,
          summaryPreview: normalizedSummary.slice(0, 200),
          summarySize: Buffer.byteLength(normalizedSummary, "utf8"),
          transcriptData: transcriptEncrypted,
          transcriptIv,
          transcriptSize: normalizedTranscript
            ? Buffer.byteLength(normalizedTranscript, "utf8")
            : null,
          confidence,
          processingTime,
          audioDuration,
          status: "completed",
          uploadedById,
          deviceId: resolvedDeviceId,
          sourceAudioId: sourceAudioId || null,
          processedAt: new Date(),
          deleteAfterDays: finalDeleteAfterDays,
          scheduledDeleteAt,
        },
      });

      // Add tags via junction table
      if (tags && Array.isArray(tags) && tags.length > 0) {
        await addTagsToResult(result.id, tags);
      }

      // Audit log
      try {
        await prisma.auditLog.create({
          data: {
            userId: uploadedById,
            action: "files.processing_result_upload",
            resource: "processing_result",
            resourceId: result.id,
            details: {
              title,
              templateId,
              tagsCount: tags?.length || 0,
              deviceId: resolvedDeviceId,
            },
            ipAddress: req.ip || req.socket.remoteAddress || "unknown",
            userAgent: req.headers["user-agent"] || "unknown",
            success: true,
          },
        });
      } catch (logErr) {
        logger.error("Failed to create audit log", logErr);
      }

      // Socket notification
      try {
        const io = getIo();
        io.to(userRoom(uploadedById)).emit("files:processing_result_created", {
          resultId: result.id,
          title,
          templateId,
          timestamp: new Date().toISOString(),
        });
      } catch (emitErr) {
        logger.debug("Socket emit failed", { err: (emitErr as Error).message });
      }

      logger.info("Processing result saved", {
        resultId: result.id,
        title,
        userId: uploadedById,
      });

      return res.status(201).json({
        success: true,
        result: {
          id: result.id,
          title: result.title,
          templateId: result.templateId,
          summaryPreview: result.summaryPreview,
          confidence: result.confidence,
          processingTime: result.processingTime,
          audioDuration: result.audioDuration,
          processedAt: result.processedAt,
          createdAt: result.createdAt,
        },
      });
    } catch (error) {
      logger.error("Error saving processing result:", error);
      return res
        .status(500)
        .json({ error: "Failed to save processing result" });
    }
  }
);

/**
 * @swagger
 * /api/files/results:
 *   get:
 *     summary: List processing results
 *     description: Retrieve a paginated list of AI processing results with optional filters
 *     tags: [Files]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, completed, failed, all]
 *           default: all
 *         description: Filter by processing status (default shows all)
 *       - in: query
 *         name: minConfidence
 *         schema:
 *           type: number
 *           minimum: 0
 *           maximum: 1
 *         description: Minimum ASR confidence (0.0-1.0)
 *       - in: query
 *         name: maxConfidence
 *         schema:
 *           type: number
 *           minimum: 0
 *           maximum: 1
 *         description: Maximum ASR confidence (0.0-1.0)
 *       - in: query
 *         name: tags
 *         schema:
 *           type: string
 *         description: Comma-separated list of tags to filter by
 *       - in: query
 *         name: templateId
 *         schema:
 *           type: string
 *         description: Filter by template ID
 *       - in: query
 *         name: fromDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter results from this date
 *       - in: query
 *         name: toDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter results up to this date
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [date, title, confidence, duration]
 *           default: date
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *     responses:
 *       200:
 *         description: List of processing results
 */
router.get(
  "/results",
  requirePermission(PERMISSIONS.FILES_READ),
  async (req: AuthRequest, res: Response): Promise<any> => {
    try {
      const {
        limit = "50",
        offset = "0",
        status,
        minConfidence,
        maxConfidence,
        tags,
        templateId,
        fromDate,
        toDate,
        sortBy = "date",
        order = "desc",
      } = req.query as {
        limit?: string;
        offset?: string;
        status?: string;
        minConfidence?: string;
        maxConfidence?: string;
        tags?: string;
        templateId?: string;
        fromDate?: string;
        toDate?: string;
        sortBy?: string;
        order?: string;
      };

      const isAdmin = req.user?.roleName === "admin";
      const take = Math.min(parseInt(limit) || 50, 100);
      const skip = parseInt(offset) || 0;

      // Build where clause
      const where: any = {};

      // User isolation (non-admin users only see their own results)
      if (!isAdmin && req.user?.userId) {
        where.uploadedById = req.user.userId;
      }

      // Status filter (if provided and not 'all')
      if (status && status !== "all") {
        where.status = status;
      }

      // Confidence range filter
      const minConf = minConfidence ? parseFloat(minConfidence) : undefined;
      const maxConf = maxConfidence ? parseFloat(maxConfidence) : undefined;
      if (minConf !== undefined || maxConf !== undefined) {
        where.confidence = {};
        if (minConf !== undefined && !isNaN(minConf)) {
          where.confidence.gte = minConf;
        }
        if (maxConf !== undefined && !isNaN(maxConf)) {
          where.confidence.lte = maxConf;
        }
      }

      // Template filter
      if (templateId) {
        where.templateId = templateId;
      }

      // Date range filter
      if (fromDate || toDate) {
        where.processedAt = {};
        if (fromDate) {
          where.processedAt.gte = new Date(fromDate);
        }
        if (toDate) {
          // Add one day to include the entire toDate
          const endDate = new Date(toDate);
          endDate.setDate(endDate.getDate() + 1);
          where.processedAt.lt = endDate;
        }
      }

      // Tags filter (must have all specified tags)
      if (tags) {
        const tagList = tags
          .split(",")
          .map((t) => t.trim().normalize("NFC").toLowerCase())
          .filter(Boolean);
        if (tagList.length > 0) {
          where.tags = {
            some: {
              tag: {
                name: { in: tagList },
              },
            },
          };
        }
      }

      // Build sort order
      let orderBy: any = { processedAt: order === "asc" ? "asc" : "desc" };
      switch (sortBy) {
        case "title":
          orderBy = { title: order === "asc" ? "asc" : "desc" };
          break;
        case "confidence":
          orderBy = { confidence: order === "asc" ? "asc" : "desc" };
          break;
        case "duration":
          orderBy = { audioDuration: order === "asc" ? "asc" : "desc" };
          break;
        case "date":
        default:
          orderBy = { processedAt: order === "asc" ? "asc" : "desc" };
          break;
      }

      const [results, total] = await Promise.all([
        prisma.processingResult.findMany({
          where,
          include: {
            tags: {
              include: { tag: true },
            },
            uploadedBy: {
              select: { id: true, username: true, fullName: true },
            },
          },
          orderBy,
          take,
          skip,
        }),
        prisma.processingResult.count({ where }),
      ]);

      return res.json({
        success: true,
        results: results.map((r) => ({
          id: r.id,
          title: r.title,
          templateId: r.templateId,
          templateName: r.templateName,
          summaryPreview: r.summaryPreview,
          tags: r.tags.map((t) => t.tag.name),
          confidence: r.confidence,
          processingTime: r.processingTime,
          audioDuration: r.audioDuration,
          status: r.status,
          uploadedBy: r.uploadedBy,
          processedAt: r.processedAt,
          createdAt: r.createdAt,
        })),
        pagination: {
          total,
          limit: take,
          offset: skip,
          hasMore: skip + take < total,
        },
      });
    } catch (error) {
      logger.error("Error fetching processing results:", error);
      return res
        .status(500)
        .json({ error: "Failed to fetch processing results" });
    }
  }
);

/**
 * @swagger
 * /api/files/results/{id}:
 *   get:
 *     summary: Get a processing result by ID with decrypted content
 *     tags: [Files]
 *     security:
 *       - bearerAuth: []
 */
router.get(
  "/results/:id",
  requirePermission(PERMISSIONS.FILES_READ),
  async (req: AuthRequest, res: Response): Promise<any> => {
    try {
      const { id } = req.params;
      const isAdmin = req.user?.roleName === "admin";

      const result = await prisma.processingResult.findUnique({
        where: { id },
        include: {
          tags: {
            include: { tag: true },
          },
          uploadedBy: {
            select: { id: true, username: true, fullName: true },
          },
          sourceTextFilePair: {
            include: {
              summaryFile: true,
              realtimeFile: true,
            },
          },
        },
      });

      if (!result) {
        return res.status(404).json({ error: "Processing result not found" });
      }

      // Check access permission
      if (!isAdmin && result.uploadedById !== req.user?.userId) {
        return res
          .status(403)
          .json({ error: "Forbidden: You do not have access to this result" });
      }

      // Decrypt content
      let summaryRaw: string | null = null;
      let summaryObject: Record<string, unknown> | null = null;
      let transcript: string | null = null;

      if (result.summaryData && result.summaryIv) {
        try {
          summaryRaw = decrypt(
            Buffer.from(result.summaryData),
            result.summaryIv
          ).toString("utf8");

          // Try to parse as JSON (new format: full MAIE summary object)
          // If parsing fails, treat it as plain text (legacy data)
          try {
            const parsed = JSON.parse(summaryRaw);
            if (typeof parsed === "object" && parsed !== null) {
              summaryObject = parsed as Record<string, unknown>;
            }
          } catch {
            // Legacy data: plain text summary, wrap in object
            summaryObject = { summary: summaryRaw };
          }
        } catch (decErr) {
          logger.error("Failed to decrypt summary", { id, error: decErr });
        }
      }

      if (result.transcriptData && result.transcriptIv) {
        try {
          transcript = decrypt(
            Buffer.from(result.transcriptData),
            result.transcriptIv
          ).toString("utf8");
        } catch (decErr) {
          logger.error("Failed to decrypt transcript", { id, error: decErr });
        }
      }

      // Decrypt live transcript from linked TextFilePair (if exists)
      let liveTranscript: string | null = null;
      let liveTranscriptPairId: string | null = null;

      if (result.sourceTextFilePair?.realtimeFile) {
        liveTranscriptPairId = result.sourceTextFilePair.id;
        const realtimeFile = result.sourceTextFilePair.realtimeFile;

        // Try androidRealtime first (quick preview), then decrypt encryptedData
        if (
          realtimeFile.androidRealtime &&
          typeof realtimeFile.androidRealtime === "string"
        ) {
          liveTranscript = realtimeFile.androidRealtime;
        } else if (realtimeFile.encryptedData && realtimeFile.encryptedIV) {
          try {
            liveTranscript = decrypt(
              Buffer.from(realtimeFile.encryptedData),
              realtimeFile.encryptedIV
            ).toString("utf8");
          } catch (decErr) {
            logger.error("Failed to decrypt live transcript", {
              id,
              error: decErr,
            });
          }
        }
      }

      // Extract summary text - try various field names used by MAIE templates
      const summaryText = summaryObject
        ? (summaryObject.summary as string) ||
          (summaryObject.content as string) ||
          null
        : null;

      return res.json({
        success: true,
        result: {
          id: result.id,
          title: result.title,
          templateId: result.templateId,
          templateName: result.templateName,
          // Main summary text for backward compatibility
          summary: summaryText,
          // Full structured summary object (includes attendees, action_items, key_topics, decisions, etc.)
          summaryData: summaryObject,
          transcript,
          liveTranscript,
          liveTranscriptPairId,
          sourceAudioId: result.sourceAudioId,
          tags: result.tags.map((t) => t.tag.name),
          confidence: result.confidence,
          processingTime: result.processingTime,
          audioDuration: result.audioDuration,
          status: result.status,
          uploadedBy: result.uploadedBy,
          processedAt: result.processedAt,
          createdAt: result.createdAt,
        },
      });
    } catch (error) {
      logger.error("Error fetching processing result:", error);
      return res
        .status(500)
        .json({ error: "Failed to fetch processing result" });
    }
  }
);

/**
 * @swagger
 * /api/files/results/{id}:
 *   delete:
 *     summary: Delete a processing result
 *     tags: [Files]
 *     security:
 *       - bearerAuth: []
 */
router.delete(
  "/results/:id",
  requirePermission(PERMISSIONS.FILES_DELETE),
  async (req: AuthRequest, res: Response): Promise<any> => {
    try {
      const { id } = req.params;
      const isAdmin = req.user?.roleName === "admin";

      const result = await prisma.processingResult.findUnique({
        where: { id },
      });

      if (!result) {
        return res.status(404).json({ error: "Processing result not found" });
      }

      // Check ownership
      if (!isAdmin && result.uploadedById !== req.user?.userId) {
        return res
          .status(403)
          .json({ error: "Forbidden: You cannot delete this result" });
      }

      // Delete (cascade will handle junction table)
      await prisma.processingResult.delete({ where: { id } });

      // Audit log
      try {
        await prisma.auditLog.create({
          data: {
            userId: req.user?.userId,
            action: "files.processing_result_delete",
            resource: "processing_result",
            resourceId: id,
            details: { title: result.title },
            ipAddress: req.ip || req.socket.remoteAddress || "unknown",
            userAgent: req.headers["user-agent"] || "unknown",
            success: true,
          },
        });
      } catch (logErr) {
        logger.error("Failed to create audit log", logErr);
      }

      return res.json({ success: true, message: "Processing result deleted" });
    } catch (error) {
      logger.error("Error deleting processing result:", error);
      return res
        .status(500)
        .json({ error: "Failed to delete processing result" });
    }
  }
);

/**
 * @swagger
 * /api/files/search:
 *   get:
 *     summary: Search processing results
 *     description: Search processing results by title, tags, template, date range, confidence, and status
 *     tags: [Files]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Search query for title
 *       - in: query
 *         name: tags
 *         schema:
 *           type: string
 *         description: Comma-separated list of tags to filter by
 *       - in: query
 *         name: templateId
 *         schema:
 *           type: string
 *         description: Filter by template ID
 *       - in: query
 *         name: fromDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter results from this date
 *       - in: query
 *         name: toDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter results up to this date
 *       - in: query
 *         name: minConfidence
 *         schema:
 *           type: number
 *           minimum: 0
 *           maximum: 1
 *         description: Minimum ASR confidence (0.0-1.0)
 *       - in: query
 *         name: maxConfidence
 *         schema:
 *           type: number
 *           minimum: 0
 *           maximum: 1
 *         description: Maximum ASR confidence (0.0-1.0)
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, completed, failed, all]
 *           default: completed
 *         description: Filter by processing status (default shows only completed)
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [date, title, confidence, duration]
 *           default: date
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: Search results
 */
router.get(
  "/search",
  requirePermission(PERMISSIONS.FILES_READ),
  async (req: AuthRequest, res: Response): Promise<any> => {
    try {
      const userId = req.user?.userId;
      const isAdmin = req.user?.roleName === "admin";

      const {
        q,
        tags,
        templateId,
        fromDate,
        toDate,
        minConfidence,
        maxConfidence,
        status = "completed",
        sortBy = "date",
        order = "desc",
        limit = "20",
        offset = "0",
      } = req.query as {
        q?: string;
        tags?: string;
        templateId?: string;
        fromDate?: string;
        toDate?: string;
        minConfidence?: string;
        maxConfidence?: string;
        status?: string;
        sortBy?: string;
        order?: string;
        limit?: string;
        offset?: string;
      };

      const take = Math.min(parseInt(limit) || 20, 100);
      const skip = parseInt(offset) || 0;

      // Build where clause
      const where: any = {};

      // Status filter (default to completed, 'all' shows all statuses)
      if (status && status !== "all") {
        where.status = status;
      }

      // Ownership filter (admin sees all)
      if (!isAdmin && userId) {
        where.uploadedById = userId;
      }

      // Text search on title (case-insensitive with SQLite)
      // Normalize to NFC Unicode form for consistent matching
      if (q && q.trim()) {
        where.title = { contains: q.trim().normalize("NFC") };
      }

      // Tag filter (using junction table)
      // Normalize to NFC Unicode form to match stored tags
      if (tags) {
        const tagList = tags
          .split(",")
          .map((t) => t.trim().toLowerCase().normalize("NFC"))
          .filter(Boolean);
        if (tagList.length > 0) {
          where.tags = {
            some: {
              tag: { name: { in: tagList } },
            },
          };
        }
      }

      // Template filter
      if (templateId) {
        where.templateId = templateId;
      }

      // Date range
      if (fromDate || toDate) {
        where.processedAt = {};
        if (fromDate) where.processedAt.gte = new Date(fromDate);
        if (toDate) {
          // Include the entire "toDate" day
          const endDate = new Date(toDate);
          endDate.setHours(23, 59, 59, 999);
          where.processedAt.lte = endDate;
        }
      }

      // Confidence range filter
      if (minConfidence || maxConfidence) {
        where.confidence = {};
        if (minConfidence) {
          const minConf = parseFloat(minConfidence);
          if (!isNaN(minConf) && minConf >= 0 && minConf <= 1) {
            where.confidence.gte = minConf;
          }
        }
        if (maxConfidence) {
          const maxConf = parseFloat(maxConfidence);
          if (!isNaN(maxConf) && maxConf >= 0 && maxConf <= 1) {
            where.confidence.lte = maxConf;
          }
        }
        // Remove empty confidence object if no valid filters
        if (Object.keys(where.confidence).length === 0) {
          delete where.confidence;
        }
      }

      // Build orderBy
      const orderDirection = order === "asc" ? "asc" : "desc";
      let orderBy: any;
      switch (sortBy) {
        case "title":
          orderBy = { title: orderDirection };
          break;
        case "confidence":
          orderBy = { confidence: orderDirection };
          break;
        case "duration":
          orderBy = { audioDuration: orderDirection };
          break;
        case "date":
        default:
          orderBy = { processedAt: orderDirection };
          break;
      }

      const [results, total] = await Promise.all([
        prisma.processingResult.findMany({
          where,
          include: {
            tags: { include: { tag: true } },
            uploadedBy: {
              select: { id: true, username: true, fullName: true },
            },
          },
          orderBy,
          take,
          skip,
        }),
        prisma.processingResult.count({ where }),
      ]);

      return res.json({
        success: true,
        results: results.map((r) => ({
          id: r.id,
          title: r.title,
          templateId: r.templateId,
          templateName: r.templateName,
          summaryPreview: r.summaryPreview,
          tags: r.tags.map((t) => t.tag.name),
          confidence: r.confidence,
          processingTime: r.processingTime,
          audioDuration: r.audioDuration,
          status: r.status,
          uploadedBy: r.uploadedBy,
          processedAt: r.processedAt,
          createdAt: r.createdAt,
        })),
        pagination: {
          total,
          limit: take,
          offset: skip,
          hasMore: skip + results.length < total,
        },
      });
    } catch (error) {
      logger.error("Search failed", { error });
      return res.status(500).json({ error: "Search failed" });
    }
  }
);

/**
 * @swagger
 * /api/files/tags:
 *   get:
 *     summary: Get popular tags for filtering/autocomplete
 *     tags: [Files]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Filter tags by name prefix (for autocomplete)
 *     responses:
 *       200:
 *         description: List of tags with usage counts
 */
router.get(
  "/tags",
  requirePermission(PERMISSIONS.FILES_READ),
  async (req: AuthRequest, res: Response): Promise<any> => {
    try {
      const userId = req.user?.userId;
      const isAdmin = req.user?.roleName === "admin";
      const { limit = "50", q } = req.query as { limit?: string; q?: string };
      const take = Math.min(parseInt(limit) || 50, 100);

      // Build filter for tags
      const tagWhere: any = {};
      if (q && q.trim()) {
        tagWhere.name = { startsWith: q.trim().toLowerCase() };
      }

      // For non-admin, only show tags from results they own
      if (!isAdmin && userId) {
        tagWhere.results = {
          some: {
            processingResult: {
              uploadedById: userId,
            },
          },
        };
      }

      const tags = await prisma.tag.findMany({
        where: tagWhere,
        include: {
          _count: {
            select: { results: true },
          },
        },
        orderBy: {
          results: { _count: "desc" },
        },
        take,
      });

      return res.json({
        success: true,
        tags: tags.map((t) => ({
          name: t.name,
          count: t._count.results,
        })),
      });
    } catch (error) {
      logger.error("Failed to fetch tags", { error });
      return res.status(500).json({ error: "Failed to fetch tags" });
    }
  }
);

export default router;

/**
 * DELETE /api/files/share - Revoke a share (owner only)
 * Body: { fileId: string, sharedWithId: string }
 */
router.delete(
  "/share",
  requirePermission(PERMISSIONS.FILES_WRITE),
  async (req: AuthRequest, res: Response): Promise<any> => {
    try {
      const { fileId, sharedWithId } = req.body as {
        fileId?: string;
        sharedWithId?: string;
      };
      if (!fileId || !sharedWithId)
        return res
          .status(400)
          .json({ error: "fileId and sharedWithId required" });

      // Ensure the requester is the owner (sharedById)
      const existingShares = await prisma.fileShare.findMany({
        where: { fileId, sharedWithId },
      });
      if (!existingShares || existingShares.length === 0)
        return res.status(404).json({ error: "Share not found" });

      // Ensure the requester is the owner for at least one of the shares
      const isOwner = existingShares.some(
        (es) => es.sharedById === req.user?.userId
      );
      if (!req.user?.userId || !isOwner)
        return res.status(403).json({ error: "Forbidden" });

      // Delete the shares
      await prisma.fileShare.deleteMany({ where: { fileId, sharedWithId } });

      // Audit and notify recipient
      try {
        await prisma.auditLog.create({
          data: {
            userId: req.user?.userId || null,
            action: "files.share.revoke",
            resource: "file",
            resourceId: fileId,
            details: { revokedFor: sharedWithId },
            ipAddress: req.ip || req.socket.remoteAddress || "unknown",
            userAgent: req.headers["user-agent"] || "unknown",
          },
        });
      } catch {}

      try {
        const io = getIo();
        const payload = {
          action: "file.revoked",
          fileId,
          revokedById: req.user?.userId || null,
          timestamp: new Date().toISOString(),
        };
        io.to(userRoom(sharedWithId)).emit("files:revoked", payload);
      } catch (emitErr) {
        logger.debug("Socket emit failed for revoke", {
          err: (emitErr as Error).message,
        });
      }

      return res.json({ success: true });
    } catch (error) {
      logger.error("Error revoking share:", error);
      return res.status(500).json({ error: "Failed to revoke share" });
    }
  }
);
