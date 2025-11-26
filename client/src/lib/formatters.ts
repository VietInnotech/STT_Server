import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/vi";
import "dayjs/locale/en";
import { useSettingsStore } from "../stores/settings";

// Extend dayjs with plugins
dayjs.extend(relativeTime);

// Format mapping from settings to dayjs
const DATE_FORMAT_MAP: Record<string, string> = {
  "YYYY-MM-DD": "YYYY-MM-DD",
  "DD/MM/YYYY": "DD/MM/YYYY",
  "MM/DD/YYYY": "MM/DD/YYYY",
  "DD-MMM-YYYY": "DD-MMM-YYYY",
};

const TIME_FORMAT_MAP: Record<string, string> = {
  "12h": "h:mm A",
  "24h": "HH:mm",
};

/**
 * Format a date string according to user's settings
 */
export function formatDate(
  dateInput: string | Date | null | undefined,
  options?: { includeTime?: boolean }
): string {
  if (!dateInput) return "—";

  const { dateFormat, timeFormat, language } = useSettingsStore.getState();

  const date = dayjs(dateInput).locale(language);

  if (!date.isValid()) return "—";

  const datePart = DATE_FORMAT_MAP[dateFormat] || "YYYY-MM-DD";

  if (options?.includeTime) {
    const timePart = TIME_FORMAT_MAP[timeFormat] || "HH:mm";
    return date.format(`${datePart} ${timePart}`);
  }

  return date.format(datePart);
}

/**
 * Format a time string according to user's settings
 */
export function formatTime(
  dateInput: string | Date | null | undefined
): string {
  if (!dateInput) return "—";

  const { timeFormat, language } = useSettingsStore.getState();

  const date = dayjs(dateInput).locale(language);

  if (!date.isValid()) return "—";

  const timePart = TIME_FORMAT_MAP[timeFormat] || "HH:mm";
  return date.format(timePart);
}

/**
 * Format a date as relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(
  dateInput: string | Date | null | undefined
): string {
  if (!dateInput) return "—";

  const { language } = useSettingsStore.getState();

  const date = dayjs(dateInput).locale(language);

  if (!date.isValid()) return "—";

  return date.fromNow();
}

/**
 * Format date with full datetime
 */
export function formatDateTime(
  dateInput: string | Date | null | undefined
): string {
  return formatDate(dateInput, { includeTime: true });
}

/**
 * React hook for reactive date formatting
 */
export function useDateFormat() {
  // Subscribe to settings store to ensure component re-renders when settings change
  useSettingsStore((s) => s.dateFormat);
  useSettingsStore((s) => s.timeFormat);
  useSettingsStore((s) => s.language);

  return {
    formatDate: (
      date: string | Date | null | undefined,
      opts?: { includeTime?: boolean }
    ) => formatDate(date, opts),
    formatTime: (date: string | Date | null | undefined) => formatTime(date),
    formatRelativeTime: (date: string | Date | null | undefined) =>
      formatRelativeTime(date),
    formatDateTime: (date: string | Date | null | undefined) =>
      formatDateTime(date),
  };
}
