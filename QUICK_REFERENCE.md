# Quick Reference Guide

**Project:** UNV AI Report Ecosystem Integration  
**Phase:** Phase 1 Complete, Phase 2 Ready  
**Last Updated:** November 28, 2025

---

## Project Status

```
PHASE 0 ✅ Security Fix - COMPLETE
├─ MAIE proxy endpoints - ✅
├─ Socket.IO events - ✅
└─ Android security removed - ⏳ Phase 3

PHASE 1 ✅ Foundation - COMPLETE
├─ Database schema - ✅
├─ 6 API endpoints - ✅
├─ Encryption (AES-256-GCM) - ✅
├─ Unicode normalization (NFC) - ✅
├─ React components - ✅
└─ i18n translations - ✅

PHASE 2 🚀 Enhanced Search - READY
├─ Backend filters - 📋 TODO
├─ Frontend UI - 📋 TODO
└─ Testing - 📋 TODO

PHASE 3 📱 Android Integration - PLANNED
PHASE 4 🚀 Polish & Launch - PLANNED
```

---

## Key Files

### Backend

| Path                       | Purpose                 | Lines | Status |
| -------------------------- | ----------------------- | ----- | ------ |
| `src/routes/files.ts`      | File & result endpoints | 2,875 | ✅     |
| `src/routes/process.ts`    | Processing endpoints    | 647   | ✅     |
| `src/routes/stats.ts`      | Dashboard & metrics     | 250+  | ✅     |
| `src/routes/templates.ts`  | Template management     | 306   | ✅     |
| `src/types/permissions.ts` | Permission constants    | 143   | ✅     |
| `src/utils/encryption.ts`  | AES encryption utils    | -     | ✅     |
| `prisma/schema.prisma`     | Database schema         | -     | ✅     |

### Frontend

| Path                                             | Purpose              | Lines | Status |
| ------------------------------------------------ | -------------------- | ----- | ------ |
| `client/src/components/ProcessingResultsTab.tsx` | Main component       | 594   | ✅     |
| `client/src/pages/FilesPage.tsx`                 | File management page | 300+  | ✅     |
| `client/src/lib/api.ts`                          | API client           | 300+  | ✅     |
| `client/src/i18n/`                               | Translations         | -     | ✅     |

### Documentation

| Path                           | Purpose          | Status     |
| ------------------------------ | ---------------- | ---------- |
| `DEVELOPMENT_ORCHESTRATION.md` | Project timeline | ✅ Updated |
| `PHASE_1_COMPLETION_REPORT.md` | Phase 1 details  | ✅ New     |
| `IMPLEMENTATION_STATUS.md`     | Current state    | ✅ New     |
| `docs/api.md`                  | API spec         | ✅         |
| `docs/architecture.md`         | Architecture     | ✅         |

---

## API Endpoints

### File Operations

```bash
# Upload result with encryption
POST /api/files/processing-result
Authorization: Bearer $TOKEN
Content-Type: application/json
{
  "title": "...",
  "summary": "...",
  "transcript": "...",
  "tags": ["tag1", "tag2"],
  "templateId": "meeting_notes_v2",
  "confidence": 0.92,
  "processingTime": 4.5,
  "audioDuration": 12.3
}
Response: 201 Created

# List results
GET /api/files/results?limit=20&offset=0&sortBy=date&order=desc
Authorization: Bearer $TOKEN
Response: 200 OK
{
  "success": true,
  "results": [...],
  "pagination": {...}
}

# Get single result (decrypted)
GET /api/files/results/:id
Authorization: Bearer $TOKEN
Response: 200 OK
{
  "success": true,
  "result": {
    "id": "...",
    "title": "...",
    "summary": "...",      // Decrypted
    "transcript": "...",   // Decrypted
    "tags": [...]
  }
}

# Delete result
DELETE /api/files/results/:id
Authorization: Bearer $TOKEN
Response: 200 OK

# Search with filters
GET /api/files/search?q=meeting&tags=q4&templateId=meeting_notes_v2&fromDate=2025-11-01&toDate=2025-11-30
Authorization: Bearer $TOKEN
Response: 200 OK

# Get tags for filters
GET /api/files/tags?limit=50
Authorization: Bearer $TOKEN
Response: 200 OK
{
  "success": true,
  "tags": [
    {"name": "meeting", "count": 12},
    {"name": "q4-planning", "count": 5},
    ...
  ]
}
```

### Processing Operations

```bash
# Submit audio for processing
POST /api/process
Authorization: Bearer $TOKEN
Content-Type: multipart/form-data
file=<audio.wav>
template_id=meeting_notes_v2
features=summary

# Check processing status
GET /api/process/:taskId/status
Authorization: Bearer $TOKEN
Response: 200 OK
{
  "taskId": "...",
  "status": "PROCESSING_ASR|PROCESSING_LLM|COMPLETE|FAILED",
  "progress": 50,
  "result": {...}
}

# Submit text for summarization
POST /api/process/text
Authorization: Bearer $TOKEN
Content-Type: application/json
{
  "text": "...",
  "templateId": "meeting_notes_v2"
}

# Check MAIE health
GET /api/process/health
Authorization: Bearer $TOKEN
Response: 200 OK
{
  "maie": "healthy",
  "timestamp": "..."
}

# Get pending tasks
GET /api/process/pending
Authorization: Bearer $TOKEN
Response: 200 OK
{
  "pending": [...]
}
```

---

## Database Models

### ProcessingResult

```
id                   String (PK)
title                String (NFC normalized)
templateId           String
templateName         String

summaryData          Bytes (AES-256-GCM encrypted)
summaryIv            String (Base64 IV)
summaryPreview       String (First 200 chars, NFC)
summarySize          Int (Original byte length)

transcriptData       Bytes (AES-256-GCM encrypted)
transcriptIv         String (Base64 IV)
transcriptSize       Int (Original byte length)

confidence           Float (0-1)
processingTime       Float (seconds)
audioDuration        Float (seconds)

status               String (pending|processing|completed|failed)
uploadedById         String (FK -> User)
processedAt          DateTime
createdAt            DateTime
updatedAt            DateTime

tags                 ProcessingResultTag[] (M:M)
```

### ProcessingResultTag (Junction)

```
processingResultId   String (PK, FK)
tagId                String (PK, FK)
```

### Tag

```
id                   String (PK)
name                 String (lowercase, unique)
```

---

## Permissions

### Permission List

```
users.read           View user list
users.write          Create/edit users
users.delete         Delete users

devices.read         View devices
devices.write        Create/edit devices
devices.delete       Delete devices

files.read           View files & results
files.write          Create/upload results
files.delete         Delete results

settings.read        View settings
settings.write       Change settings

roles.read           View roles
roles.write          Create/edit roles
roles.delete         Delete roles

templates.read       View templates
templates.write      Create/edit templates
templates.delete     Delete templates

logs.read            View audit logs
```

### Built-in Roles

```
admin:   All 27 permissions
user:    files.read, files.write, devices.read
viewer:  files.read, devices.read
tester:  files.read, files.write, devices.read
```

---

## Common Commands

### Development

```bash
# Setup
bun install
bun run db:generate
bun run db:migrate

# Run
bun run dev:server          # Backend on :3000
cd client && bun run dev    # Frontend on :5173

# Database
bun run db:studio           # Prisma Studio on :5555
sqlite3 prisma/dev.db       # Direct SQLite access

# Testing
./test-quick.sh             # Quick API tests
```

### Database

```bash
# Create migration
bun run db:migrate

# View data
bun run db:studio

# Query directly
sqlite3 prisma/dev.db
> SELECT id, title FROM "ProcessingResult" LIMIT 5;
```

### Git

```bash
# View recent changes
git log --oneline -10
git diff HEAD~1

# Status
git status
git branch -a
```

---

## Testing Checklist

### Backend

- [x] All 6 endpoints return correct status codes
- [x] Search with Vietnamese text works
- [x] Encryption/decryption working
- [x] Permission checks enforced
- [x] Pagination working
- [x] Sorting options functional
- [x] Unicode normalization applied
- [x] Error handling in place

### Frontend

- [x] ProcessingResultsTab renders
- [x] Search input functional
- [x] Filters working
- [x] Modal opens and closes
- [x] Delete button appears with permission
- [x] Responsive on mobile/tablet
- [x] i18n translations load (EN/VI)
- [x] No console errors

### Security

- [x] Encrypted data stored (not plaintext)
- [x] Permission checks work
- [x] Non-authorized users get 403
- [x] Users can only access own results
- [x] Admin can access all

---

## Known Issues

| Issue                                 | Severity | Status   | Notes                     |
| ------------------------------------- | -------- | -------- | ------------------------- |
| Existing results no encrypted content | HIGH     | ✅ Fixed | New results now encrypt   |
| Unicode search didn't work            | HIGH     | ✅ Fixed | NFC normalization applied |
| Dashboard 403 for "tester" role       | HIGH     | ✅ Fixed | Permission-based auth     |

---

## Next Priorities

### This Week (Phase 2)

1. [ ] Add date range picker component
2. [ ] Add tag autocomplete
3. [ ] Add search result export (CSV)
4. [ ] Add result detail printing
5. [ ] Performance testing

### Next Week (Phase 3)

1. [ ] Update Android app endpoints
2. [ ] Add Socket.IO fallback polling
3. [ ] Add WorkManager integration
4. [ ] End-to-end testing

---

## Troubleshooting

### 401 Unauthorized

**Problem:** API returns 401  
**Solution:**

1. Check token is included: `Authorization: Bearer $TOKEN`
2. Check token is not expired (default: 10 minutes)
3. Login again to get fresh token

### 403 Forbidden

**Problem:** API returns 403  
**Solution:**

1. Check user has required permission
2. For results, verify user owns result or is admin
3. Check role permissions in `src/types/permissions.ts`

### Vietnamese Search Not Working

**Problem:** Search for "họp" doesn't find results  
**Solution:**

1. Verify data was created after November 28 (NFC fix applied)
2. Run migration for existing data
3. Check search query is also normalized to NFC

### Encrypted Content Is Null

**Problem:** Summary/transcript shows null in detail modal  
**Solution:**

1. Verify result was created after November 28 (encryption fix applied)
2. Older results need to be reprocessed
3. Check server logs for decryption errors

### Component Not Rendering

**Problem:** ProcessingResultsTab doesn't appear  
**Solution:**

1. Check FilesPage includes tab navigation
2. Verify i18n translations loaded
3. Check browser console for errors
4. Rebuild: `cd client && bun run build`

---

## Resources

### Documentation

- `docs/api.md` - Full API specification
- `docs/architecture.md` - System architecture
- `DEVELOPMENT_ORCHESTRATION.md` - Project timeline
- `PHASE_1_COMPLETION_REPORT.md` - Phase 1 details
- `IMPLEMENTATION_STATUS.md` - Current state

### External

- Prisma Docs: https://www.prisma.io/docs/
- React Docs: https://react.dev/
- TailwindCSS: https://tailwindcss.com/
- i18next: https://www.i18next.com/

---

## Team Contacts

| Role          | Contact |
| ------------- | ------- |
| Backend Lead  | [TBD]   |
| Frontend Lead | [TBD]   |
| DevOps        | [TBD]   |
| QA Lead       | [TBD]   |

---

**Last Updated:** November 28, 2025  
**Next Update:** Start of Phase 2  
**Maintained By:** Development Team
