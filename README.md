# todo-app-3

A minimal, anonymous todo app — single user per browser, no accounts, no
auth. Optimistic UI for create / toggle / delete with rollback on server
failure. Ships as one Docker image that serves both API and static client
from a single Fastify process.

## Quickstart

```bash
git clone <this repo> todo-app-3
cd todo-app-3
docker build -t todo-app-3 .
docker run -p 3000:3000 -v "$PWD/data:/data" \
  -e CORS_ORIGIN=http://localhost:3000 \
  todo-app-3
```

Open <http://localhost:3000>. Data persists in `./data/todos.db` on the host
across `docker rm` + `docker run`.

Or via Compose:

```bash
docker compose up --build
```

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
npm test                   # client (61) + server (53) unit + integration
npm run test:coverage      # both runtimes with 80% line/branch/func/stmt thresholds
npm run lint               # eslint, both runtimes
npm run format:check       # prettier
npm run test:docker        # Docker container persistence-across-restart test
                           # (skips if Docker unavailable; requires
                           # `docker build -t todo-app-3 .` first)
npm run test:e2e:install   # Downloads Chromium for Playwright (one-time, ~200 MB)
npm run test:e2e           # Playwright E2E + axe-core a11y audit (10 tests)
```

The Playwright suite (`e2e/`) drives a real Chromium against the dev stack
and exercises the full user-facing flows: empty state, create, toggle,
delete, newest-first ordering, bulk delete with confirm/cancel. The a11y
spec asserts zero `critical`/`serious` axe-core violations against the
empty / populated / error states.

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

| Concern             | Chosen                   | Considered               | Why                                                                     |
| ------------------- | ------------------------ | ------------------------ | ----------------------------------------------------------------------- |
| Server framework    | **Fastify v5**           | Express, Hono, Koa       | Native Pino logging, schema validation built-in, sync hooks             |
| HTTP client         | **fetch**                | axios, ky                | Built-in; `AbortSignal.timeout` covers the timeout category natively    |
| Persistence         | **better-sqlite3**       | sqlite3, Postgres        | Synchronous API, prepared-statement caching, single file, zero ops      |
| Frontend framework  | **React 19**             | Vue, Svelte, Solid       | Familiar; `useReducer` matches the optimistic-UI confirm/rollback       |
| Build tool          | **Vite 8**               | Webpack, Parcel, esbuild | Vite proxy is one block of config; HMR is fast                          |
| State               | **`useReducer`**         | Redux, Zustand, Jotai    | One reducer of 17 actions; no library earns its keep here               |
| Validation          | **Hand-rolled**          | zod, valibot, yup        | 6 routes, ~30 lines of inline checks; no need for a library             |
| Component testing   | **vitest + jsdom**       | Jest, Vitest + RTL       | RTL deliberately skipped per test-strategy; jsdom + react-dom is enough |
| E2E                 | **Playwright**           | Cypress, WebdriverIO     | Best-in-class for multi-browser; trace viewer is debugging gold         |
| Accessibility audit | **@axe-core/playwright** | pa11y, lighthouse-ci     | Runs in-process during E2E; zero extra infrastructure                   |
| Container runtime   | **node:20-alpine**       | distroless, scratch      | curl available for HEALTHCHECK; Alpine is small enough                  |

The single rule that reduces decisions across the board: **don't add a
dependency unless v1's deliberately-small scope demands it**. Most
"considered" alternatives are equally fine; the chosen option is whatever
needs the least configuration for the current six routes.
