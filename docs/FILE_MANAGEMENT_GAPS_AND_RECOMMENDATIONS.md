# File Management - Gaps and Recommendations

**Document Date:** November 27, 2025  
**Scope:** UNV AI Report Server V2 - File Management System  
**Status:** Active Development

---

## Table of Contents

1. [Current Implementation Status](#current-implementation-status)
2. [Identified Gaps](#identified-gaps)
3. [Recommendations](#recommendations)
4. [Implementation Roadmap](#implementation-roadmap)
5. [Risk Assessment](#risk-assessment)

---

## Current Implementation Status

### ✅ Fully Implemented Features

| Feature                   | Status      | Details                                     |
| ------------------------- | ----------- | ------------------------------------------- |
| Audio file uploads        | ✅ Complete | WAV, MP3, OGG, WebM, M4A, AAC, FLAC support |
| Text file uploads         | ✅ Complete | TXT, LOG, JSON, CSV, XML support            |
| AES-256 encryption        | ✅ Complete | All files encrypted at rest                 |
| Role-based access (RBAC)  | ✅ Complete | FILES_READ, FILES_WRITE, FILES_DELETE       |
| File ownership validation | ✅ Complete | Users can only delete their own files       |
| File sharing              | ✅ Complete | Share with expiration support               |
| Share revocation          | ✅ Complete | Owner can revoke individual or batch shares |
| Auto-delete scheduling    | ✅ Complete | Daily cron job at 02:00 local time          |
| Audit logging             | ✅ Complete | Comprehensive action tracking               |
| Device association        | ✅ Complete | Files linked to devices                     |
| Text file pairs           | ✅ Complete | Android JSON + WebUI multipart endpoints    |
| Pair cascade deletion     | ✅ Complete | Deleting pair deletes both files            |
| File search               | ✅ Complete | Filename search with pagination             |
| Socket notifications      | ✅ Complete | Real-time share event notifications         |
| Share indicators (UI)     | ✅ Complete | Shows owner and recipient share status      |

---

## Identified Gaps

### 🔴 Critical Gaps

#### 1. **No Storage Quotas or Limits**

**Severity:** HIGH  
**Current State:**

- Individual file limit: 50MB (multer config)
- No per-user storage quota
- No system-wide storage limit
- Potential for database bloat and abuse

**Impact:**

- Single malicious user can fill database with 50MB files indefinitely
- No protection against denial of service via disk exhaustion
- Administrator has no visibility into storage usage per user

**Required:**

- User-level storage quota (e.g., "max 5GB per user")
- System-level storage warning/limit
- Storage dashboard showing usage
- Quota enforcement at upload time
- Admin configuration of quota limits

---

#### 2. **WebUI Text Pair: Requires Both Files**

**Severity:** MEDIUM  
**Current State:**

```typescript
// In POST /api/files/text-pair handler
if (!summaryTextFile || !realtimeTextFile) {
  throw new Error("Both summary and realtime files must be provided");
}
```

**Impact:**

- User cannot upload partial pairs (e.g., only summary file)
- Android endpoint supports both files required ✅
- WebUI endpoint unnecessarily strict
- Reduces workflow flexibility

**Required:**

- Allow single-file pair creation
- Allow later addition of second file (update endpoint)
- Clear UI indication that second file is optional

---

#### 3. **FileShare Records Not Cascade Deleted**

**Severity:** MEDIUM  
**Current State:**

```prisma
model TextFilePair {
  // onDelete: Cascade deletes TextFile records
  summaryFileId String @unique
  summaryFile TextFile @relation(..., onDelete: Cascade)
  realtimeFileId String @unique
  realtimeFile TextFile @relation(..., onDelete: Cascade)
}

model FileShare {
  fileId String // Foreign key to AudioFile or TextFile
  // NO onDelete: Cascade
}
```

**Impact:**

- When file is deleted, orphaned FileShare records remain in database
- Recipient still sees "shared with me" badge/entry (broken reference)
- Database pollution over time
- No cascading cleanup of associated shares

**Required:**

- Add cascade deletion for FileShare when referenced file is deleted
- Clean up existing orphaned records
- Add data integrity checks

---

#### 4. **No File Versioning or History**

**Severity:** MEDIUM  
**Current State:**

- Files are immutable after upload
- No version history
- No ability to restore previous versions
- Overwrite not possible (requires delete + re-upload)

**Impact:**

- Accidental deletion results in permanent loss
- No audit trail for content changes
- Cannot compare file states over time
- No rollback capability

**Required:**

- Version history model linking files to revisions
- Ability to view/restore previous versions
- Soft delete with grace period before permanent deletion
- Version comparison for text files

---

#### 5. **Pair Comparison Limited to Android Origin**

**Severity:** LOW-MEDIUM  
**Current State:**

```typescript
// FilesPage.tsx
if (file.type === "text" && file.origin === "android") {
  // Show compare button
  // Uses androidSummary and androidRealtime from payload
}
```

**Impact:**

- WebUI-uploaded pairs cannot be compared side-by-side
- Only Android pairs show structured comparison view
- WebUI pairs only viewable as split-view after double-click
- Inconsistent user experience

**Required:**

- Support comparison for both Android and WebUI pairs
- Implement text diff algorithm for visual comparison
- Show line-by-line differences

---

### 🟡 Medium-Priority Gaps

#### 6. **No Per-User Rate Limiting**

**Severity:** MEDIUM  
**Current State:**

```typescript
// Global rate limiter applied to all users
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100, // 100 requests per 15 minutes
});

// Same limit for admin and regular users
app.use("/api/files", uploadLimiter);
```

**Impact:**

- All users share same rate limit bucket
- Cannot prioritize admin uploads
- No differentiation by user role
- Easy to abuse with bot accounts

**Required:**

- Role-based rate limiting (admins have higher limits)
- User-tier system (premium users = higher limits)
- Per-action rate limiting (e.g., "max 10 uploads/hour")
- Rate limit status in response headers

---

#### 7. **No File Compression**

**Severity:** MEDIUM  
**Current State:**

- Files stored as-is without compression
- Text files especially wasteful (redundancy in text)
- Encryption applied to uncompressed data

**Impact:**

- Wasted database space for text files
- Slower encryption/decryption
- Higher bandwidth during transfer
- Expensive storage costs

**Required:**

- Optional compression before encryption (gzip + AES-256)
- Compression ratio tracking in metadata
- Decompression on retrieval
- User/admin toggle for compression per file

---

#### 8. **No Batch Download (ZIP Archive)**

**Severity:** MEDIUM  
**Current State:**

- Can only download files individually
- Multiple file downloads require multiple requests
- No folder/collection concept

**Impact:**

- Poor user experience for bulk export
- Multiple requests hit rate limits
- Large number of individual network round-trips
- No way to download full device history

**Required:**

- Batch download endpoint: `POST /api/files/batch-download`
- Generate temporary ZIP archive with selected files
- Support for downloading by device, date range, or query
- Cleanup of temporary archives

---

#### 9. **No File Metadata Search**

**Severity:** MEDIUM  
**Current State:**

```typescript
// FilesPage.tsx - search implementation
filteredFiles = files.filter((file) =>
  file.filename.toLowerCase().includes(searchQuery.toLowerCase())
);
```

**Impact:**

- Can only search by filename
- Cannot find files by:
  - Upload date range
  - Device
  - File size
  - MIME type
  - Owner/uploader
  - Share status

**Required:**

- Advanced search with multiple filters
- Full-text search index on metadata
- Date range picker for upload timestamps
- Filter by file type, size range, owner
- Saved search queries

---

#### 10. **No Storage Monitoring/Cleanup Alerts**

**Severity:** MEDIUM  
**Current State:**

- Auto-delete runs daily (no visibility)
- No alerts or warnings about usage
- Admin has no dashboard for storage health
- Scheduler failures silently logged

**Impact:**

- Admins unaware of storage problems
- Scheduler failures go unnoticed
- No proactive cleanup notifications
- Poor capacity planning

**Required:**

- Storage usage dashboard for admins
- Alerts when threshold exceeded (80%, 90%, 100%)
- Cleanup job status and failure notifications
- Storage trend analytics
- Recommendation engine (e.g., "delete unused files from X days ago")

---

### 🟢 Low-Priority Enhancements

#### 11. **No File Tagging/Categories**

**Severity:** LOW  
**Current State:**

- Files only organized by upload date
- No user-defined categories or tags
- Pair names optional but not indexed

**Impact:**

- Difficult to organize large file collections
- No semantic grouping
- Poor discoverability

**Recommended:**

- Tag system for files and pairs
- Pre-defined categories (optional)
- Tag-based filtering and search
- Tag suggestions based on usage patterns

---

#### 12. **No Download Activity Tracking**

**Severity:** LOW  
**Current State:**

```typescript
// Audit log created for upload only
await prisma.auditLog.create({
  data: {
    action: "files.upload", // No download logging
    // ...
  },
});
```

**Impact:**

- Cannot see who downloaded what files
- No access pattern analysis
- Missing security audit trail for sensitive files

**Recommended:**

- Log file downloads in AuditLog: `action: "files.download"`
- Track download frequency per file
- Add "access count" to file metadata
- Alert on suspicious access patterns

---

#### 13. **No Suspicious Activity Alerts**

**Severity:** LOW  
**Current State:**

- All downloads treated equally
- No anomaly detection
- No rate limit on downloads (different from uploads)

**Impact:**

- Cannot detect data exfiltration attempts
- Malicious bulk downloads go unnoticed
- No security monitoring

**Recommended:**

- Download rate limits per user
- Alert when user downloads unusual number of files
- Notify file owner of downloads (optional)
- Geographic anomaly detection (IP change)

---

#### 14. **No File Retention Policies**

**Severity:** LOW  
**Current State:**

```typescript
// Only simple auto-delete by days
deleteAfterDays: number | null;
scheduledDeleteAt: DateTime | null;
```

**Impact:**

- Cannot implement complex retention rules
- All files have same expiration logic
- No compliance-oriented policies

**Recommended:**

- Retention policy templates (GDPR, HIPAA, custom)
- Legal hold capability (prevent deletion)
- Archival tier (move old files to cheaper storage)
- Compliance reporting

---

#### 15. **No API Documentation for Text Pairs**

**Severity:** LOW  
**Current State:**

- Swagger docs exist for pair endpoints
- But no user-facing API reference document
- Android integration documentation exists separately

**Impact:**

- Developers unsure about pair endpoint contract
- Multiple documentation sources
- Easy to miss updates

**Recommended:**

- Unified API reference document
- Code examples for pair uploads (curl, Android, web)
- Troubleshooting guide
- Migration guide from single files to pairs

---

## Recommendations

### Tier 1: Critical (Q1 2026)

#### R1: Implement Storage Quotas

**Priority:** CRITICAL  
**Effort:** 2 weeks  
**Impact:** Prevents abuse, enables multi-tenant SaaS model

**Implementation Plan:**

1. **Database schema changes:**

   ```prisma
   model SystemConfig {
     // Add new configs
     "storage:max_per_user_gb": "5"        // 5GB per user
     "storage:max_total_gb": "1000"        // 1TB system total
     "storage:warning_threshold_pct": "80" // Warn at 80%
   }

   model UserStorageQuota {
     userId String @unique
     quotaBytes BigInt           // Custom override (null = use default)
     usedBytes BigInt            // Current usage
     lastCalculated DateTime
   }
   ```

2. **Pre-upload check:**

   ```typescript
   // In files.ts upload handler
   const currentUsage = await calculateUserStorageUsage(userId);
   const quota = await getUserStorageQuota(userId);
   if (currentUsage + fileSize > quota) {
     return res.status(402).json({
       error: "Storage quota exceeded",
       currentUsage,
       quota,
       fileSize,
     });
   }
   ```

3. **Admin dashboard:**

   - Show storage per user
   - Show system total
   - Allow setting custom quotas
   - Show trend graphs

4. **User notifications:**
   - Toast when approaching quota (90%)
   - Email warning at 95%
   - Block uploads when exceeded

---

#### R2: Fix FileShare Cascade Deletion

**Priority:** CRITICAL  
**Effort:** 3 days  
**Impact:** Prevents data corruption, ensures referential integrity

**Implementation Plan:**

1. **Prisma schema update:**

   ```prisma
   model FileShare {
     // ... existing fields ...

     // Add cascading delete when file deleted
     audioFile    AudioFile?  @relation(fields: [fileId], references: [id], onDelete: Cascade)
     textFile     TextFile?   @relation(fields: [fileId], references: [id], onDelete: Cascade)
   }
   ```

2. **Migration:**

   ```bash
   bun run db:migrate
   bun run db:generate
   ```

3. **Cleanup existing orphaned records:**

   ```typescript
   // Script to find and remove orphaned shares
   const orphanedShares = await prisma.fileShare.findMany({
     where: {
       AND: [
         { OR: [{ audioFile: null }, { textFile: null }] },
         { fileType: { in: ["audio", "text"] } },
       ],
     },
   });
   await prisma.fileShare.deleteMany({
     where: { id: { in: orphanedShares.map((s) => s.id) } },
   });
   ```

4. **Testing:**
   - Delete file → verify FileShare deleted
   - Delete pair → verify both files and shares deleted

---

#### R3: Allow Partial Text Pair Uploads (WebUI)

**Priority:** CRITICAL  
**Effort:** 1 week  
**Impact:** Improves workflow flexibility, matches Android endpoint behavior

**Implementation Plan:**

1. **Update endpoint validation:**

   ```typescript
   // Current: requires both files
   if (!summaryFile && !realtimeFile) {
     return res.status(400).json({
       error: "At least one file required",
     });
   }

   // New: allow either/both
   if (!summaryFile && !realtimeFile) {
     return res.status(400).json({
       error: "At least one file (summary or realtime) required",
     });
   }
   ```

2. **Update pair creation logic:**

   ```typescript
   // Only require both if creating pair with completion
   // OR allow partial with later update
   const pair = await tx.textFilePair.create({
     data: {
       name: pairName,
       summaryFileId: summaryFile?.id || null,
       realtimeFileId: realtimeFile?.id || null,
       uploadedById: uploadedById,
       // ...
     },
   });
   ```

3. **Add update endpoint:**

   ```typescript
   router.put("/api/files/pairs/:pairId", async (req, res) => {
     // Allow adding missing file to incomplete pair
     const { summaryFile, realtimeFile } = req.files;
     // Create new file if provided, update pair
   });
   ```

4. **Frontend updates:**
   - Show UI for partial pair state
   - Allow drag-drop to add missing file
   - Show completion status

---

### Tier 2: Important (Q1-Q2 2026)

#### R4: Implement Text File Versioning

**Priority:** HIGH  
**Effort:** 3 weeks  
**Impact:** Enables recovery, audit trails, compliance

**Implementation Plan:**

1. **Database schema:**

   ```prisma
   model TextFileVersion {
     id String @id @default(uuid())
     textFileId String
     textFile TextFile @relation(fields: [textFileId], references: [id], onDelete: Cascade)

     versionNumber Int
     encryptedData Bytes
     encryptedIV String

     fileSize Int
     lineCount Int
     wordCount Int

     createdAt DateTime @default(now())
     createdBy User @relation(fields: [createdById], references: [id])
     createdById String

     @@index([textFileId])
     @@index([createdAt])
   }
   ```

2. **Version creation on upload:**

   - Store original as version 1
   - Increment on each update
   - Keep last 10 versions by default

3. **Version comparison endpoint:**

   ```typescript
   GET /api/files/text/:id/versions/:versionNumber/compare
   // Returns diff between current and specified version
   ```

4. **Recovery endpoint:**
   ```typescript
   POST /api/files/text/:id/restore/:versionNumber
   // Restores specific version as current
   ```

---

#### R5: Add File Metadata Search & Filters

**Priority:** HIGH  
**Effort:** 2 weeks  
**Impact:** Significantly improves discoverability

**Implementation Plan:**

1. **Enhanced list endpoint:**

   ```typescript
   GET /api/files/all?
     filename=report
     &fromDate=2025-01-01
     &toDate=2025-12-31
     &fileType=text,audio
     &sizeMin=1024
     &sizeMax=52428800
     &owner=user-id
     &device=device-id
     &shared=true|false
     &sortBy=uploadedAt|fileSize|filename
     &order=asc|desc
   ```

2. **Database indexing:**

   - Index on uploadedAt, fileSize, uploadedById
   - Full-text index on filename

3. **Elasticsearch integration (optional, Phase 2):**
   - For very large deployments
   - Supports fuzzy search, synonyms

---

#### R6: Storage Monitoring & Alerts

**Priority:** HIGH  
**Effort:** 2 weeks  
**Impact:** Proactive issue detection, better operations

**Implementation Plan:**

1. **New admin endpoints:**

   ```typescript
   GET / api / admin / storage / dashboard;
   // Returns: total used, quota, trend, top users

   GET / api / admin / storage / cleanup - candidates;
   // Returns: files oldest, largest, least accessed

   POST / api / admin / storage / alerts;
   // Configure thresholds and notification channels
   ```

2. **Scheduler enhancement:**

   ```typescript
   // Add storage check to daily scheduler
   if (totalUsed > systemQuota * 0.9) {
     notifyAdmins("Storage at 90%");
   }
   ```

3. **Dashboard UI:**
   - Show storage gauge (used/available)
   - Show trend chart (7-day history)
   - List top 10 users by usage
   - One-click cleanup recommendations

---

### Tier 3: Enhancement (Q2-Q3 2026)

#### R7: Batch Download as ZIP

**Priority:** MEDIUM  
**Effort:** 1.5 weeks  
**Impact:** Improves bulk export workflow

**Implementation Plan:**

1. **New endpoint:**

   ```typescript
   POST /api/files/batch-download
   {
     "fileIds": ["uuid1", "uuid2"],
     "format": "zip" // or "tar.gz"
   }
   // Returns: { downloadUrl, expiresIn: "24h" }
   ```

2. **Temporary archive handling:**

   - Store in `/tmp` directory
   - Auto-cleanup after 24 hours
   - Limit concurrent downloads per user

3. **Archive size limits:**
   - Max 1GB per archive
   - Return error if exceeds

---

#### R8: Advanced Pair Comparison (Diff View)

**Priority:** MEDIUM  
**Effort:** 2 weeks  
**Impact:** Better visual comparison for text pairs

**Implementation Plan:**

1. **Backend diff endpoint:**

   ```typescript
   GET /api/files/pairs/:pairId/diff
   // Returns: structured diff (added lines, removed lines, changes)
   ```

2. **Frontend component:**

   - Side-by-side diff view (like GitHub)
   - Highlight added/removed/modified lines
   - Context lines around changes

3. **Library:** Use `diff-match-patch` or `jsdiff`

---

#### R9: File Tagging System

**Priority:** LOW-MEDIUM  
**Effort:** 1.5 weeks  
**Impact:** Better organization for power users

**Implementation Plan:**

1. **Database:**

   ```prisma
   model FileTag {
     id String @id @default(uuid())
     name String
     userId String // User who created tag
     color String  // Hex color for UI

     files FileTagMapping[]
   }

   model FileTagMapping {
     fileId String
     tagId String
     tag FileTag @relation(fields: [tagId], references: [id], onDelete: Cascade)
   }
   ```

2. **UI:**
   - Tag input on file upload
   - Tag management modal
   - Filter by tag

---

#### R10: Download Activity Logging & Alerts

**Priority:** LOW-MEDIUM  
**Effort:** 1 week  
**Impact:** Security auditing, compliance

**Implementation Plan:**

1. **Audit logging on download:**

   ```typescript
   await prisma.auditLog.create({
     data: {
       userId: req.user.userId,
       action: "files.download",
       resource: "audio|text",
       resourceId: fileId,
       details: { filename, fileSize },
       // ...
     },
   });
   ```

2. **Access count tracking:**

   ```prisma
   model AudioFile {
     // Add field
     downloadCount Int @default(0)
     lastDownloadAt DateTime?
   }
   ```

3. **Suspicious activity detection:**
   - Alert if same user downloads 100+ files in 1 hour
   - Notify file owner when shared file is accessed
   - Track access patterns

---

## Implementation Roadmap

### Phase 1: Foundation (Weeks 1-4)

- [ ] R1: Storage quotas
- [ ] R2: Fix FileShare cascade deletion
- [ ] R3: Partial text pairs support

**Estimated Effort:** 4 weeks  
**Team:** 1 backend + 1 frontend developer

### Phase 2: Discovery & Monitoring (Weeks 5-8)

- [ ] R4: File versioning
- [ ] R5: Metadata search & filters
- [ ] R6: Storage monitoring

**Estimated Effort:** 4 weeks  
**Team:** 1 backend + 1 frontend developer

### Phase 3: Bulk Operations & UX (Weeks 9-12)

- [ ] R7: Batch download
- [ ] R8: Advanced pair comparison
- [ ] R9: File tagging

**Estimated Effort:** 4 weeks  
**Team:** 1 backend + 1 frontend developer

### Phase 4: Security & Compliance (Weeks 13-16)

- [ ] R10: Download activity logging
- [ ] Add suspicious activity alerts
- [ ] Retention policies

**Estimated Effort:** 4 weeks  
**Team:** 1 backend + 1 frontend developer

---

## Risk Assessment

### High-Risk Gaps

| Gap                       | Risk                                  | Mitigation                | Timeline |
| ------------------------- | ------------------------------------- | ------------------------- | -------- |
| Storage quotas            | Abuse, DoS, database bloat            | Implement R1 immediately  | Q1 2026  |
| FileShare cascade         | Data corruption, orphaned records     | Deploy migration after R2 | Q1 2026  |
| No rate limiting per user | Brute force attacks, bulk data export | Add role-based limits     | Q1 2026  |

### Medium-Risk Gaps

| Gap                          | Risk                                | Mitigation       | Timeline   |
| ---------------------------- | ----------------------------------- | ---------------- | ---------- |
| No versioning                | Data loss, no rollback              | Implement R4     | Q1 2026    |
| No metadata search           | Poor UX, reduced adoption           | Add filters (R5) | Q1-Q2 2026 |
| Download activity not logged | Security blind spot, compliance gap | Implement R10    | Q2 2026    |

### Low-Risk Enhancements

| Gap               | Risk                                   | Mitigation          | Timeline |
| ----------------- | -------------------------------------- | ------------------- | -------- |
| No tagging        | Organization issues for large datasets | Add as nice-to-have | Q2 2026  |
| No batch download | Inconvenience, not security issue      | Implement R7        | Q2 2026  |

---

## Compliance & Standards

### GDPR Compliance

- [ ] Right to be forgotten (soft delete + grace period)
- [ ] Data portability (batch export)
- [ ] Access audit trail (download logging)

### HIPAA Compliance (if healthcare data)

- [ ] Encryption at rest ✅
- [ ] Encryption in transit ✅ (TLS required)
- [ ] Access logging ❌ (need R10)
- [ ] Retention policies ❌

### SOC 2 Compliance

- [ ] Audit logging ✅
- [ ] Access controls ✅
- [ ] Data encryption ✅
- [ ] Backup/recovery ❌

---

## Success Metrics

After implementing these recommendations, track:

1. **Performance:**

   - File upload success rate > 99%
   - Average upload time < 2 seconds
   - Search query latency < 500ms

2. **Reliability:**

   - Zero orphaned FileShare records
   - Auto-delete success rate = 100%
   - Scheduler uptime > 99.9%

3. **Security:**

   - 100% of downloads logged
   - Alert accuracy for suspicious access > 95%
   - Zero unauthorized file access incidents

4. **User Experience:**
   - Search usage adoption > 50% of users
   - Batch download feature usage > 30% of power users
   - File organization via tags > 20% adoption

---

## Conclusion

The current file management system provides solid foundation with encryption, RBAC, and audit logging. However, key gaps exist around quotas, versioning, and monitoring that should be addressed before production deployment at scale.

**Recommended action:** Prioritize Tier 1 items (R1-R3) for Q1 2026, which addresses critical gaps and enables safer multi-tenant operations.

---

**Document Version:** 1.0  
**Last Updated:** November 27, 2025  
**Owner:** AI Development Team  
**Review Schedule:** Quarterly or as priorities change
