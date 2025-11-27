import { Router } from "express";
import type { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import {
  authenticate,
  requireRole,
  requirePermission,
  type AuthRequest,
} from "../middleware/auth";
import { PERMISSIONS } from "../types/permissions";
import logger from "../lib/logger";

const router = Router();

// All routes require authentication
router.use(authenticate);

// Default system settings
const DEFAULT_SETTINGS = {
  // File Management
  autoDeleteDays: 30,
  maxFileSize: 50, // MB
  allowedAudioFormats: ["wav", "mp3", "flac", "ogg"],
  allowedTextFormats: ["txt", "log", "json", "csv"],

  // Audio Processing
  defaultSampleRate: 44100,
  defaultBitrate: 128,
  defaultChannels: 2,
  audioQuality: "high",

  // Security
  sessionTimeout: 7, // days
  passwordMinLength: 6,
  requireStrongPassword: false,
  enableTwoFactor: false,

  // UI Preferences
  theme: "light",
  language: "en",
  dateFormat: "YYYY-MM-DD",
  timeFormat: "24h",
  itemsPerPage: 50,

  // Notifications
  enableEmailNotifications: false,
  enablePushNotifications: false,
  notifyOnUpload: true,
  notifyOnDeviceChange: true,

  // System-wide settings (admin only)
  enableUserRegistration: false,
  requireEmailVerification: false,
  maintenanceMode: false,
  enableAuditLog: true,
};

/**
 * @swagger
 * /api/settings:
 *   get:
 *     summary: Get user settings
 *     description: Retrieve current user's settings merged with system defaults
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Settings retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 settings:
 *                   type: object
 *                   additionalProperties: true
 *                   example:
 *                     theme: "dark"
 *                     language: "en"
 *                     notifications: true
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
router.get("/", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    // Fetch user-specific settings
    const userSettings = await prisma.systemConfig.findMany({
      where: {
        key: {
          startsWith: `user:${req.user.userId}:`,
        },
      },
    });

    // Fetch system-wide settings
    const systemSettings = await prisma.systemConfig.findMany({
      where: {
        key: {
          startsWith: "system:",
        },
      },
    });

    // Build settings object: defaults -> system -> user (override precedence)
    const settings: Record<string, any> = { ...DEFAULT_SETTINGS };

    // Apply system settings
    systemSettings.forEach((setting) => {
      const key = setting.key.replace("system:", "");
      try {
        settings[key] = JSON.parse(setting.value);
      } catch {
        settings[key] = setting.value;
      }
    });

    // Apply user settings (highest priority)
    userSettings.forEach((setting) => {
      const key = setting.key.replace(`user:${req.user!.userId}:`, "");
      try {
        settings[key] = JSON.parse(setting.value);
      } catch {
        settings[key] = setting.value;
      }
    });

    res.json({ settings });
  } catch (error) {
    logger.error("Error fetching settings:", error);
    res.status(500).json({ error: "Failed to fetch settings" });
  }
});

/**
 * PUT /api/settings - Update current user's settings
 */
router.put("/", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const updates = req.body;

    if (!updates || typeof updates !== "object") {
      res.status(400).json({ error: "Invalid settings data" });
      return;
    }

    // Filter out system-only settings for non-admins
    const isAdmin = req.user.roleName === "admin";
    const systemOnlyKeys = [
      "enableUserRegistration",
      "requireEmailVerification",
      "maintenanceMode",
      "enableAuditLog",
      "logRetentionDays",
      "passwordMinLength",
      "requireStrongPassword",
    ];

    // Update user settings
    const updatePromises: Promise<any>[] = [];

    for (const [key, value] of Object.entries(updates)) {
      // Skip system-only settings for non-admins
      if (!isAdmin && systemOnlyKeys.includes(key)) {
        continue;
      }

      const settingKey = `user:${req.user.userId}:${key}`;
      const settingValue =
        typeof value === "object" ? JSON.stringify(value) : String(value);

      updatePromises.push(
        prisma.systemConfig.upsert({
          where: { key: settingKey },
          update: {
            value: settingValue,
            updatedById: req.user.userId,
          },
          create: {
            key: settingKey,
            value: settingValue,
            description: `User setting: ${key}`,
            updatedById: req.user.userId,
          },
        })
      );
    }

    await Promise.all(updatePromises);

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user.userId,
        action: "settings.update",
        resource: "settings",
        details: { updatedKeys: Object.keys(updates) },
        ipAddress: req.ip || req.socket.remoteAddress || "unknown",
        userAgent: req.headers["user-agent"] || "unknown",
      },
    });

    res.json({ success: true, message: "Settings updated successfully" });
  } catch (error) {
    logger.error("Error updating settings:", error);
    res.status(500).json({ error: "Failed to update settings" });
  }
});

/**
 * GET /api/settings/system - Get system-wide settings (requires settings.write permission)
 */
router.get(
  "/system",
  requirePermission(PERMISSIONS.SETTINGS_WRITE),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const systemSettings = await prisma.systemConfig.findMany({
        where: {
          key: {
            startsWith: "system:",
          },
        },
      });

      const settings: Record<string, any> = { ...DEFAULT_SETTINGS };

      systemSettings.forEach((setting) => {
        const key = setting.key.replace("system:", "");
        try {
          settings[key] = JSON.parse(setting.value);
        } catch {
          settings[key] = setting.value;
        }
      });

      res.json({ settings });
    } catch (error) {
      logger.error("Error fetching system settings:", error);
      res.status(500).json({ error: "Failed to fetch system settings" });
    }
  }
);

/**
 * PUT /api/settings/system - Update system-wide settings (requires settings.write permission)
 */
router.put(
  "/system",
  requirePermission(PERMISSIONS.SETTINGS_WRITE),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const updates = req.body;

      if (!updates || typeof updates !== "object") {
        res.status(400).json({ error: "Invalid settings data" });
        return;
      }

      // Update system settings
      const updatePromises: Promise<any>[] = [];

      for (const [key, value] of Object.entries(updates)) {
        const settingKey = `system:${key}`;
        const settingValue =
          typeof value === "object" ? JSON.stringify(value) : String(value);

        updatePromises.push(
          prisma.systemConfig.upsert({
            where: { key: settingKey },
            update: {
              value: settingValue,
              updatedById: req.user!.userId,
            },
            create: {
              key: settingKey,
              value: settingValue,
              description: `System setting: ${key}`,
              updatedById: req.user!.userId,
            },
          })
        );
      }

      await Promise.all(updatePromises);

      // Create audit log
      await prisma.auditLog.create({
        data: {
          userId: req.user!.userId,
          action: "settings.system_update",
          resource: "settings",
          details: {
            updatedKeys: Object.keys(updates),
            updatedBy: req.user!.username,
          },
          ipAddress: req.ip || req.socket.remoteAddress || "unknown",
          userAgent: req.headers["user-agent"] || "unknown",
        },
      });

      res.json({
        success: true,
        message: "System settings updated successfully",
      });
    } catch (error) {
      logger.error("Error updating system settings:", error);
      res.status(500).json({ error: "Failed to update system settings" });
    }
  }
);

/**
 * DELETE /api/settings/:key - Reset a specific setting to default (removes user override)
 */
router.delete(
  "/:key",
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const { key } = req.params;
      const settingKey = `user:${req.user.userId}:${key}`;

      await prisma.systemConfig.deleteMany({
        where: { key: settingKey },
      });

      res.json({ success: true, message: "Setting reset to default" });
    } catch (error) {
      logger.error("Error resetting setting:", error);
      res.status(500).json({ error: "Failed to reset setting" });
    }
  }
);

/**
 * @swagger
 * /api/settings/preferences:
 *   get:
 *     summary: Get user preferences
 *     description: Retrieve current user's file and upload preferences
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User preferences retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 defaultDeleteAfterDays:
 *                   type: integer
 *                   nullable: true
 *                   description: Default auto-delete period in days (null = never delete)
 *                   example: 30
 */
router.get(
  "/preferences",
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      // Find or create user settings
      let userSettings = await prisma.userSettings.findUnique({
        where: { userId: req.user.userId },
      });

      // If no settings exist, create default ones
      if (!userSettings) {
        userSettings = await prisma.userSettings.create({
          data: {
            userId: req.user.userId,
          },
        });
      }

      res.json({
        defaultDeleteAfterDays: userSettings.defaultDeleteAfterDays,
        theme: userSettings.theme,
        language: userSettings.language,
        timezone: userSettings.timezone,
      });
    } catch (error) {
      logger.error("Error fetching user preferences:", error);
      res.status(500).json({ error: "Failed to fetch user preferences" });
    }
  }
);

/**
 * @swagger
 * /api/settings/preferences:
 *   put:
 *     summary: Update user preferences
 *     description: Update current user's file and upload preferences
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               defaultDeleteAfterDays:
 *                 type: integer
 *                 nullable: true
 *                 description: Default auto-delete period in days (null = never delete, min 1, max 365)
 *                 example: 30
 *     responses:
 *       200:
 *         description: Preferences updated successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 */
router.put(
  "/preferences",
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const { defaultDeleteAfterDays } = req.body as {
        defaultDeleteAfterDays?: number | null;
      };

      // Validate input
      if (
        defaultDeleteAfterDays !== null &&
        defaultDeleteAfterDays !== undefined
      ) {
        if (
          typeof defaultDeleteAfterDays !== "number" ||
          defaultDeleteAfterDays < 1 ||
          defaultDeleteAfterDays > 365
        ) {
          res.status(400).json({
            error: "defaultDeleteAfterDays must be between 1 and 365, or null",
          });
          return;
        }
      }

      // Update or create user settings
      await prisma.userSettings.upsert({
        where: { userId: req.user.userId },
        update: {
          defaultDeleteAfterDays:
            defaultDeleteAfterDays === null
              ? null
              : Number(defaultDeleteAfterDays),
        },
        create: {
          userId: req.user.userId,
          defaultDeleteAfterDays:
            defaultDeleteAfterDays === null
              ? null
              : Number(defaultDeleteAfterDays),
        },
      });

      // Create audit log
      await prisma.auditLog.create({
        data: {
          userId: req.user.userId,
          action: "settings.preferences_update",
          resource: "user_settings",
          resourceId: req.user.userId,
          details: { defaultDeleteAfterDays },
          ipAddress: req.ip || req.socket.remoteAddress || "unknown",
          userAgent: req.headers["user-agent"] || "unknown",
        },
      });

      res.json({
        success: true,
        message: "Preferences updated successfully",
        defaultDeleteAfterDays: defaultDeleteAfterDays,
      });
    } catch (error) {
      logger.error("Error updating user preferences:", error);
      res.status(500).json({ error: "Failed to update user preferences" });
    }
  }
);

export default router;
