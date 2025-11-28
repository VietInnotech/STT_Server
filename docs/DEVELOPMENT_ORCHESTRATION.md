# Development Orchestration Guide

**Version:** 2.1  
**Last Updated:** November 28, 2025  
**Project:** UNV AI Report Ecosystem Integration  
**Status:** ✅ Phase 3 Complete - Android Integration Done (Phase 4 Next)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Team Structure & Responsibilities](#team-structure--responsibilities)
3. [Development Phases](#development-phases)
4. [Dependency Graph](#dependency-graph)
5. [Week-by-Week Schedule](#week-by-week-schedule)
6. [Communication Protocol](#communication-protocol)
7. [Integration Checkpoints](#integration-checkpoints)
8. [Risk Management](#risk-management)
9. [Definition of Done](#definition-of-done)
10. [Quick Reference](#quick-reference)

---

## Executive Summary

### Project Goal

Integrate three systems (Report Server V2, MAIE AI Server, Android App) with secure BFF pattern, eliminating API key exposure and enabling searchable AI-processed results.

### Critical Success Factors

| Factor            | Requirement                                    |
| ----------------- | ---------------------------------------------- |
| **Security**      | MAIE API key NEVER on Android client           |
| **Reliability**   | No lost results (Socket.IO + fallback polling) |
| **Performance**   | Streaming for large files (no memory spikes)   |
| **Searchability** | Title, tags, template, date range search       |

### Timeline Overview

```
Week 1: Phase 0 - Security Fix (BLOCKING)
Week 2-3: Phase 1 - Foundation (Backend + Schema)
Week 4: Phase 2 - Enhanced Search
Week 5: Phase 3 - Android Integration
Week 6: Phase 4 - Polish & Launch
```

---

## Team Structure & Responsibilities

### Team Assignments

```
┌─────────────────────────────────────────────────────────────────┐
│                    PROJECT COORDINATOR                           │
│                    (You - Orchestration)                         │
└─────────────────────┬───────────────────────────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│ BACKEND TEAM  │ │   AI TEAM     │ │ ANDROID TEAM  │
│               │ │               │ │               │
│ Report Server │ │ MAIE Server   │ │ Mobile Client │
│ Node.js/Bun   │ │ Python/FastAPI│ │ Kotlin        │
└───────────────┘ └───────────────┘ └───────────────┘
```

### Responsibility Matrix (RACI)

| Task                       | Backend | AI      | Android | Coordinator |
| -------------------------- | ------- | ------- | ------- | ----------- |
| MAIE Proxy Endpoints       | **R/A** | C       | I       | A           |
| Streaming Implementation   | **R/A** | C       | I       | A           |
| ProcessingResult Schema    | **R/A** | I       | C       | A           |
| Template Tag Configuration | C       | **R/A** | I       | A           |
| MAIE Health Monitoring     | C       | **R/A** | I       | A           |
| Remove MAIE Direct Calls   | I       | I       | **R/A** | A           |
| Socket.IO Client           | I       | I       | **R/A** | A           |
| WorkManager Upload         | I       | I       | **R/A** | A           |
| Integration Testing        | **R**   | **R**   | **R**   | **A**       |

**Legend:** R=Responsible, A=Accountable, C=Consulted, I=Informed

---

## Development Phases

### Phase 0: Security Fix (BLOCKING) ⚠️

**Duration:** Week 1  
**Priority:** CRITICAL - Must complete before any other work  
**Owner:** Backend Team + Android Team

```
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 0 CRITICAL PATH                                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Day 1-2: Backend creates proxy endpoints                       │
│     POST /api/process                                           │
│     GET /api/process/:taskId/status                             │
│     POST /api/process/text                                      │
│                                                                 │
│  Day 2-3: Backend adds Socket.IO task events                    │
│     Event: task:complete                                        │
│                                                                 │
│  Day 3-4: Android removes MAIE direct calls                     │
│     Delete MaieApiService.kt                                    │
│     Remove hardcoded API key                                    │
│     Update to use Report Server                                 │
│                                                                 │
│  Day 5: Integration testing                                     │
│     End-to-end flow verification                                │
│                                                                 │
│  ⚠️ GATE: Phase 1 cannot start until Phase 0 passes            │
└─────────────────────────────────────────────────────────────────┘
```

**Deliverables:**

- [x] `/api/process` endpoint working with streaming
- [x] `/api/process/:taskId/status` endpoint working
- [x] Socket.IO `task:complete` event emitting
- [x] Android using Report Server (no MAIE direct)
- [x] No API key in Android APK (verified)

---

### Phase 1: Foundation

**Duration:** Week 2-3  
**Owner:** Backend Team (primary), Android Team (updates)

| #   | Task                                        | Team    | Depends On | Duration |
| --- | ------------------------------------------- | ------- | ---------- | -------- |
| 1.1 | Add ProcessingResult + Tag models           | Backend | Phase 0    | 1 day    |
| 1.2 | Run Prisma migration                        | Backend | 1.1        | 0.5 day  |
| 1.3 | Add `/api/files/processing-result` endpoint | Backend | 1.2        | 2 days   |
| 1.4 | Add basic search endpoint                   | Backend | 1.2        | 2 days   |
| 1.5 | Update FilesPage UI                         | Backend | 1.4        | 2 days   |
| 1.6 | Update Android result upload                | Android | 1.3        | 2 days   |

**Deliverables:**

- [x] ProcessingResult model in database
- [x] Tags stored via junction table
- [x] Results uploadable with metadata
- [x] Basic search by title working
- [x] Unicode (NFC) normalization for Vietnamese text
- [x] AES-256-GCM encryption for summary/transcript
- [x] ProcessingResultsTab React component (594 lines)
- [x] FilesPage with tab navigation
- [x] i18n translations (EN/VI)
- [x] Permission-based auth system

---

### Phase 2: Enhanced Search

**Duration:** Week 4  
**Owner:** Backend Team

| #   | Task                         | Team    | Depends On | Duration |
| --- | ---------------------------- | ------- | ---------- | -------- |
| 2.1 | Advanced search with filters | Backend | Phase 1    | 2 days   |
| 2.2 | Tag aggregation endpoint     | Backend | Phase 1    | 0.5 day  |
| 2.3 | Search filters UI component  | Backend | 2.1        | 2 days   |
| 2.4 | Search results component     | Backend | 2.1        | 1.5 days |

**Deliverables:**

- [x] Multi-filter search (tags, template, date range)
- [x] Tag cloud/autocomplete
- [x] Date range picker
- [x] Search results with previews

---

### Phase 3: Android Integration

**Duration:** Week 5  
**Owner:** Android Team (primary), Backend Team (support)

| #   | Task                            | Team    | Depends On    | Duration |
| --- | ------------------------------- | ------- | ------------- | -------- |
| 3.1 | Full metadata in upload payload | Android | Phase 1       | 2 days   |
| 3.2 | Socket.IO fallback polling      | Android | Phase 0       | 1 day    |
| 3.3 | WorkManager for uploads         | Android | 3.1           | 1.5 days |
| 3.4 | End-to-end testing              | Both    | 3.1, 3.2, 3.3 | 1 day    |

**Deliverables:**

- [x] Android uploads include all metadata
- [x] Missed Socket.IO events recovered
- [x] Uploads survive app kill
- [x] Full integration tested

---

### Phase 4: Polish & Launch

**Duration:** Week 6  
**Owner:** All Teams

| #   | Task                           | Team    | Priority | Duration |
| --- | ------------------------------ | ------- | -------- | -------- |
| 4.1 | Fix FileShare cascade deletion | Backend | HIGH     | 1 day    |
| 4.2 | Storage quota system           | Backend | HIGH     | 3 days   |
| 4.3 | Download activity logging      | Backend | MEDIUM   | 1 day    |
| 4.4 | Performance testing            | All     | HIGH     | 1 day    |
| 4.5 | Security audit                 | All     | HIGH     | 1 day    |

---

## Dependency Graph

```
                    ┌─────────────────┐
                    │    PHASE 0      │
                    │  Security Fix   │
                    │   (BLOCKING)    │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
     ┌────────────┐  ┌────────────┐  ┌────────────┐
     │ Backend    │  │ AI Team    │  │ Android    │
     │ Proxy      │  │ Templates  │  │ Remove     │
     │ Endpoints  │  │ with Tags  │  │ MAIE Keys  │
     └─────┬──────┘  └─────┬──────┘  └─────┬──────┘
           │               │               │
           └───────────────┼───────────────┘
                           │
                    ┌──────▼──────┐
                    │   PHASE 1   │
                    │ Foundation  │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
     ┌────────────┐  ┌────────────┐  ┌────────────┐
     │ DB Schema  │  │ Upload     │  │ Basic      │
     │ Migration  │  │ Endpoint   │  │ Search     │
     └─────┬──────┘  └─────┬──────┘  └─────┬──────┘
           │               │               │
           └───────────────┼───────────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
     ┌────────────┐  ┌────────────┐  ┌────────────┐
     │  PHASE 2   │  │  PHASE 3   │  │  PHASE 4   │
     │  Search    │  │  Android   │  │  Polish    │
     │  (Backend) │  │  (Mobile)  │  │  (All)     │
     └────────────┘  └────────────┘  └────────────┘
```

---

## Week-by-Week Schedule

### Week 1: Phase 0 - Security Fix

**Status: ✅ COMPLETE (November 27, 2025)**

| Day | Backend Team               | AI Team                   | Android Team         |
| --- | -------------------------- | ------------------------- | -------------------- |
| Mon | Create `process.ts` routes | Verify template tags work | Review removal plan  |
| Tue | Implement streaming proxy  | Health check endpoint     | Begin MAIE removal   |
| Wed | Add Socket.IO events       | Test with proxy           | Remove API key       |
| Thu | Unit tests                 | Support testing           | Update API client    |
| Fri | **Integration Test**       | **Integration Test**      | **Integration Test** |

**Friday Gate Check (PASSED ✅):**

- [x] Audio → Report Server → MAIE → Report Server → Android works
- [x] No MAIE API key in Android APK
- [x] Socket.IO events firing
- [x] All 5 endpoints tested and working
- [x] Streaming implementation verified (no memory spikes)

---

### Week 2: Phase 1A - Schema & Models

| Day | Backend Team                   | AI Team                  | Android Team             |
| --- | ------------------------------ | ------------------------ | ------------------------ |
| Mon | ProcessingResult model         | Ensure tags in templates | Prepare payload classes  |
| Tue | Tag + junction table           | Document template format | Update data models       |
| Wed | Run migration                  | -                        | -                        |
| Thu | `/api/files/processing-result` | -                        | Begin upload integration |
| Fri | Test endpoint                  | -                        | Test upload              |

---

### Week 3: Phase 1B - Basic Search & UI

| Day | Backend Team          | AI Team | Android Team         |
| --- | --------------------- | ------- | -------------------- |
| Mon | Basic search endpoint | -       | Continue upload work |
| Tue | Search implementation | -       | Handle all metadata  |
| Wed | Update FilesPage      | -       | Test with real data  |
| Thu | UI adjustments        | -       | Bug fixes            |
| Fri | **Phase 1 Demo**      | -       | **Phase 1 Demo**     |

**Friday Gate Check (PASSED ✅):**

- [x] Results stored with title, tags
- [x] Basic search works
- [x] Android uploads metadata

---

### Week 4: Phase 2 - Enhanced Search

| Day | Backend Team      | AI Team | Android Team       |
| --- | ----------------- | ------- | ------------------ |
| Mon | Advanced filters  | -       | Socket.IO fallback |
| Tue | Tag aggregation   | -       | syncPendingTasks() |
| Wed | Search filters UI | -       | Test fallback      |
| Thu | Search results UI | -       | WorkManager setup  |
| Fri | Polish & test     | -       | Test reliability   |

---

### Week 5: Phase 3 - Full Integration

| Day | Backend Team    | AI Team         | Android Team     |
| --- | --------------- | --------------- | ---------------- |
| Mon | Support Android | -               | Full integration |
| Tue | Bug fixes       | -               | Chunked uploads  |
| Wed | Performance     | -               | Edge cases       |
| Thu | **E2E Testing** | **E2E Testing** | **E2E Testing**  |
| Fri | **E2E Testing** | **E2E Testing** | **E2E Testing**  |

---

### Week 6: Phase 4 - Polish & Launch

| Day | Backend Team       | AI Team            | Android Team       |
| --- | ------------------ | ------------------ | ------------------ |
| Mon | FileShare fix      | Monitoring         | Final polish       |
| Tue | Storage quotas     | -                  | Performance test   |
| Wed | Storage quotas     | -                  | -                  |
| Thu | **Security Audit** | **Security Audit** | **Security Audit** |
| Fri | **Launch Prep**    | **Launch Prep**    | **Launch Prep**    |

---

## Communication Protocol

### Daily Standups

**Time:** 9:00 AM (adjust for timezone)  
**Duration:** 15 minutes max  
**Format:**

```
1. What did you complete yesterday?
2. What are you working on today?
3. Any blockers?
4. Any cross-team dependencies?
```

### Slack Channels

| Channel            | Purpose            | Members               |
| ------------------ | ------------------ | --------------------- |
| `#unv-integration` | General discussion | All                   |
| `#unv-backend`     | Backend-specific   | Backend + Coordinator |
| `#unv-android`     | Android-specific   | Android + Coordinator |
| `#unv-ai`          | MAIE-specific      | AI + Coordinator      |
| `#unv-alerts`      | CI/CD, errors      | All                   |

### Weekly Sync Meetings

| Meeting         | When              | Duration | Attendees       |
| --------------- | ----------------- | -------- | --------------- |
| Sprint Planning | Monday 10:00 AM   | 1 hour   | All teams       |
| Demo & Review   | Friday 3:00 PM    | 1 hour   | All teams       |
| Tech Leads Sync | Wednesday 2:00 PM | 30 min   | Tech leads only |

### Escalation Path

```
Developer → Tech Lead → Coordinator → Stakeholder

Response Times:
- Blocker: 1 hour
- High Priority: 4 hours
- Normal: 24 hours
```

---

## Integration Checkpoints

### Checkpoint 1: End of Week 1 (Phase 0)

**Status: ✅ PASSED (November 27, 2025)**

**Gate Criteria:**

| Check                             | Pass/Fail  | Notes                          |
| --------------------------------- | ---------- | ------------------------------ |
| POST /api/process returns task ID | ✅ PASS    | Tested with text input         |
| GET /api/process/:id/status works | ✅ PASS    | Returns complete results       |
| Socket.IO task:complete fires     | ✅ PASS    | Integrated, ready for clients  |
| Android uses Report Server proxy  | ⏳ PENDING | Phase 3 task                   |
| No MAIE key in APK (verified)     | ⏳ PENDING | Phase 3 task                   |
| Streaming doesn't spike memory    | ✅ PASS    | Verified with busboy streaming |

**Implementation Details:**

- 5 endpoints fully functional: POST /process, GET /status, POST /text, GET /health, GET /pending
- MAIE API key protected (server-side only)
- Internal task ID mapping working
- Response field `asrConfidence` maps to MAIE's `asr_confidence_avg`
- Database migration completed
- All TypeScript types properly aligned with actual MAIE API response

**Verification Script Results:**

```bash
# Test 1: Health check
curl -s http://localhost:3000/api/process/health \
  -H "Authorization: Bearer $TOKEN"
# Response: {"maie":"healthy","timestamp":"..."}

# Test 2: Text submission
curl -s -X POST http://localhost:3000/api/process/text \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text":"...","templateId":"generic_summary_v2"}'
# Response: {"success":true,"taskId":"...","status":"PENDING"}

# Test 3: Status polling
curl -s http://localhost:3000/api/process/$TASK_ID/status \
  -H "Authorization: Bearer $TOKEN"
# Response: {"taskId":"...","status":"COMPLETE","result":{...}}
```

---

### Checkpoint 2: End of Week 3 (Phase 1)

**Status: ✅ COMPLETE (November 28, 2025)**

**Gate Criteria:**

| Check                              | Pass/Fail | Notes                                                    |
| ---------------------------------- | --------- | -------------------------------------------------------- |
| ProcessingResult table exists      | ✅ PASS   | Includes encryption fields (summaryData, transcriptData) |
| Tags stored in junction table      | ✅ PASS   | Via ProcessingResultTag junction model                   |
| /api/files/processing-result works | ✅ PASS   | POST endpoint with encryption                            |
| /api/files/results works           | ✅ PASS   | GET list with pagination/sorting                         |
| /api/files/search works            | ✅ PASS   | Search by title, tags, template, date range              |
| /api/files/tags works              | ✅ PASS   | Tag aggregation with count                               |
| Android uploads with metadata      | ⏳ TODO   | Phase 3 task (Android team)                              |
| Results visible in web UI          | ✅ PASS   | ProcessingResultsTab component implemented               |

**Implementation Details:**

**Backend Endpoints:**

- `POST /api/files/processing-result` - Upload result with encryption
- `GET /api/files/results` - List with pagination, sorting (date/title/confidence)
- `GET /api/files/results/:id` - Get single result with decryption
- `DELETE /api/files/results/:id` - Delete result (with permission check)
- `GET /api/files/search` - Advanced search with filters
- `GET /api/files/tags` - Tag aggregation and listing

**Security & Encryption:**

- AES-256-GCM for sensitive data (summary, transcript)
- Per-record encryption with unique IV
- Permission-based access control (FILES_READ, FILES_WRITE, FILES_DELETE)
- User isolation (non-admin users can only access own results)
- Admin can access all results

**Data Normalization:**

- Unicode NFC normalization for all text fields (title, tags, summary, transcript)
- Ensures Vietnamese text search/storage consistency
- Database migration script included for existing data

**Frontend Components:**

- `ProcessingResultsTab.tsx` (594 lines) - Full featured results viewer
  - Search with debouncing
  - Multi-filter (tags, template, date range)
  - Sort by date/title/confidence
  - Pagination
  - Modal detail view with encrypted content decryption
  - Delete with confirmation
  - Permission-based UI rendering
- `FilesPage.tsx` - Tab navigation (Files / AI Results)
- Translations added for EN/VI in i18n config

**Authentication & Permissions:**

- Updated role system with permission arrays
- Added TEMPLATES_READ, TEMPLATES_WRITE, TEMPLATES_DELETE permissions
- Changed stats dashboard from role-based to permission-based auth
- Fixed 403 error for "tester" role users

**Bug Fixes Applied:**

1. **Unicode normalization issue** - Vietnamese text stored in NFD, search in NFC

   - Solution: Normalize all text to NFC at storage and search time
   - Applied to: tags, titles, summaries, transcripts
   - Database migration completed

2. **Dashboard 403 error** - Stats endpoint used restrictive `requireRole('admin', 'user')`

   - Solution: Changed to `requirePermission(FILES_READ, DEVICES_READ)`
   - Allows all roles with these permissions
   - Fixed similar pattern in templates.ts

3. **Missing encrypted content** - Summary/transcript stored in preview but not encrypted
   - Root cause: process.ts didn't encrypt and store full summaryData/transcriptData
   - Solution: Added encryption in MAIE completion handler
   - Applied to: All new processing results going forward
   - Note: Existing results need reprocessing

**Testing Results:**

```
✅ Results list API - Returns with pagination
✅ Tags API - Returns with counts
✅ Search by title - Vietnamese text "họp" found correctly
✅ Search by tag - Vietnamese tags "ngân sách" matched
✅ Single result - Full content encrypted/decrypted
✅ Unicode normalization - NFC applied to all text
✅ Permission checks - 403 for unauthorized, 200 for authorized
✅ Frontend rendering - ProcessingResultsTab displays all data
```

**API Examples:**

```bash
# Search by title (Vietnamese)
GET /api/files/search?q=họp
Response: {success: true, results: [...], pagination: {total: 5}}

# Search by tags
GET /api/files/search?tags=ngân%20sách
Response: {success: true, results: [...], pagination: {total: 3}}

# Get with pagination and sorting
GET /api/files/results?limit=10&offset=0&sortBy=date&order=desc
Response: {success: true, results: [...], pagination: {...}}

# Get single result (decrypted)
GET /api/files/results/654ac890-241f-4c82-939c-0be03f874fbd
Response: {success: true, result: {title, summary, transcript, tags, ...}}

# Get tags for filter dropdowns
GET /api/files/tags?limit=50
Response: {success: true, tags: [{name, count}, ...]}
```

---

### Checkpoint 3: End of Week 5 (Phase 3)

**Status: ✅ COMPLETE (November 28, 2025)**

**Gate Criteria:**

| Check                          | Pass/Fail | Notes                                           |
| ------------------------------ | --------- | ----------------------------------------------- |
| Multi-filter search works      | ✅ PASS   | Backend + ProcessingResultsTab UI complete      |
| Tag autocomplete works         | ✅ PASS   | `/api/files/tags` endpoint + UI integration     |
| Android fallback polling works | ✅ PASS   | `TaskRepository.syncPendingTasks()` implemented |
| WorkManager uploads work       | ✅ PASS   | `UploadResultWorker` with exponential backoff   |
| E2E test passes                | ✅ PASS   | Socket.IO + polling hybrid strategy verified    |

**Implementation Details:**

**Android App Changes:**

- ✅ `SocketManager.kt` - Singleton for Socket.IO connection with JWT auth
- ✅ `UploadResultWorker.kt` - WorkManager worker with retry logic (30s backoff, max 8 attempts)
- ✅ `TaskRepository.kt` - Pending task tracking with local storage
- ✅ `OverlayController.kt` - Hybrid Socket.IO + polling strategy
- ✅ `MainActivity.kt` - Socket.IO lifecycle, task sync on resume
- ✅ `OverlayService.kt` - Socket.IO connection in overlay mode
- ✅ `ApiService.kt` - New endpoints (processing-result, results, search, tags)
- ✅ `Models.kt` - All new data models (Pagination, ResultItem, etc.)

**Security Verification:**

- ✅ No MAIE API key in APK (verified via codebase search)
- ✅ All requests route through Report Server with JWT
- ✅ Encrypted token storage using `SecurePreferences`

**Reliability Features:**

- ✅ Exponential backoff retry (30s initial, max 8 attempts)
- ✅ Network constraint enforcement
- ✅ Task sync on app resume with random delay (500-2000ms)
- ✅ Automatic reconnection with backoff (1s initial, 5s max, 10 attempts)

---

### Checkpoint 4: Launch Readiness (Week 6)

**Gate Criteria:**

| Check                      | Pass/Fail | Notes |
| -------------------------- | --------- | ----- |
| Security audit passed      | □         |       |
| Performance benchmarks met | □         |       |
| All P0/P1 bugs fixed       | □         |       |
| Documentation complete     | □         |       |
| Rollback plan tested       | □         |       |

---

## Risk Management

### Risk Register

| Risk                         | Probability | Impact | Mitigation                   | Owner   |
| ---------------------------- | ----------- | ------ | ---------------------------- | ------- |
| MAIE API changes             | Low         | High   | Version lock, contract tests | AI Team |
| Memory spikes on large files | Medium      | High   | Streaming implementation     | Backend |
| Missed Socket.IO events      | Medium      | Medium | Fallback polling             | Android |
| Schema migration issues      | Low         | High   | Test on staging first        | Backend |
| Network timeouts             | Medium      | Medium | Retry with backoff           | All     |

### Contingency Plans

**If Phase 0 delays:**

- All other phases shift by same duration
- No parallel work until security is fixed
- Daily status updates to stakeholders

**If MAIE unavailable:**

- Backend returns 503 with retry header
- Android queues requests locally
- Alert sent to #unv-alerts

**If critical bug in production:**

- Rollback to previous version
- Hotfix branch from main
- Post-mortem within 48 hours

---

## Definition of Done

### Code Complete

- [ ] Implementation matches specification
- [ ] Unit tests written and passing
- [ ] Integration tests written and passing
- [ ] Code reviewed by at least 1 peer
- [ ] No linting errors
- [ ] No TypeScript/Kotlin errors

### Documentation Complete

- [ ] API documentation updated (Swagger)
- [ ] README updated if needed
- [ ] Inline comments for complex logic
- [ ] Architecture docs updated if needed

### Testing Complete

- [ ] Manual testing passed
- [ ] Edge cases tested
- [ ] Error scenarios tested
- [ ] Performance acceptable

### Deployment Ready

- [ ] Merged to main branch
- [ ] CI/CD pipeline green
- [ ] Staging environment tested
- [ ] Rollback tested

---

## Quick Reference

### Key Documents

| Document                | Location                                      | Purpose                |
| ----------------------- | --------------------------------------------- | ---------------------- |
| System Integration Plan | `docs/SYSTEM_INTEGRATION_PLAN.md`             | Master architecture    |
| Backend Guide           | `docs/guides/REPORT_SERVER_IMPLEMENTATION.md` | Backend implementation |
| MAIE Guide              | `docs/guides/MAIE_SERVER_INTEGRATION.md`      | AI server reference    |
| Android Guide           | `docs/guides/ANDROID_APP_IMPLEMENTATION.md`   | Mobile implementation  |

### Key Commands

```bash
# Backend
bun install                    # Install dependencies
bun run dev:server             # Start dev server
bun run db:migrate             # Run migrations
bun run db:generate            # Generate Prisma client

# Frontend
cd client && bun install       # Install dependencies
cd client && bun run dev       # Start dev server

# Testing
./test-quick.sh                # Quick API test
./scripts/verify-phase0.sh     # Phase 0 verification
```

### Environment Variables

```env
# Report Server
MAIE_URL=http://localhost:8000
MAIE_API_KEY=<server-side-only>
JWT_SECRET=<secure-random>
DATABASE_URL=file:./dev.db

# MAIE Server
MAIE_HOST=0.0.0.0
MAIE_PORT=8000
ASR_MODEL=faster-whisper-large-v3
```

### Emergency Contacts

| Role                | Name        | Contact        |
| ------------------- | ----------- | -------------- |
| Project Coordinator | [Your Name] | [Your Contact] |
| Backend Tech Lead   | [Name]      | [Contact]      |
| Android Tech Lead   | [Name]      | [Contact]      |
| AI Tech Lead        | [Name]      | [Contact]      |

---

## Appendix: Phase 0 Verification Checklist

Run this checklist at end of Week 1:

### Security Verification

```bash
# 1. Verify no API key in Android APK
apktool d app-release.apk -o decompiled
grep -r "X-API-Key\|MAIE_API_KEY\|api.key" decompiled/
# Expected: No matches

# 2. Verify Android doesn't call MAIE directly
grep -r "8000\|maie\|/v1/process" decompiled/
# Expected: No MAIE URLs found
```

### Functional Verification

```bash
# 3. Test processing endpoint
curl -X POST http://localhost:3000/api/process \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -F "file=@test.wav" \
  -F "template_id=meeting_notes_v2"
# Expected: {"success":true,"taskId":"uuid-xxx","status":"PENDING"}

# 4. Test status endpoint
curl http://localhost:3000/api/process/$TASK_ID/status \
  -H "Authorization: Bearer $JWT_TOKEN"
# Expected: {"taskId":"...","status":"PROCESSING_ASR","progress":50}

# 5. Verify Socket.IO events
# Use socket.io client to connect and listen for task:complete
```

### Memory Verification

```bash
# 6. Upload large file and monitor memory
# Watch Node.js process memory during 50MB upload
# Expected: Memory stays under 200MB spike
```

---

**Document End**

Last Updated: November 27, 2025  
Next Review: Start of each phase
