# Settings Implementation Plan – Date/Time Format, Items Per Page

> **Status:** 📝 PLANNED  
> **Created:** November 26, 2025  
> **Estimated Effort:** 3-4 hours

This document outlines the implementation plan to make UI settings (Date Format, Time Format, Items Per Page) actually functional in the UNV AI Report application.

---

## 1. Executive Summary

### Current State

The Settings page has UI controls for:

- ✅ **Language** – Working (i18n switches immediately)
- ✅ **2FA** – Working (backend integrated)
- ✅ **File auto-delete** – Working (saves to backend)
- ❌ **Date Format** – UI only, not applied anywhere
- ❌ **Time Format** – UI only, not applied anywhere
- ❌ **Items Per Page** – UI only, not used in lists

### Target State

All settings should:

1. Be persisted to backend AND localStorage (for instant apply before API load)
2. Apply immediately across the entire app
3. Survive page refreshes and re-logins

---

## 2. Architecture Overview

### 2.1 State Management Strategy

```
┌─────────────────────────────────────────────────────────────┐
│                    Settings Flow                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   Backend    │◄───│ Settings     │───►│ localStorage │  │
│  │   /api/      │    │ Zustand      │    │ (persist)    │  │
│  │   settings   │    │ Store        │    │              │  │
│  └──────────────┘    └──────┬───────┘    └──────────────┘  │
│                             │                               │
│                             ▼                               │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                    React Components                   │  │
│  │  • All pages (use formatDate, formatTime helpers)    │  │
│  │  • List components (use itemsPerPage)                │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Key Design Decisions

| Decision          | Choice                       | Rationale                                   |
| ----------------- | ---------------------------- | ------------------------------------------- |
| State persistence | Zustand + persist middleware | Already using Zustand, consistent pattern   |
| Date library      | dayjs                        | Lightweight (2KB), moment.js compatible API |

---

## 3. Implementation Details

### 3.1 Phase 1: Settings Store (Zustand)

**File:** `client/src/stores/settings.ts`

```typescript
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
            dateFormat: s.dateFormat || "YYYY-MM-DD",
            timeFormat: s.timeFormat || "24h",
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
```

---

### 3.2 Phase 2: Date/Time Formatting Utilities

#### 3.2.1 Install dayjs

```bash
cd client && bun add dayjs
```

#### 3.2.2 Format Utilities

**File:** `client/src/lib/formatters.ts`

```typescript
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
  const dateFormat = useSettingsStore((s) => s.dateFormat);
  const timeFormat = useSettingsStore((s) => s.timeFormat);
  const language = useSettingsStore((s) => s.language);

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
```

#### 3.2.3 Usage in Components

```tsx
// Before
<span>{new Date(file.uploadedAt).toLocaleDateString()}</span>;

// After
import { formatDate } from "../lib/formatters";
// or use the hook for reactive updates:
import { useDateFormat } from "../lib/formatters";

function FileRow({ file }) {
  const { formatDate } = useDateFormat();

  return <span>{formatDate(file.uploadedAt)}</span>;
}
```

---

### 3.3 Phase 3: Items Per Page Implementation

#### 3.3.1 Update List Components

**Pattern for FilesPage.tsx:**

```tsx
import { useSettingsStore } from "../stores/settings";

function FilesPage() {
  const itemsPerPage = useSettingsStore((s) => s.itemsPerPage);
  const [currentPage, setCurrentPage] = useState(1);

  // Fetch with pagination
  useEffect(() => {
    fetchFiles({
      limit: itemsPerPage,
      offset: (currentPage - 1) * itemsPerPage,
    });
  }, [currentPage, itemsPerPage]);

  // Reset to page 1 when itemsPerPage changes
  useEffect(() => {
    setCurrentPage(1);
  }, [itemsPerPage]);

  // Pagination component
  return (
    <Pagination
      currentPage={currentPage}
      totalItems={totalFiles}
      itemsPerPage={itemsPerPage}
      onPageChange={setCurrentPage}
    />
  );
}
```

#### 3.3.2 Reusable Pagination Component

**File:** `client/src/components/Pagination.tsx`

```tsx
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  currentPage: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
}

export function Pagination({
  currentPage,
  totalItems,
  itemsPerPage,
  onPageChange,
}: PaginationProps) {
  const { t } = useTranslation("common");

  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-white border-t border-gray-200">
      <div className="text-sm text-gray-500">
        {t("pagination.showing", {
          start: startItem,
          end: endItem,
          total: totalItems,
        })}
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="px-3 py-1 rounded border border-gray-300 disabled:opacity-50"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <span className="px-3 py-1 text-sm text-gray-700">
          {currentPage} / {totalPages}
        </span>

        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="px-3 py-1 rounded border border-gray-300 disabled:opacity-50"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
```

---

## 4. File Changes Summary

### New Files to Create

| File                                   | Purpose                                   |
| -------------------------------------- | ----------------------------------------- |
| `client/src/stores/settings.ts`        | Zustand store for UI settings             |
| `client/src/lib/formatters.ts`         | Date/time formatting utilities with dayjs |
| `client/src/components/Pagination.tsx` | Reusable pagination component             |

### Files to Modify

| File                                | Changes                                                    |
| ----------------------------------- | ---------------------------------------------------------- |
| `client/src/App.tsx`                | Load settings on mount                                     |
| `client/src/pages/SettingsPage.tsx` | Use settings store instead of local state, remove theme UI |
| `client/src/pages/FilesPage.tsx`    | Use formatDate, itemsPerPage                               |
| `client/src/pages/DevicesPage.tsx`  | Use formatDate                                             |
| `client/src/pages/UsersPage.tsx`    | Use formatDate                                             |

### Dependencies to Add

```bash
cd client && bun add dayjs
```

---

## 5. Implementation Checklist

### Phase 1: Settings Store

- [ ] Create `stores/settings.ts` with Zustand persist
- [ ] Add types for DateFormat, TimeFormat
- [ ] Implement loadFromServer/saveToServer

### Phase 2: Date/Time Formatting

- [ ] Install dayjs: `bun add dayjs`
- [ ] Create `lib/formatters.ts` with formatDate, formatTime, formatRelativeTime
- [ ] Replace `toLocaleDateString()` in FilesPage.tsx
- [ ] Replace `toLocaleDateString()` in DevicesPage.tsx
- [ ] Replace `toLocaleDateString()` in UsersPage.tsx
- [ ] Add relative time formatting where appropriate

### Phase 3: Items Per Page

- [ ] Create Pagination component
- [ ] Add pagination to FilesPage.tsx
- [ ] Add pagination to DevicesPage.tsx (if applicable)
- [ ] Add pagination to UsersPage.tsx (if applicable)
- [ ] Add translation keys for pagination

### Phase 4: Integration & Testing

- [ ] Update SettingsPage to use settings store
- [ ] Remove theme setting UI from SettingsPage
- [ ] Remove duplicate state from SettingsPage
- [ ] Test date format changes
- [ ] Test time format changes
- [ ] Test items per page changes
- [ ] Test persistence across page reload

---

## 6. Translation Keys to Add

**`client/src/i18n/locales/en/common.json`:**

```json
{
  "pagination": {
    "showing": "Showing {{start}} to {{end}} of {{total}}",
    "page": "Page {{current}} of {{total}}",
    "previous": "Previous",
    "next": "Next",
    "first": "First",
    "last": "Last"
  }
}
```

**`client/src/i18n/locales/vi/common.json`:**

```json
{
  "pagination": {
    "showing": "Hiển thị {{start}} đến {{end}} của {{total}}",
    "page": "Trang {{current}} / {{total}}",
    "previous": "Trước",
    "next": "Tiếp",
    "first": "Đầu",
    "last": "Cuối"
  }
}
```

---

## 7. Testing Scenarios

### Date Format Tests

1. Upload a file, verify date shows in selected format
2. Change format from YYYY-MM-DD → DD/MM/YYYY, verify all dates update
3. Verify Vietnamese locale shows Vietnamese month names

### Time Format Tests

1. Verify 24h shows "14:30"
2. Verify 12h shows "2:30 PM"
3. Switch between formats and verify all times update

### Items Per Page Tests

1. With 100 files, set to 10 per page → should show 10 pages
2. Change to 50 per page → should show 2 pages
3. Navigate to page 5, change items per page → should reset to page 1

---

## 8. Future Enhancements (Out of Scope)

- [ ] Font size settings (accessibility)
- [ ] Notification sounds
- [ ] Cross-tab sync for settings changes
- [ ] Export/import settings

---

## 9. References

- [Zustand Persist Middleware](https://github.com/pmndrs/zustand/blob/main/docs/integrations/persisting-store-data.md)
- [Day.js Documentation](https://day.js.org/docs/en/installation/installation)
- [React i18next Best Practices](https://react.i18next.com/)
