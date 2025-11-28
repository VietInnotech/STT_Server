# Android Results Viewer - Simplified Implementation

**Date:** November 28, 2025  
**Purpose:** Basic results viewing UI for Android apps with minimal complexity

---

## Overview

Implement a simplified results viewer with:

1. **Results List** - Simple paginated list of results with basic info
2. **Result Detail** - View full result details
3. **Permissions** - Show/hide actions based on user role
4. **Core Actions** - View detail, Delete (if permitted)

---

## Implementation Overview

### API Endpoints Required

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/files/results` | GET | List results with pagination (limit, offset) |
| `/api/files/results/{id}` | GET | Get result details with decrypted content |
| `/api/files/results/{id}` | DELETE | Delete result (requires `FILES_DELETE` permission) |

**Query Parameters for Results List:**
- `limit` - Number of results (default 50)
- `offset` - Pagination offset (default 0)
- `status` - Filter by status: `completed`, `pending`, `failed`, `all` (optional)

### Data Models

Core models needed:

- `ResultItem` - ID, title, status, confidence, processingTime, audioDuration, processedAt, uploadedBy
- `ResultDetail` - All result metadata plus decrypted summary, transcript, and summaryData (template fields)
- `PaginationInfo` - total, limit, offset, hasMore
- `ResultsListResponse` - success, results[], pagination

### Repository & ViewModel

Keep it simple:
- Fetch results with pagination (limit, offset)
- Fetch result detail by ID
- Delete result
- Handle loading/success/error states

Use existing patterns from the app (likely LiveData, coroutines, etc.)

## UI Structure

### Results List Screen

**What to show in each list item:**
- Title (or "Untitled" if null)
- Status badge (completed/pending/failed/processing with color coding)
- Confidence score (if available) as percentage
- Processing duration (if available)
- Processed date
- Show template name (if available)

**Pagination:**
- Load 50 results at a time
- Implement infinite scroll: load next page when user scrolls near end
- Check `hasMore` flag to know if more results exist

**Actions per item (based on permissions):**
- View button → Navigate to detail screen
- Delete button → Show delete confirmation dialog (only if user has `FILES_DELETE` permission)

**Empty state:**
- Show message if no results exist

### Result Detail Screen

**Display these fields (if available):**
- Title
- Status badge
- Confidence score
- Template used
- Tags (as chips)
- Processing time
- Audio duration
- Date processed
- Full summary (text or structured data from template)
- Full transcript

**Actions (based on permissions):**
- Delete button (only if user has `FILES_DELETE` permission)
- Optional: Share button (can implement later)

**Permission checks:**
```
if (user.permissions.includes("FILES_READ")) {
    // Show detail screen
}
if (user.permissions.includes("FILES_DELETE")) {
    // Show delete button
}
```

---

## Key Features Checklist

### Results List Screen
- [ ] Displays paginated list (50 items per page)
- [ ] Shows title, status badge, confidence, processing time, date
- [ ] Infinite scroll pagination (load next page when scrolling near end)
- [ ] Tap item → Navigate to detail screen
- [ ] Delete button (if user has `FILES_DELETE` permission)
- [ ] Shows loading state while fetching
- [ ] Shows empty state if no results

### Result Detail Screen
- [ ] Display all available metadata
- [ ] Show full summary and transcript
- [ ] Display tags as chips
- [ ] Show delete button (if permitted)
- [ ] Back button to return to list

### Permission Checks
```
List deletion button only if:
  user.hasPermission("FILES_DELETE")

Show detail screen only if:
  user.hasPermission("FILES_READ")
```

---

## Implementation Steps

1. **Add API endpoints** to your Retrofit service
   - `GET /api/files/results` (with limit, offset query params)
   - `GET /api/files/results/{id}`
   - `DELETE /api/files/results/{id}`

2. **Create data models** for request/response
   - ResultItem, ResultDetail, PaginationInfo, ResultsListResponse

3. **Create Repository** to handle API calls with state management

4. **Create ViewModel** for pagination and data loading

5. **Create RecyclerView adapter** for results list with:
   - Title, status badge, confidence, duration, date
   - Item click → navigate to detail
   - Long press or button → delete (with permission check)

6. **Create Results List Fragment/Activity**
   - RecyclerView with infinite scroll
   - Loading/empty states
   - Pull to refresh (optional)

7. **Create Result Detail Fragment/Activity**
   - Display all metadata
   - Show summary and transcript
   - Delete button (permission check)

8. **Add navigation** between list and detail screens

9. **Test** with real API calls to verify permissions work correctly
