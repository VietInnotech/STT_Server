# User & Role Management Improvement Plan

**Document Version:** 1.0  
**Created:** November 26, 2025  
**Status:** Proposed  
**Project:** UNV AI Report Server V2

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Gap Analysis Summary](#2-gap-analysis-summary)
3. [Implementation Phases](#3-implementation-phases)
4. [Phase 1: Permission-Based Authorization](#4-phase-1-permission-based-authorization)
5. [Phase 2: Admin Protection & Role Management](#5-phase-2-admin-protection--role-management)
6. [Phase 3: Self-Service Password Reset](#6-phase-3-self-service-password-reset)
7. [Database Migrations](#7-database-migrations)
8. [Testing Strategy](#8-testing-strategy)
9. [Risk Assessment](#9-risk-assessment)
10. [Timeline & Effort Estimates](#10-timeline--effort-estimates)

---

## 1. Executive Summary

This document outlines a phased approach to address the identified gaps in the user/role management system. The improvements are prioritized by security impact and implementation complexity.

### Priority Matrix

| Priority  | Improvement                    | Security Impact | Effort |
| --------- | ------------------------------ | --------------- | ------ |
| 🔴 High   | Permission-based authorization | Critical        | Medium |
| 🔴 High   | Admin self-protection          | Critical        | Low    |
| 🟡 Medium | Role CRUD endpoints            | High            | Medium |
| 🟡 Medium | Password reset flow            | High            | Medium |

---

## 2. Gap Analysis Summary

### Current State

| Feature                | Status | Issue                                       |
| ---------------------- | ------ | ------------------------------------------- |
| Role Definition        | ✅     | 3 seeded roles with permissions array       |
| Permission Enforcement | ❌     | `permissions` JSON never checked at runtime |
| Role Management        | ❌     | No CRUD endpoints for roles                 |
| Admin Protection       | ⚠️     | Frontend-only check, backend vulnerable     |
| Password Reset         | ❌     | No self-service flow                        |

---

## 3. Implementation Phases

```
Phase 1 ─────────────────────────────────────────────────
│ Permission-based Authorization Middleware            │
│ • requirePermission() middleware                     │
│ • Migrate routes to use permission checks            │
│ Duration: 2-3 days                                   │
└─────────────────────────────────────────────────────┘
          │
          ▼
Phase 2 ─────────────────────────────────────────────────
│ Admin Protection & Role CRUD                         │
│ • Backend admin protection                           │
│ • Role management endpoints                          │
│ • Frontend role management UI                        │
│ Duration: 3-4 days                                   │
└─────────────────────────────────────────────────────┘
          │
          ▼
Phase 3 ─────────────────────────────────────────────────
│ Self-Service Password Reset                          │
│ • PasswordResetToken model                           │
│ • Email integration                                  │
│ • Reset flow endpoints                               │
│ Duration: 3-4 days                                   │
└─────────────────────────────────────────────────────┘
```

---

## 4. Phase 1: Permission-Based Authorization

### 4.1 Objective

Enable fine-grained access control using the existing `permissions` array in the `Role` model.

### 4.2 Permission Taxonomy

```typescript
// src/types/permissions.ts

export const PERMISSIONS = {
  // User Management
  USERS_READ: "users.read",
  USERS_WRITE: "users.write",
  USERS_DELETE: "users.delete",

  // Device Management
  DEVICES_READ: "devices.read",
  DEVICES_WRITE: "devices.write",
  DEVICES_DELETE: "devices.delete",

  // File Management
  FILES_READ: "files.read",
  FILES_WRITE: "files.write",
  FILES_DELETE: "files.delete",

  // Logs & Audit
  LOGS_READ: "logs.read",

  // System Settings
  SETTINGS_READ: "settings.read",
  SETTINGS_WRITE: "settings.write",

  // Role Management (new)
  ROLES_READ: "roles.read",
  ROLES_WRITE: "roles.write",
  ROLES_DELETE: "roles.delete",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
```

### 4.3 Permission Middleware Implementation

**Best Practice Reference:** [Permit.io RBAC Guide](https://www.permit.io/blog/implement-rbac-authorization-in-express)

```typescript
// src/middleware/auth.ts - Addition

/**
 * Middleware to check if user has specific permission(s)
 * Supports both single permission and permission arrays (OR logic)
 */
export function requirePermission(...requiredPermissions: string[]) {
  return async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    try {
      // Fetch user's role with permissions
      const role = await prisma.role.findUnique({
        where: { id: req.user.roleId },
        select: { permissions: true },
      });

      if (!role) {
        res.status(403).json({ error: "Role not found" });
        return;
      }

      const userPermissions = role.permissions as string[];

      // Check if user has at least one of the required permissions
      const hasPermission = requiredPermissions.some((perm) =>
        userPermissions.includes(perm)
      );

      if (!hasPermission) {
        logger.warn("Permission denied", {
          userId: req.user.userId,
          required: requiredPermissions,
          actual: userPermissions,
        });
        res.status(403).json({
          error: "Forbidden: Insufficient permissions",
          required: requiredPermissions,
        });
        return;
      }

      next();
    } catch (error) {
      logger.error("Permission check failed", error);
      res.status(500).json({ error: "Authorization check failed" });
    }
  };
}

/**
 * Middleware to require ALL specified permissions (AND logic)
 */
export function requireAllPermissions(...requiredPermissions: string[]) {
  return async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    try {
      const role = await prisma.role.findUnique({
        where: { id: req.user.roleId },
        select: { permissions: true },
      });

      if (!role) {
        res.status(403).json({ error: "Role not found" });
        return;
      }

      const userPermissions = role.permissions as string[];

      // Check if user has ALL required permissions
      const hasAllPermissions = requiredPermissions.every((perm) =>
        userPermissions.includes(perm)
      );

      if (!hasAllPermissions) {
        res.status(403).json({
          error: "Forbidden: Missing required permissions",
          required: requiredPermissions,
        });
        return;
      }

      next();
    } catch (error) {
      logger.error("Permission check failed", error);
      res.status(500).json({ error: "Authorization check failed" });
    }
  };
}
```

### 4.4 Route Migration Example

```typescript
// src/routes/users.ts - Before
router.get('/', requireRole('admin'), async (req, res) => { ... })

// src/routes/users.ts - After
router.get('/', requirePermission(PERMISSIONS.USERS_READ), async (req, res) => { ... })
router.post('/', requirePermission(PERMISSIONS.USERS_WRITE), async (req, res) => { ... })
router.delete('/:id', requirePermission(PERMISSIONS.USERS_DELETE), async (req, res) => { ... })
```

### 4.5 Decision: Keep or Remove `requireRole`?

**Recommendation:** Keep `requireRole` as a convenience wrapper but implement it using permissions:

```typescript
// Keep for backward compatibility and simple cases
export function requireRole(...allowedRoles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    if (!allowedRoles.includes(req.user.roleName)) {
      res.status(403).json({ error: "Forbidden: Insufficient permissions" });
      return;
    }

    next();
  };
}
```

---

## 5. Phase 2: Admin Protection & Role Management

### 5.1 Admin Self-Protection (Backend)

Add validation to prevent disabling the last admin or self-deletion:

```typescript
// src/routes/users.ts - Update PUT handler

// Inside PUT /api/users/:id handler, add:
if (isActive === false) {
  // Check if this is an admin user
  const targetUser = await prisma.user.findUnique({
    where: { id },
    include: { role: true },
  });

  if (targetUser?.role.name === "admin") {
    // Count remaining active admins
    const activeAdminCount = await prisma.user.count({
      where: {
        isActive: true,
        role: { name: "admin" },
        id: { not: id }, // Exclude the user being disabled
      },
    });

    if (activeAdminCount === 0) {
      res.status(400).json({
        error: "Cannot disable the last active admin account",
      });
      return;
    }
  }
}
```

### 5.2 Role CRUD Endpoints

```typescript
// src/routes/roles.ts - New file

import { Router } from "express";
import type { Response } from "express";
import { prisma } from "../lib/prisma";
import {
  authenticate,
  requirePermission,
  type AuthRequest,
} from "../middleware/auth";
import { PERMISSIONS } from "../types/permissions";
import logger from "../lib/logger";

const router = Router();

router.use(authenticate);

/**
 * GET /api/roles - List all roles
 */
router.get(
  "/",
  requirePermission(PERMISSIONS.ROLES_READ),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const roles = await prisma.role.findMany({
        include: {
          _count: { select: { users: true } },
        },
        orderBy: { name: "asc" },
      });

      res.json({
        roles: roles.map((role) => ({
          id: role.id,
          name: role.name,
          description: role.description,
          permissions: role.permissions,
          userCount: role._count.users,
          createdAt: role.createdAt,
          updatedAt: role.updatedAt,
        })),
      });
    } catch (error) {
      logger.error("Error fetching roles:", error);
      res.status(500).json({ error: "Failed to fetch roles" });
    }
  }
);

/**
 * POST /api/roles - Create new role
 */
router.post(
  "/",
  requirePermission(PERMISSIONS.ROLES_WRITE),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { name, description, permissions } = req.body;

      if (!name || !Array.isArray(permissions)) {
        res
          .status(400)
          .json({ error: "Name and permissions array are required" });
        return;
      }

      // Validate role name format (lowercase, alphanumeric, underscore)
      if (!/^[a-z][a-z0-9_]*$/.test(name)) {
        res
          .status(400)
          .json({
            error: "Role name must be lowercase alphanumeric with underscores",
          });
        return;
      }

      // Check for duplicate
      const existing = await prisma.role.findUnique({ where: { name } });
      if (existing) {
        res.status(400).json({ error: "Role name already exists" });
        return;
      }

      const role = await prisma.role.create({
        data: {
          name,
          description: description || null,
          permissions,
        },
      });

      // Audit log
      await prisma.auditLog.create({
        data: {
          userId: req.user!.userId,
          action: "role.create",
          resource: "role",
          resourceId: role.id,
          details: { name, permissions, createdBy: req.user!.username },
          ipAddress: req.ip || "unknown",
          userAgent: req.headers["user-agent"] || "unknown",
        },
      });

      res.status(201).json(role);
    } catch (error) {
      logger.error("Error creating role:", error);
      res.status(500).json({ error: "Failed to create role" });
    }
  }
);

/**
 * PUT /api/roles/:id - Update role
 */
router.put(
  "/:id",
  requirePermission(PERMISSIONS.ROLES_WRITE),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { description, permissions } = req.body;

      const role = await prisma.role.findUnique({ where: { id } });
      if (!role) {
        res.status(404).json({ error: "Role not found" });
        return;
      }

      // Prevent modifying built-in admin role permissions
      if (role.name === "admin" && permissions) {
        res.status(400).json({ error: "Cannot modify admin role permissions" });
        return;
      }

      const updated = await prisma.role.update({
        where: { id },
        data: {
          description: description !== undefined ? description : undefined,
          permissions: permissions !== undefined ? permissions : undefined,
        },
      });

      // Audit log
      await prisma.auditLog.create({
        data: {
          userId: req.user!.userId,
          action: "role.update",
          resource: "role",
          resourceId: id,
          details: {
            name: role.name,
            changes: Object.keys(req.body),
            updatedBy: req.user!.username,
          },
          ipAddress: req.ip || "unknown",
          userAgent: req.headers["user-agent"] || "unknown",
        },
      });

      res.json(updated);
    } catch (error) {
      logger.error("Error updating role:", error);
      res.status(500).json({ error: "Failed to update role" });
    }
  }
);

/**
 * DELETE /api/roles/:id - Delete role
 */
router.delete(
  "/:id",
  requirePermission(PERMISSIONS.ROLES_DELETE),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      const role = await prisma.role.findUnique({
        where: { id },
        include: { _count: { select: { users: true } } },
      });

      if (!role) {
        res.status(404).json({ error: "Role not found" });
        return;
      }

      // Prevent deleting built-in roles
      if (["admin", "user", "viewer"].includes(role.name)) {
        res.status(400).json({ error: "Cannot delete built-in roles" });
        return;
      }

      // Prevent deleting roles with assigned users
      if (role._count.users > 0) {
        res.status(400).json({
          error: `Cannot delete role with ${role._count.users} assigned user(s). Reassign users first.`,
        });
        return;
      }

      await prisma.role.delete({ where: { id } });

      // Audit log
      await prisma.auditLog.create({
        data: {
          userId: req.user!.userId,
          action: "role.delete",
          resource: "role",
          resourceId: id,
          details: { name: role.name, deletedBy: req.user!.username },
          ipAddress: req.ip || "unknown",
          userAgent: req.headers["user-agent"] || "unknown",
        },
      });

      res.json({ message: "Role deleted successfully" });
    } catch (error) {
      logger.error("Error deleting role:", error);
      res.status(500).json({ error: "Failed to delete role" });
    }
  }
);

/**
 * GET /api/roles/permissions - Get all available permissions
 */
router.get(
  "/permissions",
  requirePermission(PERMISSIONS.ROLES_READ),
  async (req: AuthRequest, res: Response): Promise<void> => {
    res.json({
      permissions: Object.values(PERMISSIONS),
      categories: {
        users: ["users.read", "users.write", "users.delete"],
        devices: ["devices.read", "devices.write", "devices.delete"],
        files: ["files.read", "files.write", "files.delete"],
        logs: ["logs.read"],
        settings: ["settings.read", "settings.write"],
        roles: ["roles.read", "roles.write", "roles.delete"],
      },
    });
  }
);

export default router;
```

### 5.3 Register Routes in `index.ts`

```typescript
import rolesRouter from "./src/routes/roles";
// ...
app.use("/api/roles", rolesRouter);
```

---

## 6. Phase 3: Self-Service Password Reset

### 6.1 Security Best Practices

**References:**

- [LogRocket: Secure Password Reset in Node.js](https://blog.logrocket.com/implementing-secure-password-reset-node-js/)
- [Smashing Magazine: Safe Password Resets with JWT](https://www.smashingmagazine.com/2017/11/safe-password-resets-with-json-web-tokens/)

**Key Security Requirements:**

1. Use cryptographically secure random tokens (not JWT for reset)
2. Hash tokens before storing in database
3. Short expiration (15-60 minutes)
4. One-time use (invalidate after use)
5. Rate limit reset requests
6. Don't reveal if email exists (timing attacks)
7. Invalidate all sessions after password reset

### 7.2 Database Migration

```prisma
// prisma/schema.prisma - Add new model

model PasswordResetToken {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokenHash String   @unique  // SHA-256 hash of the token
  expiresAt DateTime
  usedAt    DateTime?         // Null until used
  createdAt DateTime @default(now())

  @@index([userId])
  @@index([tokenHash])
  @@index([expiresAt])
  @@map("password_reset_tokens")
}
```

Update User model:

```prisma
model User {
  // ... existing fields

  // Add relation
  passwordResetTokens PasswordResetToken[]
}
```

### 6.3 Token Generation Utility

```typescript
// src/utils/passwordReset.ts

import crypto from "crypto";
import { prisma } from "../lib/prisma";

const TOKEN_EXPIRY_MINUTES = 30;
const TOKEN_BYTES = 32;

/**
 * Generate a secure password reset token
 * Returns the plain token (to send via email) and stores the hash
 */
export async function generatePasswordResetToken(
  userId: string
): Promise<string> {
  // Generate cryptographically secure random token
  const token = crypto.randomBytes(TOKEN_BYTES).toString("hex");

  // Hash token for storage (never store plain tokens)
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  // Calculate expiry
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MINUTES * 60 * 1000);

  // Invalidate any existing tokens for this user
  await prisma.passwordResetToken.updateMany({
    where: { userId, usedAt: null },
    data: { usedAt: new Date() }, // Mark as used
  });

  // Create new token record
  await prisma.passwordResetToken.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
    },
  });

  return token;
}

/**
 * Verify a password reset token
 * Returns user ID if valid, null otherwise
 */
export async function verifyPasswordResetToken(
  token: string
): Promise<string | null> {
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!resetToken) return null;
  if (resetToken.usedAt) return null; // Already used
  if (resetToken.expiresAt < new Date()) return null; // Expired

  return resetToken.userId;
}

/**
 * Mark token as used (call after successful password reset)
 */
export async function invalidatePasswordResetToken(
  token: string
): Promise<void> {
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  await prisma.passwordResetToken.update({
    where: { tokenHash },
    data: { usedAt: new Date() },
  });
}
```

### 6.4 Email Service (Placeholder)

```typescript
// src/services/email.ts

import logger from "../lib/logger";

interface SendEmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Send email using configured provider
 * TODO: Integrate with actual email service (SendGrid, SES, Nodemailer, etc.)
 */
export async function sendEmail(options: SendEmailOptions): Promise<boolean> {
  // For development, log the email content
  if (process.env.NODE_ENV !== "production") {
    logger.info("📧 Email would be sent:", {
      to: options.to,
      subject: options.subject,
      text: options.text.substring(0, 200) + "...",
    });
    return true;
  }

  // TODO: Implement actual email sending
  // Example with Nodemailer:
  // const transporter = nodemailer.createTransport({ ... })
  // await transporter.sendMail({ from: 'noreply@example.com', ...options })

  throw new Error("Email service not configured for production");
}

/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(
  email: string,
  token: string,
  username: string
): Promise<boolean> {
  const resetUrl = `${
    process.env.FRONTEND_URL || "http://localhost:5173"
  }/reset-password?token=${token}`;

  return sendEmail({
    to: email,
    subject: "Password Reset Request",
    text: `
Hello ${username},

You requested a password reset. Click the link below to reset your password:

${resetUrl}

This link will expire in 30 minutes.

If you did not request this, please ignore this email.

Best regards,
UNV AI Report Server
    `.trim(),
    html: `
<p>Hello ${username},</p>
<p>You requested a password reset. Click the button below to reset your password:</p>
<p><a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:white;text-decoration:none;border-radius:6px;">Reset Password</a></p>
<p>Or copy this link: <code>${resetUrl}</code></p>
<p><small>This link will expire in 30 minutes.</small></p>
<p>If you did not request this, please ignore this email.</p>
    `,
  });
}
```

### 6.5 Password Reset Endpoints

```typescript
// src/routes/auth.ts - Add new endpoints

import {
  generatePasswordResetToken,
  verifyPasswordResetToken,
  invalidatePasswordResetToken,
} from "../utils/passwordReset";
import { sendPasswordResetEmail } from "../services/email";
import { getPasswordError } from "../utils/password";

/**
 * POST /api/auth/forgot-password
 * Request password reset email
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

      // Always return success to prevent email enumeration
      // Process in background to ensure consistent timing
      const response = {
        message:
          "If an account exists with this email, a reset link has been sent.",
      };

      // Find user (don't reveal if exists)
      const user = await prisma.user.findUnique({ where: { email } });

      if (user && user.isActive) {
        try {
          const token = await generatePasswordResetToken(user.id);
          await sendPasswordResetEmail(email, token, user.username);

          await safeAudit({
            userId: user.id,
            action: "auth.password_reset_requested",
            resource: "user",
            resourceId: user.id,
            details: { email },
            ip: req.ip || "unknown",
            userAgent: req.headers["user-agent"] || "unknown",
            success: true,
          });
        } catch (error) {
          logger.error("Failed to send password reset email", { error, email });
        }
      } else {
        // Log attempt for non-existent email (security monitoring)
        await safeAudit({
          action: "auth.password_reset_attempted_unknown_email",
          details: { email },
          ip: req.ip || "unknown",
          userAgent: req.headers["user-agent"] || "unknown",
          success: false,
        });
      }

      res.json(response);
    } catch (error) {
      logger.error("Forgot password error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

/**
 * POST /api/auth/reset-password
 * Reset password with token
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

      // Validate password strength
      const passwordError = getPasswordError(newPassword, [
        user.username,
        user.email,
      ]);
      if (passwordError) {
        res.status(400).json({ error: passwordError });
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
        ip: req.ip || "unknown",
        userAgent: req.headers["user-agent"] || "unknown",
        success: true,
      });

      res.json({
        message:
          "Password reset successful. Please log in with your new password.",
      });
    } catch (error) {
      logger.error("Reset password error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

/**
 * GET /api/auth/verify-reset-token
 * Check if a reset token is valid (for frontend UX)
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
```

### 6.6 Frontend Reset Flow

```
1. User clicks "Forgot Password" on login page
2. User enters email → POST /api/auth/forgot-password
3. User receives email with reset link
4. User clicks link → Frontend /reset-password?token=xxx
5. Frontend validates token → GET /api/auth/verify-reset-token?token=xxx
6. User enters new password with strength meter
7. Submit → POST /api/auth/reset-password
8. Redirect to login with success message
```

---

## 7. Database Migrations

### 7.1 Migration for PasswordResetToken

```bash
bun run db:migrate -- --name add_password_reset_tokens
```

This will generate migration SQL based on schema changes.

### 7.2 Migration for Updated Permissions

If adding new permissions to existing roles, create a data migration:

```typescript
// prisma/migrations/XXXXXX_add_role_permissions/data-migration.ts

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Add roles permissions to admin role
  await prisma.role.update({
    where: { name: "admin" },
    data: {
      permissions: {
        push: ["roles.read", "roles.write", "roles.delete"],
      },
    },
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

---

## 8. Testing Strategy

### 8.1 Unit Tests

| Component                      | Test Cases                                         |
| ------------------------------ | -------------------------------------------------- |
| `requirePermission` middleware | Valid permission, missing permission, invalid role |
| `generatePasswordResetToken`   | Token generation, old token invalidation           |
| `verifyPasswordResetToken`     | Valid token, expired token, used token             |

### 8.2 Integration Tests

| Endpoint                         | Test Cases                                            |
| -------------------------------- | ----------------------------------------------------- |
| `POST /api/roles`                | Create role, duplicate name, invalid permissions      |
| `DELETE /api/roles/:id`          | Delete empty role, delete with users, delete built-in |
| `POST /api/auth/forgot-password` | Valid email, invalid email, rate limiting             |
| `POST /api/auth/reset-password`  | Valid token, expired token                            |

### 8.3 Security Tests

- [ ] Permission bypass attempts
- [ ] Token timing attacks
- [ ] Email enumeration
- [ ] Session invalidation after password reset

---

## 9. Risk Assessment

| Risk                        | Likelihood | Impact | Mitigation                                |
| --------------------------- | ---------- | ------ | ----------------------------------------- |
| Breaking existing auth flow | Medium     | High   | Extensive testing, gradual rollout        |
| Permission misconfiguration | Medium     | High   | Default to deny, audit logging            |
| Email delivery failures     | Medium     | Medium | Fallback mechanisms, clear error messages |
| Token leakage in logs       | Low        | High   | Never log tokens, hash before storing     |

---

## 10. Timeline & Effort Estimates

| Phase                   | Effort   | Dependencies  | Recommended Sprint |
| ----------------------- | -------- | ------------- | ------------------ |
| Phase 1: Permissions    | 2-3 days | None          | Sprint 1           |
| Phase 2: Admin/Roles    | 3-4 days | Phase 1       | Sprint 1           |
| Phase 3: Password Reset | 3-4 days | Email service | Sprint 2           |

**Total Estimated Effort:** 8-11 developer days

---

## Appendix A: File Changes Summary

| File                         | Action | Description                         |
| ---------------------------- | ------ | ----------------------------------- |
| `src/types/permissions.ts`   | Create | Permission constants                |
| `src/middleware/auth.ts`     | Modify | Add `requirePermission`             |
| `src/routes/roles.ts`        | Create | Role CRUD endpoints                 |
| `src/routes/users.ts`        | Modify | Admin protection, permission checks |
| `src/utils/passwordReset.ts` | Create | Token utilities                     |
| `src/services/email.ts`      | Create | Email service                       |
| `src/routes/auth.ts`         | Modify | Add reset endpoints                 |
| `prisma/schema.prisma`       | Modify | Add PasswordResetToken model        |
| `index.ts`                   | Modify | Register new routes                 |

---

## Appendix B: API Endpoint Summary (New/Modified)

| Method | Endpoint                       | Auth | Permission     |
| ------ | ------------------------------ | ---- | -------------- |
| GET    | `/api/roles`                   | ✅   | `roles.read`   |
| POST   | `/api/roles`                   | ✅   | `roles.write`  |
| PUT    | `/api/roles/:id`               | ✅   | `roles.write`  |
| DELETE | `/api/roles/:id`               | ✅   | `roles.delete` |
| GET    | `/api/roles/permissions`       | ✅   | `roles.read`   |
| POST   | `/api/auth/forgot-password`    | ❌   | -              |
| POST   | `/api/auth/reset-password`     | ❌   | -              |
| GET    | `/api/auth/verify-reset-token` | ❌   | -              |

---

_Document prepared for UNV AI Report Server V2 improvement initiative._
