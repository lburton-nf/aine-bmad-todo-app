# Epic 1 Context: Foundation — scaffold, tooling, healthcheck

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Get the repo into a state where both client and server run locally, lint and format pass with zero errors/warnings, and `GET /healthz` returns 200. After this epic, every subsequent story can assume a working environment with the test pyramid live and the server bootstrap honouring the v1 architectural invariants.

## Stories

- Story 1.1: Initialize repo and create runtime scaffolds (with tests + lint baked in) — **DONE**
- Story 1.2: Repo-root ESLint and Prettier configuration — **absorbed into 1.1**
- Story 1.3: Shared types module and design-tokens stylesheet
- Story 1.4: Server bootstrap with healthcheck and `bodyLimit`

## Requirements & Constraints

- ESLint + Prettier must pass with zero errors AND zero warnings against a recognized TypeScript-aware strict configuration. This is a non-negotiable code-quality gate from line zero.
- TypeScript strict mode in both client and server.
- The API contract is expressed as TypeScript types in `shared/types.ts` — single source of truth, imported by both client and server via relative path. No OpenAPI in v1.
- Cross-user data isolation must be enforceable at the persistence layer; the type/data shapes must keep `user_id` as a request-side concern only — never leak into response bodies.
- Server-side opaque-identifier validation: `X-User-Id` must match `/^anon-[0-9a-f-]{36}$/` exactly. Missing or malformed → `400 Bad Request`.
- Healthcheck endpoint `GET /healthz` returning `{ ok: true, version: <package-json-version> }` is required for orchestrator liveness.
- Logs must scrub `X-User-Id` values (single Pino redact rule).
- Description ≤ 280 chars; `id` is a client-minted UUID matching standard UUID regex; `completed` is boolean on the wire (stored as 0/1 in SQLite).
- No SPA fallback in v1; unmatched paths return 404.
- Request body limit enforced at the framework layer (1 KB).

## Technical Decisions

**Architectural invariants (must NOT slip in any Epic 1 story):**

- **AI-1:** `bodyLimit: 1024` is mandatory in the Fastify constructor (server/src/index.ts). Sending a >1 KB body must yield 413 Payload Too Large.
- **AI-2:** No SPA fallback in v1 — unmatched paths return 404.
- **AI-3:** PATCH/DELETE on a non-existent or non-owned `:id` returns 404 with the same Fastify default error envelope — does not distinguish "not-found" from "not-yours".

**Type sharing.** Single `shared/types.ts` consumed via relative imports (`import { Todo } from '../../shared/types';`). No workspaces, no monorepo tooling, no shared package registry, no tsconfig `paths` aliases.

**Data shape (relevant to types):**

- Persistence: SQLite columns `id TEXT PK`, `user_id TEXT NOT NULL`, `description TEXT NOT NULL`, `created_at INTEGER NOT NULL` (unix epoch ms), `completed INTEGER NOT NULL DEFAULT 0`.
- Wire shape (camelCase, public surface): `{ id, description, created_at, completed }` — `created_at` retains snake_case to match DB column for v1 simplicity per Code Map; `completed` is a boolean on the wire. **`user_id` is never in any response body.**
- API surface: 6 routes — `GET /todos`, `POST /todos` (`{ id, description }`), `PATCH /todos/:id` (`{ completed: boolean }` — only mutable field), `DELETE /todos/:id`, `DELETE /todos` (bulk delete-mine), `GET /healthz`.
- Error envelope = Fastify default: `{ statusCode, error, message }`.

**Server bootstrap shape (Story 1.4):**

- Fastify constructor with `bodyLimit: 1024` and Pino logger.
- `@fastify/cors` configured from `CORS_ORIGIN` env var; allow `X-User-Id` in `Access-Control-Allow-Headers`.
- Pino redact rule for `req.headers["x-user-id"]`.
- Env vars: `PORT` (default 3000), `DB_PATH` (default `/data/todos.db`), `CORS_ORIGIN` (required outside dev), `NODE_ENV`.
- `GET /healthz` returns `{ ok: true, version: <package-json-version> }`.

**Validation posture.** Hand-rolled at the API boundary — each handler validates its own request body inline against `shared/types.ts` shapes. No `zod` in v1.

**Imports.** Relative paths within each runtime root; cross-runtime only via `shared/types.ts`.

## UX & Interaction Patterns

**Design tokens (Story 1.3 surface, `client/src/tokens.css`):**

- **Typography.** Native system stack: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`. Three size tokens: `--font-title` (24px / 1.5rem, line-height 1.25), `--font-body` (16px / 1rem, line-height 1.5), `--font-meta` (13px / 0.8125rem, line-height 1.4). Weight 400 body, 600 title. No italics in v1.
- **Colour.** `--color-surface` `#ffffff`; `--color-text` `#111827`; `--color-text-muted` `#6b7280`; `--color-accent` `#2563eb`; `--color-error-bg` `#fef2f2`; `--color-error-text` `#991b1b`; `--color-border` `#e5e7eb`. No dark-mode tokens in v1 (named so dark-mode addition is mechanical).
- **Spacing.** 8px scale. `--space-1` 4px, `--space-2` 8px, `--space-3` 16px, `--space-4` 24px, `--space-5` 32px, `--space-6` 48px, `--space-8` 64px.
- **Layout.** Centred column, max-width 480px at desktop. Page padding `--space-6` top/bottom, `--space-3` left/right (collapses to `--space-2` < 480px).
- Tokens declared as CSS custom properties on `:root`. Components consume via `var(--color-text)` etc. — never raw values.
- Imported from `client/src/main.tsx` so tokens are present at every component (the epic story uses `main.tsx`; the UX spec mentions `App.tsx` — both work; the story's wording wins).

## Cross-Story Dependencies

- **1.3 → all later stories.** `shared/types.ts` is the contract every Epic 2 server module and every Epic 3 client module imports. Getting field names and casing right here is load-bearing.
- **1.3 → all client-UX stories (Epic 4).** Components rely on the design tokens being on `:root` from app boot.
- **1.4 → Epic 2.** All Epic 2 routes register against the Fastify instance constructed in 1.4. AI-1 (bodyLimit), AI-2 (no SPA fallback), AI-3 (404 envelope unification) start here and must be honoured by every downstream route.
- **1.4 ⇄ 2.1.** Server bootstrap in 1.4 is minimal (no DB wiring); 2.1 introduces `db.ts` and the schema-init call. Bootstrap must leave a clean seam for `db.ts` to plug into without restructuring.
