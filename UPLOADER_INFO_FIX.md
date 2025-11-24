# Uploader Info Missing for text-pair-android Files - FIX

## Problem
Files uploaded using the `text-pair-android` endpoint were missing uploader information in the UI. While the `uploadedById` was correctly stored in the database and individual text files displayed uploader names, the pair rows showed blank uploader information.

## Root Cause
The issue was on **two fronts**:

### Backend Issue
1. **`GET /api/files/pairs`** endpoint (line 1576 in `src/routes/files.ts`):
   - Used `include` to fetch related `summaryFile` and `realtimeFile` but did NOT include the `uploadedBy` relationship
   - Result: Pair list returned `uploadedById` but not the actual user details (`username`, `fullName`)

2. **`GET /api/files/pairs/:pairId`** endpoint (line 1496 in `src/routes/files.ts`):
   - Same issue - didn't fetch `uploadedBy` relationship
   - Result: Detail API response didn't include user info

### Frontend Issue
3. **`FilesPage.tsx`** (line 79):
   - When building synthetic pair rows, the code was manually creating an empty `uploadedBy` object:
     ```tsx
     uploadedBy: p.uploadedById ? { id: p.uploadedById, username: '', fullName: '' } : null,
     ```
   - This created placeholder objects with empty strings instead of using actual user data

## Solution

### Backend Changes

**1. Updated `/api/files/pairs/:pairId` endpoint** (lines 1491-1545):
```typescript
const pair = await prisma.textFilePair.findUnique({
  where: { id: pairId },
  include: {
    summaryFile: true,
    realtimeFile: true,
    uploadedBy: {  // ← ADDED: Include uploader details
      select: {
        id: true,
        username: true,
        fullName: true,
      },
    },
  },
})

// Response now includes:
return res.json({
  success: true,
  pair: {
    id: pair.id,
    name: pair.name,
    uploadedById: pair.uploadedById,  // ← ADDED
    uploadedBy: pair.uploadedBy,      // ← ADDED
    summaryFile: { ... },
    realtimeFile: { ... },
    createdAt: pair.createdAt,
  },
})
```

**2. Updated `/api/files/pairs` endpoint** (lines 1566-1591):
```typescript
const pairs = await prisma.textFilePair.findMany({
  include: {
    summaryFile: true,
    realtimeFile: true,
    uploadedBy: {  // ← ADDED: Include uploader details
      select: {
        id: true,
        username: true,
        fullName: true,
      },
    },
  },
  orderBy: { createdAt: 'desc' },
  take: l,
  skip: o,
})
```

### Frontend Changes

**Updated `FilesPage.tsx`** (line 78-79):
```tsx
// BEFORE:
uploadedBy: p.uploadedById ? { id: p.uploadedById, username: '', fullName: '' } : null,

// AFTER:
uploadedBy: p.uploadedBy || null,  // ← Use actual data from API response
```

## Testing

### API Response Verification
```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}' | jq -r '.token')

# Test: List pairs with uploader info
curl -s -X GET http://localhost:3000/api/files/pairs \
  -H "Authorization: Bearer $TOKEN" | jq '.pairs[0] | {id, name, uploadedById, uploadedBy}'
```

**Expected Output:**
```json
{
  "id": "0ba46e52-70cf-4e93-80d2-873e06118424",
  "name": "TestUploaderScript",
  "uploadedById": "d949b743-5d3a-486b-8bb2-c0d90541f216",
  "uploadedBy": {
    "id": "d949b743-5d3a-486b-8bb2-c0d90541f216",
    "username": "admin",
    "fullName": "System Administrator"
  }
}
```

### Individual File Verification
```bash
# Text files should also show uploader
curl -s -X GET http://localhost:3000/api/files/all \
  -H "Authorization: Bearer $TOKEN" | jq '.text[] | select(.origin == "android") | {filename, uploadedBy}' | head -5
```

## UI Impact
- **Pair rows** now correctly display the uploader name (e.g., "System Administrator")
- **Single text files** continue to display uploader info as before
- **Audio files** are unaffected

## Files Modified
1. `/src/routes/files.ts` - Added `uploadedBy` include to both pair endpoints
2. `/client/src/pages/FilesPage.tsx` - Use actual `uploadedBy` data from API instead of empty placeholder

## Verification Steps

1. **Start server:**
   ```bash
   cd /mnt/apps/vietinnotech/UNV_AI_REPORT/server
   pkill -f "bun run"
   bun run index.ts
   ```

2. **Build client:**
   ```bash
   cd client
   bun run vite build
   ```

3. **Verify API returns uploader info:**
   ```bash
   TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
     -H 'Content-Type: application/json' \
     -d '{"username":"admin","password":"admin123"}' | jq -r '.token')
   
   curl -s http://localhost:3000/api/files/pairs \
     -H "Authorization: Bearer $TOKEN" | jq '.pairs[0].uploadedBy'
   ```

4. **Open WebUI and navigate to Files page**
   - Verify that pair rows display the uploader name
   - Verify that individual text files also show uploader name

## Database State
- Database was **not modified** - `uploadedById` values were already correctly stored in `text_file_pairs` table
- Only the API response and frontend display logic were fixed
