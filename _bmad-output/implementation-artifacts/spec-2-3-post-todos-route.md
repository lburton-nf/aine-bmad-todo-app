---
title: 'Story 2.3 — POST /todos write path with cross-user isolation'
type: 'feature'
created: '2026-05-08'
status: 'done'
baseline_commit: '77074f6d27aa5fb25070478a977fb19f10d9ff0d'
context:
  - _bmad-output/implementation-artifacts/epic-2-context.md
  - _bmad-output/implementation-artifacts/spec-2-2-get-todos-route.md
  - _bmad-output/implementation-artifacts/spec-2-1-db-module-with-schema-init.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The read path is live (Story 2.2) but no client can yet create a todo. POST /todos is the natural counterpart, and it's the first place input validation, duplicate-id error translation, and the cross-user isolation invariant get exercised end-to-end through HTTP.

**Approach:** Extend `server/src/routes/todos.ts` with `app.post('/todos', ...)`. The handler validates `X-User-Id` (same inline check as GET — Story 2.4 hoists), validates the JSON body inline against `CreateTodoRequest` (`id` UUID format + `description` non-empty ≤ 280 chars), then calls `app.db.createTodo(userId, input)`. Duplicate-id `SQLITE_CONSTRAINT_PRIMARYKEY` errors from `db.ts` are caught and translated to 400 with the standard envelope (per the deferred-work note from Story 2.1 review). On success: 201 + the persisted `Todo` JSON.

## Boundaries & Constraints

**Always:**
- `POST /todos` returns `201 Created` with the persisted `Todo` JSON (`shared/types.Todo` shape — snake_case `created_at`, no `user_id`).
- Body validation runs before any DB call: `id` is a string matching the canonical UUID regex `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/`; `description` is a string with `.trim().length` between 1 and 280 inclusive. Missing or empty body, missing fields, wrong types, or out-of-bounds values → 400 with the default envelope.
- `X-User-Id` validation matches the GET path exactly. Inline regex check; missing/malformed/array → 400 (same wording reuse where possible).
- Duplicate `id` SqliteError from `db.createTodo` is caught and translated to 400 with the standard envelope. The handler does NOT distinguish "id collision with same user" from "id collision with another user" — both are "id already exists" (this is consistent with AI-3 cross-user opacity).
- `created_at` (`Date.now()` in `db.ts`) and `completed` (default `false`) are NOT accepted in the request body; the route never sets either.
- All SQL stays in `db.ts`; the handler calls `app.db.createTodo(userId, input)` only.
- Cross-user isolation verified end-to-end in tests: U1 POST + U2 POST, then GET round-trip per user.

**Ask First:**
- (none — every decision locked by architecture, epic-2-context, and spec-2-1's deferred-work note)

**Never:**
- Accepting `completed` or `created_at` in the request body. The wire shape for create is `CreateTodoRequest` = `{ id, description }`.
- Returning a 409 Conflict for duplicate id. The architecture's standard error envelope is 400 with `{ statusCode: 400, error: 'Bad Request', message: '...' }`. Adding 409 means a second response shape and a deviation from the architecture.
- Trimming `description` server-side before persisting. Whitespace-only is rejected; otherwise persist verbatim (the user's leading/trailing spaces are theirs).
- Adding rate limiting, request-id headers, or any plugin from `@fastify/...`.
- Adding a Fastify schema for body validation (architecture: hand-rolled inline validation only).
- Touching the GET handler from Story 2.2.

</frozen-after-approval>

## Code Map

- `server/src/routes/todos.ts` — EDIT. Register `POST /todos`. Add a typed validator helper for `CreateTodoRequest`. Wrap `app.db.createTodo` in try/catch for duplicate-id translation. Reuse the existing `badRequest` helper and `USER_ID_REGEX`.
- `server/src/routes/todos.test.ts` — EDIT. Add 7+ inject tests covering: happy path with shape + persistence verification; cross-user isolation (U1 + U2 round-trip via POST then GET); duplicate id → 400; description boundary cases (empty, whitespace-only, exactly 281 chars); missing body; missing `X-User-Id` carries through; bad id format → 400.

## Tasks & Acceptance

**Execution:**

- [x] `server/src/routes/todos.ts` — extract `UUID_REGEX` constant + `extractUserId` + `validateCreateBody` + `isPrimaryKeyViolation` helpers; register `app.post('/todos', ...)` with auth → body validation → `try createTodo / catch SQLITE_CONSTRAINT_PRIMARYKEY → 400`.
- [x] `server/src/routes/todos.test.ts` — added 8 POST tests: happy path, cross-user round-trip, duplicate id same-user, duplicate id different-user (AI-3 unification), description boundaries (empty/whitespace/281-too-long/280-ok), bad id formats (not-uuid/uppercase/short/missing), missing body / non-JSON, missing X-User-Id.

**Acceptance Criteria:**

- Given a valid `X-User-Id` and body `{ id: <valid UUID>, description: 'Buy milk' }`, when `POST /todos` is sent, then the response is `201` with body matching `Todo` shape (keys exactly `id, description, created_at, completed`), `completed:false`, `created_at` between request-start and request-end millis.
- Given the persisted row, when fetched via `app.db.listTodosForUser(userId)`, then exactly one row exists with the supplied `id`, the supplied `description`, and `created_at` matching the response.
- Given U1 and U2 each POST a todo, when each issues `GET /todos`, then U1 sees only U1's row and U2 sees only U2's row (FR13 / NFR-1 verified end-to-end through HTTP).
- Given a body whose `id` already exists (same user OR different user), when POST is sent, then the response is `400` with `{ statusCode: 400, error: 'Bad Request', message: <string> }`. The "different user" case behaves identically to "same user" (no ownership leak).
- Given a body with `description: ''`, `description: '   '`, or `description: 'x'.repeat(281)`, then the response is `400` with the default envelope. The DB is unchanged after each.
- Given a body with `id: 'not-a-uuid'`, `id: 'ABCDEF12-3456-7890-ABCD-EF1234567890'` (uppercase), or `id` missing, then the response is `400`.
- Given a request with no body, malformed JSON body, or `Content-Type` not `application/json`, then the response is `400`.
- Given a request with no `X-User-Id`, then `400` (route layer rejects before DB; matches GET behavior).
- Given the existing tests, when `npm test` runs from repo root, all pass and the new tests add ≥ 7 cases.
- Given `npm run lint`, `npm run build` (server), `npx prettier --check .` (root), and `npm run test:coverage --prefix server`, all exit 0 and coverage stays above 80%.

## Spec Change Log

### 2026-05-08 — Hardening patch (review-driven)

**Trigger:** Edge-case hunter caught that `Array.isArray([])` satisfies `typeof === 'object'`, so a JSON array body sneaks past the type guard and surfaces as a misleading "id must be a UUID" 400 instead of "body must be a JSON object".

**Amendment:** `validateCreateBody` now rejects arrays explicitly. Test added asserting that `[ { id, description } ]` produces the JSON-object message, not a downstream id-validation message.

**KEEP instructions for re-derivation:**
- Array-rejection survives — it's a one-line accuracy fix with no fidelity cost.
- Do NOT add request-body schemas for additionalProperties:false — see deferred-work; gold-plating for v1.

## Design Notes

- **Inline body validation, not Fastify schemas.** Architecture explicitly chose hand-rolled validation over `zod` or `@fastify/schema` to avoid the extra dependency on a 6-route surface. The pattern is: parse, check, return early on failure. Each rule lives next to its message.
- **Duplicate id translation via `err.code === 'SQLITE_CONSTRAINT_PRIMARYKEY'`.** Duck-typed check avoids importing `SqliteError`; keeps routes one-way-coupled to `db.ts`.
- **No 409 Conflict** — architecture's envelope is 400-shaped only. Introducing 409 means a second envelope; boring governor wins.
- **`description` persisted verbatim after the trim-checks.** Whitespace-only is rejected; otherwise the user's leading/trailing spaces are theirs.
- **Test both same-user and different-user duplicate id** to lock in the no-leak invariant — an attacker probing for known ids must get the same 400 as a real client retrying.

## Verification

**Commands:**

- `cd server && npm run lint` — exit 0
- `cd server && npm test` — all existing + ≥ 7 new tests, exit 0
- `cd server && npm run build` — exit 0
- `npm test` from repo root — exit 0
- `npm run test:coverage --prefix server` — passes 80% thresholds
- `npx prettier --check .` from repo root — exit 0

**Manual:**

- `npm run dev` then:
  - `curl -X POST -H 'Content-Type: application/json' -H 'X-User-Id: anon-11111111-1111-1111-1111-111111111111' -d '{"id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","description":"manual test"}' http://localhost:3000/todos` → `201` + Todo JSON
  - Same command twice → second returns `400` (duplicate)
  - `curl -H 'X-User-Id: anon-11111111-1111-1111-1111-111111111111' http://localhost:3000/todos` → array containing the row

## Suggested Review Order

**Validation pipeline** (entry — start here)

- The POST handler — auth → body validation → DB call wrapped in PK-violation translator.
  [`todos.ts:80`](../../server/src/routes/todos.ts#L80)

- `validateCreateBody` — array-rejection (added during review), id UUID format, description trim+length rules.
  [`todos.ts:35`](../../server/src/routes/todos.ts#L35)

- `isPrimaryKeyViolation` — duck-typed err-code check, keeps routes one-way coupled to better-sqlite3.
  [`todos.ts:64`](../../server/src/routes/todos.ts#L64)

- Refactored shared `extractUserId` — both GET and POST use it; behavior identical to Story 2.2's inline check.
  [`todos.ts:14`](../../server/src/routes/todos.ts#L14)

**AI-3 cross-user invariants verified end-to-end through HTTP**

- POST + GET round-trip: U1 + U2 each POST, each GET sees only their own.
  [`todos.test.ts:183`](../../server/src/routes/todos.test.ts#L183)

- Duplicate id from a DIFFERENT user gets the same 400 message — no ownership leak.
  [`todos.test.ts:230`](../../server/src/routes/todos.test.ts#L230)

**Boundary tests**

- description: empty / whitespace-only / 281-too-long / 280-just-fits.
  [`todos.test.ts:248`](../../server/src/routes/todos.test.ts#L248)

- id: not-a-uuid / uppercase / wrong length / missing.
  [`todos.test.ts:267`](../../server/src/routes/todos.test.ts#L267)

- Array body — review patch: explicit "JSON object" message instead of downstream UUID error.
  [`todos.test.ts:285`](../../server/src/routes/todos.test.ts#L285)
