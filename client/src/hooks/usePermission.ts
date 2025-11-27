import { useAuthStore } from "../stores/auth";
import {
  hasPermission,
  hasAllPermissions,
  hasAnyPermission,
  type Permission,
} from "../lib/permissions";

/**
 * Hook to check user permissions in components
 *
 * @example
 * const { can, canAll, canAny } = usePermission();
 *
 * // Check single permission
 * if (can(PERMISSIONS.FILES_WRITE)) { ... }
 *
 * // Check multiple permissions (AND)
 * if (canAll([PERMISSIONS.FILES_READ, PERMISSIONS.FILES_WRITE])) { ... }
 *
 * // Check multiple permissions (OR)
 * if (canAny([PERMISSIONS.USERS_WRITE, PERMISSIONS.USERS_DELETE])) { ... }
 */
export function usePermission() {
  const permissions = useAuthStore((state) => state.user?.permissions);

  return {
    /**
     * Check if user has a specific permission
     */
    can: (permission: Permission): boolean =>
      hasPermission(permissions, permission),

    /**
     * Check if user has ALL specified permissions
     */
    canAll: (requiredPermissions: Permission[]): boolean =>
      hasAllPermissions(permissions, requiredPermissions),

    /**
     * Check if user has ANY of the specified permissions
     */
    canAny: (requiredPermissions: Permission[]): boolean =>
      hasAnyPermission(permissions, requiredPermissions),

    /**
     * Raw permissions array for advanced usage
     */
    permissions: permissions ?? [],
  };
}

export default usePermission;
