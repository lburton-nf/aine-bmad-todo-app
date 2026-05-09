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
workflows running on Claude (Opus 4.7, 1M context) inside Claude Code. Roles
played by the agent:

**Phase 1 — Planning.** Product Brief → PRD → Architecture → UX design spec →
Test strategy → Epics & stories. Each artifact passed through an adversarial
critique pass before being locked. Outputs live in
`_bmad-output/planning-artifacts/`.

**Phase 2 — Implementation.** Stories shipped via the `bmad-quick-dev` skill
(spec → implement → review → ship cycle). Each spec lives in
`_bmad-output/implementation-artifacts/spec-*.md` and includes a frozen
intent block, a code map, acceptance criteria, design notes, and a Spec
Change Log documenting review-driven amendments.

**Review pattern.** Where used, three independent reviewer agents (Blind
Hunter / Edge Case Hunter / Acceptance Auditor) ran in parallel against
each diff, with findings classified as `intent_gap` / `bad_spec` / `patch`
/ `defer` / `reject`. A few notable patches caught this way:

- **Story 1.3** — line-height tokens missing from `tokens.css` (acceptance
  auditor caught the UX-spec table's line-heights weren't encoded).
- **Story 1.4** — six hardening patches to the bootstrap (PORT validation,
  NODE_ENV strict parsing, CORS_ORIGIN trim, SIGINT/SIGTERM graceful
  shutdown, JSON 413 test, env.test.ts).
- **Story 2.1** — six db-layer improvements (CHECK constraint on
  `completed`, `id DESC` ordering tiebreaker, WAL + busy_timeout PRAGMAs,
  idempotent `close()`, explicit null check on INSERT, `dbPath` non-empty
  guard).
- **Epic 4** — review skipped per belt-mode directive; the missing dev
  proxy bug was caught by human smoke instead. Documented in the commit
  message and the Spec Change Log.

Things that surprised the planning ↔ implementation seam:

- The architecture defaulted `DB_PATH` to `/data/todos.db` (Docker absolute
  path) — broke first dev run on macOS. Resolved by switching the default
  to `./data/todos.db` and auto-creating the parent dir in `db.ts`.
- The architecture mentioned camelCase field names in some passages and
  snake_case in others. Story 1.3 locked the wire shape as snake_case
  (matching the SQLite columns and architecture's response example).
- Story 4's UX surface needed a Vite dev proxy — without it, fetch hits
  Vite's SPA fallback and the JSON parser leaks `SyntaxError` past the
  ApiError shield. The api.ts wrapper was hardened to translate JSON-parse
  failures on a 2xx response into `ApiError('server', ...)`.

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
