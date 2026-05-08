---
stepsCompleted:
  - step-01-init
  - step-02-context
  - step-03-starter
  - step-04-decisions
  - step-05-patterns
  - step-06-structure
  - step-07-validation
  - step-08-complete
status: complete
completedAt: '2026-05-08'
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/product-brief.md
  - _bmad-output/planning-artifacts/risks-and-watchlist.md
workflowType: 'architecture'
project_name: 'todo-app-3'
user_name: 'Lisaannburton'
date: '2026-05-08'
---

# Architecture Decision Document — todo-app-3

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements (PRD → Functional Requirements):** 27 FRs across 7 capability areas — Task Management (FR1–FR7), Identity & Data Scoping (FR8–FR13), Application States (FR14–FR16), Optimistic Interaction (FR17–FR19), Self-Service Data Control (FR20–FR21), Keyboard & Accessibility (FR22–FR24), Input Validation (FR25–FR27).

**Non-Functional Requirements (PRD → Non-Functional Requirements):** 12 NFRs. Three are *first-class* (architectural openness, optimistic UI contract, polish ceiling). Six are detailed in Success Criteria → Technical Success and cross-referenced (performance, security, reliability, accessibility, browser compatibility, maintainability). Three are *explicit non-requirements* for v1 (scalability, rate-limiting, integrations) — recorded so they cannot be read as gaps.

**Scale & Complexity:**

- Primary domain: full-stack web application (SPA + REST API + persistence)
- Complexity level: **medium** (per PRD classification, driven by per-user scoping seam, well-tested + Docker-deployable bar, and explicit extensibility constraint)
- v1 audience: a single user per browser; no multi-tenancy, no concurrency hot-spots, no high-throughput requirements

### Technical Constraints & Dependencies

**Stack already locked (PRD → product-brief.md → tech-stack steer):**

- Runtime: Node.js
- Server framework: Fastify (with TypeScript)
- Client framework: React (with TypeScript)
- Language: TypeScript on both client and server
- Database (v1): SQLite, with the constraint that schema and queries remain straightforward to migrate to Postgres later
- Governing principle: *boring* — mainstream, well-trodden choices

**Architecture-step razor verdicts already recorded (product-brief.md):**

- TypeScript type sharing: duplicate types or single shared `types.ts` imported by both — no workspaces / monorepo tooling
- SQLite v1: raw SQL via `better-sqlite3`; no ORM "for portability reasons"
- Frontend styling: Tailwind or CSS Modules — both honor "boring," pick one before build starts (decision pending in this workflow)
- Raw-SQL + TS strict cast surface: accepted v1 cost; runtime validation at query-result boundary is over-engineering at this scope

**Implicit anti-patterns (already declared):**

No microservices; no GraphQL (REST); no SSR framework; no Redux / Zustand / Jotai (React's built-in primitives); no heavyweight ORM with code generation.

**Deploy target:** Docker image. Multi-stage build with slim base; ≤ 200 MB target; healthcheck endpoint exposed for orchestrator liveness probes (NFR-6 + risks-and-watchlist R3, R4).

### Cross-Cutting Concerns Identified

Five concerns thread through multiple FRs and require deliberate architectural attention:

- **Per-user data scoping (FR8, FR10, FR13, NFR-1, NFR-5):** every persistence-layer function takes `user_id`; no SQL referencing the `todos` table without `WHERE user_id = ?`. The seam is also the architectural-openness load-bearing element — `user_id` is `TEXT/VARCHAR`, wide enough for future real account IDs.

- **Optimistic UI contract (FR17, FR18, NFR-2):** every mutation reverts on rejection (server error, network failure, timeout); error surfaces in the standard error state; verified by manual stop-the-backend test.

- **Frontend↔backend integration seam (NFR-1, risks R1, R2):** API base URL via env var (no hardcoding); CORS posture explicit and documented; container networking story decided before the build starts.

- **Persistence durability (FR11, FR12, NFR-6):** data persists across browser refresh and across `docker rm` + `docker run` against the same volume. Drives the SQLite-volume decision in deployment.

- **Identity transition path (NFR-1, product-brief transitional identity rule):** `anon-` prefix appears only in the ID generator and the validation regex; no business logic branches on it; no anon ID shown to the user as a stable identifier.

### What this implies for the architecture decisions ahead

Most major decisions are *pre-locked* by the PRD and brief. The architecture phase mainly:

1. **Captures locked decisions in canonical form** so the dev step has a single source of truth.
2. **Resolves the few genuinely-undecided items**: frontend styling (Tailwind vs. CSS Modules); container shape (single image vs. split FE/BE images); persistence volume strategy; healthcheck implementation.
3. **Documents the architectural seams** — explicit module boundaries, API contracts, and configuration surface — so the dev step can build without re-deriving.

This sets up an unusually short architecture phase by BMad standards, which is a deliberate consequence of the PRD's depth.

## Starter Template Evaluation

### Primary technology domain

Full-stack web application with two distinct runtime targets (browser and Node), each with its own build configuration. No single starter template covers the full stack cleanly while honouring the "boring" governor; the architecture uses **Vite for the client** and a **hand-rolled Fastify + TypeScript setup** for the server. This is the shortest path to running code that does not introduce monorepo or generator complexity.

### Why no all-in-one starter

The PRD's tech-stack steer locks Node + TypeScript + Fastify (server) and React + TypeScript (client). The candidate all-in-one starters (T3, RedwoodJS, Blitz, Next.js) bring opinions that fight the "boring" governor: Next.js implies SSR; T3 implies tRPC + Prisma; RedwoodJS implies its own opinionated stack. Each would either reintroduce complexity already razored out (ORM, monorepo) or replace already-locked stack choices.

### Project structure

The repository has three top-level source directories, with the Docker build, README, and shared lint/format configuration at the root:

```
todo-app-3/
├── client/                  # React + TS frontend (Vite-built)
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── api.ts           # fetch wrapper, env-var base URL
│       ├── identity.ts      # anon-{uuid} client-side ID management
│       └── components/      # list, item, input, error-state, empty-state
├── server/                  # Fastify + TS backend
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts         # Fastify bootstrap, route registration
│       ├── routes/          # CRUD route handlers, healthz, delete-all
│       ├── db.ts            # better-sqlite3 connection + raw-SQL queries
│       ├── identity.ts      # opaque-ID validation (length / charset)
│       └── validation.ts    # request-body validation
├── shared/
│   └── types.ts             # Todo + API request/response shapes (imported by both)
├── Dockerfile               # multi-stage: build client, build server, slim runtime
├── docker-compose.yml       # dev convenience (optional)
├── README.md                # docker build + docker run quickstart (verified)
├── .eslintrc.cjs            # extends @typescript-eslint/recommended-type-checked
├── .prettierrc
└── .gitignore
```

The `shared/types.ts` import by both client and server honours the razor verdict on TypeScript type sharing — single file, no workspaces, no monorepo tooling, no shared package registry.

### Initialization commands

Run from the repository root, in order. Versions are intentionally unpinned in this document; the dev step pulls current versions when running these commands.

```bash
# Client (React + TypeScript via Vite)
npm create vite@latest client -- --template react-ts

# Server (Fastify + TypeScript, hand-rolled)
mkdir server && cd server
npm init -y
npm install fastify @fastify/cors better-sqlite3
npm install -D typescript tsx vitest @types/node @types/better-sqlite3
npx tsc --init
cd ..

# Root: lint/format config (extended by both client/ and server/)
npm install -D eslint @typescript-eslint/parser \
  @typescript-eslint/eslint-plugin prettier
```

### Architectural decisions provided by this starter approach

**Language & runtime:**
- TypeScript on both ends, strict mode by default.
- Node ≥ 20 (current LTS) for the server runtime.
- Browser target: ES2022 baseline (matches NFR-8 browser matrix).

**Build tooling:**
- Vite for the client (dev server + production bundle).
- `tsx` for server dev mode; `tsc` produces the runtime artifact.

**Styling solution:** **CSS Modules** (Vite-native, zero additional install). Honours the razor verdict's "boring purist" path. Tailwind remains a reasonable alternative; CSS Modules wins on time-to-running and on dependency surface.

**Testing framework:** **Vitest** for both client and server. Single test framework reduces config and learning surface. HTTP tests against the Fastify instance use Fastify's `inject()` helper and run inside Vitest.

**Lint & format:** ESLint extending `@typescript-eslint/recommended-type-checked` + Prettier; configured once at the repo root and extended by both `client/` and `server/` (NFR-9 "well-tested" minima).

**Project organization:**
- Three sibling source roots (`client`, `server`, `shared`).
- Each runtime has its own `package.json` and `tsconfig.json`.
- No workspaces, no monorepo manager (pnpm/yarn workspaces explicitly rejected per the razor verdict).

### Note on initialization-as-story

Project initialization (running the commands above and committing the resulting scaffold) should be the **first implementation story** in the dev phase. The story's acceptance is "client runs via `npm run dev` in `client/`, server runs via `npm run dev` in `server/`, client successfully fetches `/healthz` from server."

## Core Architectural Decisions

### Decision priority analysis

**Already locked upstream (not re-decided here):**

- Runtime stack: Node + TypeScript + Fastify (server); React + TypeScript + Vite (client)
- Database (v1): SQLite via `better-sqlite3` with raw SQL
- Identity model: per-browser anonymous `user_id`, `TEXT/VARCHAR` column
- Type sharing: single `shared/types.ts`, no workspaces
- Styling: CSS Modules
- Testing: Vitest (both client and server)
- Lint/format: ESLint (`@typescript-eslint/recommended-type-checked`) + Prettier
- API style: REST; no GraphQL
- Deploy: Docker multi-stage image
- Anti-patterns: no SSR, no ORM, no state-management library, no monorepo, no microservices

**Critical (block v1 implementation):**

- API route shape and HTTP semantics
- Identity-carrying mechanism (cookie vs. header)
- Database schema for `todos` table
- Input validation strategy at the API boundary
- Server-side environment-variable surface
- Client-side environment-variable surface
- Error response shape
- Schema initialization / migration approach

**Important (shape v1 architecture):**

- CORS posture
- Container persistence-volume strategy
- Healthcheck endpoint shape

**Deferred (post-MVP, per PRD non-goals):**

- Authentication and authorization (Growth phase)
- Migration tooling beyond `CREATE TABLE IF NOT EXISTS` (when schema starts changing)
- Caching layer (no v1 read pressure)
- Rate limiting (NFR-11 acknowledges as v1 gap)
- Public OpenAPI spec (no v1 third-party consumers; FR-shape via `shared/types.ts`)

### Data architecture

**Schema (single table, v1):**

```sql
CREATE TABLE IF NOT EXISTS todos (
  id          TEXT    PRIMARY KEY,           -- client-generated UUID
  user_id     TEXT    NOT NULL,              -- anon-{uuid}, scopes every query
  description TEXT    NOT NULL,              -- ≤ 280 chars (FR1, FR25)
  created_at  INTEGER NOT NULL,              -- unix epoch ms; ordering only (FR7)
  completed   INTEGER NOT NULL DEFAULT 0     -- 0 or 1 (SQLite has no BOOLEAN)
);
CREATE INDEX IF NOT EXISTS todos_user_id_created_at
  ON todos (user_id, created_at DESC);
```

The composite index supports `SELECT … WHERE user_id = ? ORDER BY created_at DESC` — the only query shape used by `GET /todos`.

**Why `id` is client-generated:** the client is mid-mutation when the optimistic UI must render the new row (FR17). Round-tripping a server-generated id makes the optimistic-UI rollback (FR18, NFR-2) much harder. Client mints `crypto.randomUUID()`, server validates format and persists.

**Schema initialization:** at server startup, run the `CREATE TABLE IF NOT EXISTS …` and `CREATE INDEX IF NOT EXISTS …` statements. No migrations framework in v1 — the schema is a single file (`server/src/db.ts`) that runs idempotently on every boot. Future schema changes will introduce a real migrations approach; v1 does not need one.

**No caching layer.** Single-user-per-browser with low CRUD frequency makes any cache more complexity than benefit.

### Authentication & security

**No authentication, no authorization framework.** v1 trusts the client to send its own `user_id`; the server scopes every read/write/delete by that id and validates its format on every request (NFR-5, FR27). Cross-user isolation is enforced at the *persistence* layer via codebase invariants (NFR-1: no SQL touching `todos` without `WHERE user_id = ?`).

**Identity-carrying mechanism: custom HTTP header `X-User-Id`** (rejected: cookie).

| Aspect | `X-User-Id` header (chosen) | Cookie (rejected) |
|---|---|---|
| Client sends explicitly | Yes — fetch wrapper attaches | No — browser handles automatically |
| CORS complexity | Simpler (allow header in `Access-Control-Allow-Headers`) | More complex (`credentials: include` + `Allow-Credentials: true`) |
| Test ergonomics | Easy from any HTTP client | Harder (cookie jar needed) |
| Security implications | None at v1 (no real auth) | Slightly better cross-tab consistency, but moot for v1 |

The header form is the cleaner v1 choice and converts naturally to a `Bearer` token in the Growth phase.

**Server-side opaque-ID validation (NFR-5, FR27):** `X-User-Id` must match `/^anon-[0-9a-f-]{36}$/` exactly. Reject any request with a missing or malformed header with `400 Bad Request`.

**Encryption.** At-rest encryption is the responsibility of the deployment substrate (host filesystem / volume); not a v1 application concern. In-transit encryption is the responsibility of upstream TLS termination (reverse proxy / load balancer); the application itself speaks HTTP and is not expected to terminate TLS.

### API & communication patterns

**REST over HTTP/JSON.** Six routes total:

| Method | Path | Purpose | FR refs |
|---|---|---|---|
| `GET` | `/todos` | List the caller's todos, newest first | FR2, FR3 |
| `POST` | `/todos` | Create a new todo | FR1, FR25 |
| `PATCH` | `/todos/:id` | Toggle `completed` (only mutable field) | FR4, FR5 |
| `DELETE` | `/todos/:id` | Delete one todo | FR6 |
| `DELETE` | `/todos` | Delete every todo for the caller | FR20 |
| `GET` | `/healthz` | Liveness probe (no auth required, no body) | NFR-6 |

`PATCH /todos/:id` accepts only `{ completed: boolean }` in the body. Description and creation-time are immutable in v1.

`DELETE /todos` (the bulk-delete-all-mine endpoint) is the FR20 self-service data-control surface, callable without auth, scoped to the caller's `X-User-Id`. It must remove all rows and is verified by direct DB inspection in the integration test (PRD → Hygiene).

**Response shape — Fastify default error envelope** for errors:

```json
{ "statusCode": 400, "error": "Bad Request", "message": "X-User-Id header missing" }
```

For success responses, return raw JSON resources:

```json
// GET /todos
[ { "id": "...", "description": "...", "created_at": 1715167200000, "completed": false }, ... ]
```

`user_id` is **never** included in any response body — it is a request-side concern only.

**No OpenAPI spec in v1.** The API contract lives in `shared/types.ts` (TypeScript types imported by both client and server). When a third-party consumer becomes a real requirement (Growth phase), the OpenAPI surface gets generated from those types.

**Input validation: hand-rolled at the API boundary.** Each route handler validates its own request body inline against `shared/types.ts` shapes — body presence, field presence, types, length checks (`description` ≤ 280 chars, `id` matches UUID regex, `completed` is boolean). Adding `zod` is borderline acceptable but constitutes one more dependency for a 6-route surface; hand-rolled wins under the boring governor.

### Frontend architecture

**State management:** React's built-in `useState` + `useReducer`. No external state library. The full app state is one list of todos plus three UI-state booleans (`loading`, `error`, an optimistic-pending set). `useReducer` carries the optimistic-update / rollback logic for FR17 / FR18.

**Component architecture (initial sketch — refined in UX phase):**

- `App` — top-level container; owns the reducer
- `TodoList` — renders the list, passes events up
- `TodoItem` — single row, completion toggle, delete button
- `TodoInput` — single input with submit-on-Enter
- `EmptyState`, `LoadingState`, `ErrorState` — discrete state components

**Routing:** none. The list view is the only view (Web App Reqs → Overview).

**API client (`client/src/api.ts`):**

- `fetch` wrapper that attaches `X-User-Id` header automatically
- Reads `import.meta.env.VITE_API_BASE_URL` at startup
- Returns parsed JSON or throws a typed error
- No third-party HTTP library

**Identity management (`client/src/identity.ts`):**

- On first load, check `localStorage.getItem('todo.userId')`
- If missing or malformed (regex check), generate `anon-${crypto.randomUUID()}` and persist
- Export the value for the API client to consume
- If the server later returns an error indicating an unrecognized id (FR9), clear storage and regenerate

### Infrastructure & deployment

**Container shape: single image.** Multi-stage Dockerfile builds the client to a static `dist/`, then bundles the server into a slim runtime image that statically serves the client `dist/` from the Fastify process via `@fastify/static`. One image, one container, one port. This collapses "where does the frontend get served from?" into the simplest answer.

(Two-image / split-FE-and-BE shape rejected for v1: doubles the deploy artifact, doubles the CORS configuration, increases compose surface — none of which earns its keep at this scope.)

**Persistence volume:** SQLite file lives at `/data/todos.db` inside the container. The README quickstart mounts a host volume to `/data` for persistence (`docker run -v ./data:/data …`). FR12 (data persists across `docker rm` + `docker run`) is satisfied by the volume mount.

**Server environment variables:**

| Var | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Port the Fastify server listens on |
| `DB_PATH` | `/data/todos.db` | Path to the SQLite file (volume-backed in container) |
| `CORS_ORIGIN` | (none — required in non-development) | Allowed CORS origin for the client. In single-image deploy this is unused (same-origin). |
| `NODE_ENV` | `development` | Standard Node convention; influences logging verbosity |

**Client environment variables (Vite):**

| Var | Default | Purpose |
|---|---|---|
| `VITE_API_BASE_URL` | `""` (same-origin) | Where the client sends API requests. Empty in single-image deploy; set to `http://localhost:3000` for dev cross-origin. |

**CORS posture:** `@fastify/cors` configured to allow `CORS_ORIGIN` (single origin) and `X-User-Id` in `Access-Control-Allow-Headers`. In production single-image deploy, CORS is effectively a no-op (same-origin), but the configuration remains explicit.

**Healthcheck:** `GET /healthz` returns `200 OK` with body `{ ok: true, version: <package-json-version> }`. Dockerfile declares:

```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -fsS http://localhost:3000/healthz || exit 1
```

**Logging:** Fastify's default Pino logger. Log level `info` in production, `debug` in development. **User identifiers (`X-User-Id` values) are scrubbed from logs** — handled by a single Pino redact rule (NFR-5).

**Image size target:** ≤ 200 MB. Achieved via multi-stage build with `node:20-alpine` runtime stage (≈ 45 MB base) plus the bundled JS plus `better-sqlite3`'s prebuilt binary (≈ 5 MB).

### Decision impact analysis

**Implementation sequence:** the dev phase should follow this order so each step depends only on already-built pieces:

1. Repo scaffold + initialization commands (architecture step 3 → first dev story)
2. `shared/types.ts` + server `db.ts` (schema + minimal queries)
3. Server routes (`/healthz` first, then todos CRUD, then delete-all)
4. Client identity + api.ts (the env-var seam first)
5. Client components (states, list, item, input)
6. Optimistic-UI reducer + rollback
7. Tests (cross-user isolation; Docker-image integration; optimistic rollback manual)
8. Multi-stage Dockerfile + healthcheck
9. README quickstart, verified by following it from scratch

**Cross-component dependencies:**

- Identity model depends on schema typing (`user_id TEXT/VARCHAR`) — already locked.
- Optimistic UI depends on client-generated `id` — already decided here.
- CORS posture depends on container shape (single-image vs split) — single-image makes CORS effectively a no-op.
- Volume strategy depends on `DB_PATH` env var — already decided.
- Healthcheck depends on `/healthz` route shape — already decided.

No circular dependencies.

## Implementation Patterns & Consistency Rules

### Pattern philosophy

This project is a single-engineer build, but the patterns still earn their keep: they keep the resulting code coherent enough that a senior reviewer reads it as "one engineer wrote this carefully," not "this was assembled from three different references." All patterns favour the *boring*, *idiomatic-for-this-stack* choice over creativity.

### Naming patterns

**Database (SQL):** `snake_case`, plural table names.

- Tables: `todos`
- Columns: `id`, `user_id`, `description`, `created_at`, `completed`
- Indexes: `<table>_<columns_dasherised>` → `todos_user_id_created_at`

**TypeScript (client and server source):** `camelCase` for variables / functions, `PascalCase` for types and React components. File names match what they export — `TodoList.tsx` (component), `api.ts` (module).

**JSON over the wire:** `camelCase`. The translation between `snake_case` SQL and `camelCase` JSON happens **only** in the server's db-query module (`server/src/db.ts`). No other module performs case translation; nothing else accidentally leaks `snake_case` into the API boundary.

**HTTP headers:** standard X-prefixed custom headers. Only one in v1: `X-User-Id`.

**API paths:** plural REST nouns, lowercase, no trailing slash. `/todos`, `/todos/:id`, `/healthz`. Path params use the `:id` form (Fastify convention).

### Structure patterns

**Test files: co-located** with the source they test, using the `*.test.ts(x)` suffix (Vitest convention). No separate `__tests__/` folder, no separate `tests/` directory. Example:

```
client/src/components/TodoList.tsx
client/src/components/TodoList.test.tsx
server/src/db.ts
server/src/db.test.ts
```

**Test for cross-user isolation** lives at `server/src/routes/` adjacent to the routes themselves: `routes/todos.test.ts`. The Docker-image integration test lives at the repo root in `tests/docker.test.ts` (it is the only thing in that directory) — it must run after the container is built, not inside the source tree.

**Imports: relative paths** within each runtime root. No tsconfig `paths` aliases in v1 (premature; trivial to add later). Cross-runtime imports go through `shared/types.ts` only and use a relative path: `import { Todo } from '../../shared/types';`.

**Exports: named, never default**, except for React components used as the default export of their file (community convention; one named component per file).

**Component organization:** flat `client/src/components/`. No deep folder hierarchies in v1. If three more components arrive, group later — not now.

### Format patterns

**Dates and times:** **integer epoch milliseconds** everywhere — SQL column, JSON field, JavaScript runtime. No ISO strings. No timezone strings. The client formats for display when display is needed (v1: never, per FR7).

**Booleans:**

- TypeScript and JSON: native `true`/`false`.
- SQLite: `0` or `1` (driver-translated transparently in `db.ts`).

**Identifiers:** UUID v4, lower-case hex with dashes, generated by `crypto.randomUUID()`. The `anon-` prefix attaches only to `user_id`; todo `id`s are bare UUIDs.

**Error response shape:** Fastify's default error envelope (decided in step 4):

```json
{ "statusCode": 400, "error": "Bad Request", "message": "Description must be 1–280 characters." }
```

Server route handlers either return success JSON, or call `reply.code(N).send({...})` / throw a Fastify error object.

**Success response shape:** raw JSON resource (or array). No top-level wrapper (`{ data: ..., meta: ... }`). The shape is expressive enough for v1; wrappers add noise without earning their keep.

### Process patterns

**Loading state:** **one `loading: boolean`** in the reducer, true only during the initial todos fetch. Mutations do **not** drive `loading` — they use the optimistic-pending tracking instead. Distinct flag, distinct concept.

**Error state:** **one `error: string | null`** in the reducer. Set on any API failure. Cleared by the user (Retry / Dismiss button in `ErrorState`) or by the next successful API response.

**Optimistic-pending tracking:** a `Set<string>` of todo IDs currently mid-mutation. Used to:

- Render those rows with a subtle visual cue (per polish ceiling — kept minimal in v1)
- Identify which rows to revert on rollback

**Optimistic-update reducer actions:**

- `INIT_FETCH_BEGIN` / `INIT_FETCH_SUCCESS` / `INIT_FETCH_FAIL`
- `OPTIMISTIC_CREATE` / `OPTIMISTIC_TOGGLE` / `OPTIMISTIC_DELETE`
- `MUTATION_CONFIRM` / `MUTATION_ROLLBACK`
- `ERROR_DISMISS`

Names are `SCREAMING_SNAKE_CASE`, the standard React reducer convention.

**Logging (server):** Pino-formatted JSON. Levels: `info` for route hit + completion; `warn` for input validation rejection; `error` for unexpected exceptions. **Redacted fields:** `req.headers["x-user-id"]` (replaced with `[REDACTED]`).

**Validation timing:** at the API boundary only. Each route handler validates its own request body before calling into the data layer. Persistence-layer functions assume valid inputs and do not re-validate.

### Enforcement guidelines

**All v1 code MUST:**

- Pass ESLint (strict TS-aware config) with zero errors and zero warnings (NFR-9).
- Use `shared/types.ts` as the single source of truth for the `Todo` shape and API request/response types.
- Scope every persistence-layer function by `user_id` (NFR-1, NFR-5; enforced by code-review and the cross-user isolation integration test).
- Treat the `anon-` prefix as a private detail of identity generation and validation; no other code branches on it (NFR-1).
- Keep test files co-located with source and named `*.test.ts(x)`.
- Use named exports, except for React component file defaults.

**Pattern violations** are caught by:

- ESLint + Prettier (mechanical patterns: imports, naming where configurable, formatting).
- Type errors (`shared/types.ts` shapes enforce wire format).
- The required integration tests (cross-user isolation; Docker image).

### Examples

**Correct:**

```ts
// server/src/db.ts
export function listTodosForUser(userId: string): Todo[] {
  const rows = db.prepare(
    'SELECT id, description, created_at, completed FROM todos WHERE user_id = ? ORDER BY created_at DESC'
  ).all(userId) as Array<{
    id: string; description: string; created_at: number; completed: 0 | 1;
  }>;
  return rows.map(r => ({
    id: r.id,
    description: r.description,
    createdAt: r.created_at,
    completed: r.completed === 1,
  }));
}
```

**Anti-pattern (do not do this):**

```ts
// returns snake_case fields directly — leaks SQL shape into API
return db.prepare('SELECT * FROM todos WHERE user_id = ?').all(userId);
```

**Anti-pattern (cross-user-isolation violation):**

```ts
// no WHERE user_id = ? — all users would see this
return db.prepare('SELECT * FROM todos').all();
```

## Project Structure & Boundaries

### Complete project directory structure

```
todo-app-3/
├── README.md                      # docker quickstart, verified by following from scratch
├── Dockerfile                     # multi-stage build → slim runtime image
├── docker-compose.yml             # dev convenience: build + run + volume
├── .dockerignore
├── .gitignore
├── .eslintrc.cjs                  # extends @typescript-eslint/recommended-type-checked
├── .prettierrc
├── shared/
│   └── types.ts                   # Todo, request/response shapes — single source of truth
├── client/
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── index.html
│   └── src/
│       ├── main.tsx               # React mount point
│       ├── App.tsx                # top-level container; owns the reducer
│       ├── App.module.css
│       ├── api.ts                 # fetch wrapper; reads VITE_API_BASE_URL; attaches X-User-Id
│       ├── identity.ts            # localStorage-backed anon-{uuid} management
│       ├── reducer.ts             # optimistic-update reducer; SCREAMING_SNAKE_CASE actions
│       ├── reducer.test.ts
│       └── components/
│           ├── TodoList.tsx       # FR2, FR3, FR19
│           ├── TodoList.module.css
│           ├── TodoItem.tsx       # FR4, FR5, FR6, FR17, FR19
│           ├── TodoItem.module.css
│           ├── TodoInput.tsx      # FR1, FR17, FR23 (Enter to submit)
│           ├── TodoInput.module.css
│           ├── EmptyState.tsx     # FR14
│           ├── LoadingState.tsx   # FR15
│           ├── ErrorState.tsx     # FR16, FR18 (retry / dismiss)
│           ├── DeleteAllControl.tsx  # FR20, FR21
│           └── DeleteAllControl.module.css
├── server/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts               # Fastify bootstrap, route registration, static serving
│       ├── env.ts                 # env-var parsing with defaults
│       ├── db.ts                  # better-sqlite3; all SQL lives here; case translation
│       ├── db.test.ts
│       ├── identity.ts            # X-User-Id validation regex; opaque-ID helpers
│       ├── identity.test.ts
│       ├── validation.ts          # request-body validators (FR25, FR26, FR27)
│       ├── validation.test.ts
│       └── routes/
│           ├── healthz.ts         # GET /healthz (NFR-6)
│           ├── todos.ts           # GET/POST /todos, PATCH/DELETE /todos/:id, DELETE /todos
│           └── todos.test.ts      # cross-user isolation + happy-path tests
└── tests/
    └── docker.test.ts             # builds image, runs container, hits API end-to-end
```

The repo layout is **flat by design** — three sibling source roots (`client/`, `server/`, `shared/`), one Dockerfile, one README. No deeper nesting until the project earns it.

### Architectural boundaries

**Single-responsibility modules — each one is the *only* place its concern lives:**

| Concern | Single owner | Implication |
|---|---|---|
| SQL queries | `server/src/db.ts` | No SQL appears anywhere else in the codebase |
| Server-side identity validation | `server/src/identity.ts` | The `^anon-[0-9a-f-]{36}$` regex appears here only |
| Request-body validation | `server/src/validation.ts` | Route handlers call validators; no inline ad-hoc checks |
| Client-side identity generation/storage | `client/src/identity.ts` | The `localStorage` key `todo.userId` appears here only |
| API base URL resolution | `client/src/api.ts` | `import.meta.env.VITE_API_BASE_URL` appears here only |
| Optimistic-update / rollback logic | `client/src/reducer.ts` | Every mutation flows through this reducer; no local component state for todos |
| Env-var parsing (server) | `server/src/env.ts` | `process.env.*` access is centralized; defaults applied here |

**API boundary (single seam):** the HTTP REST surface defined in step 4. Six routes; six handler functions in `server/src/routes/`. The client knows the API only through this surface; the server knows the client only through `X-User-Id` and request bodies.

**Data boundary:** `db.ts` is the boundary. It accepts plain JS values (typed via `shared/types.ts`), hides the SQL/`snake_case` shape, and returns plain JS values in `camelCase`. No other module knows the SQL schema exists.

### Requirements → structure mapping

| Capability area (FRs) | Lives in |
|---|---|
| Task Management (FR1–FR7) | `server/src/routes/todos.ts`, `server/src/db.ts`, `client/src/components/TodoList.tsx`, `TodoItem.tsx`, `TodoInput.tsx` |
| Identity & Data Scoping (FR8–FR13) | `client/src/identity.ts`, `server/src/identity.ts`, `server/src/db.ts` (every query takes `userId`) |
| Application States (FR14–FR16) | `client/src/components/EmptyState.tsx`, `LoadingState.tsx`, `ErrorState.tsx`; reducer owns the `loading` and `error` flags |
| Optimistic Interaction (FR17–FR19) | `client/src/reducer.ts` (mutations + rollback); `TodoItem.module.css` (visual completion distinction) |
| Self-Service Data Control (FR20–FR21) | `server/src/routes/todos.ts` (`DELETE /todos`); `client/src/components/DeleteAllControl.tsx` |
| Keyboard & Accessibility (FR22–FR24) | semantic HTML in every component; focus indicators in `App.module.css` and component CSS modules |
| Input Validation (FR25–FR27) | `server/src/validation.ts` (called from `routes/todos.ts`); `server/src/identity.ts` (called from a route hook in `index.ts`) |

### Cross-cutting concerns → location

| Concern (NFR / annotation) | Lives in |
|---|---|
| NFR-1 architectural openness — `user_id` seam | `server/src/db.ts` (every function signature); `server/src/identity.ts` (validation) |
| NFR-2 optimistic UI contract | `client/src/reducer.ts` |
| NFR-3 polish ceiling | enforced via component CSS modules + semantic HTML; no central enforcement file |
| NFR-5 hygiene — log redaction | `server/src/index.ts` (Pino redact config) |
| NFR-5 hygiene — secret-free image | `Dockerfile` (no `ENV` declarations with values) |
| NFR-6 healthcheck | `server/src/routes/healthz.ts` + `Dockerfile` `HEALTHCHECK` directive |
| NFR-9 lint/format | repo-root `.eslintrc.cjs`, `.prettierrc` |

### Integration points

**Client → server:** every API call goes through `client/src/api.ts`. That single module:

1. Reads `VITE_API_BASE_URL` (env var, defaults to empty / same-origin).
2. Reads the user's `anon-{uuid}` from `client/src/identity.ts`.
3. Issues `fetch()` with `X-User-Id` header attached.
4. Returns parsed JSON or throws a typed `ApiError`.

**Server → database:** every read/write goes through `server/src/db.ts`. That single module:

1. Opens the SQLite file at `process.env.DB_PATH` on startup.
2. Runs the `CREATE TABLE / INDEX IF NOT EXISTS` schema.
3. Exposes typed functions: `listTodosForUser(userId)`, `createTodo(...)`, `updateCompleted(id, userId, completed)`, `deleteTodo(id, userId)`, `deleteAllForUser(userId)`.
4. Translates `snake_case` rows to `camelCase` `Todo` objects.

**Container → host (deploy):** the Docker container exposes one port (`PORT`, default `3000`) and one volume mount (`/data`, holding `todos.db`). Nothing else crosses the container boundary.

### Data flow (one CRUD round-trip)

User clicks "complete" on a todo →

1. `TodoItem.tsx` dispatches `OPTIMISTIC_TOGGLE { id }` to the reducer.
2. Reducer flips the row's `completed` and adds `id` to `optimisticPending`.
3. `TodoItem.tsx` calls `api.toggleCompleted(id, completed)` (from `client/src/api.ts`).
4. `api.ts` issues `PATCH /todos/${id}` with `{completed}` body and `X-User-Id` header.
5. Server `index.ts` runs the request hook validating `X-User-Id` against the regex.
6. `routes/todos.ts` handler validates the body, calls `db.updateCompleted(id, userId, completed)`.
7. `db.ts` runs `UPDATE todos SET completed = ? WHERE id = ? AND user_id = ?`, returns the updated row.
8. Server returns 200 with the updated `Todo` JSON.
9. `api.ts` resolves; `TodoItem.tsx` dispatches `MUTATION_CONFIRM { id }`.
10. Reducer removes `id` from `optimisticPending`. Done.

If step 7+ fails, step 9 dispatches `MUTATION_ROLLBACK { id, reason }` instead, and the reducer reverts the optimistic toggle and sets `error`.

### Build and deployment structure

**Dev mode:**

- `cd server && npm run dev` (tsx watches; serves API on `localhost:3000`).
- `cd client && npm run dev` (Vite serves on `localhost:5173`, proxies to API via `VITE_API_BASE_URL=http://localhost:3000`).

**Production build:**

- Multi-stage Dockerfile. Stage 1 builds client (`vite build` → `client/dist/`). Stage 2 builds server (`tsc` → `server/dist/`). Stage 3 (`node:20-alpine`) copies both, installs only production deps, runs `node server/dist/index.js`. The server's static-file middleware serves `client/dist/` at `/` and routes `/todos`, `/healthz` directly.

- The single resulting image runs anywhere with Docker. Volume mount `./data:/data` for persistence.

## Architecture Validation Results

### Coherence Validation ✅

**Decision compatibility.** All technology choices compose cleanly: Node + Fastify + better-sqlite3 + Vite + React + TypeScript is a mainstream, well-trodden stack. No version conflicts (versions intentionally unpinned in this document — dev phase pulls current). Patterns (snake_case SQL, camelCase TS/JSON, single-translation in `db.ts`) align with the chosen stack.

**Pattern consistency.** Naming, structure, and format patterns are internally consistent and align with stack conventions.

**Structure alignment.** Three sibling source roots (`client/`, `server/`, `shared/`) match the runtime split. Single-image deploy collapses CORS into a no-op. Boundaries (one-place-per-concern table) are observed by the file plan in step 6.

### Requirements Coverage Validation ✅

**Functional requirements (FR1–FR27):** every FR has an architectural home (Step 6 → Requirements → structure mapping). Spot-checked explicitly for the load-bearing capabilities — task CRUD, identity seam, optimistic rollback, state coverage, delete-all UI surface, keyboard accessibility, input validation. All accounted for.

**Non-functional requirements (NFR-1–NFR-12):** every NFR has either an architectural mechanism (NFR-1, NFR-2, NFR-5, NFR-6, NFR-7, NFR-8, NFR-9) or an explicit non-requirement statement (NFR-10, NFR-11, NFR-12). NFR-3 (polish ceiling) is enforced via CSS-module-per-component plus the state components, with no central enforcement file — this is deliberate (CSS module ownership IS the enforcement).

**Specifically verified:** FR13 (cross-user isolation) is enforced at *persistence-layer signature* + *integration test* + *codebase invariant rule* (three independent enforcement points). FR12 (container-restart persistence) is enforced at *volume mount* + *Docker integration test*.

### Implementation Readiness Validation ✅

**Decision completeness.** All decisions blocking implementation are documented: API routes, identity mechanism, schema, validation, env vars, error shape, schema initialization. Versions are deliberately unpinned; the dev phase resolves current versions.

**Structure completeness.** Every file in the v1 codebase is named in Step 6's tree, with comments indicating which FRs/NFRs it implements.

**Pattern completeness.** Naming, structure, format, process, and enforcement patterns are documented with concrete examples and anti-patterns.

### Gap Analysis

Three gaps surfaced during validation. **Resolved inline below** — the v1 architecture is updated to address them.

#### Gap 1 (Critical): Fastify default body-limit overrides FR26

**Issue.** FR26 requires the server to reject payloads exceeding 1 KB. Fastify's default `bodyLimit` is **1 MB**, three orders of magnitude looser than the FR requires. Without explicit override, FR26 fails silently.

**Resolution.** The Fastify constructor in `server/src/index.ts` **must** include:

```ts
const app = Fastify({ bodyLimit: 1024, logger: { /* ... */ } });
```

This is now an architectural requirement, not an implementation detail. Adding to the invariants list.

#### Gap 2 (Important): Static-serve fallback behaviour undefined

**Issue.** In production single-image deploy, Fastify serves `client/dist/` via `@fastify/static`. The architecture does not specify what happens when a request targets a path that is neither an API route nor a static asset. The default behaviour is a 404, which is correct for v1 (no client-side routing exists yet) but should be explicit.

**Resolution.** The static-file serving rule for v1:

- API routes (registered first in `server/src/index.ts`) take precedence.
- `@fastify/static` serves files matching `client/dist/**`.
- Any other path returns `404 Not Found` (Fastify's default).
- *No SPA fallback to `index.html`* in v1 — there is no client-side routing, so this would mask real 404s rather than enable anything.
- When client-side routing is added (Vision phase), the SPA fallback becomes a one-line config change.

#### Gap 3 (Important): PATCH/DELETE on a non-existent todo

**Issue.** What does the server return when a PATCH or DELETE targets a `:id` that doesn't exist (or belongs to another user)?

**Resolution.** Both return **`404 Not Found`** with the standard error envelope, regardless of the cause (not-found vs. not-yours-not-mine). The not-yours case must look identical to the not-found case to satisfy NFR-5 cross-user isolation — leaking "this id exists but isn't yours" reveals the existence of another user's data.

This is now an FR13/NFR-5 hardening point captured architecturally.

#### Minor: Content Security Policy headers

Not addressed in v1. CSP is a polish/security enhancement that a real production deploy would set; for v1 (single-image, no third-party scripts, no inline scripts beyond Vite's bundled output) the absence of CSP is acceptable but worth noting as a Growth-phase addition.

### Architecture Completeness Checklist

**Requirements Analysis**

- [x] Project context thoroughly analyzed
- [x] Scale and complexity assessed
- [x] Technical constraints identified
- [x] Cross-cutting concerns mapped

**Architectural Decisions**

- [x] Critical decisions documented with versions (versions intentionally unpinned; dev phase resolves)
- [x] Technology stack fully specified
- [x] Integration patterns defined
- [x] Performance considerations addressed

**Implementation Patterns**

- [x] Naming conventions established
- [x] Structure patterns defined
- [x] Communication patterns specified
- [x] Process patterns documented

**Project Structure**

- [x] Complete directory structure defined
- [x] Component boundaries established
- [x] Integration points mapped
- [x] Requirements to structure mapping complete

### Architecture Readiness Assessment

**Overall Status:** **READY FOR IMPLEMENTATION**

All 16 checklist items confirmed. The three gaps surfaced during validation are resolved inline above and folded back into the architecture invariants below.

**Confidence Level:** **High.** The PRD's depth meant most decisions were pre-locked; this architecture phase mainly canonicalized them and surfaced three legitimate v1 hardening points.

**Key strengths:**

- Single seam per concern (db.ts, validation.ts, identity.ts, api.ts, reducer.ts) makes the codebase auditable and the cross-user isolation test trivial to write.
- Unified Vitest stack across client and server reduces config surface.
- Single-image deploy collapses CORS, container networking, and base-URL configuration into trivial cases without sacrificing the architectural-openness NFR.
- Every FR and NFR maps to a named file or invariant; no orphaned requirements.
- Architectural-openness interpretation rule is concrete (≤ 5 min, no v1 complexity), preventing over-engineering during the build.

**Areas for future enhancement (Growth-phase):**

- Real authentication; multi-user identity; cross-device sync.
- SPA fallback for client-side routing when added.
- CSP headers; rate limiting; observability beyond Pino logs.
- Migrations framework when the schema starts changing meaningfully.
- Consider Postgres swap-in when scale or operational requirements emerge.

### Updated invariants (post-validation)

The following are added to the architecture's invariant list as a result of the gap analysis above:

1. **`bodyLimit: 1024` is mandatory** in the Fastify constructor (server/src/index.ts) to enforce FR26.
2. **No SPA fallback in v1** — unmatched paths return 404. SPA fallback config is a one-line change deferred to client-side routing introduction.
3. **PATCH and DELETE on non-existent or non-owned `:id` return 404 with identical error envelope** — does not distinguish "not-found" from "not-yours" (NFR-5 cross-user-isolation hardening).

### Implementation Handoff

**AI Agent Guidelines for the Dev Phase:**

- Follow architectural decisions exactly as documented.
- Use implementation patterns consistently across all components.
- Respect single-owner module boundaries.
- Refer to this document for all architectural questions; refer to the PRD for capability questions.

**First implementation priority:**

```bash
# Run from repo root
npm create vite@latest client -- --template react-ts
mkdir server && cd server
npm init -y
npm install fastify @fastify/cors @fastify/static better-sqlite3
npm install -D typescript tsx vitest @types/node @types/better-sqlite3
npx tsc --init
cd ..
```

Acceptance for the first dev story is "client runs via `npm run dev` in `client/`, server runs via `npm run dev` in `server/`, client successfully fetches `/healthz` from server, ESLint and Prettier configured at root and passing."
