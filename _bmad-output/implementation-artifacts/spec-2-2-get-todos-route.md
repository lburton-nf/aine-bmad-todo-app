---
title: 'Story 2.2 — GET /todos with newest-first ordering'
type: 'feature'
created: '2026-05-08'
status: 'done'
baseline_commit: 'c5cabdec4ae7f412d9c446ac199823b399e195e0'
context:
  - _bmad-output/implementation-artifacts/epic-2-context.md
  - _bmad-output/implementation-artifacts/spec-2-1-db-module-with-schema-init.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The persistence layer is live (Story 2.1) but no HTTP surface consumes it. The first read endpoint — `GET /todos` returning the caller's rows newest-first — is the natural smoke test for the whole bootstrap-to-db chain and the unblocker for Epic 3 (client).

**Approach:** Add `server/src/routes/todos.ts` as a Fastify plugin that registers `GET /todos`. The handler validates `X-User-Id` inline against `/^anon-[0-9a-f-]{36}$/` (Story 2.4 will refactor inline validation into a global `preHandler` hook), then calls `app.db.listTodosForUser(userId)` and replies 200 with the array. `buildServer` registers the plugin once. This sets up `routes/` as the canonical home for Epic 2's six handlers.

## Boundaries & Constraints

**Always:**
- `GET /todos` returns 200 with a JSON array of `Todo` objects (`shared/types.Todo`) — `id`, `description`, `created_at`, `completed`. Empty list → `[]`.
- Ordering is newest-first by `created_at`, with `id DESC` tiebreaker (already enforced by the SQL prepared in `db.ts`).
- `user_id` NEVER appears in any response (architecture invariant).
- Missing `X-User-Id` header OR a value that does not match `/^anon-[0-9a-f-]{36}$/` exactly → 400 with the Fastify default error envelope `{ statusCode, error, message }`. The handler does not run `db.listTodosForUser` in either case.
- All SQL stays in `db.ts` (NFR-1). The route handler calls `app.db.listTodosForUser(userId)` only — no inline SQL.
- Route file lives at `server/src/routes/todos.ts` as a Fastify plugin (default export), registered once from `buildServer`. This anchors the `routes/` directory architecture documents.
- `:memory:` injected `Db` is the test pattern, mirroring Story 2.1.

**Ask First:**
- (none — architecture, epic-2-context, and spec-2-1 lock every decision)

**Never:**
- Introducing a global `preHandler` hook for `X-User-Id` in this story. Story 2.4 owns that refactor; pulling it forward expands scope and forces Story 2.4 to delete instead of strengthen.
- Adding `@fastify/sensible` or any other plugin for HTTP-error helpers. The hand-rolled `reply.code(400).send({...})` pattern is fine for v1's six routes.
- Adding any other `/todos` verb (POST/PATCH/DELETE) — those land in 2.3, 2.4, 2.5.
- Caching, ETags, or `If-Modified-Since` handling — out of scope.
- Pagination, `LIMIT`, or cursors — already deferred from Story 2.1.

</frozen-after-approval>

## Code Map

- `server/src/routes/todos.ts` — NEW. Fastify plugin: registers `GET /todos`. Handler validates `X-User-Id` inline, calls `app.db.listTodosForUser`, replies 200 with the array.
- `server/src/server.ts` — EDIT. Register the new plugin (`await app.register(todosRoutes)`) after CORS, before returning the instance.
- `server/src/routes/todos.test.ts` — NEW. ≥ 5 inject tests: empty list, populated list newest-first, cross-user isolation, missing header → 400, malformed header → 400.

## Tasks & Acceptance

**Execution:**

- [x] `server/src/routes/todos.ts` — export a default async Fastify plugin that registers `GET /todos`. Handler: read `request.headers['x-user-id']`; if not a non-empty string OR does not match `/^anon-[0-9a-f-]{36}$/`, reply `400` with `{ statusCode: 400, error: 'Bad Request', message: 'X-User-Id header missing or malformed' }`; else `return reply.code(200).send(app.db.listTodosForUser(userId))`.
- [x] `server/src/server.ts` — `import todosRoutes from './routes/todos'; await app.register(todosRoutes);` registered after `/healthz`.
- [x] `server/src/routes/todos.test.ts` — five tests: empty list, populated list newest-first with shape check, cross-user isolation, missing header → 400, malformed header → 400 (4 cases including length boundary).

**Acceptance Criteria:**

- Given a user `U1` with three rows persisted in any order, when `GET /todos` is sent with `X-User-Id: <U1>`, then the response is `200` with a JSON array of three `Todo` objects ordered by `created_at` descending.
- Given the response body, when each element is inspected, then it has exactly the fields `id`, `description`, `created_at`, `completed` and NO `user_id` key.
- Given an empty DB, when `GET /todos` is sent with a valid `X-User-Id`, then the response is `200` with body `[]`.
- Given two users `U1` and `U2` each with rows, when `U1` requests `GET /todos`, then the response includes only `U1`'s rows; `U2`'s rows are not present.
- Given a request with no `X-User-Id` header, when `GET /todos` is sent, then the response is `400` with body matching `{ statusCode: 400, error: 'Bad Request', message: <string> }`. `db.listTodosForUser` is NOT called (verifiable: the in-memory DB is empty after the request).
- Given a request with `X-User-Id: not-an-anon-id`, when `GET /todos` is sent, then the response is `400` with the same envelope shape. The regex match is exact (no partial matches accepted).
- Given the existing test suite, when `npm test` runs from repo root, then client + all server tests still pass and the new `todos.test.ts` adds ≥ 5 passing cases.
- Given `npm run lint`, `npm run build` (server), and `npx prettier --check .` (root), all exit 0.
- Given `npm run test:coverage --prefix server`, branches/lines/funcs/statements all stay above 80%.

## Spec Change Log

### 2026-05-08 — Hardening patches (review-driven)

**Trigger:** Adversarial + edge-case review (acceptance auditor reported clean). Three focused improvements to the route + tests.

**Amendments:**

1. **Explicit array `X-User-Id` handling.** When the header arrives as an array (duplicate sends), the handler now returns a distinct 400 ("sent multiple times") rather than collapsing to the generic "missing or malformed" path. Cleaner operator diagnostics.
2. **Empty-string `X-User-Id` test case** added to the malformed batch — separate code path from "missing entirely."
3. **NFR-5 lock-in test** asserts the 400 response body does NOT echo the bad header value back to the client. Stops a future "helpful error message" change from silently leaking the supplied id into logs/responses.

**KEEP instructions for re-derivation (if this spec re-loops):**
- All three patches survive — none touch the frozen block.
- Do NOT add Fastify response schemas (`additionalProperties: false`) — defense-in-depth against `user_id` leak is gold-plating for v1; deferred-work tracks it.

## Design Notes

- **Inline validation, not a preHandler hook.** Story 2.4's AC explicitly introduces the global hook; pulling it forward turns 2.4 into a deletion exercise. The inline form is 4 lines and trivially refactorable later — `epic-2-context.md` documents this trade.
- **Response shape uses the snake_case `created_at`** to match `shared/types.Todo` and the architecture's wire shape. The epics-doc reference to `createdAt` in this story's AC is stylistic noise — the canonical shape lives in the shared types module and was locked in Story 1.3.
- **No JSON schema on the response.** Fastify supports `schema: { response: { 200: ... } }` for validation/serialization. v1 picks the simpler "trust the types" path; the 400 envelope is hand-rolled. Adding schema validation later is mechanical.
- **Plugin form is a default export.** Fastify v5 prefers `FastifyPluginAsync` for new code. Default-export keeps the registration call at one line in `server.ts`.

## Verification

**Commands:**

- `cd server && npm run lint` — exit 0
- `cd server && npm test` — all existing tests + ≥ 5 new in `routes/todos.test.ts`, exit 0
- `cd server && npm run build` — exit 0; `dist/server/src/routes/todos.js` present
- `npm test` from repo root — client 2/2 + server (≥ 29) pass, exit 0
- `npm run test:coverage --prefix server` — passes 80% thresholds on all metrics
- `npx prettier --check .` from repo root — exit 0

**Manual:**

- `cd server && npm run dev` then `curl -H 'X-User-Id: anon-11111111-1111-1111-1111-111111111111' http://localhost:3000/todos` → `200 []`. With `-H 'X-User-Id: nope'` → `400` + JSON envelope.

## Suggested Review Order

**Route handler** (entry — start here)

- The plugin: validates `X-User-Id` inline, calls `app.db.listTodosForUser`, returns the array. Note the array-headers defensive branch (dead code under Node's transport behavior — see Spec Change Log §1).
  [`todos.ts:11`](../../server/src/routes/todos.ts#L11)

- Inline validation regex — Story 2.4 will hoist to a global preHandler.
  [`todos.ts:5`](../../server/src/routes/todos.ts#L5)

**Bootstrap wiring**

- Plugin registered after `/healthz` and after the `app.db` decorator.
  [`server.ts:52`](../../server/src/server.ts#L52)

**Tests** (NFR-5 + cross-user isolation are load-bearing)

- NFR-5 lock-in: 400 response does NOT echo the bad header value.
  [`todos.test.ts:131`](../../server/src/routes/todos.test.ts#L131)

- Cross-user isolation: U1's GET only returns U1's rows.
  [`todos.test.ts:60`](../../server/src/routes/todos.test.ts#L60)

- Wire-shape lock-in: response keys are `{completed, created_at, description, id}` only — no `user_id`.
  [`todos.test.ts:51`](../../server/src/routes/todos.test.ts#L51)
