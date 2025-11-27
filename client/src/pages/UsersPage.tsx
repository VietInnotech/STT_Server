import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  UserPlus,
  Shield,
  Mail,
  Calendar,
  Edit2,
  Trash2,
  X,
} from "lucide-react";
import { usersApi } from "../lib/api";
import { formatDate } from "../lib/formatters";
import Modal from "../components/Modal";
import FormLabel from "../components/FormLabel";
import toast from "react-hot-toast";

interface User {
  id: string;
  username: string;
  email: string;
  fullName?: string | null;
  role: string;
  roleId?: string;
  isActive: boolean;
  lastLogin?: string | null;
  createdAt: string;
  updatedAt?: string;
}

interface Role {
  id: string;
  name: string;
  description: string | null;
}

export default function UsersPage() {
  const { t } = useTranslation("users");
  const { t: tCommon } = useTranslation("common");
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
    fullName: "",
    roleId: "",
  });
  const [confirmModal, setConfirmModal] = useState<{
    action: "delete" | "toggle" | null;
    user: User | null;
  }>({ action: null, user: null });

  // Fetch users and roles
  const fetchData = async () => {
    try {
      const [usersRes, rolesRes] = await Promise.all([
        usersApi.list(),
        usersApi.getRoles(),
      ]);
      setUsers(usersRes.data.users);
      setRoles(rolesRes.data.roles);
    } catch (error) {
      console.error("Failed to fetch data:", error);
      toast.error(t("failedToLoad"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleOpenModal = (user?: User) => {
    if (user) {
      setEditingUser(user);
      setFormData({
        username: user.username,
        email: user.email,
        password: "",
        fullName: user.fullName || "",
        roleId: user.roleId || "",
      });
    } else {
      setEditingUser(null);
      setFormData({
        username: "",
        email: "",
        password: "",
        fullName: "",
        roleId: roles.length > 0 ? roles[0].id : "",
      });
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingUser(null);
    setFormData({
      username: "",
      email: "",
      password: "",
      fullName: "",
      roleId: "",
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingUser) {
        // Update existing user
        await usersApi.update(editingUser.id, {
          email: formData.email,
          fullName: formData.fullName || undefined,
          roleId: formData.roleId,
          ...(formData.password && { password: formData.password }),
        });
        toast.success(t("userUpdated"));
      } else {
        // Create new user
        await usersApi.create({
          username: formData.username,
          email: formData.email,
          password: formData.password,
          fullName: formData.fullName || undefined,
          roleId: formData.roleId,
        });
        toast.success(t("userCreated"));
      }
      handleCloseModal();
      fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.error || t("failedToSave"));
    }
  };

  const handleDelete = async (userId: string) => {
    try {
      await usersApi.delete(userId);
      toast.success(t("userDeleted"));
      fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.error || t("failedToDelete"));
    }
  };

  const handleToggleActive = async (user: User) => {
    try {
      // Prevent toggling admin accounts from UI
      if (user.role === "admin") {
        toast.error(t("adminCannotDisable"));
        return;
      }
      await usersApi.update(user.id, { isActive: !user.isActive });
      toast.success(user.isActive ? t("userDisabled") : t("userEnabled"));
      fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.error || t("failedToUpdateStatus"));
    }
  };

  const openDeleteConfirm = (user: User) =>
    setConfirmModal({ action: "delete", user });
  const openToggleConfirm = (user: User) => {
    if (user.role === "admin") {
      toast.error(t("adminCannotDisable"));
      return;
    }
    setConfirmModal({ action: "toggle", user });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{t("title")}</h2>
          <p className="text-sm text-gray-500 mt-1">{t("subtitle")}</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <UserPlus className="h-4 w-4" />
          {t("addUser")}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {users.map((user) => (
          <div
            key={user.id}
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-white font-semibold text-lg">
                  {user.username.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">
                    {user.username}
                  </h3>
                  <div className="flex items-center gap-1 mt-1">
                    <Shield className="h-3 w-3 text-gray-400" />
                    <span className="text-xs text-gray-500">{user.role}</span>
                  </div>
                </div>
              </div>
              <span
                className={`px-2 py-1 text-xs font-medium rounded ${
                  user.isActive
                    ? "bg-green-100 text-green-700"
                    : "bg-gray-100 text-gray-700"
                }`}
              >
                {user.isActive ? t("active") : t("inactive")}
              </span>
            </div>

            <div className="space-y-2 pt-4 border-t border-gray-100">
              <div className="flex items-center gap-2 text-sm">
                <Mail className="h-4 w-4 text-gray-400" />
                <span className="text-gray-600">{user.email}</span>
              </div>
              {user.fullName && (
                <div className="flex items-center gap-2 text-sm">
                  <Shield className="h-4 w-4 text-gray-400" />
                  <span className="text-gray-600">{user.fullName}</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-gray-400" />
                <span className="text-gray-600">
                  {t("joined")} {formatDate(user.createdAt)}
                </span>
              </div>
              {user.lastLogin && (
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-gray-400" />
                  <span className="text-gray-600">
                    {t("lastLogin")}: {formatDate(user.lastLogin)}
                  </span>
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-auto pt-4 border-t border-gray-100">
              <button
                onClick={() => handleOpenModal(user)}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
              >
                <Edit2 className="h-4 w-4" />
                {tCommon("edit")}
              </button>
              <button
                onClick={() => openDeleteConfirm(user)}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
                {tCommon("delete")}
              </button>
              {/* Disable / Enable button for non-admin users */}
              {user.role !== "admin" && (
                <button
                  onClick={() => openToggleConfirm(user)}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                    user.isActive
                      ? "text-yellow-700 bg-yellow-50 hover:bg-yellow-100"
                      : "text-green-600 bg-green-50 hover:bg-green-100"
                  }`}
                >
                  {user.isActive ? (
                    <span className="flex items-center gap-2">
                      <X className="h-4 w-4" /> {t("disable")}
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Shield className="h-4 w-4" /> {t("enable")}
                    </span>
                  )}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">{t("loadingUsers")}</div>
        </div>
      )}

      {!loading && users.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <UserPlus className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            {t("noUsers")}
          </h3>
          <p className="text-gray-500">{t("createFirstUser")}</p>
        </div>
      )}

      {/* Add/Edit User Modal (use shared Modal component for consistent backdrop/styling) */}
      {showModal && (
        <Modal
          title={editingUser ? t("editUser") : t("addNewUser")}
          open={showModal}
          onClose={handleCloseModal}
          maxWidth="md"
          footer={
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleCloseModal}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                {tCommon("cancel")}
              </button>
              <button
                type="submit"
                form="user-form"
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                {editingUser ? tCommon("update") : tCommon("create")}
              </button>
            </div>
          }
        >
          <form id="user-form" onSubmit={handleSubmit} className="space-y-4">
            <div>
              <FormLabel required>{t("username")}</FormLabel>
              <input
                type="text"
                required
                disabled={!!editingUser}
                value={formData.username}
                onChange={(e) =>
                  setFormData({ ...formData, username: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
                placeholder={t("usernamePlaceholder")}
              />
              {editingUser && (
                <p className="mt-1 text-xs text-gray-500">
                  {t("usernameCannotChange")}
                </p>
              )}
            </div>

            <div>
              <FormLabel>{t("email")}</FormLabel>
              <input
                type="email"
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder={t("emailPlaceholder")}
              />
            </div>

            <div>
              <FormLabel>{t("fullName")}</FormLabel>
              <input
                type="text"
                value={formData.fullName}
                onChange={(e) =>
                  setFormData({ ...formData, fullName: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder={t("fullNamePlaceholder")}
              />
            </div>

            <div>
              <FormLabel required>{t("role")}</FormLabel>
              <select
                required
                value={formData.roleId}
                onChange={(e) =>
                  setFormData({ ...formData, roleId: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">{t("selectRole")}</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <FormLabel required={!editingUser}>
                {t("password")} {editingUser && t("passwordKeepCurrent")}
              </FormLabel>
              <input
                type="password"
                required={!editingUser}
                value={formData.password}
                onChange={(e) =>
                  setFormData({ ...formData, password: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder={
                  editingUser ? "••••••••" : t("passwordPlaceholder")
                }
              />
            </div>
          </form>
        </Modal>
      )}

      {/* Confirm action modal for Delete / Enable/Disable */}
      {confirmModal.action && confirmModal.user && (
        <Modal
          title={
            confirmModal.action === "delete"
              ? t("confirmDelete", { username: confirmModal.user.username })
              : t("confirmToggle", {
                  action: confirmModal.user.isActive
                    ? t("disable")
                    : t("enable"),
                  username: confirmModal.user.username,
                })
          }
          open={true}
          onClose={() => setConfirmModal({ action: null, user: null })}
          maxWidth="sm"
        >
          <div className="space-y-4">
            <p className="text-sm text-gray-700">
              {confirmModal.action === "delete"
                ? t("confirmDeleteDesc")
                : t("confirmToggleDesc", {
                    action: confirmModal.user.isActive
                      ? t("disable").toLowerCase()
                      : t("enable").toLowerCase(),
                  })}
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmModal({ action: null, user: null })}
                className="px-3 py-2 rounded bg-gray-100"
              >
                {tCommon("cancel")}
              </button>
              <button
                onClick={async () => {
                  const u = confirmModal.user;
                  const act = confirmModal.action;
                  setConfirmModal({ action: null, user: null });
                  if (!u || !act) return;
                  if (act === "delete") {
                    await handleDelete(u.id);
                  } else if (act === "toggle") {
                    await handleToggleActive(u);
                  }
                }}
                className={`px-3 py-2 rounded ${
                  confirmModal.action === "delete"
                    ? "bg-red-600 text-white"
                    : "bg-blue-600 text-white"
                }`}
              >
                {confirmModal.action === "delete"
                  ? tCommon("delete")
                  : confirmModal.user.isActive
                  ? t("disable")
                  : t("enable")}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
