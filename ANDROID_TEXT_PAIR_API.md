# Android Text Pair Upload API

**Endpoint:** `POST /api/files/text-pair-android`  
**Authentication:** Required (Bearer JWT token)  
**Content-Type:** `application/json`

---

## Overview

This API endpoint is specifically designed for Android apps to upload both **summary** and **realtime** text content in a single request. The backend automatically:

1. Encrypts both texts with AES-256
2. Creates two separate TextFile records
3. Links them as a TextFilePair for comparison
4. Handles device association
5. Applies auto-delete policies
6. Logs the action for audit trail

**Benefits over file upload:**
- ✅ Single HTTP request (no file upload complexity)
- ✅ JSON payload (easy to construct)
- ✅ Automatic pairing (no manual linking)
- ✅ Device tracking built-in
- ✅ Consistent with WebUI workflow
- ✅ Clear error messages

---

## Request Format

### HTTP Method & URL
```
POST http://{server-ip}:{port}/api/files/text-pair-android
```

Example:
```
POST http://192.168.1.100:3000/api/files/text-pair-android
```

### Headers
```
Content-Type: application/json
Authorization: Bearer {jwt_token}
```

### Request Body (JSON)

**Required Fields:**
```json
{
  "summary": "string (text content for summary)",
  "realtime": "string (text content for realtime)"
}
```

**Optional Fields:**
```json
{
  "deviceId": "string (device UUID or identifier)",
  "deleteAfterDays": "number (auto-delete period in days)",
  "pairName": "string (friendly name for comparison set)"
}
```

### Complete Example Request

```json
{
  "summary": "Device status: CPU 45%, Memory 60%, Temperature 52°C\nUptime: 45 days\nLast reboot: 2025-11-15",
  "realtime": "2025-11-20 10:30:45 - CPU 45%\n2025-11-20 10:30:46 - Memory 60%\n2025-11-20 10:30:47 - Temp 52°C",
  "deviceId": "550e8400-e29b-41d4-a716-446655440000",
  "deleteAfterDays": 30,
  "pairName": "Device Analysis 2025-11-20"
}
```

---

## Field Specifications

### `summary` (required, string)
- Text content for the summary file
- Must be non-empty
- Minimum 1 character
- No maximum limit (but combined with realtime must be ≤ 100MB)
- UTF-8 encoding supported
- Special characters and newlines allowed

### `realtime` (required, string)
- Text content for the realtime file
- Must be non-empty
- Minimum 1 character
- No maximum limit (but combined with summary must be ≤ 100MB)
- UTF-8 encoding supported
- Special characters and newlines allowed

### `deviceId` (optional, string)
- Android device UUID or identifier
- Must match existing Device in database (if device doesn't exist, files are still created but not linked to device)
- Format: UUID recommended (e.g., `550e8400-e29b-41d4-a716-446655440000`)
- If not provided: files created without device association

### `deleteAfterDays` (optional, number)
- Number of days before automatic deletion
- Must be positive integer (> 0)
- If not provided: uses user's default setting or system default
- Special value: `null` or omitted = never auto-delete

### `pairName` (optional, string)
- Friendly name for this comparison set
- Maximum 255 characters
- If not provided: auto-generated as `Comparison YYYY-MM-DD`
- Examples: "Device Analysis 2025-11-20", "Report A vs Report B"

---

## Response Formats

### Success Response (201 Created)

```json
{
  "success": true,
  "pair": {
    "id": "uuid-of-pair-record",
    "name": "Device Analysis 2025-11-20",
    "summaryFileId": "uuid-of-summary-file",
    "realtimeFileId": "uuid-of-realtime-file",
    "summaryFile": {
      "filename": "Device Analysis 2025-11-20_summary.txt",
      "fileSize": 142
    },
    "realtimeFile": {
      "filename": "Device Analysis 2025-11-20_realtime.txt",
      "fileSize": 187
    },
    "uploadedAt": "2025-11-20T10:30:00.123Z"
  }
}
```

### Error Responses

#### 400 Bad Request - Missing/Empty Summary
```json
{
  "error": "Field \"summary\" is required and must be non-empty string"
}
```

#### 400 Bad Request - Missing/Empty Realtime
```json
{
  "error": "Field \"realtime\" is required and must be non-empty string"
}
```

#### 401 Unauthorized - No JWT Token
```json
{
  "error": "User not authenticated"
}
```

#### 401 Unauthorized - Invalid Token
```json
{
  "error": "Unauthorized"
}
```

#### 413 Payload Too Large
```json
{
  "error": "Payload too large. Maximum 100MB combined, got 156MB"
}
```

#### 500 Internal Server Error
```json
{
  "error": "Failed to upload text pair"
}
```

---

## Usage Example (Android Kotlin)

### Basic Implementation

```kotlin
import okhttp3.*
import org.json.JSONObject
import com.google.gson.Gson

class TextPairUploader(
  private val client: OkHttpClient,
  private val jwtToken: String,
  private val serverUrl: String = "http://192.168.1.100:3000"
) {
  fun uploadTextPair(
    summary: String,
    realtime: String,
    deviceId: String,
    deleteAfterDays: Int? = 30,
    pairName: String? = null,
    callback: (success: Boolean, pairId: String?, error: String?) -> Unit
  ) {
    val payload = JSONObject().apply {
      put("summary", summary)
      put("realtime", realtime)
      put("deviceId", deviceId)
      if (deleteAfterDays != null) put("deleteAfterDays", deleteAfterDays)
      if (pairName != null) put("pairName", pairName)
    }

    val requestBody = RequestBody.create(
      MediaType.parse("application/json"),
      payload.toString()
    )

    val request = Request.Builder()
      .url("$serverUrl/api/files/text-pair-android")
      .post(requestBody)
      .addHeader("Authorization", "Bearer $jwtToken")
      .addHeader("Content-Type", "application/json")
      .build()

    client.newCall(request).enqueue(object : Callback {
      override fun onResponse(call: Call, response: Response) {
        val responseBody = response.body()?.string() ?: ""
        
        if (response.isSuccessful && response.code() == 201) {
          try {
            val result = JSONObject(responseBody)
            val pairId = result.getJSONObject("pair").getString("id")
            callback(true, pairId, null)
          } catch (e: Exception) {
            callback(false, null, "Failed to parse response: ${e.message}")
          }
        } else {
          try {
            val error = JSONObject(responseBody).optString("error", "Unknown error")
            callback(false, null, error)
          } catch (e: Exception) {
            callback(false, null, "HTTP ${response.code()}: $responseBody")
          }
        }
      }

      override fun onFailure(call: Call, e: IOException) {
        callback(false, null, "Network error: ${e.message}")
      }
    })
  }
}
```

### Usage

```kotlin
// Initialize uploader
val uploader = TextPairUploader(
  client = OkHttpClient(),
  jwtToken = "eyJhbGc...", // JWT from login
  serverUrl = "http://192.168.1.100:3000"
)

// Prepare data
val deviceId = sharedPreferences.getString("device_id", "unknown") ?: "unknown"
val summary = "System Status Report:\nCPU: 45%\nMemory: 60%\nDisk: 70%"
val realtime = "2025-11-20 10:30:00 - Monitoring started\n2025-11-20 10:30:05 - CPU spike detected"

// Upload
uploader.uploadTextPair(
  summary = summary,
  realtime = realtime,
  deviceId = deviceId,
  deleteAfterDays = 30,
  pairName = "System Analysis ${SimpleDateFormat("yyyy-MM-dd").format(Date())}"
) { success, pairId, error ->
  if (success) {
    Toast.makeText(context, "Comparison uploaded! ID: $pairId", Toast.LENGTH_SHORT).show()
  } else {
    Toast.makeText(context, "Upload failed: $error", Toast.LENGTH_LONG).show()
  }
}
```

---

## Using cURL (For Testing)

### Simple Request
```bash
curl -X POST http://192.168.1.100:3000/api/files/text-pair-android \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGc..." \
  -d '{
    "summary": "This is the summary text",
    "realtime": "This is the realtime text",
    "deviceId": "device-uuid-123",
    "deleteAfterDays": 30,
    "pairName": "Test Comparison"
  }'
```

### With File Content (Linux/Mac)
```bash
SUMMARY=$(cat summary.txt)
REALTIME=$(cat realtime.txt)

curl -X POST http://192.168.1.100:3000/api/files/text-pair-android \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGc..." \
  -d "{
    \"summary\": $(echo "$SUMMARY" | jq -R -s '.'),
    \"realtime\": $(echo "$REALTIME" | jq -R -s '.'),
    \"deleteAfterDays\": 30
  }"
```

---

## Database Impact

When this API is called successfully, the following records are created:

### TextFile #1 (Summary)
```
id: uuid
filename: "{pairName}_summary.txt"
originalName: "{pairName}_summary.txt"
fileSize: byte_length_of_summary
encryptedData: encrypted_aes256_summary
encryptedIV: initialization_vector_1
origin: "android"
deviceId: {device_id_or_null}
uploadedById: {authenticated_user_id}
uploadedAt: now()
```

### TextFile #2 (Realtime)
```
id: uuid
filename: "{pairName}_realtime.txt"
originalName: "{pairName}_realtime.txt"
fileSize: byte_length_of_realtime
encryptedData: encrypted_aes256_realtime
encryptedIV: initialization_vector_2
origin: "android"
deviceId: {device_id_or_null}
uploadedById: {authenticated_user_id}
uploadedAt: now()
```

### TextFilePair (Linking Record)
```
id: uuid
name: {pairName}
summaryFileId: {summary_file_id}
realtimeFileId: {realtime_file_id}
uploadedById: {authenticated_user_id}
createdAt: now()
```

### AuditLog
```
action: "files.upload-pair-android"
resource: "text-pair"
resourceId: {pair_id}
details: {
  pairName: ...,
  summaryFileId: ...,
  realtimeFileId: ...,
  summarySize: ...,
  realtimeSize: ...,
  deviceId: ...
}
success: true
```

---

## Security Considerations

### Authentication
- ✅ Requires valid JWT token in `Authorization` header
- ✅ Token must belong to authenticated user
- ✅ Server verifies user exists before creating files

### Encryption
- ✅ Both texts encrypted with AES-256-GCM
- ✅ Unique IV generated per file
- ✅ Encryption keys stored securely
- ✅ Decrypted only when needed (lazy decryption)

### Authorization
- ✅ Only authenticated users can upload
- ✅ Files always owned by authenticated user
- ✅ Only owner/admin can view or delete

### Input Validation
- ✅ Summary and realtime must be non-empty strings
- ✅ Combined payload limited to 100MB
- ✅ No code injection vectors (input treated as literal text)
- ✅ UTF-8 encoding validated

### Rate Limiting
- ✅ Subject to existing rate limiter middleware
- ✅ Prevents abuse (too many requests)
- ✅ Returns 429 if rate limit exceeded

---

## Comparison with Alternative Approaches

### This API vs WebUI File Upload
| Aspect | Text Pair API | WebUI Upload |
|--------|---------------|-------------|
| Protocol | JSON | Multipart/form-data |
| Data Format | Text content | File binary |
| Requests | 1 | Up to 2 |
| Pairing | Automatic | Manual |
| Ideal For | Android app | Browser |

### This API vs Socket.IO Event
| Aspect | Text Pair API | Socket.IO |
|--------|---------------|-----------|
| Connection | HTTP REST | WebSocket |
| Setup | Simple | Complex |
| Error Codes | HTTP status | Custom errors |
| Firewall Friendly | Yes | May need special setup |
| Offline Queue | Limited | Better support |
| Best For | Reliable upload | Real-time sync |

---

## Error Handling Best Practices

### Retry Logic
```kotlin
suspend fun uploadWithRetry(
  summary: String,
  realtime: String,
  maxRetries: Int = 3,
  backoffMs: Long = 1000
) {
  var attempt = 0
  var lastError: String? = null
  
  while (attempt < maxRetries) {
    try {
      uploadTextPair(
        summary = summary,
        realtime = realtime,
        deviceId = getDeviceId()
      ) { success, pairId, error ->
        if (success) {
          Log.d("Upload", "Success: $pairId")
          return@uploadTextPair
        } else {
          lastError = error
        }
      }
      
      attempt++
      if (attempt < maxRetries) {
        delay(backoffMs * attempt)
      }
    } catch (e: Exception) {
      lastError = e.message
      attempt++
    }
  }
  
  Log.e("Upload", "Failed after $maxRetries attempts: $lastError")
}
```

---

## Monitoring & Debugging

### View Upload History in Audit Logs
```
GET /api/audit-logs?action=files.upload-pair-android&limit=50
```

### Check Pair Details
```
GET /api/files/text-pair/{pairId}
```

### View Encrypted Files
```
GET /api/files/text-pair/{pairId}/compare
```

---

## Troubleshooting

### Issue: 401 Unauthorized
**Cause:** JWT token missing, invalid, or expired  
**Solution:** 
1. Verify token is included in Authorization header
2. Check token format: `Bearer {token}`
3. Re-authenticate if token expired
4. Ensure token has not been tampered

### Issue: 400 Bad Request - Missing summary
**Cause:** `summary` field empty or missing  
**Solution:**
1. Verify `summary` key exists in JSON
2. Ensure value is non-empty string
3. Properly escape special characters and newlines

### Issue: 413 Payload Too Large
**Cause:** Combined text > 100MB  
**Solution:**
1. Reduce text content size
2. Split large files into multiple uploads
3. Compress or summarize text before upload

### Issue: 500 Internal Server Error
**Cause:** Server-side error  
**Solution:**
1. Check server logs for details
2. Verify database is accessible
3. Try again after a few seconds
4. Contact admin if persists

---

## Future Enhancements

- [ ] Support for metadata (tags, description, category)
- [ ] Batch upload multiple pairs
- [ ] Stream large text content
- [ ] Compression (gzip) for large payloads
- [ ] Partial upload resume on network failure
- [ ] Real-time progress updates via WebSocket

---

## API Versioning

Current Version: `v1`  
Last Updated: November 20, 2025

Future versions will maintain backward compatibility or provide migration path.

---

**For Support & Questions:** Contact the development team or create an issue in the project repository.
