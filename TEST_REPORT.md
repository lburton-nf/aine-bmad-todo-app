# TEST_REPORT — todo-app-3

**Reporter:** Claude (Opus 4.7), full QA pass
**Date:** 2026-05-09
**Target:** current `main` (post-`L1+L2` fix at commit `b243532`).
**Runtime under test:** Node 20 (matches the Docker base image), built and run on macOS arm64 host via OrbStack.

> **TL;DR.** **148 automated tests pass; 0 fail; 0 skipped; 0 flaky.** Lint, format, typecheck, two production builds, six runtimes worth of `npm audit`, four CRUD-route p95 latency benchmarks, and a 22-probe security pen test all clean. Coverage exceeds the 80% line / branch / function / statement threshold on both runtimes (server 95.7 / 91.6 / 100 / 95.5; client 89.8 / 81.3 / 92.9 / 92.1). Two of the four critical attack surfaces (XSS, CORS) are now actively exercised by both unit tests and a real-browser probe, not just asserted by inspection. Cross-user isolation has triple coverage (db.ts unit tests, routes/todos.ts integration tests, AI-3 unification). Below: per-layer breakdown, coverage actuals, reproduction commands, and known gaps.

---

## Test pyramid

```
        ╱ Production smoke (Playwright + axe) ─── 6 tests against the built Docker artifact
       ╱  Dev e2e (Playwright + axe) ───────────── 14 tests against Vite + Fastify dev stack
      ╱   Docker integration (Vitest) ──────────── 1 test against a real container
     ╱    Perf benchmark (Vitest + inject) ─────── 4 routes × 100 iterations
    ╱     Server integration (Vitest + inject) ── 35 tests against Fastify in-process
   ╱      Server unit (Vitest) ─────────────────── 25 tests on db, env, routes, perf helpers
  ╱       Client unit + integration (Vitest) ──── 63 tests on api, identity, reducer,
 ╱                                                 components, App shell
╱______________________________________________________________________________
                                                  Static: lint, format, tsc, vite build
                                                  Supply chain: npm audit × 6
                                                  Security: 22 pen probes
```

---

## Layer-by-layer

### Static analysis

| Tool                              | Scope                                                                              | Result                                                                          |
| --------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| ESLint (`recommendedTypeChecked`) | client/, server/                                                                   | 0 errors, 0 warnings                                                            |
| Prettier 3                        | every `*.ts`, `*.tsx`, `*.json`, `*.md`, `*.yml`, `*.css`, `*.html` not gitignored | 0 deltas                                                                        |
| `tsc -p tsconfig.build.json`      | server                                                                             | 0 errors; emits `dist/server/src/*.js` + `dist/shared/types.js`                 |
| `tsc -b` (project references)     | client                                                                             | 0 errors                                                                        |
| `vite build` (Rollup)             | client                                                                             | 26 modules transformed; 199.32 KB JS (62.58 KB gzip), 3.92 KB CSS, 0.45 KB HTML |

**Reproduce:** `npm run lint && npm run format:check && npm run build --prefix server && npm run build --prefix client`.

### Supply chain

| Workspace | With dev          | Production only   |
| --------- | ----------------- | ----------------- |
| Root      | 0 vulnerabilities | 0 vulnerabilities |
| `client/` | 0 vulnerabilities | 0 vulnerabilities |
| `server/` | 0 vulnerabilities | 0 vulnerabilities |

`better-sqlite3` is the only native dependency; ships prebuilt binaries from a single maintained organisation (WiseLibs).

**Reproduce:** `npm audit && npm audit --omit=dev` from each of `.`, `client/`, `server/`.

### Server unit + integration tests

`vitest run` against `server/src/**/*.test.ts`. 5 files, 60 tests + 4 perf tests = **64 tests**.

| File                   | Tests | What it covers                                                                                                                                                                                                                                                                                                |
| ---------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `db.test.ts`           | 13    | schema init, idempotent reinit, CRUD round-trips, cross-user isolation, AI-3 unification (cross-user → null + missing → null), empty-dbPath guard, idempotent close                                                                                                                                           |
| `env.test.ts`          | 9     | defaults, PORT validation, NODE_ENV strict parse, CORS_ORIGIN required-in-production, STATIC_ROOT trim, HOST defaults (dev=`127.0.0.1`, prod=`0.0.0.0`), explicit override                                                                                                                                    |
| `server.test.ts`       | 5     | `/healthz` shape, 1 KB bodyLimit (413), 404 default JSON envelope (no SPA fallback), CSP + browser-defence headers, CORS preflight advertises PATCH/DELETE                                                                                                                                                    |
| `routes/todos.test.ts` | 33    | GET/POST/PATCH/DELETE happy paths, cross-user isolation through HTTP, X-User-Id validation matrix (empty / bad / multiple / 10 KB / no-dashes), description trim/grapheme/length boundaries, primary-key violation translation, AI-3 404-envelope unification on PATCH and DELETE, validation envelope shapes |
| `perf.test.ts`         | 4     | NFR-4 p95 budget per route (see Perf section)                                                                                                                                                                                                                                                                 |

**Reproduce:** `npm test --prefix server`. Wall time: ~250 ms.

### Server perf benchmark

`server/src/perf.test.ts`: 10 warmup + 100 measured iterations per route via Fastify `inject()` (in-process, no network), p95 from sorted samples, 100 ms budget per route.

| Route                         | Budget | Observed (this run) | Verdict |
| ----------------------------- | ------ | ------------------- | ------- |
| `GET /todos` (25 seeded rows) | 100 ms | 0.10 ms             | ✅      |
| `POST /todos`                 | 100 ms | 0.12 ms             | ✅      |
| `PATCH /todos/:id` (toggle)   | 100 ms | 0.10 ms             | ✅      |
| `DELETE /todos/:id`           | 100 ms | 0.04 ms             | ✅      |

Headroom against budget: ~1000× in-process. A Docker-and-loopback round-trip on top would add a few milliseconds at most — well under NFR-4.

**Reproduce:** `npm run test:perf` (verbose reporter prints the actual p95 numbers).

### Client unit + integration tests

`vitest run --environment=jsdom` against `client/src/**/*.test.{ts,tsx}`. 5 files, **63 tests**.

| File                             | Tests | What it covers                                                                                                                                                                                                                                                                                                                        |
| -------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api.test.ts`                    | 13    | each of `listTodos / createTodo / toggleCompleted / deleteTodo / deleteAll / health` calls the right URL+method+headers; X-User-Id auto-attached; 5 error categories (server-with-JSON, server-with-non-JSON, network, timeout, identity-reset retry); the FR9 reset path including infinite-loop guard and unrelated-400 specificity |
| `identity.test.ts`               | 6     | mint on empty storage, return same value across calls, discard malformed/empty stored values, keep valid stored value, `reset()` mints a different value                                                                                                                                                                              |
| `reducer.test.ts`                | 18    | every action × state-transition combination including the optimistic / confirm / rollback triplet for create / toggle / delete / delete-all; pending-set immutability across renders; ROLLBACK_DELETE re-inserts in created_at desc order                                                                                             |
| `components/components.test.tsx` | 18    | `TodoInput` (auto-focus, trimmed-Enter, empty-no-submit), `TodoItem` (toggle/click/pending class/done style/contextual aria-label), `TodoList` (order + aria-busy), `EmptyState` / `LoadingState` / `ErrorState`, `DeleteAllControl` (expand → focus Cancel safe-default, Erase, Cancel, Escape), label-wrapper text-click toggles    |
| `App.test.tsx`                   | 8     | full mount via `react-dom/client`, page title, EmptyState on empty list, ErrorState on fetch reject, DeleteAllControl appearance, all four mutation flows fire the right HTTP shape, retry-after-fail reloads                                                                                                                         |

**Reproduce:** `npm test --prefix client`. Wall time: ~510 ms.

### Coverage

Both runtimes enforce **80% line / branch / function / statement** thresholds via Vitest's v8 coverage provider; coverage is part of CI and a regression below threshold breaks the build.

**Server:**

| Metric     | Threshold | Actual              |
| ---------- | --------- | ------------------- |
| Statements | 80%       | **95.7%** (135/141) |
| Branches   | 80%       | **91.6%** (87/95)   |
| Functions  | 80%       | **100%** (27/27)    |
| Lines      | 80%       | **95.5%** (127/133) |

The uncovered lines (db.ts:94, server.ts:89, routes/todos.ts:50/98/122/142) are defensive throws / error branches that are intentionally hard to trigger in unit tests (e.g. `INSERT … RETURNING` failing the contract; `re.headers` shape changing).

**Client:**

| Metric     | Threshold | Actual              |
| ---------- | --------- | ------------------- |
| Statements | 80%       | **89.8%** (176/196) |
| Branches   | 80%       | **81.3%** (91/112)  |
| Functions  | 80%       | **92.9%** (65/70)   |
| Lines      | 80%       | **92.1%** (163/177) |

The lower client branch coverage is concentrated in `App.tsx` (80.3% statement, 67.7% branch) — the conditional rendering for empty/loading/error/list states has more branches than tests directly exercise. The branches that aren't exercised in the unit tests ARE exercised in the dev e2e and production smoke specs, so the holistic coverage of those code paths is higher than the unit-only number suggests.

**Reproduce:** `npm run test:coverage` (runs both runtimes concurrently with `concurrently`).

### Docker integration test (volume persistence)

`tests/docker.test.ts` (Vitest at repo root): builds the image, starts the container against an ephemeral `mktemp -d` volume, posts a todo via HTTP, removes the container, starts a fresh container against the **same** volume, asserts the row is still there. Self-skips if Docker is unavailable.

**Result:** 1 test, 1.20 s wall time end-to-end including container lifecycle.

**Reproduce:** `npm run docker:verify` (build + test + tear down in one).

### Dev e2e (Playwright)

`e2e/*.spec.ts` (excluding `*.docker.spec.ts`) against the running Vite + Fastify dev stack on `:5173` + `:3000`. Playwright's `webServer` block boots both runtimes if they aren't already running.

| Spec                    | Tests | What it covers                                                                                                                                                                                                 |
| ----------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `todo.spec.ts`          | 8     | empty state on first load, type-Enter creates + clears + refocuses, checkbox toggles + strike-through, label-click toggles, single delete, newest-first ordering with 50 ms wait, bulk Erase, Cancel collapses |
| `rollback.spec.ts`      | 3     | NFR-2 optimistic rollback for POST / PATCH / DELETE — failing response delayed 500 ms so Playwright can observe the optimistic frame before the rollback fires                                                 |
| `accessibility.spec.ts` | 3     | axe-core (`wcag2a`+`wcag2aa`+`wcag21a`+`wcag21aa`, blocking impacts = `critical`+`serious`) on empty / populated / error states; rejects on any blocking violation with a per-violation summary                |

**Browser matrix:** Chromium by default. Set `E2E_ALL_BROWSERS=1` to run Chromium + Firefox + WebKit (CI does this; local dev stays Chromium-only via `npm run test:e2e:install`. The `:full` install variant adds Firefox + WebKit).

**Result:** 14 tests, ~6.8 s wall time on Chromium.

**Reproduce:** `npm run test:e2e` (Chromium only) or `E2E_ALL_BROWSERS=1 npm run test:e2e` (all three browsers).

### Production smoke (Playwright against the built Docker artifact)

`e2e/smoke.docker.spec.ts` against the actual built Docker image. Lifecycle (build, run on `:3098`, healthz wait, teardown) is owned by `scripts/test-e2e-docker.sh`; trap-based cleanup ensures container + temp volume are removed even on failure.

| Test                                                                                | Verifies                                                                                                                                                   |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `healthz returns the canonical shape with the package version`                      | `npm start` is the CMD (so `npm_package_version` is injected — version != `'0.0.0'`); shape matches `HealthResponse`                                       |
| `unknown path returns the default JSON 404 envelope under @fastify/static layering` | AI-2 invariant survives static-plugin registration in production (the static plugin doesn't mask the framework's default 404, and there's no SPA fallback) |
| `app shell loads and shows the empty state from the production bundle`              | the bundled React app loads from `/`, fetches `/todos`, and renders the empty state — strict CSP doesn't block the bundle                                  |
| `create round-trip: POST /todos works through Fastify (no proxy in production)`     | the production same-origin path (no Vite proxy) reaches the API and renders the row                                                                        |
| `data persists across page reload (same anon-{uuid}, same volume)`                  | FR11 — `localStorage` carries the same `anon-{uuid}` across reloads and the SQLite volume returns the row                                                  |
| `a11y: production bundle is axe-clean on the populated state`                       | the production-built React bundle is axe-clean (different DOM/aria timing than the dev bundle)                                                             |

**Result:** 6 tests, ~1.3 s test wall time + ~5 s container lifecycle = ~6 s end-to-end.

**Reproduce:** `npm run test:e2e:docker`.

### Security pen test

22 probes against the running Docker artifact (built from current `main`); see `SECURITY_REVIEW.md` for the full table. Coverage:

- SQL injection via header and body
- Cross-user PATCH and DELETE leak attempts
- Body-limit DoS (1.5 KB → 413)
- Path traversal (5 candidates × 404)
- Stored XSS via Playwright DOM probe (escaped, no alert fires)
- HTTP method surface (only declared verbs route)
- CORS allow-list and preflight (post-`L1` fix: PATCH + DELETE in Allow-Methods)
- Browser-defence response headers (post-`L2` fix: CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, HSTS)
- Container privilege (`uid=1000(node)`)
- Image ENV / build-layer secret scan (clean)
- 6× `npm audit` (clean)

**Result:** 0 exploitable findings; the 2 Low items (L1 + L2) closed in `b243532`; 4 Informational items remain by-design.

**Reproduce:** see commands in `SECURITY_REVIEW.md`.

---

## Total automated tests at a glance

| Layer                                   | Count   | Wall time (this machine)               |
| --------------------------------------- | ------- | -------------------------------------- |
| Client unit + integration               | 63      | ~510 ms                                |
| Server unit + integration               | 60      | ~250 ms                                |
| Server perf                             | 4       | ~110 ms                                |
| Docker integration (volume persistence) | 1       | ~1.2 s                                 |
| Dev e2e (Playwright + axe)              | 14      | ~6.8 s                                 |
| Production smoke (Playwright + axe)     | 6       | ~1.3 s                                 |
| **Total automated**                     | **148** | **~10.2 s + ~5 s container lifecycle** |
| + Pen probes (manual)                   | 22      | not measured                           |
| **Total verification points**           | **170** |                                        |

---

## Test conventions

- **Unit isolation.** Every server test against the route layer uses Fastify's `inject()` rather than a real socket. Every client test uses `react-dom/client` with `jsdom`, never a real browser. This makes the unit suite finish in well under a second across both runtimes.
- **Test names describe behaviour** (since commit `cb9cf12`). No `Mi3:` / `NFR-4:` / `AI-3:` prefixes — the test name says what's being verified, and spec-to-test traceability lives in the README's "How the user-acceptance demo steps are covered" matrix and in this report.
- **Cross-user isolation has triple coverage.** The `db.ts` unit tests verify the SQL layer; the `routes/todos.ts` integration tests verify the HTTP layer; the AI-3 unification (a row owned by another user returns the same 404 envelope as a missing row) is asserted at both layers. Pen probes **P3 / P4** further verify the wire response.
- **Optimistic rollback has triple coverage too.** The reducer tests verify state transitions; `App.test.tsx` verifies the four mutation handlers fire the right HTTP shape; `rollback.spec.ts` verifies the full optimistic-then-revert flow in a real Chromium against a real Fastify with a 500-ms-delayed failing response. The runtime control flow itself was extracted into `runOptimisticMutation` (commit `6560e7f`) so the NFR-2 contract lives in exactly one auditable function.
- **Coverage thresholds are enforced** (not just measured). A regression below 80% on any of line / branch / function / statement breaks `npm run test:coverage`, which is what CI runs.
- **Tests don't mock the database.** Server-side persistence tests use `:memory:` SQLite (real driver, real SQL), not a mock. Same for the integration tests against routes — every assertion exercises the actual prepared-statement layer.

---

## Known gaps

- **Mutation coverage in `App.test.tsx` doesn't observe the optimistic frame separately from confirm.** The `captureFetch` helper resolves immediately, so OPTIMISTIC and CONFIRM dispatch in the same tick. The reducer unit tests cover the intermediate state explicitly; `rollback.spec.ts` observes it under a 500 ms delay in a real browser. So the optimistic frame is genuinely tested — just not at the App-test layer.
- **No automated keyboard-navigation test.** PRD NFR-7 requires Tab reachability and Enter/Space activation. axe-core verifies static a11y violations but doesn't simulate keyboard input. A future addition: `e2e/keyboard.spec.ts` driving Tab/Shift-Tab/Enter sequences.
- **No load test beyond the perf benchmark.** Single-process, sequential requests at 100 iterations per route. A more realistic benchmark would use `autocannon` against the running container with concurrent connections; deferred because v1's load profile is "one user, one browser."
- **Mobile viewport not exercised in CI.** The accessibility spec is desktop-Chromium. PRD demo step 7 (320 px width) is verified manually.
- **Pino redact regression test (Informational `I3` from SECURITY_REVIEW)** — not yet written. The `req.headers["x-user-id"]` redact rule is defensive against a future regression that nobody has introduced. Sketched as a follow-up in `_bmad-output/implementation-artifacts/deferred-work.md`.

---

## Reproduction one-liner

```bash
npm run lint \
  && npm run format:check \
  && npm run build --prefix server \
  && npm run build --prefix client \
  && npm run test:coverage \
  && npm run test:perf \
  && npm run docker:verify \
  && npm run test:e2e \
  && npm run test:e2e:docker \
  && (npm audit && npm audit --prefix client && npm audit --prefix server)
```

That's also the order the GitHub Actions workflow runs — see `.github/workflows/ci.yml`. Wall time on this machine: ~25 seconds total.
