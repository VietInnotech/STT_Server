# cURL Commands for Testing - Copy & Paste

Ready-to-use cURL commands. Just copy and paste into your terminal!

---

## Step 1: Get JWT Token

```bash
# Login as admin (password: admin123)
curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | jq .
```

**Expected output:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI...",
  "user": {...}
}
```

**Save the token:**
```bash
export JWT_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

## Step 2: Android JSON Upload

Upload both summary and realtime in one request:

```bash
curl -s -X POST http://localhost:3000/api/files/text-pair-android \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "summary": "System Health Report\n\nGenerated: 2025-11-20\nCPU Usage: 45%\nMemory: 8GB/16GB\nDisk: 250GB/500GB\nUptime: 45 days\nStatus: Healthy",
    "realtime": "Real-time Monitoring Data\n\n[2025-11-20 10:30:00] System initialized\n[2025-11-20 10:30:05] CPU spike detected: 78%\n[2025-11-20 10:30:10] Alert: High memory usage\n[2025-11-20 10:30:15] Disk I/O: 450MB/s\n[2025-11-20 10:30:20] Network traffic: 1.2Gbps\n[2025-11-20 10:30:25] All systems nominal",
    "deviceId": "device-uuid-123",
    "deleteAfterDays": 30,
    "pairName": "Daily Analysis 2025-11-20"
  }' | jq .
```

**Expected output:**
```json
{
  "success": true,
  "pair": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Daily Analysis 2025-11-20",
    "summaryFileId": "550e8400-e29b-41d4-a716-446655440001",
    "realtimeFileId": "550e8400-e29b-41d4-a716-446655440002",
    "uploadedAt": "2025-11-20T10:30:00.000Z"
  }
}
```

**Save the pair ID:**
```bash
export PAIR_ID="550e8400-e29b-41d4-a716-446655440000"
```

---

## Step 3: Get Pair Details

Retrieve the full pair with both files:

```bash
curl -s -X GET http://localhost:3000/api/files/pairs/$PAIR_ID \
  -H "Authorization: Bearer $JWT_TOKEN" | jq .
```

**Expected output:**
```json
{
  "success": true,
  "pair": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Daily Analysis 2025-11-20",
    "summaryFile": {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "filename": "Daily Analysis 2025-11-20_1763633887994.txt",
      "originalName": "summary.txt",
      "fileSize": 234,
      "origin": "android",
      "uploadedAt": "2025-11-20T10:30:00.000Z"
    },
    "realtimeFile": {
      "id": "550e8400-e29b-41d4-a716-446655440002",
      "filename": "Daily Analysis 2025-11-20_1763633887997.txt",
      "originalName": "realtime.txt",
      "fileSize": 412,
      "origin": "android",
      "uploadedAt": "2025-11-20T10:30:00.000Z"
    },
    "createdAt": "2025-11-20T10:30:00.000Z"
  }
}
```

---

## Step 4: WebUI Multipart Upload

Upload files from WebUI (both required):

```bash
# Create test files
cat > /tmp/summary.txt << 'EOF'
Weekly System Performance Report
=================================
Report Period: Nov 15-20, 2025
Total Uptime: 99.8%
Average CPU Load: 42%
Average Memory Usage: 65%
Peak Network: 2.5 Gbps
Critical Incidents: 0
Status: Excellent
EOF

cat > /tmp/realtime.txt << 'EOF'
Real-time Monitoring Feed
==========================
2025-11-20 10:00:00 - System started
2025-11-20 10:15:00 - Load average: 2.1, Memory: 8.2GB
2025-11-20 10:30:00 - Backup process initiated
2025-11-20 10:45:00 - Backup completed (18.5 GB backed up)
2025-11-20 11:00:00 - All systems nominal
2025-11-20 11:15:00 - Maintenance window completed
EOF

# Upload both files
curl -s -X POST http://localhost:3000/api/files/text-pair \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -F "summary=@/tmp/summary.txt" \
  -F "realtime=@/tmp/realtime.txt" \
  -F "pairName=Weekly Report 2025-11-20" \
  -F "deleteAfterDays=30" | jq .
```

**Expected output:**
```json
{
  "success": true,
  "pair": {
    "id": "550e8400-e29b-41d4-a716-446655440010",
    "name": "Weekly Report 2025-11-20",
    "summaryFileId": "550e8400-e29b-41d4-a716-446655440011",
    "realtimeFileId": "550e8400-e29b-41d4-a716-446655440012",
    "uploadedAt": "2025-11-20T11:00:00.000Z"
  }
}
```

---

## Step 5: Delete Pair

Delete a pair (cascade deletes both files):

```bash
curl -s -X DELETE http://localhost:3000/api/files/pairs/$PAIR_ID \
  -H "Authorization: Bearer $JWT_TOKEN" | jq .
```

**Expected output:**
```json
{
  "success": true,
  "message": "Pair and both files deleted"
}
```

---

## Step 6: Verify Deletion

Try to get the deleted pair (should get 404):

```bash
curl -s -X GET http://localhost:3000/api/files/pairs/$PAIR_ID \
  -H "Authorization: Bearer $JWT_TOKEN" | jq .
```

**Expected output:**
```json
{
  "error": "Pair not found"
}
```

---

## Error Testing

### Missing Required Fields

```bash
# Missing realtime
curl -s -X POST http://localhost:3000/api/files/text-pair-android \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"summary": "test", "deviceId": "device-123"}' | jq .
```

Expected: `{"error": "Both summary and realtime content are required"}`

---

### Invalid Token

```bash
curl -s -X GET http://localhost:3000/api/files/pairs/any-id \
  -H "Authorization: Bearer invalid-token" | jq .
```

Expected: `{"error": "Invalid or expired token"}`

---

### Permission Denied (Admin Only in Some Cases)

```bash
# Delete pair you don't own (as non-admin user)
curl -s -X DELETE http://localhost:3000/api/files/pairs/$PAIR_ID \
  -H "Authorization: Bearer $OTHER_USER_TOKEN" | jq .
```

Expected: `{"error": "Forbidden: You cannot delete this pair"}`

---

## Complete Workflow in One Script

Copy this entire script to test everything:

```bash
#!/bin/bash

API="http://localhost:3000"

echo "=== Step 1: Login ==="
LOGIN=$(curl -s -X POST $API/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}')

JWT=$(echo $LOGIN | jq -r '.token')
echo "Token: ${JWT:0:50}..."

echo -e "\n=== Step 2: Android Upload ==="
ANDROID=$(curl -s -X POST $API/api/files/text-pair-android \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "summary": "System Report: CPU 45%, Memory 8GB/16GB",
    "realtime": "Real-time: High I/O at 10:30, All systems OK",
    "deviceId": "device-123",
    "deleteAfterDays": 30,
    "pairName": "Test Upload"
  }')

PAIR=$(echo $ANDROID | jq -r '.pair.id')
echo "Created pair: $PAIR"
echo $ANDROID | jq .

echo -e "\n=== Step 3: Get Pair Details ==="
curl -s -X GET $API/api/files/pairs/$PAIR \
  -H "Authorization: Bearer $JWT" | jq .

echo -e "\n=== Step 4: Delete Pair ==="
curl -s -X DELETE $API/api/files/pairs/$PAIR \
  -H "Authorization: Bearer $JWT" | jq .

echo -e "\n=== Step 5: Verify Deletion ==="
curl -s -X GET $API/api/files/pairs/$PAIR \
  -H "Authorization: Bearer $JWT" | jq .

echo -e "\n✅ Test complete!"
```

Save as `test.sh`, make executable, and run:

```bash
chmod +x test.sh
./test.sh
```

---

## Postman Collection

Import this JSON into Postman:

```json
{
  "info": {
    "name": "Text Pair API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Login",
      "request": {
        "method": "POST",
        "header": [
          {"key": "Content-Type", "value": "application/json"}
        ],
        "body": {
          "mode": "raw",
          "raw": "{\"username\":\"admin\",\"password\":\"admin123\"}"
        },
        "url": {
          "raw": "http://localhost:3000/api/auth/login",
          "protocol": "http",
          "host": ["localhost"],
          "port": "3000",
          "path": ["api", "auth", "login"]
        }
      }
    },
    {
      "name": "Android Upload",
      "request": {
        "method": "POST",
        "header": [
          {"key": "Authorization", "value": "Bearer {{token}}"},
          {"key": "Content-Type", "value": "application/json"}
        ],
        "body": {
          "mode": "raw",
          "raw": "{\"summary\":\"System Report...\",\"realtime\":\"Real-time Data...\",\"deviceId\":\"device-123\",\"deleteAfterDays\":30,\"pairName\":\"Test\"}"
        },
        "url": {
          "raw": "http://localhost:3000/api/files/text-pair-android",
          "protocol": "http",
          "host": ["localhost"],
          "port": "3000",
          "path": ["api", "files", "text-pair-android"]
        }
      }
    },
    {
      "name": "Get Pair",
      "request": {
        "method": "GET",
        "header": [
          {"key": "Authorization", "value": "Bearer {{token}}"}
        ],
        "url": {
          "raw": "http://localhost:3000/api/files/pairs/{{pairId}}",
          "protocol": "http",
          "host": ["localhost"],
          "port": "3000",
          "path": ["api", "files", "pairs", "{{pairId}}"]
        }
      }
    },
    {
      "name": "Delete Pair",
      "request": {
        "method": "DELETE",
        "header": [
          {"key": "Authorization", "value": "Bearer {{token}}"}
        ],
        "url": {
          "raw": "http://localhost:3000/api/files/pairs/{{pairId}}",
          "protocol": "http",
          "host": ["localhost"],
          "port": "3000",
          "path": ["api", "files", "pairs", "{{pairId}}"]
        }
      }
    }
  ]
}
```

---

## Quick Command Reference

| Action | Command |
|--------|---------|
| **Login** | `curl -X POST http://localhost:3000/api/auth/login -d '{"username":"admin","password":"admin123"}'` |
| **Android Upload** | `curl -X POST http://localhost:3000/api/files/text-pair-android -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" -d '{...}'` |
| **Get Pair** | `curl -X GET http://localhost:3000/api/files/pairs/$PAIR_ID -H "Authorization: Bearer $JWT"` |
| **Delete Pair** | `curl -X DELETE http://localhost:3000/api/files/pairs/$PAIR_ID -H "Authorization: Bearer $JWT"` |
| **List All Pairs** | `sqlite3 dev.db "SELECT id, name FROM text_file_pairs"` |

---

## Useful Links

- **Full Documentation:** See `IMPLEMENTATION_COMPLETE.md`
- **Testing Guide:** See `TEST_TEXT_PAIR_API.md`
- **API Design:** See `DUAL_TEXT_FILE_COMPARISON_PLAN.md`
- **Android Spec:** See `ANDROID_TEXT_PAIR_API.md`

