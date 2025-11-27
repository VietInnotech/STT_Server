# Development Orchestration Guide

**Version:** 1.0  
**Last Updated:** November 27, 2025  
**Project:** UNV AI Report Ecosystem Integration  
**Status:** ✅ Approved for Implementation (10/10)

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

- [ ] `/api/process` endpoint working with streaming
- [ ] `/api/process/:taskId/status` endpoint working
- [ ] Socket.IO `task:complete` event emitting
- [ ] Android using Report Server (no MAIE direct)
- [ ] No API key in Android APK (verified)

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

- [ ] ProcessingResult model in database
- [ ] Tags stored via junction table
- [ ] Results uploadable with metadata
- [ ] Basic search by title working

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

- [ ] Multi-filter search (tags, template, date range)
- [ ] Tag cloud/autocomplete
- [ ] Date range picker
- [ ] Search results with previews

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

- [ ] Android uploads include all metadata
- [ ] Missed Socket.IO events recovered
- [ ] Uploads survive app kill
- [ ] Full integration tested

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

| Day | Backend Team               | AI Team                   | Android Team         |
| --- | -------------------------- | ------------------------- | -------------------- |
| Mon | Create `process.ts` routes | Verify template tags work | Review removal plan  |
| Tue | Implement streaming proxy  | Health check endpoint     | Begin MAIE removal   |
| Wed | Add Socket.IO events       | Test with proxy           | Remove API key       |
| Thu | Unit tests                 | Support testing           | Update API client    |
| Fri | **Integration Test**       | **Integration Test**      | **Integration Test** |

**Friday Gate Check:**

- [ ] Audio → Report Server → MAIE → Report Server → Android works
- [ ] No MAIE API key in Android APK
- [ ] Socket.IO events firing

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

**Friday Gate Check:**

- [ ] Results stored with title, tags
- [ ] Basic search works
- [ ] Android uploads metadata

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

**Gate Criteria:**

| Check                             | Pass/Fail | Notes |
| --------------------------------- | --------- | ----- |
| POST /api/process returns task ID | □         |       |
| GET /api/process/:id/status works | □         |       |
| Socket.IO task:complete fires     | □         |       |
| Android uses Report Server proxy  | □         |       |
| No MAIE key in APK (verified)     | □         |       |
| Streaming doesn't spike memory    | □         |       |

**Verification Script:**

```bash
# Run from project root
./scripts/verify-phase0.sh
```

---

### Checkpoint 2: End of Week 3 (Phase 1)

**Gate Criteria:**

| Check                              | Pass/Fail | Notes |
| ---------------------------------- | --------- | ----- |
| ProcessingResult table exists      | □         |       |
| Tags stored in junction table      | □         |       |
| /api/files/processing-result works | □         |       |
| Search by title works              | □         |       |
| Android uploads with metadata      | □         |       |
| Results visible in web UI          | □         |       |

---

### Checkpoint 3: End of Week 5 (Phase 3)

**Gate Criteria:**

| Check                          | Pass/Fail | Notes |
| ------------------------------ | --------- | ----- |
| Multi-filter search works      | □         |       |
| Tag autocomplete works         | □         |       |
| Android fallback polling works | □         |       |
| WorkManager uploads work       | □         |       |
| E2E test passes                | □         |       |

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
