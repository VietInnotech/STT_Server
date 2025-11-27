# MAIE AI Server - Integration Guide

**Version:** 1.0  
**Last Updated:** November 27, 2025  
**Parent Document:** [`SYSTEM_INTEGRATION_PLAN.md`](../SYSTEM_INTEGRATION_PLAN.md)  
**Audience:** AI/ML Engineers, DevOps

---

## Table of Contents

1. [Overview](#overview)
2. [API Reference](#api-reference)
3. [Authentication](#authentication)
4. [Processing Flow](#processing-flow)
5. [Template Configuration](#template-configuration)
6. [Error Handling](#error-handling)
7. [Monitoring & Health](#monitoring--health)

---

## Overview

MAIE (Multimedia AI Engine) is the AI processing backend that handles:

- Audio transcription (ASR via Faster-Whisper or ChunkFormer)
- Text summarization (LLM via vLLM)
- Speaker diarization (pyannote.audio)
- Structured output generation based on templates

### Architecture Role

```
┌────────────────┐     X-API-Key     ┌────────────────┐
│ Report Server  │ ─────────────────► │   MAIE Server  │
│ (Port 3000)    │                    │   (Port 8000)  │
└────────────────┘                    └────────────────┘
        ▲                                     │
        │                                     ▼
   JWT Bearer                          ┌──────────────┐
        │                              │ Faster-Whisper│
┌────────────────┐                     │ vLLM Engine  │
│  Android App   │                     │ pyannote     │
└────────────────┘                     └──────────────┘
```

**Key Principle:** Android NEVER communicates directly with MAIE. All requests go through Report Server.

### Base URL

```
http://localhost:8000  (development)
http://maie.internal:8000  (production)
```

---

## API Reference

### Endpoints Summary

| Method   | Endpoint               | Auth         | Description                       |
| -------- | ---------------------- | ------------ | --------------------------------- |
| `POST`   | `/v1/process`          | ✅ X-API-Key | Submit audio for async processing |
| `POST`   | `/v1/process_text`     | ✅ X-API-Key | Submit text for summarization     |
| `GET`    | `/v1/status/{task_id}` | ✅ X-API-Key | Poll processing status            |
| `GET`    | `/v1/models`           | ❌ None      | List available ASR/LLM models     |
| `GET`    | `/v1/templates`        | ❌ None      | List available templates          |
| `GET`    | `/v1/templates/{id}`   | ❌ None      | Get template details              |
| `POST`   | `/v1/templates`        | ✅ X-API-Key | Create template                   |
| `PUT`    | `/v1/templates/{id}`   | ✅ X-API-Key | Update template                   |
| `DELETE` | `/v1/templates/{id}`   | ✅ X-API-Key | Delete template                   |
| `GET`    | `/health`              | ❌ None      | Health check                      |

---

### POST /v1/process

Submit audio file for asynchronous processing.

**Request:**

```http
POST /v1/process HTTP/1.1
Host: maie.internal:8000
X-API-Key: your-api-key
Content-Type: multipart/form-data; boundary=----FormBoundary

------FormBoundary
Content-Disposition: form-data; name="file"; filename="recording.wav"
Content-Type: audio/wav

<binary audio data>
------FormBoundary
Content-Disposition: form-data; name="features"

summary
------FormBoundary
Content-Disposition: form-data; name="template_id"

meeting_notes_v2
------FormBoundary--
```

**Parameters:**

| Field         | Type   | Required | Description                                                                  |
| ------------- | ------ | -------- | ---------------------------------------------------------------------------- |
| `file`        | binary | ✅       | Audio file (WAV 16kHz mono recommended)                                      |
| `features`    | string | ❌       | Processing features: `summary`, `transcript`, `diarize` (default: `summary`) |
| `template_id` | string | ❌       | Template ID for structured output                                            |
| `model`       | string | ❌       | ASR model override                                                           |

**Response (202 Accepted):**

```json
{
  "task_id": "c4b3a216-3e7f-4d2a-8f9a-1234567890ab",
  "status": "PENDING"
}
```

**Error Responses:**

| Status | Error                      | Cause                                   |
| ------ | -------------------------- | --------------------------------------- |
| 400    | `No audio file provided`   | Missing file in request                 |
| 400    | `Unsupported audio format` | File format not supported               |
| 401    | `Invalid API key`          | Missing or invalid X-API-Key            |
| 413    | `File too large`           | Audio exceeds max size (default: 100MB) |
| 503    | `Service unavailable`      | Worker queue full                       |

---

### GET /v1/status/{task_id}

Poll for processing status and results.

**Request:**

```http
GET /v1/status/c4b3a216-3e7f-4d2a-8f9a-1234567890ab HTTP/1.1
Host: maie.internal:8000
X-API-Key: your-api-key
```

**Response (Processing):**

```json
{
  "task_id": "c4b3a216-3e7f-4d2a-8f9a-1234567890ab",
  "status": "PROCESSING_ASR",
  "progress": 45
}
```

**Response (Complete):**

```json
{
  "task_id": "c4b3a216-3e7f-4d2a-8f9a-1234567890ab",
  "status": "COMPLETE",
  "result": {
    "results": {
      "summary": {
        "title": "Q4 Budget Review Meeting",
        "content": "The meeting covered quarterly budget allocations...",
        "attendees": ["John Smith", "Jane Doe"],
        "decisions": [
          "Approved $50K for marketing",
          "Deferred IT upgrades to Q1"
        ],
        "action_items": [
          {
            "task": "Send revised budget",
            "assignee": "John",
            "due": "2025-12-01"
          }
        ],
        "tags": ["meeting", "budget", "Q4", "finance"]
      },
      "transcript": "John: Good morning everyone. Let's start with the Q4 budget review..."
    }
  },
  "metrics": {
    "asr_confidence_avg": 0.92,
    "processing_time_seconds": 45.2,
    "input_duration_seconds": 1800,
    "rtf": 0.025
  }
}
```

**Response (Failed):**

```json
{
  "task_id": "c4b3a216-3e7f-4d2a-8f9a-1234567890ab",
  "status": "FAILED",
  "error": "ASR processing failed: audio too noisy",
  "error_code": "ASR_PROCESSING_ERROR"
}
```

**Status Progression:**

```
PENDING → PREPROCESSING → PROCESSING_ASR → PROCESSING_LLM → COMPLETE
                │                  │                │
                └──────────────────┴────────────────┴──► FAILED
```

| Status           | Description                   | Typical Duration      |
| ---------------- | ----------------------------- | --------------------- |
| `PENDING`        | Queued for processing         | 0-30s                 |
| `PREPROCESSING`  | Audio normalization, chunking | 5-15s                 |
| `PROCESSING_ASR` | Speech-to-text transcription  | 10-60s per 5min audio |
| `PROCESSING_LLM` | Summarization with LLM        | 10-30s                |
| `COMPLETE`       | Results ready                 | -                     |
| `FAILED`         | Processing error occurred     | -                     |

---

### POST /v1/process_text

Submit text for summarization (no audio).

**Request:**

```http
POST /v1/process_text HTTP/1.1
Host: maie.internal:8000
X-API-Key: your-api-key
Content-Type: application/json

{
  "text": "Full text transcript to summarize...",
  "template_id": "meeting_notes_v2",
  "features": "summary"
}
```

**Response (202 Accepted):**

```json
{
  "task_id": "d5c4b327-4f8g-5e3b-9g0b-2345678901bc",
  "status": "PENDING"
}
```

---

### GET /v1/templates

List all available templates.

**Request:**

```http
GET /v1/templates HTTP/1.1
Host: maie.internal:8000
```

**Response:**

```json
{
  "templates": [
    {
      "id": "meeting_notes_v2",
      "name": "Meeting Notes",
      "description": "Extract meeting summary with attendees, decisions, and action items",
      "schema": { ... },
      "created_at": "2025-01-15T10:30:00Z",
      "updated_at": "2025-11-20T14:22:00Z"
    },
    {
      "id": "interview_summary",
      "name": "Interview Summary",
      "description": "Summarize interview with key points and candidate evaluation",
      "schema": { ... },
      "created_at": "2025-03-10T08:00:00Z",
      "updated_at": "2025-03-10T08:00:00Z"
    }
  ]
}
```

---

### GET /v1/templates/{id}

Get template details including JSON schema.

**Response:**

```json
{
  "id": "meeting_notes_v2",
  "name": "Meeting Notes",
  "description": "Extract meeting summary with attendees, decisions, and action items",
  "schema": {
    "type": "object",
    "properties": {
      "title": {
        "type": "string",
        "description": "A concise title for the meeting"
      },
      "content": {
        "type": "string",
        "description": "Executive summary of the meeting"
      },
      "attendees": {
        "type": "array",
        "items": { "type": "string" },
        "description": "List of meeting participants"
      },
      "decisions": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Key decisions made during the meeting"
      },
      "action_items": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "task": { "type": "string" },
            "assignee": { "type": "string" },
            "due": { "type": "string", "format": "date" }
          }
        }
      },
      "tags": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Relevant tags for categorization"
      }
    },
    "required": ["title", "content"]
  },
  "prompt_template": "You are an AI assistant that extracts structured meeting notes...",
  "created_at": "2025-01-15T10:30:00Z",
  "updated_at": "2025-11-20T14:22:00Z"
}
```

---

### POST /v1/templates

Create a new template.

**Request:**

```http
POST /v1/templates HTTP/1.1
Host: maie.internal:8000
X-API-Key: your-api-key
Content-Type: application/json

{
  "id": "custom_report",
  "name": "Custom Report",
  "description": "Generate custom reports with specific fields",
  "schema": {
    "type": "object",
    "properties": {
      "title": { "type": "string" },
      "content": { "type": "string" },
      "key_points": {
        "type": "array",
        "items": { "type": "string" }
      }
    },
    "required": ["title", "content"]
  },
  "prompt_template": "Extract key information from the following transcript..."
}
```

**Response (201 Created):**

```json
{
  "id": "custom_report",
  "name": "Custom Report",
  "created_at": "2025-11-27T15:30:00Z"
}
```

---

### GET /health

Health check endpoint.

**Response:**

```json
{
  "status": "healthy",
  "version": "1.2.0",
  "models": {
    "asr": "faster-whisper-large-v3",
    "llm": "llama-3.1-70b"
  },
  "queue_depth": 3,
  "gpu_memory_used": "12.5GB",
  "gpu_memory_total": "24GB"
}
```

---

## Authentication

### X-API-Key Header

All mutation endpoints require the `X-API-Key` header:

```http
X-API-Key: your-secure-api-key-here
```

**Key Management:**

- Store in environment variables, never in code
- Rotate keys periodically
- Use different keys for dev/staging/production
- **NEVER expose to client applications**

### Key Configuration (MAIE Server)

```yaml
# config.yaml
auth:
  api_keys:
    - key: "prod-key-xxxxxxxx"
      name: "Report Server Production"
      permissions: ["process", "templates"]
    - key: "dev-key-yyyyyyyy"
      name: "Development"
      permissions: ["process", "templates"]
```

---

## Processing Flow

### Sequence Diagram

```
┌─────────┐     ┌──────────────┐     ┌──────────────┐     ┌─────────┐
│ Android │     │Report Server │     │    MAIE      │     │  Worker │
└────┬────┘     └──────┬───────┘     └──────┬───────┘     └────┬────┘
     │                 │                    │                  │
     │  POST /process  │                    │                  │
     │ (JWT + audio)   │                    │                  │
     │────────────────►│                    │                  │
     │                 │                    │                  │
     │                 │  POST /v1/process  │                  │
     │                 │  (X-API-Key)       │                  │
     │                 │───────────────────►│                  │
     │                 │                    │                  │
     │                 │  202 {task_id}     │                  │
     │                 │◄───────────────────│                  │
     │                 │                    │                  │
     │  202 {taskId}   │                    │  Queue task      │
     │◄────────────────│                    │─────────────────►│
     │                 │                    │                  │
     │                 │                    │                  │
     │  GET /status    │                    │                  │
     │────────────────►│                    │                  │
     │                 │  GET /v1/status    │                  │
     │                 │───────────────────►│                  │
     │                 │                    │  Process audio   │
     │                 │  {status: ASR}     │◄─────────────────│
     │                 │◄───────────────────│                  │
     │  {status: ASR}  │                    │                  │
     │◄────────────────│                    │                  │
     │                 │                    │                  │
     │      ...        │       ...          │       ...        │
     │                 │                    │                  │
     │  Socket.IO      │  GET /v1/status    │                  │
     │  task:complete  │───────────────────►│                  │
     │◄────────────────│                    │                  │
     │                 │  {status: COMPLETE}│                  │
     │                 │◄───────────────────│                  │
```

### Polling Strategy

**From Report Server to MAIE:**

```typescript
// Poll every 5 seconds, max 360 attempts (30 minutes)
const POLL_INTERVAL = 5000;
const MAX_ATTEMPTS = 360;

async function pollUntilComplete(taskId: string): Promise<MaieResult> {
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const status = await getMaieStatus(taskId);

    if (status.status === "COMPLETE") {
      return status;
    }

    if (status.status === "FAILED") {
      throw new Error(status.error);
    }

    await sleep(POLL_INTERVAL);
  }

  throw new Error("Processing timeout");
}
```

**Note:** Report Server should use Socket.IO to push updates to Android, not polling.

---

## Template Configuration

### Schema Structure

Templates use JSON Schema to define expected output:

```json
{
  "id": "meeting_notes_v2",
  "name": "Meeting Notes",
  "schema": {
    "type": "object",
    "properties": {
      "title": {
        "type": "string",
        "description": "Concise meeting title"
      },
      "content": {
        "type": "string",
        "description": "Executive summary"
      },
      "tags": {
        "type": "array",
        "items": { "type": "string" },
        "maxItems": 10,
        "description": "Categorization tags"
      }
    },
    "required": ["title", "content"]
  },
  "prompt_template": "Extract structured meeting notes from the transcript:\n\n{{ transcript }}\n\nOutput JSON matching the schema."
}
```

### Tags Configuration

To enable tag extraction, include `tags` field in template schema:

```json
{
  "tags": {
    "type": "array",
    "items": { "type": "string" },
    "maxItems": 10,
    "description": "Extract relevant tags like: meeting, interview, report, urgent, Q1, Q2, Q3, Q4, budget, technical, review"
  }
}
```

---

## Error Handling

### Error Codes

| Code                   | Description              | Recommended Action         |
| ---------------------- | ------------------------ | -------------------------- |
| `ASR_PROCESSING_ERROR` | Transcription failed     | Check audio quality, retry |
| `LLM_PROCESSING_ERROR` | Summarization failed     | Retry, check template      |
| `TEMPLATE_NOT_FOUND`   | Invalid template_id      | Use valid template         |
| `AUDIO_TOO_SHORT`      | Audio less than 1 second | Provide longer audio       |
| `AUDIO_TOO_LONG`       | Audio exceeds limit      | Split audio into chunks    |
| `QUEUE_FULL`           | Worker queue at capacity | Retry with backoff         |
| `GPU_OOM`              | GPU out of memory        | Reduce batch size, retry   |

### Retry Strategy

```typescript
async function submitWithRetry(
  audio: Buffer,
  maxRetries: number = 3
): Promise<string> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await submitToMaie(audio);
      return response.task_id;
    } catch (error) {
      if (attempt === maxRetries) throw error;

      // Exponential backoff
      const delay = Math.pow(2, attempt) * 1000;
      await sleep(delay);
    }
  }
  throw new Error("Max retries exceeded");
}
```

---

## Monitoring & Health

### Health Check Integration

```typescript
// Check MAIE health before processing
async function checkMaieHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${MAIE_URL}/health`);
    const health = await response.json();

    if (health.status !== "healthy") {
      logger.warn("MAIE unhealthy", health);
      return false;
    }

    // Check queue depth
    if (health.queue_depth > 50) {
      logger.warn("MAIE queue high", { depth: health.queue_depth });
    }

    return true;
  } catch (error) {
    logger.error("MAIE health check failed", { error });
    return false;
  }
}
```

### Metrics to Monitor

| Metric                | Description             | Alert Threshold |
| --------------------- | ----------------------- | --------------- |
| `queue_depth`         | Pending tasks in queue  | > 100           |
| `processing_time_avg` | Average processing time | > 120s          |
| `error_rate`          | Failed tasks percentage | > 5%            |
| `gpu_memory_used`     | GPU memory utilization  | > 90%           |
| `asr_confidence_avg`  | Average ASR confidence  | < 0.7           |

### Logging Format

MAIE logs in JSON format:

```json
{
  "timestamp": "2025-11-27T15:30:00.000Z",
  "level": "info",
  "task_id": "c4b3a216-...",
  "event": "processing_complete",
  "duration_ms": 45200,
  "audio_duration_s": 1800,
  "rtf": 0.025,
  "model": "faster-whisper-large-v3"
}
```

---

## Environment Configuration

### Required Environment Variables

```env
# Server
MAIE_HOST=0.0.0.0
MAIE_PORT=8000

# Models
ASR_MODEL=faster-whisper-large-v3
LLM_MODEL=llama-3.1-70b
LLM_ENDPOINT=http://localhost:8080/v1

# GPU
CUDA_VISIBLE_DEVICES=0,1

# Queue
MAX_QUEUE_SIZE=100
WORKER_CONCURRENCY=4

# Storage
TEMP_DIR=/tmp/maie
MAX_AUDIO_SIZE_MB=100

# Auth
API_KEYS_FILE=/etc/maie/api_keys.yaml
```

### Docker Deployment

```yaml
# docker-compose.yml
services:
  maie:
    image: maie-server:latest
    ports:
      - "8000:8000"
    environment:
      - MAIE_HOST=0.0.0.0
      - ASR_MODEL=faster-whisper-large-v3
    volumes:
      - ./api_keys.yaml:/etc/maie/api_keys.yaml:ro
      - /tmp/maie:/tmp/maie
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]
```

---

**Next Steps:** After MAIE is configured, proceed to [Android App Implementation Guide](./ANDROID_APP_IMPLEMENTATION.md).
