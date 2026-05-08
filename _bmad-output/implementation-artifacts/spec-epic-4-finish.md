---
title: 'Epic 4 finish — UX components, states, optimistic reducer (Stories 4.1–4.7)'
type: 'feature'
created: '2026-05-08'
status: 'done'
baseline_commit: '01d95a9bcf086ae7156900b3c2c853b76e405a12'
context:
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/ux-design-specification.md
  - _bmad-output/planning-artifacts/epics.md
---

<frozen-after-approval reason="bundled by explicit user choice (belt mode + auto-accept)">

## Intent

**Problem:** Epic 3 shipped the client foundation (identity, api, App shell), but the shell renders empty placeholder slots. Users can't see, add, toggle, or delete todos. Epic 4 fills the slots.

**Approach:** One reducer + five components + App.tsx wiring. The reducer is the architectural centerpiece — every mutation flows through it as `OPTIMISTIC_*` → API call → `CONFIRM_*` (success) or `ROLLBACK_*` (failure). Components consume `useReducer` state via props. App.tsx owns the dispatch + API-call orchestration; it loads on mount, dispatches optimistic actions on user input, awaits api.ts promises, and dispatches confirm/rollback based on outcome.

## Boundaries & Constraints

**Always:**
- Reducer at `client/src/reducer.ts` — pure function, exhaustive discriminated-union actions. State shape: `{ todos: Todo[], loading: boolean, error: string | null, optimisticPending: Set<string> }`.
- Action types (full set): `LOAD_REQUEST`, `LOAD_SUCCESS { todos }`, `LOAD_FAILURE { error }`, `OPTIMISTIC_CREATE { todo }`, `CONFIRM_CREATE { id, todo }`, `ROLLBACK_CREATE { id, reason }`, `OPTIMISTIC_TOGGLE { id }`, `CONFIRM_TOGGLE { id, todo }`, `ROLLBACK_TOGGLE { id, reason }`, `OPTIMISTIC_DELETE { id }`, `CONFIRM_DELETE { id }`, `ROLLBACK_DELETE { todo, reason }`, `OPTIMISTIC_DELETE_ALL`, `CONFIRM_DELETE_ALL`, `ROLLBACK_DELETE_ALL { todos, reason }`, `ERROR_DISMISS`.
- Rollback actions carry the inverse data: `ROLLBACK_DELETE` carries the full `Todo` (App stashes it pre-dispatch); `ROLLBACK_DELETE_ALL` carries the full prior list. The reducer doesn't memoise pre-mutation state internally.
- Optimistic semantics: list updates IMMEDIATELY on dispatch; `optimisticPending` records affected ids; confirm/rollback removes ids and either accepts the change (confirm) or reverts (rollback).
- All UI text from the UX spec exactly: page title "Todos" (already in App), input placeholder "Add a todo…", empty state "No todos yet.", loading "Loading…", erase confirm "Erase all your todos? This cannot be undone.", buttons "Erase" / "Cancel".
- Input cap: HTML `maxLength={280}` AND a client-side guard against empty/whitespace before dispatch.
- Rows in `optimisticPending` render at `opacity: 0.6`.
- Components are functional, prop-driven; **no internal state library**, only React's `useState` + `useReducer`. No `useEffect` outside `App.tsx`.
- All mutations use `crypto.randomUUID()` for new ids (architecture: client mints).
- Tests: jsdom + react-dom + react.act() — NO RTL.

**Ask First:**
- (none — auto-accept)

**Never:**
- Adding state libraries (Redux, Zustand, Jotai, etc.).
- Adding RTL or any testing-library helper.
- Adding CSS-in-JS. Plain class names + `App.css` only.
- Adding routing. Single view.
- Per-component `.module.css` files. Architecture suggests them, but for v1's 5 components a single shared `App.css` is the boring-governor pick — documented in Spec Change Log.
- Implementing `RETRY_LAST` as a reducer action. Retry mechanics live in `App.tsx` (closure over the failed call); the reducer only handles `ERROR_DISMISS`. The Story 4.5 AC mentioning `RETRY_LAST` is satisfied by App.tsx re-running the last failed call.
- Persisting reducer state to localStorage. Reload → re-fetch from server.

</frozen-after-approval>

## Code Map

- `client/src/reducer.ts` — NEW. State shape, action union, `initialState`, `todoReducer(state, action)`. ~120 lines.
- `client/src/reducer.test.ts` — NEW. ≥ 16 tests: each action's effect on state; confirm + rollback per mutation; optimisticPending bookkeeping.
- `client/src/components/TodoInput.tsx` — NEW. Auto-focus, Enter handler, maxLength=280, empty-guard.
- `client/src/components/TodoList.tsx` — NEW. `<ul>` of `TodoItem`.
- `client/src/components/TodoItem.tsx` — NEW. Checkbox + description + delete glyph; opacity=0.6 when pending; `aria-label="Delete"`; `aria-checked` mirrors completed.
- `client/src/components/StateMessages.tsx` — NEW. Three small components: `EmptyState` (`aria-live`), `LoadingState` (`aria-busy`), `ErrorState` (`role="alert"`, retry + dismiss).
- `client/src/components/DeleteAllControl.tsx` — NEW. Link → inline confirm row; focus moves to "Erase" button on expand; Escape collapses; Enter on Erase fires.
- `client/src/App.tsx` — REWRITE. `useReducer(todoReducer, initialState)`. `useEffect` on mount → load. Wires every component to dispatch + api.ts.
- `client/src/App.test.tsx` — REWRITE. Smoke tests of the new shape (renders title, input, list, erase control). Detailed flows tested via reducer + component unit tests.
- `client/src/components/*.test.tsx` — NEW per component.
- `client/src/App.css` — EXTEND. Component-scoped class names (`.todo-input`, `.todo-list`, `.todo-item`, `.todo-item--pending`, `.delete-glyph`, `.state-message`, `.state-message--error`, `.delete-all-link`, `.delete-all-confirm`).

## Tasks & Acceptance

**Execution:**

- [x] `client/src/reducer.ts` — 17 actions, exhaustive switch with TS `never` check, immutable Set updates.
- [x] `client/src/reducer.test.ts` — 17 tests covering every action + Set immutability.
- [x] `client/src/components/{TodoInput,TodoItem,TodoList,StateMessages,DeleteAllControl}.tsx` — 5 component files.
- [x] `client/src/components/components.test.tsx` — 16 tests across all 5 components (consolidated for shared mount infra).
- [x] `client/src/App.tsx` — useReducer + load on mount + optimistic-confirm-rollback for all 4 mutations + Escape-dismiss + Retry reloads.
- [x] `client/src/App.test.tsx` — 10 tests: 5 render-tree smoke + 5 mutation-flow integration tests.
- [x] `client/src/App.css` — extended with all component class names; design tokens used throughout.

**Acceptance Criteria:**

- Given the page mounts, when `App.tsx` calls `loadTodos()` on first render, then state transitions through `LOAD_REQUEST` → `LOAD_SUCCESS` (or `LOAD_FAILURE`).
- Given the input focused with text "milk", when Enter is pressed, then `OPTIMISTIC_CREATE` dispatches with a freshly minted UUID; the row appears at the top of the list immediately; the input clears + remains focused.
- Given an empty/whitespace-only input, when Enter is pressed, then no action dispatches.
- Given the input has 280 chars, when the user attempts to type more, then `maxLength` blocks at 280.
- Given a row, when the checkbox is clicked, then `OPTIMISTIC_TOGGLE` dispatches and the row's `completed` flips immediately; `aria-checked` reflects new state.
- Given a row, when the delete glyph is clicked, then `OPTIMISTIC_DELETE` dispatches and the row disappears immediately.
- Given a row in `optimisticPending`, when rendered, then its `opacity` is `0.6`.
- Given an API mutation rejects, when the rollback action dispatches, then the optimistic change is reverted AND `error` is set to a recoverable message.
- Given `state.error !== null`, then `ErrorState` renders above the list with `role="alert"`, message, Retry, Dismiss × buttons.
- Given Escape pressed, then `ERROR_DISMISS` dispatches.
- Given empty list + not loading + no error, then `EmptyState` shows "No todos yet." with `aria-live="polite"`.
- Given `loading === true`, then `LoadingState` shows "Loading…" with the list region `aria-busy="true"`.
- Given the page with ≥ 1 todo, then "Erase my data" link appears beneath the list.
- Given the link clicked, then it expands to the confirm row with the spec's text; focus moves to "Erase".
- Given Erase clicked / Escape pressed during confirmation, then `OPTIMISTIC_DELETE_ALL` fires / row collapses respectively.
- Given `npm run lint`, `npm test`, `npx prettier --check .`, `npm run test:coverage`, all exit 0; coverage ≥ 80% on every metric for both runtimes.

## Spec Change Log

<!-- Empty until first review loopback or implementation deviation -->

## Design Notes

- **Single `App.css` instead of per-component `.module.css`.** Architecture suggests modules per component, but with 5 small components and no class-collision risk in a single-page v1 app, one shared CSS file is the boring-governor pick. CSS modules can be introduced later mechanically.
- **Rollback actions carry the inverse.** Keeps the reducer pure and stateless about prior mutations. App.tsx stashes the prior `Todo` (or full list for `DELETE_ALL`) in a closure before dispatching `OPTIMISTIC_*`; if the API call rejects, App dispatches `ROLLBACK_*` with that snapshot.
- **`RETRY_LAST` lives in App.tsx.** App holds a `lastFailedCall: () => Promise<void>` closure. ErrorState's Retry button calls it. Reducer doesn't track this — it would force the reducer to know about API closures, breaking purity.
- **`useReducer` over `useState`.** Optimistic UI with confirm/rollback is exactly what reducers are good at. The 16 actions are the v1 mutation surface; adding more later is mechanical.
- **`optimisticPending` is a `Set<string>`** per Story 4.3's AC wording. New Set per state transition (immutability).
- **Components are dumb.** They receive props, fire callbacks. No data fetching, no api.ts imports inside components. App.tsx is the integration layer.

## Verification

**Commands:**

- `npm run lint` (root) — exit 0
- `npm test` (root) — all suites pass; client gains ≥ 30 tests across reducer + components
- `npm run build --prefix client` — Vite production bundle clean
- `npm run test:coverage` (root) — both runtimes pass 80% on all metrics
- `npx prettier --check .` (root) — exit 0
- `npm run dev` then open `http://localhost:5173` — manual: type "milk", Enter, see row appear; click checkbox, see strikethrough; click ×, row disappears; click "Erase my data" → Erase, list empties.
