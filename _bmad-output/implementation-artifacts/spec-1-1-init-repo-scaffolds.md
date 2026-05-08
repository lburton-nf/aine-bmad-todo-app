---
title: 'Story 1.1 — Initialize repo and create runtime scaffolds (with tests + lint baked in)'
type: 'feature'
created: '2026-05-08'
status: 'done'
baseline_commit: 'NO_VCS'
completed_at: '2026-05-08T13:29'
context:
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/epics.md
  - _bmad-output/planning-artifacts/test-strategy.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The repo currently contains only `_bmad/` tooling and `_bmad-output/` planning artifacts. There is no runnable code, no test runner, and no lint/format configuration. Every subsequent story assumes a working scaffolded environment **with tests and lint already operational**.

**Approach:** Create the three top-level source directories (`client/`, `server/`, `shared/`) using the architecture-step initialization commands; install Vitest + ESLint + Prettier with shared root-level configuration; verify each runtime starts in dev mode AND that `npm test` and `npm run lint` pass with zero failures from day zero. The test pyramid's *lint-as-test* and *unit* tiers must be live before any feature code exists.

## Boundaries & Constraints

**Always:**
- Use the architecture-step initialization commands as the spine. No deviation on package selection.
- TypeScript strict mode in both `client/tsconfig.json` and `server/tsconfig.json`.
- ESLint extends `@typescript-eslint/recommended-type-checked` exactly (NFR-9 + test-strategy lint-as-test rule).
- A root-level `.eslintrc.cjs` and `.prettierrc` are the canonical config; client and server `.eslintrc.cjs` extend them. (Architecture: "configured once at the repo root and extended.")
- Each runtime has at least one **smoke test** (`*.smoke.test.ts`) that exercises Vitest's runtime end-to-end. Purpose: prove the test harness works from line zero so subsequent stories' first tests do not double as harness-debugging exercises.
- No workspaces / pnpm / yarn workspaces / monorepo manager.

**Ask First:**
- (none — spec is mechanical, decisions already locked by upstream)

**Never:**
- Adding any dependency not named in `architecture.md` → Initialization commands or in this spec.
- Installing React Testing Library (test-strategy: skip RTL for v1).
- Installing Husky, lint-staged, or any pre-commit hook (defer to Growth phase).
- Pinning specific dependency versions (intentionally unpinned; dev step pulls current).
- Initialising git in this story (separate concern; commits happen at story boundaries).

## I/O & Edge-Case Matrix

(no I/O surface — pure scaffold + harness)

</frozen-after-approval>

## Code Map

- `client/` — Vite + React + TypeScript scaffold from `npm create vite@latest client -- --template react-ts`
- `client/vitest.config.ts` — Vitest config (jsdom environment for client-side tests)
- `client/src/smoke.test.ts` — proves Vitest runs in the client
- `server/` — hand-rolled Fastify + TypeScript project
- `server/src/index.ts` — minimal placeholder (real bootstrap is story 1.4)
- `server/src/smoke.test.ts` — proves Vitest runs in the server
- Root `package.json` — dev-tooling scope only (ESLint, Prettier, type packages); not a workspaces manifest
- Root `.eslintrc.cjs` — canonical ESLint config; extended by both runtimes
- Root `.prettierrc` — canonical Prettier config
- `client/.eslintrc.cjs` / `server/.eslintrc.cjs` — extend root config; per-runtime parser options where needed
- `shared/.gitkeep` — placeholder so the directory commits empty

## Tasks & Acceptance

**Execution:**

- [ ] **Client scaffold:** `npm create vite@latest client -- --template react-ts` from repo root, then `cd client && npm install`
- [ ] **Client test runner:** `cd client && npm install -D vitest jsdom` (no RTL per test-strategy)
- [ ] `client/vitest.config.ts` — environment `'jsdom'`, includes `src/**/*.{test,smoke.test}.ts(x)`
- [ ] `client/src/smoke.test.ts` — single test importing nothing from project; asserts `1 + 1 === 2`. Comment at top explains: this proves the harness; remove when first real test exists.
- [ ] `client/package.json` — add `"test": "vitest run"`, `"test:watch": "vitest"`, `"lint": "eslint ."`
- [ ] **Server scaffold:** `mkdir server && cd server && npm init -y && npm install fastify @fastify/cors @fastify/static better-sqlite3 && npm install -D typescript tsx vitest @types/node @types/better-sqlite3 && npx tsc --init`
- [ ] `server/tsconfig.json` — `"target": "ES2022"`, `"module": "Node16"`, `"moduleResolution": "Node16"`, `"strict": true`, `"outDir": "dist"`, `"rootDir": "src"`, `"esModuleInterop": true`
- [ ] `server/src/index.ts` — placeholder `console.log('server starting')` (real bootstrap in story 1.4)
- [ ] `server/src/smoke.test.ts` — single test asserting `1 + 1 === 2`. Same purpose-comment as client.
- [ ] `server/package.json` — add `"dev": "tsx watch src/index.ts"`, `"build": "tsc"`, `"start": "node dist/index.js"`, `"test": "vitest run"`, `"test:watch": "vitest"`, `"lint": "eslint ."`
- [ ] **Root tooling:** `npm init -y` at repo root → root `package.json`. Then `npm install -D eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin prettier`. Add `"private": true` and `"scripts": { "test": "cd client && npm test && cd ../server && npm test", "lint": "eslint ." }`.
- [ ] Root `.eslintrc.cjs` — `parser: '@typescript-eslint/parser'`, `extends: ['@typescript-eslint/recommended-type-checked']`, `parserOptions: { project: ['./client/tsconfig.json', './server/tsconfig.json'] }`, ignores `dist/` and `node_modules/`.
- [ ] Root `.prettierrc` — `{ "singleQuote": true, "trailingComma": "all", "printWidth": 100, "semi": true }`.
- [ ] `client/.eslintrc.cjs` — `extends: ['../.eslintrc.cjs']` plus React rules.
- [ ] `server/.eslintrc.cjs` — `extends: ['../.eslintrc.cjs']`.
- [ ] `shared/.gitkeep` — empty placeholder.
- [ ] `.gitignore` at repo root — `node_modules/`, `dist/`, `.env`, `data/`, `*.log`.

**Acceptance Criteria:**

- Given the scaffolded repo, when running `cd client && npm run dev`, then Vite dev server starts on port 5173 without error.
- Given the scaffolded repo, when running `cd server && npx tsx src/index.ts`, then prints `server starting` and exits cleanly.
- Given the scaffolded repo, when running `cd client && npm test`, then Vitest runs `smoke.test.ts` and reports 1 passing test, exits 0.
- Given the scaffolded repo, when running `cd server && npm test`, then Vitest runs `smoke.test.ts` and reports 1 passing test, exits 0.
- Given the scaffolded repo, when running `npm test` from the **repo root**, then both client and server test runs execute sequentially and the combined outcome is success (exits 0).
- Given the scaffolded repo, when running `npx eslint .` from the **repo root**, then exits 0 with zero errors and zero warnings against the freshly-scaffolded code.
- Given the scaffolded repo, when running `npx prettier --check .` from the **repo root**, then exits 0 (all files already formatted by Vite scaffold + our small additions).
- Given the scaffolded repo, when listing top-level, then `client/`, `server/`, `shared/` exist as siblings; `.eslintrc.cjs`, `.prettierrc`, `.gitignore`, `package.json` (root) sit at the repo root.

## Verification

**Commands (run in this order; each must pass before the next):**

- `npm install` (root) — expected: root dev-tooling installs cleanly
- `cd client && npm install` — expected: client deps install cleanly
- `cd server && npm install` — expected: server deps install cleanly
- `cd client && npm run dev` — expected: prints `Local: http://localhost:5173/` within 5s; quit with Ctrl-C
- `cd server && npx tsx src/index.ts` — expected: prints `server starting` and exits
- `cd client && npm test` — expected: 1 test passing, exit 0
- `cd server && npm test` — expected: 1 test passing, exit 0
- `npm test` from repo root — expected: both runs pass, exit 0
- `npx eslint .` from repo root — expected: zero errors, zero warnings, exit 0
- `npx prettier --check .` from repo root — expected: exit 0
