# UserSettings Table Refactor

## Overview
Refactored user preferences from being stored directly in the `User` table to a dedicated `UserSettings` table with a foreign key relationship. This follows better database design principles and provides a scalable foundation for future user preferences.

## Why This Change?

### Before (Anti-pattern)
```prisma
model User {
  // ... auth fields ...
  defaultDeleteAfterDays Int?  // ❌ Mixing concerns
  // Future: theme?, language?, timezone?, etc. all in User table
}
```

**Problems**:
- ❌ Mixes authentication data with user preferences
- ❌ User table becomes bloated with preference fields
- ❌ Hard to query/manage preferences separately
- ❌ No clear separation of concerns

### After (Best practice)
```prisma
model User {
  // ... auth fields only ...
  settings UserSettings?  // ✅ Clean separation
}

model UserSettings {
  id                     String   @id
  userId                 String   @unique
  user                   User     @relation(...)
  
  // File Management Preferences
  defaultDeleteAfterDays Int?
  
  // UI Preferences (easily extensible)
  theme                  String?
  language               String?
  timezone               String?
  
  // ... future preferences
}
```

**Benefits**:
- ✅ Clear separation: Auth vs Preferences
- ✅ Scalable: Easy to add new preferences
- ✅ Maintainable: One table for all user settings
- ✅ Performant: Can query settings independently

---

## Database Schema

### UserSettings Model
```prisma
model UserSettings {
  id                     String   @id @default(uuid())
  userId                 String   @unique
  user                   User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  // File Management Preferences
  defaultDeleteAfterDays Int?     // Default auto-delete period for uploaded files (null = never delete)
  
  // UI Preferences (expandable for future settings)
  theme                  String?  @default("light")
  language               String?  @default("en")
  timezone               String?
  
  createdAt              DateTime @default(now())
  updatedAt              DateTime @updatedAt

  @@index([userId])
  @@map("user_settings")
}
```

### Relationship in User Model
```prisma
model User {
  // ... existing fields ...
  settings UserSettings?  // One-to-one relationship
}
```

### Key Features
- **One-to-one relationship**: Each user has exactly one UserSettings record
- **Cascade delete**: When user is deleted, settings are automatically deleted
- **Nullable fields**: All preferences are optional
- **Defaults**: Sensible defaults for theme and language
- **Indexed**: Foreign key indexed for performance

---

## Migration

### Created Migration
`prisma/migrations/20251008034902_create_user_settings_table/migration.sql`

**What it does**:
1. Creates new `user_settings` table
2. Removes `defaultDeleteAfterDays` from `users` table
3. Maintains data integrity with foreign key constraints

### Data Migration
Since the previous migration (adding `defaultDeleteAfterDays` to User) and this refactor happened in quick succession during development, no production data exists to migrate.

For future reference, data migration would be:
```sql
-- If there was production data with defaultDeleteAfterDays in users table
INSERT INTO user_settings (id, userId, defaultDeleteAfterDays, createdAt, updatedAt)
SELECT 
  lower(hex(randomblob(16))), 
  id, 
  defaultDeleteAfterDays, 
  CURRENT_TIMESTAMP, 
  CURRENT_TIMESTAMP
FROM users
WHERE defaultDeleteAfterDays IS NOT NULL;
```

---

## API Changes

### No Breaking Changes!
The API endpoints remain the same - only the backend implementation changed:

**GET `/api/settings/preferences`**
```json
{
  "defaultDeleteAfterDays": 30,
  "theme": "light",
  "language": "en",
  "timezone": null
}
```

**PUT `/api/settings/preferences`**
```json
{
  "defaultDeleteAfterDays": 30
}
```

### Backend Implementation Changes

#### Before
```typescript
// Get preferences
const user = await prisma.user.findUnique({
  where: { id: userId },
  select: { defaultDeleteAfterDays: true },
})

// Update preferences
await prisma.user.update({
  where: { id: userId },
  data: { defaultDeleteAfterDays: value },
})
```

#### After
```typescript
// Get preferences (auto-create if not exists)
let userSettings = await prisma.userSettings.findUnique({
  where: { userId },
})

if (!userSettings) {
  userSettings = await prisma.userSettings.create({
    data: { userId },
  })
}

// Update preferences (upsert pattern)
await prisma.userSettings.upsert({
  where: { userId },
  update: { defaultDeleteAfterDays: value },
  create: { userId, defaultDeleteAfterDays: value },
})
```

---

## Code Changes

### 1. Settings Routes (`src/routes/settings.ts`)

**GET `/preferences`**:
- Changed from `prisma.user.findUnique()` to `prisma.userSettings.findUnique()`
- Auto-creates settings record if it doesn't exist
- Returns all preference fields (not just defaultDeleteAfterDays)

**PUT `/preferences`**:
- Changed from `prisma.user.update()` to `prisma.userSettings.upsert()`
- Handles both create and update in one operation
- More robust for new users

### 2. File Upload Routes (`src/routes/files.ts`)

Both audio and text upload endpoints:
```typescript
// Before
const user = await prisma.user.findUnique({
  where: { id: uploadedById },
  select: { defaultDeleteAfterDays: true },
})
finalDeleteAfterDays = user?.defaultDeleteAfterDays ?? undefined

// After
const userSettings = await prisma.userSettings.findUnique({
  where: { userId: uploadedById },
  select: { defaultDeleteAfterDays: true },
})
finalDeleteAfterDays = userSettings?.defaultDeleteAfterDays ?? undefined
```

### 3. Frontend
**No changes needed!** The API contract remains the same, so frontend code continues to work without modifications.

---

## Benefits of This Refactor

### 1. Separation of Concerns
- **User table**: Authentication, identity, roles
- **UserSettings table**: Preferences, configuration, UI settings
- Clear responsibility boundaries

### 2. Scalability
Easy to add new preferences without polluting the User table:
```prisma
model UserSettings {
  // ... existing fields ...
  
  // Easy to add:
  dateFormat             String?
  timeFormat             String?
  notificationsEnabled   Boolean?  @default(true)
  emailDigest            String?   @default("daily")
  defaultFileView        String?   @default("grid")
  // ... unlimited future preferences
}
```

### 3. Query Performance
- Can query settings independently without joining User
- Smaller User table means faster authentication queries
- Settings can be cached separately from user auth data

### 4. Maintainability
- All user preferences in one place
- Easier to understand and document
- Simpler to add/remove preference fields
- Better for team collaboration

### 5. Data Integrity
- Foreign key ensures settings belong to valid users
- Cascade delete automatically cleans up orphaned settings
- Unique constraint prevents duplicate settings per user

---

## Future Enhancements

### 1. Preference Categories
```prisma
model UserSettings {
  // File preferences
  defaultDeleteAfterDays Int?
  maxUploadSize          Int?
  
  // UI preferences
  theme                  String?
  language               String?
  timezone               String?
  
  // Notification preferences
  emailNotifications     Boolean?
  pushNotifications      Boolean?
  
  // Privacy preferences
  shareActivity          Boolean?
  publicProfile          Boolean?
}
```

### 2. Team/Organization Settings
```prisma
model TeamSettings {
  id                     String   @id
  teamId                 String   @unique
  
  // Inherit pattern for user settings
  defaultUserPreferences Json?
}
```

### 3. Setting Validation
```typescript
// Add schema validation
const userSettingsSchema = z.object({
  defaultDeleteAfterDays: z.number().min(1).max(365).nullable(),
  theme: z.enum(['light', 'dark', 'auto']).nullable(),
  language: z.enum(['en', 'vi', 'ja']).nullable(),
  timezone: z.string().nullable(),
})
```

### 4. Settings History
```prisma
model UserSettingsHistory {
  id          String   @id
  userId      String
  setting     String   // which setting changed
  oldValue    String?
  newValue    String?
  changedAt   DateTime
  changedBy   String   // userId who made the change
}
```

---

## Comparison: Before vs After

| Aspect | Before (User table) | After (UserSettings table) |
|--------|---------------------|----------------------------|
| **Structure** | Mixed auth + preferences | Separated concerns ✅ |
| **Scalability** | Hard to add fields | Easy to extend ✅ |
| **Query** | Must join User | Independent queries ✅ |
| **Caching** | Cache entire user | Cache settings separately ✅ |
| **Migration** | Complex ALTER TABLE | Independent table ops ✅ |
| **Testing** | Auth tests affected | Settings tests isolated ✅ |
| **Documentation** | Mixed purpose | Clear purpose ✅ |

---

## Testing

### Manual Test

1. **Get preferences (auto-create)**:
   ```bash
   curl -X GET /api/settings/preferences -H "Authorization: Bearer TOKEN"
   # Creates settings record if it doesn't exist
   ```

2. **Set preferences**:
   ```bash
   curl -X PUT /api/settings/preferences \
     -H "Authorization: Bearer TOKEN" \
     -d '{"defaultDeleteAfterDays": 30}'
   ```

3. **Upload file (uses default)**:
   ```bash
   curl -X POST /api/files/audio \
     -H "Authorization: Bearer TOKEN" \
     -F "file=@test.wav"
   ```

4. **Verify in database**:
   ```sql
   -- Check settings table
   SELECT * FROM user_settings WHERE userId = 'your-user-id';
   
   -- Check file got the default
   SELECT deleteAfterDays FROM audio_files 
   WHERE uploadedById = 'your-user-id' 
   ORDER BY uploadedAt DESC LIMIT 1;
   ```

---

## Files Changed

| File | Change | Lines |
|------|--------|-------|
| `prisma/schema.prisma` | Added UserSettings model, removed field from User | +20, -3 |
| `prisma/migrations/...` | Create UserSettings table migration | New |
| `src/routes/settings.ts` | GET/PUT use userSettings instead of user | ~15 |
| `src/routes/files.ts` | Audio upload queries userSettings | ~3 |
| `src/routes/files.ts` | Text upload queries userSettings | ~3 |
| Frontend | No changes needed! | 0 |

---

## Migration Safety

### Development (Current)
- ✅ Safe: No production data exists yet
- ✅ Clean migration: Old table → New table
- ✅ No data loss risk

### Production (Future)
If this had been deployed to production:
1. Create UserSettings table (new migration)
2. Copy data from User.defaultDeleteAfterDays to UserSettings
3. Remove column from User table
4. Deploy updated code

---

## Summary

**What we did**: Moved user preferences from `User` table to dedicated `UserSettings` table

**Why**: Better separation of concerns, scalability, maintainability

**Impact**: 
- ✅ Backend: Minor code changes
- ✅ Frontend: No changes needed
- ✅ API: No breaking changes
- ✅ Database: Cleaner structure
- ✅ Future: Easy to add preferences

**Result**: A more professional, scalable architecture that follows database design best practices! 🎉

---

**Refactored**: October 8, 2025  
**Migration**: `20251008034902_create_user_settings_table`  
**Status**: ✅ Complete
