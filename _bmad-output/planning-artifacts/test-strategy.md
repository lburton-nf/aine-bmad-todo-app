---
type: test-strategy
project: todo-app-3
author: Lisaannburton
date: 2026-05-08
status: complete
---

# Test Strategy — todo-app-3

This document is the canonical v1 test plan. It pulls together the
test obligations scattered across the PRD, architecture, UX spec, and
epics into a single coherent strategy: what we test, at what level,
with what tool, and what we deliberately do *not* test.

The dev phase reads this document alongside `epics.md` to know which
test to write at each story boundary.

## The test pyramid (and what's not in it)

```
┌──────────────────────────────────────────────────────────┐
│  Manual gates (8-step demo, optimistic-rollback drill,   │
│  keyboard a11y check, hygiene/log inspection)            │
│  — single rep, performed before declaring v1 done        │
├──────────────────────────────────────────────────────────┤
│  Container e2e (tests/docker.test.ts)                    │
│  — slow but ≤ 1 test; verifies persistence-across-       │
│    container-removal and the deployable artifact         │
├──────────────────────────────────────────────────────────┤
│  HTTP integration (server/src/routes/todos.test.ts)      │
│  — Fastify `app.inject()`, in-memory SQLite, real        │
│    validation, real route handlers; cross-user isolation │
│    is the load-bearing test family here                  │
├──────────────────────────────────────────────────────────┤
│  Unit (db.test.ts, identity.test.ts, validation.test.ts, │
│   reducer.test.ts)                                       │
│  — pure functions and small modules; in-memory data;     │
│    fastest tier                                          │
├──────────────────────────────────────────────────────────┤
│  Lint-as-test (ESLint, Prettier)                         │
│  — mechanical; runs first; zero errors / zero warnings   │
└──────────────────────────────────────────────────────────┘

Out of scope for v1:
  • React component tests (no React Testing Library)
  • Browser e2e automation (no Playwright / Cypress)
  • Visual regression tests
  • CI pipeline
```

## Decisions and their rationales

### Component tests — **skip RTL for v1**

**Decision:** no React Testing Library, no `TodoList.test.tsx`, no component-level rendering tests.

**Rationale:** the reducer is unit-tested (every action × every confirm/rollback path); the components are display-of-reducer-state, exercised end-to-end by the manual 8-step acceptance demo and by the container e2e test. RTL setup + maintenance would consume time without proportional return at this scope. The cost of the omission — a regression where a component renders the wrong state — is bounded because the manual demo exercises every state visually.

**When this changes:** when a component grows non-trivial logic (more than 20 lines of non-render code), promote it to a tested module.

### Browser end-to-end automation — **skip Playwright for v1**

**Decision:** no Playwright, no Cypress, no Selenium. The 8-step user-acceptance demo from PRD → User Success **is** the e2e gate, performed manually before declaring v1 done.

**Rationale:** the demo is precisely 8 steps, takes < 2 minutes, and is documented unambiguously in the PRD. Automating it would add a browser-driver dependency, runtime, and maintenance for a single-execution v1 gate. The manual run also verifies things automated browser tests miss — visual polish, real input-event timing, console errors as observed by a human.

**When this changes:** if the demo becomes a per-PR regression gate, automate it then. v1 is single-shot.

### Test data — **`:memory:` SQLite for unit + integration; volume file for container e2e**

**Decision:** all unit and integration tests open `new Database(':memory:')` per test (or per `describe` block). The container e2e is the *only* test that uses a real volume-mounted SQLite file — that is the test that exercises the volume.

**Rationale:** in-memory tests are fast (single-millisecond) and have zero cleanup. A real SQLite file would add cleanup complexity (delete file before/after, handle stale state, file-lock issues on Windows) without providing test value: persistence-across-restart is verified once, in the container e2e, where the volume is actually a volume.

**Test isolation:** each test gets its own in-memory database. No shared state between tests.

### Coverage — **contract coverage, not line coverage**

**Decision:** no `--coverage` threshold, no nyc/istanbul gate. Tests are written to cover *contracts*, not lines.

**The "always tested" list:**

- Cross-user data isolation on every list/read/write/delete endpoint (per FR13).
- Optimistic-UI confirm and rollback paths for every mutation (create / toggle / delete) per FR17 / FR18 / NFR-2.
- Input-validation rejection for: empty/whitespace/over-280 description (FR25); >1KB payload (FR26); malformed `X-User-Id` (FR27); duplicate `id`; missing required body fields.
- Persistence across `docker rm` + `docker run` against the same volume (FR12, container e2e).
- Schema initialization is idempotent (`CREATE TABLE IF NOT EXISTS` runs cleanly on existing DB).
- AI-3: PATCH/DELETE on a non-existent or non-owned `:id` returns 404 with the same envelope as a real not-found.

**The "deliberately not tested" list:**

- React renders text correctly (framework concern).
- Fastify routes requests by method+path (framework concern).
- `better-sqlite3` executes valid SQL (driver concern).
- TypeScript catches type errors (compiler concern; ESLint + `tsc --noEmit` is the gate).

### Performance verification — **small ad-hoc shell script**

**Decision:** `tests/perf.sh` (or `tests/perf.ts`) issues 100 requests against the running container and computes p95 latency using a small `awk` or `jq` pipeline. No `autocannon`, no `k6`, no new dependency.

**Acceptance:** server p95 < 100 ms over 100+ requests against local Docker; perceived UI latency < 50 ms (input event → DOM mutation, observed manually with browser DevTools Performance panel).

**Rationale:** the targets are loose enough that a simple loop suffices; SQLite + Fastify on local Docker comfortably hits single-digit ms. Bringing in `autocannon` adds setup time for a one-off measurement.

### CI pipeline — **explicit non-requirement for v1**

**Decision:** no GitHub Actions, no CircleCI, no Jenkins. Local `npm test` is the gate. The README documents the test commands.

**Rationale:** consistent with the brief's deliberately-small v1 scope; CI is a Growth-phase addition. Single-engineer single-machine v1 has no merge gates to enforce.

**When this changes:** when a second engineer joins or when changes start landing through pull requests, add a minimal Actions workflow that runs `npm test`, `npx eslint .`, `npx prettier --check .`, and `docker build` on every push.

### Lint as test — **first thing run, zero tolerance**

**Decision:** `npx eslint .` and `npx prettier --check .` from the repo root MUST pass with zero errors and zero warnings before any other test runs. This is part of NFR-9 ("ESLint extends a recognized TypeScript-aware strict configuration … rule downgrades are not permitted").

**Rule downgrade policy:** an `eslint-disable-next-line` comment is permitted only with a brief inline justification (e.g., `// eslint-disable-next-line @typescript-eslint/no-unsafe-cast — better-sqlite3 row shape`). Whole-file disables are not permitted.

## Test command surface

```bash
# From repo root
npm run lint              # ESLint + Prettier across the whole repo (Husky-free)
npm test                  # invokes `cd client && npm test` and `cd server && npm test`
docker build -t todo-app-3 .
docker compose up         # for the container-e2e test convenience
```

## Test files (canonical list)

| File | Tier | What it tests |
|---|---|---|
| `client/src/reducer.test.ts` | Unit | every reducer action × confirm/rollback path |
| `server/src/db.test.ts` | Unit | each query function with valid + boundary inputs against `:memory:` |
| `server/src/identity.test.ts` | Unit | `^anon-[0-9a-f-]{36}$` validator: valid / malformed / empty / wrong-prefix |
| `server/src/validation.test.ts` | Unit | request-body validators (description, payload size, id format) |
| `server/src/routes/todos.test.ts` | Integration | every route via `app.inject()`; cross-user isolation tests are the load-bearing family |
| `tests/docker.test.ts` | Container e2e | builds image, runs container, full request sequence, persistence across `docker rm` + `docker run` against same volume |
| `tests/perf.sh` (or `.ts`) | Performance | 100 requests → p95 latency calculation |

## Manual gates (run once before declaring v1 done)

1. **8-step user-acceptance demo** (PRD → User Success). One reviewer, on a different machine than the dev machine, follows the README quickstart and the 8-step demo. Pass criteria: all 8 steps in < 2 minutes on first attempt, no console errors, no glitches.

2. **Optimistic-rollback drill.** With the frontend running and the backend running, attempt each of create / toggle / delete. Confirm optimistic update appears, server confirms, mutation lands. Then `docker stop` the backend; attempt each mutation again. Confirm: optimistic update appears, server rejection occurs, optimistic update reverts, error renders in the DOM (not the console).

3. **Keyboard accessibility check.** Tab through the entire page. Confirm: every interactive element reachable via Tab; visible focus indicator on each; Enter/Space triggers each action; Escape dismisses error states; no keyboard traps.

4. **Hygiene inspection.**
   - Inspect `Dockerfile`: confirm no `ENV` instructions contain values, secrets, or placeholders.
   - Run server, issue requests, inspect logs: confirm `X-User-Id` values are redacted.
   - Run `DELETE /todos`, then inspect SQLite directly: confirm zero rows for that user_id, other users' rows untouched.

## Product decisions baked in by this strategy

Two decisions surfaced while cataloguing test scenarios. Both are
architectural in shape (they affect server behavior and tests) but
small enough to fit in this strategy doc rather than reopening the
architecture file.

### PD-1: Trim leading/trailing whitespace before length validation

**Decision.** The server trims leading and trailing whitespace from
`description` *before* enforcing the length and emptiness checks
(FR25). Internal whitespace is preserved as-is.

**Rationale.** A user typing `"buy milk "` (trailing space) should
not have a stray space stored, and should not get a 400 rejection
for being 281 characters when their visible content is 280
characters. Trimming outer whitespace is the universal convention.

**Implementation.** `validation.ts` calls `description.trim()` once,
checks the result against empty / whitespace-only / > 280, and
returns the trimmed value to the route handler. The route handler
passes the trimmed value to `db.createTodo(...)`. The client
receives back the trimmed description in the response.

**Test impact.** Boundary-value scenarios assume trim semantics
(see TS-1.x below).

### PD-2: Multi-tab consistency is "refresh to see"

**Decision.** When two tabs in the same browser share an
`anon-{uuid}` and one tab mutates state, the other tab does not see
the change until it reloads (or until the user performs an action
that triggers a fresh fetch). v1 does **not** poll, does not listen
to `storage` events, and does not push live updates.

**Rationale.** Consistent with NFR-12 (no real-time / no integrations
in v1) and with the brief's deliberate v1 boundary. The cost of
*adding* live cross-tab sync is meaningful (storage-events listener,
cross-tab race handling, potential infinite-loop risk); the cost
of *not having it* is one user-visible quirk that the second tab
shows stale state until refresh — a quirk a single-user-per-browser
product can absorb.

**Test impact.** Multi-tab scenarios document the contract rather
than assert real-time behavior (see TS-7.x below).

## Test Scenarios

This section catalogues specific test cases the dev phase should
write, organized by capability area. Each scenario has an ID
(`TS-<group>.<n>`), a tier, a target file, and a tight G/W/T.
Story acceptance criteria in `epics.md` cover most happy paths; the
scenarios below fill in boundaries, negatives, recovery, and
cross-cutting concerns.

### Group 1 — Description boundary cases

Target file: `server/src/validation.test.ts` (unit) plus
`server/src/routes/todos.test.ts` (integration via `app.inject()`).

| ID | G / W / T |
|---|---|
| TS-1.1 | **Given** a description of exactly 280 ASCII chars, **when** validated, **then** accepted. |
| TS-1.2 | **Given** a description of exactly 281 ASCII chars, **when** validated, **then** rejected (FR25). |
| TS-1.3 | **Given** a description of `" "` (single space), **when** trimmed and validated, **then** rejected as whitespace-only (PD-1). |
| TS-1.4 | **Given** `"  buy milk  "` (leading + trailing spaces, 12 visible chars + 4 spaces), **when** validated, **then** accepted; **and** the persisted description is `"buy milk"` (PD-1). |
| TS-1.5 | **Given** 280 chars of content followed by a single trailing space (281 raw chars), **when** validated, **then** accepted; **and** the persisted description is the 280-char content (PD-1). |
| TS-1.6 | **Given** 281 chars of pure content (no trailing whitespace), **when** validated, **then** rejected. |
| TS-1.7 | **Given** an empty string `""`, **when** validated, **then** rejected. |
| TS-1.8 | **Given** `"\t\n\r"` (mixed whitespace), **when** trimmed and validated, **then** rejected as whitespace-only. |
| TS-1.9 | **Given** a description containing emoji (`"buy 🥛"`), **when** validated, **then** accepted (length is character-count, not byte-count). |
| TS-1.10 | **Given** a description containing internal whitespace (`"buy   milk"`), **when** validated, **then** accepted; **and** the persisted description preserves the internal spaces (PD-1: only outer whitespace is trimmed). |
| TS-1.11 | **Given** a description containing SQL fragments (`"'; DROP TABLE todos;--"`), **when** persisted via parameterised query, **then** stored as literal text and retrievable verbatim; **and** the table still exists. |
| TS-1.12 | **Given** a description containing HTML/JS (`"<script>alert(1)</script>"`), **when** rendered in the client, **then** displayed as literal text (React's default escaping is the defence; no `dangerouslySetInnerHTML` anywhere). |

### Group 2 — Identity-format scenarios

Target file: `server/src/identity.test.ts` (unit) plus the
`preHandler` hook covered in `server/src/routes/todos.test.ts`.

| ID | G / W / T |
|---|---|
| TS-2.1 | **Given** `X-User-Id: anon-{valid-uuid}`, **when** validated, **then** accepted. |
| TS-2.2 | **Given** no `X-User-Id` header, **when** the preHandler runs, **then** the request is rejected 400 before any route handler executes. |
| TS-2.3 | **Given** `X-User-Id: user-{uuid}` (wrong prefix), **when** validated, **then** rejected 400. |
| TS-2.4 | **Given** `X-User-Id: anon-` (prefix only, no UUID), **when** validated, **then** rejected 400. |
| TS-2.5 | **Given** `X-User-Id: anon-{too-short}` (33 chars instead of 36), **when** validated, **then** rejected 400. |
| TS-2.6 | **Given** `X-User-Id: anon-{uppercase-hex}` (non-canonical UUID), **when** validated, **then** rejected 400 (regex enforces lowercase hex). |
| TS-2.7 | **Given** `X-User-Id` containing a leading or trailing space, **when** validated, **then** rejected 400 (no implicit trim on identity headers — a security-adjacent boundary). |

### Group 3 — Cross-user isolation matrix

Target file: `server/src/routes/todos.test.ts` (integration). Each
scenario uses two distinct user IDs `A` and `B` and verifies B
cannot affect A's data.

| ID | G / W / T |
|---|---|
| TS-3.1 | **Given** A has 3 todos, **when** B issues `GET /todos`, **then** the response is `[]` (only B's todos, of which there are none). |
| TS-3.2 | **Given** A's todo `T-A`, **when** B issues `PATCH /todos/T-A` with `{completed:true}`, **then** the response is 404; **and** `T-A` is unchanged in the DB. |
| TS-3.3 | **Given** A's todo `T-A`, **when** B issues `DELETE /todos/T-A`, **then** the response is 404; **and** `T-A` exists in the DB. |
| TS-3.4 | **Given** B has todos `T-B1, T-B2`, **when** A issues `DELETE /todos`, **then** A's todos are deleted; **and** `T-B1, T-B2` remain in the DB (FR20 scoped). |
| TS-3.5 | **Given** A creates `T-A`, **when** B issues `POST /todos` with the *same* `id` as `T-A`, **then** either: (a) the response is 201 and B's row is created in B's scope (different `user_id`, same `id` allowed); OR (b) the schema rejects with 400/409 because `id` is `PRIMARY KEY` globally. **Architecture commits to (b)** — the `id` is globally unique. The test asserts (b). |
| TS-3.6 | **Given** A's `T-A`, **when** any unauthenticated request (no `X-User-Id`) targets `T-A`, **then** rejected 400 by the preHandler before reaching the route. |
| TS-3.7 | **Given** the response shape, **when** any 404 (not-found-or-not-yours) is returned, **then** the response body is identical regardless of cause (AI-3, no leak). |
| TS-3.8 | **Given** any list/read/write/delete endpoint, **when** the corresponding cross-user-isolation test runs, **then** the test passes. (Meta-assertion: all of the above are required.) |

### Group 4 — Optimistic-UI rollback variants

Target file: `client/src/reducer.test.ts` (unit) plus the manual
optimistic-rollback drill (manual gate).

| ID | G / W / T |
|---|---|
| TS-4.1 | **Given** initial state, **when** `OPTIMISTIC_CREATE` then `MUTATION_CONFIRM` dispatch, **then** the new todo is in the list and `optimisticPending` is empty. |
| TS-4.2 | **Given** initial state, **when** `OPTIMISTIC_CREATE` then `MUTATION_ROLLBACK` dispatch, **then** the new todo is removed; **and** `error` is set; **and** `optimisticPending` is empty. |
| TS-4.3 | **Given** an existing incomplete todo, **when** `OPTIMISTIC_TOGGLE` then `MUTATION_CONFIRM` dispatch, **then** the todo is `completed: true` and `optimisticPending` is empty. |
| TS-4.4 | **Given** an existing incomplete todo, **when** `OPTIMISTIC_TOGGLE` then `MUTATION_ROLLBACK` dispatch, **then** the todo is back to `completed: false`; **and** `error` is set. |
| TS-4.5 | **Given** an existing todo at index 2, **when** `OPTIMISTIC_DELETE` then `MUTATION_CONFIRM` dispatch, **then** the todo is gone. |
| TS-4.6 | **Given** an existing todo at index 2, **when** `OPTIMISTIC_DELETE` then `MUTATION_ROLLBACK` dispatch, **then** the todo is back at index 2 (original order preserved); **and** `error` is set. |
| TS-4.7 | **Given** a list of 5 todos, **when** `OPTIMISTIC_DELETE_ALL` then `MUTATION_CONFIRM` dispatch, **then** the list is empty. |
| TS-4.8 | **Given** a list of 5 todos, **when** `OPTIMISTIC_DELETE_ALL` then `MUTATION_ROLLBACK` dispatch, **then** all 5 todos are restored in their original order. |
| TS-4.9 | **Given** an existing todo, **when** the API call is rejected because of a network failure (no response), **then** `MUTATION_ROLLBACK` dispatches with `category: 'network'`. |
| TS-4.10 | **Given** an existing todo, **when** the API call is rejected because of a timeout, **then** `MUTATION_ROLLBACK` dispatches with `category: 'timeout'`. |
| TS-4.M | **Manual gate.** With frontend running and backend stopped (`docker stop`), the user attempts each of create / toggle / delete. For each: optimistic update appears, server rejection occurs (network category), optimistic update reverts, error renders in DOM (not console). |

### Group 5 — State-transition scenarios

Target file: `client/src/reducer.test.ts` (unit) plus manual gate.

| ID | G / W / T |
|---|---|
| TS-5.1 | **Given** zero todos and `loading === false`, **when** `App` renders, **then** `EmptyState` is shown (FR14). |
| TS-5.2 | **Given** one todo exists, **when** the user deletes that todo (and the server confirms), **then** the empty state appears immediately — no refresh required. |
| TS-5.3 | **Given** the page is in `loading === true`, **when** `INIT_FETCH_SUCCESS` dispatches with todos, **then** `loading` becomes false and the list renders. |
| TS-5.4 | **Given** the page is in `loading === true`, **when** `INIT_FETCH_FAIL` dispatches, **then** `loading` becomes false; **and** `error` is set; **and** `ErrorState` is shown. |
| TS-5.5 | **Given** an `error` is already set, **when** another mutation rejects, **then** the new error replaces the old (no stacking). |

### Group 6 — Persistence and durability scenarios

Target file: `tests/docker.test.ts` (container e2e) plus
`server/src/db.test.ts` (unit) for schema-init idempotence.

| ID | G / W / T |
|---|---|
| TS-6.1 | **Given** an empty SQLite file, **when** the server initializes, **then** the `todos` table and the index exist (`CREATE … IF NOT EXISTS`). |
| TS-6.2 | **Given** an existing populated SQLite file, **when** the server initializes a second time, **then** no error is thrown; **and** existing data is preserved. |
| TS-6.3 | **Given** a running container with 3 todos, **when** the user refreshes the page, **then** all 3 todos are still visible (FR11). |
| TS-6.4 | **Given** a running container with 3 todos and a mounted volume, **when** the container is stopped (`docker stop`) and started (`docker start`), **then** all 3 todos are still visible. |
| TS-6.5 | **Given** a running container with 3 todos and a mounted volume, **when** the container is removed (`docker rm`) and a new container is started against the same volume, **then** all 3 todos are still visible (FR12, the load-bearing case). |
| TS-6.6 | **Given** a running container with no mounted volume, **when** the container is removed and recreated, **then** todos are lost — and this is the *expected* behavior; the volume is what makes persistence work. (Negative-case verification of the volume's role.) |

### Group 7 — Multi-tab and recovery scenarios

Target: manual gate (most scenarios cannot be Vitest-tested
ergonomically) plus `client/src/identity.test.ts` for the recovery
path.

| ID | G / W / T |
|---|---|
| TS-7.1 | **Given** Tab A and Tab B both open the app on the same browser (same `anon-{uuid}`), **when** Tab A creates a todo and Tab B does *nothing*, **then** Tab B's UI does not show the new todo (PD-2: refresh to see). |
| TS-7.2 | **Given** Tab A and Tab B both open the app on the same browser, **when** Tab A creates a todo and Tab B reloads, **then** Tab B shows the new todo. |
| TS-7.3 | **Given** Tab A creates a todo, **when** Tab A and Tab B both refresh, **then** both show the same list (eventual consistency via reload). |
| TS-7.4 | **Given** the user has a populated list, **when** they manually clear `localStorage` and reload, **then** the page shows the empty state (their data is orphaned in the DB but unreachable). |
| TS-7.5 | **Given** the server has been wiped (`DELETE /todos` from another mechanism) but `localStorage` still has the old `anon-{uuid}`, **when** the page loads, **then** the page shows the empty state — the `anon-{uuid}` is still valid; there are simply no rows. |
| TS-7.6 | **Given** `localStorage` contains a malformed `todo.userId`, **when** `identity.ts` initialises, **then** the malformed value is cleared and a fresh `anon-{uuid}` is minted (FR9, story 3.1). |
| TS-7.7 | **Given** the server returns 400 with a "malformed identifier" message, **when** `client/src/api.ts` receives it, **then** `identity.reset()` is called and the next request uses a fresh ID. |

### Group 8 — Performance scenarios

Target file: `tests/perf.sh` (or `.ts`).

| ID | G / W / T |
|---|---|
| TS-8.1 | **Given** the running container with 0 todos for the calling user, **when** 100 sequential `GET /todos` requests are issued, **then** the p95 latency is < 100 ms. |
| TS-8.2 | **Given** the running container with 100 todos for the calling user, **when** 100 sequential `GET /todos` requests are issued, **then** the p95 latency is < 100 ms. |
| TS-8.3 | **Given** the running container, **when** 100 sequential `POST /todos` requests with unique IDs are issued, **then** the p95 latency is < 100 ms. |
| TS-8.4 | **Given** the running container, **when** 100 sequential `PATCH /todos/:id` requests are issued against an existing todo, **then** the p95 latency is < 100 ms. |
| TS-8.5 | **Given** the running container, **when** 100 sequential `DELETE /todos/:id` requests are issued against existing todos, **then** the p95 latency is < 100 ms. |
| TS-8.M | **Manual.** With the browser DevTools Performance panel open, the user creates a todo. The time between the input event and the DOM mutation reflecting the optimistic update is < 50 ms. |

### Group 9 — Container e2e specifics

Target file: `tests/docker.test.ts`.

The container e2e test is one test, but it executes a specific
sequence and asserts at multiple points. The sequence:

1. `docker build -t todo-app-3 .` (test fails if build fails).
2. `docker run -d -p 3000:3000 -v $(pwd)/data:/data --name todo-test todo-app-3`.
3. Wait for `GET /healthz` to return 200 (poll up to 10 s).
4. Issue `POST /todos` × 3 with three distinct `id`s and descriptions, each with `X-User-Id: anon-{some-uuid}`.
5. Issue `GET /todos`; assert 3 todos returned, in newest-first order.
6. Issue `PATCH /todos/{first-id}` with `{completed: true}`; assert 200; assert response shows `completed: true`.
7. Issue `DELETE /todos/{second-id}`; assert 200 or 204.
8. Issue `GET /todos`; assert 2 todos remain, with the first marked complete.
9. `docker rm -f todo-test`.
10. `docker run -d -p 3000:3000 -v $(pwd)/data:/data --name todo-test-2 todo-app-3` (same image, new container, **same volume**).
11. Wait for healthz.
12. Issue `GET /todos` with the same `X-User-Id`; assert 2 todos remain (FR12 verified).
13. Cleanup: remove container, optionally remove `./data`.

**Assertion points:**

- After step 3: server is responsive.
- After step 5: list write + read + ordering work.
- After step 6: PATCH works.
- After step 7: DELETE works.
- After step 8: state is what we expect.
- After step 12: persistence across `docker rm` + `docker run` works (the *whole point* of this test).

## Status

**READY FOR DEV PHASE.** Test strategy is canonical; epics' inline test acceptance criteria are consistent with this strategy; the scenario catalogue above is the dev phase's test-writing checklist.
