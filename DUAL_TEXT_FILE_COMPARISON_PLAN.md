# Dual Text File Comparison Feature - Implementation Plan

**Date:** November 20, 2025  
**Status:** Planning Phase  
**Objective:** Support uploading and comparing two text files (summary and realtime) simultaneously for side-by-side comparison in the WebUI

---

## 1. Problem Statement

Currently, the system supports:
- Single text file uploads from web users
- Android app uploads with structured payload containing **both** `androidSummary` and `androidRealtime` fields stored as JSON
- A "Compare" button that shows Android payload vs decrypted uploaded text

**Gap:** Web users cannot upload TWO separate text files (e.g., `summary.txt` and `realtime.txt`) for comparison purposes.

**Goal:** Enable web users to upload two distinct text files and view them side-by-side in a split view, similar to how Android uploads with both fields are displayed.

---

## 2. Current System Architecture

### 2.1 Database Schema (Prisma)

**TextFile Model:**
```prisma
model TextFile {
  id            String @id @default(uuid())
  filename      String
  originalName  String
  fileSize      Int
  encryptedData Bytes
  encryptedIV   String
  mimeType      String @default("text/plain")
  encoding      String @default("utf-8")
  lineCount     Int?
  wordCount     Int?
  
  // Origin tracking
  origin        FileOrigin @default(web)  // 'web' or 'android'
  
  // Android-specific structured payload
  androidSummary  Json?
  androidRealtime Json?
  
  // Metadata
  deviceId         String?
  uploadedById     String?
  deleteAfterDays  Int?
  scheduledDeleteAt DateTime?
  
  uploadedAt DateTime @default(now())
  updatedAt  DateTime @updatedAt
}
```

**Current Limitations:**
- `androidSummary` and `androidRealtime` are JSON fields (currently storing strings)
- Only one `encryptedData` field per record (stores single file content)
- No relationship between multiple text files for comparison

### 2.2 Backend API

**Current Endpoint: POST /api/files/text**
- Accepts single file upload via multipart/form-data
- For Android: parses `json` field with `{ summary, realtime }` structure
- Stores encrypted file data and Android payload separately

**Current Endpoint: GET /api/files/text/:id**
- Returns decrypted file content as blob
- Does not include androidSummary/androidRealtime in response

**Current Endpoint: GET /api/files/all**
- Lists all files with metadata including `androidSummary` and `androidRealtime` flags
- Used by FilesPage to display file list

### 2.3 Frontend (React)

**FilesPage.tsx:**
- Shows "Compare" button for Android-origin files with summary/realtime
- Modal displays Android payload on left, decrypted text on right
- Single file upload workflow with auto-delete configuration

---

## 3. Proposed Solution

### Architecture Option A: **Paired File Records** (RECOMMENDED)

Create a relationship between two TextFile records to represent a comparison set.

#### 3.1 Database Changes

**Add new model for TextFilePair:**
```prisma
model TextFilePair {
  id              String   @id @default(uuid())
  
  // File references
  summaryFileId   String?  @unique
  summaryFile     TextFile? @relation("SummaryFile", fields: [summaryFileId], references: [id], onDelete: Cascade)
  
  realtimeFileId  String?  @unique
  realtimeFile    TextFile? @relation("RealtimeFile", fields: [realtimeFileId], references: [id], onDelete: Cascade)
  
  // Metadata
  name            String   // User-friendly name for this comparison set
  uploadedById    String?
  uploadedBy      User?    @relation(fields: [uploadedById], references: [id], onDelete: SetNull)
  
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  @@index([uploadedById])
  @@index([summaryFileId])
  @@index([realtimeFileId])
  @@map("text_file_pairs")
}
```

**Update TextFile model:**
```prisma
model TextFile {
  // ... existing fields ...
  
  // Reverse relations for pairing
  summaryPair   TextFilePair? @relation("SummaryFile")
  realtimePair  TextFilePair? @relation("RealtimeFile")
}
```

**Benefits:**
- ✅ Clean separation of concerns
- ✅ Each file can be accessed independently
- ✅ Supports partial pairs (one file missing)
- ✅ Easy to extend with metadata (comparison name, tags, etc.)
- ✅ Deletion cascades properly
- ✅ Backward compatible (existing single files unaffected)

**Drawbacks:**
- ⚠️ Requires migration
- ⚠️ More complex queries

---

### Architecture Option B: Dual File Storage in Single Record

Store both files in a single TextFile record with two encrypted data fields.

#### Database Changes

**Modify TextFile model:**
```prisma
model TextFile {
  // ... existing fields ...
  
  // Primary file
  encryptedData Bytes
  encryptedIV   String
  
  // Secondary file (for comparison)
  encryptedData2 Bytes?
  encryptedIV2   String?
  filename2      String?
  fileSize2      Int?
  
  // Comparison metadata
  isComparisonSet Boolean @default(false)
  comparisonType  String? // "summary-realtime", "before-after", etc.
}
```

**Benefits:**
- ✅ Simpler schema (no new model)
- ✅ Single database record
- ✅ Easier to query and list

**Drawbacks:**
- ❌ Less flexible for future extensions
- ❌ Harder to share/delete individual files
- ❌ Violates single responsibility principle
- ❌ Difficult to support >2 files later

---

## 4. Recommended Implementation Plan (Option A)

### Phase 1: Database Migration

**Step 1.1: Create Prisma Migration**

```bash
# Generate migration
npx prisma migrate dev --name add_text_file_pairs
```

**Step 1.2: Update schema.prisma**

Add `TextFilePair` model and update `TextFile` with reverse relations (see section 3.1).

**Step 1.3: Regenerate Prisma Client**

```bash
npx prisma generate
```

**Step 1.4: Test Migration**

- Verify migration runs successfully
- Check database schema in Prisma Studio
- Ensure existing files still load correctly

---

### Phase 2: Backend API Updates

#### 2.0 Android-Specific Endpoint (NEW)

**POST /api/files/text-pair-android**

This endpoint is designed specifically for Android apps to upload both summary and realtime text content in a single request.

Request (application/json):
```json
{
  "summary": "string (text content for summary file)",
  "realtime": "string (text content for realtime file)",
  "deviceId": "string (uuid or device identifier)",
  "deleteAfterDays": "number (optional, auto-delete period)",
  "pairName": "string (optional, defaults to timestamp)"
}
```

Response (201 Created):
```json
{
  "success": true,
  "pair": {
    "id": "uuid",
    "name": "pairName or auto-generated",
    "summaryFileId": "uuid",
    "realtimeFileId": "uuid",
    "summaryFile": {
      "filename": "summary.txt",
      "fileSize": 1024
    },
    "realtimeFile": {
      "filename": "realtime.txt",
      "fileSize": 2048
    },
    "uploadedAt": "2025-11-20T10:30:00Z"
  }
}
```

**Logic:**
1. Require authentication (JWT token in Authorization header)
2. Validate both `summary` and `realtime` are provided and non-empty
3. Create TextFile record for summary:
   - filename: `{pairName or timestamp}_summary.txt`
   - encryptedData: encrypted summary text
   - origin: "android"
   - fileSize: byte length of summary
4. Create TextFile record for realtime:
   - filename: `{pairName or timestamp}_realtime.txt`
   - encryptedData: encrypted realtime text
   - origin: "android"
   - fileSize: byte length of realtime
5. Create TextFilePair linking both files
6. Apply deleteAfterDays to both files if provided
7. Associate with device if deviceId provided (match against Device.id or Device.deviceId)
8. Create audit log with action `files.upload-pair-android`
9. Emit Socket.IO event `files:pair-uploaded` with pair details
10. Return paired file response

**Error Responses:**
- 400: Missing or empty `summary`/`realtime` fields
- 401: Unauthorized (no valid JWT)
- 413: Content too large (summary + realtime > 100MB)
- 422: Invalid deviceId (device not found)
- 500: Server error

**Advantages over existing Android flow:**
- ✅ Structured endpoint specifically for paired uploads
- ✅ Single API call instead of sending individual JSON payloads
- ✅ Clearer contract for Android developers
- ✅ Automatic TextFilePair creation (no manual linking)
- ✅ Device association handled automatically
- ✅ Consistent with WebUI comparison workflow

#### 2.0.1 Implementation in TypeScript

```typescript
/**
 * @swagger
 * /api/files/text-pair-android:
 *   post:
 *     summary: Upload paired text files from Android app
 *     description: Android app uploads summary and realtime text in a single request. Creates two encrypted files and links them as a pair.
 *     tags: [Files]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - summary
 *               - realtime
 *             properties:
 *               summary:
 *                 type: string
 *                 description: Summary text content
 *                 example: "This is the summary..."
 *               realtime:
 *                 type: string
 *                 description: Realtime text content
 *                 example: "This is the realtime..."
 *               deviceId:
 *                 type: string
 *                 description: Android device UUID or identifier
 *                 example: "550e8400-e29b-41d4-a716-446655440000"
 *               deleteAfterDays:
 *                 type: integer
 *                 description: Number of days before automatic deletion
 *                 example: 30
 *               pairName:
 *                 type: string
 *                 description: Optional friendly name for this comparison set
 *                 example: "Report 2025-11-20"
 *     responses:
 *       201:
 *         description: Paired text files uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 pair:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     summaryFileId:
 *                       type: string
 *                     realtimeFileId:
 *                       type: string
 *                     uploadedAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Bad request - missing or invalid fields
 *       401:
 *         description: Unauthorized
 *       413:
 *         description: Payload too large
 *       500:
 *         description: Internal server error
 */
router.post('/text-pair-android', requireRole('admin', 'user'), async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { summary, realtime, deviceId, deleteAfterDays, pairName } = req.body as {
      summary?: string
      realtime?: string
      deviceId?: string
      deleteAfterDays?: number
      pairName?: string
    }

    const uploadedById = req.user?.userId

    if (!uploadedById) {
      return res.status(401).json({ error: 'User not authenticated' })
    }

    // Validate required fields
    if (!summary || typeof summary !== 'string' || summary.trim().length === 0) {
      return res.status(400).json({ error: 'Field "summary" is required and must be non-empty string' })
    }
    if (!realtime || typeof realtime !== 'string' || realtime.trim().length === 0) {
      return res.status(400).json({ error: 'Field "realtime" is required and must be non-empty string' })
    }

    // Check total payload size (50MB per field to be safe)
    const totalSize = Buffer.byteLength(summary, 'utf8') + Buffer.byteLength(realtime, 'utf8')
    const maxSize = 100 * 1024 * 1024 // 100MB total
    if (totalSize > maxSize) {
      return res.status(413).json({ error: `Payload too large. Maximum 100MB combined, got ${Math.round(totalSize / 1024 / 1024)}MB` })
    }

    // Get user's default deleteAfterDays if not provided
    let finalDeleteAfterDays = deleteAfterDays
    if (finalDeleteAfterDays === undefined) {
      const userSettings = await prisma.userSettings.findUnique({
        where: { userId: uploadedById },
        select: { defaultDeleteAfterDays: true },
      })
      if (userSettings?.defaultDeleteAfterDays !== undefined && userSettings.defaultDeleteAfterDays !== null) {
        finalDeleteAfterDays = userSettings.defaultDeleteAfterDays
      } else {
        const systemSetting = await prisma.systemConfig.findUnique({ where: { key: 'system:autoDeleteDays' } }).catch(() => null)
        if (systemSetting) {
          try {
            const parsed = JSON.parse(systemSetting.value)
            finalDeleteAfterDays = typeof parsed === 'number' ? parsed : Number(parsed)
          } catch {
            finalDeleteAfterDays = undefined
          }
        }
      }
    }

    // Resolve deviceId
    let resolvedDeviceId: string | null = null
    if (deviceId) {
      const deviceById = await prisma.device.findUnique({ where: { id: String(deviceId) } }).catch(() => null)
      if (deviceById) {
        resolvedDeviceId = deviceById.id
      } else {
        const deviceByDeviceId = await prisma.device.findFirst({ where: { deviceId: String(deviceId) } }).catch(() => null)
        if (deviceByDeviceId) {
          resolvedDeviceId = deviceByDeviceId.id
        }
      }
    }

    // Verify uploader exists
    const uploaderExists = await prisma.user.findUnique({ where: { id: uploadedById } }).catch(() => null)
    const resolvedUploadedById = uploaderExists ? uploadedById : null

    // Generate pair name
    const finalPairName = pairName && pairName.trim() ? pairName.trim() : `Comparison ${new Date().toISOString().split('T')[0]}`

    // Encrypt both texts
    const summaryBuffer = Buffer.from(summary, 'utf8')
    const realtimeBuffer = Buffer.from(realtime, 'utf8')
    const { encryptedData: encryptedSummary, encryptedIV: summaryIV } = encrypt(summaryBuffer)
    const { encryptedData: encryptedRealtime, encryptedIV: realtimeIV } = encrypt(realtimeBuffer)

    // Create both TextFile records and TextFilePair in transaction
    const pair = await prisma.$transaction(async (tx) => {
      // Create summary file
      const summaryFile = await tx.textFile.create({
        data: {
          filename: `${finalPairName}_summary.txt`,
          originalName: `${finalPairName}_summary.txt`,
          fileSize: summaryBuffer.length,
          encryptedData: encryptedSummary,
          encryptedIV: summaryIV,
          mimeType: 'text/plain',
          encoding: 'utf-8',
          lineCount: summary.split('\n').length,
          wordCount: summary.split(/\s+/).filter((w) => w.length > 0).length,
          origin: 'android',
          deviceId: resolvedDeviceId,
          uploadedById: resolvedUploadedById,
          deleteAfterDays: finalDeleteAfterDays ? Number(finalDeleteAfterDays) : null,
          scheduledDeleteAt: finalDeleteAfterDays
            ? new Date(Date.now() + Number(finalDeleteAfterDays) * 24 * 60 * 60 * 1000)
            : null,
        },
      })

      // Create realtime file
      const realtimeFile = await tx.textFile.create({
        data: {
          filename: `${finalPairName}_realtime.txt`,
          originalName: `${finalPairName}_realtime.txt`,
          fileSize: realtimeBuffer.length,
          encryptedData: encryptedRealtime,
          encryptedIV: realtimeIV,
          mimeType: 'text/plain',
          encoding: 'utf-8',
          lineCount: realtime.split('\n').length,
          wordCount: realtime.split(/\s+/).filter((w) => w.length > 0).length,
          origin: 'android',
          deviceId: resolvedDeviceId,
          uploadedById: resolvedUploadedById,
          deleteAfterDays: finalDeleteAfterDays ? Number(finalDeleteAfterDays) : null,
          scheduledDeleteAt: finalDeleteAfterDays
            ? new Date(Date.now() + Number(finalDeleteAfterDays) * 24 * 60 * 60 * 1000)
            : null,
        },
      })

      // Create pair linking both files
      const textPair = await tx.textFilePair.create({
        data: {
          name: finalPairName,
          summaryFileId: summaryFile.id,
          realtimeFileId: realtimeFile.id,
          uploadedById: resolvedUploadedById,
        },
      })

      return { textPair, summaryFile, realtimeFile }
    })

    // Create audit log
    try {
      await prisma.auditLog.create({
        data: {
          userId: resolvedUploadedById,
          action: 'files.upload-pair-android',
          resource: 'text-pair',
          resourceId: pair.textPair.id,
          details: {
            pairName: finalPairName,
            summaryFileId: pair.summaryFile.id,
            realtimeFileId: pair.realtimeFile.id,
            summarySize: pair.summaryFile.fileSize,
            realtimeSize: pair.realtimeFile.fileSize,
            deviceId: resolvedDeviceId,
          },
          ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
          userAgent: req.headers['user-agent'] || 'unknown',
          success: true,
        },
      })
    } catch (logErr) {
      logger.error('Failed to create audit log for android pair upload', logErr)
    }

    // Emit socket event for real-time UI updates
    try {
      const io = getIo()
      const payload = {
        action: 'file.pair-uploaded',
        pairId: pair.textPair.id,
        pairName: finalPairName,
        uploadedById: resolvedUploadedById,
        uploadedAt: pair.textPair.createdAt.toISOString(),
      }
      io.to(userRoom(resolvedUploadedById || '')).emit('files:pair-uploaded', payload)
    } catch (emitErr) {
      logger.debug('Socket emit failed for pair upload', { err: (emitErr as Error).message })
    }

    return res.status(201).json({
      success: true,
      pair: {
        id: pair.textPair.id,
        name: pair.textPair.name,
        summaryFileId: pair.summaryFile.id,
        realtimeFileId: pair.realtimeFile.id,
        summaryFile: {
          filename: pair.summaryFile.filename,
          fileSize: pair.summaryFile.fileSize,
        },
        realtimeFile: {
          filename: pair.realtimeFile.filename,
          fileSize: pair.realtimeFile.fileSize,
        },
        uploadedAt: pair.textPair.createdAt.toISOString(),
      },
    })
  } catch (error) {
    logger.error('Error uploading text pair from Android:', error)
    return res.status(500).json({ error: 'Failed to upload text pair' })
  }
})
```

---

### Phase 2: Backend API Updates (Updated)

**Step 2.1: Web/UI Endpoint - Upload Paired Files (File Upload)**

**POST /api/files/text-pair**

This endpoint is for the WebUI - accepts file uploads via multipart/form-data.

Request (multipart/form-data):
```
name: string (comparison set name)
summaryFile: File (optional)
realtimeFile: File (optional)
deviceId: string (optional)
deleteAfterDays: number (optional)
```

Response:
```json
{
  "success": true,
  "pair": {
    "id": "uuid",
    "name": "Comparison 2025-11-20",
    "summaryFileId": "uuid",
    "realtimeFileId": "uuid",
    "uploadedAt": "2025-11-20T10:30:00Z"
  }
}
```

**Logic:**
1. Validate at least one file is provided
2. Encrypt and create TextFile record for summary (if provided)
3. Encrypt and create TextFile record for realtime (if provided)
4. Create TextFilePair linking both files
5. Apply deleteAfterDays to both files
6. Create audit log
7. Emit Socket.IO event for real-time UI update

**Implementation:** Similar to `/api/files/text-pair-android` (Phase 2.0) but:
- Accepts multipart/form-data instead of application/json
- Reads files from form fields instead of text content
- Filenames come from uploaded files (not auto-generated)

**Step 2.2: Update Existing Endpoints

**GET /api/files/all - Include Pairs**

Response update:
```json
{
  "success": true,
  "audio": [...],
  "text": [...],
  "textPairs": [
    {
      "id": "uuid",
      "name": "Comparison 2025-11-20",
      "summaryFile": { "id": "uuid", "filename": "summary.txt", ... },
      "realtimeFile": { "id": "uuid", "filename": "realtime.txt", ... },
      "uploadedBy": { ... },
      "createdAt": "..."
    }
  ],
  "count": 123
}
```

**GET /api/files/text-pair/:id - Get Pair Details**

Response:
```json
{
  "success": true,
  "pair": {
    "id": "uuid",
    "name": "Comparison Set",
    "summaryFile": { "id": "uuid", "filename": "summary.txt", ... },
    "realtimeFile": { "id": "uuid", "filename": "realtime.txt", ... },
    "uploadedAt": "..."
  }
}
```

**GET /api/files/text-pair/:id/compare - Get Decrypted Content**

Response:
```json
{
  "success": true,
  "summary": "decrypted text content...",
  "realtime": "decrypted text content...",
  "summaryFile": { "filename": "summary.txt", "fileSize": 1024 },
  "realtimeFile": { "filename": "realtime.txt", "fileSize": 2048 }
}
```

**DELETE /api/files/text-pair/:id**

- Delete pair record
- Cascade deletes both linked TextFile records
- Create audit log
- Check ownership/permissions

**Step 2.3: Swagger Documentation**

Update `/src/config/swagger.ts` with new endpoint schemas.

---

### Phase 3: Frontend Updates

**Step 3.1: Update Upload UI**

Add new button in `FilesPage.tsx`:
```tsx
<button onClick={openPairUploadModal}>
  <Upload className="h-4 w-4" />
  Upload Comparison (2 Files)
</button>
```

**Step 3.2: Create Upload Modal**

New component: `UploadPairModal.tsx`

Features:
- Text input for comparison name
- Drag-drop or file input for "Summary File" (optional)
- Drag-drop or file input for "Realtime File" (optional)
- Auto-delete days input
- Validation: at least one file required
- Loading state during upload
- Success/error toast notifications

**Step 3.3: Update File List Display**

Modify `FilesPage.tsx` table:
- Add new section or row type for paired files
- Show pair name with expandable view
- Display both filenames with icons
- "View Comparison" button opens split view modal

**Step 3.4: Create Comparison View Modal**

New component: `ComparisonViewModal.tsx`

Features:
- Two-column layout (50/50 split)
- Left: Summary file content
- Right: Realtime file content
- Synchronized scrolling (optional enhancement)
- Download buttons for each file
- Copy to clipboard buttons
- Full-screen option
- Handle missing file gracefully (show message)

**Step 3.5: Update API Client**

Add to `/client/src/lib/api.ts`:
```typescript
export const textPairsApi = {
  uploadPair: (data: {
    name: string
    summaryFile?: File
    realtimeFile?: File
    deleteAfterDays?: number
  }) => {
    const formData = new FormData()
    formData.append('name', data.name)
    if (data.summaryFile) formData.append('summaryFile', data.summaryFile)
    if (data.realtimeFile) formData.append('realtimeFile', data.realtimeFile)
    if (data.deleteAfterDays) formData.append('deleteAfterDays', String(data.deleteAfterDays))
    return api.post('/api/files/text-pair', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  
  list: () => api.get('/api/files/text-pair'),
  
  get: (id: string) => api.get(`/api/files/text-pair/${id}`),
  
  getComparison: (id: string) => 
    api.get(`/api/files/text-pair/${id}/compare`),
  
  delete: (id: string) => api.delete(`/api/files/text-pair/${id}`),
}
```

---

### Phase 4: Android Integration (IMPLEMENTED in Phase 2)

**Android app integration with dedicated REST endpoint:**

The Android app can now use the dedicated `POST /api/files/text-pair-android` endpoint (implemented in Phase 2.0) to upload both summary and realtime in a single HTTP request.

**Kotlin Example (Android):**
```kotlin
// After user is authenticated (have JWT token)
val summary = "Summary text from analysis..."
val realtime = "Realtime monitoring data..."
val deviceId = sharedPreferences.getString("device_id", UUID.randomUUID().toString())
val pairName = "Analysis ${SimpleDateFormat("yyyy-MM-dd").format(Date())}"

val payload = JSONObject().apply {
  put("summary", summary)
  put("realtime", realtime)
  put("deviceId", deviceId)
  put("deleteAfterDays", 30)
  put("pairName", pairName)
}

val request = Request.Builder()
  .url("http://192.168.x.x:3000/api/files/text-pair-android")
  .post(RequestBody.create(MediaType.parse("application/json"), payload.toString()))
  .addHeader("Authorization", "Bearer $jwtToken")
  .build()

client.newCall(request).enqueue(object : Callback {
  override fun onResponse(call: Call, response: Response) {
    val result = JSONObject(response.body()!!.string())
    if (result.optBoolean("success")) {
      val pairId = result.getJSONObject("pair").getString("id")
      // Handle success - pair uploaded
      showToast("Comparison uploaded successfully")
    } else {
      showToast("Upload failed: ${result.optString("error")}")
    }
  }
  
  override fun onFailure(call: Call, e: IOException) {
    showToast("Upload error: ${e.message}")
  }
})
```

**Socket.IO Alternative (if direct WebSocket upload needed):**

Optional Socket.IO event handler for real-time streaming (future enhancement):
```
Event: `file:upload-pair-stream`
Payload: { name, summary, realtime, deviceId, deleteAfterDays }
```

---

**Key Benefits of REST Endpoint over Socket.IO:**
- ✅ Simpler HTTP request (no Socket.IO client complexity)
- ✅ Better error handling with standard HTTP status codes
- ✅ Works through any network (proxies, firewalls)
- ✅ Easier to debug with standard tools (curl, Postman, etc.)
- ✅ Compatible with existing authentication (JWT Bearer token)
- ✅ Async/non-blocking upload workflow

---

## 5. Edge Cases & Considerations

### 5.1 Partial Pairs

**Scenario:** User uploads only summary OR only realtime

**Solution:**
- Allow null values for either file in TextFilePair
- UI shows message: "Realtime file not provided" with option to upload
- Add endpoint: `PUT /api/files/text-pair/:id/add-file`

### 5.2 File Sharing

**Question:** Should paired files be shared together or independently?

**Recommendation:**
- Share as a unit (both files together)
- Update `FileShare` model to support `textPairId` field
- OR keep existing file-level sharing (more granular)

### 5.3 Auto-Delete Synchronization

**Issue:** What if two files have different deleteAfterDays?

**Solution:**
- Apply same deleteAfterDays to both files in a pair
- Use the earliest scheduledDeleteAt date
- OR allow independent deletion (less intuitive)

### 5.4 Migration of Existing Android Files

**Question:** Should we migrate existing TextFiles with androidSummary/androidRealtime to pairs?

**Recommendation:**
- Create optional data migration script
- Run AFTER deployment to avoid downtime
- Keep original records intact (backward compatibility)

**Migration Script:**
```sql
-- Example (pseudo-SQL)
-- For each TextFile where androidSummary IS NOT NULL AND androidRealtime IS NOT NULL:
-- 1. Create two new TextFile records (one for summary, one for realtime)
-- 2. Create TextFilePair linking them
-- 3. Mark original file with migration flag (optional)
```

### 5.5 Search & Filtering

**Enhancement:** Allow searching within paired files

**Implementation:**
- Add full-text search on decrypted content (challenging with encryption)
- OR index keywords/metadata on upload
- OR client-side search after fetching comparison

### 5.6 Performance

**Consideration:** Decrypting two files simultaneously

**Optimization:**
- Lazy load: only decrypt when comparison view opened
- Cache decrypted content in memory (short TTL)
- Add loading indicators
- Consider streaming for large files

---

## 6. Security Considerations

### 6.1 Encryption

- Both files encrypted with AES-256
- Separate IVs for each file
- Maintain same security model as existing TextFile

### 6.2 Access Control

- Only owner and admins can view paired files
- Respect existing RBAC system
- Share permissions propagate to both files

### 6.3 Audit Logging

Log events:
- `files.upload-pair` (create)
- `files.view-pair-comparison` (view)
- `files.delete-pair` (delete)
- `files.share-pair` (share)

---

## 7. Testing Plan

### 7.1 Unit Tests

- [ ] TextFilePair model CRUD operations
- [ ] File upload with various combinations (both, summary only, realtime only)
- [ ] Encryption/decryption integrity
- [ ] Deletion cascades correctly

### 7.2 Integration Tests

- [ ] POST /api/files/text-pair with multipart/form-data
- [ ] GET /api/files/text-pair/:id/compare returns correct content
- [ ] DELETE /api/files/text-pair/:id removes both files
- [ ] Permissions enforced (non-owner cannot access)

### 7.3 E2E Tests

- [ ] Upload two files via WebUI
- [ ] View comparison side-by-side
- [ ] Download both files individually
- [ ] Delete pair and verify removal
- [ ] Upload with only one file shows appropriate message

### 7.4 Manual Test Scenarios

#### WebUI Scenarios:

1. **Happy Path (WebUI):**
   - Upload summary.txt (1KB) + realtime.txt (2KB)
   - Set name: "Test Comparison"
   - View in split-screen
   - Verify content matches uploaded files

2. **Partial Upload (WebUI):**
   - Upload only summary.txt
   - View comparison
   - Verify "Realtime file not provided" message shown

3. **Large Files (WebUI):**
   - Upload 10MB + 15MB files
   - Verify upload progress
   - Check decryption performance

4. **Permission Test:**
   - User A uploads pair
   - User B (non-admin) attempts to access
   - Verify 403 Forbidden

5. **Auto-Delete:**
   - Upload pair with deleteAfterDays = 1
   - Wait for scheduler
   - Verify both files and pair deleted

#### Android Scenarios:

6. **Android Happy Path:**
   - Call `POST /api/files/text-pair-android` with:
     - `summary`: "Summary analysis text..."
     - `realtime`: "Realtime monitoring data..."
     - `deviceId`: "android-device-uuid"
     - `deleteAfterDays`: 30
     - `pairName`: "Analysis 2025-11-20"
   - Verify 201 response with pair ID
   - Check database has two TextFile records with origin='android'
   - Verify TextFilePair created with correct links

7. **Android Missing Summary:**
   - Call endpoint without `summary` field
   - Verify 400 error: "Field 'summary' is required"

8. **Android Empty Realtime:**
   - Call endpoint with `realtime: ""`
   - Verify 400 error: "Field 'realtime' must be non-empty"

9. **Android Payload Too Large:**
   - Call endpoint with combined text > 100MB
   - Verify 413 error with size information

10. **Android Auto-generated Name:**
    - Call endpoint without `pairName`
    - Verify pair name defaults to "Comparison YYYY-MM-DD" format

11. **Android Device Resolution:**
    - Call endpoint with `deviceId` that exists in Device table
    - Verify files linked to correct device
    - Call with non-existent device ID
    - Verify files still created but deviceId set to null

12. **Android Audit Logging:**
    - Upload pair via Android endpoint
    - Check AuditLog has action='files.upload-pair-android'
    - Verify details include pair ID, file sizes, device info

---

## 8. Rollout Strategy

### Phase 1: Backend Foundation (Week 1)
- [ ] Create and test database migration
- [ ] Implement POST /api/files/text-pair-android endpoint (Android REST API)
- [ ] Implement POST /api/files/text-pair endpoint (WebUI file upload API)
- [ ] Implement GET /api/files/text-pair/:id/compare
- [ ] Add unit tests for both endpoints

### Phase 2: Backend Integration (Week 1-2)
- [ ] Update GET /api/files/all to include pairs
- [ ] Implement DELETE endpoint
- [ ] Add audit logging
- [ ] Update Swagger docs
- [ ] Test Android integration with sample requests

### Phase 3: Frontend MVP (Week 2)
- [ ] Create upload modal UI (for WebUI)
- [ ] Update file list to show pairs
- [ ] Basic comparison view modal
- [ ] API client integration
- [ ] Test with Android backend endpoint

### Phase 4: Frontend Polish (Week 3)
- [ ] Improve comparison UX (synchronized scroll, syntax highlighting)
- [ ] Add download/copy features
- [ ] Loading states and error handling
- [ ] Mobile responsive design

### Phase 5: Testing & Deployment (Week 3-4)
- [ ] E2E testing (WebUI)
- [ ] Android integration testing (with sample app or Postman)
- [ ] Performance testing with large files
- [ ] Security audit
- [ ] Documentation updates
- [ ] Deployment to production

### Phase 6: Optional Enhancements (Future)
- [ ] Full Android app integration (if not started in Phase 1)
- [ ] Migration script for existing Android files
- [ ] Full-text search
- [ ] Version history for pairs
- [ ] Export to PDF/comparison format

---

## 9. Open Questions for Discussion

1. **API Endpoint Design Decisions:**
   - ✅ **DECIDED:** Separate REST endpoint for Android (`/api/files/text-pair-android`) accepting JSON body with text content
   - ✅ **DECIDED:** Separate multipart endpoint for WebUI (`/api/files/text-pair`) accepting file uploads
   - Alternative considered: Single polymorphic endpoint (rejected - less clear contract)

2. **Naming Convention:**
   - Should we call it "Text Pair", "Comparison Set", "Dual Upload", or something else?
   - Current suggestion: "Text File Comparison" (user-facing), "TextFilePair" (technical)

3. **UI Placement:**
   - Should paired files appear in the same table as regular files or separate section?
   - Recommendation: Same table with visual indicator (icon/badge)

4. **File Limit:**
   - Should we enforce a maximum file size for comparisons (e.g., 50MB each)?
   - Current limit: 50MB per file for WebUI, 100MB combined for Android

5. **Default Behavior:**
   - When viewing a standalone TextFile that's part of a pair, show link to full comparison?
   - Recommendation: Yes, add badge "Part of comparison: [name]"

6. **Backward Compatibility:**
   - Keep existing "Compare" feature for Android-origin files with androidSummary/androidRealtime?
   - Recommendation: Yes, maintain both workflows for gradual migration

7. **Android Implementation Timeline:**
   - Should Android app implement `/api/files/text-pair-android` immediately, or keep using Socket.IO?
   - Recommendation: Implement REST endpoint first (simpler), then migrate from Socket.IO if needed

---

## 10. Success Criteria

**Feature is considered complete when:**

✅ Users can upload two text files simultaneously from WebUI  
✅ Paired files appear in file list with clear visual distinction  
✅ Comparison view shows both files side-by-side  
✅ Either or both files can be omitted (partial pairs)  
✅ Download works for individual files within a pair  
✅ Deletion removes both files and the pair record  
✅ Auto-delete applies to both files  
✅ Permissions/sharing work correctly  
✅ Audit logs capture all pair-related actions  
✅ Existing single-file uploads still work  
✅ No breaking changes to API or database for existing features  
✅ Documentation updated (API docs, user guide)  
✅ Unit + integration tests pass  

---

## 11. Alternative Approaches (Considered & Rejected)

### Alternative 1: Tags/Categories System
- Add `category` field to TextFile: "summary" | "realtime" | "standalone"
- Group files by `groupId` field
- **Rejected:** Too generic, harder to enforce pairing rules

### Alternative 2: Store as ZIP Archive
- Upload ZIP containing summary.txt + realtime.txt
- Extract and store as single file
- **Rejected:** Loses individual file metadata, harder to share/delete selectively

### Alternative 3: Embedded JSON Structure
- Store both texts in `androidSummary`/`androidRealtime` JSON fields for web uploads too
- **Rejected:** Mixes web and Android upload models, less flexible

---

## 12. Dependencies & Prerequisites

**Before starting implementation:**

- [x] Prisma ORM installed and configured
- [x] Multer configured for file uploads
- [x] Encryption utilities (`encrypt`, `decrypt`) tested
- [x] Authentication middleware working
- [x] Audit logging system functional
- [ ] Review and approve this plan
- [ ] Allocate development time
- [ ] Create feature branch: `feature/dual-text-comparison`

---

## 13. Documentation Requirements

**Update these documents:**
- [ ] README.md - Add feature description
- [ ] API documentation (Swagger)
- [ ] User guide (how to upload/view comparisons)
- [ ] Developer guide (schema, endpoints, components)
- [ ] Android integration guide (if Phase 4 implemented)

---

## 14. Monitoring & Observability

**Metrics to track:**
- Number of paired uploads per day
- Comparison views per day
- Average file sizes in pairs
- Performance: time to decrypt and serve comparison
- Error rates (upload failures, decryption errors)

**Logging:**
- Log all pair CRUD operations
- Log comparison view events
- Log errors with context (file IDs, user ID, error type)

---

## 15. Future Enhancements (Post-MVP)

1. **Diff View:** Highlight differences between summary and realtime
2. **Version Control:** Track changes to paired files over time
3. **Batch Upload:** Upload multiple pairs in one operation
4. **Export:** Download comparison as PDF or merged document
5. **Templates:** Pre-populate comparison names based on patterns
6. **Syntax Highlighting:** Detect file type and apply syntax highlighting
7. **Collaborative Editing:** Allow team members to annotate comparisons
8. **AI Analysis:** Integrate with local AI (Ollama) to summarize differences

---

## 16. Sign-Off

**Prepared by:** GitHub Copilot (AI Assistant)  
**Reviewed by:** _[Your Name]_  
**Approved by:** _[Your Name]_  
**Date:** November 20, 2025

**Next Steps:**
1. Review this plan and provide feedback
2. Approve or request modifications
3. Create feature branch
4. Begin Phase 1 implementation

---

**END OF PLAN**
