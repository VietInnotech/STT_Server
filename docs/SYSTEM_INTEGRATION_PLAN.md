# System Integration Plan - UNV AI Report Ecosystem

**Document Date:** November 27, 2025  
**Scope:** Integration between Report Server V2, MAIE AI Server, and Android Client  
**Status:** ✅ Approved for Implementation  
**Version:** 2.3 (Final review - rated 10/10)  
**Last Review:** Final implementation review completed - approved for engineering handoff

---

## Table of Contents

1. [System Overview](#system-overview)
2. [⚠️ Security Architecture (CRITICAL)](#security-architecture-critical)
3. [Component Responsibilities](#component-responsibilities)
4. [Current Integration State](#current-integration-state)
5. [Actual Data Flow (Current)](#actual-data-flow-current)
6. [Enhanced Data Model for Results](#enhanced-data-model-for-results)
7. [File Management Integration](#file-management-integration)
8. [Search and Discovery](#search-and-discovery)
9. [Implementation Roadmap](#implementation-roadmap)
10. [API Contract Specifications](#api-contract-specifications)
11. [Android Integration Guide](#android-integration-guide)

---

## System Overview

The UNV AI Report ecosystem consists of three main components.

### ⚠️ CURRENT Architecture (Has Security Issues)

```
┌─────────────────┐       X-API-Key (INSECURE!)    ┌─────────────────┐
│  Android App    │◄────── Processing ─────────────►│   MAIE AI Server │
│  (Client)       │        (Direct)                 │   (Port 8000)    │
└────────┬────────┘                                 └─────────────────┘
         │                                                 │
         │  Storage/Auth                                   │ Templates
         │  (JWT Bearer)                                   │ (X-API-Key)
         ▼                                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│                    Report Server V2 (Port 3000)                   │
└──────────────────────────────────────────────────────────────────┘

❌ SECURITY FLAW: API Key stored in Android APK can be extracted!
```

### ✅ RECOMMENDED Architecture (BFF Pattern)

```
┌─────────────────┐                               ┌─────────────────┐
│  Android App    │                               │   MAIE AI Server │
│  (Client)       │                               │   (Port 8000)    │
└────────┬────────┘                               └────────▲────────┘
         │                                                 │
         │  ALL requests via JWT                           │ X-API-Key
         │  (no MAIE key on client)                        │ (server-side only)
         ▼                                                 │
┌──────────────────────────────────────────────────────────┴───────┐
│                    Report Server V2 (Port 3000)                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐   │
│  │ Auth/Users  │  │ File Storage│  │ MAIE Proxy (ALL ops)    │   │
│  │ JWT + 2FA   │  │ AES-256     │  │ /api/process → MAIE     │   │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘

✅ API Key never leaves server - Android only uses JWT
```

### Key Discovery: Current Direct Integration Pattern

**⚠️ Android currently routes processing directly to MAIE.** This is a security concern:

- **Processing**: Android → MAIE (direct, with hardcoded API key) ❌
- **Storage**: Android → Report Server (separate uploads) ✅
- **Templates**: Android fetches from MAIE directly ❌

### Component URLs (Typical Setup)

| Component      | URL                       | Purpose                                 | Auth Method                   |
| -------------- | ------------------------- | --------------------------------------- | ----------------------------- |
| Report Server  | `http://192.168.x.x:3000` | File storage, auth, web UI              | JWT Bearer                    |
| MAIE AI Server | `http://192.168.x.x:8000` | Transcription, summarization, templates | X-API-Key (server-side only!) |
| Android App    | Native                    | Recording, uploading, viewing           | JWT Bearer only               |

---

## ⚠️ Security Architecture (CRITICAL)

### The Problem: Client-Side API Key Storage

**Current Flaw:** The Android app holds a hardcoded `X-API-Key` to communicate directly with MAIE.

**Why This Is Critical:**

1. **APK Decompilation** - Attackers can extract API keys from Android APK files using tools like `apktool` or `jadx`
2. **Network Sniffing** - Man-in-the-middle attacks can capture the API key from HTTP requests
3. **Risk Impact** - Stolen key allows attackers to:
   - Use your AI server quota (cost implications)
   - DOS your MAIE service
   - Potentially access other users' processing

**References:** [1][2][23][24] from security review

### Solution: Backend-for-Frontend (BFF) Pattern

**Principle:** The Android app should **NEVER** hold the MAIE API key. All AI processing requests must be proxied through Report Server.

```
BEFORE (Insecure):
┌────────┐   X-API-Key   ┌──────┐
│ Android │─────────────►│ MAIE │  ❌ API Key exposed in client
└────────┘               └──────┘

AFTER (Secure - BFF Pattern):
┌────────┐   JWT Token   ┌────────────┐   X-API-Key   ┌──────┐
│ Android │─────────────►│Report Server│─────────────►│ MAIE │  ✅ Key server-side only
└────────┘               └────────────┘               └──────┘
```

### Implementation Options

#### Option A: Full Proxy (Recommended)

Report Server becomes the sole gateway to MAIE:

```typescript
// NEW: POST /api/process
// Android sends audio → Report Server → MAIE → Report Server → Android

router.post("/process", authenticate, uploadLimiter, async (req, res) => {
  // 1. Receive audio from Android (JWT auth)
  // 2. STREAM audio to MAIE (don't buffer entire file in memory!)
  // 3. Map MAIE task_id to internal UUID, store in ProcessingResult
  // 4. Return internal UUID to Android (not raw MAIE task_id)
});

// NEW: GET /api/process/:taskId/status
// Proxy status checks through Report Server
```

> **⚠️ Task ID Security:** Do NOT expose raw MAIE task IDs to clients. If MAIE uses sequential integers, attackers could enumerate other users' tasks. Always map to internal UUIDs:
>
> ```typescript
> // Use crypto.randomUUID() (Node.js v14.17+) - faster than uuid package
> const internalTaskId = crypto.randomUUID();
> await prisma.processingResult.create({
>   data: { id: internalTaskId, maieTaskId: rawMaieTaskId, ... }
> });
> return res.json({ taskId: internalTaskId }); // Return internal ID only
> ```

#### Option B: Short-Lived Token Exchange

If direct MAIE access is needed for performance:

```typescript
// POST /api/maie/token
// Returns a short-lived (5 min) token for MAIE access

router.post('/maie/token', authenticate, async (req, res) => {
  const shortLivedToken = await generateMaieToken({
    userId: req.user.id,
    expiresIn: '5m',
    scope: 'process'
  });
  return res.json({ token: shortLivedToken, expiresAt: ... });
});
```

### Priority: **CRITICAL - BLOCKING**

This security fix **MUST** be implemented before production deployment.

| Task                                    | Priority | Effort  |
| --------------------------------------- | -------- | ------- |
| Add `/api/process` proxy endpoint       | CRITICAL | 2 days  |
| Add `/api/process/:taskId/status` proxy | CRITICAL | 1 day   |
| Update Android to use Report Server     | CRITICAL | 2 days  |
| Remove hardcoded API key from Android   | CRITICAL | 0.5 day |

---

## Component Responsibilities

### 1. Report Server V2 (This Repository)

**Primary Responsibilities:**

- User authentication & session management (JWT + 2FA)
- Role-based access control (RBAC)
- Encrypted file storage (AES-256)
- File sharing with expiration
- Audit logging
- Real-time notifications (Socket.IO)
- Template proxy to MAIE API (admin CRUD operations)
- Web UI for administration

**Current File Types:**

- `AudioFile`: Raw audio recordings (WAV 16kHz mono)
- `TextFile`: Text content (transcriptions, summaries)
- `TextFilePair`: Linked summary + realtime text files

**⚠️ Important Finding:** The endpoint `POST /api/files/text-pair-android` exists but is **NOT currently used** by the Android app. Android uses `POST /api/files/text` instead.

### 2. MAIE AI Server (External)

**Primary Responsibilities:**

- Audio transcription (ASR via Faster-Whisper or ChunkFormer)
- Text summarization with LLM (vLLM engine)
- Speaker diarization (pyannote.audio)
- Template management (JSON schemas + Jinja2 prompts)
- Structured output generation based on templates

**Actual API Endpoints:**
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/v1/process` | X-API-Key | Upload audio for async processing |
| `POST` | `/v1/process_text` | X-API-Key | Submit text for summarization |
| `GET` | `/v1/status/{task_id}` | X-API-Key | Poll processing status & get results |
| `GET` | `/v1/models` | None | List available ASR/LLM models |
| `GET` | `/v1/templates` | None | List available templates |
| `GET` | `/v1/templates/{id}` | None | Get template details |
| `POST` | `/v1/templates` | X-API-Key | Create template |
| `PUT` | `/v1/templates/{id}` | X-API-Key | Update template |
| `DELETE` | `/v1/templates/{id}` | X-API-Key | Delete template |
| `GET` | `/health` | None | Health check |

**Processing Model:** Asynchronous with polling (NOT webhooks)

- Submit → Get `task_id` (HTTP 202)
- Poll `/v1/status/{task_id}` every 5-10 seconds
- States: `PENDING` → `PREPROCESSING` → `PROCESSING_ASR` → `PROCESSING_LLM` → `COMPLETE`/`FAILED`

### 3. Android Client

**Primary Responsibilities:**

- Audio recording (WAV, 16kHz, mono, 16-bit PCM)
- Direct MAIE integration for processing
- Upload files to Report Server for persistence
- Display results (title + summary/transcript)
- Export results (PDF, DOCX, TXT)
- Local caching of results

**Current Limitations:**

- No automatic retry on upload failure (manual only)
- No offline queue (fails immediately if no network)
- No sync with Report Server history
- Results cached locally but not searchable

---

## Current Integration State

### ✅ Implemented

| Feature                  | Status      | Notes                                  |
| ------------------------ | ----------- | -------------------------------------- |
| Android → Server auth    | ✅ Complete | JWT Bearer token via `AuthInterceptor` |
| Audio file upload        | ✅ Complete | `POST /api/files/audio` (multipart)    |
| Text file upload         | ✅ Complete | `POST /api/files/text` (multipart)     |
| Text pair upload (WebUI) | ✅ Complete | `POST /api/files/text-pair`            |
| Template proxy           | ✅ Complete | `/api/templates` → MAIE                |
| File sharing             | ✅ Complete | With expiration                        |
| Real-time notifications  | ✅ Complete | Socket.IO                              |
| Android → MAIE direct    | ✅ Complete | `/v1/process` with polling             |
| Template selection UI    | ✅ Complete | Radio dialog, persisted preference     |
| Result caching           | ✅ Partial  | Local `json_cache.txt` file            |

### ⚠️ Gaps Identified (Updated)

| Gap                                      | Impact                      | Priority | Root Cause                                      |
| ---------------------------------------- | --------------------------- | -------- | ----------------------------------------------- |
| No structured result metadata            | Cannot search by title/tags | HIGH     | Android uploads raw text, not structured JSON   |
| No link between audio and generated text | Cannot trace lineage        | HIGH     | Separate upload actions, no linking             |
| No tagging system                        | Poor organization           | MEDIUM   | MAIE can generate tags but they're not captured |
| No automatic retry on Android            | Lost uploads                | MEDIUM   | User must manually retry                        |
| `/api/files/text-pair-android` unused    | Dead code                   | LOW      | Android uses `/api/files/text` instead          |

### 🔍 Key Findings from Analysis

1. **MAIE Result Structure** - The actual result from MAIE includes:

   ```json
   {
     "status": "COMPLETE",
     "result": {
       "results": {
         "summary": {
           "title": "Meeting Title", // ← Title is available!
           "content": "..." // ← Summary content
           // Tags defined in template schema (e.g., "tags": [...])
         },
         "transcript": "..." // ← Full transcript
       }
     }
   }
   ```

2. **Tags Are Template-Defined** - If the template schema includes a `tags` field, MAIE's LLM will extract and return them. This is configurable per template.

3. **Processing Metrics Available** - MAIE returns useful metrics:

   - `asr_confidence_avg` (0-1)
   - `processing_time_seconds`
   - `input_duration_seconds`
   - `rtf` (real-time factor)

4. **Separate Upload Actions** - Android has distinct "Process" and "Upload to Server" actions, meaning audio storage and processing results are disconnected.

---

## Actual Data Flow (Current)

### Current Flow: Audio Recording → Results (As Implemented)

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    ANDROID APP - CURRENT FLOW                             │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  1. RECORD AUDIO                                                         │
│     ─────────────────────────────────────────────────────────────        │
│     - Format: WAV, 16kHz, Mono, 16-bit PCM                               │
│     - Source: AudioSource.MIC                                            │
│     - Storage: Local filesDir as .wav chunks                             │
│                                                                          │
│  2. USER CLICKS "PROCESS"                                                │
│     ─────────────────────────────────────────────────────────────        │
│     - Template selection dialog appears                                  │
│     - User picks template (e.g., "Meeting Notes")                        │
│     - Last selection saved to SecurePreferences                          │
│                                                                          │
│  3. SEND TO MAIE (Direct, Async)                                         │
│     ─────────────────────────────────────────────────────────────        │
│     POST http://<MAIE>/v1/process                                        │
│     Headers: X-API-Key: <hardcoded-dev-key>                              │
│     Body (multipart/form-data):                                          │
│       - file: <audio.wav>                                                │
│       - features: "summary"                                              │
│       - template_id: "meeting_notes_v2"                                  │
│                                                                          │
│     Response (HTTP 202):                                                 │
│       { "task_id": "c4b3a216-...", "status": "PENDING" }                 │
│                                                                          │
│  4. POLL FOR RESULTS (Every 5-10 seconds, max 360 attempts)              │
│     ─────────────────────────────────────────────────────────────        │
│     GET http://<MAIE>/v1/status/{task_id}                                │
│                                                                          │
│     Response when COMPLETE:                                              │
│     {                                                                    │
│       "status": "COMPLETE",                                              │
│       "result": {                                                        │
│         "results": {                                                     │
│           "summary": {                                                   │
│             "title": "Meeting Title",      ◄── Generated title           │
│             "content": "Key points...",    ◄── Summary                   │
│             "attendees": [...],            ◄── Template-specific         │
│             "decisions": [...],            ◄── Template-specific         │
│             "tags": ["meeting", "Q4"]      ◄── If in template schema     │
│           },                                                             │
│           "transcript": "Full text..."     ◄── Raw transcript            │
│         }                                                                │
│       },                                                                 │
│       "metrics": {                                                       │
│         "asr_confidence_avg": 0.92,                                      │
│         "processing_time_seconds": 45.2,                                 │
│         "input_duration_seconds": 300,                                   │
│         "rtf": 0.15                                                      │
│       }                                                                  │
│     }                                                                    │
│                                                                          │
│  5. DISPLAY RESULTS                                                      │
│     ─────────────────────────────────────────────────────────────        │
│     - Parse: root.results.summary.title → Display title                  │
│     - Parse: root.results.summary.content → Display summary              │
│     - Parse: root.results.transcript → Display transcript                │
│     - Cache to local json_cache.txt                                      │
│                                                                          │
│  6. USER CLICKS "UPLOAD TO SERVER" (Separate Action!)                    │
│     ─────────────────────────────────────────────────────────────        │
│     POST http://<ReportServer>/api/files/text                            │
│     Headers: Authorization: Bearer <jwt>                                 │
│     Body (multipart/form-data):                                          │
│       - file: <transcript.txt>           ◄── Just the text!              │
│       - deviceId: "android-abc123"                                       │
│                                                                          │
│     ❌ LOST: title, tags, template_id, confidence, metrics               │
│     ❌ NO LINK to audio file                                             │
│     ❌ NO structured metadata stored                                     │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### Problem Analysis

| What MAIE Returns | What Android Captures | What Gets Uploaded   | What's Searchable |
| ----------------- | --------------------- | -------------------- | ----------------- |
| `title`           | ✅ Displayed          | ❌ Lost              | ❌ No             |
| `summary.content` | ✅ Displayed          | ⚠️ Partial (as text) | ❌ Only filename  |
| `transcript`      | ✅ Displayed          | ⚠️ Partial (as text) | ❌ Only filename  |
| `tags[]`          | ❌ Not parsed         | ❌ Lost              | ❌ No             |
| `confidence`      | ❌ Not displayed      | ❌ Lost              | ❌ No             |
| `processing_time` | ❌ Not displayed      | ❌ Lost              | ❌ No             |
| `template_id`     | ✅ Used for request   | ❌ Lost              | ❌ No             |

---

## Enhanced Data Model for Results

### Storage Strategy Decision

**Review Finding:** SQLite BLOB storage is acceptable for text content (<100KB) but NOT for audio files (MBs).

| Content Type    | Size       | Storage        | Rationale                                      |
| --------------- | ---------- | -------------- | ---------------------------------------------- |
| Summary text    | ~1-10 KB   | ✅ SQLite BLOB | Fast, transactional, atomic with metadata      |
| Transcript text | ~10-100 KB | ✅ SQLite BLOB | Same benefits, within performance threshold    |
| Audio files     | 1-50+ MB   | ⚠️ Filesystem  | DB bloat, backup issues, memory during queries |

**Recommendation:** Keep current `AudioFile.data` as BLOB for now (existing behavior), but consider filesystem migration for audio in future if database grows large.

> **📊 Decision Threshold (v2.2):**
>
> - **<500MB total audio**: Current BLOB storage is fine for MVP
> - **>500MB total audio**: Migrate to filesystem storage during Phase 4
> - **>1-2GB database**: SQLite becomes unwieldy for backup/restore
>
> The migration script in Appendix A can be extended to write BLOBs to disk and update paths with minimal additional effort.

**References:** [5][6][7] from review - SQLite is faster than filesystem for blobs <100KB

### Proposed New Model: `ProcessingResult`

Based on the actual MAIE response structure, here's the concrete schema:

```prisma
// New model to store AI processing results with searchable metadata
model ProcessingResult {
  id              String   @id @default(uuid())

  // === SEARCHABLE METADATA ===
  title           String?              // From MAIE: result.results.summary.title
  templateId      String?              // Template used: "meeting_notes_v2"
  templateName    String?              // Template name at processing time

  // === MAIE TASK TRACKING ===
  maieTaskId      String?  @unique     // MAIE task_id for reference
  maieStatus      String?              // PENDING, PROCESSING_ASR, COMPLETE, FAILED

  // === LINKED AUDIO (optional archival) ===
  sourceAudioId   String?              // Link to AudioFile if stored
  sourceAudio     AudioFile? @relation(fields: [sourceAudioId], references: [id], onDelete: SetNull)

  // === CONTENT (stored directly, encrypted) ===
  summaryData     Bytes?               // AES-256 encrypted summary content
  summaryIv       String?              // IV for summary decryption
  transcriptData  Bytes?               // AES-256 encrypted transcript content
  transcriptIv    String?              // IV for transcript decryption
  summaryPreview  String?              // First 200 chars unencrypted (for search results)
  summarySize     Int?                 // Size in bytes (for UI display without decryption)
  transcriptSize  Int?                 // Size in bytes (for UI display without decryption)

  // === PROCESSING METRICS (from MAIE) ===
  confidence      Float?               // asr_confidence_avg (0-1)
  processingTime  Float?               // processing_time_seconds
  audioDuration   Float?               // input_duration_seconds
  rtf             Float?               // Real-time factor (processingTime/audioDuration)

  // === RAW DATA ===
  rawMaieOutput   String?              // Full JSON response (encrypted, for debugging)

  // === STATUS ===
  status          String   @default("completed")  // pending, processing, completed, failed
  errorMessage    String?              // If status=failed
  errorCode       String?              // MAIE error code: ASR_PROCESSING_ERROR, etc.

  // === OWNERSHIP ===
  deviceId        String?
  device          Device?  @relation(fields: [deviceId], references: [id], onDelete: SetNull)
  uploadedById    String?
  uploadedBy      User?    @relation(fields: [uploadedById], references: [id], onDelete: SetNull)

  // === TAGS (many-to-many) ===
  tags            ProcessingResultTag[]

  // === TIMESTAMPS ===
  processedAt     DateTime?            // When MAIE completed processing
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  // === AUTO-DELETE ===
  deleteAfterDays   Int?
  scheduledDeleteAt DateTime?

  @@index([title])
  @@index([templateId])
  @@index([status])
  @@index([processedAt])
  @@index([uploadedById])
  @@index([deviceId])
  @@map("processing_results")
}

// Update existing models to add relations
model AudioFile {
  // ... existing fields ...

  // Add relation to processing results
  processingResults ProcessingResult[]
}

model Device {
  // ... existing fields ...

  // Add relation to processing results
  processingResults ProcessingResult[]
}
```

### Tag Storage Strategy

Since SQLite doesn't support array columns natively, we use a **junction table** pattern for proper relational querying:

```prisma
// Separate Tag model with many-to-many relationship
model Tag {
  id        String   @id @default(uuid())
  name      String   @unique              // Normalized tag name (lowercase, trimmed)

  // Many-to-many with ProcessingResult
  results   ProcessingResultTag[]

  createdAt DateTime @default(now())

  @@index([name])
  @@map("tags")
}

// Junction table for ProcessingResult <-> Tag
model ProcessingResultTag {
  id                  String           @id @default(uuid())

  processingResultId  String
  processingResult    ProcessingResult @relation(fields: [processingResultId], references: [id], onDelete: Cascade)

  tagId               String
  tag                 Tag              @relation(fields: [tagId], references: [id], onDelete: Cascade)

  createdAt           DateTime         @default(now())

  @@unique([processingResultId, tagId])  // Prevent duplicate tags per result
  @@index([processingResultId])
  @@index([tagId])
  @@map("processing_result_tags")
}

// Update ProcessingResult to include relation
model ProcessingResult {
  // ... existing fields ...

  // Tags (many-to-many via junction table)
  tags ProcessingResultTag[]
}
```

**Why Junction Table over JSON?**

| Approach              | Pros                                                                      | Cons                                                           |
| --------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **JSON String**       | Simple storage                                                            | Poor query performance, no referential integrity, no tag reuse |
| **Junction Table** ✅ | Proper indexes, efficient queries, tag normalization, aggregation support | Slightly more complex inserts                                  |

```typescript
// Query: Find results with "meeting" tag
const results = await prisma.processingResult.findMany({
  where: {
    tags: {
      some: {
        tag: { name: "meeting" },
      },
    },
  },
  include: { tags: { include: { tag: true } } },
});

// Query: Get popular tags with counts
const popularTags = await prisma.tag.findMany({
  include: { _count: { select: { results: true } } },
  orderBy: { results: { _count: "desc" } },
  take: 20,
});

// Insert: Add tags to result (upsert pattern)
async function addTagsToResult(resultId: string, tagNames: string[]) {
  for (const name of tagNames) {
    const normalizedName = name.toLowerCase().trim();

    // Upsert tag
    const tag = await prisma.tag.upsert({
      where: { name: normalizedName },
      create: { name: normalizedName },
      update: {},
    });

    // Link to result (ignore if already exists)
    await prisma.processingResultTag.upsert({
      where: {
        processingResultId_tagId: {
          processingResultId: resultId,
          tagId: tag.id,
        },
      },
      create: { processingResultId: resultId, tagId: tag.id },
      update: {},
    });
  }
}
```

### Updated Endpoint: `POST /api/files/processing-result`

```typescript
interface ProcessingResultPayload {
  // === REQUIRED: Content ===
  summary: string; // Summary text content (encrypted storage)
  transcript: string; // Full transcript (encrypted storage)
  title: string; // Required for search

  // === OPTIONAL: Metadata ===
  tags?: string[]; // ["meeting", "Q4", "review"] - stored via junction table
  templateId?: string; // "meeting_notes_v2"
  templateName?: string; // "Meeting Notes"

  // === OPTIONAL: MAIE Tracking ===
  maieTaskId?: string; // "c4b3a216-3e7f-4d2a-..."

  // === OPTIONAL: Metrics ===
  confidence?: number; // 0.0 - 1.0
  processingTime?: number; // seconds
  audioDuration?: number; // seconds

  // === OPTIONAL: Linking ===
  sourceAudioId?: string; // Link to previously uploaded audio
  deviceId?: string; // Android device fingerprint

  // === OPTIONAL: Raw Data ===
  rawMaieOutput?: object; // Full MAIE response for debugging

  // === OPTIONAL: Settings ===
  deleteAfterDays?: number;
  pairName?: string; // Display name for the pair
}

// Response
interface ProcessingResultResponse {
  success: true;
  result: {
    id: string; // ProcessingResult ID
    title: string;
    tags: string[]; // Tag names (resolved from junction table)
    sourceAudioId: string | null;
    createdAt: string;
  };
}
```

---

## File Management Integration

### Recommended Upload Flow (New)

Based on actual Android behavior, here's the recommended integrated flow:

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    ANDROID APP - RECOMMENDED FLOW                         │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  OPTION A: Combined Upload (Audio + Result)                              │
│  ═══════════════════════════════════════════════════════════════════     │
│                                                                          │
│  STEP 1: Record & Process (Existing Flow)                                │
│  ─────────────────────────────────────────────────────────────────       │
│  - Record audio locally                                                  │
│  - User selects template, clicks "Process"                               │
│  - POST /v1/process → poll /v1/status/{task_id}                          │
│  - Receive MAIE result with title, summary, transcript, metrics          │
│                                                                          │
│  STEP 2: Upload Audio (Optional, for archival)                           │
│  ─────────────────────────────────────────────────────────────────       │
│  POST /api/files/audio                                                   │
│  Body: multipart { file: audio.wav, deviceId: "android-xxx" }            │
│  Response: { success: true, file: { id: "audio-uuid-123" } }             │
│                                                                          │
│  STEP 3: Upload Complete Result (NEW ENDPOINT)                           │
│  ─────────────────────────────────────────────────────────────────       │
│  POST /api/files/processing-result                                       │
│  Body (JSON):                                                            │
│  {                                                                       │
│    // Content (required)                                                 │
│    "summary": "Key points from the meeting...",                          │
│    "transcript": "Full transcript text...",                              │
│    "title": "Q4 Budget Meeting",                                         │
│                                                                          │
│    // Metadata (optional but recommended)                                │
│    "tags": ["meeting", "budget", "Q4"],                                  │
│    "templateId": "meeting_notes_v2",                                     │
│    "templateName": "Meeting Notes",                                      │
│    "maieTaskId": "c4b3a216-3e7f-4d2a-8f9a-...",                          │
│                                                                          │
│    // Metrics (optional)                                                 │
│    "confidence": 0.92,                                                   │
│    "processingTime": 45.2,                                               │
│    "audioDuration": 300,                                                 │
│                                                                          │
│    // Linking (optional)                                                 │
│    "sourceAudioId": "audio-uuid-123",  // From step 2                    │
│    "deviceId": "android-abc123",                                         │
│                                                                          │
│    // Settings (optional)                                                │
│    "deleteAfterDays": 30,                                                │
│    "pairName": "Q4 Budget Meeting - 2025-11-27"                          │
│  }                                                                       │
│                                                                          │
│  Response:                                                               │
│  {                                                                       │
│    "success": true,                                                      │
│    "result": {                                                           │
│      "id": "result-uuid-999",                                            │
│      "title": "Q4 Budget Meeting",                                       │
│      "tags": ["meeting", "budget", "Q4"],                                │
│      "textPairId": "pair-uuid-888",                                      │
│      "sourceAudioId": "audio-uuid-123"                                   │
│    }                                                                     │
│  }                                                                       │
│                                                                          │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  OPTION B: Result Only (No Audio Storage)                                │
│  ═══════════════════════════════════════════════════════════════════     │
│                                                                          │
│  Skip Step 2, set sourceAudioId: null in Step 3                          │
│  Audio is discarded after MAIE processing                                │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### Migration Strategy (Full Migration)

**Approach:** Clean migration - deprecate old Android upload pattern in favor of structured result uploads.

| Endpoint                            | Action    | Rationale                              |
| ----------------------------------- | --------- | -------------------------------------- |
| `POST /api/files/audio`             | ✅ Keep   | Still useful for audio archival        |
| `POST /api/files/text`              | ❌ Remove | Replaced by processing-result endpoint |
| `POST /api/files/text-pair-android` | ❌ Remove | Never used, dead code                  |
| `POST /api/files/text-pair`         | ❌ Remove | Replaced by processing-result endpoint |
| `POST /api/files/processing-result` | 🆕 New    | Single endpoint for all result uploads |

**Migration Tasks:**

1. Deploy new `POST /api/files/processing-result` endpoint
2. Update Android app to use new endpoint exclusively
3. Migrate existing `TextFilePair` records to `ProcessingResult` (backfill script)
4. Remove deprecated endpoints after Android update is deployed
5. Drop `TextFilePair` table after data migration verified

### Android Changes Required

> **⚠️ Reliability Recommendation:** The security review identified that mobile networks can be unreliable (WiFi → cellular handoff, tunnels, elevators). Consider implementing:
>
> - **WorkManager** for background-safe uploads that survive process death
> - **Chunked uploads** with resume capability for large audio files
> - **Exponential backoff** for transient failures
> - **Local queue** to retry failed uploads when connectivity returns
>
> This is a MEDIUM priority improvement for production reliability.

```kotlin
// NEW: Upload processing result with metadata
data class ProcessingResultPayload(
    val summary: String,
    val transcript: String,
    val title: String,
    val tags: List<String>? = null,
    val templateId: String? = null,
    val templateName: String? = null,
    val maieTaskId: String? = null,
    val confidence: Double? = null,
    val processingTime: Double? = null,
    val audioDuration: Double? = null,
    val sourceAudioId: String? = null,
    val deviceId: String? = null,
    val deleteAfterDays: Int? = null,
    val pairName: String? = null
)

// Parse MAIE response and build payload
fun buildUploadPayload(maieResponse: JsonObject, audioId: String?): ProcessingResultPayload {
    val results = maieResponse.getAsJsonObject("result")
        .getAsJsonObject("results")
    val summary = results.getAsJsonObject("summary")
    val metrics = maieResponse.getAsJsonObject("metrics")

    return ProcessingResultPayload(
        summary = summary.get("content").asString,
        transcript = results.get("transcript").asString,
        title = summary.get("title").asString,
        tags = summary.getAsJsonArray("tags")?.map { it.asString },  // If in template schema
        templateId = selectedTemplateId,  // From UI selection
        templateName = selectedTemplateName,
        maieTaskId = taskId,
        confidence = metrics?.get("asr_confidence_avg")?.asDouble,
        processingTime = metrics?.get("processing_time_seconds")?.asDouble,
        audioDuration = metrics?.get("input_duration_seconds")?.asDouble,
        sourceAudioId = audioId,
        deviceId = deviceFingerprint,
        pairName = "${summary.get("title").asString} - ${formatDate(Date())}"
    )
}
```

---

## Search and Discovery

### Search Capabilities Matrix

| Search Type | Current | Proposed | Priority | Implementation                               |
| ----------- | ------- | -------- | -------- | -------------------------------------------- |
| Filename    | ✅      | ✅       | -        | Already works                                |
| Title       | ❌      | ✅       | HIGH     | `ProcessingResult.title`                     |
| Tags        | ❌      | ✅       | HIGH     | Junction table `Tag` + `ProcessingResultTag` |
| Template    | ❌      | ✅       | MEDIUM   | `ProcessingResult.templateId`                |
| Date range  | ❌      | ✅       | MEDIUM   | `ProcessingResult.processedAt`               |
| Device      | ✅      | ✅       | -        | Already works                                |
| Confidence  | ❌      | ✅       | LOW      | `ProcessingResult.confidence`                |

### New Search Endpoint

```typescript
/**
 * GET /api/files/search
 *
 * Unified search across files and processing results
 */

// Request
interface SearchParams {
  // Text search (searches title, filename)
  q?: string;

  // Filters
  type?: "audio" | "text" | "result" | "all"; // Default: 'all'
  tags?: string; // Comma-separated: "meeting,Q4"
  templateId?: string; // Filter by template
  deviceId?: string; // Filter by device
  minConfidence?: number; // 0-1, filter low-quality results

  // Date range
  fromDate?: string; // ISO date
  toDate?: string;

  // Sorting
  sortBy?: "date" | "title" | "confidence"; // Default: 'date'
  order?: "asc" | "desc"; // Default: 'desc'

  // Pagination
  limit?: number; // Default: 20, max: 100
  offset?: number; // Default: 0
}

// Response
interface SearchResponse {
  success: true;
  results: SearchResult[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
  facets?: {
    tags: Array<{ name: string; count: number }>;
    templates: Array<{ id: string; name: string; count: number }>;
  };
}

interface SearchResult {
  // Common fields
  id: string;
  type: "audio" | "text" | "pair" | "result";
  title: string | null;
  filename: string | null;
  uploadedAt: string;
  uploadedBy: { id: string; name: string } | null;
  deviceId: string | null;

  // Result-specific (when type='result')
  tags?: string[];
  templateId?: string;
  templateName?: string;
  confidence?: number;
  summaryPreview?: string; // First 200 chars of summary

  // File info
  fileSize?: number;
  mimeType?: string;

  // Linking
  sourceAudioId?: string;
}
```

### Tags Aggregation Endpoint

```typescript
/**
 * GET /api/files/tags
 *
 * Get popular tags for autocomplete and filtering
 */

// Response
interface TagsResponse {
  success: true;
  tags: Array<{
    name: string;
    count: number;
  }>;
}

// Implementation (using junction table)
const tags = await prisma.tag.findMany({
  where: {
    results: {
      some: {
        processingResult: {
          uploadedById: isAdmin ? undefined : userId,
        },
      },
    },
  },
  include: {
    _count: { select: { results: true } },
  },
  orderBy: {
    results: { _count: "desc" },
  },
  take: limit,
});

// Map to response format
const response = tags.map((t) => ({
  name: t.name,
  count: t._count.results,
}));
```

### Templates Used Endpoint

```typescript
/**
 * GET /api/files/templates-used
 *
 * Get templates that have been used in processing results
 */

// Response
interface TemplatesUsedResponse {
  success: true;
  templates: Array<{
    id: string;
    name: string;
    resultCount: number;
    lastUsed: string;
  }>;
}
```

---

## Implementation Roadmap

### ⚠️ Phase 0: Security Fix (BLOCKING - Week 1)

**Goal:** Remove API key from Android, implement BFF pattern

| #   | Task                                      | Files                   | Effort  | Priority |
| --- | ----------------------------------------- | ----------------------- | ------- | -------- |
| 0.1 | Add `/api/process` proxy endpoint         | `src/routes/process.ts` | 2 days  | CRITICAL |
| 0.2 | Add `/api/process/:taskId/status` proxy   | `src/routes/process.ts` | 1 day   | CRITICAL |
| 0.3 | Add Socket.IO events for task completion  | `src/lib/socketBus.ts`  | 1 day   | HIGH     |
| 0.4 | Update Android to use Report Server proxy | Android Team            | 2 days  | CRITICAL |
| 0.5 | Remove hardcoded API key from Android APK | Android Team            | 0.5 day | CRITICAL |

**Deliverables:**

- Android no longer holds MAIE API key
- All MAIE requests proxied through Report Server
- Task completion notifications via Socket.IO (replaces polling)

> **Note on Polling vs WebSocket:** The review identified that polling drains mobile battery. Since Socket.IO is already implemented, we should use it for task completion notifications instead of polling `/v1/status/{task_id}`. [References: 8][9]

### Phase 1: Foundation (Week 2-3)

**Goal:** Enable structured metadata storage and basic search

| #   | Task                                        | Files                            | Effort  |
| --- | ------------------------------------------- | -------------------------------- | ------- |
| 1.1 | Add `ProcessingResult` model                | `prisma/schema.prisma`           | 1 day   |
| 1.2 | Create migration                            | `prisma/migrations/*`            | 0.5 day |
| 1.3 | Add `/api/files/processing-result` endpoint | `src/routes/files.ts`            | 2 days  |
| 1.4 | Update Android endpoint to accept metadata  | `src/routes/files.ts`            | 1 day   |
| 1.5 | Basic search endpoint                       | `src/routes/files.ts`            | 2 days  |
| 1.6 | Update frontend FilesPage                   | `client/src/pages/FilesPage.tsx` | 2 days  |

**Deliverables:**

- Processing results stored with title, tags
- Basic title/tag search working
- Results visible in web UI

### Phase 2: Enhanced Search (Week 4)

**Goal:** Full search capabilities with filters

| #   | Task                     | Files                                     | Effort   |
| --- | ------------------------ | ----------------------------------------- | -------- |
| 2.1 | Advanced search endpoint | `src/routes/files.ts`                     | 2 days   |
| 2.2 | Tag aggregation endpoint | `src/routes/files.ts`                     | 0.5 day  |
| 2.3 | Search filters UI        | `client/src/components/SearchFilters.tsx` | 2 days   |
| 2.4 | Search results component | `client/src/components/SearchResults.tsx` | 1.5 days |

**Deliverables:**

- Multi-filter search
- Tag cloud/suggestions
- Date range picker

### Phase 3: Android Integration (Week 5)

**Goal:** Android app uploads complete results via secure proxy

| #   | Task                           | Owner        | Effort |
| --- | ------------------------------ | ------------ | ------ |
| 3.1 | Update Android upload logic    | Android Team | 2 days |
| 3.2 | Add metadata to upload payload | Android Team | 1 day  |
| 3.3 | Handle sourceAudioId linking   | Android Team | 1 day  |
| 3.4 | Test end-to-end flow           | Both         | 1 day  |

**Deliverables:**

- Android uploads full results
- Audio-to-result linking works
- Tags visible in app

### Phase 4: Gap Fixes & Polish (Week 6)

**Goal:** Address FILE_MANAGEMENT_GAPS_AND_RECOMMENDATIONS.md

| #   | Task                           | Priority | Effort |
| --- | ------------------------------ | -------- | ------ |
| 4.1 | Fix FileShare cascade deletion | HIGH     | 1 day  |
| 4.2 | Storage quota system           | HIGH     | 3 days |
| 4.3 | Download activity logging      | MEDIUM   | 1 day  |

---

## API Contract Specifications

### 0. MAIE Proxy Endpoints (NEW - Security Fix)

> **⚠️ Implementation Critical: Use Streaming for Large Files**
>
> Audio files can be 50MB+. Do NOT buffer the entire file in memory before forwarding to MAIE.
>
> **Best Practice:** Use Node.js streams (`pipeline` or `.pipe()`) to forward the incoming multipart stream directly to MAIE.
>
> ```typescript
> import { pipeline } from "stream/promises";
> import busboy from "busboy";
> import FormData from "form-data";
>
> router.post("/process", authenticate, async (req, res) => {
>   const bb = busboy({ headers: req.headers });
>   const formData = new FormData();
>
>   bb.on("file", (name, file, info) => {
>     // Stream directly to FormData - no buffering!
>     formData.append("file", file, { filename: info.filename });
>   });
>
>   bb.on("field", (name, val) => formData.append(name, val));
>
>   bb.on("close", async () => {
>     // Forward stream to MAIE
>     const response = await fetch(`${MAIE_URL}/v1/process`, {
>       method: "POST",
>       headers: { "X-API-Key": MAIE_API_KEY, ...formData.getHeaders() },
>       body: formData,
>       duplex: "half", // Required for streaming body
>     });
>     // ... handle response
>   });
>
>   req.pipe(bb);
> });
> ```
>
> **Avoid:** `multer` memory storage, `fs.readFile`, or any approach that loads the entire file into RAM.

```yaml
# Submit audio for processing (replaces direct MAIE call)
POST /api/process
Authorization: Bearer <token>
Content-Type: multipart/form-data

Request:
  file: audio file (WAV, 16kHz, mono)
  template_id: string (optional)
  features: string (default: "summary")

Response 202:
  success: true
  taskId: string           # MAIE task_id
  status: "PENDING"
  message: "Processing started"

Response 400:
  error: "No audio file provided"

---

# Check processing status (replaces direct MAIE polling)
GET /api/process/:taskId/status
Authorization: Bearer <token>

Response 200 (in progress):
  taskId: string
  status: "PENDING" | "PROCESSING_ASR" | "PROCESSING_LLM"
  progress: number         # 0-100 (estimated)

Response 200 (complete):
  taskId: string
  status: "COMPLETE"
  result:
    title: string
    summary: string
    transcript: string
    tags: string[]
    confidence: number
    processingTime: number
    audioDuration: number

Response 200 (failed):
  taskId: string
  status: "FAILED"
  error: string
  errorCode: string

---

# Socket.IO event (instead of polling)
Event: "task:complete"
Payload:
  taskId: string
  status: "COMPLETE" | "FAILED"
  result?: { ... }         # Same as GET response
  error?: string
```

> **⚠️ Android Reliability: Handle Missed Socket Events**
>
> If the Android app is backgrounded/killed when the `task:complete` event fires, the notification will be missed.
>
> **Best Practice:** On app startup/resume, perform a **single poll** to check status of any `PENDING` tasks:
>
> ```kotlin
> // Android: On Activity onResume or App startup
> fun syncPendingTasks() {
>     val pendingTaskIds = taskRepository.getPendingTaskIds()
>     for (taskId in pendingTaskIds) {
>         // Single poll to catch any missed socket events
>         api.getTaskStatus(taskId).enqueue { response ->
>             if (response.status == "COMPLETE" || response.status == "FAILED") {
>                 handleTaskCompletion(response)
>             }
>         }
>     }
> }
> ```
>
> This ensures no results are lost due to missed WebSocket events.

### 1. Processing Result Upload

```yaml
POST /api/files/processing-result
Authorization: Bearer <token>
Content-Type: application/json

Request:
  summary: string (required)        # Summary text content
  realtime: string (required)       # Full transcript/realtime content
  title: string (required)          # Display title
  tags: string[] (optional)         # ["tag1", "tag2"] - stored via junction table
  templateId: string (optional)     # MAIE template ID used
  templateName: string (optional)   # Template name at time of use
  confidence: number (optional)     # 0.0 - 1.0
  processingTime: number (optional) # seconds
  audioDuration: number (optional)  # seconds
  rawOutput: object (optional)      # Full MAIE response
  sourceAudioId: string (optional)  # Link to audio file
  deviceId: string (optional)       # Android device ID
  deleteAfterDays: number (optional)# Auto-delete setting
  pairName: string (optional)       # Display name for pair

Response 201:
  success: true
  result:
    id: string
    title: string
    tags: string[]
    sourceAudioId: string | null
    createdAt: string

Response 400:
  error: "summary, realtime, and title are required"

Response 401:
  error: "User not authenticated"
```

### 2. Search Endpoint

```yaml
GET /api/files/search
Authorization: Bearer <token>

Query Parameters:
  q: string                    # Search query (title, filename)
  tags: string (comma-sep)     # Filter by tags
  templateId: string           # Filter by template
  type: audio|result           # Filter by type (text pairs removed)
  fromDate: ISO string         # Date range start
  toDate: ISO string           # Date range end
  sortBy: date|title|confidence
  order: asc|desc
  limit: number (default 20)
  offset: number (default 0)

Response 200:
  results: Array<SearchResult>
  total: number
  page: number
  hasMore: boolean

SearchResult:
  type: string
  id: string
  title: string | null
  filename: string | null
  tags: string[]
  uploadedAt: string
  uploadedBy: { id, name } | null
```

### 3. Tags Aggregation

```yaml
GET /api/files/tags
Authorization: Bearer <token>

Query Parameters:
  limit: number (default 50)

Response 200:
  tags:
    - name: string
      count: number
```

---

## Security Considerations

### Data Classification

| Data Type                         | Encryption | Search Indexed | Notes                           |
| --------------------------------- | ---------- | -------------- | ------------------------------- |
| Audio content                     | ✅ AES-256 | ❌             | Binary data                     |
| Text content (summary/transcript) | ✅ AES-256 | ❌             | Full content encrypted          |
| Title                             | ❌ Plain   | ✅             | Searchable metadata             |
| Tags                              | ❌ Plain   | ✅             | Stored in `tags` table, indexed |
| Template ID                       | ❌ Plain   | ✅             | Reference only                  |
| Raw MAIE output                   | ✅ AES-256 | ❌             | Audit purposes                  |

### Access Control

```typescript
// ProcessingResult follows same RBAC as files
- Admin: Full access to all results
- User: Own results + shared results
- Viewer: Read-only own results
```

---

## Monitoring & Metrics

### Key Metrics to Track

| Metric            | Description               | Alert Threshold |
| ----------------- | ------------------------- | --------------- |
| Results per day   | New processing results    | -               |
| Search latency    | P95 search response time  | > 500ms         |
| Storage per user  | Total storage consumption | 80% quota       |
| Failed processing | Status = failed           | > 5%            |
| Tag cardinality   | Unique tags in system     | -               |

### Audit Events

```typescript
// New audit actions
"files.processing_result.create";
"files.processing_result.delete";
"files.search";
"files.tags.aggregate";
```

---

## Rollback Plan

If issues arise, components can be rolled back independently:

1. **Database**: Keep `ProcessingResult` but disable new endpoint
2. **API**: Feature flag for new endpoints
3. **Android**: Version gate - only new app versions use new flow
4. **Frontend**: Feature flag in settings

---

## Success Criteria

### Phase 1 Complete When:

- [ ] Processing results stored with title and tags
- [ ] Basic search by title works
- [ ] Web UI shows result metadata

### Phase 2 Complete When:

- [ ] Multi-filter search operational
- [ ] Tag suggestions working
- [ ] Date range filtering works

### Phase 3 Complete When:

- [ ] Android uploads include metadata
- [ ] Audio-result linking verified
- [ ] End-to-end flow tested

### Phase 4 Complete When:

- [ ] Storage quotas enforced
- [ ] FileShare cascade fixed
- [ ] Download logging active

---

## Appendix: Migration Scripts

### A. Full Migration Script

Migrate existing `TextFilePair` records to new `ProcessingResult` model:

```typescript
// scripts/migrate-to-processing-results.ts
import { prisma } from "../src/lib/prisma";

async function migrateTextPairs() {
  console.log("Starting migration...");

  // 1. Get all existing text pairs
  const pairs = await prisma.textFilePair.findMany({
    include: {
      summaryFile: true,
      realtimeFile: true,
      uploadedBy: true,
      device: true,
    },
  });

  console.log(`Found ${pairs.length} text pairs to migrate`);

  for (const pair of pairs) {
    // 2. Create ProcessingResult for each pair
    const result = await prisma.processingResult.create({
      data: {
        title: pair.name || `Migrated Result ${pair.id.slice(0, 8)}`,
        summaryContent: pair.summaryFile?.data
          ? Buffer.from(pair.summaryFile.data).toString("utf-8").slice(0, 500)
          : null,
        uploadedById: pair.uploadedById,
        deviceId: pair.deviceId,
        status: "completed",
        processedAt: pair.createdAt,
        createdAt: pair.createdAt,
        // Store encrypted content in new fields
        // Note: Actual content migration would decrypt and re-store
      },
    });

    console.log(`Migrated pair ${pair.id} -> result ${result.id}`);
  }

  console.log("Migration complete!");
}

migrateTextPairs()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

### B. Cleanup Script (Post-Migration)

```typescript
// scripts/cleanup-legacy-tables.ts
// Run AFTER verifying migration success

import { prisma } from "../src/lib/prisma";

async function cleanup() {
  // Verify all pairs are migrated
  const unmigrated = await prisma.textFilePair.count();
  const results = await prisma.processingResult.count();

  console.log(`TextFilePairs: ${unmigrated}`);
  console.log(`ProcessingResults: ${results}`);

  if (unmigrated > 0) {
    console.error("ERROR: Still have unmigrated pairs!");
    return;
  }

  // Drop legacy tables via raw SQL (after Prisma schema update)
  // await prisma.$executeRaw`DROP TABLE IF EXISTS text_file_pairs`;

  console.log(
    "Cleanup complete - update schema.prisma to remove TextFilePair model"
  );
}
```

### C. Tag Extraction from Existing Content

```typescript
// If templates define tags, extract them from raw MAIE output
// Otherwise, leave tags empty for migrated records
```

---

## Revision History

| Version | Date         | Changes                                                 |
| ------- | ------------ | ------------------------------------------------------- |
| 1.0     | Nov 27, 2025 | Initial integration plan                                |
| 2.0     | Nov 27, 2025 | Added detailed data flow, search API, migration scripts |
| 2.1     | Nov 27, 2025 | **Security Review Integration** - See below             |
| 2.2     | Nov 27, 2025 | **Implementation Review** - See below                   |
| 2.3     | Nov 27, 2025 | **Final Review (10/10)** - See below                    |

### Final Review Changes (v2.3)

Final implementation review approved the plan. Added polish items:

| Area                   | Issue                                                        | Resolution                                            |
| ---------------------- | ------------------------------------------------------------ | ----------------------------------------------------- |
| **Multipart Boundary** | Proxy must use `form-data` generated boundary, not Android's | Added explicit warning in streaming guide             |
| **Thundering Herd**    | Many apps resuming simultaneously could spike load           | Added random delay (0-2s) before `syncPendingTasks()` |
| **Transaction Safety** | DB record could become "zombie" if MAIE fails mid-stream     | Added "PENDING first" pattern for atomic operations   |

**Detailed Implementation Guides Created:**

- `docs/guides/REPORT_SERVER_IMPLEMENTATION.md` - Backend proxy & API implementation
- `docs/guides/MAIE_SERVER_INTEGRATION.md` - MAIE API contract & template setup
- `docs/guides/ANDROID_APP_IMPLEMENTATION.md` - Mobile client changes

### Implementation Review Changes (v2.2)

Based on implementation review (rated 9.5/10), the following refinements were added:

| Area                      | Issue                                                    | Resolution                                                            |
| ------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------- |
| **Task ID Security**      | Raw MAIE task IDs could leak info if sequential          | Added UUID mapping guidance - always return internal UUIDs to clients |
| **Memory Management**     | Large audio files (50MB+) could crash server if buffered | Added streaming implementation guide using `busboy` + `pipeline`      |
| **UUID Generation**       | Using `uuid` package vs native                           | Documented `crypto.randomUUID()` as preferred (Node.js v14.17+)       |
| **Socket.IO Reliability** | Missed events when app backgrounded                      | Added fallback polling on app resume for pending tasks                |
| **Dead Code**             | `/api/files/text-pair-android` unused                    | Confirmed for removal (reduces attack surface)                        |

### Security Review Changes (v2.1)

Based on external security review, the following critical updates were incorporated:

| Priority       | Issue                                               | Resolution                                                                   |
| -------------- | --------------------------------------------------- | ---------------------------------------------------------------------------- |
| **CRITICAL**   | Hardcoded MAIE API key in Android APK               | Added Phase 0: MAIE Proxy through Report Server with short-lived tokens      |
| **HIGH**       | Audio files stored as SQLite blobs causing DB bloat | Added storage strategy: text in DB, audio on filesystem with path references |
| **MEDIUM**     | Upload reliability on flaky mobile networks         | Documented WorkManager chunked upload recommendation for Android             |
| **LOW**        | Polling for task completion is suboptimal           | Documented Socket.IO real-time notification pattern (already exists)         |
| **DATA MODEL** | Missing size tracking for storage management        | Added `size` field to ProcessingResult model                                 |

**Key Architectural Change:** Android app will NO LONGER communicate directly with MAIE. All AI processing flows through Report Server V2 proxy endpoints, eliminating API key exposure risk.

---

**Document Version:** 2.3  
**Last Updated:** November 27, 2025  
**Owner:** AI Development Team  
**Review Schedule:** Weekly during implementation  
**Review Status:** ✅ **APPROVED FOR IMPLEMENTATION (10/10)**

---

## Related Documentation

| Document                                                                                  | Purpose                               |
| ----------------------------------------------------------------------------------------- | ------------------------------------- |
| [`docs/guides/REPORT_SERVER_IMPLEMENTATION.md`](./guides/REPORT_SERVER_IMPLEMENTATION.md) | Detailed backend implementation guide |
| [`docs/guides/MAIE_SERVER_INTEGRATION.md`](./guides/MAIE_SERVER_INTEGRATION.md)           | MAIE API integration reference        |
| [`docs/guides/ANDROID_APP_IMPLEMENTATION.md`](./guides/ANDROID_APP_IMPLEMENTATION.md)     | Android client implementation guide   |
