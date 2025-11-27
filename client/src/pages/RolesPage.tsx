import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Shield,
  Plus,
  Edit2,
  Trash2,
  Users,
  Key,
  ShieldCheck,
} from "lucide-react";
import { rolesApi } from "../lib/api";
import type {
  Role,
  PermissionsResponse,
  CreateRoleRequest,
  UpdateRoleRequest,
} from "../lib/api";
import Modal from "../components/Modal";
import RoleFormModal from "../components/RoleFormModal";
import toast from "react-hot-toast";

// Built-in role names
const BUILT_IN_ROLES = ["admin", "user", "viewer"];

export default function RolesPage() {
  const { t } = useTranslation("roles");
  const { t: tCommon } = useTranslation("common");

  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<PermissionsResponse | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Role | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [rolesRes, permRes] = await Promise.all([
        rolesApi.list(),
        rolesApi.getPermissions(),
      ]);
      setRoles(rolesRes.data.roles);
      setPermissions(permRes.data);
    } catch {
      toast.error(t("failedToLoad"));
    } finally {
      setLoading(false);
    }
  };

  // Fetch data on mount
  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleOpenCreate = () => {
    setEditingRole(null);
    setShowFormModal(true);
  };

  const handleOpenEdit = (role: Role) => {
    setEditingRole(role);
    setShowFormModal(true);
  };

  const handleCloseModal = () => {
    setShowFormModal(false);
    setEditingRole(null);
  };

  const handleSubmit = async (
    data: CreateRoleRequest | UpdateRoleRequest,
    isEditing: boolean
  ) => {
    if (isEditing && editingRole) {
      await rolesApi.update(editingRole.id, data as UpdateRoleRequest);
      toast.success(t("roleUpdated"));
    } else {
      await rolesApi.create(data as CreateRoleRequest);
      toast.success(t("roleCreated"));
    }
    fetchData();
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await rolesApi.delete(deleteConfirm.id);
      toast.success(t("roleDeleted"));
      setDeleteConfirm(null);
      fetchData();
    } catch (error: unknown) {
      const errMsg =
        (error as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || t("failedToDelete");
      toast.error(errMsg);
    }
  };

  const isBuiltIn = (roleName: string) => BUILT_IN_ROLES.includes(roleName);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">{t("loadingRoles")}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{t("title")}</h2>
          <p className="text-sm text-gray-500 mt-1">{t("subtitle")}</p>
        </div>
        <button
          onClick={handleOpenCreate}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          {t("addRole")}
        </button>
      </div>

      {/* Roles Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t("roleName")}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t("description")}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t("permissions")}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t("users")}
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t("actions")}
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {roles.map((role) => (
                <tr key={role.id} className="hover:bg-gray-50">
                  {/* Role Name */}
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <div
                        className={`p-2 rounded-lg ${
                          role.name === "admin"
                            ? "bg-purple-100"
                            : isBuiltIn(role.name)
                            ? "bg-blue-100"
                            : "bg-gray-100"
                        }`}
                      >
                        {role.name === "admin" ? (
                          <ShieldCheck
                            className="h-5 w-5 text-purple-600"
                            aria-label="Admin"
                          />
                        ) : (
                          <Shield
                            className={`h-5 w-5 ${
                              isBuiltIn(role.name)
                                ? "text-blue-600"
                                : "text-gray-600"
                            }`}
                          />
                        )}
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">
                          {role.name}
                        </div>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            isBuiltIn(role.name)
                              ? "bg-blue-100 text-blue-700"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {isBuiltIn(role.name) ? t("builtIn") : t("custom")}
                        </span>
                      </div>
                    </div>
                  </td>

                  {/* Description */}
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-500 max-w-xs truncate">
                      {role.description || "-"}
                    </div>
                  </td>

                  {/* Permissions */}
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <Key className="h-4 w-4 text-gray-400" />
                      <span className="text-sm text-gray-600">
                        {t("permissionsSelected", {
                          count: role.permissions.length,
                        })}
                      </span>
                    </div>
                  </td>

                  {/* Users */}
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-gray-400" />
                      <span className="text-sm text-gray-600">
                        {t("usersAssigned", { count: role.userCount })}
                      </span>
                    </div>
                  </td>

                  {/* Actions */}
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleOpenEdit(role)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title={t("editRole")}
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      {!isBuiltIn(role.name) && (
                        <button
                          onClick={() => setDeleteConfirm(role)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title={tCommon("delete")}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Empty state for no roles */}
      {roles.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <Shield className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            {t("noRoles")}
          </h3>
          <p className="text-gray-500">{t("createFirstRole")}</p>
        </div>
      )}

      {/* Role Form Modal */}
      {permissions && (
        <RoleFormModal
          isOpen={showFormModal}
          onClose={handleCloseModal}
          role={editingRole}
          categories={permissions.categories}
          onSubmit={handleSubmit}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <Modal
          title={t("confirmDelete", { name: deleteConfirm.name })}
          open={true}
          onClose={() => setDeleteConfirm(null)}
          maxWidth="sm"
        >
          <div className="space-y-4">
            <p className="text-sm text-gray-700">{t("confirmDeleteDesc")}</p>
            {deleteConfirm.userCount > 0 && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-sm text-amber-700">
                  {t("cannotDeleteWithUsers")}. {t("reassignUsersFirst")}
                </p>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
              >
                {tCommon("cancel")}
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteConfirm.userCount > 0}
                className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {tCommon("delete")}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
