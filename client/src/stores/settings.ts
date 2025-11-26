import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { settingsApi } from "../lib/api";

export type TimeFormat = "12h" | "24h";
export type DateFormat =
  | "YYYY-MM-DD"
  | "DD/MM/YYYY"
  | "MM/DD/YYYY"
  | "DD-MMM-YYYY";

interface SettingsState {
  // UI Settings
  dateFormat: DateFormat;
  timeFormat: TimeFormat;
  itemsPerPage: number;
  language: string;

  // Actions
  setDateFormat: (format: DateFormat) => void;
  setTimeFormat: (format: TimeFormat) => void;
  setItemsPerPage: (count: number) => void;
  setLanguage: (lang: string) => void;

  // Sync with backend
  loadFromServer: () => Promise<void>;
  saveToServer: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      // Defaults
      dateFormat: "YYYY-MM-DD",
      timeFormat: "24h",
      itemsPerPage: 50,
      language: "en",

      setDateFormat: (dateFormat) => {
        set({ dateFormat });
        get().saveToServer();
      },

      setTimeFormat: (timeFormat) => {
        set({ timeFormat });
        get().saveToServer();
      },

      setItemsPerPage: (itemsPerPage) => {
        set({ itemsPerPage });
        get().saveToServer();
      },

      setLanguage: (language) => {
        set({ language });
        get().saveToServer();
      },

      loadFromServer: async () => {
        try {
          const response = await settingsApi.get();
          const s = response.data.settings;
          set({
            dateFormat: (s.dateFormat as DateFormat) || "YYYY-MM-DD",
            timeFormat: (s.timeFormat as TimeFormat) || "24h",
            itemsPerPage: s.itemsPerPage || 50,
            language: s.language || "en",
          });
        } catch (error) {
          console.error("Failed to load settings from server:", error);
        }
      },

      saveToServer: async () => {
        try {
          const { dateFormat, timeFormat, itemsPerPage, language } = get();
          await settingsApi.update({
            dateFormat,
            timeFormat,
            itemsPerPage,
            language,
          });
        } catch (error) {
          console.error("Failed to save settings to server:", error);
        }
      },
    }),
    {
      name: "ui-settings",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        dateFormat: state.dateFormat,
        timeFormat: state.timeFormat,
        itemsPerPage: state.itemsPerPage,
        language: state.language,
      }),
    }
  )
);
