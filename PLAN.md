# Template Manager Implementation Plan

## Overview

Templates are managed by an **external MAIE API server** (`http://localhost:8000/v1/templates`). The current local implementation must be replaced with a proxy layer.

```
Frontend (JWT Auth) → Backend (Proxy + X-API-Key) → MAIE Server
```

---

## Current State → Target State

| Component | Current (Remove)                                   | Target                  |
| --------- | -------------------------------------------------- | ----------------------- |
| Database  | `Template` model, `UserSettings.defaultTemplateId` | None (external)         |
| Backend   | Local CRUD (`src/routes/templates.ts`)             | Proxy to MAIE           |
| Frontend  | `ownerType` filter, "Set as Default"               | Simple list/detail view |

---

## MAIE API Reference

| Method          | Path                   | Auth      |
| --------------- | ---------------------- | --------- |
| GET             | `/v1/templates`        | None      |
| GET             | `/v1/templates/{id}`   | None      |
| POST/PUT/DELETE | `/v1/templates[/{id}]` | X-API-Key |

```typescript
interface MAIETemplate {
  id: string;
  name: string;
  description: string;
  schema_url: string;
  parameters: Record<string, any>;
  example?: Record<string, any>;
  prompt_template?: string; // detail only
  schema_data?: JSONSchema; // detail only
}
```

---

## Implementation

### 1. Environment Variables (`.env`)

```env
MAIE_API_URL=http://localhost:8000
MAIE_API_KEY=your_secret_api_key_here
```

### 2. MAIE Service (`src/services/maieApi.ts`)

```typescript
import axios, { AxiosError, AxiosInstance } from "axios";
import logger from "../lib/logger";

const MAIE_API_URL = process.env.MAIE_API_URL || "http://localhost:8000";
const MAIE_API_KEY = process.env.MAIE_API_KEY;

if (!MAIE_API_KEY) {
  logger.warn("MAIE_API_KEY not set - template mutations will fail");
}

const maieClient: AxiosInstance = axios.create({
  baseURL: MAIE_API_URL,
  timeout: 10000,
  headers: { "Content-Type": "application/json" },
});

const withApiKey = () => ({ headers: { "X-API-Key": MAIE_API_KEY } });

export interface CreateTemplateDTO {
  name: string;
  description: string;
  schema: Record<string, any>;
  prompt_template?: string;
  example?: Record<string, any>;
}

export type UpdateTemplateDTO = Partial<CreateTemplateDTO>;

export const maieApi = {
  listTemplates: () => maieClient.get("/v1/templates"),
  getTemplate: (id: string) => maieClient.get(`/v1/templates/${id}`),
  getTemplateSchema: (id: string) =>
    maieClient.get(`/v1/templates/${id}/schema`),
  createTemplate: (data: CreateTemplateDTO) =>
    maieClient.post("/v1/templates", data, withApiKey()),
  updateTemplate: (id: string, data: UpdateTemplateDTO) =>
    maieClient.put(`/v1/templates/${id}`, data, withApiKey()),
  deleteTemplate: (id: string) =>
    maieClient.delete(`/v1/templates/${id}`, withApiKey()),
};

export const handleMaieError = (err: unknown, defaultMsg: string) => {
  const axiosErr = err as AxiosError<{ detail?: string }>;
  logger.error(defaultMsg, {
    status: axiosErr.response?.status,
    data: axiosErr.response?.data,
  });
  return {
    status: axiosErr.response?.status || 500,
    error: axiosErr.response?.data?.detail || defaultMsg,
  };
};
```

### 3. Backend Route (`src/routes/templates.ts`)

```typescript
import { Router, Response } from "express";
import { maieApi, handleMaieError } from "../services/maieApi";
import { authenticate, requireRole, AuthRequest } from "../middleware/auth";
import { prisma } from "../lib/prisma";

const router = Router();
router.use(authenticate);

// List
router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const { data } = await maieApi.listTemplates();
    res.json({ templates: data });
  } catch (err) {
    const { status, error } = handleMaieError(err, "Failed to fetch templates");
    res.status(status).json({ error });
  }
});

// Get detail
router.get("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const { data } = await maieApi.getTemplate(req.params.id);
    res.json({ template: data });
  } catch (err) {
    const { status, error } = handleMaieError(err, "Failed to fetch template");
    res.status(status).json({ error });
  }
});

// Create (admin)
router.post(
  "/",
  requireRole("admin"),
  async (req: AuthRequest, res: Response) => {
    try {
      const { data } = await maieApi.createTemplate(req.body);
      await prisma.auditLog.create({
        data: {
          userId: req.user!.userId,
          action: "template.create",
          resource: "template",
          resourceId: data.id,
          details: { name: req.body.name },
          ipAddress: req.ip || "unknown",
          userAgent: req.headers["user-agent"] || "unknown",
        },
      });
      res.status(201).json({ template: data });
    } catch (err) {
      const { status, error } = handleMaieError(
        err,
        "Failed to create template"
      );
      res.status(status).json({ error });
    }
  }
);

// Update (admin)
router.put(
  "/:id",
  requireRole("admin"),
  async (req: AuthRequest, res: Response) => {
    try {
      const { data } = await maieApi.updateTemplate(req.params.id, req.body);
      await prisma.auditLog.create({
        data: {
          userId: req.user!.userId,
          action: "template.update",
          resource: "template",
          resourceId: req.params.id,
          ipAddress: req.ip || "unknown",
          userAgent: req.headers["user-agent"] || "unknown",
        },
      });
      res.json({ template: data });
    } catch (err) {
      const { status, error } = handleMaieError(
        err,
        "Failed to update template"
      );
      res.status(status).json({ error });
    }
  }
);

// Delete (admin)
router.delete(
  "/:id",
  requireRole("admin"),
  async (req: AuthRequest, res: Response) => {
    try {
      await maieApi.deleteTemplate(req.params.id);
      await prisma.auditLog.create({
        data: {
          userId: req.user!.userId,
          action: "template.delete",
          resource: "template",
          resourceId: req.params.id,
          ipAddress: req.ip || "unknown",
          userAgent: req.headers["user-agent"] || "unknown",
        },
      });
      res.json({ message: "Template deleted" });
    } catch (err) {
      const { status, error } = handleMaieError(
        err,
        "Failed to delete template"
      );
      res.status(status).json({ error });
    }
  }
);

export default router;
```

### 4. Database Migration

Remove from `prisma/schema.prisma`:

- `Template` model
- `UserSettings.defaultTemplateId` and `defaultTemplate` relation
- `User.templates` relation

```bash
npx prisma migrate dev --name remove_local_templates
```

### 5. Frontend Types (`client/src/lib/api.ts`)

```typescript
export interface MAIETemplate {
  id: string;
  name: string;
  description: string;
  schema_url: string;
  parameters: Record<string, any>;
  example?: Record<string, any>;
  prompt_template?: string;
  schema_data?: Record<string, any>;
}

export const templatesApi = {
  list: () => api.get<{ templates: MAIETemplate[] }>("/api/templates"),
  get: (id: string) =>
    api.get<{ template: MAIETemplate }>(`/api/templates/${id}`),
  create: (data: Partial<MAIETemplate>) =>
    api.post<{ template: MAIETemplate }>("/api/templates", data),
  update: (id: string, data: Partial<MAIETemplate>) =>
    api.put<{ template: MAIETemplate }>(`/api/templates/${id}`, data),
  delete: (id: string) => api.delete(`/api/templates/${id}`),
};
```

### 6. Frontend Page (`TemplatesPage.tsx`)

Simplify to:

- List view with name, description
- Detail modal showing schema/prompt/example
- Admin-only create/edit/delete buttons
- Remove: `ownerType` filter, "Set as Default" feature

---

## Implementation Checklist

| #   | Task                    | Files                                |
| --- | ----------------------- | ------------------------------------ |
| 1   | Add env variables       | `.env`                               |
| 2   | Create MAIE service     | `src/services/maieApi.ts`            |
| 3   | Rewrite templates route | `src/routes/templates.ts`            |
| 4   | Remove Template model   | `prisma/schema.prisma`               |
| 5   | Run migration           | `prisma migrate dev`                 |
| 6   | Update frontend types   | `client/src/lib/api.ts`              |
| 7   | Simplify TemplatesPage  | `client/src/pages/TemplatesPage.tsx` |
| 8   | Remove settings refs    | `src/routes/settings.ts`             |

**Estimated Effort: ~8 hours**

---

## Security

- MAIE API key server-side only
- Admin-only mutations
- JWT required for all routes
- Audit logging on all mutations
