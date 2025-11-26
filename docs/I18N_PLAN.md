# Internationalization (i18n) Plan – Vietnamese & English Support

> **Status: ✅ IMPLEMENTED** (November 2025)

This document outlines the plan to add multi-language support (Vietnamese and English) to the UNV AI Report frontend application.

---

## 1. Overview

### Goals
- Support **English (en)** and **Vietnamese (vi)** languages
- Allow users to switch languages from the Settings page (already has a language dropdown)
- Persist language preference in user settings
- Provide a clean, maintainable translation system

### Scope
- All frontend UI text in `client/src/`
- Pages: Login, Dashboard, Devices, Files, Templates, Users, Settings
- Components: Layout, Modal, ShareFilesModal, TwoFactorModals, etc.
- Toast messages and error messages

---

## 2. Technical Approach

### 2.1 Library Selection: `react-i18next`

We will use **react-i18next** – the most popular React internationalization library.

**Why react-i18next?**
- Mature, well-maintained, widely used
- Simple API with hooks (`useTranslation`)
- Supports namespace separation (organize translations by feature)
- Built-in language detection and persistence
- Lightweight and performant

**Installation:**
```bash
# Install at monorepo root (dependencies are shared)
bun add i18next react-i18next i18next-browser-languagedetector
```

### 2.2 Project Structure

```
client/src/
├── i18n/
│   ├── index.ts              # i18n configuration
│   ├── locales/
│   │   ├── en/
│   │   │   ├── common.json   # Shared translations (buttons, labels)
│   │   │   ├── auth.json     # Login, 2FA
│   │   │   ├── dashboard.json
│   │   │   ├── devices.json
│   │   │   ├── files.json
│   │   │   ├── templates.json
│   │   │   ├── users.json
│   │   │   └── settings.json
│   │   └── vi/
│   │       ├── common.json
│   │       ├── auth.json
│   │       ├── dashboard.json
│   │       ├── devices.json
│   │       ├── files.json
│   │       ├── templates.json
│   │       ├── users.json
│   │       └── settings.json
```

---

## 3. Implementation Steps

### Phase 1: Setup i18n Infrastructure

#### Step 1.1: Install dependencies
```bash
cd client && bun add i18next react-i18next i18next-browser-languagedetector
```

#### Step 1.2: Create i18n configuration (`client/src/i18n/index.ts`)
```typescript
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

// Import translations
import enCommon from './locales/en/common.json'
import enAuth from './locales/en/auth.json'
import enDashboard from './locales/en/dashboard.json'
import enDevices from './locales/en/devices.json'
import enFiles from './locales/en/files.json'
import enTemplates from './locales/en/templates.json'
import enUsers from './locales/en/users.json'
import enSettings from './locales/en/settings.json'

import viCommon from './locales/vi/common.json'
import viAuth from './locales/vi/auth.json'
import viDashboard from './locales/vi/dashboard.json'
import viDevices from './locales/vi/devices.json'
import viFiles from './locales/vi/files.json'
import viTemplates from './locales/vi/templates.json'
import viUsers from './locales/vi/users.json'
import viSettings from './locales/vi/settings.json'

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
  },
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    defaultNS: 'common',
    ns: ['common', 'auth', 'dashboard', 'devices', 'files', 'templates', 'users', 'settings'],
    interpolation: {
      escapeValue: false, // React already escapes
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'i18nextLng',
    },
  })

export default i18n
```

#### Step 1.3: Initialize i18n in `main.tsx`
```typescript
import './i18n'  // Add this import at the top
```

---

### Phase 2: Create Translation Files

#### Step 2.1: English Translations

**`client/src/i18n/locales/en/common.json`**
```json
{
  "appName": "UNV AI Report",
  "loading": "Loading...",
  "save": "Save",
  "cancel": "Cancel",
  "delete": "Delete",
  "edit": "Edit",
  "close": "Close",
  "confirm": "Confirm",
  "yes": "Yes",
  "no": "No",
  "ok": "OK",
  "error": "Error",
  "success": "Success",
  "search": "Search",
  "upload": "Upload",
  "download": "Download",
  "refresh": "Refresh",
  "actions": "Actions",
  "status": "Status",
  "online": "Online",
  "offline": "Offline",
  "noData": "No data available",
  "logout": "Logout",
  "loggedOut": "Logged out"
}
```

**`client/src/i18n/locales/en/auth.json`**
```json
{
  "title": "UNV AI Report",
  "subtitle": "Local Administration Panel",
  "username": "Username",
  "password": "Password",
  "enterUsername": "Enter username",
  "enterPassword": "Enter password",
  "signIn": "Sign in",
  "signingIn": "Signing in...",
  "loginSuccess": "Login successful!",
  "loginFailed": "Login failed",
  "invalidResponse": "Invalid login response",
  "twoFactor": {
    "title": "Two-Factor Authentication",
    "enterCode": "Enter verification code",
    "verify": "Verify",
    "verifying": "Verifying...",
    "invalidCode": "Invalid verification code",
    "required": "2FA verification required"
  }
}
```

**`client/src/i18n/locales/en/dashboard.json`**
```json
{
  "title": "Dashboard",
  "totalDevices": "Total Devices",
  "onlineDevices": "Online Devices",
  "totalFiles": "Total Files",
  "storageUsed": "Storage Used",
  "filesUploadedToday": "Files Uploaded Today",
  "deviceEvents24h": "Device Events (24h)",
  "totalUsers": "Total Users",
  "recentActivity": "Recent Activity",
  "noRecentActivity": "No recent activity",
  "loadingDashboard": "Loading dashboard...",
  "failedToLoadStats": "Failed to load dashboard statistics"
}
```

**`client/src/i18n/locales/en/devices.json`**
```json
{
  "title": "Devices",
  "subtitle": "Real-time connected devices",
  "onlineCount": "{{online}} online, {{total}} total",
  "noDevices": "No devices connected",
  "noDevicesDesc": "Devices will appear here when they connect via Socket.IO",
  "deviceType": "Device Type",
  "lastSeen": "Last Seen",
  "now": "Now",
  "justNow": "Just now",
  "minutesAgo": "{{count}} minute ago",
  "minutesAgo_plural": "{{count}} minutes ago",
  "hoursAgo": "{{count}} hour ago",
  "hoursAgo_plural": "{{count}} hours ago",
  "daysAgo": "{{count}} day ago",
  "daysAgo_plural": "{{count}} days ago",
  "rename": "Rename",
  "enterDeviceName": "Enter device name",
  "deviceRenamed": "Device renamed successfully",
  "failedToRename": "Failed to rename device",
  "failedToLoad": "Failed to load devices",
  "android": "Android",
  "browser": "Browser"
}
```

**`client/src/i18n/locales/en/files.json`**
```json
{
  "title": "Files",
  "subtitle": "Manage encrypted audio recordings and transcripts",
  "uploadAudio": "Upload Audio",
  "uploadText": "Upload Text",
  "share": "Share",
  "searchFiles": "Search files...",
  "noFiles": "No files found. Upload your first file!",
  "file": "File",
  "size": "Size",
  "uploadedBy": "Uploaded By",
  "deleteAfterDays": "Delete after (days)",
  "uploaded": "Uploaded",
  "shared": "Shared",
  "sharedWith": "Shared with {{count}} user(s)",
  "compare": "Compare",
  "summary": "Summary",
  "realtime": "Realtime",
  "pairView": "Pair View",
  "viewFile": "View File",
  "autoDeleteDays": "Auto-delete after (days)",
  "leaveEmptyDefault": "Leave empty for default/never",
  "personalDefaultNote": "If left empty, your personal default (or system default) will be applied.",
  "uploading": "Uploading...",
  "fileUploaded": "{{type}} file uploaded successfully",
  "failedToUpload": "Failed to upload file",
  "fileDownloaded": "File downloaded",
  "failedToDownload": "Failed to download file",
  "fileDeleted": "File deleted",
  "failedToDelete": "Failed to delete file",
  "confirmDelete": "Delete {{filename}}?",
  "failedToFetch": "Failed to fetch files",
  "tooManyRequests": "Too many requests — try again in a few minutes",
  "failedToOpenViewer": "Failed to open viewer",
  "revokeShare": "Revoke share for this user?",
  "shareRevoked": "Share revoked",
  "failedToRevoke": "Failed to revoke share",
  "noSharesSelected": "No recipients selected",
  "revokeSelected": "Revoke selected",
  "sharedRecipients": "Shared recipients for {{filename}}",
  "noExpiry": "No expiry",
  "expires": "Expires: {{date}}",
  "days": "{{count}} days",
  "none": "None",
  "androidPayload": "Android payload",
  "uploadedText": "Uploaded text (decrypted)",
  "noAndroidPayload": "No android payload",
  "noDecryptedContent": "No decrypted content available",
  "noContent": "No content",
  "pairDownloaded": "Pair files downloaded",
  "invalidAudioFile": "Please select a valid audio file (wav, mp3, ogg, webm, m4a, aac, flac)",
  "invalidTextFile": "Please select a valid text file (.txt, .log, .json, .csv, .xml)"
}
```

**`client/src/i18n/locales/en/templates.json`**
```json
{
  "title": "Templates",
  "subtitle": "Manage report templates",
  "createTemplate": "Create Template",
  "editTemplate": "Edit Template",
  "deleteTemplate": "Delete Template",
  "templateName": "Template Name",
  "description": "Description",
  "preview": "Preview",
  "noTemplates": "No templates found",
  "confirmDelete": "Are you sure you want to delete this template?",
  "templateCreated": "Template created successfully",
  "templateUpdated": "Template updated successfully",
  "templateDeleted": "Template deleted successfully",
  "failedToCreate": "Failed to create template",
  "failedToUpdate": "Failed to update template",
  "failedToDelete": "Failed to delete template",
  "failedToLoad": "Failed to load templates"
}
```

**`client/src/i18n/locales/en/users.json`**
```json
{
  "title": "Users",
  "subtitle": "Manage user accounts and permissions",
  "createUser": "Create User",
  "editUser": "Edit User",
  "deleteUser": "Delete User",
  "username": "Username",
  "email": "Email",
  "fullName": "Full Name",
  "role": "Role",
  "admin": "Admin",
  "user": "User",
  "createdAt": "Created",
  "noUsers": "No users found",
  "confirmDelete": "Are you sure you want to delete user {{username}}?",
  "userCreated": "User created successfully",
  "userUpdated": "User updated successfully",
  "userDeleted": "User deleted successfully",
  "failedToCreate": "Failed to create user",
  "failedToUpdate": "Failed to update user",
  "failedToDelete": "Failed to delete user",
  "failedToLoad": "Failed to load users"
}
```

**`client/src/i18n/locales/en/settings.json`**
```json
{
  "title": "Settings",
  "subtitle": "Manage your preferences and system configuration",
  "reload": "Reload",
  "saveChanges": "Save Changes",
  "saving": "Saving...",
  "settingsSaved": "Settings saved successfully",
  "failedToSave": "Failed to save settings",
  "failedToLoad": "Failed to load settings",
  "tabs": {
    "profile": "Profile",
    "files": "Files",
    "security": "Security",
    "ui": "UI & Display",
    "notifications": "Notifications"
  },
  "profile": {
    "title": "User Profile",
    "username": "Username",
    "email": "Email",
    "fullName": "Full Name",
    "contactAdmin": "Contact your administrator to update profile information"
  },
  "files": {
    "title": "File Management",
    "yourDefaultSetting": "Your Default Auto-Delete Setting",
    "defaultAutoDelete": "Default auto-delete period for your uploads (days)",
    "neverDelete": "Never delete (leave empty)",
    "willBeDeleted": "Your files will be auto-deleted after {{days}} days by default",
    "leaveEmpty": "Leave empty to never auto-delete your files (you can override per upload)",
    "personalNote": "This is your personal default. When you upload files, they will use this setting automatically unless you specify a different value during upload.",
    "preferencesSaved": "Preferences saved successfully",
    "failedToSavePreferences": "Failed to save preferences",
    "systemWideSettings": "System-Wide Settings",
    "systemDefaultAutoDelete": "System default auto-delete (days)",
    "adminOnly": "System-wide default (admin only)",
    "maxFileSize": "Maximum file size (MB)",
    "maxFileSizeDesc": "Maximum size for uploaded files",
    "allowedTextFormats": "Allowed text formats"
  },
  "security": {
    "title": "Security Settings",
    "sessionTimeout": "Session timeout (days)",
    "sessionTimeoutDesc": "How long to stay logged in before requiring re-authentication",
    "minPasswordLength": "Minimum password length",
    "requireStrongPassword": "Require strong passwords (uppercase, lowercase, number, special character)",
    "enableAuditLog": "Enable audit logging (admin only)",
    "auditLogNote": "Audit logs are permanent and cannot be automatically deleted. Only uploaded files can be set to auto-delete after N days in the Files settings.",
    "twoFactor": {
      "title": "Two-Factor Authentication (2FA)",
      "enable": "Enable two-factor authentication (2FA)",
      "description": "Add an extra layer of security by requiring a code from your authenticator app. You'll be asked to verify once per new device.",
      "active": "Active",
      "enabled": "2FA enabled successfully!",
      "disabled": "2FA disabled successfully",
      "failedToDisable": "Failed to disable 2FA",
      "disableTitle": "Disable Two-Factor Authentication",
      "disableWarning": "Disabling 2FA will make your account less secure. Are you sure you want to continue?",
      "confirmPassword": "Confirm your password",
      "enterPassword": "Enter your password",
      "disabling": "Disabling..."
    },
    "changePassword": {
      "title": "Change Password",
      "description": "To change your password, please contact your administrator or use the password change feature in your profile menu."
    }
  },
  "ui": {
    "title": "UI & Display Preferences",
    "theme": "Theme",
    "light": "Light",
    "dark": "Dark",
    "auto": "Auto (system preference)",
    "language": "Language",
    "english": "English",
    "vietnamese": "Tiếng Việt",
    "dateFormat": "Date format",
    "timeFormat": "Time format",
    "12hour": "12-hour (2:30 PM)",
    "24hour": "24-hour (14:30)",
    "itemsPerPage": "Items per page"
  },
  "notifications": {
    "title": "Notification Preferences",
    "enableEmail": "Enable email notifications",
    "enablePush": "Enable push notifications",
    "notifyOnUpload": "Notify on file upload",
    "notifyOnDeviceChange": "Notify on device status change"
  }
}
```

#### Step 2.2: Vietnamese Translations

**`client/src/i18n/locales/vi/common.json`**
```json
{
  "appName": "UNV AI Report",
  "loading": "Đang tải...",
  "save": "Lưu",
  "cancel": "Hủy",
  "delete": "Xóa",
  "edit": "Sửa",
  "close": "Đóng",
  "confirm": "Xác nhận",
  "yes": "Có",
  "no": "Không",
  "ok": "OK",
  "error": "Lỗi",
  "success": "Thành công",
  "search": "Tìm kiếm",
  "upload": "Tải lên",
  "download": "Tải xuống",
  "refresh": "Làm mới",
  "actions": "Thao tác",
  "status": "Trạng thái",
  "online": "Trực tuyến",
  "offline": "Ngoại tuyến",
  "noData": "Không có dữ liệu",
  "logout": "Đăng xuất",
  "loggedOut": "Đã đăng xuất"
}
```

**`client/src/i18n/locales/vi/auth.json`**
```json
{
  "title": "UNV AI Report",
  "subtitle": "Bảng quản trị nội bộ",
  "username": "Tên đăng nhập",
  "password": "Mật khẩu",
  "enterUsername": "Nhập tên đăng nhập",
  "enterPassword": "Nhập mật khẩu",
  "signIn": "Đăng nhập",
  "signingIn": "Đang đăng nhập...",
  "loginSuccess": "Đăng nhập thành công!",
  "loginFailed": "Đăng nhập thất bại",
  "invalidResponse": "Phản hồi đăng nhập không hợp lệ",
  "twoFactor": {
    "title": "Xác thực hai yếu tố",
    "enterCode": "Nhập mã xác thực",
    "verify": "Xác thực",
    "verifying": "Đang xác thực...",
    "invalidCode": "Mã xác thực không hợp lệ",
    "required": "Yêu cầu xác thực 2FA"
  }
}
```

**`client/src/i18n/locales/vi/dashboard.json`**
```json
{
  "title": "Bảng điều khiển",
  "totalDevices": "Tổng thiết bị",
  "onlineDevices": "Thiết bị trực tuyến",
  "totalFiles": "Tổng tệp tin",
  "storageUsed": "Dung lượng sử dụng",
  "filesUploadedToday": "Tệp tải lên hôm nay",
  "deviceEvents24h": "Sự kiện thiết bị (24h)",
  "totalUsers": "Tổng người dùng",
  "recentActivity": "Hoạt động gần đây",
  "noRecentActivity": "Không có hoạt động gần đây",
  "loadingDashboard": "Đang tải bảng điều khiển...",
  "failedToLoadStats": "Không thể tải thống kê"
}
```

**`client/src/i18n/locales/vi/devices.json`**
```json
{
  "title": "Thiết bị",
  "subtitle": "Thiết bị kết nối thời gian thực",
  "onlineCount": "{{online}} trực tuyến, {{total}} tổng cộng",
  "noDevices": "Không có thiết bị kết nối",
  "noDevicesDesc": "Thiết bị sẽ xuất hiện ở đây khi kết nối qua Socket.IO",
  "deviceType": "Loại thiết bị",
  "lastSeen": "Lần cuối hoạt động",
  "now": "Bây giờ",
  "justNow": "Vừa xong",
  "minutesAgo": "{{count}} phút trước",
  "minutesAgo_plural": "{{count}} phút trước",
  "hoursAgo": "{{count}} giờ trước",
  "hoursAgo_plural": "{{count}} giờ trước",
  "daysAgo": "{{count}} ngày trước",
  "daysAgo_plural": "{{count}} ngày trước",
  "rename": "Đổi tên",
  "enterDeviceName": "Nhập tên thiết bị",
  "deviceRenamed": "Đổi tên thiết bị thành công",
  "failedToRename": "Không thể đổi tên thiết bị",
  "failedToLoad": "Không thể tải danh sách thiết bị",
  "android": "Android",
  "browser": "Trình duyệt"
}
```

**`client/src/i18n/locales/vi/files.json`**
```json
{
  "title": "Tệp tin",
  "subtitle": "Quản lý bản ghi âm và bản chép mã hóa",
  "uploadAudio": "Tải âm thanh",
  "uploadText": "Tải văn bản",
  "share": "Chia sẻ",
  "searchFiles": "Tìm kiếm tệp...",
  "noFiles": "Không tìm thấy tệp. Tải lên tệp đầu tiên!",
  "file": "Tệp",
  "size": "Kích thước",
  "uploadedBy": "Người tải lên",
  "deleteAfterDays": "Xóa sau (ngày)",
  "uploaded": "Đã tải lên",
  "shared": "Đã chia sẻ",
  "sharedWith": "Chia sẻ với {{count}} người dùng",
  "compare": "So sánh",
  "summary": "Tóm tắt",
  "realtime": "Thời gian thực",
  "pairView": "Xem cặp",
  "viewFile": "Xem tệp",
  "autoDeleteDays": "Tự động xóa sau (ngày)",
  "leaveEmptyDefault": "Để trống để sử dụng mặc định/không xóa",
  "personalDefaultNote": "Nếu để trống, mặc định cá nhân (hoặc mặc định hệ thống) sẽ được áp dụng.",
  "uploading": "Đang tải lên...",
  "fileUploaded": "Tải lên tệp {{type}} thành công",
  "failedToUpload": "Không thể tải lên tệp",
  "fileDownloaded": "Đã tải xuống tệp",
  "failedToDownload": "Không thể tải xuống tệp",
  "fileDeleted": "Đã xóa tệp",
  "failedToDelete": "Không thể xóa tệp",
  "confirmDelete": "Xóa {{filename}}?",
  "failedToFetch": "Không thể tải danh sách tệp",
  "tooManyRequests": "Quá nhiều yêu cầu — thử lại sau vài phút",
  "failedToOpenViewer": "Không thể mở trình xem",
  "revokeShare": "Thu hồi chia sẻ cho người dùng này?",
  "shareRevoked": "Đã thu hồi chia sẻ",
  "failedToRevoke": "Không thể thu hồi chia sẻ",
  "noSharesSelected": "Chưa chọn người nhận",
  "revokeSelected": "Thu hồi đã chọn",
  "sharedRecipients": "Người nhận chia sẻ cho {{filename}}",
  "noExpiry": "Không hết hạn",
  "expires": "Hết hạn: {{date}}",
  "days": "{{count}} ngày",
  "none": "Không",
  "androidPayload": "Dữ liệu Android",
  "uploadedText": "Văn bản đã tải lên (đã giải mã)",
  "noAndroidPayload": "Không có dữ liệu Android",
  "noDecryptedContent": "Không có nội dung giải mã",
  "noContent": "Không có nội dung",
  "pairDownloaded": "Đã tải xuống cặp tệp",
  "invalidAudioFile": "Vui lòng chọn tệp âm thanh hợp lệ (wav, mp3, ogg, webm, m4a, aac, flac)",
  "invalidTextFile": "Vui lòng chọn tệp văn bản hợp lệ (.txt, .log, .json, .csv, .xml)"
}
```

**`client/src/i18n/locales/vi/templates.json`**
```json
{
  "title": "Mẫu báo cáo",
  "subtitle": "Quản lý các mẫu báo cáo",
  "createTemplate": "Tạo mẫu",
  "editTemplate": "Sửa mẫu",
  "deleteTemplate": "Xóa mẫu",
  "templateName": "Tên mẫu",
  "description": "Mô tả",
  "preview": "Xem trước",
  "noTemplates": "Không tìm thấy mẫu",
  "confirmDelete": "Bạn có chắc muốn xóa mẫu này?",
  "templateCreated": "Tạo mẫu thành công",
  "templateUpdated": "Cập nhật mẫu thành công",
  "templateDeleted": "Xóa mẫu thành công",
  "failedToCreate": "Không thể tạo mẫu",
  "failedToUpdate": "Không thể cập nhật mẫu",
  "failedToDelete": "Không thể xóa mẫu",
  "failedToLoad": "Không thể tải danh sách mẫu"
}
```

**`client/src/i18n/locales/vi/users.json`**
```json
{
  "title": "Người dùng",
  "subtitle": "Quản lý tài khoản và quyền hạn",
  "createUser": "Tạo người dùng",
  "editUser": "Sửa người dùng",
  "deleteUser": "Xóa người dùng",
  "username": "Tên đăng nhập",
  "email": "Email",
  "fullName": "Họ và tên",
  "role": "Vai trò",
  "admin": "Quản trị viên",
  "user": "Người dùng",
  "createdAt": "Ngày tạo",
  "noUsers": "Không tìm thấy người dùng",
  "confirmDelete": "Bạn có chắc muốn xóa người dùng {{username}}?",
  "userCreated": "Tạo người dùng thành công",
  "userUpdated": "Cập nhật người dùng thành công",
  "userDeleted": "Xóa người dùng thành công",
  "failedToCreate": "Không thể tạo người dùng",
  "failedToUpdate": "Không thể cập nhật người dùng",
  "failedToDelete": "Không thể xóa người dùng",
  "failedToLoad": "Không thể tải danh sách người dùng"
}
```

**`client/src/i18n/locales/vi/settings.json`**
```json
{
  "title": "Cài đặt",
  "subtitle": "Quản lý tùy chọn và cấu hình hệ thống",
  "reload": "Tải lại",
  "saveChanges": "Lưu thay đổi",
  "saving": "Đang lưu...",
  "settingsSaved": "Lưu cài đặt thành công",
  "failedToSave": "Không thể lưu cài đặt",
  "failedToLoad": "Không thể tải cài đặt",
  "tabs": {
    "profile": "Hồ sơ",
    "files": "Tệp tin",
    "security": "Bảo mật",
    "ui": "Giao diện",
    "notifications": "Thông báo"
  },
  "profile": {
    "title": "Hồ sơ người dùng",
    "username": "Tên đăng nhập",
    "email": "Email",
    "fullName": "Họ và tên",
    "contactAdmin": "Liên hệ quản trị viên để cập nhật thông tin hồ sơ"
  },
  "files": {
    "title": "Quản lý tệp tin",
    "yourDefaultSetting": "Cài đặt tự động xóa mặc định của bạn",
    "defaultAutoDelete": "Thời gian tự động xóa mặc định cho tệp tải lên (ngày)",
    "neverDelete": "Không bao giờ xóa (để trống)",
    "willBeDeleted": "Tệp của bạn sẽ tự động bị xóa sau {{days}} ngày theo mặc định",
    "leaveEmpty": "Để trống để không bao giờ tự động xóa tệp (có thể ghi đè khi tải lên)",
    "personalNote": "Đây là mặc định cá nhân của bạn. Khi tải tệp lên, chúng sẽ sử dụng cài đặt này trừ khi bạn chỉ định giá trị khác.",
    "preferencesSaved": "Lưu tùy chọn thành công",
    "failedToSavePreferences": "Không thể lưu tùy chọn",
    "systemWideSettings": "Cài đặt toàn hệ thống",
    "systemDefaultAutoDelete": "Thời gian tự động xóa mặc định hệ thống (ngày)",
    "adminOnly": "Mặc định toàn hệ thống (chỉ quản trị viên)",
    "maxFileSize": "Kích thước tệp tối đa (MB)",
    "maxFileSizeDesc": "Kích thước tối đa cho tệp tải lên",
    "allowedTextFormats": "Định dạng văn bản được phép"
  },
  "security": {
    "title": "Cài đặt bảo mật",
    "sessionTimeout": "Thời gian hết phiên (ngày)",
    "sessionTimeoutDesc": "Thời gian duy trì đăng nhập trước khi yêu cầu xác thực lại",
    "minPasswordLength": "Độ dài mật khẩu tối thiểu",
    "requireStrongPassword": "Yêu cầu mật khẩu mạnh (chữ hoa, chữ thường, số, ký tự đặc biệt)",
    "enableAuditLog": "Bật ghi nhật ký kiểm tra (chỉ quản trị viên)",
    "auditLogNote": "Nhật ký kiểm tra là vĩnh viễn và không thể tự động xóa. Chỉ tệp tải lên mới có thể đặt tự động xóa sau N ngày trong cài đặt Tệp tin.",
    "twoFactor": {
      "title": "Xác thực hai yếu tố (2FA)",
      "enable": "Bật xác thực hai yếu tố (2FA)",
      "description": "Thêm lớp bảo mật bằng cách yêu cầu mã từ ứng dụng xác thực. Bạn sẽ được yêu cầu xác thực một lần cho mỗi thiết bị mới.",
      "active": "Đang hoạt động",
      "enabled": "Đã bật 2FA thành công!",
      "disabled": "Đã tắt 2FA thành công",
      "failedToDisable": "Không thể tắt 2FA",
      "disableTitle": "Tắt xác thực hai yếu tố",
      "disableWarning": "Tắt 2FA sẽ làm tài khoản kém an toàn hơn. Bạn có chắc muốn tiếp tục?",
      "confirmPassword": "Xác nhận mật khẩu",
      "enterPassword": "Nhập mật khẩu",
      "disabling": "Đang tắt..."
    },
    "changePassword": {
      "title": "Đổi mật khẩu",
      "description": "Để đổi mật khẩu, vui lòng liên hệ quản trị viên hoặc sử dụng tính năng đổi mật khẩu trong menu hồ sơ."
    }
  },
  "ui": {
    "title": "Tùy chọn giao diện",
    "theme": "Giao diện",
    "light": "Sáng",
    "dark": "Tối",
    "auto": "Tự động (theo hệ thống)",
    "language": "Ngôn ngữ",
    "english": "English",
    "vietnamese": "Tiếng Việt",
    "dateFormat": "Định dạng ngày",
    "timeFormat": "Định dạng giờ",
    "12hour": "12 giờ (2:30 PM)",
    "24hour": "24 giờ (14:30)",
    "itemsPerPage": "Số mục mỗi trang"
  },
  "notifications": {
    "title": "Tùy chọn thông báo",
    "enableEmail": "Bật thông báo email",
    "enablePush": "Bật thông báo đẩy",
    "notifyOnUpload": "Thông báo khi tải tệp lên",
    "notifyOnDeviceChange": "Thông báo khi thiết bị thay đổi trạng thái"
  }
}
```

---

### Phase 3: Integrate Translations into Components

#### Step 3.1: Usage Pattern

**Example: Converting LoginPage.tsx**

```tsx
// Before
<h1 className="text-3xl font-bold text-gray-900 mb-2">
  UNV AI Report
</h1>
<p className="text-gray-500">Local Administration Panel</p>

// After
import { useTranslation } from 'react-i18next'

export default function LoginPage() {
  const { t } = useTranslation('auth')
  
  // ...
  
  <h1 className="text-3xl font-bold text-gray-900 mb-2">
    {t('title')}
  </h1>
  <p className="text-gray-500">{t('subtitle')}</p>
}
```

#### Step 3.2: Components to Update (Priority Order)

1. **Layout.tsx** - Navigation items, logout button
2. **LoginPage.tsx** - Login form labels and messages
3. **DashboardPage.tsx** - Dashboard cards and labels
4. **DevicesPage.tsx** - Device list labels
5. **FilesPage.tsx** - File management labels (largest file)
6. **TemplatesPage.tsx** - Template management
7. **UsersPage.tsx** - User management
8. **SettingsPage.tsx** - All settings labels
9. **Modal.tsx** - Generic modal buttons
10. **ShareFilesModal.tsx** - Share dialog
11. **TwoFactorSetupModal.tsx** - 2FA setup
12. **TwoFactorVerifyModal.tsx** - 2FA verification

---

### Phase 4: Language Switching Integration

#### Step 4.1: Connect Settings Language Dropdown

Update `SettingsPage.tsx` to change i18n language when user selects:

```tsx
import { useTranslation } from 'react-i18next'

// In component:
const { i18n, t } = useTranslation('settings')

// In language dropdown onChange:
const handleLanguageChange = (newLang: string) => {
  i18n.changeLanguage(newLang)
  updateSetting('language', newLang)
}
```

#### Step 4.2: Sync with User Settings on Load

```tsx
// In SettingsPage or App.tsx, sync language from server settings
useEffect(() => {
  if (settings.language && settings.language !== i18n.language) {
    i18n.changeLanguage(settings.language)
  }
}, [settings.language])
```

---

## 4. File-by-File Implementation Checklist

### Core Setup
- [ ] Install i18next, react-i18next, i18next-browser-languagedetector
- [ ] Create `client/src/i18n/index.ts`
- [ ] Create translation JSON files for EN and VI
- [ ] Import i18n in `main.tsx`

### Pages
- [ ] `LoginPage.tsx` - auth namespace
- [ ] `DashboardPage.tsx` - dashboard namespace
- [ ] `DevicesPage.tsx` - devices namespace
- [ ] `FilesPage.tsx` - files namespace
- [ ] `TemplatesPage.tsx` - templates namespace
- [ ] `UsersPage.tsx` - users namespace
- [ ] `SettingsPage.tsx` - settings namespace

### Components
- [ ] `Layout.tsx` - common namespace (navigation)
- [ ] `Modal.tsx` - common namespace
- [ ] `ShareFilesModal.tsx` - files namespace
- [ ] `TwoFactorSetupModal.tsx` - auth namespace
- [ ] `TwoFactorVerifyModal.tsx` - auth namespace
- [ ] `TemplatePreview.tsx` - templates namespace
- [ ] `SchemaOverview.tsx` - templates namespace
- [ ] `FieldRenderer.tsx` - templates namespace

### Integration
- [ ] Connect language dropdown in Settings to i18n
- [ ] Sync language setting from server on login/load
- [ ] Test language persistence across page reloads

---

## 5. Testing Checklist

- [ ] All pages render without translation key errors
- [ ] Language switch works immediately without page reload
- [ ] Language persists after page refresh
- [ ] Toast messages appear in selected language
- [ ] Date/time formats respect locale (using formatDate helpers)
- [ ] Form validation messages are translated
- [ ] Error messages from API calls are handled gracefully

---

## 6. Future Enhancements (Out of Scope)

- Backend API error messages localization
- PDF report generation in selected language
- Additional languages (Japanese, Chinese, etc.)
- RTL language support
- Translation management platform integration (Crowdin, Phrase)

---

## 7. Estimated Effort

| Phase | Estimated Time |
|-------|---------------|
| Phase 1: Setup | 1 hour |
| Phase 2: Translation files | 2-3 hours |
| Phase 3: Component integration | 4-6 hours |
| Phase 4: Settings integration | 1 hour |
| Testing & QA | 2 hours |
| **Total** | **10-13 hours** |

---

## 8. Quick Start Commands

```bash
# Install dependencies
cd client
bun add i18next react-i18next i18next-browser-languagedetector

# Create folder structure
mkdir -p src/i18n/locales/en src/i18n/locales/vi

# Start development
bun run dev
```

---

## 9. References

- [react-i18next Documentation](https://react.i18next.com/)
- [i18next Documentation](https://www.i18next.com/)
- [Vietnamese locale conventions](https://vi.wikipedia.org/wiki/Ti%E1%BA%BFng_Vi%E1%BB%87t)
