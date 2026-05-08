---
stepsCompleted:
  - step-01-validate-prerequisites
  - step-02-design-epics
  - step-03-create-stories
  - step-04-final-validation
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/ux-design-specification.md
  - _bmad-output/planning-artifacts/product-brief.md
  - _bmad-output/planning-artifacts/risks-and-watchlist.md
workflowType: 'epics-and-stories'
project_name: 'todo-app-3'
status: complete
completedAt: '2026-05-08'
---

# todo-app-3 — Epic Breakdown

## Overview

This document decomposes the PRD's 27 functional requirements, the architecture's 9-step implementation sequence, and the UX design's component plan into **5 epics and 21 stories** ready for the dev phase to implement.

The epic ordering matches the architecture's implementation sequence: each epic depends only on epics already completed. Stories within an epic are likewise ordered for in-epic dependency.

## Requirements Inventory

### Functional Requirements

All 27 FRs from `prd.md` are in scope for v1. See PRD → Functional Requirements for full text.

### Non-Functional Requirements

All 12 NFRs from `prd.md` are in scope (3 first-class with explicit obligations; 6 detailed in Technical Success and cross-referenced; 3 explicit non-requirements). See PRD → Non-Functional Requirements.

### Architecture invariants (post-validation)

Three additional invariants from `architecture.md` → Updated invariants are in scope for v1:

- **AI-1:** `bodyLimit: 1024` mandatory in Fastify constructor (enforces FR26).
- **AI-2:** No SPA fallback in v1; unmatched paths return 404.
- **AI-3:** PATCH/DELETE on non-existent or non-owned `:id` return 404 with the same envelope as a real not-found (NFR-5 hardening; does not leak existence of other users' data).

### UX Design Requirements

UX requirements from `ux-design-specification.md` are folded into the relevant epics — primarily Epic 4 (client UX) and Epic 5 (containerize & ship for the README + verified-quickstart).

### FR Coverage Map

| FR | Story | Epic |
|---|---|---|
| FR1 (create todo, ≤280 chars) | 4.1 | 4 |
| FR2 (newest-first ordering) | 2.2 | 2 |
| FR3 (view list) | 4.2 | 4 |
| FR4 (mark complete) | 4.3 | 4 |
| FR5 (toggle back to incomplete) | 4.3 | 4 |
| FR6 (single-action delete, no confirm) | 4.4 | 4 |
| FR7 (system stores fields; ts not displayed) | 2.1, 2.2 | 2 |
| FR8 (anonymous identifier in browser) | 3.1 | 3 |
| FR9 (missing-id behavior) | 3.1, 2.4 | 2, 3 |
| FR10 (associate todo with creator) | 2.3, 2.4 | 2 |
| FR11 (refresh persistence) | 2.3, 5.4 | 2, 5 |
| FR12 (container restart persistence) | 5.1, 5.3 | 5 |
| FR13 (cross-user isolation) | 2.3, 2.4, 5.3 | 2, 5 |
| FR14 (empty state) | 4.5 | 4 |
| FR15 (loading state) | 4.5 | 4 |
| FR16 (error state) | 4.5, 4.6 | 4 |
| FR17 (immediate optimistic UI) | 4.6 | 4 |
| FR18 (rollback on rejection) | 4.6 | 4 |
| FR19 (visual completion distinction) | 4.3 | 4 |
| FR20 (delete-all without auth) | 2.5, 4.7 | 2, 4 |
| FR21 (delete-all UI-discoverable) | 4.7 | 4 |
| FR22 (Tab keyboard nav) | 4.2, 4.3, 4.4, 4.7 | 4 |
| FR23 (Enter / Space) | 4.1, 4.3 | 4 |
| FR24 (visible focus indicator) | 1.3 (tokens) + 4.x | 1, 4 |
| FR25 (reject empty/whitespace/>280) | 2.4 | 2 |
| FR26 (reject >1KB payload) | 1.4 (server bootstrap) + 2.4 | 1, 2 |
| FR27 (validate user_id format) | 2.4 | 2 |

| NFR | Story |
|---|---|
| NFR-1 architectural openness | enforced across all epics; verified in 5.3 |
| NFR-2 optimistic UI contract | 4.6 |
| NFR-3 polish ceiling | 4.5 + all visual stories |
| NFR-4 performance targets | 5.3 (verification) |
| NFR-5 hygiene | 1.4, 2.4, 5.1, 5.2 |
| NFR-6 reliability + healthcheck | 1.4, 5.1 |
| NFR-7 accessibility floor | 4.2, 4.3, 4.4 |
| NFR-8 browser compatibility | 1.1 (Vite target) |
| NFR-9 maintainability + lint | 1.2, 5.4 |

## Epic List

| Epic | Name | FRs/NFRs | Story count |
|---|---|---|---|
| 1 | Foundation: scaffold, tooling, healthcheck | NFR-9, FR26 setup | 4 |
| 2 | Server: persistence, REST API, validation | FR1–FR2 (read), FR7–FR13, FR20, FR25–FR27 | 5 |
| 3 | Client foundation: identity, API client, app shell | FR8, FR9 | 3 |
| 4 | Client UX: components, states, optimistic reducer | FR1, FR3–FR6, FR14–FR19, FR21–FR24 | 7 |
| 5 | Containerize, test, ship | FR11–FR13, NFR-4, NFR-6, NFR-9 | 4 |

Total: **21 stories**.

---

## Epic 1: Foundation — scaffold, tooling, healthcheck

**Goal:** Get the repo into a state where both client and server run locally, ESLint and Prettier pass, and `GET /healthz` returns 200. After this epic, every subsequent story can assume a working environment.

### Story 1.1: Initialize repo and create runtime scaffolds

As a developer,
I want both client and server projects scaffolded according to the architecture-step initialization commands,
So that I have a known-good starting point that compiles and runs.

**Acceptance Criteria:**

**Given** the architecture-step initialization commands (`npm create vite@latest client -- --template react-ts`, `mkdir server && cd server && npm init -y && npm install fastify @fastify/cors @fastify/static better-sqlite3 && npm install -D typescript tsx vitest @types/node @types/better-sqlite3 && npx tsc --init`)
**When** the developer runs them from a clean repo root
**Then** the directory structure matches the tree in `architecture.md` → Project structure
**And** `cd client && npm run dev` starts the Vite dev server on port 5173
**And** `cd server && npm run dev` starts the Fastify dev server on port 3000 (via `tsx`)
**And** both projects' `package.json` files commit to the repo

### Story 1.2: Repo-root ESLint and Prettier configuration

As a developer,
I want a single ESLint + Prettier configuration at the repo root that both client and server extend,
So that NFR-9's "zero errors and zero warnings, against a recognized strict config" gate is enforceable from day one.

**Acceptance Criteria:**

**Given** the repo with both runtimes scaffolded
**When** the developer creates `.eslintrc.cjs` extending `@typescript-eslint/recommended-type-checked`, `.prettierrc` with project conventions, and `npm install -D eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin prettier` at the root
**Then** `npx eslint .` from the repo root completes with zero errors and zero warnings on the freshly-scaffolded code
**And** `npx prettier --check .` exits 0
**And** the configurations are extended (not duplicated) by `client/` and `server/`

### Story 1.3: Shared types module and design-tokens stylesheet

As a developer,
I want `shared/types.ts` defining the canonical `Todo` and API request/response types, and `client/src/tokens.css` defining the design tokens,
So that both runtimes import from a single source of truth and the UX design system is parameterised.

**Acceptance Criteria:**

**Given** the scaffolded repo
**When** the developer adds `shared/types.ts` with the `Todo` interface and request/response types from architecture step 4 + adds `client/src/tokens.css` with the typography, colour, and spacing tokens from `ux-design-specification.md` → Design system
**Then** both `client/src/api.ts` (next epic) and `server/src/db.ts` (next epic) can import `Todo` via relative path
**And** `client/src/main.tsx` imports `tokens.css` so the tokens are present at every component
**And** ESLint passes

### Story 1.4: Server bootstrap with healthcheck and `bodyLimit`

As a developer,
I want a minimal `server/src/index.ts` that boots Fastify with the architecture invariants and exposes `GET /healthz`,
So that downstream stories can register routes without redoing bootstrap, and the FR26 + NFR-6 obligations are met from the start.

**Acceptance Criteria:**

**Given** the scaffolded server project
**When** the developer writes `server/src/index.ts` that constructs Fastify with `bodyLimit: 1024` (architecture invariant AI-1) and registers `GET /healthz` returning `{ ok: true, version: <package-json-version> }`
**And** registers `@fastify/cors` with `CORS_ORIGIN` env-var configuration
**And** configures Pino logger with the `req.headers["x-user-id"]` redact rule (NFR-5)
**Then** `npm run dev` starts the server, and `curl http://localhost:3000/healthz` returns `{ "ok": true, "version": "..." }`
**And** sending a 2 KB body to any route returns 413 Payload Too Large (FR26 verified at the framework layer)
**And** ESLint passes on the file

---

## Epic 2: Server — persistence, REST API, validation

**Goal:** All six API routes implemented, every persistence-layer function scoped by `user_id`, every input validated, no SQL outside `db.ts`, no `anon-` prefix logic outside `identity.ts`. After this epic, the server is feature-complete and unit-tested.

### Story 2.1: Database module with schema initialization

As a developer,
I want `server/src/db.ts` to open the SQLite database, run the schema-initialization SQL idempotently on boot, and expose typed query functions,
So that the server starts cleanly on a fresh volume and every read/write goes through one canonical module.

**Acceptance Criteria:**

**Given** an empty SQLite file at the path resolved from `DB_PATH` (architecture invariant — env-var-driven, defaults to `/data/todos.db`)
**When** the server boots and calls the db-module's `initialize(dbPath)` function
**Then** the `todos` table is created with the schema from `architecture.md` → Data architecture (`id TEXT PRIMARY KEY`, `user_id TEXT NOT NULL`, `description TEXT NOT NULL`, `created_at INTEGER NOT NULL`, `completed INTEGER NOT NULL DEFAULT 0`)
**And** the composite index `todos_user_id_created_at` is created
**And** running `initialize()` a second time with an existing DB does not error or modify data
**And** the module exports five typed functions: `listTodosForUser`, `createTodo`, `updateCompleted`, `deleteTodo`, `deleteAllForUser`, all taking `userId` as a required argument

### Story 2.2: Read path — `GET /todos` with newest-first ordering

As a user (via the API),
I want to retrieve my todos in reverse-chronological order,
So that recently-added items appear at the top of my list.

**Acceptance Criteria:**

**Given** a user with three todos created at known timestamps
**When** the client calls `GET /todos` with their `X-User-Id` header
**Then** the response is `200 OK` with a JSON array of three `Todo` objects
**And** the array is ordered by `createdAt` descending (newest first)
**And** every object has `id`, `description`, `createdAt`, `completed` (camelCase per architecture patterns)
**And** no object contains `user_id` (architecture: `user_id` never in response body)
**And** a request with no `X-User-Id` returns 400 Bad Request

### Story 2.3: Write path — `POST` and cross-user isolation invariant

As a user (via the API),
I want to create a todo,
So that the server persists it scoped to my anonymous identity.

**Acceptance Criteria:**

**Given** a valid `POST /todos` body `{ "id": "<uuid>", "description": "Buy milk" }` with a valid `X-User-Id` header
**When** the client issues the request
**Then** the response is `201 Created` with the persisted `Todo` JSON (camelCase)
**And** querying the database directly shows one row in `todos` with the supplied `id`, `user_id` matching the header, and `created_at` set to the server's wall-clock millis
**And** `completed` defaults to `false` in the response
**And** issuing the *same* request with a different `X-User-Id` produces a separate row visible only to that user
**And** issuing `GET /todos` with the *first* user's header returns only the first user's todos (cross-user isolation, FR13)

### Story 2.4: Mutate and delete paths with full validation and identity hook

As a user (via the API),
I want to toggle completion, delete a single todo, and have the server reject malformed input,
So that v1's mutation surface is complete, validated, and safe.

**Acceptance Criteria:**

**Given** the server has a registered global `preHandler` hook that validates `X-User-Id` against `/^anon-[0-9a-f-]{36}$/`
**When** any non-`/healthz` route receives a request with a missing or malformed `X-User-Id`
**Then** the response is 400 Bad Request with the standard error envelope before the route handler runs

**Given** a user with todo `T` (id `T-id`, theirs)
**When** the user issues `PATCH /todos/T-id` with `{ "completed": true }`
**Then** the response is `200 OK` with the updated `Todo` showing `completed: true`
**And** the database row reflects `completed = 1`

**Given** another user (different `X-User-Id`) tries `PATCH /todos/T-id` or `DELETE /todos/T-id`
**Then** the response is 404 Not Found with the standard error envelope (architecture invariant AI-3 — same response as a real not-found, no leak)
**And** the row is unchanged

**Given** a request body with `description` empty, whitespace-only, or > 280 characters
**Then** the response is 400 Bad Request with a clear error message (FR25)

**Given** a request body where `id` is missing, malformed, or a duplicate
**Then** the response is 400 Bad Request

**Given** a request with no body where one is required (POST, PATCH)
**Then** the response is 400 Bad Request

### Story 2.5: Bulk-delete-all-mine endpoint

As a user (via the API),
I want a single endpoint that erases everything I've created,
So that FR20's self-service data control is API-callable without authentication.

**Acceptance Criteria:**

**Given** a user with five todos and another user with three
**When** the first user issues `DELETE /todos` with their `X-User-Id` header
**Then** the response is `200 OK` (or `204 No Content`) with no body or `{ "deleted": 5 }`
**And** querying the database directly shows zero rows for that `user_id` and three rows still present for the other user
**And** subsequent `GET /todos` with the first user's header returns an empty array `[]`

---

## Epic 3: Client foundation — identity, API client, app shell

**Goal:** The client knows who it is (anon-{uuid}) and can talk to the server. After this epic, an empty React shell renders, the dev mode round-trips a healthcheck, and the identity persists across reloads.

### Story 3.1: Identity module with localStorage persistence

As the client app,
I want a single module that mints, stores, validates, and exposes the user's anonymous identifier,
So that every request can attach `X-User-Id` and the identity persists across reloads (FR8) and recovers from corruption (FR9).

**Acceptance Criteria:**

**Given** a fresh browser with no `localStorage`
**When** `client/src/identity.ts` is initialised
**Then** it generates `anon-${crypto.randomUUID()}`, persists to `localStorage` under key `todo.userId`, and returns the value

**Given** a browser whose `localStorage` already contains a valid `todo.userId`
**When** `identity.ts` is initialised
**Then** it returns the stored value without minting a new one

**Given** a browser whose `localStorage` contains a malformed `todo.userId` (does not match `^anon-[0-9a-f-]{36}$`)
**When** `identity.ts` is initialised
**Then** it discards the malformed value, mints a fresh one, persists, and returns

**Given** the server later returns 400 Bad Request indicating an unrecognized `X-User-Id`
**When** the client's API wrapper calls `identity.reset()`
**Then** the stored value is cleared and a fresh `anon-{uuid}` is minted

### Story 3.2: API client with env-var base URL and `X-User-Id` injection

As the client app,
I want a single fetch wrapper at `client/src/api.ts` that knows the server's base URL, attaches `X-User-Id` automatically, and surfaces errors as typed exceptions,
So that no other module needs to know about HTTP, headers, or environment variables.

**Acceptance Criteria:**

**Given** `import.meta.env.VITE_API_BASE_URL` set to `http://localhost:3000` (dev) or `""` (production same-origin)
**When** any consumer calls one of api.ts's exported functions (`listTodos`, `createTodo`, `toggleCompleted`, `deleteTodo`, `deleteAll`, `health`)
**Then** the wrapper issues `fetch()` to `${VITE_API_BASE_URL}${path}` with the `X-User-Id` header from `identity.ts` attached
**And** the body is JSON-stringified for non-GET requests with `Content-Type: application/json`
**And** on a 2xx response, returns the parsed JSON typed against `shared/types.ts`
**And** on a non-2xx, non-network-error response, throws a typed `ApiError` containing `status`, `message`, and a `category` of `'server' | 'network' | 'timeout'`
**And** on a network failure or timeout, throws an `ApiError` with the appropriate `category`

### Story 3.3: App shell rendering the design tokens

As the client app,
I want `App.tsx` to render the centred-column layout with title, input slot, list slot, and erase-link slot per the UX spec,
So that subsequent UX stories can fill in the components without restructuring layout.

**Acceptance Criteria:**

**Given** the design tokens loaded via `tokens.css`
**When** `App.tsx` mounts
**Then** the page shows the title "Todos" in the configured typography
**And** the centred column max-width is 480 px at >= 480 px viewports, with full-bleed layout below
**And** the page background is `--color-surface` and text colour `--color-text`
**And** placeholder slots are present for: the input, the list, the empty/loading/error state, and the "Erase my data" link
**And** ESLint and Prettier pass

---

## Epic 4: Client UX — components, states, optimistic reducer

**Goal:** The MVP feature set is functional in the browser. Optimistic UI works for create / toggle / delete with rollback on failure. All three application states (empty / loading / error) render correctly. The keyboard-accessibility floor is met.

### Story 4.1: TodoInput component

As Maya,
I want a text input at the top of the page that I can type into immediately and submit by pressing Enter,
So that adding a todo takes one keystroke after typing it (FR1, FR23).

**Acceptance Criteria:**

**Given** the page has loaded and `App.tsx` mounted
**When** the page first renders
**Then** `TodoInput` is auto-focused (cursor blinking)
**And** the placeholder reads "Add a todo…" in `--color-text-muted`

**Given** the input is focused and the user types "Buy milk"
**When** they press Enter
**Then** an `OPTIMISTIC_CREATE` action dispatches with `{ id: <new-uuid>, description: "Buy milk" }`
**And** the input clears and remains focused

**Given** the input contains 0 characters or only whitespace
**When** the user presses Enter
**Then** no action dispatches (client-side guard against FR25 violation)

**Given** the user types more than 280 characters
**When** they attempt to enter the 281st character
**Then** the HTML `maxLength` attribute prevents entry (FR1 cap enforced at the input)

### Story 4.2: TodoList component rendering the items

As Maya,
I want my list of todos rendered in newest-first order with a checkbox + description + delete control on each row,
So that I can see my list at a glance and operate on any row (FR2, FR3, FR22).

**Acceptance Criteria:**

**Given** the reducer state contains an array of todos (newest first, as the server returned them)
**When** `TodoList` renders
**Then** the list is a semantic `<ul>` with each todo as an `<li>`
**And** each row's order matches the array order
**And** Tab navigation reaches each interactive element in the documented order (input → row 1 checkbox → row 1 delete → row 2 checkbox → …)
**And** rows render with the spacing, dividers, and dimensions defined in the UX spec

### Story 4.3: TodoItem component with completion toggle

As Maya,
I want to click a row's checkbox to toggle its completion state, with an instant visible change,
So that completed tasks read as completed at a glance (FR4, FR5, FR17, FR19, FR23).

**Acceptance Criteria:**

**Given** an incomplete todo rendered in `TodoItem`
**When** the user clicks the checkbox (or focuses it and presses Space/Enter)
**Then** `OPTIMISTIC_TOGGLE` dispatches and the row updates immediately: checkbox shows checked, description gets `text-decoration: line-through`, text colour shifts to `--color-text-muted`

**Given** a completed todo
**When** the user clicks the checkbox
**Then** the row reverts visually and `OPTIMISTIC_TOGGLE` dispatches with `completed: false`

**Given** a row currently mid-mutation (`id` in `optimisticPending` Set)
**Then** the row renders at `opacity: 0.6`

### Story 4.4: TodoItem delete control

As Maya,
I want a small delete glyph on each row that I can click without confirmation,
So that single-task removal is a one-tap action (FR6, FR22).

**Acceptance Criteria:**

**Given** a row rendered in `TodoItem`
**When** the row is hovered (desktop) or focused (any device)
**Then** the delete glyph (`×`) is visible at the right of the row, with 44 × 44 px hit area

**Given** the user clicks the delete glyph (or focuses it and presses Enter)
**When** the click fires
**Then** `OPTIMISTIC_DELETE` dispatches and the row disappears immediately (no confirmation)
**And** the delete-glyph button has `aria-label="Delete"` for screen readers

### Story 4.5: Empty, Loading, and Error state components

As Maya,
I want each application state to render clearly so that I always know what's happening,
So that I trust the app's state at a glance (FR14, FR15, FR16).

**Acceptance Criteria:**

**Given** the reducer state has zero todos and `loading === false` and `error === null`
**When** `App` renders
**Then** `EmptyState` is shown beneath the input with the text "No todos yet."
**And** the empty-state region is `aria-live="polite"`

**Given** `loading === true` (during initial fetch)
**When** `App` renders
**Then** `LoadingState` is shown with text "Loading…" and the list region has `aria-busy="true"`
**And** `LoadingState` is only ever shown for the initial fetch, never for mutations

**Given** `error !== null`
**When** `App` renders
**Then** `ErrorState` is shown above the list with `--color-error-bg` background, `--color-error-text` text, the error message, a Retry button (primary), and a Dismiss × button
**And** `ErrorState` has `role="alert"` so screen readers announce it
**And** clicking Retry dispatches `RETRY_LAST`
**And** clicking Dismiss dispatches `ERROR_DISMISS` (also bound to Escape)

### Story 4.6: Optimistic reducer with confirm/rollback

As the client app,
I want every mutation to flow through a single reducer that applies an optimistic change immediately and reverts on rejection,
So that NFR-2's optimistic UI contract is met for every mutation type and the failure mode is consistent (FR17, FR18, NFR-2).

**Acceptance Criteria:**

**Given** the reducer at initial state
**When** an `OPTIMISTIC_CREATE` action arrives
**Then** the new todo is prepended to the list and its `id` is added to `optimisticPending`

**Given** an `OPTIMISTIC_TOGGLE { id }` action
**Then** the row's `completed` flips and `id` joins `optimisticPending`

**Given** an `OPTIMISTIC_DELETE { id }` action
**Then** the row is removed from the list and `id` joins `optimisticPending`

**Given** any pending mutation
**When** the corresponding API call resolves successfully
**Then** `MUTATION_CONFIRM { id }` dispatches and the reducer removes `id` from `optimisticPending`

**Given** any pending mutation
**When** the corresponding API call rejects (server error, network failure, or timeout — per architecture step 4)
**Then** `MUTATION_ROLLBACK { id, reason }` dispatches
**And** the reducer reverts the optimistic change (re-inserts a deleted row, flips a toggle back, removes a created row)
**And** sets `error` to a recoverable user-facing message
**And** removes `id` from `optimisticPending`

**Given** all of the above logic in `client/src/reducer.ts`
**When** `npm run test` runs `reducer.test.ts`
**Then** there is at least one test for each mutation type covering both confirm and rollback paths

### Story 4.7: DeleteAllControl with inline confirmation

As Maya,
I want a small "Erase my data" link with an inline confirmation step,
So that I can wipe everything without an account, and without doing it accidentally (FR20, FR21).

**Acceptance Criteria:**

**Given** the page has rendered and at least one todo exists
**When** `App` renders
**Then** "Erase my data" appears as a small `--color-text-muted`-coloured link, right-aligned beneath the list

**Given** the user clicks the link
**When** the click fires
**Then** the link is replaced by an inline confirmation row containing the text "Erase all your todos? This cannot be undone." and two buttons: Erase (destructive, red text) and Cancel (muted)
**And** focus moves to the Erase button (so a confirming user can press Enter immediately)

**Given** the inline confirmation is visible
**When** the user clicks Erase (or presses Enter while Erase is focused)
**Then** `OPTIMISTIC_DELETE_ALL` dispatches; the list immediately empties; on server confirm the empty state shows; on server reject, the list is restored and `ErrorState` shows

**Given** the inline confirmation is visible
**When** the user clicks Cancel (or presses Escape)
**Then** the confirmation row collapses back to the link with no other side effect

---

## Epic 5: Containerize, test, ship

**Goal:** The app runs in a single Docker image, persists across container removal, every required test passes, and a verified README quickstart lets a fresh-clone reader build and run it. All v1 acceptance gates pass.

### Story 5.1: Multi-stage Dockerfile with healthcheck

As the project,
I want a multi-stage Dockerfile that produces a slim runtime image serving both client and server from a single port,
So that "deployable as a Docker image" is a working artifact, not a future intention (NFR-6).

**Acceptance Criteria:**

**Given** the repo at the end of Epic 4 (client builds, server builds)
**When** `docker build -t todo-app-3 .` runs from the repo root
**Then** the Dockerfile uses three stages: a client builder (`vite build` → `client/dist/`), a server builder (`tsc` → `server/dist/`), and a slim runtime (`node:20-alpine`)
**And** the runtime stage installs only production dependencies, copies `client/dist/` and `server/dist/`, and runs `node server/dist/index.js`
**And** the runtime stage sets `EXPOSE 3000` and declares `HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD curl -fsS http://localhost:3000/healthz || exit 1`
**And** the resulting image size is ≤ 200 MB
**And** no `ENV` instruction in the Dockerfile contains a secret value, default value, or placeholder (NFR-5)

**Given** the running container
**When** `curl http://localhost:3000/healthz` is issued from the host
**Then** the response is `200` with `{ "ok": true, "version": "..." }`
**And** `curl http://localhost:3000/` returns the built client `index.html`

### Story 5.2: docker-compose.yml for local dev convenience

As a developer,
I want a `docker-compose.yml` at the repo root that builds the image and runs the container with the persistence volume mounted,
So that `docker compose up` is the one-command path from clean clone to running app.

**Acceptance Criteria:**

**Given** the Dockerfile from Story 5.1
**When** the developer creates `docker-compose.yml` defining one service `app` that builds from the local Dockerfile, exposes port 3000, mounts `./data:/data`, and sets `CORS_ORIGIN`/`PORT`/`DB_PATH` via `environment:`
**Then** `docker compose up --build` produces a running container
**And** stopping and starting the compose project preserves `./data/todos.db` on the host

### Story 5.3: Required integration tests pass against the running container

As the v1 quality gate,
I want the cross-user-isolation, container-image, persistence-across-restart, and optimistic-rollback tests all passing,
So that the test minima named in the PRD's Technical Success block are demonstrably enforced (FR12, FR13, NFR-2, NFR-4).

**Acceptance Criteria:**

**Given** the cross-user-isolation tests in `server/src/routes/todos.test.ts`
**When** `cd server && npm test` runs
**Then** every list / read / write / delete endpoint has at least one test that issues a request as `user_id A` against data created by `user_id B` and asserts (a) GET returns 404 or 403, (b) PUT/DELETE return 404 or 403, (c) B's data is unchanged

**Given** the Docker integration test in `tests/docker.test.ts` at the repo root
**When** the test runs after `docker build -t todo-app-3 .`
**Then** it starts the container, issues a sequence of requests covering create / list / toggle / delete / delete-all, asserts persistence by removing the container with `docker rm` and starting a new container against the same volume, and re-asserts the data is intact (FR12)

**Given** the manual optimistic-rollback test described in `prd.md` → Optimistic UI rollback
**When** the developer runs the rollback test (frontend running, backend stopped, attempts each mutation, observes optimistic appearance + rejection + revert + DOM error)
**Then** for each of create / toggle / delete the optimistic change is reverted and the DOM error renders

**Given** the performance verification (NFR-4)
**When** the developer issues 100+ requests against the running container
**Then** the p95 latency is < 100 ms and the perceived UI latency for an optimistic update is < 50 ms

### Story 5.4: Verified README quickstart and final acceptance demo

As a senior reviewer reading this artifact,
I want a README at the repo root with a `docker build` + `docker run` quickstart that I can follow on a clean machine,
So that "deployable" is a verified property and the v1 user-acceptance demo passes (NFR-9, FR15 verification path).

**Acceptance Criteria:**

**Given** the repo at the end of Story 5.3
**When** the developer drafts `README.md` containing project description, quickstart commands (`docker build -t todo-app-3 .` then `docker run -p 3000:3000 -v ./data:/data todo-app-3`), and brief sections on local dev, running tests, and architecture / PRD pointers
**Then** following the quickstart from a fresh checkout on a different machine produces a running app at `http://localhost:3000`

**Given** the running app
**When** the developer runs the 8-step user-acceptance demo from `prd.md` → Success Criteria → User Success
**Then** all 8 steps pass on the first attempt in under 2 minutes from URL click to step 8 completion
**And** the browser console shows no errors during the demo
**And** all three UI states (empty, loading, error) are exercised

**Given** the README is in place
**When** ESLint and Prettier are run against the entire repo
**Then** both pass with zero errors and zero warnings (NFR-9)

---

## Final Validation

### Coverage check

- All 27 FRs map to at least one story (see *FR Coverage Map* above).
- All 9 NFRs with v1 obligations have explicit story coverage.
- All 3 architecture invariants (AI-1, AI-2, AI-3) are encoded as story acceptance criteria.
- The 8 components from `ux-design-specification.md` → Component strategy each have a dedicated story (TodoInput, TodoList, TodoItem with toggle, TodoItem delete, the three states, DeleteAllControl).

### Implementation sequence check

The 5 epics' order matches `architecture.md` → Decision impact analysis → Implementation sequence. Within each epic, stories are ordered for in-epic dependency (e.g., 2.1 db before 2.2 read-using-db).

### Story shape check

- Every story has a "As a … I want … So that …" goal.
- Every story has Given / When / Then acceptance criteria.
- Every story is testable; nothing is "make it good" without specifics.
- No story exceeds the boring-stack governor (no story requires introducing a new dependency category not already locked).

### Status

**READY FOR DEV PHASE.** The dev phase can implement these 21 stories in order. Each story produces verifiable output; each epic's last story is a checkpoint where progress can be paused without leaving the codebase in an inconsistent state.
