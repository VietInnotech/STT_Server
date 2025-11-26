# AGENTS – UNV AI REPORT SERVER V2

This file defines how AI coding assistants (ChatGPT, Copilot, Codeium, etc.) should work in this repository.
It applies to the entire repo unless a more specific `AGENTS.md` is added in a subdirectory.

If you are an agent: read this file before making changes.

---

## 1. Tech Stack & Entry Points

- Backend runtime: `bun` (TypeScript, ESM).
- Web server: Express 5 (`index.ts`, routes in `src/routes`).
- Realtime: Socket.IO (`src/lib/socketBus.ts`, configured in `index.ts`).
- Database: Prisma + SQLite (`prisma/schema.prisma`, `dev.db` for local dev).
- Frontend: React + Vite + TypeScript (`client/`).
- Styling: TailwindCSS, utility-first, with small custom CSS in `client/src/index.css`.

Key entry files:

- Backend: `index.ts`, `src/routes/*.ts`, `src/middleware/*.ts`, `src/services/*.ts`.
- Frontend: `client/src/App.tsx`, `client/src/pages/*.tsx`, `client/src/components/*.tsx`.
- DB schema: `prisma/schema.prisma`.
- Swagger config: `src/config/swagger.ts`.
- Logging: `src/lib/logger.ts`.

---

## 2. General Rules for Agents

- Keep changes **focused and minimal** to the user’s request; avoid drive‑by refactors.
- Prefer **improving existing structures** (routes, services, utils) instead of introducing new patterns.
- Follow these design principles in this order of priority:
  - **YAGNI** – do not add features, abstractions, or configuration until they are explicitly needed.
  - **KISS** – prefer the simplest working solution that fits existing patterns.
  - **SOLID** – when introducing new modules/classes, keep responsibilities focused, use clear interfaces, and depend on abstractions rather than concrete implementations.
- Use **TypeScript strictly**; avoid `any` unless absolutely necessary and localized.
- Prefer **async/await** over promise chains.
- Use `logger` from `src/lib/logger.ts` instead of `console.log`.
- Use existing helpers for:
  - Auth: `src/middleware/auth.ts`, `src/utils/jwt.ts`.
  - Encryption: `src/utils/encryption.ts`.
  - 2FA & trusted devices: `src/utils/totp.ts`.
  - Sockets: `src/lib/socketBus.ts`.
- Do not introduce new external dependencies without explicit need and a short justification in the PR/description.

---

## 3. Backend Conventions (`src/**`, `index.ts`)

Routing and middleware:

- New endpoints belong in `src/routes/*.ts`, exported as a default `Router`.
- Prefer composing small handlers and helpers over very long route functions.
- Authenticated routes must:
  - Use `authenticate` from `src/middleware/auth.ts`.
  - Use RBAC helpers (`requireRole`, etc.) where appropriate.
- All API endpoints should:
  - Respect rate limiting via `apiLimiter`, `authLimiter`, or `uploadLimiter` from `src/middleware/rateLimiter.ts`.
  - Return JSON with clear `error` messages on failure.

Database and Prisma:

- Edit `prisma/schema.prisma` for schema changes; keep naming consistent with existing models.
- Use Prisma relations instead of ad‑hoc foreign key fields where possible.
- After schema changes, run:
  - `bun run db:migrate` for dev migrations.
  - `bun run db:generate` to regenerate the client.
- Do not hand‑edit migration SQL unless you know exactly why; prefer generated migrations.

Audit logging and security:

- Any meaningful user‑visible or admin action should create an `AuditLog` record using the patterns in `src/routes/auth.ts` (e.g., `safeAudit`) or existing route handlers.
- Preserve or strengthen existing security checks:
  - JWT validation and session enforcement.
  - 2FA and trusted device handling.
  - Rate limiting and IP checks.
- Do not weaken authentication, authorization, encryption, or logging just to “make tests pass” or simplify development.

Swagger and documentation:

- When you add or change endpoints, update `src/config/swagger.ts` so API docs stay in sync.
- Keep request/response schemas aligned with actual runtime behavior.

Sockets:

- Use helpers from `src/lib/socketBus.ts` to emit or manage Socket.IO events instead of accessing the `io` instance directly in many places.

---

## 4. Frontend Conventions (`client/**`)

Structure:

- Keep routing centralized in `client/src/App.tsx`.
- Pages belong in `client/src/pages`; shared components in `client/src/components`.
- State:
  - Use existing Zustand stores in `client/src/stores` for global state (auth, socket, etc.).
  - Avoid introducing alternate global state libraries.

Styling and UX:

- Use Tailwind utility classes as seen in existing components.
- Keep UI consistent with existing pages (forms, tables, buttons).
- Use `react-hot-toast` for transient feedback instead of `alert`/`console.log`.

API usage:

- Centralize HTTP calls in `client/src/lib/api.ts` (or existing API helpers) rather than scattering `axios` calls inline across components.
- When new backend endpoints are added:
  - Add typed client functions and response types.
  - Handle error cases gracefully (toasts / inline messages).

---

## 5. Running, Testing, and Validation

Dependencies:

- From repo root: `bun install`.
- Frontend: `cd client && bun install`.

Development:

- Backend dev server: `bun run dev:server` (or `bun run index.ts`).
- Frontend dev server: `cd client && bun run dev`.
- Production build:
  - `bun run build:client`
  - `bun run start`

Database:

- Local DB is SQLite using `dev.db`. Do not commit new database files with real data.
- Use `bun run db:migrate` and `bun run db:generate` to evolve the schema.

Manual feature testing:

- Prefer using existing scripts and docs:
  - `test-quick.sh` and `test-pairs.sh` for the dual text file comparison feature.
  - `CURL_COMMANDS.md`, `API_EXAMPLES.md`, and `TEST_TEXT_PAIR_API.md` (if present) for curl/API flows.

Automated tests:

- There is currently no established test suite for application code.
- If you add tests, follow a co‑located pattern such as `src/routes/__tests__/*.test.ts` and use Bun’s test runner.
- Keep test setup light and avoid introducing complex test frameworks without need.

---

## 6. Documentation Expectations

This repository is documentation‑heavy; keep docs in sync with code.

- For overall system architecture and directory layout, read `docs/architecture.md`.
- For API contracts (including the dual text file comparison feature), read `docs/api.md`.
- When you change behavior, update or annotate:
  - The most relevant docs under `docs/` (typically `docs/api.md` and/or `docs/architecture.md`).
  - `README.md` or `README_FEATURE.txt` if the user‑facing behavior or feature set changes.
  - Swagger configuration (`src/config/swagger.ts`), if API shape changes.
- Prefer updating existing docs instead of creating many new small files, unless there is a clear new topic.

---

## 7. Things to Avoid

- Large refactors that span many files unless explicitly requested.
- Changing API response shapes, URL paths, or auth requirements without explicit approval and doc updates.
- Introducing non‑deterministic behavior that makes manual scripts (e.g., `test-quick.sh`) unreliable.
- Implementing speculative features, abstractions, or configuration that are not currently required (YAGNI).
- Bypassing or inlining encryption/JWT logic instead of using existing helpers.
- Modifying logging to reduce signal (for example, removing audit logs) without replacing them with an equivalent or better mechanism.

---

## 8. Recommended Agent Workflow

1. Read this `AGENTS.md` and, for feature work, the relevant design docs under `docs/` plus `README_FEATURE.txt` when working on the dual text file comparison feature.
2. Clarify the user’s goal and constraints; avoid making hidden assumptions.
3. Sketch a short, ordered plan before implementing non‑trivial changes.
4. Implement small, focused diffs that respect existing patterns and utilities.
5. Where possible, run the minimal relevant scripts/tests (e.g., `bun run dev:server` and `./test-quick.sh`) to validate behavior.
6. Summarize what changed, any trade‑offs, and follow‑up TODOs in your final response or PR description.
