# Dual Text File Comparison - API Design Summary

**Date:** November 20, 2025  
**Document:** Overview of two-endpoint approach for text pair uploads

---

## Two Distinct Endpoints

Based on your requirement that:
- **Android app**: sends request with both `summary` and `realtime` in ONE request
- **WebUI**: uploads ONE file at a time

We recommend **TWO separate endpoints**:

---

## Endpoint 1: For Android App

### `POST /api/files/text-pair-android`

**Purpose:** Android app uploads both summary AND realtime in a single JSON request

**Request Type:** `application/json`

```json
{
  "summary": "Summary text content here...",
  "realtime": "Realtime text content here...",
  "deviceId": "device-uuid",
  "deleteAfterDays": 30,
  "pairName": "Analysis 2025-11-20"
}
```

**Response:** 201 Created
```json
{
  "success": true,
  "pair": {
    "id": "pair-uuid",
    "name": "Analysis 2025-11-20",
    "summaryFileId": "file-uuid-1",
    "realtimeFileId": "file-uuid-2",
    "uploadedAt": "2025-11-20T10:30:00Z"
  }
}
```

**Key Features:**
- ✅ Single HTTP request
- ✅ JSON payload (easy in Android)
- ✅ Automatic TextFilePair creation
- ✅ No file upload complexity
- ✅ Device tracking included
- ✅ Clear error messages (HTTP status codes)

**Documentation:** See `ANDROID_TEXT_PAIR_API.md`

---

## Endpoint 2: For WebUI (File Upload)

### `POST /api/files/text-pair`

**Purpose:** WebUI user uploads ONE OR TWO files (summary.txt, realtime.txt, or both)

**Request Type:** `multipart/form-data`

```
name: "My Comparison"
summaryFile: <file (optional)>
realtimeFile: <file (optional)>
deleteAfterDays: 30
deviceId: "device-uuid"
```

**Response:** 201 Created
```json
{
  "success": true,
  "pair": {
    "id": "pair-uuid",
    "name": "My Comparison",
    "summaryFileId": "file-uuid-1",
    "realtimeFileId": "file-uuid-2",
    "uploadedAt": "2025-11-20T10:30:00Z"
  }
}
```

**Key Features:**
- ✅ Supports partial uploads (only summary OR only realtime)
- ✅ File upload via form (browser standard)
- ✅ Uses actual filenames from upload
- ✅ Optional pairing (user can upload just one)
- ✅ Automatic TextFilePair creation

---

## Database Schema Impact

Both endpoints create the same database structures:

### TextFile Records (2 per pair)
- One for summary content
- One for realtime content
- Each encrypted separately with AES-256
- Both have `origin: "android"` (for Android endpoint) or `origin: "web"` (for WebUI)

### TextFilePair Record (1 per pair)
- Links the two TextFile records
- Stores pair name, timestamps, owner
- Enables cascade deletion (delete pair = delete both files)

### Audit Log Entry
- `action: "files.upload-pair-android"` (for Android endpoint)
- `action: "files.upload-pair-web"` (for WebUI endpoint)
- Tracks who uploaded, when, file sizes, etc.

---

## User Workflow Comparison

### Android User
1. App captures or generates summary text
2. App captures or generates realtime text
3. App calls `POST /api/files/text-pair-android` with both
4. Backend creates pair immediately
5. App receives pair ID and confirms to user

### WebUI User
1. User selects "Upload Comparison (2 Files)" button
2. Dialog appears:
   - "Summary File (optional)" - drag drop or click to select
   - "Realtime File (optional)" - drag drop or click to select
   - "Comparison Name" - text input
   - "Auto-delete after N days" - number input
3. User selects one or both files
4. User clicks "Upload"
5. Page submits to `POST /api/files/text-pair`
6. Backend creates pair with uploaded file(s)
7. UI refreshes to show new pair in list

---

## Comparison: Android vs WebUI

| Feature | Android Endpoint | WebUI Endpoint |
|---------|------------------|----------------|
| **Protocol** | REST JSON | REST multipart |
| **Data Type** | Text strings | File uploads |
| **Requests** | 1 | 1 (for both files) |
| **Required Fields** | summary + realtime | at least 1 file |
| **Filenames** | Auto-generated | From uploaded files |
| **Pair Creation** | Automatic | Automatic |
| **Authentication** | JWT Bearer token | JWT Bearer token |
| **Error Handling** | HTTP status codes | HTTP status codes |
| **Ideal For** | Android app | Web browser |

---

## Implementation Order

### Phase 1: Database & Android Endpoint (Week 1)
1. Create database migration (add TextFilePair model)
2. Implement `POST /api/files/text-pair-android` 
3. Add tests for Android endpoint
4. Test with Postman or curl

### Phase 2: WebUI Endpoint & Integration (Week 1-2)
5. Implement `POST /api/files/text-pair` (multipart)
6. Update `GET /api/files/all` to include pairs
7. Update Swagger documentation

### Phase 3: Frontend (Week 2-3)
8. Add upload modal to FilesPage
9. Add comparison view modal
10. Update file list to show pairs

### Phase 4: Testing & Polish (Week 3-4)
11. E2E testing
12. Android app testing
13. Performance testing
14. Deploy to production

---

## Benefits of This Design

### Separation of Concerns
- Each endpoint optimized for its use case (JSON vs multipart)
- Clear contract for each client (Android vs WebUI)
- Different validation rules per endpoint

### User Experience
- Android: Simple single request, no file system involved
- WebUI: Familiar file upload interface

### Flexibility
- Either or both files can be provided (WebUI)
- Both files required (Android) - simpler contract
- Easy to add other formats later (audio pair, mixed media, etc.)

### Maintainability
- Clear endpoint purpose
- Easier to debug (specific to each platform)
- Independent versioning if needed
- Better audit trail (different action names)

---

## Security

Both endpoints:
- ✅ Require authentication (JWT)
- ✅ Encrypt data with AES-256
- ✅ Validate input size (100MB combined)
- ✅ Create audit logs
- ✅ Respect RBAC (role-based access control)
- ✅ Enforce ownership (only owner can view)

---

## Documentation Files Created

1. **`DUAL_TEXT_FILE_COMPARISON_PLAN.md`** - Updated with:
   - Android endpoint specification in Phase 2.0
   - Kotlin code examples
   - Android-specific test scenarios
   - Combined Android + WebUI testing

2. **`ANDROID_TEXT_PAIR_API.md`** - Comprehensive guide:
   - Full endpoint specification
   - Request/response examples
   - Field specifications
   - Android implementation examples
   - cURL testing examples
   - Troubleshooting guide
   - Error handling patterns

---

## Next Steps

1. ✅ **Review Plan** - Look at updated `DUAL_TEXT_FILE_COMPARISON_PLAN.md`
2. ✅ **Review API Docs** - Look at new `ANDROID_TEXT_PAIR_API.md`
3. ⏭️ **Approve Design** - Confirm you're happy with two-endpoint approach
4. ⏭️ **Start Phase 1** - Create database migration
5. ⏭️ **Implement Android Endpoint** - Implement POST /api/files/text-pair-android
6. ⏭️ **Test** - Use curl/Postman to verify endpoint works
7. ⏭️ **Then WebUI** - Implement multipart endpoint and frontend

---

**Questions?** Review the documentation or let me know what needs clarification!
