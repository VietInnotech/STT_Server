import type { Request, Response, NextFunction } from "express";
import { verifyToken } from "../utils/jwt";
import { prisma } from "../lib/prisma";
import logger from "../lib/logger";

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    username: string;
    email: string | null;
    roleId: string;
    roleName: string;
  };
  token?: string;
}

/**
 * Middleware to authenticate requests using JWT token
 */
export async function authenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ error: "No token provided" });
      return;
    }

    const token = authHeader.substring(7);
    req.token = token;

    // Verify token signature/expiry
    const decoded = verifyToken(token);

    // Enforce that the token exists in Session table (single-session)
    const session = await prisma.session
      .findUnique({ where: { token } })
      .catch(() => null);
    if (!session) {
      res.status(401).json({ error: "Session expired or invalidated" });
      return;
    }

    // Attach user info to request
    req.user = {
      userId: decoded.userId,
      username: decoded.username,
      email: decoded.email,
      roleId: decoded.roleId,
      roleName: decoded.roleName,
    };

    next();
  } catch (error) {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

/**
 * Middleware to check if user has specific role
 */
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

/**
 * Middleware to check if user has specific permission(s)
 * Supports both single permission and permission arrays (OR logic)
 * If ANY of the required permissions is present, access is granted.
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
 * All permissions must be present for access to be granted.
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
        logger.warn("Permission denied (missing all required)", {
          userId: req.user.userId,
          required: requiredPermissions,
          actual: userPermissions,
        });
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
