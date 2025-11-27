import { Router } from "express";
import type { Response } from "express";
import { prisma } from "../lib/prisma";
import {
  authenticate,
  requirePermission,
  type AuthRequest,
} from "../middleware/auth";
import {
  PERMISSIONS,
  PERMISSION_CATEGORIES,
  ALL_PERMISSIONS,
} from "../types/permissions";
import logger from "../lib/logger";

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * @swagger
 * /api/roles:
 *   get:
 *     summary: List all roles
 *     description: Retrieve a list of all roles with their permissions and user counts
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Roles retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 roles:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       description:
 *                         type: string
 *                       permissions:
 *                         type: array
 *                         items:
 *                           type: string
 *                       userCount:
 *                         type: integer
 *                       createdAt:
 *                         type: string
 *                       updatedAt:
 *                         type: string
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - requires roles.read permission
 *       500:
 *         description: Internal server error
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
 * @swagger
 * /api/roles/permissions:
 *   get:
 *     summary: Get all available permissions
 *     description: Retrieve a list of all available permissions organized by category
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Permissions retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 permissions:
 *                   type: array
 *                   items:
 *                     type: string
 *                 categories:
 *                   type: object
 */
router.get(
  "/permissions",
  requirePermission(PERMISSIONS.ROLES_READ),
  async (req: AuthRequest, res: Response): Promise<void> => {
    res.json({
      permissions: ALL_PERMISSIONS,
      categories: PERMISSION_CATEGORIES,
    });
  }
);

/**
 * @swagger
 * /api/roles/{id}:
 *   get:
 *     summary: Get role by ID
 *     description: Retrieve a specific role by its ID
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Role retrieved successfully
 *       404:
 *         description: Role not found
 */
router.get(
  "/:id",
  requirePermission(PERMISSIONS.ROLES_READ),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      const role = await prisma.role.findUnique({
        where: { id },
        include: {
          _count: { select: { users: true } },
        },
      });

      if (!role) {
        res.status(404).json({ error: "Role not found" });
        return;
      }

      res.json({
        id: role.id,
        name: role.name,
        description: role.description,
        permissions: role.permissions,
        userCount: role._count.users,
        createdAt: role.createdAt,
        updatedAt: role.updatedAt,
      });
    } catch (error) {
      logger.error("Error fetching role:", error);
      res.status(500).json({ error: "Failed to fetch role" });
    }
  }
);

/**
 * @swagger
 * /api/roles:
 *   post:
 *     summary: Create new role
 *     description: Create a new role with specified permissions
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - permissions
 *             properties:
 *               name:
 *                 type: string
 *                 description: Role name (lowercase alphanumeric with underscores)
 *                 example: custom_role
 *               description:
 *                 type: string
 *                 description: Role description
 *                 example: Custom role for specific users
 *               permissions:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["files.read", "files.write"]
 *     responses:
 *       201:
 *         description: Role created successfully
 *       400:
 *         description: Invalid input or role name already exists
 *       403:
 *         description: Forbidden - requires roles.write permission
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
        res.status(400).json({
          error:
            "Role name must start with a lowercase letter and contain only lowercase alphanumeric characters and underscores",
        });
        return;
      }

      // Check for duplicate
      const existing = await prisma.role.findUnique({ where: { name } });
      if (existing) {
        res.status(400).json({ error: "Role name already exists" });
        return;
      }

      // Validate permissions are all valid
      const invalidPermissions = permissions.filter(
        (p: string) => !ALL_PERMISSIONS.includes(p as any)
      );
      if (invalidPermissions.length > 0) {
        res.status(400).json({
          error: "Invalid permissions provided",
          invalid: invalidPermissions,
          valid: ALL_PERMISSIONS,
        });
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

      logger.info("Role created", {
        roleId: role.id,
        name,
        createdBy: req.user!.username,
      });

      res.status(201).json({
        id: role.id,
        name: role.name,
        description: role.description,
        permissions: role.permissions,
        createdAt: role.createdAt,
        updatedAt: role.updatedAt,
      });
    } catch (error) {
      logger.error("Error creating role:", error);
      res.status(500).json({ error: "Failed to create role" });
    }
  }
);

/**
 * @swagger
 * /api/roles/{id}:
 *   put:
 *     summary: Update role
 *     description: Update an existing role's description or permissions. Built-in admin role permissions cannot be modified.
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               description:
 *                 type: string
 *               permissions:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Role updated successfully
 *       400:
 *         description: Cannot modify admin role permissions
 *       404:
 *         description: Role not found
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

      // Validate permissions if provided
      if (permissions) {
        if (!Array.isArray(permissions)) {
          res.status(400).json({ error: "Permissions must be an array" });
          return;
        }

        const invalidPermissions = permissions.filter(
          (p: string) => !ALL_PERMISSIONS.includes(p as any)
        );
        if (invalidPermissions.length > 0) {
          res.status(400).json({
            error: "Invalid permissions provided",
            invalid: invalidPermissions,
            valid: ALL_PERMISSIONS,
          });
          return;
        }
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

      logger.info("Role updated", {
        roleId: id,
        name: role.name,
        updatedBy: req.user!.username,
      });

      res.json({
        id: updated.id,
        name: updated.name,
        description: updated.description,
        permissions: updated.permissions,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      });
    } catch (error) {
      logger.error("Error updating role:", error);
      res.status(500).json({ error: "Failed to update role" });
    }
  }
);

/**
 * @swagger
 * /api/roles/{id}:
 *   delete:
 *     summary: Delete role
 *     description: Delete a role. Built-in roles (admin, user, viewer) cannot be deleted. Roles with assigned users cannot be deleted.
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Role deleted successfully
 *       400:
 *         description: Cannot delete built-in role or role with assigned users
 *       404:
 *         description: Role not found
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

      logger.info("Role deleted", {
        roleId: id,
        name: role.name,
        deletedBy: req.user!.username,
      });

      res.json({ message: "Role deleted successfully" });
    } catch (error) {
      logger.error("Error deleting role:", error);
      res.status(500).json({ error: "Failed to delete role" });
    }
  }
);

export default router;
