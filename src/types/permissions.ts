/**
 * Permission constants for fine-grained access control
 *
 * These permissions are stored in the Role.permissions JSON array
 * and enforced by the requirePermission middleware.
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

  // Template Management
  TEMPLATES_READ: "templates.read",
  TEMPLATES_WRITE: "templates.write",
  TEMPLATES_DELETE: "templates.delete",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/**
 * Permission categories for UI display and organization
 */
export const PERMISSION_CATEGORIES = {
  users: [
    PERMISSIONS.USERS_READ,
    PERMISSIONS.USERS_WRITE,
    PERMISSIONS.USERS_DELETE,
  ],
  devices: [
    PERMISSIONS.DEVICES_READ,
    PERMISSIONS.DEVICES_WRITE,
    PERMISSIONS.DEVICES_DELETE,
  ],
  files: [
    PERMISSIONS.FILES_READ,
    PERMISSIONS.FILES_WRITE,
    PERMISSIONS.FILES_DELETE,
  ],
  logs: [PERMISSIONS.LOGS_READ],
  settings: [PERMISSIONS.SETTINGS_READ, PERMISSIONS.SETTINGS_WRITE],
  roles: [
    PERMISSIONS.ROLES_READ,
    PERMISSIONS.ROLES_WRITE,
    PERMISSIONS.ROLES_DELETE,
  ],
  templates: [
    PERMISSIONS.TEMPLATES_READ,
    PERMISSIONS.TEMPLATES_WRITE,
    PERMISSIONS.TEMPLATES_DELETE,
  ],
} as const;

/**
 * All available permissions as an array
 */
export const ALL_PERMISSIONS = Object.values(PERMISSIONS);

/**
 * Default permissions for built-in roles
 * Used by seed.ts and for initializing new installations
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<string, Permission[]> = {
  admin: [
    PERMISSIONS.USERS_READ,
    PERMISSIONS.USERS_WRITE,
    PERMISSIONS.USERS_DELETE,
    PERMISSIONS.DEVICES_READ,
    PERMISSIONS.DEVICES_WRITE,
    PERMISSIONS.DEVICES_DELETE,
    PERMISSIONS.FILES_READ,
    PERMISSIONS.FILES_WRITE,
    PERMISSIONS.FILES_DELETE,
    PERMISSIONS.LOGS_READ,
    PERMISSIONS.SETTINGS_READ,
    PERMISSIONS.SETTINGS_WRITE,
    PERMISSIONS.ROLES_READ,
    PERMISSIONS.ROLES_WRITE,
    PERMISSIONS.ROLES_DELETE,
    PERMISSIONS.TEMPLATES_READ,
    PERMISSIONS.TEMPLATES_WRITE,
    PERMISSIONS.TEMPLATES_DELETE,
  ],
  user: [
    PERMISSIONS.DEVICES_READ,
    PERMISSIONS.FILES_READ,
    PERMISSIONS.FILES_WRITE,
  ],
  viewer: [PERMISSIONS.DEVICES_READ, PERMISSIONS.FILES_READ],
};

/**
 * Check if a role's permission array contains a specific permission
 */
export function hasPermission(
  permissions: string[],
  permission: Permission
): boolean {
  return permissions.includes(permission);
}

/**
 * Check if a role's permission array contains all specified permissions
 */
export function hasAllPermissions(
  permissions: string[],
  requiredPermissions: Permission[]
): boolean {
  return requiredPermissions.every((p) => permissions.includes(p));
}

/**
 * Check if a role's permission array contains any of the specified permissions
 */
export function hasAnyPermission(
  permissions: string[],
  requiredPermissions: Permission[]
): boolean {
  return requiredPermissions.some((p) => permissions.includes(p));
}
