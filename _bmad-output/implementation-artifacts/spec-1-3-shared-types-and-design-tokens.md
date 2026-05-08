---
title: 'Story 1.3 — Shared types module and design-tokens stylesheet'
type: 'feature'
created: '2026-05-08'
status: 'done'
baseline_commit: '64f52e9954e8020cf30a020ad51a94259fe65ae2'
context:
  - _bmad-output/implementation-artifacts/epic-1-context.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/ux-design-specification.md
  - _bmad-output/implementation-artifacts/spec-1-1-init-repo-scaffolds.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Every downstream story (Epic 2 server, Epic 3 client, Epic 4 UX) needs a single source of truth for the Todo wire-shape and a parameterised design system. Without these contracts in place now, each later story would invent ad-hoc shapes and inline magic numbers.

**Approach:** Create `shared/types.ts` as the canonical, type-only contract for `Todo` plus request/response shapes. Create `client/src/tokens.css` declaring typography, colour, and spacing tokens on `:root` per the UX spec. Wire `tokens.css` into `client/src/main.tsx` so tokens are present before first render. Add one client-side smoke test that proves the cross-runtime import seam resolves.

## Boundaries & Constraints

**Always:**
- Wire-shape field names match the architecture exactly: `id` (UUID string), `description` (string), `created_at` (unix epoch ms number, snake_case to mirror the SQLite column), `completed` (boolean).
- `user_id` NEVER appears in `Todo` or in any response-shape type. It is a request-side concern only.
- Tokens declared as CSS custom properties on `:root` with the exact names and values from `ux-design-specification.md` → Design system (typography, colour, spacing).
- `tokens.css` is imported from `client/src/main.tsx` ABOVE the existing `index.css` import so tokens are declared before any other stylesheet that might consume them.
- `shared/types.ts` is type-only — `interface` declarations and type aliases, no runtime values. Keeps it inert under `verbatimModuleSyntax: true`.
- Smoke test is client-side only; server-side proof lands when 1.4 / 2.1 import `Todo`.

**Ask First:**
- (none — every decision is locked upstream by `architecture.md` and `ux-design-specification.md`)

**Never:**
- Modifying `client/src/index.css`, `App.tsx`, or any other Vite-scaffold demo file. Story 3.3 owns the App-shell rewrite.
- Introducing a tsconfig `paths` alias to prettify `shared/types` imports. Architecture forbids this in v1.
- Adding `zod` or any runtime-validation library. Hand-rolled validation lives at the API boundary in Epic 2.
- Adjusting `server/tsconfig.json` to handle cross-rootDir imports of `shared/types`. That is a Story 1.4 / 2.1 concern.
- Adding dark-mode tokens or any token not in the UX spec's Design system section.

</frozen-after-approval>

## Code Map

- `shared/types.ts` — NEW. Canonical wire-shape contract: `Todo`, `CreateTodoRequest`, `UpdateTodoRequest`, `HealthResponse`. Type-only file; zero runtime code.
- `shared/.gitkeep` — DELETE. The directory is no longer empty once `types.ts` exists.
- `client/src/tokens.css` — NEW. `:root` declarations for `--font-title/body/meta` (size + line-height), `--color-surface/text/text-muted/accent/error-bg/error-text/border`, `--space-1` through `--space-8`.
- `client/src/main.tsx` — EDIT. Add `import './tokens.css';` immediately above the existing `import './index.css';`.
- `client/src/types.smoke.test.ts` — NEW. Imports `Todo` (type-only) from `'../../shared/types'` and asserts a literal of that shape satisfies it. Proves the client-side import seam.

## Tasks & Acceptance

**Execution:**

- [x] `shared/types.ts` — create exporting `interface Todo`, `interface CreateTodoRequest`, `interface UpdateTodoRequest`, `interface HealthResponse` — single source of wire-shape truth for both runtimes
- [x] `shared/.gitkeep` — delete — directory no longer empty
- [x] `client/src/tokens.css` — create with one `:root { ... }` block declaring all typography, colour, and spacing tokens from UX spec — design-system parameterisation surface
- [x] `client/src/main.tsx` — add `import './tokens.css';` immediately above the existing `import './index.css';` line — tokens present at every component before first render
- [x] `client/src/types.smoke.test.ts` — create: `import type { Todo } from '../../shared/types';` and assert a literal `{ id: 'x', description: 'y', created_at: 1, completed: false }` typed as `Todo` — proves the cross-runtime import seam from the client side

**Acceptance Criteria:**

- Given the new `shared/types.ts`, when a TypeScript file under `client/src/` writes `import type { Todo } from '../../shared/types'`, then `cd client && npm run lint` passes with zero errors and zero warnings.
- Given the new `client/src/tokens.css`, when `cd client && npm run dev` is running, then opening the page in DevTools shows the documented tokens defined on `:root` (e.g. `--font-body`, `--color-text`, `--space-3`) with the UX-spec values.
- Given `cd client && npm test`, then `smoke.test.ts` AND `types.smoke.test.ts` both pass; Vitest exits 0.
- Given `cd server && npm test`, then the existing server smoke test still passes (no regression); exits 0.
- Given the repo root, when `npm test` is run, then both client and server runs pass and exit 0.
- Given the repo root, when `npx prettier --check .` is run, then it exits 0 (all new files are Prettier-clean).
- Given `shared/types.ts`, when its content is inspected, then no `user_id` field appears in `Todo` or in any response-shape type.

## Spec Change Log

<!-- Empty until first review loopback -->

## Design Notes

- **Type-only file.** `shared/types.ts` exports interfaces and type aliases only. No `enum`, no `const`, no runtime values. This sidesteps `verbatimModuleSyntax: true` issues on the client side (consumers will use `import type { ... }`) and means the file emits no JS — it never enters either runtime's bundle.
- **`created_at` snake_case is deliberate.** Mirrors the SQLite column name and architecture's wire-shape decision. Rejected alternative: `createdAt` would force a server-side mapping layer between DB rows and JSON responses; boring governor says don't add a layer for cosmetics.
- **`Todo` excludes `user_id` by design.** The cross-user-isolation invariant (NFR-5) is enforced at persistence and on every request via `X-User-Id`. The wire shape never carries the caller's identity back to them. Encoding this in the type keeps it from accidentally leaking into a future response handler.
- **Token import: `main.tsx`, above `index.css`.** `main.tsx` runs at bootstrap before any render, so tokens are on `:root` for the first paint; placing the import above `index.css` means any later stylesheet (including `index.css`'s 3.3 replacement) can already see the variables.
- **Why a smoke test for a type-only file?** Catches three regressions cheaply: file path is right, the relative-import seam works from `client/src/`, and the field names match what callers will write. A test that *uses* the type is enough — TypeScript does the assertion at compile time.

## Verification

**Commands (run in order):**

- `cd client && npm run lint` — expected: exit 0, zero errors, zero warnings
- `cd client && npm test` — expected: 2 passing tests (`smoke.test.ts`, `types.smoke.test.ts`), exit 0
- `cd server && npm test` — expected: 1 passing test, exit 0 (no regression)
- `npm test` from repo root — expected: chained client + server runs pass, exit 0
- `npx prettier --check .` from repo root — expected: exit 0
- `cd client && npm run dev` — expected: Vite starts on `http://localhost:5173/`; quit with Ctrl-C

**Manual checks:**

- With `npm run dev` running, open the app in a browser, inspect `<html>` in DevTools, confirm the `:root` style block contains every token from `ux-design-specification.md` → Design system with the documented values.

## Suggested Review Order

**Wire-shape contract** (entry point — the load-bearing surface every Epic 2/3 module imports)

- `Todo` interface — canonical persisted-row shape; field names and casing are deliberate (snake_case `created_at` mirrors the SQLite column).
  [`types.ts:4`](../../shared/types.ts#L4)

- Unit on `created_at` documented inline — kills the ms-vs-seconds ambiguity at the type definition itself.
  [`types.ts:7`](../../shared/types.ts#L7)

- `CreateTodoRequest` — client mints `id` (architecture: optimistic-UI rollback would be hard otherwise).
  [`types.ts:12`](../../shared/types.ts#L12)

- `HealthResponse` — literal `ok: true` matches architecture's documented success shape; the `true`-vs-`boolean` question is deferred to Story 1.4.
  [`types.ts:21`](../../shared/types.ts#L21)

**Design tokens**

- `:root` declarations — every typography size, line-height, colour, and spacing value pulled verbatim from the UX design spec.
  [`tokens.css:1`](../../client/src/tokens.css#L1)

- Typography tokens carry both size and line-height from the UX spec table — addressed during review.
  [`tokens.css:3`](../../client/src/tokens.css#L3)

- Tokens wired in at app bootstrap, ABOVE `index.css`, so vars exist before any stylesheet that may consume them.
  [`main.tsx:3`](../../client/src/main.tsx#L3)

**Cross-runtime import seam**

- The relative-path import that proves `shared/types` resolves from `client/src/`. Load-bearing for Epic 3.
  [`types.smoke.test.ts:4`](../../client/src/types.smoke.test.ts#L4)
