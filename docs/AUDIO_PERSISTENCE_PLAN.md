# Audio Persistence in `/api/process` — Implementation Plan

> **Status**: Draft  
> **Created**: 2025-11-28  
> **Related Files**: `src/routes/process.ts`, `src/routes/files.ts`, `prisma/schema.prisma`

---

## 1. Problem Statement

Currently, when Android sends audio to `POST /api/process` (BFF proxy to MAIE):

1. The server **streams** the audio to MAIE but **does not persist** it.
2. If the client wants to keep the original audio, it must call `POST /api/files/audio` **separately**.
3. `ProcessingResult.sourceAudioId` remains `null` unless the client explicitly provides it.

**Consequence**: No automatic link between processing results and their source audio; harder to audit, replay, or enforce retention policies.

---

## 2. Goals

| #   | Goal                                                                 | Rationale                                                       |
| --- | -------------------------------------------------------------------- | --------------------------------------------------------------- |
| G1  | Auto-persist audio when `POST /api/process` is called                | Single request simplifies Android client; ensures traceability. |
| G2  | Link `ProcessingResult.sourceAudioId` → `AudioFile.id` automatically | Enables UI to display/download source audio alongside results.  |
| G3  | Respect storage quotas                                               | Audio counts toward `UserSettings.storageQuotaBytes`.           |
| G4  | Apply separate retention policy for audio                            | Audio may need different retention than text files.             |
| G5  | Admin-configurable max file size                                     | Flexibility for different deployment scenarios.                 |
| G6  | Filesystem storage with streaming encryption                         | Avoid memory exhaustion and SQLite bloat for large files.       |

---

## 3. Design Decisions (Confirmed)

| Decision                 | Value                                             | Notes                                                                                                                                                     |
| ------------------------ | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Max audio size           | **Admin-configurable** via `SystemConfig`         | Key: `system:maxAudioSizeBytes`. Default: 50 MB.                                                                                                          |
| Retention default        | **Separate setting for audio**                    | New key: `system:audioAutoDeleteDays` (distinct from `system:autoDeleteDays` for text). User can override via `UserSettings.defaultAudioDeleteAfterDays`. |
| Storage location         | **Filesystem**                                    | Encrypted files stored on disk; only metadata + file path in DB. Avoids SQLite bloat.                                                                     |
| Client opt-out?          | **No** — audio is always persisted                | Simplifies flow; privacy handled by retention policy.                                                                                                     |
| Quota enforcement        | **Yes**                                           | Reject with 413 if quota exceeded.                                                                                                                        |
| Existing `sourceAudioId` | If provided, skip creating new `AudioFile`        | Reuse existing logic from `/api/files/audio`.                                                                                                             |
| Android summary policy   | **Not allowed** — Android must not send a summary | Enforce that Android uploads realtime only; client summaries are disallowed on the Android endpoint and should be created via the web UI if needed.       |

---

## 4. Proposed Changes

### 4.1 `POST /api/process` Handler (`src/routes/process.ts`)

**Current flow** (simplified):

```
1. Create PENDING ProcessingResult (no sourceAudioId)
2. Parse multipart with busboy, buffer file in memory
3. Submit buffer to MAIE via submitToMaie()
4. Update ProcessingResult with maieTaskId
5. Return internal taskId to client
```

**New flow**:

```
1. Create PENDING ProcessingResult (no sourceAudioId yet)
2. Parse multipart with busboy:
   a. Stream file chunks to a temp file on disk
   b. Collect form fields (template_id, features, deleteAfterDays, sourceAudioId)
   c. Validate file size against admin-configured limit
3. After parsing completes:
   a. If sourceAudioId provided → verify it exists, use it
   b. Else:
      i.   Check storage quota
      ii.  Encrypt temp file → write to storage directory
      iii. Create AudioFile record (with filePath, not encryptedData)
      iv.  Set sourceAudioId = new AudioFile.id
   c. Stream temp file (or existing audio) to MAIE via submitToMaie()
4. Update ProcessingResult with maieTaskId AND sourceAudioId
5. Clean up temp file (encrypted file remains in storage dir)
6. Return internal taskId + audioFileId to client
```

### 4.2 Filesystem Storage Layout

```
/data/audio/                      # Base directory (configurable via env AUDIO_STORAGE_PATH)
  ├── {userId}/                   # Per-user subdirectory
  │   ├── {audioFileId}.enc       # Encrypted audio file
  │   └── {audioFileId}.enc
  └── ...
```

- **Encryption**: AES-256-CBC (same as current `encrypt()` helper).
- **IV storage**: Stored in `AudioFile.encryptedIV` column (unchanged).
- **File path**: Stored in new `AudioFile.filePath` column (relative to base dir).
- **Permissions**: Directory readable/writable only by server process (mode `0700`).

### 4.3 Schema Changes (`prisma/schema.prisma`)

**AudioFile model** — add `filePath`, make `encryptedData` optional:

```prisma
model AudioFile {
  // ... existing fields ...

  encryptedData Bytes?   // DEPRECATED: Now optional, used for migration only
  filePath      String?  // NEW: Relative path to encrypted file on disk

  // ... rest unchanged ...
}
```

**UserSettings model** — add audio-specific retention:

```prisma
model UserSettings {
  // ... existing fields ...

  defaultDeleteAfterDays      Int?  // For TEXT files (rename semantically)
  defaultAudioDeleteAfterDays Int?  // NEW: For AUDIO files

  // ... rest unchanged ...
}
```

**SystemConfig keys** (seeded or created on first use):

| Key                          | Type    | Default            | Description                                 |
| ---------------------------- | ------- | ------------------ | ------------------------------------------- |
| `system:maxAudioSizeBytes`   | integer | `52428800` (50 MB) | Max audio upload size in bytes              |
| `system:audioAutoDeleteDays` | integer | `90`               | Default retention for audio files           |
| `system:autoDeleteDays`      | integer | `30`               | Default retention for text files (existing) |

### 4.4 New/Modified Fields

**Request body / multipart fields**:

| Field             | Type    | Required | Description                                           |
| ----------------- | ------- | -------- | ----------------------------------------------------- |
| `file`            | binary  | Yes      | Audio file (max size from `system:maxAudioSizeBytes`) |
| `template_id`     | string  | No       | MAIE template ID                                      |
| `features`        | string  | No       | Features to request (default `"summary"`)             |
| `sourceAudioId`   | string  | No       | Link to existing `AudioFile` instead of creating new  |
| `deleteAfterDays` | integer | No       | Retention period (overrides user/system default)      |
| `deviceId`        | string  | No       | Android device identifier                             |

**Removed**: `persistAudio` — audio is always persisted.

### 4.5 Helper: `src/services/audioStorageService.ts`

New service for filesystem-based audio storage:

```ts
// Environment variable for storage path
const AUDIO_STORAGE_PATH = process.env.AUDIO_STORAGE_PATH || "./data/audio";

interface SaveAudioOptions {
  userId: string;
  tempFilePath: string;
  filename: string;
  mimeType: string;
  fileSize: number;
  deviceId?: string;
  deleteAfterDays?: number;
}

interface SaveAudioResult {
  audioFileId: string;
  filePath: string; // Relative path
}

export async function saveAudioToFilesystem(
  opts: SaveAudioOptions
): Promise<SaveAudioResult>;
export async function getAudioFilePath(audioFileId: string): Promise<string>; // Full absolute path
export async function deleteAudioFile(audioFileId: string): Promise<void>;
export async function getMaxAudioSizeBytes(): Promise<number>; // From SystemConfig
export async function getDefaultAudioRetentionDays(
  userId: string
): Promise<number | null>;
```

### 4.6 Temp File Handling

Use Node.js `fs.createWriteStream` + `crypto.randomUUID()` for temp filename:

```ts
import os from "os";
import path from "path";
import fs from "fs";

const tempDir = os.tmpdir();
const tempFilePath = path.join(tempDir, `upload-${crypto.randomUUID()}.tmp`);

// In busboy file handler:
const writeStream = fs.createWriteStream(tempFilePath);
file.pipe(writeStream);

// After processing, always clean up:
fs.unlink(tempFilePath, () => {});
```

**Best practice references**:

- [Express Multer DiskStorage](https://expressjs.com/en/resources/middleware/multer.html) — disk storage avoids memory issues.
- [Busboy streaming to disk](https://spin.atomicobject.com/busboy-express-middleware/) — pipe directly to file.
- [Node.js Streams](https://nodejs.org/api/stream.html) — backpressure handling.

### 4.7 Streaming Encryption

Since we're storing on filesystem, use **streaming encryption** to avoid loading entire file into memory:

```ts
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { createReadStream, createWriteStream } from "fs";
import { pipeline } from "stream/promises";

export async function encryptFileToPath(
  inputPath: string,
  outputPath: string
): Promise<string> {
  // Returns IV as hex string
  const iv = randomBytes(16);
  const key = getEncryptionKey(); // From existing encryption.ts
  const cipher = createCipheriv("aes-256-cbc", key, iv);

  await pipeline(
    createReadStream(inputPath),
    cipher,
    createWriteStream(outputPath)
  );

  return iv.toString("hex");
}

export async function decryptFileToStream(
  encryptedPath: string,
  iv: string
): Promise<Readable> {
  const key = getEncryptionKey();
  const decipher = createDecipheriv("aes-256-cbc", key, Buffer.from(iv, "hex"));

  return createReadStream(encryptedPath).pipe(decipher);
}
```

---

## 5. API Contract Changes

### `POST /api/process`

**Request** (multipart/form-data):

| Field             | Type    | Required | Description                                          |
| ----------------- | ------- | -------- | ---------------------------------------------------- |
| `file`            | binary  | Yes      | Audio file (max from `system:maxAudioSizeBytes`)     |
| `template_id`     | string  | No       | MAIE template ID                                     |
| `features`        | string  | No       | Features to request (default `"summary"`)            |
| `sourceAudioId`   | string  | No       | Link to existing `AudioFile` instead of creating new |
| `deleteAfterDays` | integer | No       | Retention period                                     |
| `deviceId`        | string  | No       | Android device identifier                            |

**Response** (202 Accepted):

```json
{
  "success": true,
  "taskId": "internal-uuid",
  "status": "PENDING",
  "message": "Processing started",
  "audioFileId": "uuid-of-created-or-linked-audio"
}
```

**Error responses**:

| Code | Condition                               |
| ---- | --------------------------------------- |
| 400  | No audio file provided                  |
| 400  | Invalid `sourceAudioId` (not found)     |
| 413  | File exceeds `system:maxAudioSizeBytes` |
| 413  | Storage quota exceeded                  |
| 502  | MAIE unavailable                        |

### `GET /api/files/audio/:id` (Updated)

Now reads from filesystem instead of DB `Bytes` field:

```ts
// Pseudocode
const audioFile = await prisma.audioFile.findUnique({ where: { id } });
if (audioFile.filePath) {
  // New: Stream from filesystem with decryption
  const decryptedStream = await decryptFileToStream(
    path.join(AUDIO_STORAGE_PATH, audioFile.filePath),
    audioFile.encryptedIV
  );
  decryptedStream.pipe(res);
} else if (audioFile.encryptedData) {
  // Legacy: Read from DB (for migration period)
  const decrypted = decrypt(audioFile.encryptedData, audioFile.encryptedIV);
  res.send(decrypted);
}
```

### `POST /api/files/audio` (Updated)

Also migrated to filesystem storage (same pattern as `/api/process`).

### `POST /api/files/text-pair-android` (Android-only)

Android clients should only upload **realtime** (live transcript) text via this JSON endpoint. The server will reject any requests that include a `summary` field — web UI remains the place to upload or edit summary text files.

Request (application/json):

| Field             | Type    | Required | Description                                      |
| ----------------- | ------- | -------- | ------------------------------------------------ |
| `realtime`        | string  | Yes      | Real-time (live) transcript text content (UTF-8) |
| `deviceId`        | string  | No       | Android device identifier                        |
| `deleteAfterDays` | integer | No       | Retention override for files (in days)           |
| `pairName`        | string  | No       | Optional name for the pair                       |
| `clientUploadId`  | string  | No       | Client-supplied idempotency key                  |

Response (201 Created):

```json
{
  "success": true,
  "pair": {
    "id": "uuid",
    "realtimeFileId": "uuid",
    "uploadedAt": "2025-11-28T..."
  }
}
```

Errors:

- 400: Missing `realtime` or if a `summary` field is present in the JSON
- 413: Storage quota exceeded
- 401: Unauthorized

Notes:

- Web UI `POST /api/files/text-pair` continues to support summary file uploads. Android is explicitly restricted to realtime for consistent data lineage.

---

## 6. Admin Settings API

### New SystemConfig Keys

| Key                          | Type    | Default    | Admin UI Label                  |
| ---------------------------- | ------- | ---------- | ------------------------------- |
| `system:maxAudioSizeBytes`   | integer | `52428800` | "Max Audio Upload Size (bytes)" |
| `system:audioAutoDeleteDays` | integer | `90`       | "Audio Auto-Delete (days)"      |
| `system:autoDeleteDays`      | integer | `30`       | "Text Auto-Delete (days)"       |

**Admin can update via existing** `PUT /api/admin/settings` endpoint (or add specific endpoint if needed).

---

## 7. Swagger Updates

Update `src/config/swagger.ts` to document:

- New `sourceAudioId`, `deleteAfterDays`, `deviceId` fields on `/api/process`.
- New `audioFileId` in response.
- 413 errors for size limit and quota exceeded.
- Remove `persistAudio` (no longer applicable).

---

## 8. Database Migration

**Migration steps**:

1. Add `filePath` column to `AudioFile` (nullable).
2. Add `defaultAudioDeleteAfterDays` column to `UserSettings` (nullable).
3. Seed `SystemConfig` with new keys if not present.

```sql
-- Migration: add_audio_filesystem_storage
ALTER TABLE audio_files ADD COLUMN filePath TEXT;
ALTER TABLE user_settings ADD COLUMN defaultAudioDeleteAfterDays INTEGER;

-- Seed system config (idempotent)
INSERT OR IGNORE INTO system_config (id, key, value, description, updatedAt)
VALUES
  (lower(hex(randomblob(16))), 'system:maxAudioSizeBytes', '52428800', 'Max audio upload size in bytes', datetime('now')),
  (lower(hex(randomblob(16))), 'system:audioAutoDeleteDays', '90', 'Default audio retention in days', datetime('now'));
```

**Backward compatibility**: Existing `AudioFile` records with `encryptedData` continue to work; new uploads use `filePath`.

**Android summary deprecation**: Existing `TextFile` records that contain `androidSummary` or `androidRealtime` will remain unchanged and accessible. New Android uploads will **not** be allowed to include a `summary` field; the server will reject such requests. If desired, a migration step can be added to migrate `androidSummary` fields into archival columns and mark them as legacy.

---

## 9. Implementation Checklist

### Phase A: Schema & Service Layer (Estimated: 2 hours)

- [ ] **A1**: Create Prisma migration:
  - Add `filePath` to `AudioFile` (nullable).
  - Add `defaultAudioDeleteAfterDays` to `UserSettings`.
- [ ] **A2**: Seed `SystemConfig` with `system:maxAudioSizeBytes` and `system:audioAutoDeleteDays`.
- [ ] **A3**: Create `src/services/audioStorageService.ts`:
  - `saveAudioToFilesystem()` — encrypt + write to disk.
  - `getAudioFilePath()` — resolve full path.
  - `deleteAudioFile()` — remove from disk + update DB.
  - `getMaxAudioSizeBytes()` — read from SystemConfig.
  - `getDefaultAudioRetentionDays()` — user setting fallback to system setting.
- [ ] **A4**: Add streaming encryption helpers to `src/utils/encryption.ts`:
  - `encryptFileToPath()`
  - `decryptFileToStream()`
- [ ] **A5**: Create storage directory on startup (with proper permissions).

### Phase B: Update `/api/process` (Estimated: 2 hours)

- [ ] **B1**: Add file size validation against `system:maxAudioSizeBytes`.
- [ ] **B2**: Stream to temp file during busboy parsing.
- [ ] **B3**: After parsing:
  - Validate `sourceAudioId` if provided (return 400 if not found).
  - Otherwise: check quota, call `saveAudioToFilesystem()`.
- [ ] **B4**: Update `ProcessingResult` with `sourceAudioId`.
- [ ] **B5**: Return `audioFileId` in response.
- [ ] **B6**: Clean up temp file in all code paths.

### Phase C: Update `/api/files/audio` Endpoints (Estimated: 1.5 hours)

- [ ] **C1**: `POST /api/files/audio` — use filesystem storage instead of DB `Bytes`.
- [ ] **C2**: `GET /api/files/audio/:id` — stream from filesystem (with legacy DB fallback).
- [ ] **C3**: `DELETE /api/files/audio/:id` — delete file from disk.

### Phase D: Scheduled Deletion Job (Estimated: 1 hour)

- [ ] **D1**: Update existing cleanup job to delete files from filesystem.
- [ ] **D2**: Ensure `scheduledDeleteAt` respects audio-specific retention settings.

### Phase E: Audit, Logging, Docs (Estimated: 1 hour)

- [ ] **E1**: Add audit log for audio persistence in `/api/process`.
- [ ] **E2**: Log file operations (create, delete) for debugging.
- [ ] **E3**: Update `src/config/swagger.ts`.
- [ ] **E4**: Update `docs/api.md` with new fields and responses.
- [ ] **E5**: Document new SystemConfig keys in admin guide.

### Phase F: Testing (Estimated: 1.5 hours)

- [ ] **F1**: Manual test:
  - Upload audio via `/api/process` → verify file on disk + AudioFile record + linked ProcessingResult.
  - Upload with `sourceAudioId` → verify no new file created, existing link used.
  - Upload exceeding size limit → verify 413.
  - Upload exceeding quota → verify 413.
  - Download audio → verify streaming decryption works.
  - Delete audio → verify file removed from disk.
  - POST `/api/files/text-pair-android` with a `summary` field present → verify server returns 400 and error instructing to not send a summary from Android.
  - POST `/api/files/text-pair-android` with `realtime` only → verify creation of TextFilePair and display in UI; confirm side-by-side comparison with MAIE transcript after processing.
- [ ] **F2**: Test legacy DB audio still downloads correctly.
- [ ] **F3**: (Optional) Integration tests.

### Phase G: Android Text Pair Endpoint (Estimated: 1 hour)

- [ ] **G1**: Update `POST /api/files/text-pair-android` validation to require `realtime` (reject requests that include a `summary` field with 400).
- [ ] **G2**: Add `clientUploadId` (Idempotency-Key) support and dedupe.
- [ ] **G3**: Update Swagger docs and `CLIENT_DEVELOPER_GUIDE.md` to explicitly instruct Android to not send a `summary`.
- [ ] **G4**: Add tests for `summary` rejection, idempotency, and success path.

---

## 10. Rollback Plan

If issues arise:

1. Revert code changes to `src/routes/process.ts` and `src/routes/files.ts`.
2. Orphan files on disk can be cleaned up via script comparing DB records to filesystem.
3. Migration adds nullable columns; no data loss on rollback.
4. Legacy `encryptedData` path remains functional.

---

## 11. Live Transcript Linking (TextFilePair ↔ ProcessingResult)

### 11.1 Current Gap

**Problem**: There is currently **no link** between:

- `TextFilePair` (contains realtime/live transcript from Android)
- `ProcessingResult` (contains MAIE transcript + summary)

**Data flow today** (disconnected):

```
Android ──► POST /api/files/text-pair-android ──► TextFilePair (with realtimeFile)
         │
         └► POST /api/process ──► ProcessingResult (with sourceAudioId, but no textFilePairId)
```

### 11.2 Proposed Link

Add optional `sourceTextFilePairId` to `ProcessingResult`:

```prisma
model ProcessingResult {
  // ... existing fields ...

  sourceAudioId       String?      // Links to source audio
  sourceTextFilePairId String?     // NEW: Links to TextFilePair with live transcript
  sourceTextFilePair  TextFilePair? @relation(fields: [sourceTextFilePairId], references: [id], onDelete: SetNull)

  // ... rest unchanged ...
}

model TextFilePair {
  // ... existing fields ...
  processingResults ProcessingResult[]  // NEW: One-to-many back-relation
}
```

### 11.3 Usage Pattern

**Option A: Android provides `sourceTextFilePairId` during process**

```
1. Android creates TextFilePair via POST /api/files/text-pair-android (gets pairId). NOTE: This endpoint accepts **realtime only**; sending a `summary` field will cause the request to be rejected.
2. Android calls POST /api/process with sourceTextFilePairId=pairId
3. Server links ProcessingResult to TextFilePair
```

**Option B: Server auto-links based on context (more complex)**

Not recommended — requires heuristics to match pairs.

### Recommended Android Flow (explicit)

Use this flow in the Android app to ensure consistent, auditable data lineage:

1. Capture live transcript (realtime) during recording.
2. POST `/api/files/text-pair-android` with `{ realtime, deviceId, clientUploadId }` only — do not include a summary.
3. Receive `pairId` from the server.
4. POST `/api/process` with audio file and `sourceTextFilePairId=pairId` to link audio processing to the live transcript pair.
5. The server persists the realtime transcript (TextFilePair), persists the audio (AudioFile), submits audio to MAIE, and links the `ProcessingResult` to the `TextFilePair` via `sourceTextFilePairId`.

Rationale: This flow ensures the UI and audit trail can show: Live transcript (as recorded on-device) → Audio → MAIE transcript & summary. It avoids the duplication or conflict of client-provided summaries.

### 11.4 Implementation Checklist for Linking

- [ ] Add `sourceTextFilePairId` to `ProcessingResult` model.
- [ ] Add back-relation `processingResults` to `TextFilePair` model.
- [ ] Create migration.
- [ ] Update `POST /api/process` to accept `sourceTextFilePairId` field.
- [ ] Validate `sourceTextFilePairId` exists and belongs to user.
- [ ] Return `sourceTextFilePairId` in status response.
- [ ] Update Swagger docs.

---

## 12. Frontend Integration

### 12.1 Components to Update

**`client/src/lib/api.ts`**:

```ts
// Update ProcessingResultItem interface
export interface ProcessingResultItem {
  // ... existing fields ...
  sourceAudioId?: string; // ADD: Link to audio file
  sourceTextFilePairId?: string; // ADD: Link to text file pair
}
```

**`client/src/pages/FilesPage.tsx`** or **`client/src/components/ProcessingResultsTab.tsx`**:

- In detail modal, add audio player if `sourceAudioId` exists.
- Add "View Live Transcript" link if `sourceTextFilePairId` exists.
- Do not display client/device-provided summaries in MAIE comparison view for new uploads; only web UI summaries (from `POST /api/files/text-pair`) or MAIE summaries are shown. If legacy device summaries exist in historical data, mark them as deprecated and show them only under an "Legacy Device Summary" label.

### 12.2 Audio Playback Component

```tsx
// client/src/components/AudioPlayer.tsx
interface AudioPlayerProps {
  audioFileId: string;
}

export function AudioPlayer({ audioFileId }: AudioPlayerProps) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  useEffect(() => {
    // Fetch audio blob via API and create object URL
    const fetchAudio = async () => {
      const response = await api.get(`/api/files/audio/${audioFileId}`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(response.data);
      setAudioUrl(url);
    };
    fetchAudio();

    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioFileId]);

  if (!audioUrl) return <div>Loading audio...</div>;

  return (
    <audio controls src={audioUrl} className="w-full">
      Your browser does not support audio playback.
    </audio>
  );
}
```

### 12.3 Detail Modal Updates

In `ProcessingResultsTab.tsx` detail modal:

```tsx
{
  /* Audio Player Section */
}
{
  selectedResult?.sourceAudioId && (
    <div className="mt-4 border-t pt-4">
      <h4 className="font-semibold mb-2">Source Audio</h4>
      <AudioPlayer audioFileId={selectedResult.sourceAudioId} />
    </div>
  );
}

{
  /* Link to Live Transcript */
}
{
  selectedResult?.sourceTextFilePairId && (
    <div className="mt-4">
      <Link
        to={`/files/pairs/${selectedResult.sourceTextFilePairId}`}
        className="text-blue-600 hover:underline"
      >
        View Live Transcript (Text Pair)
      </Link>
    </div>
  );
}
```

### 12.4 Backend Endpoint Update

`GET /api/files/results/:id` must include `sourceAudioId` and `sourceTextFilePairId`:

```ts
// In src/routes/files.ts
router.get("/results/:id", authenticate, async (req, res) => {
  const result = await prisma.processingResult.findUnique({
    where: { id: req.params.id },
    select: {
      // ... existing fields ...
      sourceAudioId: true, // ADD
      sourceTextFilePairId: true, // ADD
    },
  });
  // ...
});
```

### 12.5 Frontend Implementation Checklist

- [ ] **F1**: Update `ProcessingResultItem` interface to include `sourceAudioId` and `sourceTextFilePairId`.
- [ ] **F2**: Update backend `GET /api/files/results/:id` to return `sourceAudioId` and `sourceTextFilePairId`.
- [ ] **F3**: Create `AudioPlayer.tsx` component.
- [ ] **F4**: Add audio player to `ProcessingResultsTab.tsx` detail modal.
- [ ] **F5**: Add "View Live Transcript" link to detail modal (if `sourceTextFilePairId`).
- [ ] **F6**: Update `filesApi.getResult()` to include new fields in response type.
- [ ] **F7**: Test audio playback with various formats (wav, mp3, m4a).

---

## 13. Data Model Summary (After Implementation)

```
┌─────────────────┐    sourceAudioId     ┌───────────────┐
│ ProcessingResult│─────────────────────►│   AudioFile   │
│                 │                      └───────────────┘
│  • summaryData  │    sourceTextFilePairId
│  • transcriptData├─────────────────────►┌───────────────┐
│  • tags[]       │                      │ TextFilePair  │
└─────────────────┘                      │               │
                                         │ summaryFileId─┼──►TextFile (AI summary as text)
                                         │ realtimeFileId┼──►TextFile (live transcript)
                                         └───────────────┘
```

**Complete data chain**:

- **Audio** → `AudioFile` → linked via `sourceAudioId`
- **MAIE Transcript** → `ProcessingResult.transcriptData` (encrypted)
- **MAIE Summary** → `ProcessingResult.summaryData` (encrypted)
- **Live Transcript** → `TextFilePair.realtimeFile` → linked via `sourceTextFilePairId`
- **Tags** → `ProcessingResultTag` ↔ `Tag`

---

## 14. Future Enhancements (Out of Scope)

| Enhancement                     | Rationale                                                    |
| ------------------------------- | ------------------------------------------------------------ |
| Background persistence          | Persist audio async after MAIE submission to reduce latency. |
| Chunked/resumable uploads       | Support very long recordings with resumable uploads.         |
| Compression before encryption   | Reduce storage for audio formats that compress well.         |
| Admin UI for storage management | Dashboard showing disk usage, orphan cleanup, etc.           |
| Side-by-side comparison view    | Compare live transcript vs MAIE transcript in UI.            |

---

## 15. References

- [Express Multer DiskStorage](https://expressjs.com/en/resources/middleware/multer.html)
- [Busboy streaming to temp file](https://spin.atomicobject.com/busboy-express-middleware/)
- [Node.js crypto module](https://nodejs.org/api/crypto.html)
- [AES-256-CBC encryption best practices](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)
- Existing code: `src/routes/files.ts`, `src/utils/encryption.ts`, `src/services/storageService.ts`
- Frontend: `client/src/lib/api.ts`, `client/src/components/ProcessingResultsTab.tsx`

---

## 16. Sign-Off

| Role      | Name | Date | Approved |
| --------- | ---- | ---- | -------- |
| Developer |      |      | ☐        |
| Reviewer  |      |      | ☐        |

---

_End of plan._
