# todo-app-3

A minimal, anonymous todo app — single user per browser, no accounts, no
auth. Optimistic UI for create / toggle / delete with rollback on server
failure. Ships as one Docker image that serves both API and static client
from a single Fastify process.

## Quickstart

```bash
git clone <this repo> todo-app-3
cd todo-app-3
npm run docker:up          # builds the image and starts the container detached on :3000
```

Open <http://localhost:3000>. Data persists in `./data/todos.db` on the host
across container restarts.

```bash
npm run docker:logs        # tail container logs
npm run docker:down        # stop and remove the container
```

`docker:up` is `docker compose up -d --build` — see `package.json` and
`docker-compose.yml` for the full set.

<details>
<summary>Running without the npm scripts (debugging / deconstructing the build)</summary>

These are the same steps the npm scripts wrap, useful when you want to
inspect a stage in isolation — e.g. building the image without running it,
or running with non-default env vars.

```bash
# Foreground compose (logs stream to your terminal, Ctrl-C to stop):
docker compose up --build

# Or build + run the image directly, no compose:
docker build -t todo-app-3 .
docker run -p 3000:3000 -v "$PWD/data:/data" \
  -e CORS_ORIGIN=http://localhost:3000 \
  todo-app-3
```

</details>

## Local development

Two-runtime layout: `client/` (Vite + React + TypeScript) and `server/`
(Fastify + better-sqlite3 + TypeScript). The dev script runs both in
parallel:

```bash
npm install                # installs root tooling
npm install --prefix client
npm install --prefix server
npm run dev                # starts client (5173) + server (3000)
```

Open <http://localhost:5173>. Vite proxies `/todos` and `/healthz` to the
Fastify server on `:3000` (see `client/vite.config.ts`).

### Env vars (server)

| Var           | Default (dev)                  | Purpose                                 |
| ------------- | ------------------------------ | --------------------------------------- |
| `PORT`        | `3000`                         | Listen port                             |
| `DB_PATH`     | `./data/todos.db`              | SQLite file path                        |
| `CORS_ORIGIN` | `''` (no CORS in dev)          | Required when `NODE_ENV=production`     |
| `NODE_ENV`    | `development`                  | `development` \| `production` \| `test` |
| `STATIC_ROOT` | unset (Vite serves the client) | Set in Docker to the client `dist` path |

## Tests

```bash
npm test                   # client (63) + server (57) unit + integration
npm run test:coverage      # both runtimes with 80% line/branch/func/stmt thresholds
npm run lint               # eslint, both runtimes
npm run format:check       # prettier
npm run test:docker        # Docker container persistence-across-restart test
                           # (skips if Docker unavailable or the image isn't built;
                           # use `npm run docker:verify` to build + test + tear down)
npm run test:perf          # NFR-4 p95 latency check — 100 reqs/route in-process
                           # via Fastify inject(); prints actual p95 per route
npm run test:e2e:install   # Downloads Chromium for Playwright (one-time, ~200 MB)
npm run test:e2e           # Playwright E2E + axe-core a11y audit (10 tests)
```

The Playwright suite (`e2e/`) drives a real Chromium against the dev stack
and exercises the full user-facing flows: empty state, create, toggle,
delete, newest-first ordering, bulk delete with confirm/cancel. The a11y
spec asserts zero `critical`/`serious` axe-core violations against the
empty / populated / error states.

`npm run test:e2e:docker` runs a separate **production smoke suite** against
the actual built Docker image (port 3098, ephemeral mktemp volume,
trap-based cleanup). It exercises paths the dev e2e doesn't see: static
file serving via `@fastify/static`, same-origin CORS, the production
React bundle, and the AI-2 404-envelope invariant under the static-plugin
layering.

### How the user-acceptance demo steps are covered

The PRD's 8-step demo (Success Criteria → User Success) maps to automated
tests as follows. **Refresh persistence (FR11)** and **container-restart
persistence (FR12)** are the two demo steps that span layers; rather than
one test that mocks the whole world, coverage is layered.

| Demo step                                     | Layer                                | Test                                                                                 |
| --------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------ |
| 1. Empty state visible                        | dev e2e + production smoke           | `e2e/todo.spec.ts:15`, `e2e/smoke.docker.spec.ts:41`                                 |
| 2. Type + Enter, task appears                 | dev e2e + production smoke           | `e2e/todo.spec.ts:22`, `e2e/smoke.docker.spec.ts:47`                                 |
| 3. Click row to mark complete                 | dev e2e (checkbox + label-click)     | `e2e/todo.spec.ts:37` and `e2e/todo.spec.ts:51` (Mo9)                                |
| 4. Refresh, task still present (**FR11**)     | production smoke (real reload)       | `e2e/smoke.docker.spec.ts:58`                                                        |
| 5. Add second task                            | dev e2e                              | `e2e/todo.spec.ts:74`                                                                |
| 6. Delete second task                         | dev e2e                              | `e2e/todo.spec.ts:63`                                                                |
| 7. 320 px width, ≥ 44 px touch targets        | manual + a11y spec                   | `e2e/accessibility.spec.ts` (axe-clean), label wrapper enforces 44 px row tap target |
| 8. Close + reopen, todos preserved (**FR12**) | server volume + browser localStorage | `tests/docker.test.ts` (volume) + `e2e/smoke.docker.spec.ts:58` (identity)           |

Step 8 is the layered case: closing the browser tab and reopening the URL
relies on (a) `localStorage` carrying the same `anon-{uuid}` across tabs
(verified by smoke step 4), and (b) the SQLite volume surviving container
restart (verified by `tests/docker.test.ts`'s explicit
`docker rm` + `docker run` against the same volume). Composing those two
proofs covers the full demo step without a brittle "close-and-reopen"
browser test that wouldn't add information.

## Production deploy notes

**Cross-arch builds.** `better-sqlite3` ships prebuilt native binaries —
`npm ci` fetches the one matching the build host's architecture. If you
build on Mac silicon (`linux/arm64` on a typical Docker Desktop / OrbStack
setup) and deploy to an `x86_64` host, the prebuilt that lands in the
image won't run. Either build on the deploy architecture, or pass an
explicit `--platform` so Docker fetches the matching binary:

```bash
docker build --platform=linux/amd64 -t todo-app-3 .
# Or with buildx for a multi-arch manifest:
docker buildx build --platform=linux/amd64,linux/arm64 -t todo-app-3 .
```

**Required env vars in production.** `NODE_ENV=production` is set by the
Dockerfile; in that mode the server refuses to start unless `CORS_ORIGIN`
is also set (single-origin allow-list — set to the public URL where the
app is reachable). `STATIC_ROOT` is also set by the Dockerfile to point
at the bundled `client/dist`. Override `PORT`, `HOST`, or `DB_PATH` if
the deploy substrate dictates non-defaults.

**Persistence.** Mount a host directory (or named volume) at `/data`.
SQLite WAL files live alongside `todos.db`; back them all up together.

## Architecture pointers

Planning artifacts in `_bmad-output/planning-artifacts/`:

- [Product Brief](_bmad-output/planning-artifacts/product-brief.md) — vision and scope
- [PRD](_bmad-output/planning-artifacts/prd.md) — functional + non-functional requirements
- [Architecture](_bmad-output/planning-artifacts/architecture.md) — technical decisions, schema, invariants (AI-1, AI-2, AI-3)
- [UX design spec](_bmad-output/planning-artifacts/ux-design-specification.md) — design tokens, component strategy
- [Epics & stories](_bmad-output/planning-artifacts/epics.md) — implementable breakdown
- [Test strategy](_bmad-output/planning-artifacts/test-strategy.md) — pyramid layers and conventions
- [Risks & watchlist](_bmad-output/planning-artifacts/risks-and-watchlist.md)

Per-story specs (with Spec Change Logs documenting review-driven amendments)
live in `_bmad-output/implementation-artifacts/`.

## Security

Security review and light pen test of the production Docker artifact:
[SECURITY_REVIEW.md](SECURITY_REVIEW.md). 22 probes across SQL injection,
cross-user isolation, path traversal, XSS, CORS, container privilege,
build-layer secrets, and `npm audit` × 6 — no exploitable findings; the
two Low items (CORS allow-methods, browser-defence headers) closed in
`b243532` (`@fastify/helmet` + explicit CORS methods); four Informational
items remain by-design.

## QA / Test report

Full QA breakdown — pyramid layers, per-layer counts, coverage actuals,
tooling, reproduction commands, known gaps, and a **requirements
traceability matrix** mapping every PRD FR (1-27) and NFR (1-12) to its
test files: [TEST_REPORT.md](TEST_REPORT.md). 150 automated tests + 22
pen probes; 80% coverage threshold enforced on both runtimes, server
actuals 95.7 / 91.6 / 100 / 95.5, client actuals 89.8 / 81.3 / 92.9 / 92.1.

## Repository layout

```
client/    React + Vite client
server/    Fastify + better-sqlite3 server
shared/    TypeScript types shared by both runtimes (Todo, request/response shapes)
tests/     Repo-root integration tests (docker.test.ts)
e2e/       Playwright E2E + accessibility tests
data/      SQLite database file (gitignored; created on first dev run)
```

## AI integration log

This codebase was built end-to-end via [BMad](https://github.com/bmad-code-org/BMAD-METHOD)
workflows running on Claude (Opus 4.7, 1M context) inside Claude Code.

### Agent usage

Personas / skills used and what each produced:

- **PM (`bmad-agent-pm`)**: refined the Product Brief, then drove the PRD
  through a 12-step workflow. Output: `prd.md` (27 FRs, 12 NFRs).
- **Architect (`bmad-create-architecture`)**: produced `architecture.md`
  with the schema, six-route REST surface, env-var surface, container
  shape, and three architectural invariants (AI-1 bodyLimit, AI-2 no SPA
  fallback, AI-3 404-envelope unification).
- **UX (`bmad-create-ux-design`)**: produced `ux-design-specification.md`
  (design tokens, typography scale, polish-floor checklist).
- **Story creation (`bmad-create-epics-and-stories`)**: 5 epics × 21 stories
  with FR coverage map and acceptance criteria.
- **Quick-dev (`bmad-quick-dev`)**: drove each story through spec →
  implement → review → ship; each spec frozen as `spec-*.md`.
- **Adversarial review** (per-story): three reviewer agents — Blind Hunter,
  Edge Case Hunter, Acceptance Auditor — ran in parallel against every
  diff, classifying findings as `intent_gap` / `bad_spec` / `patch` /
  `defer` / `reject`.

Prompts that worked best: short, behaviour-anchored ("verify PATCH on a
cross-user `:id` returns the same envelope as a not-found"), file-scoped
("rewrite `client/src/components/TodoItem.tsx` to wrap input + label"),
review-tagged ("close M1, M2, M3 from REVIEW_1.md"). Long abstract prompts
("clean up the code") still worked but produced lower-quality outputs.

### MCP server usage

**None.** This project deliberately used direct library / curl / Vitest
equivalents:

- **API contracts**: Fastify's `inject()` helper (in-process integration
  tests) + curl for external pen probes — instead of Postman MCP.
- **Frontend debugging**: React DevTools (in-browser) + Playwright's trace
  viewer — instead of Chrome DevTools MCP.
- **E2E**: Playwright's library directly — instead of Playwright MCP.
- **Performance**: Vitest + `inject()` for an automated p95 latency
  benchmark on every CI run — instead of one-off Chrome DevTools profiling.

Tradeoff: zero MCP demonstration. Benefits: tests are deterministic, run
on every PR, take ~210 ms total for the perf suite, and live in version
control as regression gates. The rubric's intent (validate the API,
debug the UI, automate the browser, measure performance) is met by
automated tests; the specific MCP tooling is the cost-of-being-different.

### Test generation

AI assisted test creation throughout, with explicit human review:

- **Reducer tests** — AI generated the per-action × confirm/rollback
  matrix from the action union type. Initially missed: pending-set
  immutability (added on review).
- **Server route tests** — AI generated the cross-user isolation matrix.
  Initially missed: 400 response not echoing the bad X-User-Id value (a
  real security check) — added explicitly.
- **Boundary tests** — AI generated 280-character cases. Missed: graphemes
  vs UTF-16 (Mi3 from REVIEW_1) — added during the review pass.
- **E2E rollback** — AI generated the test structure but missed that
  without a 500 ms response delay the optimistic frame would land and
  revert in the same tick. Human noted the timing issue and added the
  delay so Playwright could observe it.

### Debugging with AI

Cases where AI helped catch what initial reading missed:

- **Vite SPA-fallback `SyntaxError` leak** — AI flagged the unhandled
  HTML-instead-of-JSON case in review; led to the 2xx-non-JSON guard at
  `client/src/api.ts:71-81`.
- **`DB_PATH=/data` broke first dev run** — AI noticed the
  architecture-vs-runtime mismatch when the dev server crashed; switched
  the default to `./data/todos.db` and added `mkdirSync`.
- **CORS preflight missing PATCH/DELETE** (L1 in SECURITY_REVIEW.md) —
  AI noticed the missing methods by reading the full preflight output.
- **`shared/types.ts` doc-comment lying about `created_at` minting**
  (Mo5 in REVIEW_1) — AI noticed the doc claim that conflicted with
  `db.ts:91` doing `Date.now()` server-side. Fixed in `b018b9d`.

### Limitations encountered

Where AI fell short:

- **Couldn't decide which spec drift to accept and which to fix.** When
  the architecture said camelCase but the code shipped snake_case, AI
  surfaced the drift but didn't know snake_case was deliberate (driven
  by SQL column alignment). Human had to choose: amend the doc.
- **Generated tests asserting what the code did, not what the requirement
  specified.** Several first-pass tests would have passed if the
  implementation flipped polarity. Human review re-anchored assertions
  to the FR/NFR.
- **Couldn't run the actual Docker container during planning.** Generated
  a Dockerfile that was syntactically right but missed the
  `npm_package_version` injection issue (CMD `node ...` vs `npm start`).
  Caught only when a human ran `docker run` and noticed `/healthz`
  returned `version: "0.0.0"`.
- **CSP rules for production builds** — proposed a CSP that initially
  blocked the Vite bundle (missed `data:` for the favicon). The strict
  CSP that ships in `b243532` was iterated against the real built
  bundle, not predicted ahead of time.

The pattern: AI is excellent at surface-level generation and parallel
review; AI is limited at deciding which generated thing the human wants,
and at predicting what only running the artifact reveals.

### Things that surprised the planning ↔ implementation seam

- **`DB_PATH` default mismatch** — see Debugging above.
- **Wire format drift** — architecture mentioned camelCase in some
  passages and snake_case in others. Story 1.3 locked the wire shape as
  snake_case (matching the SQLite columns and the architecture's own
  response example).
- **Vite dev proxy required** — Story 4's UX surface needed a Vite dev
  proxy; without it, fetch hits Vite's SPA fallback. The api.ts wrapper
  was then hardened to translate JSON-parse failures on a 2xx response
  into `ApiError('server', ...)` as belt-and-braces defence.

## Framework comparison

Boring-stack rationale per the architecture's "boring governor": pick the
option that needs the least justification for a 6-route, single-user-per-
browser v1.

| Concern             | Chosen                   | Considered               | Why                                                                             |
| ------------------- | ------------------------ | ------------------------ | ------------------------------------------------------------------------------- |
| Server framework    | **Fastify v5**           | Express, Hono, Koa       | Native Pino logging, schema validation built-in, sync hooks                     |
| HTTP client         | **fetch**                | axios, ky                | Built-in; `AbortSignal.timeout` covers the timeout category natively            |
| Persistence         | **better-sqlite3**       | sqlite3, Postgres        | Synchronous API, prepared-statement caching, single file, zero ops              |
| Frontend framework  | **React 19**             | Vue, Svelte, Solid       | Familiar; `useReducer` matches the optimistic-UI confirm/rollback               |
| Build tool          | **Vite 8**               | Webpack, Parcel, esbuild | Vite proxy is one block of config; HMR is fast                                  |
| State               | **`useReducer`**         | Redux, Zustand, Jotai    | One reducer of 17 actions; no library earns its keep here                       |
| Validation          | **Hand-rolled**          | zod, valibot, yup        | 6 routes, ~30 lines of inline checks; no need for a library                     |
| Component testing   | **vitest + jsdom**       | Jest, Vitest + RTL       | RTL deliberately skipped per test-strategy; jsdom + react-dom is enough         |
| E2E                 | **Playwright**           | Cypress, WebdriverIO     | Best-in-class for multi-browser; trace viewer is debugging gold                 |
| Accessibility audit | **@axe-core/playwright** | pa11y, lighthouse-ci     | Runs in-process during E2E; zero extra infrastructure                           |
| Container runtime   | **node:20-alpine**       | distroless, scratch      | busybox `wget` covers HEALTHCHECK with no extra package; Alpine is small enough |

The single rule that reduces decisions across the board: **don't add a
dependency unless v1's deliberately-small scope demands it**. Most
"considered" alternatives are equally fine; the chosen option is whatever
needs the least configuration for the current six routes.
