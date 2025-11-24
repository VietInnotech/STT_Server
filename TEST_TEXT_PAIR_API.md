# Text File Pair API - Testing Guide with cURL

This guide provides step-by-step cURL commands to test the dual text file upload feature before Android integration.

## Prerequisites

1. Backend running at `http://localhost:3000`
2. Valid JWT token (from login)
3. `jq` tool installed for JSON parsing (optional but recommended)

## Quick Setup

### 1. Start the Backend

```bash
cd /mnt/apps/vietinnotech/UNV_AI_REPORT/server
npm run dev
# or
bun dev
```

### 2. Get a Valid JWT Token

Login first to get your JWT token:

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "your-password"
  }'
```

The response will include a `token` field. Save this:

```bash
export JWT_TOKEN="your-jwt-token-here"
```

---

## API Test Cases

### Test 1: Upload Text File Pair from Android (JSON Endpoint)

**Endpoint:** `POST /api/files/text-pair-android`

**Description:** Android app sends both summary and realtime content in one JSON request.

```bash
curl -X POST http://localhost:3000/api/files/text-pair-android \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "summary": "System Health Report\n\nCPU Usage: 45%\nMemory: 8GB/16GB\nDisk: 250GB/500GB\nUptime: 45 days",
    "realtime": "Real-time Monitoring Data\n\n[2025-11-20 10:30:00] CPU spike detected: 78%\n[2025-11-20 10:30:05] Alert: High memory usage\n[2025-11-20 10:30:10] Disk I/O: 450MB/s\n[2025-11-20 10:30:15] Network: 1.2Gbps",
    "deviceId": "device-uuid-123",
    "deleteAfterDays": 30,
    "pairName": "Daily Analysis 2025-11-20"
  }' | jq .
```

**Expected Response (201 Created):**

```json
{
  "success": true,
  "pair": {
    "id": "pair-uuid-1",
    "name": "Daily Analysis 2025-11-20",
    "summaryFileId": "file-uuid-1",
    "realtimeFileId": "file-uuid-2",
    "uploadedAt": "2025-11-20T10:30:00.000Z"
  }
}
```

**Save the pair ID for later tests:**

```bash
export PAIR_ID="pair-uuid-1"
export SUMMARY_FILE_ID="file-uuid-1"
export REALTIME_FILE_ID="file-uuid-2"
```

---

### Test 2: Upload Text File Pair from WebUI (Multipart Endpoint)

**Endpoint:** `POST /api/files/text-pair`

**Description:** WebUI uploads one or both files as multipart form data.

#### Option A: Upload Both Files

Create test files:

```bash
cat > /tmp/summary.txt << 'EOF'
Weekly System Performance Report
================================
Week: Nov 15-20, 2025
Total Uptime: 99.8%
Average CPU: 42%
Average Memory: 65%
Critical Incidents: 1 (resolved)
EOF

cat > /tmp/realtime.txt << 'EOF'
Real-time Monitoring Feed
==========================
2025-11-20 10:15:00 - System start
2025-11-20 10:20:00 - Load average: 2.1
2025-11-20 10:25:00 - Backup started
2025-11-20 10:30:00 - Backup completed (15.2GB)
2025-11-20 10:35:00 - All systems nominal
EOF
```

Upload both files:

```bash
curl -X POST http://localhost:3000/api/files/text-pair \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -F "summary=@/tmp/summary.txt" \
  -F "realtime=@/tmp/realtime.txt" \
  -F "pairName=Weekly Report 2025-11-20" \
  -F "deleteAfterDays=30" | jq .
```

**Expected Response (201 Created):**

```json
{
  "success": true,
  "pair": {
    "id": "pair-uuid-2",
    "name": "Weekly Report 2025-11-20",
    "summaryFileId": "file-uuid-3",
    "realtimeFileId": "file-uuid-4",
    "uploadedAt": "2025-11-20T10:35:00.000Z"
  }
}
```

---

#### Option B: Upload Only Summary (should fail)

```bash
curl -X POST http://localhost:3000/api/files/text-pair \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -F "summary=@/tmp/summary.txt" | jq .
```

**Expected Response (400):**

```json
{
  "error": "Both summary and realtime files must be provided to create a pair"
}
```

---

### Test 3: Retrieve Pair Details

**Endpoint:** `GET /api/files/pairs/:pairId`

**Description:** Retrieve metadata about a file pair.

```bash
curl -X GET http://localhost:3000/api/files/pairs/$PAIR_ID \
  -H "Authorization: Bearer $JWT_TOKEN" | jq .
```

**Expected Response (200 OK):**

```json
{
  "success": true,
  "pair": {
    "id": "pair-uuid-1",
    "name": "Daily Analysis 2025-11-20",
    "summaryFile": {
      "id": "file-uuid-1",
      "filename": "Daily Analysis 2025-11-20_1732050600000.txt",
      "originalName": "summary.txt",
      "fileSize": 156,
      "origin": "android",
      "uploadedAt": "2025-11-20T10:30:00.000Z"
    },
    "realtimeFile": {
      "id": "file-uuid-2",
      "filename": "Daily Analysis 2025-11-20_1732050601000.txt",
      "originalName": "realtime.txt",
      "fileSize": 234,
      "origin": "android",
      "uploadedAt": "2025-11-20T10:30:01.000Z"
    },
    "createdAt": "2025-11-20T10:30:00.000Z"
  }
}
```

---

### Test 4: Delete a Pair

**Endpoint:** `DELETE /api/files/pairs/:pairId`

**Description:** Delete a file pair (cascade deletes both files).

```bash
curl -X DELETE http://localhost:3000/api/files/pairs/$PAIR_ID \
  -H "Authorization: Bearer $JWT_TOKEN" | jq .
```

**Expected Response (200 OK):**

```json
{
  "success": true,
  "message": "Pair and both files deleted"
}
```

**Verify deletion:**

```bash
curl -X GET http://localhost:3000/api/files/pairs/$PAIR_ID \
  -H "Authorization: Bearer $JWT_TOKEN" | jq .
```

Should return `404 Not Found`.

---

## Full Test Sequence (Copy-Paste)

```bash
#!/bin/bash

# Configuration
API_URL="http://localhost:3000"
JWT_TOKEN="your-jwt-token"

echo "=== Test 1: Android JSON Upload ==="
RESPONSE=$(curl -s -X POST $API_URL/api/files/text-pair-android \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "summary": "System Health Report\n\nCPU Usage: 45%\nMemory: 8GB/16GB\nDisk: 250GB/500GB",
    "realtime": "Real-time Monitoring\n\n[2025-11-20 10:30:00] CPU: 78%\n[2025-11-20 10:30:05] Memory Alert",
    "deviceId": "device-uuid-123",
    "deleteAfterDays": 30,
    "pairName": "Test Android Upload"
  }')

echo $RESPONSE | jq .
PAIR_ID=$(echo $RESPONSE | jq -r '.pair.id')
echo "Created pair: $PAIR_ID"

echo -e "\n=== Test 2: Retrieve Pair ==="
curl -s -X GET $API_URL/api/files/pairs/$PAIR_ID \
  -H "Authorization: Bearer $JWT_TOKEN" | jq .

echo -e "\n=== Test 3: Delete Pair ==="
curl -s -X DELETE $API_URL/api/files/pairs/$PAIR_ID \
  -H "Authorization: Bearer $JWT_TOKEN" | jq .

echo -e "\n=== Test 4: Verify Deletion ==="
curl -s -X GET $API_URL/api/files/pairs/$PAIR_ID \
  -H "Authorization: Bearer $JWT_TOKEN" | jq .

echo -e "\n=== All Tests Complete ==="
```

Save as `/tmp/test-api.sh` and run:

```bash
chmod +x /tmp/test-api.sh
./tmp/test-api.sh
```

---

## Error Testing

### Test 5: Missing Required Fields

```bash
# Missing realtime content
curl -X POST http://localhost:3000/api/files/text-pair-android \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "summary": "Test",
    "deviceId": "device-123"
  }' | jq .
```

**Expected Response (400):**

```json
{
  "error": "Both summary and realtime content are required"
}
```

---

### Test 6: Unauthorized Access

```bash
curl -X GET http://localhost:3000/api/files/pairs/$PAIR_ID \
  -H "Authorization: Bearer invalid-token" | jq .
```

**Expected Response (401):**

```json
{
  "error": "Unauthorized"
}
```

---

### Test 7: Pair Not Found

```bash
curl -X GET http://localhost:3000/api/files/pairs/nonexistent-id \
  -H "Authorization: Bearer $JWT_TOKEN" | jq .
```

**Expected Response (404):**

```json
{
  "error": "Pair not found"
}
```

---

## Performance Testing

### Large File Test

Create a large text file:

```bash
cat > /tmp/large_summary.txt << 'EOF'
System Analysis Report
EOF

# Generate 10MB of content
yes "This is a test line to make the file larger. " | head -n 250000 >> /tmp/large_summary.txt
yes "Real-time monitoring data continues... " | head -n 250000 > /tmp/large_realtime.txt

# Upload
curl -X POST http://localhost:3000/api/files/text-pair \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -F "summary=@/tmp/large_summary.txt" \
  -F "realtime=@/tmp/large_realtime.txt" \
  -F "pairName=Large Files Test" | jq .
```

---

## Database Verification

Check the database to verify records were created:

```bash
sqlite3 ./dev.db << 'EOF'
-- List all text file pairs
SELECT id, name, createdAt FROM text_file_pairs ORDER BY createdAt DESC LIMIT 5;

-- List associated text files
SELECT id, filename, origin, uploadedAt FROM text_files WHERE uploadedAt > datetime('now', '-1 day') ORDER BY uploadedAt DESC;

-- Check cascade deletion
SELECT COUNT(*) as remaining_pairs FROM text_file_pairs WHERE id = 'your-pair-id';
EOF
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `Connection refused` | Backend not running. Start with `npm run dev` |
| `Invalid token` | Token expired or incorrect. Get new token from login |
| `Permission denied` | User role must be 'admin' or 'user' |
| `File not found` | Check path exists: `ls -la /tmp/summary.txt` |
| `CORS error` | Add origin to CORS config if frontend on different port |

---

## Next Steps for Android Integration

Once these cURL tests pass:

1. **Update Android App:**
   - Point to `POST /api/files/text-pair-android` endpoint
   - Send JSON with summary, realtime, deviceId, deleteAfterDays
   - Parse response to get pairId

2. **Update WebUI Frontend:**
   - Create UploadPairModal component
   - Call `POST /api/files/text-pair` with multipart data
   - Display uploaded pairs with ComparisonViewModal

3. **Add Socket.IO Events:**
   - Subscribe to `files:text_pair_created` event
   - Update file list when new pair created
   - Show real-time notifications

---

## Reference

- **Full Plan:** `/mnt/apps/vietinnotech/UNV_AI_REPORT/server/DUAL_TEXT_FILE_COMPARISON_PLAN.md`
- **Android API Spec:** `/mnt/apps/vietinnotech/UNV_AI_REPORT/server/ANDROID_TEXT_PAIR_API.md`
- **API Examples:** `/mnt/apps/vietinnotech/UNV_AI_REPORT/server/API_EXAMPLES.md`

