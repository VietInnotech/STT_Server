import axios from "axios";

// API base URL - adjust based on environment
const API_BASE_URL = import.meta.env.VITE_API_URL || window.location.origin; // use browser address bar origin when VITE_API_URL not set

// Create axios instance with default config
export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true,
});

// Request interceptor - Add auth token to requests
api.interceptors.request.use(
  (config) => {
    // Get token from localStorage
    const authStorage = localStorage.getItem("auth-storage");
    if (authStorage) {
      try {
        const { state } = JSON.parse(authStorage);
        if (state?.token) {
          config.headers.Authorization = `Bearer ${state.token}`;
        }
      } catch (error) {
        console.error("Failed to parse auth storage:", error);
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - Handle errors globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      try {
        // If the user was kicked (kickedMessage present in persisted auth storage),
        // don't auto-clear or redirect — let the modal handle logout/redirect when user confirms.
        const raw = localStorage.getItem("auth-storage");
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            const kicked = parsed?.state?.kickedMessage;
            if (kicked) {
              // Ensure UI shows the kicked modal immediately (in case socket wasn't
              // identified). Set kickedMessage in the in-memory auth store.
              try {
                import("../stores/auth").then(({ useAuthStore }) => {
                  try {
                    useAuthStore.getState().setKickedMessage(kicked);
                  } catch {}
                });
              } catch {}
              // Do not auto-logout/redirect now; the UI will show a modal and handle final logout.
              return Promise.reject(error);
            }
          } catch {}
        }

        // No kickedMessage — proceed with normal 401 handling
        localStorage.removeItem("auth-storage");
        import("../stores/socket")
          .then(({ useSocketStore }) => {
            try {
              useSocketStore.getState().disconnect();
            } catch {}
          })
          .catch(() => {});
        if (window.location.pathname !== "/login") {
          window.location.href = "/login";
        }
      } catch (err) {
        // Failsafe: still remove auth and redirect
        localStorage.removeItem("auth-storage");
        if (window.location.pathname !== "/login")
          window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

// ============================================
// AUTH API
// ============================================

export interface LoginRequest {
  username: string;
  password: string;
  deviceFingerprint?: string;
}

export interface LoginResponse {
  user?: {
    id: string;
    username: string;
    email: string;
    fullName: string | null;
    role: string;
    roleId: string;
    permissions?: string[];
  };
  token?: string;
  requires2FA?: boolean;
  userId?: string;
  message?: string;
}

export interface User {
  id: string;
  username: string;
  email: string;
  fullName: string | null;
  role: string;
  roleId: string;
  isActive: boolean;
  lastLogin: string | null;
  createdAt: string;
}

export const authApi = {
  login: (data: LoginRequest) =>
    api.post<LoginResponse>("/api/auth/login", data),
  logout: () => api.post("/api/auth/logout"),
  me: () => api.get<User>("/api/auth/me"),
  changePassword: (data: { currentPassword: string; newPassword: string }) =>
    api.post("/api/auth/change-password", data),
};

// ============================================
// DEVICES API
// ============================================

export interface Device {
  id: string;
  deviceName: string;
  deviceId: string;
  ipAddress: string | null;
  macAddress: string | null;
  androidVersion: string | null;
  appVersion: string | null;
  isOnline: boolean;
  lastSeen: string;
  registeredAt: string;
  updatedAt: string;
}

export const devicesApi = {
  list: (online?: boolean) =>
    api.get<{ devices: Device[] }>(
      `/api/devices${online ? "?online=true" : ""}`
    ),
  get: (id: string) => api.get<{ device: Device }>(`/api/devices/${id}`),
  updateName: (id: string, deviceName: string) =>
    api.put(`/api/devices/${id}/name`, { deviceName }),
  delete: (id: string) => api.delete(`/api/devices/${id}`),
};

// ============================================
// FILES API
// ============================================

export interface AudioFile {
  id: string;
  filename: string;
  fileSize: number;
  mimeType: string;
  deviceId: string;
  uploadedBy: string;
  createdAt: string;
  autoDeleteAfterDays: number | null;
}

export interface TextFile {
  id: string;
  filename: string;
  fileSize: number;
  mimeType: string;
  deviceId: string;
  uploadedBy: string;
  createdAt: string;
  autoDeleteAfterDays: number | null;
}

export interface FileItem {
  id: string;
  filename: string;
  originalName?: string;
  fileSize: number;
  mimeType: string;
  deviceId?: string | null;
  uploadedById?: string | null;
  uploadedBy?: {
    id: string;
    username: string;
    fullName: string | null;
  } | null;
  uploadedAt: string;
  updatedAt?: string;
}

export interface TextFilePairItem {
  id: string;
  name?: string | null;
  summaryFileId: string;
  realtimeFileId: string;
  summaryFile?: FileItem;
  realtimeFile?: FileItem;
  uploadedById?: string | null;
  uploadedAt?: string;
  createdAt?: string;
}

export interface SourceAudioInfo {
  id: string;
  filename: string;
  fileSize: number;
  mimeType: string;
  duration: number | null;
  uploadedAt: string;
}

export interface ProcessingResultItem {
  id: string;
  title: string | null;
  templateId: string | null;
  templateName: string | null;
  summaryPreview: string | null;
  tags: string[];
  confidence: number | null;
  processingTime: number | null;
  audioDuration: number | null;
  status: "pending" | "completed" | "failed";
  uploadedBy?: {
    id: string;
    username: string;
    fullName: string | null;
  } | null;
  processedAt: string | null;
  createdAt: string;
}

export const filesApi = {
  // Audio files
  listAudio: (params?: {
    deviceId?: string;
    limit?: number;
    offset?: number;
  }) => api.get<{ files: FileItem[] }>("/api/files/audio", { params }),
  getAudio: (id: string) =>
    api.get(`/api/files/audio/${id}`, { responseType: "blob" }),
  uploadAudio: (
    file: File,
    deviceId?: string,
    deleteAfterDays?: number | null
  ) => {
    const formData = new FormData();
    formData.append("file", file);
    if (deviceId) formData.append("deviceId", deviceId);
    if (deleteAfterDays !== undefined && deleteAfterDays !== null)
      formData.append("deleteAfterDays", String(deleteAfterDays));
    return api.post<FileItem>("/api/files/audio", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  deleteAudio: (id: string) => api.delete(`/api/files/audio/${id}`),

  // Text files
  listText: (params?: { deviceId?: string; limit?: number; offset?: number }) =>
    api.get<{ files: FileItem[] }>("/api/files/text", { params }),
  getText: (id: string) =>
    api.get(`/api/files/text/${id}`, { responseType: "blob" }),
  // Upload text either as a file (web) or as an Android structured payload
  uploadText: (opts: {
    file?: File;
    androidPayload?: any;
    deviceId?: string;
    deleteAfterDays?: number | null;
  }) => {
    const { file, androidPayload, deviceId, deleteAfterDays } = opts;
    const formData = new FormData();
    if (file) formData.append("file", file);
    if (androidPayload) {
      // send as text field 'json' and mark source=android
      formData.append(
        "json",
        typeof androidPayload === "string"
          ? androidPayload
          : JSON.stringify(androidPayload)
      );
      formData.append("source", "android");
      // when androidPayload is provided but no file, set a synthetic filename
      if (!file)
        formData.append(
          "file",
          new Blob([JSON.stringify(androidPayload)], {
            type: "application/json",
          }),
          "android_payload.json"
        );
    }
    if (deviceId) formData.append("deviceId", deviceId);
    if (deleteAfterDays !== undefined && deleteAfterDays !== null)
      formData.append("deleteAfterDays", String(deleteAfterDays));
    return api.post<FileItem>("/api/files/text", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  deleteText: (id: string) => api.delete(`/api/files/text/${id}`),
  // Share files with users
  share: (
    shares: Array<{
      fileId: string;
      fileType: "audio" | "text";
      userId: string;
      expiresInDays?: number | null;
    }>
  ) => api.post("/api/files/share", { shares }),
  revokeShare: (data: { fileId: string; sharedWithId: string }) =>
    api.delete("/api/files/share", { data }),
  // Combined list (audio + text) to reduce client request count
  listAll: (params?: { deviceId?: string; limit?: number; offset?: number }) =>
    api.get<{ audio: FileItem[]; text: FileItem[] }>("/api/files/all", {
      params,
    }),
  // Text file pairs (summary + realtime)
  listPairs: (params?: { limit?: number; offset?: number }) =>
    api.get<{ pairs: TextFilePairItem[] }>("/api/files/pairs", { params }),
  getPair: (id: string) =>
    api.get<{ pair: TextFilePairItem }>(`/api/files/pairs/${id}`),
  deletePair: (id: string) => api.delete(`/api/files/pairs/${id}`),
  // WebUI upload pair (multipart)
  uploadPair: (opts: {
    summaryFile?: File;
    realtimeFile?: File;
    pairName?: string;
    deleteAfterDays?: number | null;
  }) => {
    const formData = new FormData();
    if (opts.summaryFile) formData.append("summary", opts.summaryFile);
    if (opts.realtimeFile) formData.append("realtime", opts.realtimeFile);
    if (opts.pairName) formData.append("pairName", opts.pairName);
    if (opts.deleteAfterDays !== undefined && opts.deleteAfterDays !== null)
      formData.append("deleteAfterDays", String(opts.deleteAfterDays));
    return api.post("/api/files/text-pair", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  // Android endpoint - JSON POST
  uploadPairAndroid: (payload: {
    summary: string;
    realtime: string;
    deviceId?: string;
    deleteAfterDays?: number | null;
    pairName?: string;
  }) => api.post("/api/files/text-pair-android", payload),

  // Processing Results (AI-processed results)
  listResults: (params?: {
    limit?: number;
    offset?: number;
    status?: "pending" | "completed" | "failed" | "all";
    minConfidence?: number;
    maxConfidence?: number;
    tags?: string;
    templateId?: string;
    fromDate?: string;
    toDate?: string;
    sortBy?: "date" | "title" | "confidence" | "duration";
    order?: "asc" | "desc";
  }) =>
    api.get<{
      success: boolean;
      results: ProcessingResultItem[];
      pagination: {
        total: number;
        limit: number;
        offset: number;
        hasMore: boolean;
      };
    }>("/api/files/results", { params }),

  getResult: (id: string) =>
    api.get<{
      success: boolean;
      result: ProcessingResultItem & {
        summary: string | null;
        // Full structured summary object from MAIE (varies by template)
        summaryData: {
          title?: string;
          summary?: string;
          content?: string;
          attendees?: string[];
          decisions?: string[];
          action_items?: string[];
          key_topics?: string[];
          tags?: string[];
          [key: string]: unknown; // Additional template-specific fields
        } | null;
        transcript: string | null;
        liveTranscript: string | null;
        liveTranscriptPairId: string | null;
        sourceAudioId: string | null;
        sourceAudio: SourceAudioInfo | null;
      };
    }>(`/api/files/results/${id}`),

  saveResult: (data: {
    title: string;
    summary: string;
    transcript?: string;
    templateId?: string;
    templateName?: string;
    tags?: string[];
    keyTopics?: string[];
    confidence?: number;
    processingTime?: number;
    audioDuration?: number;
    deviceId?: string;
    deleteAfterDays?: number;
    sourceAudioId?: string;
  }) =>
    api.post<{
      success: boolean;
      result: ProcessingResultItem;
    }>("/api/files/processing-result", data),

  deleteResult: (id: string) => api.delete(`/api/files/results/${id}`),

  searchResults: (params: {
    q?: string;
    tags?: string;
    templateId?: string;
    fromDate?: string;
    toDate?: string;
    minConfidence?: number;
    maxConfidence?: number;
    status?: "pending" | "completed" | "failed" | "all";
    sortBy?: "date" | "title" | "confidence" | "duration";
    order?: "asc" | "desc";
    limit?: number;
    offset?: number;
  }) =>
    api.get<{
      success: boolean;
      results: ProcessingResultItem[];
      pagination: {
        total: number;
        limit: number;
        offset: number;
        hasMore: boolean;
      };
    }>("/api/files/search", { params }),

  getTags: (params?: { limit?: number; q?: string }) =>
    api.get<{
      success: boolean;
      tags: Array<{ name: string; count: number }>;
    }>("/api/files/tags", { params }),

  // Update processing result
  updateResult: (
    id: string,
    data: {
      title?: string;
      summary?: string;
      transcript?: string;
      summaryData?: any;
      tags?: string[];
    }
  ) =>
    api.put<{ success: boolean; result: ProcessingResultItem }>(
      `/api/files/results/${id}`,
      data
    ),

  // Export processing results
  exportResultMarkdown: (id: string) =>
    api.get(`/api/files/results/${id}/markdown`, { responseType: "blob" }),
  exportResultWord: (id: string) =>
    api.get(`/api/files/results/${id}/word`, { responseType: "blob" }),
  exportResultPdf: (id: string) =>
    api.get(`/api/files/results/${id}/pdf`, { responseType: "blob" }),
};

// ============================================
// USERS API
// ============================================

export interface UserListItem {
  id: string;
  username: string;
  email: string;
  fullName: string | null;
  role: string;
  isActive: boolean;
  lastLogin: string | null;
  createdAt: string;
}

export const usersApi = {
  list: () => api.get<{ users: UserListItem[]; count: number }>("/api/users"),
  get: (id: string) => api.get<User>(`/api/users/${id}`),
  create: (data: {
    username: string;
    email: string;
    password: string;
    fullName?: string;
    roleId: string;
  }) => api.post<UserListItem>("/api/users", data),
  update: (
    id: string,
    data: Partial<UserListItem> & { password?: string; roleId?: string }
  ) => api.put<UserListItem>(`/api/users/${id}`, data),
  delete: (id: string) => api.delete(`/api/users/${id}`),
  getRoles: () =>
    api.get<{
      roles: Array<{ id: string; name: string; description: string | null }>;
    }>("/api/users/roles/list"),
  // Upload JSON template for a user (file or raw JSON text)
  uploadTemplate: (id: string, file?: File, jsonText?: string) => {
    const formData = new FormData();
    if (file) formData.append("file", file);
    if (jsonText) formData.append("json", jsonText);
    return api.post(`/api/users/${id}/template`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  // Storage quota endpoints
  getMyStorage: () =>
    api.get<{
      quotaBytes: string;
      usedBytes: string;
      availableBytes: string;
      usagePercent: number;
      quotaFormatted: string;
      usedFormatted: string;
      availableFormatted: string;
      breakdown: {
        audioBytes: string;
        textBytes: string;
        processingResultBytes: string;
      };
    }>("/api/users/storage"),
  getStorage: (id: string) =>
    api.get<{
      userId: string;
      username: string;
      quotaBytes: string;
      usedBytes: string;
      availableBytes: string;
      usagePercent: number;
      quotaFormatted: string;
      usedFormatted: string;
      availableFormatted: string;
      breakdown: {
        audioBytes: string;
        textBytes: string;
        processingResultBytes: string;
      };
    }>(`/api/users/${id}/storage`),
  updateQuota: (id: string, quotaBytes: string | number) =>
    api.put<{
      success: boolean;
      message: string;
      quotaBytes: string;
      quotaFormatted: string;
    }>(`/api/users/${id}/storage/quota`, { quotaBytes }),
};

// ============================================
// STATS API
// ============================================

export interface DashboardStats {
  devices: {
    total: number;
    online: number;
    offline: number;
  };
  files: {
    audio: number;
    text: number;
    total: number;
    uploadedToday: number;
  };
  storage: {
    total: number;
    audio: number;
    text: number;
    formatted: string;
  };
  users: {
    total: number;
  };
  activity: {
    deviceEvents24h: number;
    filesUploadedToday: number;
  };
  recentActivities: Array<{
    id: string;
    action: string;
    resource: string;
    user: string;
    userFullName: string | null;
    timestamp: string;
    success: boolean;
    details: any;
  }>;
}

export const statsApi = {
  dashboard: () => api.get<DashboardStats>("/api/stats/dashboard"),
  devicesChart: (days: number = 7) =>
    api.get<{ data: Array<{ date: string; online: number; offline: number }> }>(
      `/api/stats/devices-chart?days=${days}`
    ),
};

// ============================================
// SETTINGS API
// ============================================

export interface UserSettings {
  // File Management
  autoDeleteDays: number;
  maxFileSize: number;
  allowedAudioFormats: string[];
  allowedTextFormats: string[];

  // Audio Processing
  defaultSampleRate: number;
  defaultBitrate: number;
  defaultChannels: number;
  audioQuality: "low" | "medium" | "high" | "lossless";

  // Security
  sessionTimeout: number;
  passwordMinLength: number;
  requireStrongPassword: boolean;
  enableTwoFactor: boolean;

  // UI Preferences
  theme: "light" | "dark" | "auto";
  language: string;
  dateFormat: string;
  timeFormat: "12h" | "24h";
  itemsPerPage: number;

  // Notifications
  enableEmailNotifications: boolean;
  enablePushNotifications: boolean;
  notifyOnUpload: boolean;
  notifyOnDeviceChange: boolean;

  // System (admin only)
  enableUserRegistration?: boolean;
  requireEmailVerification?: boolean;
  maintenanceMode?: boolean;
  enableAuditLog?: boolean;
}

export const settingsApi = {
  // Get current user's settings (merged with defaults)
  get: () => api.get<{ settings: UserSettings }>("/api/settings"),

  // Update current user's settings
  update: (settings: Partial<UserSettings>) =>
    api.put<{ success: boolean; message: string }>("/api/settings", settings),

  // Get system-wide settings (admin only)
  getSystem: () => api.get<{ settings: UserSettings }>("/api/settings/system"),

  // Update system-wide settings (admin only)
  updateSystem: (settings: Partial<UserSettings>) =>
    api.put<{ success: boolean; message: string }>(
      "/api/settings/system",
      settings
    ),

  // Reset a specific setting to default
  reset: (key: string) => api.delete(`/api/settings/${key}`),

  // User preferences (excluding default template - now managed by MAIE)
  getPreferences: () =>
    api.get<{
      defaultDeleteAfterDays: number | null;
      theme: string;
      language: string;
      timezone?: string;
    }>("/api/settings/preferences"),
};

// ============================================
// TEMPLATES API (proxied to external MAIE API)
// ============================================

export interface MAIETemplate {
  id: string;
  name: string;
  description: string;
  schema_url: string;
  parameters: Record<string, any>;
  example?: Record<string, any>;
  prompt_template?: string; // detail only
  schema_data?: Record<string, any>; // detail only
}

// For creating templates (POST) - MAIE API accepts all fields
export interface CreateTemplateDTO {
  name: string;
  description: string;
  schema_data: Record<string, any>;
  prompt_template?: string;
  example?: Record<string, any>;
}

// For updating templates (PUT) - MAIE API only accepts these fields
// name/description are derived from schema_data.title and schema_data.description
export interface UpdateTemplateDTO {
  schema_data?: Record<string, any>;
  prompt_template?: string;
  example?: Record<string, any>;
}

export const templatesApi = {
  list: () => api.get<{ templates: MAIETemplate[] }>("/api/templates"),
  get: (id: string) =>
    api.get<{ template: MAIETemplate }>(`/api/templates/${id}`),
  getSchema: (id: string) =>
    api.get<{ schema: Record<string, any> }>(`/api/templates/${id}/schema`),
  create: (data: CreateTemplateDTO) =>
    api.post<{ template: MAIETemplate }>("/api/templates", data),
  update: (id: string, data: UpdateTemplateDTO) =>
    api.put<{ template: MAIETemplate }>(`/api/templates/${id}`, data),
  delete: (id: string) => api.delete(`/api/templates/${id}`),
};

// ============================================
// ROLES API
// ============================================

export interface Role {
  id: string;
  name: string;
  description: string | null;
  permissions: string[];
  userCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PermissionsResponse {
  permissions: string[];
  categories: Record<string, string[]>;
}

export interface CreateRoleRequest {
  name: string;
  description?: string;
  permissions: string[];
}

export interface UpdateRoleRequest {
  description?: string;
  permissions?: string[];
}

export const rolesApi = {
  // List all roles with user counts
  list: () => api.get<{ roles: Role[] }>("/api/roles"),

  // Get single role by ID
  get: (id: string) => api.get<Role>(`/api/roles/${id}`),

  // Get all available permissions organized by category
  getPermissions: () => api.get<PermissionsResponse>("/api/roles/permissions"),

  // Create new role
  create: (data: CreateRoleRequest) => api.post<Role>("/api/roles", data),

  // Update existing role
  update: (id: string, data: UpdateRoleRequest) =>
    api.put<Role>(`/api/roles/${id}`, data),

  // Delete role
  delete: (id: string) => api.delete(`/api/roles/${id}`),
};

export default api;
