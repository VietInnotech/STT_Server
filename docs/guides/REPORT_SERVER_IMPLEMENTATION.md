# Report Server V2 - Implementation Guide

**Version:** 1.0  
**Last Updated:** November 27, 2025  
**Parent Document:** [`SYSTEM_INTEGRATION_PLAN.md`](../SYSTEM_INTEGRATION_PLAN.md)  
**Audience:** Backend Engineers

---

## Table of Contents

1. [Overview](#overview)
2. [Phase 0: MAIE Proxy Implementation](#phase-0-maie-proxy-implementation)
3. [Phase 1: ProcessingResult Model](#phase-1-processingresult-model)
4. [Phase 2: Search API](#phase-2-search-api)
5. [Socket.IO Integration](#socketio-integration)
6. [Testing Checklist](#testing-checklist)

---

## Overview

This guide covers the backend changes required in Report Server V2 to implement the secure BFF (Backend-for-Frontend) pattern for MAIE integration.

### Key Principles

1. **Never expose MAIE API key to clients** - All MAIE requests proxied through Report Server
2. **Stream large files** - Don't buffer 50MB+ audio files in memory
3. **Map task IDs** - Return internal UUIDs, not raw MAIE task IDs
4. **Transaction safety** - Create DB record first, then call MAIE

### Files to Create/Modify

| File                    | Action    | Purpose                    |
| ----------------------- | --------- | -------------------------- |
| `src/routes/process.ts` | 🆕 Create | MAIE proxy endpoints       |
| `src/lib/maieProxy.ts`  | 🆕 Create | Streaming proxy logic      |
| `prisma/schema.prisma`  | ✏️ Modify | Add ProcessingResult model |
| `src/routes/files.ts`   | ✏️ Modify | Add search endpoint        |
| `src/lib/socketBus.ts`  | ✏️ Modify | Add task completion events |

---

## Phase 0: MAIE Proxy Implementation

### Step 1: Install Dependencies

```bash
bun add busboy form-data
bun add -d @types/busboy
```

### Step 2: Create MAIE Proxy Service

```typescript
// src/lib/maieProxy.ts
import FormData from "form-data";
import { Readable } from "stream";
import { logger } from "./logger";

const MAIE_URL = process.env.MAIE_URL || "http://localhost:8000";
const MAIE_API_KEY = process.env.MAIE_API_KEY;

if (!MAIE_API_KEY) {
  logger.error("MAIE_API_KEY environment variable is required");
}

interface MaieProcessResponse {
  task_id: string;
  status: string;
}

interface MaieStatusResponse {
  status:
    | "PENDING"
    | "PREPROCESSING"
    | "PROCESSING_ASR"
    | "PROCESSING_LLM"
    | "COMPLETE"
    | "FAILED";
  result?: {
    results: {
      summary: {
        title: string;
        content: string;
        tags?: string[];
        [key: string]: unknown;
      };
      transcript: string;
    };
  };
  metrics?: {
    asr_confidence_avg: number;
    processing_time_seconds: number;
    input_duration_seconds: number;
    rtf: number;
  };
  error?: string;
  error_code?: string;
}

/**
 * Submit audio to MAIE for processing
 *
 * ⚠️ CRITICAL: Uses streaming - never buffers entire file in memory
 */
export async function submitToMaie(
  fileStream: Readable,
  filename: string,
  templateId?: string,
  features: string = "summary"
): Promise<MaieProcessResponse> {
  const formData = new FormData();

  // Stream file directly to FormData - no buffering!
  formData.append("file", fileStream, { filename });
  formData.append("features", features);

  if (templateId) {
    formData.append("template_id", templateId);
  }

  // ⚠️ CRITICAL: Use formData.getHeaders() - NOT the incoming request headers
  // form-data generates its own boundary string that MAIE expects
  const response = await fetch(`${MAIE_URL}/v1/process`, {
    method: "POST",
    headers: {
      "X-API-Key": MAIE_API_KEY!,
      ...formData.getHeaders(), // ← This includes the correct Content-Type with boundary
    },
    body: formData as unknown as BodyInit,
    // @ts-expect-error - duplex is required for streaming body in Node.js
    duplex: "half",
  });

  if (!response.ok) {
    const error = await response.text();
    logger.error("MAIE process request failed", {
      status: response.status,
      error,
    });
    throw new Error(`MAIE request failed: ${response.status} - ${error}`);
  }

  return response.json() as Promise<MaieProcessResponse>;
}

/**
 * Check MAIE task status
 */
export async function getMaieStatus(
  taskId: string
): Promise<MaieStatusResponse> {
  const response = await fetch(`${MAIE_URL}/v1/status/${taskId}`, {
    headers: {
      "X-API-Key": MAIE_API_KEY!,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    logger.error("MAIE status request failed", {
      taskId,
      status: response.status,
      error,
    });
    throw new Error(`MAIE status request failed: ${response.status}`);
  }

  return response.json() as Promise<MaieStatusResponse>;
}

/**
 * Submit text to MAIE for summarization
 */
export async function submitTextToMaie(
  text: string,
  templateId?: string
): Promise<MaieProcessResponse> {
  const response = await fetch(`${MAIE_URL}/v1/process_text`, {
    method: "POST",
    headers: {
      "X-API-Key": MAIE_API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      template_id: templateId,
      features: "summary",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`MAIE text request failed: ${response.status} - ${error}`);
  }

  return response.json() as Promise<MaieProcessResponse>;
}
```

### Step 3: Create Process Routes

```typescript
// src/routes/process.ts
import { Router } from "express";
import busboy from "busboy";
import { Readable } from "stream";
import crypto from "crypto";
import { prisma } from "../lib/prisma";
import { authenticate } from "../middleware/auth";
import { uploadLimiter } from "../middleware/rateLimiter";
import {
  submitToMaie,
  getMaieStatus,
  submitTextToMaie,
} from "../lib/maieProxy";
import { logger } from "../lib/logger";
import { emitToUser } from "../lib/socketBus";

const router = Router();

/**
 * POST /api/process
 *
 * Submit audio for AI processing (MAIE proxy)
 *
 * ⚠️ TRANSACTION SAFETY PATTERN:
 * 1. Create DB record as PENDING first (with internal UUID)
 * 2. Stream to MAIE
 * 3. Update DB record with MAIE task_id (or mark failed)
 */
router.post("/", authenticate, uploadLimiter, async (req, res) => {
  const userId = req.user!.id;

  // Generate internal task ID (never expose MAIE's task_id)
  const internalTaskId = crypto.randomUUID();

  // Step 1: Create PENDING record BEFORE calling MAIE
  // This ensures we have a record even if the connection drops
  let processingResult;
  try {
    processingResult = await prisma.processingResult.create({
      data: {
        id: internalTaskId,
        status: "pending",
        uploadedById: userId,
        // maieTaskId will be set after MAIE responds
      },
    });
  } catch (dbError) {
    logger.error("Failed to create processing result", { error: dbError });
    return res.status(500).json({ error: "Failed to initiate processing" });
  }

  // Parse multipart form data with streaming
  const bb = busboy({ headers: req.headers });

  let templateId: string | undefined;
  let features = "summary";
  let fileReceived = false;

  bb.on("field", (name, val) => {
    if (name === "template_id") templateId = val;
    if (name === "features") features = val;
  });

  bb.on("file", async (name, file, info) => {
    fileReceived = true;
    const { filename } = info;

    try {
      // Step 2: Stream to MAIE (file is a Readable stream)
      const maieResponse = await submitToMaie(
        file,
        filename,
        templateId,
        features
      );

      // Step 3: Update DB record with MAIE task_id
      await prisma.processingResult.update({
        where: { id: internalTaskId },
        data: {
          maieTaskId: maieResponse.task_id,
          maieStatus: maieResponse.status,
          templateId,
        },
      });

      logger.info("Processing submitted to MAIE", {
        internalTaskId,
        maieTaskId: maieResponse.task_id,
        userId,
      });

      // Return internal ID only - never expose MAIE's task_id
      res.status(202).json({
        success: true,
        taskId: internalTaskId,
        status: "PENDING",
        message: "Processing started",
      });
    } catch (maieError) {
      // Mark record as failed if MAIE request fails
      await prisma.processingResult.update({
        where: { id: internalTaskId },
        data: {
          status: "failed",
          errorMessage:
            maieError instanceof Error ? maieError.message : "Unknown error",
        },
      });

      logger.error("MAIE submission failed", {
        internalTaskId,
        error: maieError,
      });

      res.status(502).json({
        error: "AI processing service unavailable",
        taskId: internalTaskId,
      });
    }
  });

  bb.on("close", () => {
    if (!fileReceived) {
      // Clean up orphan record
      prisma.processingResult
        .delete({ where: { id: internalTaskId } })
        .catch(() => {});
      res.status(400).json({ error: "No audio file provided" });
    }
  });

  bb.on("error", (error) => {
    logger.error("Busboy parsing error", { error });
    prisma.processingResult
      .delete({ where: { id: internalTaskId } })
      .catch(() => {});
    res.status(400).json({ error: "Failed to parse upload" });
  });

  req.pipe(bb);
});

/**
 * GET /api/process/:taskId/status
 *
 * Check processing status (polls MAIE internally)
 */
router.get("/:taskId/status", authenticate, async (req, res) => {
  const { taskId } = req.params;
  const userId = req.user!.id;

  // Find the processing result by internal ID
  const result = await prisma.processingResult.findFirst({
    where: {
      id: taskId,
      uploadedById: userId, // Ensure user owns this task
    },
  });

  if (!result) {
    return res.status(404).json({ error: "Task not found" });
  }

  // If already complete/failed in DB, return cached result
  if (result.status === "completed" || result.status === "failed") {
    return res.json({
      taskId,
      status: result.status === "completed" ? "COMPLETE" : "FAILED",
      result:
        result.status === "completed"
          ? {
              title: result.title,
              summary: result.summaryPreview,
              // Note: Full content requires decryption - separate endpoint
            }
          : undefined,
      error: result.errorMessage,
    });
  }

  // Poll MAIE for current status
  if (!result.maieTaskId) {
    return res.json({
      taskId,
      status: "PENDING",
      progress: 0,
    });
  }

  try {
    const maieStatus = await getMaieStatus(result.maieTaskId);

    // Map MAIE status to progress percentage
    const progressMap: Record<string, number> = {
      PENDING: 10,
      PREPROCESSING: 25,
      PROCESSING_ASR: 50,
      PROCESSING_LLM: 75,
      COMPLETE: 100,
      FAILED: 100,
    };

    // If complete, store results and emit Socket.IO event
    if (maieStatus.status === "COMPLETE" && maieStatus.result) {
      const summary = maieStatus.result.results.summary;
      const transcript = maieStatus.result.results.transcript;

      // TODO: Encrypt content before storing
      await prisma.processingResult.update({
        where: { id: taskId },
        data: {
          status: "completed",
          maieStatus: "COMPLETE",
          title: summary.title,
          summaryPreview: summary.content.slice(0, 200),
          confidence: maieStatus.metrics?.asr_confidence_avg,
          processingTime: maieStatus.metrics?.processing_time_seconds,
          audioDuration: maieStatus.metrics?.input_duration_seconds,
          rtf: maieStatus.metrics?.rtf,
          processedAt: new Date(),
        },
      });

      // TODO: Store tags via junction table
      if (summary.tags && summary.tags.length > 0) {
        // await addTagsToResult(taskId, summary.tags);
      }

      // Emit Socket.IO event for real-time notification
      emitToUser(userId, "task:complete", {
        taskId,
        status: "COMPLETE",
        result: {
          title: summary.title,
          summary: summary.content,
          transcript,
          tags: summary.tags || [],
          confidence: maieStatus.metrics?.asr_confidence_avg,
          processingTime: maieStatus.metrics?.processing_time_seconds,
          audioDuration: maieStatus.metrics?.input_duration_seconds,
        },
      });

      return res.json({
        taskId,
        status: "COMPLETE",
        result: {
          title: summary.title,
          summary: summary.content,
          transcript,
          tags: summary.tags || [],
          confidence: maieStatus.metrics?.asr_confidence_avg,
          processingTime: maieStatus.metrics?.processing_time_seconds,
          audioDuration: maieStatus.metrics?.input_duration_seconds,
        },
      });
    }

    if (maieStatus.status === "FAILED") {
      await prisma.processingResult.update({
        where: { id: taskId },
        data: {
          status: "failed",
          maieStatus: "FAILED",
          errorMessage: maieStatus.error,
          errorCode: maieStatus.error_code,
        },
      });

      emitToUser(userId, "task:complete", {
        taskId,
        status: "FAILED",
        error: maieStatus.error,
        errorCode: maieStatus.error_code,
      });

      return res.json({
        taskId,
        status: "FAILED",
        error: maieStatus.error,
        errorCode: maieStatus.error_code,
      });
    }

    // Still processing
    await prisma.processingResult.update({
      where: { id: taskId },
      data: { maieStatus: maieStatus.status },
    });

    return res.json({
      taskId,
      status: maieStatus.status,
      progress: progressMap[maieStatus.status] || 0,
    });
  } catch (error) {
    logger.error("Failed to get MAIE status", { taskId, error });
    return res.status(502).json({
      error: "AI processing service unavailable",
    });
  }
});

/**
 * POST /api/process/text
 *
 * Submit text for summarization (no audio)
 */
router.post("/text", authenticate, async (req, res) => {
  const { text, templateId } = req.body;
  const userId = req.user!.id;

  if (!text || typeof text !== "string") {
    return res.status(400).json({ error: "text is required" });
  }

  const internalTaskId = crypto.randomUUID();

  try {
    // Create PENDING record first
    await prisma.processingResult.create({
      data: {
        id: internalTaskId,
        status: "pending",
        uploadedById: userId,
        templateId,
      },
    });

    const maieResponse = await submitTextToMaie(text, templateId);

    await prisma.processingResult.update({
      where: { id: internalTaskId },
      data: {
        maieTaskId: maieResponse.task_id,
        maieStatus: maieResponse.status,
      },
    });

    res.status(202).json({
      success: true,
      taskId: internalTaskId,
      status: "PENDING",
    });
  } catch (error) {
    await prisma.processingResult.update({
      where: { id: internalTaskId },
      data: {
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      },
    });

    res.status(502).json({
      error: "AI processing service unavailable",
      taskId: internalTaskId,
    });
  }
});

export default router;
```

### Step 4: Register Routes in index.ts

```typescript
// In index.ts, add:
import processRoutes from "./src/routes/process";

// After other route registrations:
app.use("/api/process", processRoutes);
```

### Step 5: Environment Variables

Add to `.env`:

```env
MAIE_URL=http://localhost:8000
MAIE_API_KEY=your-secure-api-key-here
```

---

## Phase 1: ProcessingResult Model

### Step 1: Update Prisma Schema

Add to `prisma/schema.prisma`:

```prisma
model ProcessingResult {
  id              String   @id @default(uuid())

  // Searchable metadata
  title           String?
  templateId      String?
  templateName    String?

  // MAIE task tracking
  maieTaskId      String?  @unique
  maieStatus      String?

  // Linked audio (optional)
  sourceAudioId   String?
  sourceAudio     AudioFile? @relation(fields: [sourceAudioId], references: [id], onDelete: SetNull)

  // Content (encrypted)
  summaryData     Bytes?
  summaryIv       String?
  transcriptData  Bytes?
  transcriptIv    String?
  summaryPreview  String?
  summarySize     Int?
  transcriptSize  Int?

  // Processing metrics
  confidence      Float?
  processingTime  Float?
  audioDuration   Float?
  rtf             Float?

  // Raw data (encrypted)
  rawMaieOutput   String?

  // Status
  status          String   @default("pending")
  errorMessage    String?
  errorCode       String?

  // Ownership
  deviceId        String?
  device          Device?  @relation(fields: [deviceId], references: [id], onDelete: SetNull)
  uploadedById    String?
  uploadedBy      User?    @relation(fields: [uploadedById], references: [id], onDelete: SetNull)

  // Tags (many-to-many)
  tags            ProcessingResultTag[]

  // Timestamps
  processedAt     DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  // Auto-delete
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

model Tag {
  id        String   @id @default(uuid())
  name      String   @unique

  results   ProcessingResultTag[]

  createdAt DateTime @default(now())

  @@index([name])
  @@map("tags")
}

model ProcessingResultTag {
  id                  String           @id @default(uuid())

  processingResultId  String
  processingResult    ProcessingResult @relation(fields: [processingResultId], references: [id], onDelete: Cascade)

  tagId               String
  tag                 Tag              @relation(fields: [tagId], references: [id], onDelete: Cascade)

  createdAt           DateTime         @default(now())

  @@unique([processingResultId, tagId])
  @@index([processingResultId])
  @@index([tagId])
  @@map("processing_result_tags")
}
```

### Step 2: Run Migration

```bash
bun run db:migrate
```

---

## Phase 2: Search API

### Search Endpoint Implementation

Add to `src/routes/files.ts`:

```typescript
/**
 * GET /api/files/search
 *
 * Unified search across processing results
 */
router.get("/search", authenticate, async (req, res) => {
  const userId = req.user!.id;
  const isAdmin = req.user!.role === "ADMIN";

  const {
    q,
    tags,
    templateId,
    type = "all",
    fromDate,
    toDate,
    sortBy = "date",
    order = "desc",
    limit = "20",
    offset = "0",
  } = req.query;

  const take = Math.min(parseInt(limit as string) || 20, 100);
  const skip = parseInt(offset as string) || 0;

  // Build where clause
  const where: any = {};

  // Ownership filter (admin sees all)
  if (!isAdmin) {
    where.uploadedById = userId;
  }

  // Text search on title
  if (q) {
    where.title = { contains: q as string, mode: "insensitive" };
  }

  // Tag filter (using junction table)
  if (tags) {
    const tagList = (tags as string)
      .split(",")
      .map((t) => t.trim().toLowerCase());
    where.tags = {
      some: {
        tag: { name: { in: tagList } },
      },
    };
  }

  // Template filter
  if (templateId) {
    where.templateId = templateId;
  }

  // Date range
  if (fromDate || toDate) {
    where.processedAt = {};
    if (fromDate) where.processedAt.gte = new Date(fromDate as string);
    if (toDate) where.processedAt.lte = new Date(toDate as string);
  }

  // Status filter (only show completed by default)
  where.status = "completed";

  // Build orderBy
  const orderByMap: Record<string, any> = {
    date: { processedAt: order },
    title: { title: order },
    confidence: { confidence: order },
  };

  try {
    const [results, total] = await Promise.all([
      prisma.processingResult.findMany({
        where,
        orderBy: orderByMap[sortBy as string] || { processedAt: "desc" },
        take,
        skip,
        include: {
          tags: { include: { tag: true } },
          uploadedBy: { select: { id: true, name: true } },
        },
      }),
      prisma.processingResult.count({ where }),
    ]);

    res.json({
      success: true,
      results: results.map((r) => ({
        id: r.id,
        type: "result",
        title: r.title,
        tags: r.tags.map((t) => t.tag.name),
        templateId: r.templateId,
        templateName: r.templateName,
        confidence: r.confidence,
        summaryPreview: r.summaryPreview,
        uploadedAt: r.createdAt.toISOString(),
        processedAt: r.processedAt?.toISOString(),
        uploadedBy: r.uploadedBy,
        sourceAudioId: r.sourceAudioId,
      })),
      pagination: {
        total,
        limit: take,
        offset: skip,
        hasMore: skip + take < total,
      },
    });
  } catch (error) {
    logger.error("Search failed", { error });
    res.status(500).json({ error: "Search failed" });
  }
});

/**
 * GET /api/files/tags
 *
 * Get popular tags for filtering/autocomplete
 */
router.get("/tags", authenticate, async (req, res) => {
  const userId = req.user!.id;
  const isAdmin = req.user!.role === "ADMIN";
  const limit = parseInt(req.query.limit as string) || 50;

  const tags = await prisma.tag.findMany({
    where: isAdmin
      ? undefined
      : {
          results: {
            some: {
              processingResult: { uploadedById: userId },
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

  res.json({
    success: true,
    tags: tags.map((t) => ({
      name: t.name,
      count: t._count.results,
    })),
  });
});
```

---

## Socket.IO Integration

### Update socketBus.ts

```typescript
// src/lib/socketBus.ts
import { Server as SocketServer, Socket } from "socket.io";

let io: SocketServer | null = null;
const userSockets = new Map<string, Set<string>>(); // userId -> Set<socketId>

export function initializeSocketIO(server: SocketServer) {
  io = server;

  io.on("connection", (socket: Socket) => {
    const userId = socket.data.userId;

    if (userId) {
      if (!userSockets.has(userId)) {
        userSockets.set(userId, new Set());
      }
      userSockets.get(userId)!.add(socket.id);
    }

    socket.on("disconnect", () => {
      if (userId) {
        userSockets.get(userId)?.delete(socket.id);
      }
    });
  });
}

/**
 * Emit event to specific user's connected sockets
 */
export function emitToUser(userId: string, event: string, data: unknown) {
  if (!io) return;

  const socketIds = userSockets.get(userId);
  if (socketIds) {
    socketIds.forEach((socketId) => {
      io!.to(socketId).emit(event, data);
    });
  }
}

/**
 * Emit event to all connected sockets
 */
export function emitToAll(event: string, data: unknown) {
  if (!io) return;
  io.emit(event, data);
}
```

---

## Testing Checklist

### Phase 0 Tests

- [ ] `POST /api/process` accepts audio file and returns internal UUID
- [ ] Large files (50MB) don't cause memory spikes
- [ ] Failed MAIE requests mark DB record as "failed"
- [ ] `GET /api/process/:taskId/status` returns correct progress
- [ ] Socket.IO emits `task:complete` when processing finishes
- [ ] Users can only access their own tasks

### Phase 1 Tests

- [ ] ProcessingResult records created correctly
- [ ] Tags stored in junction table
- [ ] Tags normalized to lowercase

### Phase 2 Tests

- [ ] Search by title works
- [ ] Search by tag works
- [ ] Date range filtering works
- [ ] Pagination works correctly
- [ ] Users only see their own results (unless admin)

### Security Tests

- [ ] MAIE API key never appears in responses
- [ ] Internal UUID returned, not MAIE task_id
- [ ] Rate limiting applied to `/api/process`
- [ ] JWT authentication required on all endpoints

---

## Common Issues & Solutions

### Issue: "boundary" error when proxying multipart

**Cause:** Using Android's Content-Type header instead of `form-data` generated header.

**Solution:** Always use `formData.getHeaders()`:

```typescript
// ❌ WRONG
headers: { "Content-Type": req.headers["content-type"] }

// ✅ CORRECT
headers: { ...formData.getHeaders() }
```

### Issue: Memory spikes on large uploads

**Cause:** Using `multer` memory storage or reading entire file.

**Solution:** Use `busboy` with streaming:

```typescript
// ❌ WRONG
const buffer = await fs.readFile(file.path);

// ✅ CORRECT
bb.on("file", (name, file, info) => {
  formData.append("file", file, { filename: info.filename });
});
```

### Issue: Zombie DB records

**Cause:** Network failure after MAIE call but before DB update.

**Solution:** Create PENDING record first, update after MAIE response:

```typescript
// 1. Create PENDING record
const result = await prisma.processingResult.create({ ... });

// 2. Call MAIE
const maieResponse = await submitToMaie(...);

// 3. Update with MAIE task_id
await prisma.processingResult.update({ ... });
```

---

**Next Steps:** After completing these implementations, proceed to [Android App Implementation Guide](./ANDROID_APP_IMPLEMENTATION.md).
