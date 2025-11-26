import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Save,
  RotateCcw,
  User,
  FileText,
  Shield,
  Settings as SettingsIcon,
  Bell,
} from "lucide-react";
import { settingsApi, type UserSettings, api } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import {
  useSettingsStore,
  type DateFormat,
  type TimeFormat,
} from "../stores/settings";
import toast from "react-hot-toast";
import TwoFactorSetupModal from "../components/TwoFactorSetupModal";
import Modal from "../components/Modal";

type TabType = "profile" | "files" | "security" | "ui" | "notifications";

export default function SettingsPage() {
  const { t, i18n } = useTranslation("settings");
  const { t: tCommon } = useTranslation("common");
  const [activeTab, setActiveTab] = useState<TabType>("profile");
  const [settings, setSettings] = useState<Partial<UserSettings>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const user = useAuthStore((state) => state.user);
  const isAdmin = user?.role === "admin";

  // Settings store
  const dateFormat = useSettingsStore((s) => s.dateFormat);
  const timeFormat = useSettingsStore((s) => s.timeFormat);
  const itemsPerPage = useSettingsStore((s) => s.itemsPerPage);
  const setDateFormat = useSettingsStore((s) => s.setDateFormat);
  const setTimeFormat = useSettingsStore((s) => s.setTimeFormat);
  const setItemsPerPage = useSettingsStore((s) => s.setItemsPerPage);
  const setLanguageInStore = useSettingsStore((s) => s.setLanguage);

  // 2FA state
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [showTwoFactorSetup, setShowTwoFactorSetup] = useState(false);
  const [showDisable2FAModal, setShowDisable2FAModal] = useState(false);
  const [disablePassword, setDisablePassword] = useState("");
  const [disabling2FA, setDisabling2FA] = useState(false);

  // User preferences state
  const [defaultDeleteAfterDays, setDefaultDeleteAfterDays] = useState<
    number | null
  >(null);
  const [savingPreferences, setSavingPreferences] = useState(false);

  // Fetch settings and 2FA status on mount
  useEffect(() => {
    fetchSettings();
    fetch2FAStatus();
    fetchUserPreferences();
  }, []);

  // Sync i18n language with stored language preference on mount
  useEffect(() => {
    const storedLanguage = useSettingsStore.getState().language;
    if (storedLanguage && storedLanguage !== i18n.language) {
      i18n.changeLanguage(storedLanguage);
    }
  }, [i18n]);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const response = await settingsApi.get();
      setSettings(response.data.settings);
    } catch (error) {
      toast.error(t("failedToLoad"));
      console.error("Error loading settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetch2FAStatus = async () => {
    try {
      const response = await api.get("/api/auth/2fa/status");
      setTwoFactorEnabled(response.data.totpEnabled);
    } catch (error) {
      console.error("Error fetching 2FA status:", error);
    }
  };

  const fetchUserPreferences = async () => {
    try {
      const response = await api.get("/api/settings/preferences");
      setDefaultDeleteAfterDays(response.data.defaultDeleteAfterDays);
    } catch (error) {
      console.error("Error fetching user preferences:", error);
    }
  };

  const saveUserPreferences = async () => {
    try {
      setSavingPreferences(true);
      await api.put("/api/settings/preferences", {
        defaultDeleteAfterDays: defaultDeleteAfterDays,
      });
      toast.success(t("files.preferencesSaved"));
    } catch (error: any) {
      toast.error(
        error.response?.data?.error || t("files.failedToSavePreferences")
      );
      console.error("Error saving preferences:", error);
    } finally {
      setSavingPreferences(false);
    }
  };

  const handleToggle2FA = () => {
    if (twoFactorEnabled) {
      setShowDisable2FAModal(true);
    } else {
      setShowTwoFactorSetup(true);
    }
  };

  const handleDisable2FA = async () => {
    try {
      setDisabling2FA(true);
      await api.post("/api/auth/2fa/disable", { password: disablePassword });
      setTwoFactorEnabled(false);
      setShowDisable2FAModal(false);
      setDisablePassword("");
      toast.success(t("security.twoFactor.disabled"));
    } catch (error: any) {
      toast.error(
        error.response?.data?.error || t("security.twoFactor.failedToDisable")
      );
    } finally {
      setDisabling2FA(false);
    }
  };

  const handle2FASetupSuccess = () => {
    setTwoFactorEnabled(true);
    setShowTwoFactorSetup(false);
    toast.success(t("security.twoFactor.enabled"));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await settingsApi.update(settings);
      toast.success(t("settingsSaved"));
    } catch (error) {
      toast.error(t("failedToSave"));
      console.error("Error saving settings:", error);
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = (key: keyof UserSettings, value: any) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const tabs = [
    { id: "profile" as TabType, label: t("tabs.profile"), icon: User },
    { id: "files" as TabType, label: t("tabs.files"), icon: FileText },
    { id: "security" as TabType, label: t("tabs.security"), icon: Shield },
    { id: "ui" as TabType, label: t("tabs.ui"), icon: SettingsIcon },
    {
      id: "notifications" as TabType,
      label: t("tabs.notifications"),
      icon: Bell,
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{t("title")}</h1>
          <p className="mt-1 text-sm text-gray-500">{t("subtitle")}</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => fetchSettings()}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            {t("reload")}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
          >
            <Save className="h-4 w-4 mr-2" />
            {saving ? t("saving") : t("saveChanges")}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex items-center py-4 px-1 border-b-2 font-medium text-sm
                  ${
                    activeTab === tab.id
                      ? "border-blue-500 text-blue-600"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  }
                `}
              >
                <Icon className="h-5 w-5 mr-2" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Content */}
      <div className="bg-white shadow rounded-lg p-6">
        {/* Profile Tab */}
        {activeTab === "profile" && (
          <div className="space-y-6">
            <h2 className="text-lg font-medium text-gray-900">
              {t("profile.title")}
            </h2>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  {t("profile.username")}
                </label>
                <input
                  type="text"
                  value={user?.username || ""}
                  disabled
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-gray-50 text-gray-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  {t("profile.email")}
                </label>
                <input
                  type="email"
                  value={user?.email || ""}
                  disabled
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-gray-50 text-gray-500"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700">
                  {t("profile.fullName")}
                </label>
                <input
                  type="text"
                  value={user?.fullName || ""}
                  disabled
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-gray-50 text-gray-500"
                />
                <p className="mt-1 text-xs text-gray-500">
                  {t("profile.contactAdmin")}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Files Tab */}
        {activeTab === "files" && (
          <div className="space-y-6">
            <h2 className="text-lg font-medium text-gray-900">
              {t("files.title")}
            </h2>

            <div className="space-y-6">
              {/* User-specific preference (simplified inline) */}
              <div className="p-0">
                <h3 className="text-sm font-semibold text-gray-900 mb-2">
                  {t("files.yourDefaultSetting")}
                </h3>
                <div className="mb-3">
                  <label className="block text-sm font-medium text-gray-700">
                    {t("files.defaultAutoDelete")}
                  </label>
                  <div className="flex gap-3 items-start mt-2">
                    <div className="flex-1">
                      <input
                        type="number"
                        min="1"
                        max="365"
                        value={defaultDeleteAfterDays || ""}
                        onChange={(e) =>
                          setDefaultDeleteAfterDays(
                            e.target.value ? parseInt(e.target.value) : null
                          )
                        }
                        placeholder={t("files.neverDelete")}
                        className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                      />
                      <p className="mt-1 text-xs text-gray-600">
                        {defaultDeleteAfterDays
                          ? t("files.willBeDeleted", {
                              days: defaultDeleteAfterDays,
                            })
                          : t("files.leaveEmpty")}
                      </p>
                    </div>
                    <button
                      onClick={saveUserPreferences}
                      disabled={savingPreferences}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
                    >
                      {savingPreferences ? t("saving") : tCommon("save")}
                    </button>
                  </div>
                </div>
                <p className="text-xs text-gray-600">
                  <strong>{tCommon("note", "Note")}:</strong>{" "}
                  {t("files.personalNote")}
                </p>
              </div>

              {/* System-wide settings (admin only) */}
              {isAdmin && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">
                    {t("files.systemWideSettings")}
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        {t("files.systemDefaultAutoDelete")}
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="365"
                        value={settings.autoDeleteDays || 30}
                        onChange={(e) =>
                          updateSetting(
                            "autoDeleteDays",
                            parseInt(e.target.value)
                          )
                        }
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        {t("files.adminOnly")}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  {t("files.maxFileSize")}
                </label>
                <input
                  type="number"
                  min="1"
                  max="500"
                  value={settings.maxFileSize || 50}
                  onChange={(e) =>
                    updateSetting("maxFileSize", parseInt(e.target.value))
                  }
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                />
                <p className="mt-1 text-xs text-gray-500">
                  {t("files.maxFileSizeDesc")}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  {t("files.allowedTextFormats")}
                </label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {["txt", "log", "json", "csv", "xml"].map((format) => (
                    <label key={format} className="inline-flex items-center">
                      <input
                        type="checkbox"
                        checked={
                          settings.allowedTextFormats?.includes(format) || false
                        }
                        onChange={(e) => {
                          const formats = settings.allowedTextFormats || [];
                          updateSetting(
                            "allowedTextFormats",
                            e.target.checked
                              ? [...formats, format]
                              : formats.filter((f) => f !== format)
                          );
                        }}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="ml-2 text-sm text-gray-700">
                        .{format}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Security Tab */}
        {activeTab === "security" && (
          <div className="space-y-6">
            <h2 className="text-lg font-medium text-gray-900">
              {t("security.title")}
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  {t("security.sessionTimeout")}
                </label>
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={settings.sessionTimeout || 7}
                  onChange={(e) =>
                    updateSetting("sessionTimeout", parseInt(e.target.value))
                  }
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                />
                <p className="mt-1 text-xs text-gray-500">
                  {t("security.sessionTimeoutDesc")}
                </p>
              </div>

              {isAdmin && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      {t("security.minPasswordLength")}
                    </label>
                    <input
                      type="number"
                      min="6"
                      max="32"
                      value={settings.passwordMinLength || 6}
                      onChange={(e) =>
                        updateSetting(
                          "passwordMinLength",
                          parseInt(e.target.value)
                        )
                      }
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      checked={settings.requireStrongPassword || false}
                      onChange={(e) =>
                        updateSetting("requireStrongPassword", e.target.checked)
                      }
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <label className="ml-2 block text-sm text-gray-700">
                      {t("security.requireStrongPassword")}
                    </label>
                  </div>

                  <div className="mt-4 border-t pt-4">
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        checked={settings.enableAuditLog !== false}
                        onChange={(e) =>
                          updateSetting("enableAuditLog", e.target.checked)
                        }
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <label className="ml-2 block text-sm text-gray-700">
                        {t("security.enableAuditLog")}
                      </label>
                    </div>

                    <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
                      <p className="text-sm text-blue-800">
                        <strong>{tCommon("note", "Note")}:</strong>{" "}
                        {t("security.auditLogNote")}
                      </p>
                    </div>
                  </div>
                </>
              )}

              <div className="border-t pt-4">
                <h3 className="text-md font-medium text-gray-900 mb-4">
                  {t("security.twoFactor.title")}
                </h3>
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-md">
                  <div className="flex-1">
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        checked={twoFactorEnabled}
                        onChange={handleToggle2FA}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <label className="ml-2 block text-sm font-medium text-gray-700">
                        {t("security.twoFactor.enable")}
                      </label>
                    </div>
                    <p className="mt-1 ml-6 text-xs text-gray-500">
                      {t("security.twoFactor.description")}
                    </p>
                  </div>
                  {twoFactorEnabled && (
                    <span className="ml-4 px-2 py-1 text-xs font-semibold text-green-800 bg-green-100 rounded-full">
                      {t("security.twoFactor.active")}
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-6 pt-6 border-t border-gray-200">
                <h3 className="text-sm font-medium text-gray-900 mb-4">
                  {t("security.changePassword.title")}
                </h3>
                <p className="text-sm text-gray-500">
                  {t("security.changePassword.description")}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* UI & Display Tab */}
        {activeTab === "ui" && (
          <div className="space-y-6">
            <h2 className="text-lg font-medium text-gray-900">
              {t("ui.title")}
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  {t("ui.language")}
                </label>
                <select
                  value={i18n.language}
                  onChange={(e) => {
                    const newLang = e.target.value;
                    i18n.changeLanguage(newLang);
                    setLanguageInStore(newLang);
                  }}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="en">🇬🇧 English</option>
                  <option value="vi">🇻🇳 Tiếng Việt</option>
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  {t("ui.languageHint")}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  {t("ui.dateFormat")}
                </label>
                <select
                  value={dateFormat}
                  onChange={(e) => setDateFormat(e.target.value as DateFormat)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="YYYY-MM-DD">YYYY-MM-DD (2025-10-07)</option>
                  <option value="DD/MM/YYYY">DD/MM/YYYY (07/10/2025)</option>
                  <option value="MM/DD/YYYY">MM/DD/YYYY (10/07/2025)</option>
                  <option value="DD-MMM-YYYY">DD-MMM-YYYY (07-Oct-2025)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  {t("ui.timeFormat")}
                </label>
                <select
                  value={timeFormat}
                  onChange={(e) => setTimeFormat(e.target.value as TimeFormat)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="12h">{t("ui.time12h")}</option>
                  <option value="24h">{t("ui.time24h")}</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  {t("ui.itemsPerPage")}
                </label>
                <select
                  value={itemsPerPage}
                  onChange={(e) => setItemsPerPage(parseInt(e.target.value))}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Notifications Tab */}
        {activeTab === "notifications" && (
          <div className="space-y-6">
            <h2 className="text-lg font-medium text-gray-900">
              {t("notifications.title")}
            </h2>

            <div className="space-y-4">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={settings.enableEmailNotifications || false}
                  onChange={(e) =>
                    updateSetting("enableEmailNotifications", e.target.checked)
                  }
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <label className="ml-2 block text-sm text-gray-700">
                  {t("notifications.enableEmail")}
                </label>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={settings.enablePushNotifications || false}
                  onChange={(e) =>
                    updateSetting("enablePushNotifications", e.target.checked)
                  }
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <label className="ml-2 block text-sm text-gray-700">
                  {t("notifications.enablePush")}
                </label>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={settings.notifyOnUpload !== false}
                  onChange={(e) =>
                    updateSetting("notifyOnUpload", e.target.checked)
                  }
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <label className="ml-2 block text-sm text-gray-700">
                  {t("notifications.notifyOnUpload")}
                </label>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={settings.notifyOnDeviceChange !== false}
                  onChange={(e) =>
                    updateSetting("notifyOnDeviceChange", e.target.checked)
                  }
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <label className="ml-2 block text-sm text-gray-700">
                  {t("notifications.notifyOnDeviceChange")}
                </label>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 2FA Setup Modal */}
      <TwoFactorSetupModal
        isOpen={showTwoFactorSetup}
        onClose={() => setShowTwoFactorSetup(false)}
        onSuccess={handle2FASetupSuccess}
      />

      {/* 2FA Disable Confirmation Modal */}
      <Modal
        isOpen={showDisable2FAModal}
        onClose={() => {
          setShowDisable2FAModal(false);
          setDisablePassword("");
        }}
        title={t("security.twoFactor.disableTitle")}
        maxWidth="md"
        footer={
          <div className="flex justify-end space-x-3">
            <button
              onClick={() => {
                setShowDisable2FAModal(false);
                setDisablePassword("");
              }}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              {tCommon("cancel")}
            </button>
            <button
              onClick={handleDisable2FA}
              disabled={disabling2FA || !disablePassword}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {disabling2FA
                ? t("security.twoFactor.disabling")
                : t("security.twoFactor.disable2FA")}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
            <p className="text-sm text-yellow-800">
              ⚠️ {t("security.twoFactor.disableWarning")}
            </p>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              {t("security.twoFactor.confirmPassword")}
            </label>
            <input
              type="password"
              value={disablePassword}
              onChange={(e) => setDisablePassword(e.target.value)}
              placeholder={t("security.twoFactor.enterPassword")}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
