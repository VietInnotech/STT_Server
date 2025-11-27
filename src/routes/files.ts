import { Router, type Request, type Response } from "express";
import { uploadLimiter } from "../middleware/rateLimiter";
import path from "path";
import multer from "multer";
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

const router = Router();

// Require auth for all file routes
router.use(authenticate);

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
 *     description: Upload an audio file with optional device association and auto-deletion schedule. File content is encrypted before storage.
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
 *                 description: Audio file to upload (max 50MB)
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
  "/audio",
  uploadLimiter,
  upload.single("file"),
  requirePermission(PERMISSIONS.FILES_WRITE),
  async (req: AuthRequest, res: Response): Promise<any> => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const { deviceId, deleteAfterDays } = req.body as {
        deviceId?: string;
        deleteAfterDays?: number;
      };
      const uploadedById = req.user?.userId; // Get from authenticated user

      if (!uploadedById) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      // Get user's default deleteAfterDays if not explicitly provided
      let finalDeleteAfterDays = deleteAfterDays;
      if (finalDeleteAfterDays === undefined) {
        const userSettings = await prisma.userSettings.findUnique({
          where: { userId: uploadedById },
          select: { defaultDeleteAfterDays: true },
        });
        // If the user has a personal default, use it (can be null meaning 'never').
        // If the user has not set a value (undefined) or the value is null, fall back to the system-wide setting.
        if (
          userSettings &&
          userSettings.defaultDeleteAfterDays !== undefined &&
          userSettings.defaultDeleteAfterDays !== null
        ) {
          finalDeleteAfterDays = userSettings.defaultDeleteAfterDays;
        } else {
          // Try to read system-wide setting 'system:autoDeleteDays' from systemConfig
          const systemSetting = await prisma.systemConfig
            .findUnique({ where: { key: "system:autoDeleteDays" } })
            .catch(() => null);
          if (systemSetting) {
            try {
              const parsed = JSON.parse(systemSetting.value);
              finalDeleteAfterDays =
                typeof parsed === "number" ? parsed : Number(parsed);
            } catch {
              // not JSON, try raw conversion
              const raw = systemSetting.value;
              const n = Number(raw);
              finalDeleteAfterDays = Number.isNaN(n) ? undefined : n;
            }
          } else {
            finalDeleteAfterDays = undefined;
          }
        }
      }

      // Resolve deviceId: frontend may send either the internal Device.id (UUID) or the Android deviceId string
      let resolvedDeviceId: string | null = null;
      if (deviceId) {
        // First try to find by primary UUID
        const deviceById = await prisma.device
          .findUnique({ where: { id: String(deviceId) } })
          .catch(() => null);
        if (deviceById) {
          resolvedDeviceId = deviceById.id;
        } else {
          // Try lookup by deviceId field (android device identifier)
          const deviceByDeviceId = await prisma.device
            .findFirst({ where: { deviceId: String(deviceId) } })
            .catch(() => null);
          if (deviceByDeviceId) resolvedDeviceId = deviceByDeviceId.id;
          else resolvedDeviceId = null; // unknown device - we'll store null to avoid FK violation
        }
      }

      // Verify uploadedById exists in users table; if not, set to null to avoid FK violation
      const uploaderExists = await prisma.user
        .findUnique({ where: { id: uploadedById } })
        .catch(() => null);
      const resolvedUploadedById = uploaderExists ? uploadedById : null;

      // Validate file MIME type and extension for audio
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
      const mime = req.file.mimetype || "";
      const ext = path.extname(req.file.originalname || "").toLowerCase();

      if (
        !allowedAudioMimes.includes(mime) &&
        !allowedAudioExts.includes(ext)
      ) {
        return res.status(400).json({
          error:
            "Invalid audio file type. Allowed: wav, mp3, ogg, webm, m4a, aac, flac",
        });
      }

      // Encrypt file content
      const { encryptedData, encryptedIV } = encrypt(req.file.buffer);

      // Save to database (use resolved IDs to avoid FK violations)
      let audioFile;
      try {
        audioFile = await prisma.audioFile.create({
          data: {
            filename: req.file.originalname,
            originalName: req.file.originalname,
            fileSize: req.file.size,
            encryptedData,
            encryptedIV,
            mimeType: req.file.mimetype || "audio/wav",
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
          },
        });
      } catch (err: any) {
        // Catch FK errors and return a clear message instead of raw Prisma error
        if (err?.code === "P2003") {
          logger.error("Foreign key constraint when creating audio file", {
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

      // Create audit log for upload
      try {
        await prisma.auditLog.create({
          data: {
            userId: resolvedUploadedById,
            action: "files.upload",
            resource: "audio",
            resourceId: audioFile.id,
            details: {
              filename: audioFile.filename,
              fileSize: audioFile.fileSize,
              mimeType: audioFile.mimeType,
              deviceId: resolvedDeviceId,
            },
            ipAddress: req.ip || req.socket.remoteAddress || "unknown",
            userAgent: req.headers["user-agent"] || "unknown",
            success: true,
          },
        });
      } catch (logErr) {
        logger.error("Failed to create audit log for audio upload", logErr);
      }

      return res.status(201).json({
        success: true,
        file: {
          id: audioFile.id,
          filename: audioFile.filename,
          fileSize: audioFile.fileSize,
          mimeType: audioFile.mimeType,
          uploadedAt: audioFile.uploadedAt,
        },
      });
    } catch (error) {
      logger.error("Error uploading audio file:", error);
      return res.status(500).json({ error: "Failed to upload audio file" });
    }
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
      } // Get user's default deleteAfterDays if not explicitly provided
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
        // Prisma client may need to be regenerated after schema changes; cast to any here to avoid type errors
        textFile = await prisma.textFile.create({
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore - dynamic fields for new schema fields
          data: {
            filename: req.file.originalname,
            originalName: req.file.originalname,
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
 * Decrypts and returns file
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

      // Decrypt file content
      const decryptedData = decrypt(
        Buffer.from(audioFile.encryptedData),
        audioFile.encryptedIV
      );

      // Set headers
      res.setHeader("Content-Type", audioFile.mimeType);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${audioFile.filename}"`
      );
      res.setHeader("Content-Length", decryptedData.length);

      return res.send(decryptedData);
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
 */
router.delete(
  "/audio/:id",
  requirePermission(PERMISSIONS.FILES_DELETE),
  async (req: AuthRequest, res: Response): Promise<any> => {
    try {
      const { id } = req.params;
      const isAdmin = req.user?.roleName === "admin";

      if (!isAdmin) {
        // Ensure file belongs to the user
        const file = await prisma.audioFile.findUnique({ where: { id } });
        if (!file)
          return res.status(404).json({ error: "Audio file not found" });
        if (file.uploadedById !== req.user?.userId) {
          return res
            .status(403)
            .json({ error: "Forbidden: You cannot delete this file" });
        }
      }

      await prisma.audioFile.delete({ where: { id } });

      return res.json({ success: true, message: "Audio file deleted" });
    } catch (error) {
      logger.error("Error deleting audio file:", error);
      return res.status(500).json({ error: "Failed to delete audio file" });
    }
  }
);

/**
 * DELETE /api/files/text/:id - Delete text file
 */
router.delete(
  "/text/:id",
  requirePermission(PERMISSIONS.FILES_DELETE),
  async (req: AuthRequest, res: Response): Promise<any> => {
    try {
      const { id } = req.params;
      const isAdmin = req.user?.roleName === "admin";

      if (!isAdmin) {
        const file = await prisma.textFile.findUnique({ where: { id } });
        if (!file)
          return res.status(404).json({ error: "Text file not found" });
        if (file.uploadedById !== req.user?.userId) {
          return res
            .status(403)
            .json({ error: "Forbidden: You cannot delete this file" });
        }
      }

      await prisma.textFile.delete({ where: { id } });

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
 *     description: Android endpoint to upload both summary and realtime text content in a single JSON request. Creates two TextFile records and links them with TextFilePair.
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
 *               - summary
 *               - realtime
 *               - deviceId
 *             properties:
 *               summary:
 *                 type: string
 *                 description: Summary text content
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

      // Validate required fields
      if (!summary || !realtime) {
        return res
          .status(400)
          .json({ error: "Both summary and realtime content are required" });
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

      // Verify uploader exists
      const uploaderExists = await prisma.user
        .findUnique({ where: { id: uploadedById } })
        .catch(() => null);
      const resolvedUploadedById = uploaderExists ? uploadedById : null;

      // Calculate scheduled delete time if deleteAfterDays is set
      const scheduledDeleteAt = finalDeleteAfterDays
        ? new Date(Date.now() + finalDeleteAfterDays * 24 * 60 * 60 * 1000)
        : null;

      // Create both files and pair in transaction
      const result = await prisma.$transaction(async (tx) => {
        // Encrypt both contents
        const { encryptedData: summaryEncrypted, encryptedIV: summaryIV } =
          encrypt(Buffer.from(summary));
        const { encryptedData: realtimeEncrypted, encryptedIV: realtimeIV } =
          encrypt(Buffer.from(realtime));

        // Create summary file
        const summaryFile = await tx.textFile.create({
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

        // Create pair
        const pair = await tx.textFilePair.create({
          data: {
            name: pairName,
            summaryFileId: summaryFile.id,
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
              summaryFileId: result.summaryFile.id,
              realtimeFileId: result.realtimeFile.id,
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
        io.to(req.user?.userId || "").emit("files:text_pair_created", {
          pairId: result.pair.id,
          pairName,
          summaryFileId: result.summaryFile.id,
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
          summaryFileId: result.summaryFile.id,
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
          summaryTextFile = await tx.textFile.create({
            data: {
              filename: `summary_${Date.now()}.txt`,
              originalName: summaryFile.originalname,
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
          realtimeTextFile = await tx.textFile.create({
            data: {
              filename: `realtime_${Date.now()}.txt`,
              originalName: realtimeFile.originalname,
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
              summaryFileName: summaryFile?.originalname,
              realtimeFileName: realtimeFile?.originalname,
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
          summaryFile: {
            id: pair.summaryFile.id,
            filename: pair.summaryFile.filename,
            originalName: pair.summaryFile.originalName,
            fileSize: pair.summaryFile.fileSize,
            origin: pair.summaryFile.origin,
            uploadedAt: pair.summaryFile.uploadedAt,
          },
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
