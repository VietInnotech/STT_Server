# Architecture

This document describes the architecture of the UNV AI Report Server V2.

## Overview

The project follows a monolithic architecture with a clear separation of concerns. It is built with Node.js and TypeScript, using the Express.js framework for the web server and Prisma as the ORM for database interactions. The system is organized into phases, with Phase 2 adding comprehensive search and filtering capabilities.

**Current Status:** Phase 0-2 Complete ✅ | Audio Persistence Complete ✅

## Directory Structure

```
.
├── client/         # Frontend client (React with Vite)
│   ├── src/
│   │   ├── components/    # React components
│   │   │   ├── SearchFiltersPanel.tsx    # Phase 2: Advanced filter UI
│   │   │   ├── ProcessingResultsTab.tsx  # Phase 1: Results viewer
│   │   │   └── ...
│   │   ├── pages/         # Page components
│   │   ├── stores/        # Zustand stores
│   │   ├── lib/           # Client utilities
│   │   ├── i18n/          # Internationalization
│   │   └── hooks/         # Custom React hooks
│   └── ...
├── data/           # Runtime data (gitignored)
│   └── audio/      # Encrypted audio file storage
│       └── {userId}/  # Per-user directories
│           └── {fileId}.enc  # Encrypted audio files
├── docs/           # Documentation
│   ├── api.md                    # API documentation (Phase 2 search)
│   ├── architecture.md           # This file
│   └── ...
├── prisma/         # Database schema and migrations
│   ├── schema.prisma       # Full data model
│   ├── migrations/         # Database migrations
│   └── seed.ts             # Database seed data
├── scripts/        # Utility scripts
│   └── migrate-audio-to-filesystem.ts  # DB→Filesystem migration
├── src/            # Backend server source code
│   ├── config/             # Configuration files
│   │   └── swagger.ts      # Swagger/OpenAPI config
│   ├── lib/                # Reusable libraries
│   │   ├── logger.ts       # Winston logging
│   │   ├── prisma.ts       # Prisma client
│   │   └── socketBus.ts    # Socket.IO helpers
│   ├── middleware/         # Express middleware
│   │   ├── auth.ts         # JWT authentication
│   │   └── rateLimiter.ts  # Rate limiting
│   ├── routes/             # API route handlers
│   │   ├── files.ts        # Phase 1-2: File & results endpoints
│   │   ├── process.ts      # Phase 1: Processing pipeline
│   │   └── ...
│   ├── services/           # Business logic
│   │   ├── audioStorageService.ts  # Filesystem audio storage
│   │   ├── storageService.ts       # Storage quota management
│   │   ├── scheduler.ts            # Auto-delete scheduler
│   │   └── maieApi.ts              # MAIE proxy service
│   ├── types/              # TypeScript types
│   │   └── permissions.ts  # Permission constants
│   └── utils/              # Utility functions
│       ├── encryption.ts   # AES-256-GCM encryption (buffer + streaming)
│       └── jwt.ts          # JWT utilities
├── index.ts        # Main server entry point
├── package.json    # Project dependencies
├── IMPLEMENTATION_STATUS.md  # Current implementation status
└── PHASE_2_IMPLEMENTATION.md # Phase 2 details
```

## Technology Stack

### Backend

- **Express.js 5.x:** Web server framework
- **Prisma 6.x:** Type-safe ORM for SQLite
- **jsonwebtoken:** JWT authentication
- **Swagger/OpenAPI:** API documentation
- **Winston:** Structured logging
- **Socket.IO:** Real-time communication
- **Bun:** JavaScript runtime

### Frontend

- **React 19:** UI framework
- **Vite 7:** Build tool and dev server
- **TypeScript:** Type-safe JavaScript
- **Tailwind CSS:** Utility-first styling
- **Zustand:** State management
- **Axios:** HTTP client
- **react-i18next:** Internationalization

## Database

SQLite database with comprehensive schema:

**Key Models:**

- `ProcessingResult` - AI processing results (Phase 1-2)
- `ProcessingResultTag` - Result tags (many-to-many)
- `Tag` - Tag categorization
- `AudioFile` - Audio file metadata (content on filesystem)
- `TextFile`, `TextFilePair` - Text file storage
- `User`, `Role` - User management
- `Device`, `UserSettings` - User data
- `AuditLog` - Audit trail

**Security Features:**

- AES-256-GCM encryption for sensitive fields
- Filesystem-based encrypted audio storage
- Unicode NFC normalization for all text
- Permission-based access control
- Audit logging of all actions

## Audio Storage Architecture

Audio files are stored encrypted on the filesystem rather than in the database. This provides:

- **Better Performance:** Streaming large files without loading into memory
- **Scalability:** Database size remains manageable
- **Backup Flexibility:** Separate backup strategies for DB and files

### Storage Structure

```
./data/audio/                    # AUDIO_STORAGE_PATH (configurable)
└── {userId}/                    # Per-user directory
    └── {fileId}.enc             # Encrypted audio file
```

### File Format

Each `.enc` file contains:

```
[SALT:32 bytes][IV:16 bytes][AUTH_TAG:16 bytes][ENCRYPTED_DATA...]
```

- **Encryption:** AES-256-GCM with PBKDF2 key derivation
- **Salt:** Random 32 bytes per file (for key derivation)
- **IV:** Random 16 bytes per file
- **Auth Tag:** 16 bytes (GCM integrity verification)

### Database Schema

```prisma
model AudioFile {
  id                String    @id @default(uuid())
  filename          String
  fileSize          Int
  mimeType          String
  encryptedIV       String    // IV as hex string
  filePath          String?   // Relative path: "{userId}/{fileId}.enc"
  encryptedData     Bytes?    // Legacy: null for new files
  // ... other fields
}
```

### Migration from Database Storage

Existing files stored as `encryptedData` blobs can be migrated:

```bash
# Dry run (preview what would be migrated)
bun run scripts/migrate-audio-to-filesystem.ts --dry-run

# Actual migration (preserves DB blobs)
bun run scripts/migrate-audio-to-filesystem.ts

# Migration + clear DB blobs (recommended)
bun run scripts/migrate-audio-to-filesystem.ts --clear-blobs

# After migration, reclaim SQLite space
sqlite3 prisma/dev.db "VACUUM;"
```

### Configuration

| Environment Variable | Default        | Description                         |
| -------------------- | -------------- | ----------------------------------- |
| `AUDIO_STORAGE_PATH` | `./data/audio` | Base directory for audio files      |
| `ENCRYPTION_KEY`     | (required)     | 64 hex chars (32 bytes) for AES-256 |

## Authentication & Authorization

### JWT Authentication

1. User logs in → JWT generated
2. JWT stored in localStorage
3. JWT included in every request (`Authorization: Bearer <token>`)
4. Server validates JWT signature and expiry

### Permission-Based Authorization

**Built-in Roles:**

- **admin** - All 27 permissions
- **user** - FILES_READ, FILES_WRITE, DEVICES_READ
- **viewer** - FILES_READ only
- **tester** - FILES_READ, FILES_WRITE, DEVICES_READ

**Permission Middleware:**

```typescript
@requirePermission(PERMISSIONS.FILES_READ)
```

## API Endpoints

### Phase 1: Core Operations

| Endpoint                       | Method | Purpose                |
| ------------------------------ | ------ | ---------------------- |
| `/api/files/processing-result` | POST   | Save result            |
| `/api/files/results`           | GET    | List results           |
| `/api/files/results/:id`       | GET    | Get result (decrypted) |
| `/api/files/results/:id`       | DELETE | Delete result          |
| `/api/files/tags`              | GET    | Aggregate tags         |

### Phase 2: Enhanced Search

**New Filters:**

- Confidence range (minConfidence, maxConfidence)
- Status (pending, completed, failed, all)
- Date range (fromDate, toDate)
- Tags (comma-separated)
- Template ID
- Sort options (date, title, confidence, duration)

**Endpoints:**

- `GET /api/files/results?minConfidence=0.8&status=completed`
- `GET /api/files/search?q=test&tags=meeting&sortBy=confidence`

## Frontend Components

### SearchFiltersPanel (NEW Phase 2)

Reusable filter component with:

- Tag autocomplete
- Confidence range sliders (0-100%)
- Status dropdown
- Date range pickers
- Sort controls
- Clear all button

### ProcessingResultsTab (Phase 1 + Phase 2)

Main results interface with:

- Search bar
- Integrated SearchFiltersPanel
- Results table with pagination
- Detail modal
- Delete confirmation

## Security Architecture

### Encryption

**Method:** AES-256-GCM

**Buffer Encryption (small data):**

- Encrypted fields: summary, transcript, text file content
- Per-record IV stored separately
- Format: `[SALT:32][AUTH_TAG:16][ENCRYPTED_DATA]`

**Streaming Encryption (audio files):**

- Large files encrypted to filesystem
- Per-file salt + IV stored in file header
- Format: `[SALT:32][IV:16][AUTH_TAG:16][ENCRYPTED_DATA]`
- Streaming decryption for downloads

**Key Derivation:**

- PBKDF2 with 100,000 iterations
- SHA-256 hash function
- Random salt per encryption operation

### Rate Limiting

- API: 100 req/15 min
- Auth: 5 req/15 min
- Upload: 10 req/hour

### Audit Logging

- All auth events logged
- All data mutations logged
- User action trail maintained
- Sensitive data never logged

## Performance

| Operation           | Time   | Status |
| ------------------- | ------ | ------ |
| List 50 results     | ~80ms  | ✅     |
| Search with filters | ~200ms | ✅     |
| Tag aggregation     | ~50ms  | ✅     |
| Result decryption   | ~50ms  | ✅     |

## Deployment

### Development

```
Local: Bun + Express (3000) + Vite (5173) + SQLite
```

### Production (Recommended)

```
Docker/Server: Bun + Express (reverse proxy) + PostgreSQL
```

## Summary

The system is fully production-ready through Phase 2 with:

- ✅ Comprehensive search and filtering
- ✅ Enterprise-grade encryption (buffer + streaming)
- ✅ Filesystem-based audio storage with encryption
- ✅ Role-based access control
- ✅ Type-safe backend and frontend
- ✅ Full internationalization
- ✅ Audit logging
- ✅ Auto-delete scheduler for file retention

Ready for Phase 3 (Android Integration) deployment.
