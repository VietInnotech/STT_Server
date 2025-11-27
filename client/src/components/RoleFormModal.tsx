import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { Role, CreateRoleRequest, UpdateRoleRequest } from "../lib/api";
import Modal from "./Modal";
import PermissionCheckboxGroup from "./PermissionCheckboxGroup";
import FormLabel from "./FormLabel";

interface RoleFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  role?: Role | null; // null = create mode, object = edit mode
  categories: Record<string, string[]>;
  onSubmit: (
    data: CreateRoleRequest | UpdateRoleRequest,
    isEditing: boolean
  ) => Promise<void>;
}

export default function RoleFormModal({
  isOpen,
  onClose,
  role,
  categories,
  onSubmit,
}: RoleFormModalProps) {
  const { t } = useTranslation("roles");
  const { t: tCommon } = useTranslation("common");

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    permissions: [] as string[],
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditing = !!role;
  const isAdminRole = role?.name === "admin";

  // Initialize form when role changes
  useEffect(() => {
    if (role) {
      setFormData({
        name: role.name,
        description: role.description || "",
        permissions: [...role.permissions],
      });
    } else {
      setFormData({ name: "", description: "", permissions: [] });
    }
    setError(null);
  }, [role, isOpen]);

  const validateName = (name: string): boolean => {
    return /^[a-z][a-z0-9_]*$/.test(name);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate role name for new roles
    if (!isEditing) {
      if (!formData.name.trim()) {
        setError(t("roleNameRequired"));
        return;
      }
      if (!validateName(formData.name)) {
        setError(t("invalidRoleName"));
        return;
      }
    }

    setSubmitting(true);
    try {
      if (isEditing) {
        // Update - only send description and permissions (if not admin)
        const updateData: UpdateRoleRequest = {
          description: formData.description || undefined,
        };
        if (!isAdminRole) {
          updateData.permissions = formData.permissions;
        }
        await onSubmit(updateData, true);
      } else {
        // Create - send all fields
        const createData: CreateRoleRequest = {
          name: formData.name,
          description: formData.description || undefined,
          permissions: formData.permissions,
        };
        await onSubmit(createData, false);
      }
      onClose();
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || t("failedToSave")
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={isEditing ? t("editRole") : t("createNewRole")}
      open={isOpen}
      onClose={onClose}
      maxWidth="lg"
      footer={
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {tCommon("cancel")}
          </button>
          <button
            type="submit"
            form="role-form"
            disabled={submitting}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {submitting
              ? tCommon("loading")
              : isEditing
              ? tCommon("update")
              : tCommon("create")}
          </button>
        </div>
      }
    >
      <form id="role-form" onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Role Name */}
        <div>
          <FormLabel required>{t("roleName")}</FormLabel>
          <input
            type="text"
            required={!isEditing}
            disabled={isEditing}
            value={formData.name}
            onChange={(e) =>
              setFormData({ ...formData, name: e.target.value.toLowerCase() })
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
            placeholder={t("roleNamePlaceholder")}
          />
          {!isEditing && (
            <p className="mt-1 text-xs text-gray-500">{t("roleNameHint")}</p>
          )}
        </div>

        {/* Description */}
        <div>
          <FormLabel>{t("description")}</FormLabel>
          <textarea
            value={formData.description}
            onChange={(e) =>
              setFormData({ ...formData, description: e.target.value })
            }
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            placeholder={t("descriptionPlaceholder")}
          />
        </div>

        {/* Permissions */}
        <div>
          <FormLabel>
            {t("permissions")}
            {isAdminRole && (
              <span className="ml-2 text-xs text-amber-600 font-normal">
                ({t("cannotEditAdminPermissions")})
              </span>
            )}
          </FormLabel>
          <div className="text-xs text-gray-500 mb-3">
            {formData.permissions.length > 0
              ? t("permissionsSelected", { count: formData.permissions.length })
              : t("noPermissionsSelected")}
          </div>
          <PermissionCheckboxGroup
            categories={categories}
            selectedPermissions={formData.permissions}
            onChange={(permissions) =>
              setFormData({ ...formData, permissions })
            }
            disabled={isAdminRole}
          />
        </div>
      </form>
    </Modal>
  );
}
