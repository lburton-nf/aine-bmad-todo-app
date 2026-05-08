---
title: 'Story 2.1 — Database module with schema initialization'
type: 'feature'
created: '2026-05-08'
status: 'done'
baseline_commit: '5399920d2657981d419e6648f1d5ab879c87a9d7'
context:
  - _bmad-output/implementation-artifacts/epic-2-context.md
  - _bmad-output/implementation-artifacts/spec-1-4-server-bootstrap-and-healthcheck.md
  - _bmad-output/planning-artifacts/architecture.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The server bootstrap (Story 1.4) is feature-less — no routes register against persistence because no persistence module exists. Every Epic 2 route story (2.2 through 2.5) needs a single canonical `db.ts` that opens SQLite, runs schema init idempotently, and exposes a typed query surface that scopes every read/write/delete by `user_id` (NFR-1 — load-bearing for cross-user isolation).

**Approach:** Add `server/src/db.ts` as a closure factory: `initialize(dbPath)` opens a `better-sqlite3` connection, applies the schema with `CREATE … IF NOT EXISTS`, prepares statements, and returns a typed `Db` object with five methods: `listTodosForUser`, `createTodo`, `updateCompleted`, `deleteTodo`, `deleteAllForUser`. Extend `buildServer({ db })` to decorate the Fastify instance with `app.db`; wire `app.addHook('onClose', () => db.close())` so `app.close()` (already called in 1.4's SIGINT/SIGTERM handler) tears down the connection cleanly. `index.ts` calls `initialize(env.DB_PATH)` and threads the result into `buildServer`. Tests construct an in-memory `Db` per case and inject it.

## Boundaries & Constraints

**Always:**
- **NFR-1 invariant:** every SQL statement that touches `todos` includes `WHERE user_id = ?`. There are NO unscoped reads, writes, or deletes. The reviewer test: grep for `'SELECT '`/`'INSERT '`/`'UPDATE '`/`'DELETE '` outside `db.ts` returns zero results, AND every such statement inside `db.ts` is scoped by `user_id`.
- **All SQL lives in `db.ts`.** Route handlers (added in 2.2+) call typed methods only.
- Schema and index match `architecture.md` → Data architecture exactly: `id TEXT PK`, `user_id TEXT NOT NULL`, `description TEXT NOT NULL`, `created_at INTEGER NOT NULL`, `completed INTEGER NOT NULL DEFAULT 0`; composite index `todos_user_id_created_at` on `(user_id, created_at DESC)`.
- Schema initialization is idempotent — `CREATE TABLE IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS`. Calling `initialize()` against an already-populated DB is a no-op for data.
- `Db` is a closure factory, not a module singleton. `initialize(dbPath)` returns a fresh `Db` whose methods are bound to a single connection + prepared statements. No module-level mutable connection state.
- **Boundary conversion:** `db.ts` is the only module that sees `completed` as `0|1`; reads convert to `boolean`, writes accept `boolean`.
- All return shapes match `shared/types.Todo` exactly — snake_case `created_at`, no `user_id`.
- `updateCompleted`/`deleteTodo` return `null`/`false` uniformly for both "missing" and "not-yours" — preserves AI-3 (no ownership leak) at the persistence layer.
- Connection lifecycle: `app.addHook('onClose', () => app.db.close())` so Story 1.4's SIGINT/SIGTERM handler drains the connection.
- Prepared statements (`db.prepare`) for the 5 query paths; raw SQL only for schema init.

**Ask First:**
- (none — architecture and `epic-2-context.md` lock every decision)

**Never:**
- Adding an ORM (Prisma, TypeORM, Drizzle, Kysely, etc.). Hand-rolled SQL via `better-sqlite3` only.
- Adding a migrations framework. Schema is a single string block in `db.ts`; future schema changes start the migrations conversation.
- Faking an async API around the synchronous `better-sqlite3` calls.
- Returning `user_id` from any function. It is a request-side concern; never leaks back.
- Mutable module-level state holding the connection (the closure pattern is non-negotiable for testability).
- Touching any route registration in `server.ts`. Story 2.1 only ships the persistence module + decoration; routes land in 2.2+.
- Leaking SQL strings into route handlers, tests outside `db.test.ts`, or any other module.

</frozen-after-approval>

## Code Map

- `server/src/db.ts` — NEW. Exports `interface Db`, `initialize(dbPath: string): Db`. Internal: schema string, prepared statements, boolean ↔ integer conversion, the five query methods. ~120 lines.
- `server/src/db.test.ts` — NEW. ≥ 8 tests against an in-memory DB: schema + index creation, idempotent re-init, every method's happy path, cross-user isolation for read/update/delete, `deleteAllForUser` scope.
- `server/src/server.ts` — EDIT. Add `db: Db` to `BuildServerOpts`; `app.decorate('db', opts.db)`; `app.addHook('onClose', () => app.db.close())`; module-augment `FastifyInstance` to type `app.db: Db`.
- `server/src/index.ts` — EDIT. `const db = initialize(env.DB_PATH);` then `buildServer({ corsOrigin: env.CORS_ORIGIN, db })`.
- `server/src/server.test.ts` — EDIT. Replace `makeApp` / `makeAppWithEcho` with versions that construct `initialize(':memory:')` and pass it as `db`. Server tests stay green with no coverage regression.

## Tasks & Acceptance

**Execution:**

- [x] `server/src/db.ts` — schema constant, `initialize(dbPath)` opens connection + applies schema + prepares statements + returns closure-bound `Db` with 5 methods + `close()`. Boolean conversion at the boundary.
- [x] `server/src/server.ts` — extend `BuildServerOpts.db: Db`, decorate `app.db`, register `onClose` hook for `db.close()`, add the `declare module 'fastify'` augmentation.
- [x] `server/src/index.ts` — call `initialize(env.DB_PATH)` and pass `db` into `buildServer`.
- [x] `server/src/db.test.ts` — 12 tests: schema (table + index), idempotent re-init via tmpdir, createTodo (fields + timestamp), listTodosForUser (cross-user isolation), updateCompleted (happy + cross-user + missing), deleteTodo (happy + cross-user), deleteAllForUser (scope + count), close lifecycle.
- [x] `server/src/server.test.ts` — refactor helpers to inject an in-memory `Db`. All existing tests pass unchanged in behaviour.

**Acceptance Criteria:**

- Given a fresh DB at any path, when `initialize(dbPath)` runs, then the `todos` table exists with the documented schema (verifiable via `SELECT sql FROM sqlite_master WHERE name='todos'`).
- Given a fresh DB, when `initialize` runs, then the index `todos_user_id_created_at` exists and is on `(user_id, created_at DESC)`.
- Given an existing DB with rows, when `initialize` runs again on the same path, then no error is thrown and every row is byte-identical afterwards.
- Given two users U1 and U2 each with rows, when U1's session calls `updateCompleted(U1, U2-row-id, true)` or `deleteTodo(U1, U2-row-id)`, then the call returns `null` / `false` respectively, U2's row is byte-identical, and no error is raised (AI-3 at the persistence layer).
- Given U1 with five rows and U2 with three, when `deleteAllForUser(U1)` is called, then it returns `5`, U1 has zero rows, U2 still has three rows, and `listTodosForUser(U2)` is unaffected.
- Given the bootstrap, when `index.ts` runs, then a `Db` instance is created via `initialize(env.DB_PATH)` and passed to `buildServer`. `app.db` is typed as `Db` (compile-time) and resolves at runtime.
- Given `app.close()` is called, then `db.close()` runs via the `onClose` hook (verifiable: re-using the connection afterwards throws).
- Given the test suite, when `npm test` runs from repo root, then client 2/2 + server (server.test.ts existing 3 + env.test.ts existing 7 + new db.test.ts ≥ 8) pass; no regressions.
- Given `npm run lint` and `npx prettier --check .`, both exit 0.
- Given `npm run test:coverage --prefix server`, server hits the 80% line/branch/function/statement thresholds (db.ts is exhaustively tested; server.ts gets the new decorate path covered by the existing tests).
- Given `npm run build` from `server/`, then `tsc` compiles `db.ts` cleanly with no rootDir or type errors.

## Spec Change Log

### 2026-05-08 — Hardening patches (review-driven)

**Trigger:** Adversarial + edge-case review (acceptance auditor reported clean). Six small defensive improvements to `db.ts`.

**Amendments:**

1. **`CHECK (completed IN (0, 1))` constraint** added to the schema. Defensive guard — the public API can't produce bad values today, but the constraint is the safety net for direct SQL, future schema changes, or accidental column-type drift.
2. **`ORDER BY created_at DESC, id DESC`** in `listTodosForUser`. Tiebreaker for same-millisecond inserts; without it, ordering between two inserts in the same ms is undefined and tests with timing-sensitive assertions become flaky.
3. **Two PRAGMAs** at initialize: `journal_mode = WAL` (standard production SQLite hygiene; better concurrent-read perf) and `busy_timeout = 5000` (absorbs brief contention rather than failing immediately).
4. **`close()` is idempotent.** A `closed` flag guards against double-close from a future code path that calls it both directly and via the `onClose` hook.
5. **Explicit null check on `createTodo`'s INSERT result.** Drops the `as TodoRow` cast in favour of `if (!row) throw`. The cast suppressed TypeScript's nullable warning; the explicit check fails loud if better-sqlite3's `RETURNING` contract ever changes.
6. **`initialize` rejects empty `dbPath`.** `better-sqlite3` silently opens a temp/cwd database on `''`; explicit validation surfaces the misconfiguration immediately.

**Tests added:** `close is idempotent (second call no-op)` + `initialize rejects empty dbPath`.

**KEEP instructions for re-derivation (if this spec re-loops):**
- All six patches MUST survive — they are independent defensive improvements with no fidelity cost.
- Do NOT add a CHECK-constraint behavioural test — the public API cannot produce bad values; the test would have to go around `db.ts`'s SQL boundary, defeating the "all SQL lives in db.ts" rule.

## Design Notes

- **Closure factory, not module singleton.** Returning `Db` from `initialize` makes `db` an injected dependency — tests pass an in-memory instance, the SIGINT path closes exactly the bound connection, and there's no module mutation to reset between tests.
- **`updateCompleted` returns `Todo | null`** so 2.4's handler can echo the persisted state without a round-trip read. SQLite 3.35+ supports `UPDATE … RETURNING *`.
- **`:memory:` for tests.** `better-sqlite3` accepts it as a path; each `initialize(':memory:')` is fresh and isolated.
- **AI-3 at the persistence layer.** Routes in 2.4 stay trivial — `null`/`false` → 404. No ownership leak path exists because `db.ts` doesn't expose one.

## Verification

**Commands:**

- `cd server && npm run lint` — exit 0
- `cd server && npm test` — db.test.ts (≥ 8) + server.test.ts (3) + env.test.ts (7) all pass; exit 0
- `cd server && npm run build` — exit 0; `dist/server/src/db.js` present
- `npm test` from repo root — client 2/2 + server (≥ 18) all pass; exit 0
- `npm run test:coverage --prefix server` — passes 80% thresholds across all four metrics
- `npx prettier --check .` from repo root — exit 0
- `cd server && npm run dev` — Fastify boots, `/healthz` still returns 200; manual: confirm no DB-related boot errors against a fresh `DB_PATH`

**Manual:**

- `DB_PATH=/tmp/todos-smoke.db npm run dev --prefix server` then Ctrl-C; re-run; the file should exist and be unchanged across the two boots (idempotent init).

## Suggested Review Order

**Persistence contract** (entry — start here)

- The `Db` interface — every Epic 2 route handler will call exactly these methods.
  [`db.ts:37`](../../server/src/db.ts#L37)

- Schema constant: matches `architecture.md` → Data architecture exactly, plus a CHECK constraint added during review.
  [`db.ts:7`](../../server/src/db.ts#L7)

- `initialize` opens the connection, applies WAL + busy_timeout PRAGMAs, prepares all five statements, returns the closure-bound API.
  [`db.ts:49`](../../server/src/db.ts#L49)

**Cross-user isolation** (NFR-1 — load-bearing for the rest of Epic 2)

- `listTodosForUser` SELECT — newest-first ordering with `id DESC` tiebreaker for deterministic same-ms ordering.
  [`db.ts:62`](../../server/src/db.ts#L62)

- AI-3 unification: `updateCompleted` returns `Todo | null` — same-shape response for "missing" and "not yours".
  [`db.ts:91`](../../server/src/db.ts#L91)

- AI-3 unification: `deleteTodo` returns `boolean` — same-shape response for "missing" and "not yours".
  [`db.ts:95`](../../server/src/db.ts#L95)

**Bootstrap wiring**

- `index.ts` calls `initialize(env.DB_PATH)` once and threads the result into `buildServer`.
  [`index.ts:6`](../../server/src/index.ts#L6)

- `app.decorate('db', opts.db)` makes the connection available as `app.db` in route handlers (added in 2.2+).
  [`server.ts:34`](../../server/src/server.ts#L34)

- `onClose` hook drains the connection when `app.close()` runs — wired into Story 1.4's SIGINT/SIGTERM handler.
  [`server.ts:35`](../../server/src/server.ts#L35)

**Tests**

- Cross-user isolation: U1 cannot read, mutate, or delete U2's rows.
  [`db.test.ts:113`](../../server/src/db.test.ts#L113)

- Idempotency: re-running `initialize` against a populated tmpdir DB preserves rows byte-identical.
  [`db.test.ts:44`](../../server/src/db.test.ts#L44)
