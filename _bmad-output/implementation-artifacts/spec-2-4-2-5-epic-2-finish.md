---
title: 'Stories 2.4 + 2.5 — Epic 2 finish: PATCH/DELETE/:id, bulk DELETE, global identity hook'
type: 'feature'
created: '2026-05-08'
status: 'done'
baseline_commit: '7db5668d09b35c7d42577855d33f95977ee20618'
context:
  - _bmad-output/implementation-artifacts/epic-2-context.md
  - _bmad-output/implementation-artifacts/spec-2-3-post-todos-route.md
---

<frozen-after-approval reason="human-owned intent — bundled by explicit user choice (belt mode)">

## Intent

**Problem:** Epic 2's REST surface has GET + POST shipped, but mutate/delete and bulk-delete are missing — the server isn't feature-complete. Inline X-User-Id checks in `todos.ts` duplicate logic that belongs at the framework layer per the architecture and `epic-2-context.md`.

**Approach:** Land the remaining REST verbs in one cycle and refactor auth to a single seam. Concretely: (1) introduce a global `preHandler` hook in `buildServer` that validates `X-User-Id` once, attaches `request.userId`, and skips `/healthz`; (2) add `PATCH /todos/:id` (body `{ completed: boolean }` only) and `DELETE /todos/:id` to `routes/todos.ts`; (3) add `DELETE /todos` (bulk delete-mine) returning 204; (4) simplify the existing GET + POST handlers to read `request.userId` instead of re-validating. AI-3 unification (404 for missing OR not-owned, identical envelope) is enforced at the route layer by reading `null`/`false` from `db.ts`.

**Bundling rationale:** Per the SCOPE STANDARD, the three new routes ARE technically independent shippable units. Bundling is an explicit user choice in belt mode — the preHandler refactor shared by all three routes is the integration point that makes a single review pass coherent.

## Boundaries & Constraints

**Always:**
- The preHandler hook runs for EVERY route except `/healthz`. It reads `request.headers['x-user-id']`, applies the same regex/array-rejection logic the inline check did, and on failure replies 400 with the standard envelope BEFORE any handler runs. On success it attaches `request.userId: string` (typed via Fastify module augmentation).
- `PATCH /todos/:id` body is validated inline: must be a JSON object with `completed: boolean` and no other recognised fields used. Wrong type / missing / extra-but-significant fields → 400. The route does NOT accept `description`, `created_at`, or `id` in the body.
- `PATCH` calls `app.db.updateCompleted(userId, id, completed)`. If the result is `null` (missing OR not-owned, AI-3), reply 404 with the standard envelope. If non-null, reply 200 with the updated `Todo` JSON.
- `DELETE /todos/:id` calls `app.db.deleteTodo(userId, id)`. If `false` (missing OR not-owned, AI-3), reply 404. If `true`, reply 204 No Content.
- `DELETE /todos` (bulk) calls `app.db.deleteAllForUser(userId)` and replies 204 No Content. Empty case returns 204 (zero rows deleted is success, not 404).
- The `:id` path parameter is validated against the same UUID regex as POST bodies. Bad-format `:id` → 400 (consistent with the architecture's "validate at boundary" stance).
- All response shapes match `shared/types.Todo` exactly. `user_id` never appears.
- Existing GET + POST behavior is preserved end-to-end; existing tests pass without modification (the preHandler produces 400s with the same envelope shape that inline rejection produced).

**Ask First:**
- (none — every decision locked by architecture + epic-2-context)

**Never:**
- Allowing `PATCH` on `description`, `created_at`, or `id`. Description and creation-time are immutable in v1.
- Returning a different envelope for AI-3 404s (e.g. "this id belongs to another user"). Same envelope, same shape, indistinguishable from "row missing".
- Returning a body on the 204 paths. Some clients break on 204+body.
- Adding `If-Match` / `ETag` / optimistic concurrency. v1 is single-user-per-browser; no concurrent-edit problem.
- Touching `db.ts` — Story 2.1 already returns `null`/`false` uniformly for AI-3 cases.
- Centralising the 400 envelope into `@fastify/sensible` or any helper module beyond the existing `badRequest` function in `routes/todos.ts`.

</frozen-after-approval>

## Code Map

- `server/src/server.ts` — EDIT. Augment `FastifyRequest` with `userId: string`. Register the global preHandler hook AFTER CORS and BEFORE the routes plugin. Hook signature: skip if `request.routeOptions.url === '/healthz'`; else extract + validate; on failure `reply.code(400).send({ ... })`; on success set `request.userId`.
- `server/src/routes/todos.ts` — EDIT. Drop the inline `extractUserId` calls in GET and POST handlers; use `request.userId`. Add `PATCH /todos/:id`, `DELETE /todos/:id`, `DELETE /todos` (bulk). Add `validatePatchBody` helper (only `completed: boolean`). Reuse `UUID_REGEX` for `:id` validation.
- `server/src/routes/todos.test.ts` — EDIT. Existing GET + POST tests continue to pass without changes (verify). Add 9 new tests: PATCH happy + cross-user 404 + non-existent 404 + bad body (3 cases: empty, wrong type, extra fields) + bad :id format; DELETE :id happy + cross-user 404 + non-existent 404; DELETE bulk happy + bulk-from-empty + bulk-cross-user-survives.

## Tasks & Acceptance

**Execution:**

- [x] `server/src/server.ts` — `declare module 'fastify' { interface FastifyRequest { userId: string } }`. preHandler scoped to the todos plugin (NOT global) — keeps /healthz auth-free AND keeps unmatched paths landing on Fastify's default 404 (AI-2 invariant from Story 1.4).
- [x] `server/src/routes/todos.ts` — plugin-scoped preHandler does the X-User-Id validation once. Added `notFound` helper, `validatePatchBody`, and three new handlers: PATCH/:id, DELETE/:id, DELETE bulk. GET + POST simplified to use `request.userId`.
- [x] `server/src/routes/todos.test.ts` — added 11 new tests across PATCH/DELETE/bulk paths (covering happy, AI-3 cross-user 404, AI-3 non-existent 404, body validation, :id format, empty bulk, cross-user-survival on bulk). All 17 prior tests still pass unchanged. Total server suite: 40 → 51.

**Acceptance Criteria:**

- Given any request to a route OTHER than `/healthz`, when `X-User-Id` is missing, malformed, or duplicated, then the response is 400 with the standard envelope BEFORE the handler runs (verifiable by registering a probe route and asserting it never sees a request without a valid `userId`).
- Given a request to `/healthz`, when `X-User-Id` is missing, then the response is still 200 (the hook skips healthz).
- Given U1 owns row R, when U1 sends `PATCH /todos/:R` with `{ completed: true }`, then the response is 200 with R now `completed: true`. The DB row reflects the change.
- Given U1 owns row R, when U2 sends `PATCH /todos/:R` with `{ completed: true }` OR `DELETE /todos/:R`, then the response is 404 with the standard envelope. R is unchanged.
- Given a non-existent id, when ANY user sends `PATCH /todos/:id` or `DELETE /todos/:id`, then the response is 404 with the SAME envelope shape and message wording as the cross-user case (no leak).
- Given `PATCH /todos/:id` with body `{}`, `{ completed: 'yes' }`, `{ completed: true, description: 'x' }`, or non-JSON, then the response is 400.
- Given `:id` is not a UUID format on PATCH or DELETE, then the response is 400.
- Given U1 with N rows and U2 with M rows, when U1 sends `DELETE /todos`, then the response is 204 No Content with no body. U1's rows are zero, U2's M rows are unchanged.
- Given a user with zero rows, when they send `DELETE /todos`, then the response is still 204 (empty bulk delete is success).
- Given the existing test suite, when run, then all GET + POST tests still pass without modification.
- Given lint, build, prettier, coverage, all green; coverage stays ≥ 80% on every metric.

## Spec Change Log

### 2026-05-08 — Implementation deviation (one)

**Trigger:** Initial implementation registered the preHandler hook globally on `app`, which intercepted every request including unmatched paths. Story 1.4's AI-2 test (`GET /nope` → 404 with default JSON envelope) failed with 400 because the global hook fired before Fastify's default 404 handler.

**Amendment:** Moved the preHandler hook into the todos plugin instead. Plugin-scoped hooks only run for routes registered within the plugin (the four /todos verbs). `/healthz` and any unmatched path skip the hook — `/healthz` returns 200 without auth, unmatched paths return Fastify's default 404. AI-2 invariant preserved.

**KEEP:** plugin-scoped (not global) hook is the correct pattern. If future routes need auth, register them under the same plugin or replicate the hook.

## Design Notes

- **The hook attaches `userId: string`, not `userId?: string`.** Module augmentation declares it as required; the hook either sets it or replies 400 (handler never runs). Handlers can access `request.userId` without nullable handling.
- **`/healthz` skip via `request.routeOptions.url`.** Fastify v5's lifecycle exposes the matched route URL on `request.routeOptions.url` at `preHandler` time. This is more robust than checking `request.url` (which carries the raw URL with any query string).
- **404 over 403 for AI-3.** Both "missing" and "not yours" return 404. 403 would acknowledge the row exists; the architecture explicitly chose 404 to avoid that leak.
- **204 over 200+empty body for bulk delete.** Architecture's response-shape table allows either; 204 is smaller, cleaner, and avoids parsing an empty body on the client side.
- **`PATCH` validation rejects extras.** A body of `{ completed: true, description: 'x' }` is 400, not "silently ignore description". This stops a client from THINKING they're updating the description and getting silent acceptance.

## Verification

**Commands:**

- `cd server && npm run lint` — exit 0
- `cd server && npm test` — all existing + 9+ new, exit 0
- `cd server && npm run build` — exit 0
- `npm run test:coverage --prefix server` — passes 80% on every metric
- `npx prettier --check .` from repo root — exit 0

**Manual:**

- `npm run dev` then walk the full lifecycle: POST a todo, PATCH it, GET to confirm, DELETE :id, GET to confirm gone. Then POST 3 more, DELETE bulk, GET to confirm empty.

## Suggested Review Order

**Architectural seam** (entry — start here)

- Plugin-scoped preHandler — auth runs once for /todos; unmatched paths still get the framework 404 (AI-2 preserved).
  [`todos.ts:80`](../../server/src/routes/todos.ts#L80)

- `FastifyRequest.userId` augmentation — handlers read a typed `request.userId` instead of re-validating.
  [`server.ts:9`](../../server/src/server.ts#L9)

**New routes**

- PATCH /todos/:id — UUID validation, body check, AI-3 unification (null → 404).
  [`todos.ts:119`](../../server/src/routes/todos.ts#L119)

- DELETE /todos/:id — same shape; false → 404, true → 204.
  [`todos.ts:132`](../../server/src/routes/todos.ts#L132)

- DELETE /todos (bulk) — 204 always, no body.
  [`todos.ts:142`](../../server/src/routes/todos.ts#L142)

**Tests** (AI-3 unification is the load-bearing invariant)

- PATCH cross-user 404 + verifies victim row is unchanged.
  [`todos.test.ts:333`](../../server/src/routes/todos.test.ts#L333)

- DELETE cross-user 404 + verifies victim row survives.
  [`todos.test.ts:412`](../../server/src/routes/todos.test.ts#L412)

- Bulk DELETE preserves OTHER users' rows (FR13 cross-user isolation).
  [`todos.test.ts:475`](../../server/src/routes/todos.test.ts#L475)
