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
npm test                   # client (61) + server (53) suites
npm run test:coverage      # both runtimes with 80% line/branch/func/stmt thresholds
npm run lint               # eslint, both runtimes
npm run format:check       # prettier
npm run test:docker        # Docker integration test (skips if Docker unavailable;
                           # requires `docker build -t todo-app-3 .` first)
```

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
tests/     Repo-root integration tests (currently just docker.test.ts)
data/      SQLite database file (gitignored; created on first dev run)
```
