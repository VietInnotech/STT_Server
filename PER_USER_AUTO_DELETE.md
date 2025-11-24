# Per-User Auto-Delete Configuration

## Overview
Implemented per-user configurable auto-delete settings so each user can set their own default file retention period. This preference is applied automatically to all files they upload unless they override it during upload.

## Problem
Previously, the auto-delete timeout (`deleteAfterDays`) had to be specified on **each individual file upload**. There was no way for users to set a personal default, making it tedious for users who wanted consistent retention policies.

## Solution
Added a per-user `defaultDeleteAfterDays` preference that:
1. Stores the user's preferred default auto-delete period
2. Automatically applies to all uploads by that user
3. Can be overridden per-upload if needed
4. Managed through the Settings page UI

---

## Implementation Details

### Database Changes

**Added field to `User` model** (`prisma/schema.prisma`):
```prisma
model User {
  // ... existing fields ...
  
  // User Preferences
  defaultDeleteAfterDays Int? // Default auto-delete period for uploaded files (null = never delete)
  
  // ... rest of model ...
}
```

**Migration**: `20251008034210_add_user_default_delete_after_days`

---

### Backend Changes

#### 1. New Settings Endpoints (`src/routes/settings.ts`)

**GET `/api/settings/preferences`** - Get user preferences
```typescript
// Returns user's defaultDeleteAfterDays
{
  "defaultDeleteAfterDays": 30 // or null
}
```

**PUT `/api/settings/preferences`** - Update user preferences
```typescript
// Request body
{
  "defaultDeleteAfterDays": 30 // 1-365 or null
}

// Response
{
  "success": true,
  "message": "Preferences updated successfully",
  "defaultDeleteAfterDays": 30
}
```

**Validation**:
- Must be `null` (never delete) or a number between 1 and 365
- Creates audit log for tracking preference changes

#### 2. File Upload Logic Update (`src/routes/files.ts`)

Both audio and text file uploads now:
1. Check if `deleteAfterDays` was explicitly provided in the request
2. If **not provided**, fetch the user's `defaultDeleteAfterDays` from the database
3. Use that default value when creating the file record

**Code changes in both `/audio` and `/text` endpoints**:
```typescript
// Get user's default deleteAfterDays if not explicitly provided
let finalDeleteAfterDays = deleteAfterDays
if (finalDeleteAfterDays === undefined) {
  const user = await prisma.user.findUnique({
    where: { id: uploadedById },
    select: { defaultDeleteAfterDays: true },
  })
  finalDeleteAfterDays = user?.defaultDeleteAfterDays ?? undefined
}

// Then use finalDeleteAfterDays when creating the file record
```

---

### Frontend Changes

#### Settings Page UI (`client/src/pages/SettingsPage.tsx`)

**Files Tab** now includes:

1. **User-specific preference section** (highlighted in blue):
   - Input field for user's default auto-delete days
   - Save button to update preference
   - Clear explanation of how it works
   - Option to leave empty (never delete)

2. **System-wide settings section**:
   - Shows system defaults (admin only can edit)
   - Regular users see it as read-only reference

**New state and functions**:
```typescript
const [defaultDeleteAfterDays, setDefaultDeleteAfterDays] = useState<number | null>(null)
const [savingPreferences, setSavingPreferences] = useState(false)

const fetchUserPreferences = async () => { /* ... */ }
const saveUserPreferences = async () => { /* ... */ }
```

---

## User Experience

### Setting Your Default

1. Navigate to **Settings** → **Files** tab
2. See the blue highlighted section "Your Default Auto-Delete Setting"
3. Enter a number of days (1-365) or leave empty for "never delete"
4. Click **Save**
5. All future uploads will use this default

### Uploading Files

**Scenario 1: User has default set to 30 days**
- Upload a file without specifying `deleteAfterDays`
- File automatically gets `deleteAfterDays: 30`
- Will be deleted 30 days after upload

**Scenario 2: User has no default (null)**
- Upload a file without specifying `deleteAfterDays`
- File gets `deleteAfterDays: null`
- Will never be auto-deleted

**Scenario 3: User overrides during upload**
- User has default of 30 days
- Uploads file with explicit `deleteAfterDays: 7`
- File gets `deleteAfterDays: 7` (override works!)
- Will be deleted after 7 days

---

## API Usage Examples

### Get User Preferences
```bash
curl -X GET http://localhost:3000/api/settings/preferences \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response**:
```json
{
  "defaultDeleteAfterDays": 30
}
```

### Set User Preference (30 days)
```bash
curl -X PUT http://localhost:3000/api/settings/preferences \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"defaultDeleteAfterDays": 30}'
```

### Set User Preference (never delete)
```bash
curl -X PUT http://localhost:3000/api/settings/preferences \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"defaultDeleteAfterDays": null}'
```

### Upload File (uses user's default)
```bash
curl -X POST http://localhost:3000/api/files/audio \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@recording.wav"
  # deleteAfterDays not specified, uses user's default
```

### Upload File (override default)
```bash
curl -X POST http://localhost:3000/api/files/audio \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@recording.wav" \
  -F "deleteAfterDays=7"
  # Explicitly override user's default
```

---

## Priority Hierarchy

The system follows this priority order:

1. **Explicit upload parameter** (highest priority)
   - If `deleteAfterDays` is specified during upload, use that

2. **User's default preference**
   - If no upload parameter, use user's `defaultDeleteAfterDays`

3. **Never delete** (lowest priority)
   - If user has no default set, file is never auto-deleted

---

## Benefits

### For Users
- ✅ Set preference once, applies to all uploads
- ✅ No need to remember to set it on every upload
- ✅ Can still override per-upload when needed
- ✅ Clear UI showing current setting and its effect

### For Administrators
- ✅ Users manage their own preferences
- ✅ Reduces support requests about auto-deletion
- ✅ Audit trail of preference changes
- ✅ System-wide defaults still available

### For Developers
- ✅ Backward compatible (existing files unaffected)
- ✅ Clean database structure (no complex JSON)
- ✅ Simple API design
- ✅ Well-documented behavior

---

## Migration Notes

### For Existing Users
- Existing users have `defaultDeleteAfterDays: null` by default
- Their files continue to use whatever `deleteAfterDays` was set during upload
- They can set their preference anytime in Settings

### For Existing Files
- No changes to existing files
- Files keep their original `deleteAfterDays` values
- The new preference only affects **future uploads**

---

## Testing

### Manual Test Steps

1. **Set user preference**:
   ```
   Login → Settings → Files → Set default to 30 days → Save
   ```

2. **Upload without specifying period**:
   ```bash
   curl -X POST /api/files/audio -F "file=@test.wav"
   ```
   - Expected: File gets `deleteAfterDays: 30`

3. **Upload with override**:
   ```bash
   curl -X POST /api/files/audio -F "file=@test.wav" -F "deleteAfterDays=7"
   ```
   - Expected: File gets `deleteAfterDays: 7`

4. **Clear user preference** (set to null):
   ```
   Settings → Files → Clear input → Save
   ```

5. **Upload again**:
   ```bash
   curl -X POST /api/files/audio -F "file=@test.wav"
   ```
   - Expected: File gets `deleteAfterDays: null`

### Database Verification
```sql
-- Check user's preference
SELECT username, defaultDeleteAfterDays FROM users;

-- Check file's actual setting
SELECT filename, deleteAfterDays, scheduledDeleteAt FROM audio_files;
```

---

## Files Changed

| File | Changes | Lines |
|------|---------|-------|
| `prisma/schema.prisma` | Added `defaultDeleteAfterDays` to User model | +3 |
| `prisma/migrations/...` | Migration for new field | New |
| `src/routes/settings.ts` | Added GET/PUT `/preferences` endpoints | +100 |
| `src/routes/files.ts` | Use user default in audio upload | +10 |
| `src/routes/files.ts` | Use user default in text upload | +10 |
| `client/src/pages/SettingsPage.tsx` | Added UI for preference management | +50 |

---

## Future Enhancements

1. **Bulk Update**: Allow users to apply their current preference to all existing files
2. **Per-File-Type Defaults**: Different defaults for audio vs text files
3. **Admin Override**: Admin can set organization-wide min/max retention periods
4. **Expiration Warnings**: Email users X days before files are deleted
5. **Retention Policies**: Team/department-level policies that override user preferences

---

**Implemented**: October 8, 2025  
**Feature**: Per-user auto-delete configuration  
**Status**: ✅ Complete and tested
