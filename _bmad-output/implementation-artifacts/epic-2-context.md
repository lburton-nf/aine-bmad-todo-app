# Epic 2 Context: Server — persistence, REST API, validation

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Stand up the full server feature surface on top of the Story 1.4 bootstrap: a single canonical `db.ts` persistence module, all six REST routes wired to it with hand-rolled input validation, and cross-user isolation enforced at the persistence layer. After this epic, the server is feature-complete, unit-tested via `app.inject`, and ready for the client to consume.

## Stories

- Story 2.1: Database module with schema initialization (5 typed query functions)
- Story 2.2: `GET /todos` — newest-first list, scoped by `X-User-Id`
- Story 2.3: `POST /todos` — write path; cross-user isolation invariant verified
- Story 2.4: `PATCH /todos/:id` and `DELETE /todos/:id` — full validation, identity preHandler hook, AI-3 (404 envelope unification)
- Story 2.5: `DELETE /todos` — bulk delete-mine

## Requirements & Constraints

- **Cross-user isolation (NFR-1) is the load-bearing invariant for this epic.** No SQL statement that reads, writes, or deletes from `todos` may run without a `WHERE user_id = ?` clause. This is enforced at the persistence layer — every db.ts function takes `userId` as a required argument and folds it into its query.
- **All SQL lives in `db.ts`.** Route handlers call typed functions; they never write SQL inline. Reviewer test for any new code: search for `'SELECT '` / `'INSERT '` / etc. outside `db.ts` — should return zero results.
- **`X-User-Id` validation runs as a global preHandler hook.** Every non-`/healthz` route receives a request with `X-User-Id` matching `^anon-[0-9a-f-]{36}$` exactly, or the hook returns 400 before any handler runs.
- **Input validation is hand-rolled at the API boundary.** Each route inspects its body inline against the shapes in `shared/types.ts` (length, presence, type). No `zod` or runtime validator library.
- **All success responses match `shared/types.Todo` exactly.** `id`, `description`, `created_at` (snake_case, unix epoch ms), `completed` (boolean). `user_id` NEVER appears in any response body.
- **All error responses use Fastify's default error envelope:** `{ statusCode, error, message }`.
- **AI-3:** PATCH/DELETE on a `:id` that does not exist OR is not owned by the caller MUST return 404 with the same envelope as a real not-found. The server MUST NOT distinguish "not found" from "not yours" — distinguishing leaks ownership across users.
- **Description size limit: 280 chars.** Empty / whitespace-only / over-280 → 400.
- **`id` is client-minted UUID** matching the standard UUID regex; server validates format and uniqueness.
- **`PATCH /todos/:id` accepts only `{ completed: boolean }`.** Description and creation-time are immutable in v1.
- **`DELETE /todos` (bulk) is auth-free** in the same sense the rest of the API is — scoped by `X-User-Id`, no other check. Verified by direct DB inspection that other users' rows survive.

## Technical Decisions

**Schema (single table):**

```sql
CREATE TABLE IF NOT EXISTS todos (
  id          TEXT    PRIMARY KEY,           -- client-minted UUID
  user_id     TEXT    NOT NULL,              -- anon-{uuid}, scopes every query
  description TEXT    NOT NULL,              -- ≤ 280 chars
  created_at  INTEGER NOT NULL,              -- unix epoch ms
  completed   INTEGER NOT NULL DEFAULT 0     -- 0|1 (SQLite has no BOOLEAN)
);
CREATE INDEX IF NOT EXISTS todos_user_id_created_at
  ON todos (user_id, created_at DESC);
```

The composite index supports the only query shape used by `GET /todos`: `SELECT … WHERE user_id = ? ORDER BY created_at DESC`.

**Schema initialization is idempotent.** `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` run on every boot. No migrations framework in v1 — schema lives at the top of `db.ts` and Just Works on a fresh volume.

**Persistence client: `better-sqlite3`** — synchronous API, prepared-statement caching, single connection per process. No async/await machinery. No connection pool (single user per browser, low CRUD frequency).

**Boolean translation at the persistence boundary.** SQLite stores `completed` as 0/1; the wire/type shape is `boolean`. `db.ts` is the only place this conversion happens. Read paths convert 0→false / 1→true; write paths convert false→0 / true→1.

**`db.ts` shape — closure factory, not module singleton.** `initialize(dbPath)` returns a typed `Db` object whose methods are closure-bound to a single connection and prepared statements. This makes tests simple (`initialize(':memory:')` per test) and avoids the module-mutation pitfalls of a singleton.

**Five typed functions** (all take `userId: string` as the first argument, all are scoped by `WHERE user_id = ?`):

- `listTodosForUser(userId): Todo[]`
- `createTodo(userId, input: CreateTodoRequest): Todo`
- `updateCompleted(userId, id, completed): Todo | null` — returns null on miss/cross-user (AI-3)
- `deleteTodo(userId, id): boolean` — returns false on miss/cross-user (AI-3)
- `deleteAllForUser(userId): number` — returns count deleted

**`buildServer()` accepts a `Db` instance (not a `dbPath`)**. The factory used to take only `corsOrigin` + `logger`; we extend it with `db: Db`. `index.ts` calls `initialize(env.DB_PATH)` and passes the result. Tests construct an in-memory `Db` and inject it. Keeps the bootstrap layered cleanly.

**Identity preHandler hook** (Story 2.4, but referenced everywhere): a single Fastify `addHook('preHandler', ...)` registered in `buildServer()` after CORS. Reads `request.headers['x-user-id']`, validates the format, attaches the validated value to `request.userId` (declared via Fastify type augmentation), or replies 400. `/healthz` is excluded by checking `request.routeOptions.url`.

## Cross-Story Dependencies

- **2.1 → 2.2–2.5.** All four route stories consume the `Db` interface 2.1 ships. Getting the function signatures right here is load-bearing.
- **2.4 → 2.2, 2.3, 2.5.** The identity preHandler 2.4 introduces is global; once it lands, earlier-written routes inherit it. Story order can be 2.1 → 2.2 → 2.3 → 2.4 → 2.5, accepting that 2.2/2.3's first form will not yet enforce identity validation centrally.
- **AI-3 (2.4) interacts with `db.ts` semantics**: the "not found vs not yours" unification is enforced by `db.ts` returning the same null/false for both cases — handlers don't need extra logic.
- **Epic 3 (client) consumes `Todo` from `shared/types`** and the route surface defined here. Wire-shape stability across this epic is what unblocks Epic 3.
