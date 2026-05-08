---
title: 'Story 1.4 — Server bootstrap with healthcheck and bodyLimit'
type: 'feature'
created: '2026-05-08'
status: 'done'
baseline_commit: '2d0bc37935d3d57235e661ab234342621b801161'
context:
  - _bmad-output/implementation-artifacts/epic-1-context.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/implementation-artifacts/spec-1-3-shared-types-and-design-tokens.md
  - _bmad-output/implementation-artifacts/deferred-work.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The server is a one-line placeholder (`console.log('server starting')`). Every Epic 2 route needs a Fastify instance constructed with the v1 architectural invariants — bodyLimit, CORS, logger with `X-User-Id` redaction — and an observable `/healthz` for orchestrator liveness. Without this bootstrap, the next story (2.1 — db module) has nothing to register against.

**Approach:** Replace `server/src/index.ts` with a real Fastify bootstrap that constructs the instance with `bodyLimit: 1024` (AI-1), registers `@fastify/cors` from `CORS_ORIGIN` env var, configures Pino with the `req.headers["x-user-id"]` redact rule (NFR-5), and registers `GET /healthz` returning `{ ok: true, version }` typed via `shared/types.HealthResponse`. Centralise env-var parsing in `server/src/env.ts`. Adjust `server/tsconfig.json` so `import { Todo } from '../../shared/types'` (and friends) compiles under `tsc`.

## Boundaries & Constraints

**Always:**
- **AI-1 invariant:** the Fastify constructor MUST set `bodyLimit: 1024`. A 1 KB+ request body must yield 413 Payload Too Large from the framework, before any handler runs.
- **AI-2 invariant:** no SPA fallback. Unmatched paths return Fastify's default 404 envelope. Do NOT register `setNotFoundHandler` to serve `index.html` or any catch-all route.
- **NFR-5 invariant:** Pino redacts `req.headers["x-user-id"]` from every log line. The redact path is configured at logger construction.
- `GET /healthz` returns 200 with body `{ ok: true, version: <package.json version> }`. The response is typed against `HealthResponse` from `shared/types`.
- `@fastify/cors` is registered with origin = `CORS_ORIGIN` env var (string match) and `X-User-Id` allow-listed in `Access-Control-Allow-Headers`.
- Env vars (`PORT`, `DB_PATH`, `CORS_ORIGIN`, `NODE_ENV`) are parsed in a single module (`server/src/env.ts`) with documented defaults and exported as a frozen object.
- The server listens on `0.0.0.0` (not `localhost`) so it is reachable from the Docker container's outside in Story 5.x.
- All cross-runtime imports of `shared/types` use the relative path documented in architecture (`'../../shared/types'`); no tsconfig `paths` aliases.

**Ask First:**
- (none — every decision is locked by `architecture.md` and `epic-1-context.md`)

**Never:**
- Touching `server/src/db.ts` or registering any non-`/healthz` route. Database wiring is Story 2.1; CRUD routes are Stories 2.2–2.5.
- Adding rate limiting, helmet, or other security middleware. NFR-11 explicitly defers this.
- Replacing Fastify's default error envelope. The architecture's contract IS Fastify's default `{ statusCode, error, message }` shape.
- Introducing dotenv, zod, or any env-validation/loading library. Hand-rolled `process.env.X ?? default` is the boring-governor choice for 4 vars.
- Adding `helmet`, `@fastify/helmet`, security headers, or CSP — Growth phase.
- Writing the schema-init or `db.ts` even as a stub; bootstrap must leave a clean seam for Story 2.1.
- Logging at `info` level or above when `NODE_ENV === 'development'` makes the test output noisy. Tests run with logger off (`logger: false`) when constructing test instances.

</frozen-after-approval>

## Code Map

- `server/src/index.ts` — REPLACE placeholder. Wires `buildServer()` + `env`, calls `app.listen({ port, host: '0.0.0.0' })`.
- `server/src/server.ts` — NEW. Exports `buildServer(opts?)`: configured Fastify (bodyLimit, logger+redact, CORS, /healthz). No `.listen()` — test-friendly seam.
- `server/src/env.ts` — NEW. Parsed + frozen env: `PORT`, `DB_PATH`, `CORS_ORIGIN`, `NODE_ENV`. Throws on prod + empty `CORS_ORIGIN`.
- `server/src/server.test.ts` — NEW. Vitest tests against `buildServer()` via `app.inject()` (no port binding).
- `server/tsconfig.json` — EDIT. Drop `rootDir`; expand `include` to `["src/**/*", "../shared/**/*"]`. Build emits `dist/server/src/...`.
- `server/package.json` — EDIT. `start` script updated for new dist path.
- `server/src/smoke.test.ts` — DELETE. Superseded by `server.test.ts`.

## Tasks & Acceptance

**Execution:**

- [x] `server/src/env.ts` — parse `PORT` (int, default 3000), `DB_PATH` (default `/data/todos.db`), `CORS_ORIGIN`, `NODE_ENV` (narrowed to dev/prod/test, default dev). Throw on prod + empty `CORS_ORIGIN`. Export `Object.freeze`d
- [x] `server/tsconfig.json` — drop `rootDir: "src"`; set `"include": ["src/**/*", "../shared/**/*"]` so `tsc` resolves cross-runtime imports
- [x] `server/package.json` — `"start"` → `"node dist/server/src/index.js"` to match new dist layout
- [x] `server/src/server.ts` — export `buildServer(opts?)` returning a Fastify instance with `bodyLimit: 1024`, Pino `redact: ['req.headers["x-user-id"]']`, `@fastify/cors` (`origin: env.CORS_ORIGIN`, `allowedHeaders: ['Content-Type', 'X-User-Id']`), and `GET /healthz` typed as `HealthResponse`
- [x] `server/src/index.ts` — replace placeholder: import `buildServer` + `env`, call `app.listen({ port: env.PORT, host: '0.0.0.0' })` with error trap
- [x] `server/src/server.test.ts` — three `app.inject` tests: (1) `GET /healthz` → 200 + `HealthResponse` shape; (2) 2 KB body → 413 (AI-1); (3) unknown path → 404 with default envelope (AI-2)
- [x] `server/src/smoke.test.ts` — delete (superseded)

**Acceptance Criteria:**

- Given the new bootstrap, when `cd server && npm run dev` is run, then the Fastify server logs its listen line on port 3000 (or `$PORT`), and `curl http://localhost:3000/healthz` returns 200 with body `{"ok":true,"version":"<pkg version>"}`.
- Given the new bootstrap, when a request with a >1024-byte body hits any path, then the response is 413 with the Fastify default error envelope (verified via `app.inject` in `server.test.ts`).
- Given the new bootstrap, when a request hits an unregistered path (e.g. `/nope`), then the response is 404 with body `{ statusCode: 404, error: "Not Found", message: ... }` — NOT HTML — confirming AI-2.
- Given the logger redact rule, when a request with header `X-User-Id: anon-abc` is processed, then any log line that includes the request headers shows `[Redacted]` (or Pino's censor placeholder) in place of the actual id; the unredacted value never appears in the structured log output.
- Given `cd server && npm run build`, when `tsc` runs, then it exits 0 with no `TS6059` errors and emits `dist/server/src/index.js` and the type-only `shared/types` is correctly resolved at compile time.
- Given `cd server && npm test`, then all three `server.test.ts` tests pass and the deleted smoke test does not appear in the output (Vitest reports 1 test file, 3 tests).
- Given `npm test` from repo root, then both client (2 tests) and server (3 tests) runs pass and exit 0.
- Given `cd server && npm run lint` and `npx prettier --check .` (root), both exit 0 with zero warnings.
- Given `NODE_ENV=production` and an empty `CORS_ORIGIN`, when `env.ts` is imported, then it throws a clear error naming the missing variable.

## Spec Change Log

### 2026-05-08 — Implementation deviations (review patches)

**Trigger:** Acceptance auditor + edge-case review surfaced four mechanical adjustments needed to make the spec's Code Map / Tasks compile and run.

**Amendments (none touch the frozen block):**

1. **`tsconfig.json: rootDir: ".."` added.** Spec said "drop `rootDir`" outright. tsc with `include: ["src/**/*", "../shared/**/*"]` and no `rootDir` errors with TS5011 (auto-derived rootDir is ambiguous between writable layouts). Setting `rootDir: ".."` produces the same `dist/server/src/...` layout the spec predicted; the only difference is that the value is explicit. KEEP: dist layout `dist/server/src/index.js` matches the `start` script.

2. **`tsconfig.json: "**/*.test.ts"` added to exclude.** Spec did not mention this; without it, tsc emits compiled `.test.js` to `dist/`, and Vitest then attempts to load those CommonJS files and crashes (Vitest is ESM-only). KEEP: tests live as source-only artifacts, never reach `dist/`.

3. **`tsconfig.json: ignoreDeprecations: "6.0"` added.** TS 6.0 deprecates `moduleResolution: "Node"` (inherited from Story 1.1 scaffold). Story 1.4 is the first to actually run `tsc`, so the deprecation surfaced now. KEEP: silenced with explicit acknowledgement; full migration to `nodenext` deferred (would change import-extension semantics across the codebase).

4. **`server.ts: corsOrigin || false` coercion.** Spec's Always rule said `origin: env.CORS_ORIGIN`. `@fastify/cors` rejects empty strings with `"Invalid CORS origin option"` at register time. Coercing empty → `false` (no CORS allow-list) preserves the architecture's "single-image deploy is same-origin / CORS unused" contract. env.ts's prod-guard ensures `CORS_ORIGIN` is non-empty in production, so the coercion only matters in dev/test. KEEP: explicit comment in server.ts documents the why.

**Known-bad state avoided:** without these four, `npm run build` errors, `npm test` picks up stale dist artifacts, prod-config tooling can't construct Fastify, and the deprecation warning makes every build look broken.

### 2026-05-08 — Hardening patches (review-driven)

**Trigger:** Adversarial + edge-case + acceptance review (3 reviewers, 60+ findings deduplicated).

**Amendments:**

5. **`env.ts`: PORT validated as integer in 1..65535.** NaN, negative, > 65535, and non-integer all throw with a clear message instead of producing a frozen invalid config that crashes Fastify with an opaque error.
6. **`env.ts`: NODE_ENV typo throws** instead of silently coercing to `development`. Stops `NODE_ENV=produciton` from deploying production code in dev mode (and bypassing the CORS guard).
7. **`env.ts`: CORS_ORIGIN trimmed.** Whitespace-only `CORS_ORIGIN` no longer passes the prod-empty check.
8. **`index.ts`: SIGINT/SIGTERM graceful shutdown** + top-level `.catch()` on bootstrap. Docker stop and Ctrl-C now drain in-flight requests before exit; bootstrap rejections surface a clear "Fatal during bootstrap" message instead of silent unhandled rejection.
9. **`server.test.ts`: bodyLimit test uses `application/json`** (production content-type) instead of `text/plain`.
10. **NEW `server/src/env.test.ts`**: 7 tests covering defaults, NaN PORT, out-of-range PORT, prod+empty CORS, prod+whitespace CORS, prod+valid CORS, unknown NODE_ENV. Closes the no-tests-for-env gap.

**KEEP instructions for re-derivation (if this spec re-loops):**
- The four mechanical tsconfig + CORS adjustments above MUST survive — they are the minimum set that makes the spec's literal Code Map produce a working build.
- The hardening patches above are independent improvements; if a future loopback reverts them, re-apply.
- Do NOT add a custom Pino `serializers.req` to make the redact rule fire today — see the deferred-work entry below for the rationale.

## Design Notes

- **`buildServer()` seam.** Returning a configured-but-unlistened Fastify instance is the standard test-friendly shape. `app.inject(...)` runs requests through the framework without binding a port, so tests are deterministic and parallelisable. The `index.ts` entry point owns the `.listen()` call only.
- **`HealthResponse.ok` stays literal `true`.** Resolves the question deferred from Story 1.3. Architecture documents the success body as `{ ok: true, version }`; degraded states yield a different status code (503) with Fastify's default error envelope, which is a separate type. Widening to `boolean` would imply the success type can be falsy, which the wire contract does not allow.
- **tsconfig rootDir change.** Dropping `rootDir: "src"` and expanding `include` to cover `../shared/**/*` makes `tsc` accept cross-runtime imports without paths aliases (forbidden by architecture). The dist tree is mildly nested (`dist/server/src/index.js` instead of `dist/index.js`); the `start` script and Story 5.1's Dockerfile must reference the new path. Alternative considered: TypeScript project references — rejected as overkill for a 6-route service.
- **`logger: false` in tests.** Pino noise during `inject` runs is friction; the redact rule still gets exercised in dev-mode runs (manual smoke).
- **Env-var module is a frozen object, not getters.** Parse once at startup; `Object.freeze()` makes accidental mutation a hard error.

## Verification

**Commands:**

- `cd server && npm run lint` — exit 0, zero warnings
- `cd server && npm run build` — exit 0, `dist/server/src/index.js` present
- `cd server && npm test` — 3 passing tests, exit 0
- `npm test` from repo root — client 2/2 + server 3/3, exit 0
- `npx prettier --check .` from repo root — exit 0
- `cd server && npm run dev` then `curl http://localhost:3000/healthz` — 200 + `{"ok":true,"version":"..."}`

**Manual checks (with `npm run dev` running):**

- `curl -H "X-User-Id: anon-test" http://localhost:3000/healthz` — confirm the dev-console log line for the request does NOT contain `anon-test`
- `curl --data "$(printf 'x%.0s' {1..2048})" -H "Content-Type: text/plain" http://localhost:3000/healthz` — 413
- `curl -i http://localhost:3000/nope` — 404, `Content-Type: application/json`, default envelope shape

## Suggested Review Order

**Bootstrap & lifecycle** (entry — start here to grasp how the server starts and stops)

- The factory: bodyLimit (AI-1), Pino with redact (NFR-5), CORS, /healthz — all in 25 lines.
  [`server.ts:17`](../../server/src/server.ts#L17)

- Empty-CORS coercion to `false` — required because `@fastify/cors` rejects empty strings. Spec deviation logged in Spec Change Log §4.
  [`server.ts:30`](../../server/src/server.ts#L30)

- Graceful SIGINT/SIGTERM shutdown — drains in-flight requests before exit (added during review).
  [`index.ts:9`](../../server/src/index.ts#L9)

- Top-level `.catch` on `main()` — bootstrap rejections surface "Fatal during bootstrap" instead of silent unhandled rejection.
  [`index.ts:30`](../../server/src/index.ts#L30)

**Architectural invariants**

- AI-1 verified at framework layer: 2KB JSON body → 413 via test-only POST route (Fastify's body parsing runs after route resolution).
  [`server.test.ts:30`](../../server/src/server.test.ts#L30)

- AI-2 verified: unknown path → 404 with default JSON envelope, no SPA fallback.
  [`server.test.ts:46`](../../server/src/server.test.ts#L46)

- NFR-5 redact path — see Spec Change Log + deferred-work for why this is defensive-only under Fastify's default `req` serializer.
  [`server.ts:22`](../../server/src/server.ts#L22)

**Env contract** (load-bearing for every Epic 2/5 story)

- Frozen `env` object — single source of truth, parsed at module load.
  [`env.ts:36`](../../server/src/env.ts#L36)

- PORT validated as integer in 1..65535 — added during review (NaN/range/non-integer all throw).
  [`env.ts:18`](../../server/src/env.ts#L18)

- NODE_ENV typo throws instead of silently coercing to `development` — `produciton` no longer ships prod code as dev.
  [`env.ts:7`](../../server/src/env.ts#L7)

- Production CORS guard — runs at module load; throws if `CORS_ORIGIN` is empty/whitespace in production.
  [`env.ts:28`](../../server/src/env.ts#L28)

- Seven env tests covering every guard, with module-reset between cases.
  [`env.test.ts:1`](../../server/src/env.test.ts#L1)

**Build plumbing** (read last — affects Story 5.x's Dockerfile)

- `rootDir: ".."` and the test exclusion — Spec Change Log §1, §2 explain why each was needed.
  [`tsconfig.json:11`](../../server/tsconfig.json#L11)

- `start` script targets `dist/server/src/index.js` (the new dist layout).
  [`package.json:9`](../../server/package.json#L9)
