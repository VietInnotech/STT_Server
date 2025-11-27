/**
 * Permission constants for the frontend
 * Must be kept in sync with src/types/permissions.ts on the backend
 */
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

  // Role Management
  ROLES_READ: "roles.read",
  ROLES_WRITE: "roles.write",
  ROLES_DELETE: "roles.delete",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/**
 * Check if a permissions array includes a specific permission
 */
export function hasPermission(
  permissions: string[] | null | undefined,
  permission: Permission
): boolean {
  if (!permissions || !Array.isArray(permissions)) return false;
  return permissions.includes(permission);
}

/**
 * Check if a permissions array includes ALL specified permissions
 */
export function hasAllPermissions(
  permissions: string[] | null | undefined,
  requiredPermissions: Permission[]
): boolean {
  if (!permissions || !Array.isArray(permissions)) return false;
  return requiredPermissions.every((p) => permissions.includes(p));
}

/**
 * Check if a permissions array includes ANY of the specified permissions
 */
export function hasAnyPermission(
  permissions: string[] | null | undefined,
  requiredPermissions: Permission[]
): boolean {
  if (!permissions || !Array.isArray(permissions)) return false;
  return requiredPermissions.some((p) => permissions.includes(p));
}
