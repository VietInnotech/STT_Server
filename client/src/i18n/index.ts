import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

// English translations
import enCommon from "./locales/en/common.json";
import enAuth from "./locales/en/auth.json";
import enDashboard from "./locales/en/dashboard.json";
import enDevices from "./locales/en/devices.json";
import enFiles from "./locales/en/files.json";
import enTemplates from "./locales/en/templates.json";
import enUsers from "./locales/en/users.json";
import enSettings from "./locales/en/settings.json";
import enRoles from "./locales/en/roles.json";

// Vietnamese translations
import viCommon from "./locales/vi/common.json";
import viAuth from "./locales/vi/auth.json";
import viDashboard from "./locales/vi/dashboard.json";
import viDevices from "./locales/vi/devices.json";
import viFiles from "./locales/vi/files.json";
import viTemplates from "./locales/vi/templates.json";
import viUsers from "./locales/vi/users.json";
import viSettings from "./locales/vi/settings.json";
import viRoles from "./locales/vi/roles.json";

const resources = {
  en: {
    common: enCommon,
    auth: enAuth,
    dashboard: enDashboard,
    devices: enDevices,
    files: enFiles,
    templates: enTemplates,
    users: enUsers,
    settings: enSettings,
    roles: enRoles,
  },
  vi: {
    common: viCommon,
    auth: viAuth,
    dashboard: viDashboard,
    devices: viDevices,
    files: viFiles,
    templates: viTemplates,
    users: viUsers,
    settings: viSettings,
    roles: viRoles,
  },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: "en",
    defaultNS: "common",
    ns: [
      "common",
      "auth",
      "dashboard",
      "devices",
      "files",
      "templates",
      "users",
      "settings",
      "roles",
    ],
    interpolation: {
      escapeValue: false, // React already escapes
    },
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: "i18nextLng",
    },
  });

export default i18n;
