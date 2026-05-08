---
title: 'Stories 3.1 + 3.2 + 3.3 — Epic 3 finish: identity, API client, App shell'
type: 'feature'
created: '2026-05-08'
status: 'done'
baseline_commit: 'bd2be4d3b3e725cbd9263e34051a95a306ad1224'
context:
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/ux-design-specification.md
  - _bmad-output/planning-artifacts/epics.md
---

<frozen-after-approval reason="bundled by explicit user choice (belt mode + auto-accept)">

## Intent

**Problem:** The server is feature-complete but the client is the Vite scaffold demo. Epic 3 stands up the three foundational client modules — identity, API wrapper, App shell — that Epic 4 (UX components) will fill in.

**Approach:** Three deliverables in one cycle, sharing the same review pass:
1. `client/src/identity.ts` — mints/persists/validates/resets `anon-${uuid}` in localStorage.
2. `client/src/api.ts` — fetch wrapper attaching `X-User-Id`, typed `ApiError` with category, six callable functions matching the server's REST surface.
3. `client/src/App.tsx` (+ refreshed `App.css` and `index.css`) — replaces the Vite demo with the v1 shell: centred 480px column, "Todos" title, slots for input/list/state/erase per the UX spec.

**Bundling rationale:** Per SCOPE STANDARD, the three deliverables ARE technically independent. User explicitly chose to bundle in belt mode. The shell consumes nothing from identity/api in this story (it just renders slots), but all three land together so Epic 4 has a complete client foundation to build on.

## Boundaries & Constraints

**Always:**
- `identity.ts` exports `getUserId(): string` and `reset(): string`. `getUserId` returns a stored value if it matches `/^anon-[0-9a-f-]{36}$/`, else mints `anon-${crypto.randomUUID()}`, persists, and returns. `reset` clears the storage and mints anew.
- localStorage key is `todo.userId` exactly.
- `api.ts` reads `import.meta.env.VITE_API_BASE_URL` once at module load; default to `''` (same-origin).
- Six API functions: `listTodos()`, `createTodo(input)`, `toggleCompleted(id, completed)`, `deleteTodo(id)`, `deleteAll()`, `health()`. Return types match `shared/types`.
- Every request attaches `X-User-Id` from `identity.getUserId()`; non-GET requests JSON-stringify the body and add `Content-Type: application/json`.
- `ApiError extends Error` with `category: 'server' | 'network' | 'timeout'` and optional `status: number`. Thrown from a single internal `request<T>` helper.
- Network failures (fetch rejection) → `ApiError('network', message)`. Non-2xx response → `ApiError('server', message, status)`. AbortSignal-timeout firing → `ApiError('timeout', ...)`.
- `App.tsx` renders the v1 layout: a `<main>` with the title "Todos" and four placeholder slots (`data-slot="input" | "state" | "list" | "erase"`).
- `App.css` is rewritten using design tokens for colours, spacing, and font sizes. The system font stack is inlined (UX spec doesn't name it as a token).
- `index.css` is reset to a minimal box-sizing + body-margin reset (the Vite demo styles are removed — Story 1.3 explicitly deferred this cleanup to here).
- Tests use jsdom + react-dom directly. NO `@testing-library/react` (architecture/test-strategy explicitly skipped RTL).

**Ask First:**
- (none — auto-accept mode)

**Never:**
- Adding a state library. App.tsx in this story is purely structural; no state, no reducer, no useEffect. Epic 4 introduces those.
- Wiring identity or api INTO App.tsx. The shell renders slots only.
- Adding `@testing-library/react` or any RTL helper.
- Adding axios, ky, or any HTTP wrapper beyond plain `fetch`.
- Adding `--font-family` to tokens.css. It's not a named UX-spec token; system stack is inlined in App.css.
- Adding new dev dependencies. We have everything (vitest + jsdom + vite + react).

</frozen-after-approval>

## Code Map

- `client/src/identity.ts` — NEW. Two exported functions, one storage key constant, one regex constant, one `mint()` helper.
- `client/src/identity.test.ts` — NEW. 5+ tests via mocked localStorage (jsdom provides one): mint on empty, return on valid stored, discard malformed, reset clears + remints, persistence across calls.
- `client/src/api.ts` — NEW. `BASE` constant, `ApiError` class, internal `request<T>` helper, six exported functions.
- `client/src/api.test.ts` — NEW. Mocks `globalThis.fetch` per case. Covers each function's URL+method+headers, JSON body for non-GET, 2xx → typed return, 4xx/5xx → `ApiError('server', ..., status)`, fetch reject → `ApiError('network', ...)`, AbortSignal timeout → `ApiError('timeout', ...)`.
- `client/src/App.tsx` — REPLACE. Drops Vite demo content; renders the v1 shell.
- `client/src/App.test.tsx` — NEW. jsdom mounts the App via createRoot; asserts title text and the four slots are present.
- `client/src/App.css` — REPLACE. v1 layout using design tokens.
- `client/src/index.css` — REPLACE. Minimal reset only (drops Vite demo styles).
- `client/src/assets/` — leave alone (one demo SVG; not in App.tsx render path after rewrite).
- `client/vitest.config.ts` — EDIT. Drop `'src/App.tsx'` from the coverage exclude list (it now has tests).

## Tasks & Acceptance

**Execution:**

- [x] `client/src/identity.ts` — getUserId/reset using `crypto.randomUUID()` + `localStorage`.
- [x] `client/src/identity.test.ts` — 6 tests covering mint/persist/discard-malformed/discard-empty/keep-valid/reset.
- [x] `client/src/api.ts` — `ApiError` class + internal `request<T>` helper + 6 exported functions; `AbortSignal.timeout(10_000)`.
- [x] `client/src/api.test.ts` — 10 tests: 6 happy paths + non-2xx (with JSON message + with non-JSON fallback) + network reject + timeout reject.
- [x] `client/src/App.tsx` — replaced Vite scaffold with the v1 shell (main + h1 + 4 data-slot divs).
- [x] `client/src/App.test.tsx` — 3 tests: title text, four slots, top-level main.app-shell.
- [x] `client/src/App.css` — token-driven layout; system font stack inlined.
- [x] `client/src/index.css` — minimal box-sizing + body margin reset.
- [x] `client/vitest.config.ts` — App.tsx exclusion removed; comment notes Story 3.3 added tests.

**Acceptance Criteria:**

- Given a fresh browser (no `todo.userId` in localStorage), when `getUserId()` is called, then it returns a freshly-minted `anon-{uuid}` AND the same value is now in `localStorage.todo.userId`.
- Given a malformed `todo.userId` in localStorage (e.g. `"junk"`), when `getUserId()` is called, then the malformed value is replaced by a fresh mint.
- Given a valid stored `todo.userId`, when `getUserId()` is called twice, then both calls return the same value (no re-mint).
- Given `reset()` is called, then `localStorage.todo.userId` is replaced by a freshly minted value (different from the prior).
- Given `listTodos()` is called, when fetch returns 200 with a JSON array, then the array is returned typed as `Todo[]` AND the underlying call was `fetch('/todos', { ... headers includes X-User-Id })`.
- Given `createTodo({ id, description })` is called, then fetch was POST '/todos' with JSON body and `Content-Type: application/json`.
- Given `toggleCompleted(id, completed)` is called, then fetch was PATCH '/todos/:id' with JSON body `{ completed }`.
- Given `deleteTodo(id)` is called, then fetch was DELETE '/todos/:id'; on 204 the function resolves to undefined.
- Given `deleteAll()` is called, then fetch was DELETE '/todos'.
- Given `health()` is called, then fetch was GET '/healthz'.
- Given fetch rejects (network failure), then the function rejects with `ApiError` whose category is `'network'`.
- Given fetch resolves with a 4xx or 5xx status, then the function rejects with `ApiError` whose category is `'server'` and `status` matches.
- Given fetch is aborted via `AbortSignal.timeout`, then the function rejects with `ApiError` whose category is `'timeout'`.
- Given `App.tsx` is mounted via `createRoot`, when the DOM is inspected, then the page contains the text "Todos" and elements with `data-slot="input"`, `"state"`, `"list"`, `"erase"`.
- Given `npm run lint` (root), `npm run test` (root), `npx prettier --check .` (root) — all exit 0.
- Given `npm run test:coverage` (root) — server still passes 80%; client now passes 80% on every metric (App.tsx and identity/api covered by their tests).

## Spec Change Log

<!-- Empty until first review loopback or implementation deviation -->

## Design Notes

- **`api.ts` uses `AbortSignal.timeout(10_000)` for a 10s request timeout.** Modern browsers + Node 18+ support this. Tests mock fetch to throw a `DOMException` with name `'TimeoutError'` to verify the timeout-category branch.
- **`identity.ts` doesn't validate that `crypto.randomUUID()` matches the regex.** It's guaranteed to: the regex is `/^anon-[0-9a-f-]{36}$/`, which matches `anon-` + 36 lowercase hex/hyphen chars; `crypto.randomUUID()` returns lowercase canonical UUID = 36 chars with hyphens at positions 9, 14, 19, 24. Match.
- **`App.tsx` slots use `data-slot` attributes**, not className, so Epic 4 components can replace them by querying via `[data-slot="..."]`. Cleaner seam than CSS-class-coupling.
- **`index.css` minimal reset** drops `font-size`, `color-scheme`, demo-content selectors. App.css owns the rest.
- **No `--font-family` token** added. UX spec lists three typography tokens by name; the system font stack is inlined where needed.

## Verification

**Commands:**

- `npm run lint` (root) — exit 0
- `npm test` (root) — exit 0; client and server suites both green
- `npm run test:coverage` (root) — both runtimes pass 80% on every metric
- `npx prettier --check .` (root) — exit 0
- `npm run dev` — both runtimes boot; manual: open http://localhost:5173, see "Todos" title in the centred column.
