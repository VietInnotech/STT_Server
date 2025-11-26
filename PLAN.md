# Detailed Plan: Template Manager Implementation (Revised)

## Important Discovery: Templates are on External MAIE Server

After reviewing the `FRONTEND_TEMPLATE_MANAGEMENT_GUIDE.md`, templates are **NOT stored locally** in our database. Instead, they are managed by an **external MAIE API server** at `http://localhost:8000/v1/templates`.

This means the current local template implementation (`src/routes/templates.ts`, `prisma/schema.prisma Template model`) should be **removed** and replaced with a **proxy/passthrough** to the MAIE API.

---

## Architecture Overview

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│   React Frontend │ ──▶ │  Node.js Backend │ ──▶ │   MAIE Server    │
│   (TemplatesPage)│      │   (Proxy Layer)  │      │ localhost:8000   │
└─────────────────┘      └─────────────────┘      └─────────────────┘
        │                        │                        │
   Uses JWT Auth           Adds X-API-Key          Stores Templates
   from our system         for MAIE auth           Schema, Prompt, Example
```

---

## Current State (WRONG)

### ❌ What Exists (To Be Removed/Replaced)

1. **Local Database Model** (`prisma/schema.prisma`):
   - `Template` model storing templates locally
   - `UserSettings.defaultTemplateId` relation

2. **Local Backend API** (`src/routes/templates.ts`):
   - Full CRUD against local SQLite database
   - Not connected to MAIE at all

3. **Frontend** (`client/src/pages/TemplatesPage.tsx`):
   - Calls `/api/templates` (local)
   - Has "ownerType" filter (system/user) - not applicable to MAIE

---

## MAIE API Reference

**Base URL**: `http://localhost:8000` (configurable via env)

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/v1/templates` | List all templates | None |
| GET | `/v1/templates/{id}` | Get template details (schema, prompt, example) | None |
| GET | `/v1/templates/{id}/schema` | Get raw JSON schema | None |
| POST | `/v1/templates` | Create template | X-API-Key |
| PUT | `/v1/templates/{id}` | Update template | X-API-Key |
| DELETE | `/v1/templates/{id}` | Delete template | X-API-Key |

### MAIE Template Data Model

```typescript
interface MAIETemplate {
  id: string;
  name: string;
  description: string;
  schema_url: string;
  parameters: Record<string, any>;
  example?: Record<string, any>;
  prompt_template?: string;    // Only in detail view
  schema_data?: JSONSchema;    // Only in detail view
}

interface JSONSchema {
  title: string;
  description: string;
  type: string;
  properties: Record<string, JSONSchemaProperty>;
  required?: string[];
}
```

---

## Implementation Plan

### Phase 1: Configuration & Environment

#### 1.1 Add Environment Variables

Add to `.env`:
```env
MAIE_API_URL=http://localhost:8000
MAIE_API_KEY=your_secret_api_key_here
```

#### 1.2 Create MAIE Service (`src/services/maieApi.ts`)

```typescript
import axios from 'axios';

const maieClient = axios.create({
  baseURL: process.env.MAIE_API_URL || 'http://localhost:8000',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add API key for protected endpoints
const withApiKey = () => ({
  headers: { 'X-API-Key': process.env.MAIE_API_KEY }
});

export const maieApi = {
  listTemplates: () => maieClient.get('/v1/templates'),
  getTemplate: (id: string) => maieClient.get(`/v1/templates/${id}`),
  getTemplateSchema: (id: string) => maieClient.get(`/v1/templates/${id}/schema`),
  createTemplate: (data: CreateTemplateDTO) => 
    maieClient.post('/v1/templates', data, withApiKey()),
  updateTemplate: (id: string, data: UpdateTemplateDTO) => 
    maieClient.put(`/v1/templates/${id}`, data, withApiKey()),
  deleteTemplate: (id: string) => 
    maieClient.delete(`/v1/templates/${id}`, withApiKey()),
};
```

---

### Phase 2: Backend - Replace Local with MAIE Proxy

#### 2.1 Rewrite `src/routes/templates.ts`

Replace the entire file to proxy requests to MAIE:

```typescript
import { Router } from 'express';
import { maieApi } from '../services/maieApi';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

// All routes require authentication (our JWT)
router.use(authenticate);

// GET /api/templates - List all templates from MAIE
router.get('/', async (req, res) => {
  try {
    const response = await maieApi.listTemplates();
    res.json({ templates: response.data });
  } catch (err) {
    res.status(err.response?.status || 500).json({ 
      error: 'Failed to fetch templates from MAIE' 
    });
  }
});

// GET /api/templates/:id - Get template details
router.get('/:id', async (req, res) => {
  try {
    const response = await maieApi.getTemplate(req.params.id);
    res.json({ template: response.data });
  } catch (err) {
    res.status(err.response?.status || 500).json({ 
      error: 'Failed to fetch template' 
    });
  }
});

// GET /api/templates/:id/schema - Get raw JSON schema
router.get('/:id/schema', async (req, res) => {
  try {
    const response = await maieApi.getTemplateSchema(req.params.id);
    res.json(response.data);
  } catch (err) {
    res.status(err.response?.status || 500).json({ 
      error: 'Failed to fetch schema' 
    });
  }
});

// POST /api/templates - Create (admin only)
router.post('/', requireRole('admin'), async (req, res) => {
  try {
    const response = await maieApi.createTemplate(req.body);
    res.status(201).json({ template: response.data });
  } catch (err) {
    res.status(err.response?.status || 500).json({ 
      error: err.response?.data?.detail || 'Failed to create template' 
    });
  }
});

// PUT /api/templates/:id - Update (admin only)
router.put('/:id', requireRole('admin'), async (req, res) => {
  try {
    const response = await maieApi.updateTemplate(req.params.id, req.body);
    res.json({ template: response.data });
  } catch (err) {
    res.status(err.response?.status || 500).json({ 
      error: err.response?.data?.detail || 'Failed to update template' 
    });
  }
});

// DELETE /api/templates/:id - Delete (admin only)
router.delete('/:id', requireRole('admin'), async (req, res) => {
  try {
    await maieApi.deleteTemplate(req.params.id);
    res.json({ message: 'Template deleted' });
  } catch (err) {
    res.status(err.response?.status || 500).json({ 
      error: 'Failed to delete template' 
    });
  }
});

export default router;
```

---

### Phase 3: Database Cleanup

#### 3.1 Remove Local Template Model

Create migration to:
1. Drop `templates` table
2. Remove `defaultTemplateId` column from `user_settings`

#### 3.2 Update `prisma/schema.prisma`

- Remove `Template` model entirely
- Remove `defaultTemplateId` and `defaultTemplate` from `UserSettings`
- Remove `templates` relation from `User`

---

### Phase 4: Frontend Updates

#### 4.1 Update TypeScript Types (`client/src/lib/api.ts`)

```typescript
// MAIE Template types (matching MAIE API)
export interface MAIETemplate {
  id: string;
  name: string;
  description: string;
  schema_url: string;
  parameters: Record<string, any>;
  example?: Record<string, any>;
  prompt_template?: string;
  schema_data?: JSONSchema;
}

export interface JSONSchema {
  title?: string;
  description?: string;
  type: string;
  properties?: Record<string, JSONSchemaProperty>;
  required?: string[];
}

export interface JSONSchemaProperty {
  type: string;
  description?: string;
  items?: JSONSchema;
  maxItems?: number;
}

export const templatesApi = {
  list: () => api.get<{ templates: MAIETemplate[] }>('/api/templates'),
  get: (id: string) => api.get<{ template: MAIETemplate }>(`/api/templates/${id}`),
  getSchema: (id: string) => api.get<JSONSchema>(`/api/templates/${id}/schema`),
  create: (data: Partial<MAIETemplate>) => 
    api.post<{ template: MAIETemplate }>('/api/templates', data),
  update: (id: string, data: Partial<MAIETemplate>) => 
    api.put<{ template: MAIETemplate }>(`/api/templates/${id}`, data),
  delete: (id: string) => api.delete(`/api/templates/${id}`),
};
```

#### 4.2 Rewrite `TemplatesPage.tsx`

Major changes:
- Remove `ownerType` filter (MAIE doesn't have user-owned templates)
- Remove "Set as Default" functionality
- Add proper display for MAIE template fields:
  - `description`
  - `schema_data` preview
  - `prompt_template` preview
  - `example` preview
- Add template detail view modal
- Update form to match MAIE data model

---

### Phase 5: Enhanced UI Components

#### 5.1 Template List View
- Show: name, description, schema preview
- Actions: View, Edit (admin), Delete (admin)

#### 5.2 Template Detail Modal
- Full schema visualization
- Prompt template display
- Example JSON output
- Copy to clipboard buttons

#### 5.3 Template Form (Admin Only)
- Name (required)
- Description (required)
- JSON Schema editor
- Prompt Template editor (Jinja2)
- Example JSON editor
- Parameters editor

---

## Implementation Order

| Phase | Task | Priority | Effort | Files |
|-------|------|----------|--------|-------|
| 1 | Add env config & MAIE service | High | 1h | `.env`, `src/services/maieApi.ts` |
| 2 | Rewrite templates route as proxy | High | 2h | `src/routes/templates.ts` |
| 3 | Database cleanup migration | High | 1h | `prisma/schema.prisma`, migration |
| 4 | Update frontend API types | High | 1h | `client/src/lib/api.ts` |
| 5 | Rewrite TemplatesPage | High | 3h | `client/src/pages/TemplatesPage.tsx` |
| 6 | Add detail view modal | Medium | 2h | New component |
| 7 | Schema/Prompt editors | Medium | 2h | New components |
| 8 | Remove settings references | Low | 30m | `settings.ts`, `api.ts` |

**Total Estimated Effort: ~12.5 hours**

---

## Files to Create

- `src/services/maieApi.ts` - MAIE API client
- `client/src/components/templates/TemplateDetailModal.tsx`
- `client/src/components/templates/SchemaViewer.tsx`
- `client/src/components/templates/PromptViewer.tsx`

## Files to Modify

- `.env` - Add MAIE_API_URL, MAIE_API_KEY
- `src/routes/templates.ts` - Complete rewrite as proxy
- `prisma/schema.prisma` - Remove Template model
- `client/src/lib/api.ts` - Update types
- `client/src/pages/TemplatesPage.tsx` - Complete rewrite
- `src/routes/settings.ts` - Remove defaultTemplateId

## Files to Delete (After Migration)

- Local template-related database tables

---

## Environment Variables Required

```env
# MAIE API Configuration
MAIE_API_URL=http://localhost:8000
MAIE_API_KEY=your_secret_api_key_here
```

---

## Error Handling Considerations

1. **MAIE Server Unavailable**: Show user-friendly error, log details
2. **Invalid API Key**: Return 401/403 with clear message
3. **Network Timeout**: Implement retry logic or timeout message
4. **MAIE Validation Errors**: Pass through error details to frontend

---

## Security Notes

1. **API Key Protection**: MAIE API key stored server-side only, never exposed to frontend
2. **Admin-Only Writes**: Only admins can create/update/delete templates
3. **JWT Still Required**: All requests still require our JWT authentication
4. **Audit Logging**: Log template operations to our audit log

---

## Ready to Implement

Start with **Phase 1 & 2** (MAIE service + route rewrite) to establish the connection, then proceed with database cleanup and frontend updates.
