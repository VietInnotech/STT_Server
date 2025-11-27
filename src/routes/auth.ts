import { Router } from "express";
import type { Request, Response } from "express";
import bcrypt from "bcrypt";
import speakeasy from "speakeasy";
import { prisma } from "../lib/prisma";
import { generateToken } from "../utils/jwt";
import { authenticate, type AuthRequest } from "../middleware/auth";
import logger from "../lib/logger";
import { kickUser } from "../lib/socketBus";
import {
  generateTOTPSecret,
  generateQRCode,
  verifyTOTPToken,
  generateBackupCodes,
  encryptTOTPSecret,
  encryptBackupCodes,
  verifyBackupCode,
  isDeviceTrusted,
  addTrustedDevice,
} from "../utils/totp";
import {
  generatePasswordResetToken,
  verifyPasswordResetToken,
  invalidatePasswordResetToken,
} from "../utils/passwordReset";

// Minimum Android app version allowed (semver-like string). Can be set via env var.
const MIN_ANDROID_APP_VERSION = process.env.MIN_ANDROID_APP_VERSION || "";

function versionLessThan(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  const pa = a.split(".").map((s) => parseInt(s, 10) || 0);
  const pb = b.split(".").map((s) => parseInt(s, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na < nb) return true;
    if (na > nb) return false;
  }
  return false;
}

const router = Router();

// Helper to create audit logs safely (non-blocking)
async function safeAudit(data: {
  userId?: string | null;
  action: string;
  resource?: string | null;
  resourceId?: string | null;
  details?: any;
  ip?: string;
  userAgent?: string;
  success?: boolean;
  errorMessage?: string | null;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: data.userId || null,
        action: data.action,
        resource: data.resource || null,
        resourceId: data.resourceId || null,
        details: data.details ? data.details : null,
        ipAddress: data.ip || "unknown",
        userAgent: data.userAgent || "unknown",
        success: data.success ?? false,
        errorMessage: data.errorMessage || null,
      },
    });
  } catch (e) {
    logger.error("Failed to write audit log (safeAudit)", e);
  }
}

// Helper to detect Android clients based on User-Agent or device fingerprint
function isAndroidDevice(
  userAgent?: string | null,
  deviceFingerprint?: string | null
): boolean {
  const ua = (userAgent || "").toLowerCase();
  const fp = (deviceFingerprint || "").toLowerCase();

  // If fingerprint explicitly mentions android, treat as Android
  if (fp.includes("android")) return true;

  // Common Android indicators in User-Agent or native HTTP clients
  if (ua.includes("android")) return true;
  if (
    ua.includes("dalvik") ||
    ua.includes("okhttp") ||
    ua.includes("okhttp3") ||
    ua.includes("okhttp/")
  )
    return true;

  return false;
}

// Helper to build frontend URL intelligently based on request context
function getFrontendBaseUrl(req: Request): string {
  // If FRONTEND_URL is explicitly set in environment, use it
  if (process.env.FRONTEND_URL) {
    return process.env.FRONTEND_URL;
  }

  // Try to infer from request origin (browser sets this)
  const origin = req.get("origin");
  if (origin) {
    return origin;
  }

  // Fallback: build URL from request host with protocol
  const host = req.get("host");
  if (host) {
    const protocol = req.protocol || "http";
    // If connecting to port 3000 (backend), assume frontend is on 5173
    return `${protocol}://${host.replace(":3000", ":5173")}`;
  }

  // Last resort: use localhost
  return "http://localhost:5173";
}

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: User login
 *     description: Authenticate user with username/email and password. Returns JWT token and user data. If 2FA is enabled, returns a flag requiring 2FA verification.
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *                 description: Username or email address
 *                 example: admin
 *               password:
 *                 type: string
 *                 format: password
 *                 description: User password (min 6 characters)
 *                 example: admin123
 *               deviceFingerprint:
 *                 type: string
 *                 description: Optional device fingerprint for session management and 2FA trusted devices
 *                 example: "android-device-abc123"
 *     responses:
 *       200:
 *         description: Login successful or 2FA required
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - type: object
 *                   description: Login successful (no 2FA or trusted device)
 *                   properties:
 *                     user:
 *                       $ref: '#/components/schemas/User'
 *                     token:
 *                       type: string
 *                       description: JWT authentication token
 *                       example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *                 - type: object
 *                   description: 2FA verification required
 *                   properties:
 *                     requires2FA:
 *                       type: boolean
 *                       example: true
 *                     userId:
 *                       type: string
 *                       example: "550e8400-e29b-41d4-a716-446655440000"
 *                     message:
 *                       type: string
 *                       example: "2FA verification required"
 *       400:
 *         description: Missing required fields
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Account is disabled
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
router.post("/login", async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      username,
      password,
      deviceFingerprint: rawFingerprint,
      version,
    } = req.body as {
      username?: string;
      password?: string;
      deviceFingerprint?: string;
      version?: string;
    };

    if (!username || !password) {
      // Audit failed login (missing credentials)
      await safeAudit({
        action: "auth.login",
        resource: "user",
        details: { username: username || null },
        ip: req.ip || req.socket.remoteAddress || "unknown",
        userAgent: req.headers["user-agent"] || "unknown",
        success: false,
        errorMessage: "Missing username or password",
      });

      res.status(400).json({ error: "Username and password are required" });
      return;
    }

    // Find user by username or email
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ username: username }, { email: username }],
      },
      include: {
        role: true,
      },
    });

    if (!user) {
      // Audit failed login (user not found)
      await safeAudit({
        action: "auth.login",
        resource: "user",
        details: { username },
        ip: req.ip || req.socket.remoteAddress || "unknown",
        userAgent: req.headers["user-agent"] || "unknown",
        success: false,
        errorMessage: "User not found",
      });

      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    // Check if user is active
    if (!user.isActive) {
      // Audit failed login (disabled account)
      await safeAudit({
        userId: user.id,
        action: "auth.login",
        resource: "user",
        resourceId: user.id,
        details: { username: user.username },
        ip: req.ip || req.socket.remoteAddress || "unknown",
        userAgent: req.headers["user-agent"] || "unknown",
        success: false,
        errorMessage: "Account disabled",
      });

      res.status(403).json({ error: "Account is disabled" });
      return;
    }

    // Verify password
    if (!user.passwordHash) {
      // Audit failed login (no passwordHash)
      await safeAudit({
        userId: user.id,
        action: "auth.login",
        resource: "user",
        resourceId: user.id,
        details: { username: user.username },
        ip: req.ip || req.socket.remoteAddress || "unknown",
        userAgent: req.headers["user-agent"] || "unknown",
        success: false,
        errorMessage: "No local password configured",
      });

      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      // Audit failed login (invalid password)
      await safeAudit({
        userId: user.id,
        action: "auth.login",
        resource: "user",
        resourceId: user.id,
        details: { username: user.username },
        ip: req.ip || req.socket.remoteAddress || "unknown",
        userAgent: req.headers["user-agent"] || "unknown",
        success: false,
        errorMessage: "Invalid password",
      });

      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    // Check if 2FA is enabled for this user
    if (user.totpEnabled) {
      // Prepare device fingerprint
      let deviceFingerprint = (rawFingerprint || "").trim();
      if (!deviceFingerprint) {
        deviceFingerprint = `${req.headers["user-agent"] || "unknown"}|${
          req.ip || req.socket.remoteAddress || "unknown"
        }`;
      }

      // Check if device is trusted (already verified 2FA)
      const trusted = isDeviceTrusted(deviceFingerprint, user.trustedDevices);

      if (!trusted) {
        // 2FA verification required
        await safeAudit({
          userId: user.id,
          action: "auth.login_2fa_required",
          resource: "user",
          resourceId: user.id,
          details: { username: user.username, deviceFingerprint },
          ip: req.ip || req.socket.remoteAddress || "unknown",
          userAgent: req.headers["user-agent"] || "unknown",
          success: true,
        });

        res.status(200).json({
          requires2FA: true,
          userId: user.id,
          message: "2FA verification required",
        });
        return;
      }
    }

    // Generate JWT token
    const token = generateToken({
      userId: user.id,
      username: user.username,
      email: user.email,
      roleId: user.roleId,
      roleName: user.role.name,
    });

    // Prepare device fingerprint (enforce single account per device)
    let deviceFingerprint = (rawFingerprint || "").trim();
    if (!deviceFingerprint) {
      // Fallback (less stable): combine UA + IP
      deviceFingerprint = `${req.headers["user-agent"] || "unknown"}|${
        req.ip || req.socket.remoteAddress || "unknown"
      }`;
    }

    // If this appears to be an Android client, require a valid `version` value
    // and (optionally) enforce a minimum configured version.
    try {
      const uaHeader = req.headers["user-agent"] as string | undefined;
      const loginIsAndroid = isAndroidDevice(uaHeader, deviceFingerprint);

      if (loginIsAndroid) {
        const ver = (version || "").toString().trim();
        const versionRegex = /^\d+(?:\.\d+)*$/;

        // Require version to be present and well-formed
        if (!ver || !versionRegex.test(ver)) {
          await safeAudit({
            userId: user.id,
            action: "auth.login_failed_invalid_version",
            resource: "user",
            resourceId: user.id,
            details: { providedVersion: version || null },
            ip: req.ip || req.socket.remoteAddress || "unknown",
            userAgent: uaHeader || "unknown",
            success: false,
            errorMessage: "Missing or invalid client version",
          });
          logger.warn("Blocked Android login with missing/invalid version", {
            userId: user.id,
            providedVersion: version || null,
          });
          res.status(400).json({ error: "Invalid or missing app version" });
          return;
        }

        // Enforce minimum version if configured
        if (
          MIN_ANDROID_APP_VERSION &&
          versionLessThan(ver, MIN_ANDROID_APP_VERSION)
        ) {
          await safeAudit({
            userId: user.id,
            action: "auth.login_failed_min_version",
            resource: "user",
            resourceId: user.id,
            details: {
              clientVersion: ver,
              minRequired: MIN_ANDROID_APP_VERSION,
            },
            ip: req.ip || req.socket.remoteAddress || "unknown",
            userAgent: uaHeader || "unknown",
            success: false,
            errorMessage: "Client app version too old",
          });
          res.status(426).json({
            error: "App version too old",
            minRequired: MIN_ANDROID_APP_VERSION,
          });
          return;
        }
      }
    } catch (err) {
      logger.warn("Failed to validate client version", { err });
    }

    // Enforce single session per device: remove existing sessions with same fingerprint regardless of user, notify kicked clients
    try {
      if (deviceFingerprint) {
        const existingDeviceSessions = await prisma.session.findMany({
          where: { deviceFingerprint },
        });
        if (existingDeviceSessions.length > 0) {
          const affectedUserIds = Array.from(
            new Set(existingDeviceSessions.map((s) => s.userId).filter(Boolean))
          );
          // Kick affected users (may include the same user if re-login on same device)
          for (const uid of affectedUserIds) {
            try {
              kickUser(
                uid,
                "Thiết bị này vừa được đăng nhập bởi tài khoản khác"
              );
            } catch (e) {
              logger.warn("Failed to kick user on device takeover", {
                userId: uid,
                e,
              });
            }
          }
          await prisma.session.deleteMany({ where: { deviceFingerprint } });
        }
      }
    } catch (err) {
      logger.warn("Failed to cleanup sessions for device fingerprint", { err });
    }

    // Enforce single session per account: normally remove existing sessions for this user
    // BUT: if this login originates from an Android client, do NOT invalidate other sessions.
    try {
      const uaHeader = req.headers["user-agent"] as string | undefined;
      const loginIsAndroid = isAndroidDevice(uaHeader, deviceFingerprint);

      if (loginIsAndroid) {
        // Keep existing sessions intact for Android logins (do not logout other devices)
        logger.info(
          "Android login detected - preserving existing sessions for user",
          { userId: user.id }
        );
        await safeAudit({
          userId: user.id,
          action: "auth.login_skip_session_invalidation",
          resource: "user",
          resourceId: user.id,
          details: { reason: "android_login" },
          ip: req.ip || req.socket.remoteAddress || "unknown",
          userAgent: uaHeader || "unknown",
          success: true,
        });
      } else {
        // Delete all existing sessions for this user
        await prisma.session.deleteMany({ where: { userId: user.id } });
        // Notify any connected sockets for this user to logout
        kickUser(user.id, "Đã được đăng nhập từ một thiết bị khác");
      }
    } catch (err) {
      logger.warn("Failed to cleanup previous sessions for user", {
        userId: user.id,
        err,
      });
    }

    // Create new session record with token
    try {
      // Default: 7 days expiry to match JWT if not configured
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await prisma.session.create({
        data: {
          userId: user.id,
          token,
          ipAddress: req.ip || req.socket.remoteAddress || "unknown",
          userAgent: req.headers["user-agent"] || "unknown",
          deviceFingerprint,
          expiresAt,
        },
      });
    } catch (err) {
      logger.warn("Failed to persist session", { userId: user.id, err });
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "auth.login",
        resource: "user",
        resourceId: user.id,
        details: { username: user.username, clientVersion: version || null },
        ipAddress: req.ip || req.socket.remoteAddress || "unknown",
        userAgent: req.headers["user-agent"] || "unknown",
      },
    });

    logger.info("User logged in", {
      userId: user.id,
      clientVersion: version || null,
      deviceFingerprint,
    });

    // Return user data and token
    // If this looks like an Android login, try to create or update a Device row so it appears in Devices list.
    try {
      const providedDeviceId =
        (req.body as any)?.deviceId || rawFingerprint || null;
      const uaHeader = req.headers["user-agent"] as string | undefined;
      const loginIsAndroid = isAndroidDevice(uaHeader, deviceFingerprint);
      if (loginIsAndroid && providedDeviceId) {
        const deviceIdentifier = String(providedDeviceId).trim();
        if (deviceIdentifier.length > 0) {
          // Try to find existing device by deviceId
          let d = await prisma.device
            .findFirst({ where: { deviceId: deviceIdentifier } })
            .catch(() => null);
          if (!d) {
            // Create a new device record
            await prisma.device.create({
              data: {
                deviceId: deviceIdentifier,
                deviceName: req.headers["user-agent"]
                  ? `Android ${String(req.headers["user-agent"]).slice(0, 60)}`
                  : `Android device ${req.ip}`,
                ipAddress: req.ip || req.socket?.remoteAddress || "unknown",
                isOnline: true,
                lastSeen: new Date(),
              },
            });
          } else {
            // Update last seen / online status
            await prisma.device.update({
              where: { id: d.id },
              data: {
                ipAddress: req.ip || req.socket?.remoteAddress || "unknown",
                isOnline: true,
                lastSeen: new Date(),
              },
            });
          }
        }
      }
    } catch (err) {
      logger.warn("Failed to upsert device on login", { err, userId: user.id });
    }

    res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        role: user.role.name,
        roleId: user.roleId,
        permissions: user.role.permissions as string[],
      },
      token,
    });
  } catch (error) {
    logger.error("Login error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Logout current session
 *     description: Logout the current user by invalidating the current session token
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logout successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Logged out successfully
 *       401:
 *         description: Unauthorized - invalid or missing token
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
  "/logout",
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      // Remove current session token if provided
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith("Bearer ")
        ? authHeader.substring(7)
        : null;
      if (token) {
        try {
          await prisma.session.deleteMany({ where: { token } });
        } catch (err) {
          logger.warn("Failed to delete session on logout", { err });
        }
      }

      // Create audit log
      await prisma.auditLog.create({
        data: {
          userId: req.user.userId,
          action: "auth.logout",
          resource: "user",
          resourceId: req.user.userId,
          details: { username: req.user.username },
          ipAddress: req.ip || req.socket.remoteAddress || "unknown",
          userAgent: req.headers["user-agent"] || "unknown",
        },
      });

      res.json({ message: "Logged out successfully" });
    } catch (error) {
      logger.error("Logout error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Get current user profile
 *     description: Retrieve authenticated user's profile information
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       401:
 *         description: Unauthorized - invalid or missing token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: User not found
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
  "/me",
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      // Fetch fresh user data from database
      const user = await prisma.user.findUnique({
        where: { id: req.user.userId },
        include: {
          role: true,
        },
      });

      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      res.json({
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        role: user.role.name,
        roleId: user.roleId,
        permissions: user.role.permissions as string[],
        isActive: user.isActive,
        lastLogin: user.lastLogin,
        createdAt: user.createdAt,
      });
    } catch (error) {
      logger.error("Get user error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

/**
 * @swagger
 * /api/auth/change-password:
 *   post:
 *     summary: Change user password
 *     description: Update the password for the authenticated user
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentPassword
 *               - newPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *                 format: password
 *                 description: Current password for verification
 *                 example: oldpass123
 *               newPassword:
 *                 type: string
 *                 format: password
 *                 description: New password (min 6 characters)
 *                 example: newpass456
 *     responses:
 *       200:
 *         description: Password changed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Password changed successfully
 *       400:
 *         description: Missing required fields or password too short
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized or incorrect current password
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
  "/change-password",
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        res
          .status(400)
          .json({ error: "Current password and new password are required" });
        return;
      }

      if (newPassword.length < 6) {
        res
          .status(400)
          .json({ error: "New password must be at least 6 characters" });
        return;
      }

      // Get user with password
      const user = await prisma.user.findUnique({
        where: { id: req.user.userId },
      });

      if (!user || !user.passwordHash) {
        res.status(401).json({ error: "Invalid credentials" });
        return;
      }

      // Verify current password
      const isPasswordValid = await bcrypt.compare(
        currentPassword,
        user.passwordHash
      );
      if (!isPasswordValid) {
        res.status(401).json({ error: "Current password is incorrect" });
        return;
      }

      // Hash new password
      const newPasswordHash = await bcrypt.hash(newPassword, 10);

      // Update password
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: newPasswordHash },
      });

      // Create audit log
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: "auth.password_change",
          resource: "user",
          resourceId: user.id,
          details: { username: user.username },
          ipAddress: req.ip || req.socket.remoteAddress || "unknown",
          userAgent: req.headers["user-agent"] || "unknown",
        },
      });

      res.json({ message: "Password changed successfully" });
    } catch (error) {
      logger.error("Change password error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

/**
 * @swagger
 * /api/auth/logout-all:
 *   post:
 *     summary: Logout from all sessions
 *     description: Invalidate all active sessions for the authenticated user and kick from all connected devices
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logged out from all sessions successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Logged out from all sessions successfully
 *       401:
 *         description: Unauthorized - invalid or missing token
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
  "/logout-all",
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      // Delete all sessions for the user
      await prisma.session.deleteMany({
        where: { userId: req.user.userId },
      });

      // Kick the user from all Socket.IO rooms
      kickUser(req.user.userId, "Bạn đã đăng xuất khỏi tất cả các phiên");

      // Create audit log
      await prisma.auditLog.create({
        data: {
          userId: req.user.userId,
          action: "auth.logout_all",
          resource: "user",
          resourceId: req.user.userId,
          details: { username: req.user.username },
          ipAddress: req.ip || req.socket.remoteAddress || "unknown",
          userAgent: req.headers["user-agent"] || "unknown",
        },
      });

      res.json({ message: "Logged out from all sessions successfully" });
    } catch (error) {
      logger.error("Logout all sessions error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// ============================================
// TWO-FACTOR AUTHENTICATION (2FA) ROUTES
// ============================================

/**
 * @swagger
 * /api/auth/2fa/setup:
 *   post:
 *     summary: Initiate 2FA setup
 *     description: Generate TOTP secret and QR code for two-factor authentication setup. User must scan QR code with authenticator app and verify before 2FA is enabled.
 *     tags: [Two-Factor Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 2FA setup initiated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 secret:
 *                   type: string
 *                   description: Base32-encoded TOTP secret (for manual entry)
 *                   example: JBSWY3DPEHPK3PXP
 *                 qrCode:
 *                   type: string
 *                   description: Base64-encoded QR code image (data URL)
 *                   example: data:image/png;base64,iVBORw0KGgoAAAANS...
 *                 message:
 *                   type: string
 *                   example: Scan the QR code with your authenticator app and verify to complete setup
 *       401:
 *         description: Unauthorized - invalid or missing token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: User not found
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
  "/2fa/setup",
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const user = await prisma.user.findUnique({
        where: { id: req.user.userId },
      });

      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      // Generate new TOTP secret
      const secret = generateTOTPSecret();
      const qrCode = await generateQRCode(secret, user.email || user.username);

      // Return secret and QR code (don't save yet until user verifies)
      res.json({
        secret: secret.base32,
        qrCode,
        message:
          "Scan the QR code with your authenticator app and verify to complete setup",
      });
    } catch (error) {
      logger.error("2FA setup error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

/**
 * @swagger
 * /api/auth/2fa/verify-setup:
 *   post:
 *     summary: Complete 2FA setup
 *     description: Verify TOTP token from authenticator app and enable two-factor authentication. Returns backup codes that should be saved securely.
 *     tags: [Two-Factor Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - secret
 *             properties:
 *               token:
 *                 type: string
 *                 description: 6-digit TOTP code from authenticator app
 *                 example: "123456"
 *                 pattern: '^\d{6}$'
 *               secret:
 *                 type: string
 *                 description: Base32-encoded secret from setup step
 *                 example: JBSWY3DPEHPK3PXP
 *     responses:
 *       200:
 *         description: 2FA enabled successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: 2FA enabled successfully
 *                 backupCodes:
 *                   type: array
 *                   description: One-time backup codes for account recovery (10 codes)
 *                   items:
 *                     type: string
 *                   example: ["12345678", "23456789", "34567890"]
 *       400:
 *         description: Missing required fields
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Invalid verification code or unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: User not found
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
  "/2fa/verify-setup",
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const { token, secret } = req.body as { token?: string; secret?: string };

      if (!token || !secret) {
        res.status(400).json({ error: "Token and secret are required" });
        return;
      }

      const user = await prisma.user.findUnique({
        where: { id: req.user.userId },
      });

      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      // Verify the token with the provided secret
      const isValid = speakeasy.totp.verify({
        secret: secret,
        encoding: "base32",
        token: token,
        window: 2,
      });

      if (!isValid) {
        await safeAudit({
          userId: user.id,
          action: "auth.2fa_setup_failed",
          resource: "user",
          resourceId: user.id,
          details: { username: user.username },
          ip: req.ip || req.socket.remoteAddress || "unknown",
          userAgent: req.headers["user-agent"] || "unknown",
          success: false,
          errorMessage: "Invalid verification code",
        });

        res.status(401).json({ error: "Invalid verification code" });
        return;
      }

      // Generate backup codes
      const backupCodes = generateBackupCodes();

      // Encrypt and save the secret and backup codes
      const encryptedSecret = encryptTOTPSecret(secret);
      const encryptedBackupCodes = encryptBackupCodes(backupCodes);

      await prisma.user.update({
        where: { id: user.id },
        data: {
          totpEnabled: true,
          totpSecret: encryptedSecret,
          backupCodes: encryptedBackupCodes,
          trustedDevices: [], // Reset trusted devices when enabling 2FA
        },
      });

      await safeAudit({
        userId: user.id,
        action: "auth.2fa_enabled",
        resource: "user",
        resourceId: user.id,
        details: { username: user.username },
        ip: req.ip || req.socket.remoteAddress || "unknown",
        userAgent: req.headers["user-agent"] || "unknown",
        success: true,
      });

      res.json({
        message: "2FA enabled successfully",
        backupCodes,
      });
    } catch (error) {
      logger.error("2FA verify setup error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

/**
 * @swagger
 * /api/auth/2fa/verify:
 *   post:
 *     summary: Verify 2FA during login
 *     description: Complete login by verifying 2FA token (TOTP code or backup code). Returns JWT token and user data upon successful verification. Device will be added to trusted devices list.
 *     tags: [Two-Factor Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - token
 *             properties:
 *               userId:
 *                 type: string
 *                 description: User ID from login response
 *                 example: "550e8400-e29b-41d4-a716-446655440000"
 *               token:
 *                 type: string
 *                 description: 6-digit TOTP code from authenticator app or 8-digit backup code
 *                 example: "123456"
 *               deviceFingerprint:
 *                 type: string
 *                 description: Optional device fingerprint to mark device as trusted
 *                 example: "android-device-abc123"
 *     responses:
 *       200:
 *         description: 2FA verification successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *                 token:
 *                   type: string
 *                   description: JWT authentication token
 *                   example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *       400:
 *         description: Missing required fields
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Invalid verification code or unauthorized
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
  "/2fa/verify",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        userId,
        token,
        deviceFingerprint: rawFingerprint,
        version: clientVersion,
      } = req.body as {
        userId?: string;
        token?: string;
        deviceFingerprint?: string;
        version?: string;
      };

      if (!userId || !token) {
        res.status(400).json({ error: "User ID and token are required" });
        return;
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { role: true },
      });

      if (!user || !user.totpEnabled || !user.totpSecret) {
        res.status(401).json({ error: "Invalid request" });
        return;
      }

      // Try verifying with TOTP token first
      let isValid = verifyTOTPToken(token, user.totpSecret);
      let usedBackupCode = false;

      // If TOTP fails, try backup codes
      if (!isValid && user.backupCodes) {
        const backupResult = verifyBackupCode(token, user.backupCodes);
        if (backupResult.success) {
          isValid = true;
          usedBackupCode = true;

          // Update remaining backup codes
          const encryptedRemainingCodes = encryptBackupCodes(
            backupResult.remainingCodes
          );
          await prisma.user.update({
            where: { id: user.id },
            data: { backupCodes: encryptedRemainingCodes },
          });
        }
      }

      if (!isValid) {
        await safeAudit({
          userId: user.id,
          action: "auth.2fa_failed",
          resource: "user",
          resourceId: user.id,
          details: { username: user.username },
          ip: req.ip || req.socket.remoteAddress || "unknown",
          userAgent: req.headers["user-agent"] || "unknown",
          success: false,
          errorMessage: "Invalid 2FA token",
        });

        res.status(401).json({ error: "Invalid verification code" });
        return;
      }

      // 2FA verified! Generate JWT token
      const jwtToken = generateToken({
        userId: user.id,
        username: user.username,
        email: user.email,
        roleId: user.roleId,
        roleName: user.role.name,
      });

      // Prepare device fingerprint
      let deviceFingerprint = (rawFingerprint || "").trim();
      if (!deviceFingerprint) {
        deviceFingerprint = `${req.headers["user-agent"] || "unknown"}|${
          req.ip || req.socket.remoteAddress || "unknown"
        }`;
      }

      // If this appears to be an Android client, require a valid `version` value
      // and (optionally) enforce a minimum configured version on 2FA verify.
      try {
        const uaHeader = req.headers["user-agent"] as string | undefined;
        const loginIsAndroid = isAndroidDevice(uaHeader, deviceFingerprint);

        if (loginIsAndroid) {
          const ver = (clientVersion || "").toString().trim();
          const versionRegex = /^\d+(?:\.\d+)*$/;

          if (!ver || !versionRegex.test(ver)) {
            await safeAudit({
              userId: user.id,
              action: "auth.2fa_failed_invalid_version",
              resource: "user",
              resourceId: user.id,
              details: { providedVersion: clientVersion || null },
              ip: req.ip || req.socket.remoteAddress || "unknown",
              userAgent: uaHeader || "unknown",
              success: false,
              errorMessage: "Missing or invalid client version",
            });
            logger.warn(
              "Blocked Android 2FA verify with missing/invalid version",
              { userId: user.id, providedVersion: clientVersion || null }
            );
            res.status(400).json({ error: "Invalid or missing app version" });
            return;
          }

          if (
            MIN_ANDROID_APP_VERSION &&
            versionLessThan(ver, MIN_ANDROID_APP_VERSION)
          ) {
            await safeAudit({
              userId: user.id,
              action: "auth.2fa_failed_min_version",
              resource: "user",
              resourceId: user.id,
              details: {
                clientVersion: ver,
                minRequired: MIN_ANDROID_APP_VERSION,
              },
              ip: req.ip || req.socket.remoteAddress || "unknown",
              userAgent: uaHeader || "unknown",
              success: false,
              errorMessage: "Client app version too old",
            });
            res.status(426).json({
              error: "App version too old",
              minRequired: MIN_ANDROID_APP_VERSION,
            });
            return;
          }
        }
      } catch (err) {
        logger.warn("Failed to validate client version", { err });
      }

      // Add device to trusted devices
      const updatedTrustedDevices = addTrustedDevice(
        deviceFingerprint,
        user.trustedDevices
      );
      await prisma.user.update({
        where: { id: user.id },
        data: { trustedDevices: updatedTrustedDevices },
      });

      // Enforce single session per device
      try {
        if (deviceFingerprint) {
          const existingDeviceSessions = await prisma.session.findMany({
            where: { deviceFingerprint },
          });
          if (existingDeviceSessions.length > 0) {
            const affectedUserIds = Array.from(
              new Set(
                existingDeviceSessions.map((s) => s.userId).filter(Boolean)
              )
            );
            for (const uid of affectedUserIds) {
              try {
                kickUser(
                  uid,
                  "Thiết bị này vừa được đăng nhập bởi tài khoản khác"
                );
              } catch (e) {
                logger.warn("Failed to kick user on device takeover", {
                  userId: uid,
                  e,
                });
              }
            }
            await prisma.session.deleteMany({ where: { deviceFingerprint } });
          }
        }
      } catch (err) {
        logger.warn("Failed to cleanup sessions for device fingerprint", {
          err,
        });
      }

      // Enforce single session per account
      try {
        const uaHeader = req.headers["user-agent"] as string | undefined;
        const loginIsAndroid = isAndroidDevice(uaHeader, deviceFingerprint);

        if (loginIsAndroid) {
          logger.info(
            "Android login detected during 2FA - preserving existing sessions for user",
            { userId: user.id }
          );
          await safeAudit({
            userId: user.id,
            action: "auth.2fa_login_skip_session_invalidation",
            resource: "user",
            resourceId: user.id,
            details: { reason: "android_login" },
            ip: req.ip || req.socket.remoteAddress || "unknown",
            userAgent: uaHeader || "unknown",
            success: true,
          });
        } else {
          await prisma.session.deleteMany({ where: { userId: user.id } });
          kickUser(user.id, "Đã được đăng nhập từ một thiết bị khác");
        }
      } catch (err) {
        logger.warn("Failed to cleanup previous sessions for user", {
          userId: user.id,
          err,
        });
      }

      // Create new session
      try {
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await prisma.session.create({
          data: {
            userId: user.id,
            token: jwtToken,
            ipAddress: req.ip || req.socket.remoteAddress || "unknown",
            userAgent: req.headers["user-agent"] || "unknown",
            deviceFingerprint,
            expiresAt,
          },
        });
      } catch (err) {
        logger.warn("Failed to persist session", { userId: user.id, err });
      }

      // Update last login
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLogin: new Date() },
      });

      await safeAudit({
        userId: user.id,
        action: usedBackupCode
          ? "auth.2fa_backup_code_used"
          : "auth.2fa_verified",
        resource: "user",
        resourceId: user.id,
        details: {
          username: user.username,
          deviceFingerprint,
          clientVersion: clientVersion || null,
        },
        ip: req.ip || req.socket.remoteAddress || "unknown",
        userAgent: req.headers["user-agent"] || "unknown",
        success: true,
      });

      logger.info("2FA verified and user logged in", {
        userId: user.id,
        clientVersion: clientVersion || null,
        deviceFingerprint,
      });

      res.json({
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          fullName: user.fullName,
          role: user.role.name,
          roleId: user.roleId,
          permissions: user.role.permissions as string[],
        },
        token: jwtToken,
      });

      // Try to create/update device record for Android clients (device identifier may be provided)
      try {
        const providedDeviceId =
          (req.body as any)?.deviceId || rawFingerprint || null;
        const uaHeader = req.headers["user-agent"] as string | undefined;
        const loginIsAndroid = isAndroidDevice(uaHeader, deviceFingerprint);
        if (loginIsAndroid && providedDeviceId) {
          const deviceIdentifier = String(providedDeviceId).trim();
          if (deviceIdentifier.length > 0) {
            let d = await prisma.device
              .findFirst({ where: { deviceId: deviceIdentifier } })
              .catch(() => null);
            if (!d) {
              await prisma.device.create({
                data: {
                  deviceId: deviceIdentifier,
                  deviceName: req.headers["user-agent"]
                    ? `Android ${String(req.headers["user-agent"]).slice(
                        0,
                        60
                      )}`
                    : `Android device ${req.ip}`,
                  ipAddress: req.ip || req.socket?.remoteAddress || "unknown",
                  isOnline: true,
                  lastSeen: new Date(),
                },
              });
            } else {
              await prisma.device.update({
                where: { id: d.id },
                data: {
                  ipAddress: req.ip || req.socket?.remoteAddress || "unknown",
                  isOnline: true,
                  lastSeen: new Date(),
                },
              });
            }
          }
        }
      } catch (err) {
        logger.warn("Failed to upsert device on 2FA verify", {
          err,
          userId: user.id,
        });
      }
    } catch (error) {
      logger.error("2FA verify error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

/**
 * @swagger
 * /api/auth/2fa/disable:
 *   post:
 *     summary: Disable 2FA
 *     description: Disable two-factor authentication for the authenticated user. Requires password confirmation for security.
 *     tags: [Two-Factor Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - password
 *             properties:
 *               password:
 *                 type: string
 *                 format: password
 *                 description: User password for confirmation
 *                 example: admin123
 *     responses:
 *       200:
 *         description: 2FA disabled successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: 2FA disabled successfully
 *       400:
 *         description: Password confirmation required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized or incorrect password
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
  "/2fa/disable",
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const { password } = req.body as { password?: string };

      if (!password) {
        res.status(400).json({ error: "Password confirmation required" });
        return;
      }

      const user = await prisma.user.findUnique({
        where: { id: req.user.userId },
      });

      if (!user || !user.passwordHash) {
        res.status(401).json({ error: "Invalid credentials" });
        return;
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
      if (!isPasswordValid) {
        res.status(401).json({ error: "Incorrect password" });
        return;
      }

      // Disable 2FA
      await prisma.user.update({
        where: { id: user.id },
        data: {
          totpEnabled: false,
          totpSecret: null,
          backupCodes: null,
          trustedDevices: undefined,
        },
      });

      await safeAudit({
        userId: user.id,
        action: "auth.2fa_disabled",
        resource: "user",
        resourceId: user.id,
        details: { username: user.username },
        ip: req.ip || req.socket.remoteAddress || "unknown",
        userAgent: req.headers["user-agent"] || "unknown",
        success: true,
      });

      res.json({ message: "2FA disabled successfully" });
    } catch (error) {
      logger.error("2FA disable error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

/**
 * @swagger
 * /api/auth/2fa/regenerate-backup-codes:
 *   post:
 *     summary: Regenerate backup codes
 *     description: Generate new backup codes for 2FA recovery. Old backup codes will be invalidated. Requires password confirmation.
 *     tags: [Two-Factor Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - password
 *             properties:
 *               password:
 *                 type: string
 *                 format: password
 *                 description: User password for confirmation
 *                 example: admin123
 *     responses:
 *       200:
 *         description: Backup codes regenerated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Backup codes regenerated successfully
 *                 backupCodes:
 *                   type: array
 *                   description: New one-time backup codes (10 codes)
 *                   items:
 *                     type: string
 *                   example: ["12345678", "23456789", "34567890"]
 *       400:
 *         description: Password confirmation required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized, incorrect password, or 2FA not enabled
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
  "/2fa/regenerate-backup-codes",
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const { password } = req.body as { password?: string };

      if (!password) {
        res.status(400).json({ error: "Password confirmation required" });
        return;
      }

      const user = await prisma.user.findUnique({
        where: { id: req.user.userId },
      });

      if (!user || !user.passwordHash || !user.totpEnabled) {
        res.status(401).json({ error: "Invalid request" });
        return;
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
      if (!isPasswordValid) {
        res.status(401).json({ error: "Incorrect password" });
        return;
      }

      // Generate new backup codes
      const backupCodes = generateBackupCodes();
      const encryptedBackupCodes = encryptBackupCodes(backupCodes);

      await prisma.user.update({
        where: { id: user.id },
        data: { backupCodes: encryptedBackupCodes },
      });

      await safeAudit({
        userId: user.id,
        action: "auth.2fa_backup_codes_regenerated",
        resource: "user",
        resourceId: user.id,
        details: { username: user.username },
        ip: req.ip || req.socket.remoteAddress || "unknown",
        userAgent: req.headers["user-agent"] || "unknown",
        success: true,
      });

      res.json({
        message: "Backup codes regenerated successfully",
        backupCodes,
      });
    } catch (error) {
      logger.error("2FA regenerate backup codes error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

/**
 * @swagger
 * /api/auth/2fa/status:
 *   get:
 *     summary: Get 2FA status
 *     description: Check if two-factor authentication is enabled for the authenticated user
 *     tags: [Two-Factor Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 2FA status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totpEnabled:
 *                   type: boolean
 *                   description: Whether 2FA is enabled
 *                   example: true
 *                 hasBackupCodes:
 *                   type: boolean
 *                   description: Whether backup codes are configured
 *                   example: true
 *       401:
 *         description: Unauthorized - invalid or missing token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: User not found
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
  "/2fa/status",
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const user = await prisma.user.findUnique({
        where: { id: req.user.userId },
      });

      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      res.json({
        totpEnabled: user.totpEnabled || false,
        hasBackupCodes: !!user.backupCodes,
      });
    } catch (error) {
      logger.error("2FA status error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// ============================================
// PASSWORD RESET ROUTES
// ============================================

/**
 * @swagger
 * /api/auth/forgot-password:
 *   post:
 *     summary: Request password reset
 *     description: Request a password reset. On local systems (no email configured), returns the reset token directly. On production systems with email, sends an email.
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Email address associated with the account
 *                 example: user@example.com
 *     responses:
 *       200:
 *         description: Password reset initiated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 resetToken:
 *                   type: string
 *                   description: Only returned on local systems without email
 *                 resetUrl:
 *                   type: string
 *                   description: Only returned on local systems without email
 *       400:
 *         description: Email is required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: No active account found with this email
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
  "/forgot-password",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { email } = req.body;

      if (!email) {
        res.status(400).json({ error: "Email is required" });
        return;
      }

      // Find user
      const user = await prisma.user.findUnique({ where: { email } });

      if (!user || !user.isActive) {
        // For local systems, we can be explicit about the error
        res
          .status(404)
          .json({ error: "No active account found with this email" });
        return;
      }

      const token = await generatePasswordResetToken(user.id);
      const baseUrl = getFrontendBaseUrl(req);
      const resetUrl = `${baseUrl}/reset-password?token=${token}`;

      await safeAudit({
        userId: user.id,
        action: "auth.password_reset_requested",
        resource: "user",
        resourceId: user.id,
        details: { email },
        ip: req.ip || req.socket.remoteAddress || "unknown",
        userAgent: req.headers["user-agent"] || "unknown",
        success: true,
      });

      logger.info("Password reset token generated", { userId: user.id, email });

      // For local systems without email, return the token directly
      res.json({
        message:
          "Password reset token generated. Use the token or URL to reset your password.",
        resetToken: token,
        resetUrl: resetUrl,
        expiresIn: "30 minutes",
      });
    } catch (error) {
      logger.error("Forgot password error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

/**
 * @swagger
 * /api/auth/reset-password:
 *   post:
 *     summary: Reset password with token
 *     description: Reset user password using a valid reset token. All existing sessions will be invalidated.
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - newPassword
 *             properties:
 *               token:
 *                 type: string
 *                 description: Password reset token from email
 *                 example: abc123...
 *               newPassword:
 *                 type: string
 *                 format: password
 *                 description: New password (min 6 characters)
 *                 example: newSecurePassword123
 *     responses:
 *       200:
 *         description: Password reset successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Password reset successfully. Please log in with your new password.
 *       400:
 *         description: Invalid or expired token, or invalid password
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
  "/reset-password",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { token, newPassword } = req.body;

      if (!token || !newPassword) {
        res.status(400).json({ error: "Token and new password are required" });
        return;
      }

      // Verify token
      const userId = await verifyPasswordResetToken(token);
      if (!userId) {
        res.status(400).json({ error: "Invalid or expired reset token" });
        return;
      }

      // Get user for password validation context
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        res.status(400).json({ error: "Invalid reset token" });
        return;
      }

      // Validate password length
      if (newPassword.length < 6) {
        res
          .status(400)
          .json({ error: "Password must be at least 6 characters" });
        return;
      }

      // Hash new password
      const passwordHash = await bcrypt.hash(newPassword, 10);

      // Update password and invalidate all sessions
      await prisma.$transaction([
        prisma.user.update({
          where: { id: userId },
          data: { passwordHash },
        }),
        prisma.session.deleteMany({
          where: { userId },
        }),
      ]);

      // Invalidate the reset token
      await invalidatePasswordResetToken(token);

      // Kick user from all connected sockets
      kickUser(userId, "Password reset - please log in again");

      await safeAudit({
        userId,
        action: "auth.password_reset_completed",
        resource: "user",
        resourceId: userId,
        details: { username: user.username },
        ip: req.ip || req.socket.remoteAddress || "unknown",
        userAgent: req.headers["user-agent"] || "unknown",
        success: true,
      });

      logger.info("Password reset completed", {
        userId,
        username: user.username,
      });

      res.json({
        message:
          "Password reset successfully. Please log in with your new password.",
      });
    } catch (error) {
      logger.error("Reset password error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

/**
 * @swagger
 * /api/auth/verify-reset-token:
 *   get:
 *     summary: Verify reset token validity
 *     description: Check if a password reset token is valid (for frontend UX)
 *     tags: [Authentication]
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: Password reset token to verify
 *     responses:
 *       200:
 *         description: Token validity status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 valid:
 *                   type: boolean
 *                   example: true
 *       400:
 *         description: Token is required
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 valid:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: Token is required
 *       500:
 *         description: Internal server error
 */
router.get(
  "/verify-reset-token",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const token = req.query.token as string;

      if (!token) {
        res.status(400).json({ valid: false, error: "Token is required" });
        return;
      }

      const userId = await verifyPasswordResetToken(token);
      res.json({ valid: !!userId });
    } catch (error) {
      logger.error("Verify reset token error:", error);
      res.status(500).json({ valid: false, error: "Internal server error" });
    }
  }
);

/**
 * @swagger
 * /api/auth/admin/generate-reset-token:
 *   post:
 *     summary: Admin generate password reset token
 *     description: Admin-only endpoint to generate a password reset token for any user. Useful for local systems without email.
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userId:
 *                 type: string
 *                 description: User ID to generate reset token for
 *               username:
 *                 type: string
 *                 description: Username to generate reset token for (alternative to userId)
 *     responses:
 *       200:
 *         description: Reset token generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 resetToken:
 *                   type: string
 *                 resetUrl:
 *                   type: string
 *                 expiresIn:
 *                   type: string
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     username:
 *                       type: string
 *                     email:
 *                       type: string
 *       400:
 *         description: userId or username is required
 *       403:
 *         description: Forbidden - requires admin role
 *       404:
 *         description: User not found
 *       500:
 *         description: Internal server error
 */
router.post(
  "/admin/generate-reset-token",
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      // Check if user is admin
      if (req.user?.roleName !== "admin") {
        res.status(403).json({
          error: "Only admins can generate reset tokens for other users",
        });
        return;
      }

      const { userId, username } = req.body;

      if (!userId && !username) {
        res.status(400).json({ error: "userId or username is required" });
        return;
      }

      // Find user
      const user = await prisma.user.findFirst({
        where: userId ? { id: userId } : { username },
        select: { id: true, username: true, email: true, isActive: true },
      });

      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      if (!user.isActive) {
        res
          .status(400)
          .json({ error: "Cannot generate reset token for inactive user" });
        return;
      }

      const token = await generatePasswordResetToken(user.id);
      const baseUrl = getFrontendBaseUrl(req);
      const resetUrl = `${baseUrl}/reset-password?token=${token}`;

      await safeAudit({
        userId: req.user.userId,
        action: "auth.admin_generated_reset_token",
        resource: "user",
        resourceId: user.id,
        details: {
          targetUser: user.username,
          generatedBy: req.user.username,
        },
        ip: req.ip || req.socket.remoteAddress || "unknown",
        userAgent: req.headers["user-agent"] || "unknown",
        success: true,
      });

      logger.info("Admin generated password reset token", {
        adminId: req.user.userId,
        targetUserId: user.id,
        targetUsername: user.username,
      });

      res.json({
        message: "Password reset token generated successfully",
        resetToken: token,
        resetUrl: resetUrl,
        expiresIn: "30 minutes",
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
        },
      });
    } catch (error) {
      logger.error("Admin generate reset token error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

export default router;
