---
type: deferred-work
project: todo-app-3
date: 2026-05-08
window-end: 14:00
status: build-incomplete
---

# Deferred Work — todo-app-3

The 4-hour BMad learning-exercise window ended with **Story 1.1 complete** and Stories 1.2 through 5.4 deferred. Planning artifacts are complete and unusually thorough; the build itself ran out of clock.

## What shipped in v1 build window

- **Repo scaffolded:** `client/` (Vite + React + TypeScript), `server/` (Fastify + TypeScript), `shared/`
- **Test harness operational from line zero:** Vitest in both runtimes; smoke tests passing in both
- **Lint + format operational:** ESLint + Prettier passing with zero errors and zero warnings; `.prettierignore` properly scoped
- **Verification commands:** `npm test`, `npm run lint`, `npm run format:check`, all green from repo root

## What remains (in dev-execution order)

The acceptance criteria for each story below are already detailed in `epics.md`. The architecture and test strategy give the dev phase a complete recipe — the remaining work is executing it.

### Epic 1 — Foundation (1 story remaining)

- **Story 1.3** Shared types module (`shared/types.ts`) and design-tokens stylesheet (`client/src/tokens.css`)
- **Story 1.4** Server bootstrap with Fastify constructor (including the **`bodyLimit: 1024` invariant** AI-1), `/healthz` route, CORS config, Pino redact rule, env-var parsing module

(Story 1.2 — ESLint + Prettier setup — was absorbed into Story 1.1 per the test-harness-from-zero requirement.)

### Epic 2 — Server (5 stories)

- **Story 2.1** `server/src/db.ts` — better-sqlite3 connection, schema initialization, 5 typed query functions
- **Story 2.2** `GET /todos` route with newest-first ordering
- **Story 2.3** `POST /todos` write path; cross-user isolation invariant verified
- **Story 2.4** `PATCH`/`DELETE /todos/:id` with full validation, identity preHandler hook
- **Story 2.5** `DELETE /todos` bulk-delete-mine

### Epic 3 — Client foundation (3 stories)

- **Story 3.1** `client/src/identity.ts` — anon-{uuid} mint/persist/validate/reset
- **Story 3.2** `client/src/api.ts` — fetch wrapper with `X-User-Id`, `VITE_API_BASE_URL`, typed `ApiError`
- **Story 3.3** `App.tsx` shell with design-token-driven layout

### Epic 4 — Client UX (7 stories)

- **Story 4.1** `TodoInput` component
- **Story 4.2** `TodoList` component
- **Story 4.3** `TodoItem` with completion toggle
- **Story 4.4** `TodoItem` delete control
- **Story 4.5** Empty / Loading / Error state components
- **Story 4.6** Optimistic reducer with confirm/rollback (and `reducer.test.ts` covering every action × confirm/rollback path)
- **Story 4.7** `DeleteAllControl` with inline confirmation

### Epic 5 — Containerize, test, ship (4 stories)

- **Story 5.1** Multi-stage `Dockerfile` with healthcheck, ≤ 200 MB target, `EXPOSE 3000`
- **Story 5.2** `docker-compose.yml` with `./data:/data` volume mount
- **Story 5.3** Required integration tests passing (cross-user isolation matrix; `tests/docker.test.ts` 13-step sequence; manual optimistic-rollback drill)
- **Story 5.4** Verified `README.md` quickstart; final 8-step user-acceptance demo run

## Notes for the next session

- All planning artifacts are fully canonical and ready for the dev phase to consume. No re-planning needed.
- The dev phase's `bmad-quick-dev` workflow expects per-story specs; only `spec-1-1-init-repo-scaffolds.md` exists. Each remaining story would generate its own spec file.
- If the next session is also time-constrained, recommended order: Story 1.3 → 1.4 → 2.1 → 2.2 → 2.3 (gets the server CRUD happy path working before touching the client). Pure-server progress is independently demonstrable via `curl`.
- **Architectural invariants that must NOT slip during deferred build:**
  - AI-1: `bodyLimit: 1024` mandatory in Fastify constructor (Story 1.4)
  - AI-2: No SPA fallback in v1; unmatched paths return 404 (Story 1.4)
  - AI-3: PATCH/DELETE on non-existent or non-owned `:id` returns 404 with same envelope (Story 2.4)
- Test pyramid live from line zero (this session); each subsequent story adds tests at the documented tier per `test-strategy.md` → Test Files (canonical list).
