# Implementation Checklist - Dual Text File Comparison

**Project:** UNV AI Report - Text File Comparison Feature  
**Start Date:** November 20, 2025  
**Status:** Planning Complete - Ready for Implementation  

---

## 📋 Pre-Implementation Checklist

- [x] Reviewed existing codebase
- [x] Analyzed database schema
- [x] Designed two-endpoint solution
- [x] Created comprehensive documentation
- [x] Prepared Android API specification
- [x] Prepared WebUI API specification
- [x] Created example requests/responses
- [x] Identified security requirements
- [x] Planned testing strategy
- [ ] **User approval on design**
- [ ] **Create feature branch**
- [ ] **Assign developer(s)**

---

## 🚀 Phase 1: Backend Foundation (Week 1)

### 1.1 Database Migration
- [ ] Create migration file: `add_text_file_pairs`
- [ ] Add `TextFilePair` model to `schema.prisma`
- [ ] Add reverse relations to `TextFile` model
- [ ] Run migration: `npx prisma migrate dev`
- [ ] Regenerate Prisma client: `npx prisma generate`
- [ ] Verify in Prisma Studio: check tables created
- [ ] Verify existing data still accessible

**Files to Modify:**
- `prisma/schema.prisma` - Add TextFilePair model
- `prisma/migrations/[timestamp]_add_text_file_pairs/migration.sql` - Auto-generated

**Acceptance Criteria:**
- ✅ Migration runs without errors
- ✅ TextFilePair table exists in database
- ✅ Foreign keys properly set up
- ✅ Cascade delete works correctly
- ✅ Existing TextFile records unaffected

---

### 1.2 Implement Android Endpoint: `POST /api/files/text-pair-android`
- [ ] Create new route handler in `/src/routes/files.ts`
- [ ] Copy implementation code from DUAL_TEXT_FILE_COMPARISON_PLAN.md (Section 2.0.1)
- [ ] Implement validation:
  - [ ] Check summary non-empty
  - [ ] Check realtime non-empty
  - [ ] Check combined size < 100MB
  - [ ] Check authentication
- [ ] Implement encryption:
  - [ ] Encrypt summary with AES-256
  - [ ] Encrypt realtime with AES-256
  - [ ] Generate unique IVs for each
- [ ] Implement database operations:
  - [ ] Create TextFile record for summary
  - [ ] Create TextFile record for realtime
  - [ ] Create TextFilePair linking both
  - [ ] Use transaction to ensure atomicity
- [ ] Implement device resolution:
  - [ ] Match deviceId against Device.id
  - [ ] Match deviceId against Device.deviceId
  - [ ] Set null if not found
- [ ] Implement auto-delete:
  - [ ] Use user's default if not provided
  - [ ] Fall back to system default
  - [ ] Calculate scheduledDeleteAt
- [ ] Implement audit logging:
  - [ ] Log action: `files.upload-pair-android`
  - [ ] Include pair ID, file sizes, device info
- [ ] Add Swagger documentation
- [ ] Add rate limiting (inherit from existing)

**Files to Modify:**
- `src/routes/files.ts` - Add new route handler
- `src/config/swagger.ts` - Add endpoint documentation

**Acceptance Criteria:**
- ✅ Endpoint responds to POST requests
- ✅ Validates required fields
- ✅ Encrypts data correctly
- ✅ Creates TextFile records
- ✅ Creates TextFilePair record
- ✅ Returns 201 with pair details
- ✅ Handles errors with proper status codes

---

### 1.3 Implement WebUI Endpoint: `POST /api/files/text-pair`
- [ ] Create new route handler in `/src/routes/files.ts`
- [ ] Implement multipart/form-data parsing (via multer)
- [ ] Implement validation:
  - [ ] At least one file provided
  - [ ] Validate file types (text/plain)
  - [ ] Check individual file size < 50MB
  - [ ] Check authentication
- [ ] Implement file processing:
  - [ ] Read file buffers from multipart form
  - [ ] Encrypt each file
  - [ ] Generate unique IVs
- [ ] Implement database operations:
  - [ ] Create TextFile record for summary (if provided)
  - [ ] Create TextFile record for realtime (if provided)
  - [ ] Create TextFilePair
  - [ ] Use transaction for atomicity
- [ ] Handle partial uploads:
  - [ ] Allow null summaryFileId if realtime provided
  - [ ] Allow null realtimeFileId if summary provided
  - [ ] Require at least one file
- [ ] Implement auto-delete (same as Android endpoint)
- [ ] Implement audit logging
- [ ] Add Swagger documentation

**Files to Modify:**
- `src/routes/files.ts` - Add new route handler
- `src/config/swagger.ts` - Add endpoint documentation

**Acceptance Criteria:**
- ✅ Accepts multipart/form-data
- ✅ Validates files
- ✅ Creates single or dual file pairs
- ✅ Encrypts uploaded content
- ✅ Returns 201 with pair details
- ✅ Handles missing files gracefully

---

### 1.4 Implement Additional Endpoints
- [ ] GET `/api/files/text-pair/:id` - Get pair details
- [ ] GET `/api/files/text-pair/:id/compare` - Get decrypted content
- [ ] DELETE `/api/files/text-pair/:id` - Delete pair and cascade files
- [ ] Add proper error handling (ownership check, permissions)
- [ ] Add audit logging for all operations
- [ ] Update Swagger docs

**Files to Modify:**
- `src/routes/files.ts` - Add 3 new route handlers
- `src/config/swagger.ts` - Update documentation

**Acceptance Criteria:**
- ✅ All endpoints respond correctly
- ✅ Ownership/permission checks work
- ✅ Decryption works correctly
- ✅ Cascade deletion removes both files
- ✅ Proper error messages returned

---

### 1.5 Update GET `/api/files/all` Endpoint
- [ ] Add `textPairs` array to response
- [ ] Include pair details with nested file info
- [ ] Include ownership/sharing information
- [ ] Maintain backward compatibility (audio, text still present)
- [ ] Update type definitions
- [ ] Update Swagger docs

**Files to Modify:**
- `src/routes/files.ts` - Modify GET /api/files/all handler
- `src/config/swagger.ts` - Update response schema

**Acceptance Criteria:**
- ✅ Response includes `textPairs` array
- ✅ Includes file details
- ✅ Includes creator info
- ✅ Backward compatible
- ✅ Matches updated schema

---

### 1.6 Unit Tests for Backend
- [ ] Test TextFilePair model CRUD
- [ ] Test Android endpoint (happy path)
- [ ] Test Android endpoint (error cases)
- [ ] Test WebUI endpoint (both files)
- [ ] Test WebUI endpoint (one file)
- [ ] Test WebUI endpoint (no files)
- [ ] Test encryption/decryption
- [ ] Test cascade deletion
- [ ] Test audit logging
- [ ] Test permission checks

**Files to Create:**
- `src/routes/__tests__/files.text-pair.test.ts`

**Acceptance Criteria:**
- ✅ All tests pass
- ✅ >80% code coverage for new endpoints
- ✅ Edge cases covered

---

## 🎨 Phase 2: Backend Integration (Week 1-2)

### 2.1 Update GET `/api/files/all`
(Covered in Phase 1.5)

### 2.2 Implement Sharing for Pairs
- [ ] Decide: share as unit or individual files?
- [ ] Update FileShare model if needed
- [ ] Implement share logic
- [ ] Add audit logging
- [ ] Add tests

**Decision:** Share as unit (both files together)

**Files to Modify:**
- `src/routes/files.ts` - Update share endpoint
- `prisma/schema.prisma` - If needed

---

### 2.3 Update Socket.IO Events
- [ ] Emit `files:pair-uploaded` when Android uploads
- [ ] Emit `files:pair-deleted` when pair deleted
- [ ] Update frontend listeners
- [ ] Test real-time updates

**Files to Modify:**
- `src/lib/socketBus.ts` - Add event handlers
- `index.ts` - If needed

---

### 2.4 Documentation Updates
- [ ] Update Swagger with all endpoints
- [ ] Add endpoint descriptions
- [ ] Add request/response examples
- [ ] Document error codes
- [ ] Add authentication requirements

**Files to Modify:**
- `src/config/swagger.ts` - Complete documentation
- `README.md` - Add feature description

---

### 2.5 Integration Tests
- [ ] Test full Android upload flow
- [ ] Test full WebUI upload flow
- [ ] Test list/view/delete workflows
- [ ] Test permission enforcement
- [ ] Test error scenarios

**Files to Create:**
- `src/routes/__tests__/files.text-pair.integration.test.ts`

---

## 🎨 Phase 3: Frontend Implementation (Week 2-3)

### 3.1 Update API Client
- [ ] Add `textPairsApi` to `/client/src/lib/api.ts`
- [ ] Add `uploadPair()` method
- [ ] Add `getPair()` method
- [ ] Add `getComparison()` method
- [ ] Add `deletePair()` method
- [ ] Add `listPairs()` method (via files/all)

**Files to Modify:**
- `client/src/lib/api.ts` - Add new API methods

**Acceptance Criteria:**
- ✅ All endpoints callable from React
- ✅ Proper TypeScript types
- ✅ Error handling

---

### 3.2 Create UploadPairModal Component
- [ ] Create `/client/src/components/UploadPairModal.tsx`
- [ ] Add text input for pair name
- [ ] Add file input for summary (optional, drag-drop)
- [ ] Add file input for realtime (optional, drag-drop)
- [ ] Add number input for auto-delete days
- [ ] Add validation (at least one file required)
- [ ] Add loading states
- [ ] Add success/error messages
- [ ] Integrate with API

**Files to Create:**
- `client/src/components/UploadPairModal.tsx`

**Acceptance Criteria:**
- ✅ Can select summary file
- ✅ Can select realtime file
- ✅ Can select both or one
- ✅ Validates at least one selected
- ✅ Shows loading during upload
- ✅ Shows success/error toast

---

### 3.3 Create ComparisonViewModal Component
- [ ] Create `/client/src/components/ComparisonViewModal.tsx`
- [ ] Two-column split layout (50/50)
- [ ] Left: Summary content with scrolling
- [ ] Right: Realtime content with scrolling
- [ ] Optional: Synchronized scrolling
- [ ] Download buttons for each file
- [ ] Copy to clipboard buttons
- [ ] Handle missing file (show message)
- [ ] Full-screen toggle option

**Files to Create:**
- `client/src/components/ComparisonViewModal.tsx`

**Acceptance Criteria:**
- ✅ Displays content side-by-side
- ✅ Handles missing files gracefully
- ✅ Download works
- ✅ Copy works
- ✅ Responsive design

---

### 3.4 Update FilesPage Component
- [ ] Add "Upload Comparison (2 Files)" button
- [ ] Add pair section in file list (or integrated)
- [ ] Show pair name with both filenames
- [ ] Add "View Comparison" button
- [ ] Add "Delete" button for pair
- [ ] Add visual indicator (badge/icon) for pairs
- [ ] Wire up upload modal
- [ ] Wire up comparison view modal
- [ ] Update file list to show pairs

**Files to Modify:**
- `client/src/pages/FilesPage.tsx`

**Acceptance Criteria:**
- ✅ Upload button visible
- ✅ Pairs visible in list
- ✅ View comparison opens modal
- ✅ Delete removes pair
- ✅ UI responsive

---

### 3.5 Frontend Tests
- [ ] Test UploadPairModal component
- [ ] Test ComparisonViewModal component
- [ ] Test FilesPage updates
- [ ] Test API integration
- [ ] Test error states

**Files to Create:**
- `client/src/components/__tests__/*.test.tsx`

---

## ✅ Phase 4: Testing & Polish (Week 3-4)

### 4.1 End-to-End Testing

#### Android Endpoint Tests
- [ ] Upload with minimum fields (summary + realtime)
- [ ] Upload with all fields
- [ ] Upload with missing summary
- [ ] Upload with empty realtime
- [ ] Upload with oversized payload
- [ ] Upload without authentication
- [ ] Verify files encrypted and stored
- [ ] Verify pair created correctly
- [ ] Verify audit log created

**Tools:** Postman, curl, Insomnia

**Test File:** Document results in `TESTING_ANDROID_API.md`

#### WebUI Endpoint Tests
- [ ] Upload both files via browser
- [ ] Upload only summary
- [ ] Upload only realtime
- [ ] Try upload with no files
- [ ] Verify files encrypted
- [ ] Verify pair visible in list
- [ ] View comparison side-by-side
- [ ] Download each file
- [ ] Delete pair
- [ ] Verify audit logs

**Tools:** Browser dev tools, Postman

**Test File:** Document results in `TESTING_WEBUI_FEATURE.md`

#### Cross-Browser Compatibility
- [ ] Chrome
- [ ] Firefox
- [ ] Safari
- [ ] Edge

#### Mobile Responsiveness
- [ ] Desktop (1920x1080)
- [ ] Tablet (768x1024)
- [ ] Mobile (375x812)

### 4.2 Performance Testing
- [ ] Upload 1MB files
- [ ] Upload 10MB files
- [ ] Upload 50MB files
- [ ] Decrypt and display comparison
- [ ] List with 1000 files
- [ ] Measure encryption/decryption time
- [ ] Measure database query time

**Target:**
- ✅ Upload: < 5 seconds per 50MB
- ✅ Decrypt: < 2 seconds for 50MB
- ✅ List: < 1 second with 1000 files

### 4.3 Security Audit
- [ ] Review encryption implementation
- [ ] Verify JWT validation
- [ ] Check permission enforcement
- [ ] Test for injection vulnerabilities
- [ ] Test rate limiting
- [ ] Check audit logging completeness

### 4.4 Documentation
- [ ] Update README.md
- [ ] Update API documentation
- [ ] Create user guide
- [ ] Create developer guide
- [ ] Document known limitations
- [ ] Create troubleshooting guide

**Files to Create/Update:**
- `README.md` - Add feature section
- `API.md` or update Swagger - Full API docs
- `USER_GUIDE.md` - How to use feature
- `DEVELOPER_GUIDE.md` - Implementation details
- `TROUBLESHOOTING.md` - Common issues

### 4.5 Code Review & QA
- [ ] Code review by team lead
- [ ] Security review
- [ ] Performance review
- [ ] Documentation review
- [ ] QA sign-off

### 4.6 Deployment Preparation
- [ ] Create release notes
- [ ] Test on staging environment
- [ ] Backup database before deployment
- [ ] Prepare rollback plan
- [ ] Schedule deployment window
- [ ] Notify stakeholders

---

## 🚢 Deployment Phase

### Pre-Deployment
- [ ] All tests passing
- [ ] Code reviewed and approved
- [ ] Documentation complete
- [ ] Database backup created
- [ ] Rollback procedure prepared

### Deployment Steps
1. [ ] Stop server (or use blue-green deployment)
2. [ ] Run database migration
3. [ ] Deploy new code
4. [ ] Run sanity tests
5. [ ] Monitor for errors
6. [ ] Announce to users

### Post-Deployment
- [ ] Monitor error logs
- [ ] Check performance metrics
- [ ] Verify feature works
- [ ] Monitor audit logs
- [ ] Collect user feedback
- [ ] Fix any issues found

---

## 📊 Success Metrics

After deployment, track:
- ✅ Number of paired uploads per day
- ✅ Comparison views per day
- ✅ Upload success rate (% without errors)
- ✅ Average decryption time
- ✅ Error rate (if any)
- ✅ User feedback/satisfaction
- ✅ No security incidents

---

## 📚 Documentation Files

### Already Created:
1. **`DUAL_TEXT_FILE_COMPARISON_PLAN.md`** - Comprehensive master plan
2. **`ANDROID_TEXT_PAIR_API.md`** - Android API specification and guide
3. **`API_DESIGN_SUMMARY.md`** - Overview of design decisions
4. **`API_EXAMPLES.md`** - Request/response examples with curl

### To Create:
5. **`TESTING_ANDROID_API.md`** - Android endpoint test results
6. **`TESTING_WEBUI_FEATURE.md`** - WebUI feature test results
7. **`USER_GUIDE.md`** - How to use the feature
8. **`DEVELOPER_GUIDE.md`** - Implementation details for developers
9. **`DEPLOYMENT_NOTES.md`** - Deployment procedure and notes
10. **`TROUBLESHOOTING.md`** - Common issues and solutions

---

## 🎯 Key Decision Points

1. **Two Endpoints?** ✅ YES
   - `/api/files/text-pair-android` - For Android (JSON)
   - `/api/files/text-pair` - For WebUI (multipart)

2. **Shared as Unit?** ✅ YES
   - Both files shared together (easier to manage)

3. **Auto-delete Sync?** ✅ YES
   - Same deleteAfterDays applied to both files

4. **Backward Compatibility?** ✅ YES
   - Keep existing single-file upload workflow
   - Android endpoint is NEW (not replacing old)

5. **Migration Existing Android Files?** ❌ NO (Optional Later)
   - Don't migrate existing androidSummary/androidRealtime
   - Keep separate for now, add migration tool later if needed

---

## 🔗 Dependencies & Prerequisites

- [x] Prisma ORM
- [x] Multer for file uploads
- [x] Encryption utilities
- [x] Authentication middleware
- [x] Socket.IO for real-time updates
- [ ] React hot toast (for notifications)
- [ ] TailwindCSS (for styling)

---

## 📞 Contact & Questions

**If questions arise during implementation:**
1. Check documentation files first
2. Review code comments
3. Ask team lead
4. Create issues for blockers

---

## Sign-Off

**Plan Review Date:** November 20, 2025  
**Prepared by:** GitHub Copilot  
**Reviewed by:** _____________  
**Approved by:** _____________  
**Implementation Start:** _____________  
**Expected Completion:** _____________  

---

**Last Updated:** November 20, 2025  
**Next Review:** Before implementation starts
