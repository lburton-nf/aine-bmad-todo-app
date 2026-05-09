---
type: deferred-work
project: todo-app-3
date: 2026-05-08
window-end: 14:00
status: build-complete
resumed-and-completed: 2026-05-08
---

# Deferred Work — todo-app-3

> **Resumed and shipped.** The 4-hour learning-exercise window ended with
> Story 1.1 complete and the rest deferred. The build was resumed in a later
> session and all five epics shipped — see the git log starting at commit
> `a9a2fbb` (`feat(epic-2): db module …`) and the README's "AI integration
> log" for the run-by-run narrative. The "What remains" inventory below has
> been removed; what remains now lives in REVIEW_1.md and the open issues
> there.
>
> The "Open questions surfaced by Story N review" sections below are kept
> because their content is still useful for future phases (UTF-16 grapheme
> question, additionalProperties:false hardening, Pino redact verification
> under enriched logging). They are not action items for this build.

## Open questions surfaced by Story 1.3 review

- **`HealthResponse.ok` literal type.** Story 1.3 typed `ok: true` to mirror architecture's documented success shape (`{ ok: true, version: ... }`). Story 1.4 confirmed: literal `true` stays — failures yield 503 with the default Fastify error envelope, a different type. **Resolved.**

## Open questions surfaced by Story 2.3 review

- **`description.length` is UTF-16 code units, not graphemes.** A 280-emoji description (each emoji = surrogate pair length 2) is rejected at ~140 emoji. Most clients won't notice, but this is a real Unicode correctness gap. Options: switch to `[...description].length` (counts code points) or `Intl.Segmenter` (counts graphemes, slower). UX spec doesn't specify the unit; v1 accepts UTF-16 code units. Document in user-facing copy when the client lands.
- **Extra/unknown body keys silently dropped.** A typo like `{ id, descripton: 'x' }` produces a 400 (description missing) but `{ id, description, completed: true, user_id: 'attacker' }` is accepted (extras dropped at destructuring + at the SQL projection — no security issue, but no signal to the client). Combined with Story 2.2's response-schema deferral, this points to a Fastify request schema (`additionalProperties: false`) hardening pass.

## Open questions surfaced by Story 2.2 review

- **Output JSON schemas (`additionalProperties: false`)** as defense-in-depth against `user_id` ever leaking into a response body. Today the contract is enforced by `db.ts`'s SELECT projection. Adding Fastify response schemas costs ~10 lines per route and would catch a future regression at the framework layer. Worth doing in a hardening pass.
- **`badRequest` helper duplicates the Fastify default error envelope.** If the framework's default shape ever changes, hand-rolled 400s will silently diverge from native 4xx responses. Either centralise via a small shared module or migrate to `@fastify/sensible`'s `httpErrors` API.

## Open questions surfaced by Story 2.1 review

- **Duplicate `id` PRIMARY KEY error needs route-layer translation.** `db.ts:createTodo` lets `better-sqlite3`'s `SqliteError` (constraint violation) bubble. Story 2.3 (POST /todos handler) MUST `try`/`catch` and translate to 400 with the standard envelope, otherwise duplicate-id retries surface as opaque 500s.
- **`listTodosForUser` is unbounded** — no `LIMIT`, no pagination, no streaming. v1 is single-user-per-browser with low CRUD frequency, so this is acceptable. When Growth-phase multi-user lands, add a `LIMIT` parameter and cursor pagination.
- **Pino redact rule remains defensive-only** (deferred from Story 1.4). Now that route handlers in 2.4 will log `request.userId` (post-validation), the redact path may need to widen beyond `req.headers["x-user-id"]`. Re-verify with a logging-on integration test when 2.4 lands.

## Open questions surfaced by Story 1.4 review

- **NFR-5 redact rule is defensive-only under Fastify's default `req` serializer.** The configured Pino `redact: ['req.headers["x-user-id"]']` matches a path that does NOT exist in Fastify v5's default request log shape (the default `req` serializer emits only `method, url, version, host, remoteAddress, remotePort` — no `headers`). NFR-5 is satisfied today *because* X-User-Id never reaches the log at all. If a future story enriches the request logger to include headers (e.g., for debugging), the redact path MUST be re-verified to actually fire — otherwise PII leaks. Test plan for that future story: `app.inject({headers: {'X-User-Id': 'anon-test'}})`, capture log output via a destination stream, assert the captured line does not contain `'anon-test'`.
- ~~**DB_PATH default is container-only.**~~ **Resolved 2026-05-08 (post-Story 2.2):** default changed to `./data/todos.db` (works on any OS). `db.ts:initialize` now `mkdirSync` the parent dir on first run. Production Docker deploys override `DB_PATH=/data/todos.db` via env (architecture's documented value).
- **0.0.0.0 listen host is hardcoded.** `index.ts` binds to all interfaces, which is correct for Docker but exposes the dev server on the LAN. A future enhancement: `HOST` env var with default `127.0.0.1` in development, `0.0.0.0` elsewhere.
- **Pino async log flush on `process.exit(1)`.** Calling `process.exit(1)` after `app.log.error(err)` can truncate Pino's async flush buffer. For production observability, switch to Pino's `final` handler or await flush before exit. Defer until a real outage is missed in logs.
- **`bodyLimit` boundary tests.** Current test verifies 2 KB → 413; no tests at 1024 (boundary) or 1023 (just under). Defer; gold-plating for v1.
