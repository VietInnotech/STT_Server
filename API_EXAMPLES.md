# Text Pair Upload - Request/Response Examples

Quick reference for the two new API endpoints with real examples.

---

## 1. Android Endpoint: `POST /api/files/text-pair-android`

### Minimal Request (Only Required Fields)

```bash
curl -X POST http://192.168.1.100:3000/api/files/text-pair-android \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -d '{
    "summary": "System Performance Report",
    "realtime": "2025-11-20 10:30:45 - Monitoring active"
  }'
```

**Response (201 Created):**
```json
{
  "success": true,
  "pair": {
    "id": "a1b2c3d4-e5f6-4g7h-8i9j-0k1l2m3n4o5p",
    "name": "Comparison 2025-11-20",
    "summaryFileId": "f1e2d3c4-b5a6-4789-abcd-ef1234567890",
    "realtimeFileId": "g2h3i4j5-k6l7-4mno-pqrs-tu1234567890",
    "summaryFile": {
      "filename": "Comparison 2025-11-20_summary.txt",
      "fileSize": 26
    },
    "realtimeFile": {
      "filename": "Comparison 2025-11-20_realtime.txt",
      "fileSize": 43
    },
    "uploadedAt": "2025-11-20T10:30:45.123Z"
  }
}
```

---

### Full Request (With All Optional Fields)

```bash
curl -X POST http://192.168.1.100:3000/api/files/text-pair-android \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -d '{
    "summary": "Device Status Summary:\n- CPU Usage: 45%\n- Memory: 2048 MB / 4096 MB\n- Temperature: 52°C\n- Uptime: 45 days 12 hours",
    "realtime": "2025-11-20 10:30:00.000 - Monitoring started\n2025-11-20 10:30:05.123 - CPU spike to 78% detected\n2025-11-20 10:30:10.456 - Memory warning at 85%\n2025-11-20 10:30:15.789 - Temperature stable at 52°C",
    "deviceId": "550e8400-e29b-41d4-a716-446655440000",
    "deleteAfterDays": 30,
    "pairName": "Device Analysis Report"
  }'
```

**Response (201 Created):**
```json
{
  "success": true,
  "pair": {
    "id": "d4c3b2a1-0f9e-8d7c-6b5a-4f3e2d1c0b9a",
    "name": "Device Analysis Report",
    "summaryFileId": "a0b1c2d3-e4f5-6789-abcd-ef1234567890",
    "realtimeFileId": "b1c2d3e4-f5g6-7890-bcde-f12345678901",
    "summaryFile": {
      "filename": "Device Analysis Report_summary.txt",
      "fileSize": 124
    },
    "realtimeFile": {
      "filename": "Device Analysis Report_realtime.txt",
      "fileSize": 187
    },
    "uploadedAt": "2025-11-20T10:30:45.789Z"
  }
}
```

---

### Error Examples

#### Missing Summary Field
```bash
curl -X POST http://192.168.1.100:3000/api/files/text-pair-android \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer token..." \
  -d '{
    "realtime": "Some content"
  }'
```

**Response (400 Bad Request):**
```json
{
  "error": "Field \"summary\" is required and must be non-empty string"
}
```

---

#### Empty Realtime Field
```bash
curl -X POST http://192.168.1.100:3000/api/files/text-pair-android \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer token..." \
  -d '{
    "summary": "Some content",
    "realtime": ""
  }'
```

**Response (400 Bad Request):**
```json
{
  "error": "Field \"realtime\" is required and must be non-empty string"
}
```

---

#### Payload Too Large
```bash
curl -X POST http://192.168.1.100:3000/api/files/text-pair-android \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer token..." \
  -d '{
    "summary": "[60MB of text]",
    "realtime": "[50MB of text]"
  }'
```

**Response (413 Payload Too Large):**
```json
{
  "error": "Payload too large. Maximum 100MB combined, got 110MB"
}
```

---

#### Missing Authentication
```bash
curl -X POST http://192.168.1.100:3000/api/files/text-pair-android \
  -H "Content-Type: application/json" \
  -d '{
    "summary": "content",
    "realtime": "content"
  }'
```

**Response (401 Unauthorized):**
```json
{
  "error": "User not authenticated"
}
```

---

## 2. WebUI Endpoint: `POST /api/files/text-pair`

### Request: Upload Both Files

```bash
curl -X POST http://192.168.1.100:3000/api/files/text-pair \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -F "name=My Comparison" \
  -F "summaryFile=@/path/to/summary.txt" \
  -F "realtimeFile=@/path/to/realtime.txt" \
  -F "deleteAfterDays=30"
```

**Response (201 Created):**
```json
{
  "success": true,
  "pair": {
    "id": "e5d4c3b2-a1f0-9e8d-7c6b-5a4f3e2d1c0b",
    "name": "My Comparison",
    "summaryFileId": "c1b2a3d4-e5f6-7890-abcd-ef1234567890",
    "realtimeFileId": "d2c3b4e5-f6g7-8901-bcde-f12345678901",
    "summaryFile": {
      "filename": "summary.txt",
      "fileSize": 456
    },
    "realtimeFile": {
      "filename": "realtime.txt",
      "fileSize": 789
    },
    "uploadedAt": "2025-11-20T10:35:22.456Z"
  }
}
```

---

### Request: Upload Only Summary

```bash
curl -X POST http://192.168.1.100:3000/api/files/text-pair \
  -H "Authorization: Bearer token..." \
  -F "name=Summary Only Test" \
  -F "summaryFile=@/path/to/summary.txt"
```

**Response (201 Created):**
```json
{
  "success": true,
  "pair": {
    "id": "f6e5d4c3-b2a1-f0e9-d8c7-b6a5f4e3d2c1",
    "name": "Summary Only Test",
    "summaryFileId": "e1d2c3b4-a5f6-7890-bcde-f12345678901",
    "realtimeFileId": null,
    "summaryFile": {
      "filename": "summary.txt",
      "fileSize": 456
    },
    "realtimeFile": null,
    "uploadedAt": "2025-11-20T10:36:11.789Z"
  }
}
```

---

### Request: Upload Only Realtime

```bash
curl -X POST http://192.168.1.100:3000/api/files/text-pair \
  -H "Authorization: Bearer token..." \
  -F "name=Realtime Only Test" \
  -F "realtimeFile=@/path/to/realtime.txt" \
  -F "deleteAfterDays=7"
```

**Response (201 Created):**
```json
{
  "success": true,
  "pair": {
    "id": "g7f6e5d4-c3b2-a1f0-e9d8-c7b6a5f4e3d2",
    "name": "Realtime Only Test",
    "summaryFileId": null,
    "realtimeFileId": "f2e3d4c5-b6a7-8901-cdef-1234567890ab",
    "summaryFile": null,
    "realtimeFile": {
      "filename": "realtime.txt",
      "fileSize": 789
    },
    "uploadedAt": "2025-11-20T10:37:03.123Z"
  }
}
```

---

### Error: No Files Provided

```bash
curl -X POST http://192.168.1.100:3000/api/files/text-pair \
  -H "Authorization: Bearer token..." \
  -F "name=Empty Test"
```

**Response (400 Bad Request):**
```json
{
  "error": "At least one file (summaryFile or realtimeFile) is required"
}
```

---

## 3. Viewing Comparison

### Get Pair Details

```bash
curl -X GET http://192.168.1.100:3000/api/files/text-pair/d4c3b2a1-0f9e-8d7c-6b5a-4f3e2d1c0b9a \
  -H "Authorization: Bearer token..."
```

**Response (200 OK):**
```json
{
  "success": true,
  "pair": {
    "id": "d4c3b2a1-0f9e-8d7c-6b5a-4f3e2d1c0b9a",
    "name": "Device Analysis Report",
    "createdAt": "2025-11-20T10:30:45.789Z",
    "summaryFile": {
      "id": "a0b1c2d3-e4f5-6789-abcd-ef1234567890",
      "filename": "Device Analysis Report_summary.txt",
      "fileSize": 124
    },
    "realtimeFile": {
      "id": "b1c2d3e4-f5g6-7890-bcde-f12345678901",
      "filename": "Device Analysis Report_realtime.txt",
      "fileSize": 187
    },
    "uploadedBy": {
      "id": "user-123",
      "username": "john_doe",
      "fullName": "John Doe"
    }
  }
}
```

---

### Get Decrypted Comparison Content

```bash
curl -X GET http://192.168.1.100:3000/api/files/text-pair/d4c3b2a1-0f9e-8d7c-6b5a-4f3e2d1c0b9a/compare \
  -H "Authorization: Bearer token..."
```

**Response (200 OK):**
```json
{
  "success": true,
  "summary": "Device Status Summary:\n- CPU Usage: 45%\n- Memory: 2048 MB / 4096 MB\n- Temperature: 52°C\n- Uptime: 45 days 12 hours",
  "realtime": "2025-11-20 10:30:00.000 - Monitoring started\n2025-11-20 10:30:05.123 - CPU spike to 78% detected\n2025-11-20 10:30:10.456 - Memory warning at 85%\n2025-11-20 10:30:15.789 - Temperature stable at 52°C",
  "summaryFile": {
    "filename": "Device Analysis Report_summary.txt",
    "fileSize": 124
  },
  "realtimeFile": {
    "filename": "Device Analysis Report_realtime.txt",
    "fileSize": 187
  }
}
```

---

### List All Files Including Pairs

```bash
curl -X GET http://192.168.1.100:3000/api/files/all?limit=20 \
  -H "Authorization: Bearer token..."
```

**Response (200 OK):**
```json
{
  "success": true,
  "audio": [...],
  "text": [...],
  "textPairs": [
    {
      "id": "d4c3b2a1-0f9e-8d7c-6b5a-4f3e2d1c0b9a",
      "name": "Device Analysis Report",
      "createdAt": "2025-11-20T10:30:45.789Z",
      "summaryFile": {
        "id": "a0b1c2d3-e4f5-6789-abcd-ef1234567890",
        "filename": "Device Analysis Report_summary.txt",
        "fileSize": 124
      },
      "realtimeFile": {
        "id": "b1c2d3e4-f5g6-7890-bcde-f12345678901",
        "filename": "Device Analysis Report_realtime.txt",
        "fileSize": 187
      },
      "uploadedBy": {
        "username": "john_doe",
        "fullName": "John Doe"
      }
    }
  ],
  "count": 47
}
```

---

## 4. Deleting Comparison

```bash
curl -X DELETE http://192.168.1.100:3000/api/files/text-pair/d4c3b2a1-0f9e-8d7c-6b5a-4f3e2d1c0b9a \
  -H "Authorization: Bearer token..."
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Text pair and associated files deleted"
}
```

---

## Quick Comparison Table

| Operation | Endpoint | Method | Body Type | Example |
|-----------|----------|--------|-----------|---------|
| Android upload | `/api/files/text-pair-android` | POST | JSON | `{"summary":"...", "realtime":"..."}` |
| WebUI upload (both) | `/api/files/text-pair` | POST | multipart | `-F "summaryFile=@file1" -F "realtimeFile=@file2"` |
| WebUI upload (one) | `/api/files/text-pair` | POST | multipart | `-F "summaryFile=@file"` |
| Get pair details | `/api/files/text-pair/{id}` | GET | N/A | - |
| Get comparison | `/api/files/text-pair/{id}/compare` | GET | N/A | - |
| List all pairs | `/api/files/all` | GET | N/A | `?limit=20` |
| Delete pair | `/api/files/text-pair/{id}` | DELETE | N/A | - |

---

## Status Codes Reference

| Code | Meaning | Endpoint |
|------|---------|----------|
| 201 | Successfully created | POST /api/files/text-pair* |
| 200 | Success (GET/DELETE) | GET /api/files/... |
| 400 | Bad request (missing/invalid fields) | POST endpoints |
| 401 | Unauthorized (missing auth) | All authenticated endpoints |
| 403 | Forbidden (not owner/admin) | GET, DELETE endpoints |
| 404 | Not found | GET by ID endpoints |
| 413 | Payload too large | POST endpoints |
| 429 | Rate limit exceeded | Any endpoint |
| 500 | Server error | Any endpoint |

---

**End of Examples**
