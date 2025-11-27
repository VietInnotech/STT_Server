import { Router } from "express";
import type { Request, Response } from "express";
import bcrypt from "bcrypt";
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

/**
 * @swagger
 * /api/users:
 *   get:
 *     summary: List all users
 *     description: Retrieve a list of all users with their roles (requires users.read permission)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Users retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 users:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/User'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Forbidden - requires users.read permission
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
  "/",
  requirePermission(PERMISSIONS.USERS_READ),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const users = await prisma.user.findMany({
        include: {
          role: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      const usersResponse = users.map((user) => ({
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        role: user.role.name,
        roleId: user.roleId,
        isActive: user.isActive,
        lastLogin: user.lastLogin,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      }));

      res.json({ users: usersResponse, count: usersResponse.length });
    } catch (error) {
      logger.error("Error fetching users:", error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  }
);

/**
 * GET /api/users/:id - Get single user
 * Requires users.read permission
 */
router.get(
  "/:id",
  requirePermission(PERMISSIONS.USERS_READ),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      const user = await prisma.user.findUnique({
        where: { id },
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
        isActive: user.isActive,
        lastLogin: user.lastLogin,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      });
    } catch (error) {
      logger.error("Error fetching user:", error);
      res.status(500).json({ error: "Failed to fetch user" });
    }
  }
);

/**
 * POST /api/users - Create new user
 * Requires users.write permission
 */
router.post(
  "/",
  requirePermission(PERMISSIONS.USERS_WRITE),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { username, password, fullName, roleId } = req.body;
      // Normalize empty string to null for optional email
      const email = req.body.email?.trim() || null;

      // Validation
      if (!username || !password || !roleId) {
        res
          .status(400)
          .json({ error: "Username, password, and role are required" });
        return;
      }

      if (password.length < 6) {
        res
          .status(400)
          .json({ error: "Password must be at least 6 characters" });
        return;
      }

      // Check if username or email already exists
      const orConditions: { username?: string; email?: string }[] = [
        { username },
      ];
      if (email) {
        orConditions.push({ email });
      }
      const existingUser = await prisma.user.findFirst({
        where: {
          OR: orConditions,
        },
      });

      if (existingUser) {
        res
          .status(400)
          .json({
            error: email
              ? "Username or email already exists"
              : "Username already exists",
          });
        return;
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 10);

      // Create user
      const newUser = await prisma.user.create({
        data: {
          username,
          email,
          passwordHash,
          fullName: fullName || null,
          roleId,
          isActive: true,
        },
        include: {
          role: true,
        },
      });

      // Create audit log
      await prisma.auditLog.create({
        data: {
          userId: req.user!.userId,
          action: "user.create",
          resource: "user",
          resourceId: newUser.id,
          details: {
            username: newUser.username,
            email: newUser.email,
            createdBy: req.user!.username,
          },
          ipAddress: req.ip || req.socket.remoteAddress || "unknown",
          userAgent: req.headers["user-agent"] || "unknown",
        },
      });

      res.status(201).json({
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        fullName: newUser.fullName,
        role: newUser.role.name,
        roleId: newUser.roleId,
        isActive: newUser.isActive,
        createdAt: newUser.createdAt,
      });
    } catch (error) {
      logger.error("Error creating user:", error);
      res.status(500).json({ error: "Failed to create user" });
    }
  }
);

/**
 * PUT /api/users/:id - Update user
 * Requires users.write permission
 */
router.put(
  "/:id",
  requirePermission(PERMISSIONS.USERS_WRITE),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { username, email, fullName, roleId, isActive, password } =
        req.body;

      // Check if user exists
      const existingUser = await prisma.user.findUnique({
        where: { id },
      });

      if (!existingUser) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      // Check if username or email already taken by another user
      if (username || email) {
        const duplicate = await prisma.user.findFirst({
          where: {
            AND: [
              { id: { not: id } },
              {
                OR: [
                  username ? { username } : {},
                  email ? { email } : {},
                ].filter((obj) => Object.keys(obj).length > 0),
              },
            ],
          },
        });

        if (duplicate) {
          res.status(400).json({ error: "Username or email already exists" });
          return;
        }
      }

      // Prepare update data
      const updateData: any = {};
      if (username) updateData.username = username;
      if (email) updateData.email = email;
      if (fullName !== undefined) updateData.fullName = fullName;
      if (roleId) updateData.roleId = roleId;
      if (isActive !== undefined) updateData.isActive = isActive;

      // Hash new password if provided
      if (password) {
        if (password.length < 6) {
          res
            .status(400)
            .json({ error: "Password must be at least 6 characters" });
          return;
        }
        updateData.passwordHash = await bcrypt.hash(password, 10);
      }

      // Admin protection: prevent disabling the last active admin
      if (isActive === false) {
        // Fetch full user with role
        const targetUser = await prisma.user.findUnique({
          where: { id },
          include: { role: true },
        });

        if (targetUser?.role.name === "admin") {
          // Count remaining active admins (excluding the user being disabled)
          const activeAdminCount = await prisma.user.count({
            where: {
              isActive: true,
              role: { name: "admin" },
              id: { not: id },
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

      // Admin protection: prevent changing the last admin's role to non-admin
      if (roleId && roleId !== existingUser.roleId) {
        const targetUser = await prisma.user.findUnique({
          where: { id },
          include: { role: true },
        });

        if (targetUser?.role.name === "admin") {
          // Check if the new role is not admin
          const newRole = await prisma.role.findUnique({
            where: { id: roleId },
          });

          if (newRole && newRole.name !== "admin") {
            // Count remaining active admins (excluding the user being changed)
            const activeAdminCount = await prisma.user.count({
              where: {
                isActive: true,
                role: { name: "admin" },
                id: { not: id },
              },
            });

            if (activeAdminCount === 0) {
              res.status(400).json({
                error:
                  "Cannot change the role of the last active admin account",
              });
              return;
            }
          }
        }
      }

      // Update user
      const updatedUser = await prisma.user.update({
        where: { id },
        data: updateData,
        include: {
          role: true,
        },
      });

      // Create audit log
      await prisma.auditLog.create({
        data: {
          userId: req.user!.userId,
          action: "user.update",
          resource: "user",
          resourceId: updatedUser.id,
          details: {
            username: updatedUser.username,
            updatedBy: req.user!.username,
            changes: Object.keys(updateData),
          },
          ipAddress: req.ip || req.socket.remoteAddress || "unknown",
          userAgent: req.headers["user-agent"] || "unknown",
        },
      });

      res.json({
        id: updatedUser.id,
        username: updatedUser.username,
        email: updatedUser.email,
        fullName: updatedUser.fullName,
        role: updatedUser.role.name,
        roleId: updatedUser.roleId,
        isActive: updatedUser.isActive,
        lastLogin: updatedUser.lastLogin,
        createdAt: updatedUser.createdAt,
        updatedAt: updatedUser.updatedAt,
      });
    } catch (error) {
      logger.error("Error updating user:", error);
      res.status(500).json({ error: "Failed to update user" });
    }
  }
);

/**
 * DELETE /api/users/:id - Delete user
 * Requires users.delete permission
 */
router.delete(
  "/:id",
  requirePermission(PERMISSIONS.USERS_DELETE),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      // Prevent deleting yourself
      if (id === req.user!.userId) {
        res.status(400).json({ error: "Cannot delete your own account" });
        return;
      }

      // Check if user exists
      const user = await prisma.user.findUnique({
        where: { id },
        include: { role: true },
      });

      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      // Admin protection: prevent deleting the last active admin
      if (user.role.name === "admin" && user.isActive) {
        const activeAdminCount = await prisma.user.count({
          where: {
            isActive: true,
            role: { name: "admin" },
            id: { not: id },
          },
        });

        if (activeAdminCount === 0) {
          res.status(400).json({
            error: "Cannot delete the last active admin account",
          });
          return;
        }
      }

      // Delete user
      await prisma.user.delete({
        where: { id },
      });

      // Create audit log
      await prisma.auditLog.create({
        data: {
          userId: req.user!.userId,
          action: "user.delete",
          resource: "user",
          resourceId: id,
          details: { username: user.username, deletedBy: req.user!.username },
          ipAddress: req.ip || req.socket.remoteAddress || "unknown",
          userAgent: req.headers["user-agent"] || "unknown",
        },
      });

      res.json({ message: "User deleted successfully" });
    } catch (error) {
      logger.error("Error deleting user:", error);
      res.status(500).json({ error: "Failed to delete user" });
    }
  }
);

/**
 * GET /api/users/roles/list - Get all available roles
 */
router.get(
  "/roles/list",
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const roles = await prisma.role.findMany({
        orderBy: {
          name: "asc",
        },
      });

      res.json({ roles });
    } catch (error) {
      logger.error("Error fetching roles:", error);
      res.status(500).json({ error: "Failed to fetch roles" });
    }
  }
);

export default router;
