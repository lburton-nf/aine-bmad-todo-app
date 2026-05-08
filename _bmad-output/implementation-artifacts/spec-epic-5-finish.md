---
title: 'Epic 5 finish — Containerize, test, ship (Stories 5.1–5.4)'
type: 'feature'
created: '2026-05-08'
status: 'done'
baseline_commit: '417fdb4898bd253549227ffa620c03bcf8c6b620'
context:
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/epics.md
  - _bmad-output/planning-artifacts/prd.md
---

<frozen-after-approval reason="bundled by explicit user choice (belt mode + auto-accept)">

## Intent

**Problem:** Epic 4 finished the feature-set; the app works in dev. But "deployable as a Docker image" is still a future intention — there's no Dockerfile, no compose file, no README, and no docker-driven integration test that proves persistence across container removal.

**Approach:** Four shippables in one cycle. (1) Multi-stage `Dockerfile` builds client + server, copies the built artefacts into a slim Alpine runtime, and serves both API and client static files from one Fastify process via `@fastify/static`. (2) `docker-compose.yml` for one-command local dev. (3) `tests/docker.test.ts` exercises the live container end-to-end including the persistence-across-restart invariant. (4) `README.md` is the verified quickstart.

## Boundaries & Constraints

**Always:**
- Multi-stage `Dockerfile` at the repo root. Three stages: `client-builder`, `server-builder`, `runtime`. Runtime is `node:20-alpine` and runs as non-root.
- The runtime stage installs ONLY production dependencies for the server (no dev deps, no client packages).
- Runtime stage copies `/app/client/dist/` (built client) and `/app/server/dist/` (built TS) and starts via `node dist/server/src/index.js`.
- Runtime has `EXPOSE 3000` and a `HEALTHCHECK` calling `/healthz` every 30s with 3s timeout, 5s start period, 3 retries.
- The Fastify server registers `@fastify/static` ONLY when `STATIC_ROOT` env var is set. The Dockerfile sets `STATIC_ROOT=/app/client/dist`. Dev `npm run dev` does NOT set it (Vite serves the client). This keeps the dev/prod boundary explicit.
- `@fastify/static` registers with `prefix: '/'` and `decorateReply: false`. Architecture invariant AI-2: NO SPA fallback in v1 — unmatched paths still return Fastify's default 404.
- `docker-compose.yml` defines one service `app`, builds from local Dockerfile, exposes port 3000, mounts `./data:/data`, and sets `PORT=3000`, `DB_PATH=/data/todos.db`, and `CORS_ORIGIN` (commented placeholder for the operator).
- `tests/docker.test.ts` at repo root. Skips itself with `test.skipIf` when Docker isn't available. When Docker IS available, exercises: build → run → POST → GET → PATCH → DELETE :id → POST again → DELETE bulk → stop → remove container → start NEW container against the SAME volume → GET shows the second POST persisted across the container lifecycle. Asserts NFR-6 (data persists across `docker rm` + `docker run`).
- `README.md` at repo root. Sections in this order: Project description (1 paragraph), Quickstart (`docker build` + `docker run`), Local dev (`npm install` + `npm run dev`), Tests (`npm test`, `npm run test:coverage`), Architecture pointers (links to planning artifacts).
- All existing tests + the new docker test pass (when run). Coverage thresholds unchanged.

**Ask First:**
- (none — auto-accept)

**Never:**
- Adding a SPA fallback in `@fastify/static` (`decorateReply: false` + leaving 404 to Fastify default — preserves AI-2).
- Pinning Node to a specific patch version. `node:20-alpine` is enough.
- Running as root in the container. Use `USER node` (built-in Alpine user).
- Adding `dockerfile-language-server` configs, `.dockerignore` patterns beyond essentials, or build secrets handling.
- Building during the integration test using `docker build` from inside Node — assume the image is pre-built. Test skips if image not found.
- Re-implementing the cross-user-isolation tests for 5.3. Story 2.4 already shipped them in `routes/todos.test.ts`. The 5.3 AC is satisfied by their existence.

</frozen-after-approval>

## Code Map

- `Dockerfile` — NEW. Three stages: `client-builder` (vite build), `server-builder` (tsc), `runtime` (alpine + prod deps + dist copies + healthcheck).
- `.dockerignore` — NEW. Excludes `node_modules`, `dist`, `coverage`, `data`, `.git`, `_bmad`, `_bmad-output`.
- `docker-compose.yml` — NEW. Single `app` service.
- `server/src/server.ts` — EDIT. Conditionally register `@fastify/static` when `STATIC_ROOT` env var is set.
- `server/src/env.ts` — EDIT. Add `STATIC_ROOT` to the parsed env (string, optional, no default).
- `server/src/env.test.ts` — EDIT. Update default-assertion to include `STATIC_ROOT: undefined`.
- `tests/docker.test.ts` — NEW. Vitest test at repo root. Uses `node:child_process` to run `docker run`. Skips when Docker isn't available.
- `vitest.config.ts` (repo root) — NEW. Minimal config so vitest can find `tests/docker.test.ts`.
- `package.json` (repo root) — EDIT. Add `test:docker` script that runs `vitest run tests/docker.test.ts`.
- `README.md` — REPLACE. Verified quickstart + sections.

## Tasks & Acceptance

**Execution:**

- [x] `Dockerfile` — three-stage (client-builder → server-builder → runtime); curl for HEALTHCHECK; runs as `node` user; `STATIC_ROOT` baked in.
- [x] `.dockerignore` — excludes node_modules, dist, coverage, data, .git, _bmad, _bmad-output, docs.
- [x] `server/src/env.ts` — adds `STATIC_ROOT` (optional, trimmed, undefined when empty).
- [x] `server/src/server.ts` — accepts `staticRoot` opt; registers `@fastify/static` with `decorateReply: false` and `prefix: '/'` when set. AI-2 preserved (no SPA fallback).
- [x] `server/src/env.test.ts` — adds 3 STATIC_ROOT tests (default undefined, set picks up, whitespace treated as unset). Server suite: 51 → 53.
- [x] `docker-compose.yml` — single `app` service with volume mount + env vars.
- [x] `tests/docker.test.ts` — skipIf when docker unavailable; container-restart persistence assertion.
- [x] root `vitest.config.ts` + `test:docker` script + vitest as root devDep.
- [x] `README.md` — quickstart + dev + tests + planning-artifact pointers + repo layout.

**Acceptance Criteria:**

- Given `docker build -t todo-app-3 .` runs from the repo root, then it produces an image with EXPOSE 3000 and a HEALTHCHECK directive. (Verified manually by the operator; the existence of the directives in the Dockerfile is the spec compliance.)
- Given the runtime container is started with `docker run -p 3000:3000 -v ./data:/data todo-app-3`, then `curl http://localhost:3000/healthz` returns 200 + `{ ok: true, version }` and `curl http://localhost:3000/` returns the built client `index.html`.
- Given `docker compose up --build`, then a single container starts; stopping and restarting preserves `./data/todos.db`.
- Given `tests/docker.test.ts`, when Docker is available and the image is pre-built, then the test runs through POST → restart → GET and asserts persistence.
- Given Docker is NOT available, then `tests/docker.test.ts` skips itself with a clear message (no failure).
- Given `npm test` (root), then existing client + server suites still pass; the docker test is excluded by default (only `npm run test:docker` runs it).
- Given `npm run lint`, `npx prettier --check .`, both exit 0.
- Given `README.md`, when a fresh-clone reader follows it, then `docker build` + `docker run` produces a working app at `http://localhost:3000` (manual verification by the operator).
- Given the existing cross-user-isolation tests in `routes/todos.test.ts`, then the AI-3 + isolation invariants required by Story 5.3 are demonstrably enforced (already shipped in Story 2.4).

## Spec Change Log

<!-- Empty until first review loopback or implementation deviation -->

## Design Notes

- **`STATIC_ROOT` as the dev/prod switch.** Dev never sets it — Vite handles client serving via the proxy. Production Docker sets it to the bundled client dist path. Cleanest seam: server.ts code path is the same; only env differs.
- **`docker.test.ts` skips itself when Docker is missing.** Real CI environments often lack Docker; the test is a manual or build-time verification. `child_process.execSync('docker --version')` inside `test.skipIf(...)` is the cheapest detector.
- **No SPA fallback** preserves AI-2. `@fastify/static` with `decorateReply: false` and no `notFoundHandler` means unmatched paths use Fastify's default JSON 404.
- **Image size target ≤ 200 MB** is checked manually by the operator (`docker images | grep todo-app-3`). Hard to enforce without running docker in CI; documented as a non-blocking target.
- **README quickstart** mirrors the architecture's "Container shape" section. The quickstart commands are the architecture's deploy story made concrete.

## Verification

**Commands:**

- `npm run lint` (root) — exit 0
- `npm test` (root) — existing suites unchanged; docker test excluded
- `npm run test:coverage` (root) — both runtimes pass 80%
- `npx prettier --check .` (root) — exit 0
- `docker build -t todo-app-3 .` then `docker run -p 3000:3000 -v ./data:/data todo-app-3` — manual verification
- `npm run test:docker` — runs the docker integration test if Docker is available
