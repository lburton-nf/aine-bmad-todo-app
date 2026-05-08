---
stepsCompleted:
  - step-01-init
  - step-02-discovery
  - step-02b-vision
  - step-02c-executive-summary
  - step-03-success
  - step-04-journeys
  - step-05-domain (skipped — domain is `general`, not applicable)
  - step-06-innovation (skipped — no innovation signals; product is deliberately a clean execution of existing concepts)
  - step-07-project-type
  - step-08-scoping
  - step-09-functional
  - step-10-nonfunctional
  - step-11-polish
  - step-12-complete
releaseMode: phased
inputDocuments:
  - _bmad-output/planning-artifacts/product-brief.md
  - _bmad-output/planning-artifacts/risks-and-watchlist.md
documentCounts:
  briefs: 1
  research: 0
  brainstorming: 0
  projectDocs: 0
workflowType: 'prd'
classification:
  projectType: web_app
  domain: general
  complexity: medium
  projectContext: greenfield
  annotations:
    projectType:
      - 'Borrow api_backend discipline: endpoint contracts, request/response schemas, error-code conventions'
      - 'Explicit FE↔BE integration contract: API base URL via env var (no hardcoding), CORS posture stated, container networking story decided in architecture'
    domain:
      - 'v1 hygiene: no secrets baked in Docker image; no full-token logging; provide a no-auth DELETE-my-data self-serve path'
      - 'Server-side opaque-ID validation: treat user_id as opaque on server; validate length + character set every request; never trust client uniqueness'
    complexity:
      drivers:
        - per-user scoping seam
        - well-tested + Docker + 4h bar
        - explicit extensibility constraint
      testMinima:
        - cross-user isolation integration test on every list/read/write endpoint
        - at least one integration test against the running Docker image
        - ESLint and Prettier configured and passing on the codebase
    projectContext:
      - 'Constrained greenfield: v1 non-goals are hard limits (no auth, no multi-user, no priorities/deadlines/notifications/collaboration)'
      - 'Transitional identity rule: user_id and per-browser anon ID are stepping-stones; no schema simplification, no anon- prefix business logic, no anon ID shown to user as stable identifier'
      - 'Schema typing: user_id is TEXT/VARCHAR, wide enough to hold both anon-{uuid} and future real account IDs without migration'
  crossCuttingNFR:
    - 'Optimistic UI contract: on server rejection, revert the optimistic change and surface the error in the existing error state'
---

# Product Requirements Document - todo-app-3

**Author:** Lisaannburton
**Date:** 2026-05-08

## Executive Summary

*Version: v1 — initial release.*

A focused, single-user task manager: polished, fast, and reliable. Its architectural choices keep the door open for growth as the product evolves. The product targets one person managing their own to-do list on a single device, with no signup or login. The problem it solves: people who want a quick, private to-do list are forced to choose between heavyweight apps that demand accounts and force feature decisions, or scratch-pad alternatives that lose data. The intent is a list that opens instantly, persists durably, and stays out of the way.

The v1 surface is deliberately narrow — create, view, complete, delete; one short textual description per task; one timestamp; one completion flag. Authentication, multi-user, priorities, deadlines, notifications, and collaboration are explicitly out of scope. The architecture is built so any of those can be added later without rewriting.

### What Makes This Special

For a problem this well-defined, the value is in *how* it's built, not *what* it does.

**Architectural openness.** Every v1 architectural choice preserves the option to add real authentication, multi-user, and richer features later without rewriting — concretely, a `user_id` seam from day one, env-var-driven configuration, and an explicit frontend↔backend integration contract. The full set of architectural obligations and the v1 interpretation rule (the ≤ 5-minute / no-v1-complexity bar) are defined in NFR-1.

**Polished, responsive frontend.** The user-visible surface is held to an explicit polish floor — considered states, instant feel via optimistic UI, responsive across desktop and mobile, all underpinned by semantic HTML. The bounded in/out list that backs this floor is the canonical reference in NFR-3; subjective late-build decisions reduce to checking that list.

**Guiding principle: engineering restraint.** Solve the deliberately-small scope without under-shipping or over-engineering. This is the quality bar applied to every choice above.

**Honest limit.** This product does not stake out a user-value differentiator beyond absence-of-friction. The brief deliberately walks away from feature-richness; the value proposition is *"open it, it works, stay out of the way."* Users who want collaboration, priorities, or sync across devices are explicitly not the target.

*Companion artifacts: `product-brief.md` (scope, captured decisions, architecture-step steers); `risks-and-watchlist.md` (twelve tracked risks with mitigation owners); `test-strategy.md` (test pyramid, deliberate omissions, file-by-file canonical list).*

## Project Classification

| Field | Value | Note |
|---|---|---|
| Project type | Full-stack web application | Browser-based SPA + small REST API; server-persisted state |
| Domain | General productivity | No regulated industry or compliance domain |
| Complexity | Medium | Per-user data scoping, well-tested + Docker-deployable bar, and explicit extensibility constraint each contribute |
| Project context | Greenfield, constrained | New build; v1 non-goals are hard limits, not soft preferences |

## Success Criteria

### User Success

The v1 user-acceptance gate is a single concrete demo, executed against the actual Docker image built per the README quickstart, run on a different machine than the one used for development. The browser console is open and visible throughout the demo and inspected for errors after the run. The full demo, from URL click to completion of step 8, must complete in under 2 minutes, on the first attempt, with no visible glitches and no console errors.

1. Open the app at the running URL — the empty state is visible and clearly communicates "no todos yet."
2. Type *"Buy milk"* into the input and submit — the task appears immediately at the top of the list.
3. Click *"Buy milk"* to mark it complete — the visual change is instant and unmistakable (e.g., strikethrough + dimmed).
4. Refresh the browser — the task is still present, still marked complete (backend persistence verified).
5. Add a second task *"Pick up dry cleaning"* — both tasks visible, the first task's completion state preserved.
6. Delete the second task — it disappears cleanly; the first remains.
7. Resize the browser to 320 px width (or open on a phone) — no horizontal scroll, all touch targets ≥ 44 px square, no overlapping or cut-off elements, text remains readable.
8. Close the browser tab and reopen the URL — todos and completion state are preserved (persistent identity + persistent storage verified).

Beyond the demo, the user-success criteria require all three UI states to be present and correct:

- **Empty state** when no todos exist.
- **Loading state** during the initial list fetch — visible whenever the fetch exceeds 200 ms; demonstrable via injected delay even when production fetches are faster.
- **Error state** when an API call fails — rendered in the page DOM, recoverable (user can retry or dismiss), and visually distinct from normal states. Verified by deliberately stopping the backend and observing both the optimistic-update revert and the rendered error.

### Business Success

Business success is intentionally deferred. v1 is product-validation: the goal is to deliver the smallest reliable version of the core experience, not to acquire users or generate revenue. Business metrics — acquisition, activation, retention, monetization — will be defined in a future iteration, after authentication and multi-user features unlock the conditions where those metrics are meaningful.

### Technical Success

The v1 technical-success bar is auditable and binary. Each of the following must be true:

- **Cross-user data isolation.** Every list / read / write endpoint has at least one integration test that issues requests authenticated as `user_id A` against routes returning data created by `user_id B`, asserting (a) GET returns 404 or 403, (b) PUT / DELETE return 404 or 403, and (c) B's data is unchanged after the call.

- **Container-image integration.** At least one integration test runs against the same image artifact that would be deployed — built from the Dockerfile referenced in the README, with no debug flags or development-only middleware. Data persists when the container is removed (`docker rm`) and a new container is started (`docker run`) against the same persistence volume.

- **Optimistic UI rollback.** Every optimistic mutation (create, toggle-complete, delete) reverts on server rejection. Verified by a manual test in which, with the frontend running, the backend is stopped (`docker stop`), each mutation is attempted, and for each: the optimistic update appears, the server rejection occurs, the optimistic update reverts, and the error is rendered in the DOM.

- **Code quality.** ESLint extends a recognized TypeScript-aware strict configuration (e.g., `@typescript-eslint/recommended-type-checked` or equivalent). Prettier is configured. `npm run lint` passes with zero errors and zero warnings. Rule downgrades are not permitted to satisfy this criterion; `eslint-disable` comments require a brief in-line justification.

- **Performance.** Server response p95 is under 100 ms for any CRUD action, measured over at least 100 requests against the running Docker container, computed as the 95th percentile of latency. Perceived UI latency for optimistic updates is under 50 ms, measured as the time between user input event and DOM mutation reflecting the optimistic update.

- **Keyboard accessibility.** Every interactive element is reachable via Tab. Every action is triggerable by Enter or Space. No keyboard traps. A visible focus indicator is present on every focusable element.

- **Input validation.** The server rejects payloads exceeding 1 KB. The server rejects requests with a malformed `user_id` (incorrect length or character set). The server rejects empty todo descriptions.

- **Hygiene.** No `ENV` declarations in the Dockerfile contain secret values, default values, or placeholders; all such configuration comes from runtime `--env` / `--env-file` or orchestration. User identifiers are either omitted from logs or replaced with a non-reversible hash. The no-auth `DELETE` endpoint removes all database rows scoped to the requesting `user_id`, verified by direct database inspection after the call.

- **Architectural seams.** Every persistence-layer function accepts `user_id` as a required argument. No SQL referencing the `todos` table appears in the codebase without a `WHERE user_id = ?` clause. Any debug or admin route is gated by an explicit, documented decision and excluded from the production image. The `anon-` prefix appears only in the ID generator and the validation regex; no other code branches on it. The API base URL is env-var-driven (no hardcoding). The CORS posture is explicit and documented.

### Measurable Outcomes

The PRD considers v1 done when **all** of the following pass:

- ✅ All 8 demo steps complete on the first attempt, in under 2 minutes (URL click → step 8), against the deployed Docker image.
- ✅ All three UI states (empty, loading, error) display correctly.
- ✅ Test suite passes, including every required integration test (cross-user isolation, Docker image, persistence-across-restart).
- ✅ Container starts cleanly, accepts requests, and persists data across `docker rm` + `docker run` against the same volume.
- ✅ ESLint and Prettier pass with zero errors and zero warnings, against a recognized strict config.
- ✅ Optimistic-UI rollback works for create, toggle-complete, and delete under simulated backend failure.
- ✅ Performance targets met (p95 server < 100 ms over 100+ requests; perceived UI < 50 ms).
- ✅ Keyboard accessibility verified (Tab navigation, Enter/Space actions, no traps, focus indicator).
- ✅ Input validation rejects oversized, malformed, and empty payloads.
- ✅ Hygiene verified — no Dockerfile secrets/placeholders, user IDs hashed-or-omitted in logs, DELETE removes DB rows.
- ✅ README contains a `docker build` + `docker run` quickstart, verified by following it from scratch on a clean machine before declaring done.

## Product Scope

**MVP is binary — every item below must be present for v1 to be considered complete; partial delivery is not partial-MVP.**

### MVP — Minimum Viable Product

The v1 scope as specified in the brief and Executive Summary:

- Create, view, complete, and delete todos.
- One short textual description per task; one timestamp; one completion flag.
- Per-browser anonymous identity via client-generated ID stored in cookie / localStorage; `user_id` column scopes all queries.
- Backend persistence (SQLite via raw SQL); data survives refreshes and container restarts.
- Polished, responsive frontend honoring the polish ceiling defined in the Executive Summary.
- All test minima passing.
- Deployable as a Docker image with a documented quickstart.
- No-auth `DELETE` path for self-serve data deletion.

### Growth Features (Post-MVP)

Capabilities unlocked by adding real authentication and account infrastructure. The architectural-openness NFR ensures each can be added without rewriting v1:

- Real user authentication (JWT, sessions, or OAuth).
- Proper user accounts with email/password (or third-party identity provider).
- Cross-device sync — same account, same list across browsers and devices.
- Migration of anonymous v1 IDs to real account IDs (claim flow).
- Postgres swap-in when scale or operational requirements demand it.

### Vision (Future)

Capabilities deliberately excluded from both MVP and Growth, included here for roadmap context only:

- Collaboration — shared lists, multi-user task assignment.
- Task metadata — priorities, deadlines, tags, projects.
- Notifications and reminders — push, email, calendar integration.
- External integrations — calendar, email, third-party productivity tools.
- Native mobile app or PWA with offline support.

## User Journeys

The product has, by design, a single user type — one person managing their own list. The journeys below describe **the same user**, *Maya*, in three distinct contexts that together exercise every load-bearing v1 capability. User types not represented in v1 (administrative, support, API/integration, cross-device returning users) are addressed explicitly at the end of this section.

### Primary persona: Maya

Mid-thirties, working remote, juggles a handful of to-dos a day. She has tried four todo apps in the last six months and abandoned each one — they either wanted her to sign up before her first task could exist, or required her to pick tags / projects / priorities up front, or felt sluggish enough that she stopped trusting the input. She wants a list that opens, lets her type, and stays out of her way.

### Journey 1 — First morning: Maya tries the app

**Opening scene.** Tuesday, 8:47 AM. Maya is on her second coffee. She has just stepped out of a planning call where five things landed on her plate. A colleague mentioned the app the day before — *"it's just a todo list, it works."* She types the URL.

**Rising action.** The page loads. No login screen. No signup. No "welcome, choose your plan." Just an empty list, the message *"No todos yet,"* and a single input at the top. She types — *"Reply to Henrik about the Q2 budget"* — and hits Enter. The task appears at the top of the list, instantly, no spinner. She types the next four tasks at the same speed. Five items, fifteen seconds.

**Climax.** Three minutes later she replies to Henrik. She switches back to the app tab, clicks the row, and watches the strikethrough land. The visual feedback is unmistakable. She thinks: *huh — this just works.*

**Resolution.** Two hours later, after another meeting, she refreshes the page out of habit. Everything is there, in order, completion state preserved. She adds two more tasks. By the end of the day she has used the app for four hours without ever opening documentation — because there is none to open.

**Capabilities revealed:** empty state with clear messaging; instant optimistic UI on create; visual completion-state distinction; persistent storage across refresh; no-onboarding / no-signup baseline.

### Journey 2 — The blip: optimistic UI under server failure

**Opening scene.** Mid-afternoon, same day. Maya is on flaky home Wi-Fi, between two meetings. She types *"Pick up the dry cleaning"* and hits Enter.

**Rising action.** The task appears in the list instantly, as expected. But under the surface, the request has stalled. After a few seconds the server times out. The task fades from the list, and a clear, calm error message appears: *"Couldn't save that task — try again?"* with a Retry button.

**Climax.** This is the moment of truth. Maya's network has blipped before in apps she's used; usually they either silently fail (her task evaporates with no signal), or they freeze a spinner forever, or they show a wall-of-error toast that stays until she refreshes. Here, she sees the optimistic update revert *and* a clear path forward. She clicks Retry. The task lands.

**Resolution.** Maya doesn't think about it again. She trusts that what she sees in the list is what is actually saved on the server. She continues using the app for the rest of the day with no further friction.

**Capabilities revealed:** optimistic UI with rollback on server rejection; error state rendered in DOM, recoverable, visually distinct; user trust through honest feedback rather than silent failures.

### Journey 3 — The narrow window: working from a side panel

**Opening scene.** Thursday morning. Maya is planning her week. Her laptop screen is split: a project document on the left, the todo app on the right. The app's window is about 380 pixels wide — roughly a third of her display.

**Rising action.** She works through the project doc, identifying tasks as she goes. Each task gets typed into the narrow app window: *"Review Henrik's draft," "Set up the Tuesday review," "Check the staging deploy."* The input adapts to the narrow width. Touch targets remain comfortable. The completed-task strikethrough reads cleanly; nothing wraps awkwardly or cuts off.

**Climax.** As she works, she can see her project doc on the left and her remaining todos on the right at the same time. The narrow side-panel layout actively helps her plan; it doesn't obstruct her.

**Resolution.** By Friday this is her default working setup. The narrow layout works without making her think about it — which is exactly what she wanted from a todo app in the first place.

**Capabilities revealed:** responsive layout across desktop and narrow viewport widths; touch targets and typography that hold up at ~320–400 px widths; layout that supports non-default screen real estate.

### Out of scope for v1

Several user types and journeys typical of more developed products are deliberately not represented in v1. These are not gaps — they reflect the brief's intentional v1 boundary, and each becomes a meaningful journey when its post-MVP capability lands.

- **Administrative users.** No admin interface or operator console exists in v1. The product is a single-user-per-browser experience by design; there is no concept of "managing other users" because there are no other users in the system.

- **Support / troubleshooting users.** No support workflow exists in v1. The product has no accounts, no contact path, and no user-state to recover. Users in trouble can clear their browser storage to reset; there is no escalation path because there is no escalation to make.

- **API / third-party integrations.** The HTTP API is internal-only, consumed exclusively by the v1 frontend. There is no public contract, no developer documentation, no SDK, and no authentication model that would let an external consumer integrate cleanly.

- **Returning users on a different device.** The per-browser anonymous identity model means a user opening the app on a different browser or device begins with a fresh list. This is a known and intentional v1 limitation, unblocked by the post-MVP authentication and account features described in Product Scope → Growth.

### Journey Requirements Summary

The three v1 journeys together exercise these capabilities. Each is required for v1 acceptance:

| Capability | Journeys | Connects to |
|---|---|---|
| Empty / loading / error state coverage | 1, 2 | Success Criteria → User Success |
| Instant-feel optimistic UI on create / complete / delete | 1, 2 | Cross-cutting NFR (Optimistic UI contract) |
| Server-rejection rollback with surfaced error | 2 | Cross-cutting NFR; Technical Success → Optimistic UI rollback |
| Visual completion-state distinction | 1 | Polish ceiling (in v1) |
| Responsive layout across desktop and narrow viewports | 3 | Polish ceiling (in v1); 8-step demo (step 7) |
| Persistent identity + persistent storage on same browser | 1 | Architectural openness (`user_id` seam); 8-step demo (steps 4, 8) |
| No-onboarding / no-signup baseline | 1 | Honest limit ("absence of friction") |

## Web Application Requirements

### Overview

todo-app-3 is a single-page web application: a React + TypeScript frontend served as Vite-built static assets, talking to a small REST API backend (Fastify + TypeScript). It is not a multi-page application, not server-rendered, and does not require search-engine indexing. The list view is the only view.

### Browser support matrix

The application targets the **last two stable versions** of:

- Chrome (desktop and mobile / Android)
- Firefox (desktop)
- Safari (desktop / macOS and mobile / iOS)
- Edge (desktop)

This is the evergreen baseline appropriate to a 2026 web application. The application is not required to render or function correctly on:

- Internet Explorer (any version)
- Browsers older than the last two stable versions of those listed
- Pre-Edge "legacy Edge" (EdgeHTML)

The build pipeline targets a syntax baseline compatible with this matrix; modern features are used freely.

### Responsive design

Responsive layout requirements are defined in the **Polish ceiling** (Executive Summary → What Makes This Special) and exercised in **User Journey 3 (The narrow window)**. The concrete acceptance criteria — included in the 8-step user-acceptance demo — are:

- No horizontal scroll at 320 px width.
- Touch targets ≥ 44 px square.
- No overlapping or cut-off elements at any supported width.
- Text remains readable at narrow widths.

Mobile parity is a polish-floor requirement, not a tradeoff candidate.

### Performance targets

Performance targets are defined in the **Technical Success** block (Success Criteria → Technical Success):

- **Server response p95 < 100 ms** for any CRUD action, measured over ≥ 100 requests against the running Docker container.
- **Perceived UI latency < 50 ms** for optimistic updates, measured as the time between user input event and DOM mutation.

These targets are calibrated for SQLite-backed CRUD on local Docker; they are unambiguously achievable with the chosen stack and reflect the brief's requirement that interactions "feel instantaneous under normal conditions."

### SEO strategy

**Not applicable.** The product is a per-user private list. Pages are not shareable, content is not public, and there is no concept of indexable URLs. The application:

- Renders no public content for crawlers.
- Provides no canonical URL structure for sharing.
- Does not require server-side rendering.
- Does not require structured data, OpenGraph tags, or sitemaps beyond the minimum needed for the document to load.

A future iteration with collaboration features (shared lists, public list URLs) would re-open this question.

### Accessibility level

Accessibility requirements for v1 are defined in the **Technical Success** block (Success Criteria → Technical Success → Keyboard accessibility):

- Every interactive element reachable via Tab.
- Every action triggerable by Enter or Space.
- No keyboard traps.
- A visible focus indicator on every focusable element.

The polish-floor additionally requires **semantic HTML** as a baseline (Executive Summary → What Makes This Special). A full WCAG 2.1 / 2.2 audit is out of v1 scope; advanced focus styling beyond the browser default is explicitly deferred per the polish ceiling.

### Real-time updates

**Not applicable for v1.** The product is single-user and stateless from a multi-user perspective; there is no other user whose changes need to be pushed. The "instant feel" requirement is delivered entirely client-side via optimistic UI; the server is consulted, but not relied on for sub-second perceived latency.

A future iteration with multi-user / collaboration features would introduce real-time considerations (WebSockets, SSE, or polling).

## MVP Strategy & Risk Posture

### MVP Strategy & Philosophy

**Approach: experience-first MVP with platform-grade foundations.**

The v1 delivery is an *experience MVP* — proving the polished baseline UX (instant feel, optimistic UI, considered empty / loading / error states, responsive layout) while laying *platform-grade foundations* that preserve evolution paths. This is not a problem-solving MVP (the problem is well-solved by existing tools); not a revenue MVP (no monetization in v1); and not a pure platform MVP (no third-party consumers in v1). The combination chosen reflects the product's "Honest limit": no user-value differentiator beyond absence-of-friction, with all defensible value concentrated in *how* the product is built.

**Resource posture.** Single full-stack engineer, time-boxed effort. Scope discipline is enforced by the constrained-greenfield rule (v1 non-goals are hard limits) and the binary-MVP rule (every MVP item ships, or it isn't MVP).

### Feature scope by phase

Phase boundaries are defined in the **Product Scope** section above (Success Criteria → Product Scope). For reference:

- **MVP (Phase 1, v1):** create / view / complete / delete; per-browser identity; SQLite persistence; polished, responsive frontend honouring the polish ceiling; all test minima; deployable Docker image with documented quickstart; no-auth `DELETE` self-serve.
- **Growth (Phase 2):** real authentication and accounts; cross-device sync; anonymous-to-real ID migration; Postgres swap-in.
- **Vision (Phase 3+):** collaboration; task metadata (priorities, deadlines, tags, projects); notifications; external integrations; native mobile / PWA / offline.

No re-scoping is proposed here. The Product Scope section is canonical.

### Risk mitigation strategy

**Technical risks.** Concrete v1 risks are tracked in `risks-and-watchlist.md` (R1–R12) with mitigation owners and resolution steps. Key concentrations:

- **FE↔BE integration seam** (CORS, base URL, container networking) — mitigated by env-var-driven configuration and an explicit integration test against the running Docker image.
- **Cross-user data isolation** — mitigated by required integration tests on every list / read / write endpoint, and by codebase invariants (every persistence function takes `user_id`; no SQL without `WHERE user_id = ?`).
- **Optimistic UI lying** — mitigated by the explicit rollback-and-surface-error contract (cross-cutting NFR), verified by manual stop-the-backend test.
- **Container hygiene gaps** (image size, healthcheck, persistence volume) — mitigated by the architecture-step decisions documented in `product-brief.md`.

**Market risks.** Not applicable for v1. Business success is intentionally deferred (Success Criteria → Business Success); v1 carries no acquisition, retention, or monetization assumptions to falsify.

**Resource risks.** Single-engineer time-boxed delivery has known dependencies on stack-choice paralysis (R1) and debugging-in-container time cost (R2). Mitigated by the boring stack-steer in `product-brief.md` (stack chosen before the build starts) and by the rule "get FE↔BE talking in dev mode first, containerize last."

## Functional Requirements

These functional requirements form the capability contract for v1. UX, architecture, epics, and stories must trace back to this list. Any capability not listed here will not exist in the final product.

### Task Management

- **FR1:** A user can create a new todo with a short textual description (≤ 280 characters).
- **FR2:** A user's todos are displayed in reverse-chronological order (newest first).
- **FR3:** A user can view their list of todos.
- **FR4:** A user can mark a todo as complete.
- **FR5:** A user can toggle a completed todo back to incomplete.
- **FR6:** A user can delete a todo with a single action; deletion is immediate and not confirmed in v1.
- **FR7:** The system stores each todo's textual description, creation timestamp, and completion status. The creation timestamp is used for ordering only and is not displayed in the v1 UI.

### Identity & Data Scoping

- **FR8:** A user is identified to the system by an anonymous, persistent identifier stored in their browser.
- **FR9:** When the application loads without a stored identifier, the client generates a new one. When the server receives a request with no identifier, it responds with an error in the application's standard error shape; the client treats this as a reset and generates a fresh identifier.
- **FR10:** The system associates every todo with the user identifier of its creator, scoping all reads, writes, and deletes accordingly.
- **FR11:** A user's todos persist across browser refresh.
- **FR12:** A user's todos persist across server container restart.
- **FR13:** Users on different browsers have isolated lists; no user can read, modify, or delete another user's data.

### Application States

- **FR14:** A user sees a clear empty-state indication when they have no todos.
- **FR15:** A user sees a loading-state indication while the initial todo list is being fetched.
- **FR16:** A user sees an error-state indication when an API call fails — visually distinct from normal states — with a way to retry or dismiss.

### Optimistic Interaction

- **FR17:** A user sees the result of every mutation (create, toggle-complete, delete) reflected in the interface immediately, without waiting for the server.
- **FR18:** When a mutation does not succeed — including server error responses (4xx / 5xx), network failures, and request timeouts — the user sees the optimistic change reverted and an error surfaced in the application's error state.
- **FR19:** A user sees completed todos as visually distinct from incomplete ones.

### Self-Service Data Control

- **FR20:** A user can delete all their own data — every todo and any associated identifier-scoped state — without authenticating.
- **FR21:** The "delete all my data" action is reachable from within the application's UI (not API-only).

### Keyboard & Accessibility

- **FR22:** A user can reach every interactive element on the page via keyboard navigation.
- **FR23:** A user can trigger every action via Enter or Space (in addition to mouse or touch).
- **FR24:** Every focusable element displays a visible focus indicator.

### Input Validation

- **FR25:** The system rejects todo descriptions that are empty, whitespace-only, or longer than 280 characters.
- **FR26:** The system rejects request payloads exceeding 1 KB.
- **FR27:** The system rejects requests whose user identifier does not match the expected format (length and character set).

## Non-Functional Requirements

This section consolidates the quality attributes the v1 system must satisfy. Several NFRs are restated here as canonical first-class items (architectural openness, optimistic UI contract, polish ceiling); the rest cross-reference existing sections that define their measurable criteria in detail.

### NFR-1: Architectural openness

Every v1 architectural choice must preserve the option to add real authentication, multi-user, and richer features later without rewriting.

**Interpretation rule:** *design for future-proofing only when the cost is ≤ 5 minutes AND no v1 code complexity is added.* Anything failing this bar is treated as premature.

**Concrete obligations on v1 architecture:**

- A `user_id` seam from day one, typed wide enough (`TEXT/VARCHAR`) to accept future real account IDs.
- Env-var-driven configuration; no hardcoded base URLs or credentials.
- Frontend↔backend integration contract that survives containerization (CORS posture stated, API base URL via env var).
- No business logic depending on the `anon-` prefix or treating anonymous IDs as user-visible identifiers.

### NFR-2: Optimistic UI contract

Every optimistic mutation (create, toggle-complete, delete) reverts on server rejection, with the error surfaced in the application's standard error state. *Rejection* includes server error responses (4xx / 5xx), network failures, and request timeouts.

Verification: manual stop-the-backend test (Success Criteria → Technical Success → Optimistic UI rollback).

### NFR-3: Polish ceiling

The user-visible surface is held to an explicit polish floor — neither under-shipped nor over-engineered. Subjective late-build decisions reduce to checking the in/out list.

**In v1:** empty / loading / error states; visual distinction for completed tasks; responsive layout (320 px–desktop); instant feel via optimistic UI; semantic HTML for keyboard and accessibility baseline; readable typography and spacing.

**Explicitly deferred:** micro-animations, dark mode, advanced focus rings beyond default, drag-and-drop reordering, keyboard shortcuts.

### NFR-4: Performance

Server response p95 < 100 ms over ≥ 100 requests against the running Docker container. Perceived UI latency < 50 ms for optimistic updates (input event → DOM mutation). Detailed acceptance criteria in Success Criteria → Technical Success → Performance.

### NFR-5: Security & data hygiene

The product holds no real PII (no names, no emails, no payment data) and does not implement authentication. Security NFRs are therefore narrow but non-negotiable:

- Cross-user data isolation enforced at the persistence layer (Success Criteria → Technical Success → Cross-user data isolation).
- Server-side opaque-identifier validation on every request (length and character set; FR27).
- No secrets baked into the Docker image; runtime env-var configuration only (Success Criteria → Hygiene).
- User identifiers omitted from logs or replaced with a non-reversible hash.
- Server-side input validation on payload size and content (FR25–FR27).

### NFR-6: Reliability & durability

- Data persists across browser refresh (FR11).
- Data persists across `docker rm` + `docker run` against the same persistence volume (FR12; verified by integration test).
- Container starts cleanly and accepts requests (Success Criteria → Container-image integration).
- A healthcheck endpoint (e.g. `/healthz`) exposes liveness so orchestrators can detect broken containers; details in architecture step.

### NFR-7: Accessibility

A full WCAG 2.1 / 2.2 audit is out of v1 scope. The v1 floor is keyboard accessibility (FR22–FR24): Tab navigation, Enter / Space actions, no traps, visible focus indicator. Semantic HTML is required as part of the polish-floor (NFR-3). Advanced focus styling beyond the browser default is explicitly deferred per NFR-3.

### NFR-8: Browser compatibility

Last two stable versions of Chrome (desktop + Android), Firefox (desktop), Safari (desktop + iOS), and Edge (desktop). Detailed matrix in Web Application Requirements → Browser support matrix.

### NFR-9: Maintainability & code quality

- Codebase passes ESLint (extending a recognized TypeScript-aware strict configuration) and Prettier with zero errors and zero warnings (Success Criteria → Code quality).
- Engineering restraint as a guiding principle: solve the deliberately-small scope without under-shipping or over-engineering.
- README contains a verified `docker build` + `docker run` quickstart (Success Criteria → Measurable Outcomes; risks-and-watchlist R8).

### NFR-10: Scalability

**Out of scope for v1.** The product is single-user-per-browser by design. Multi-user scaling, concurrent-request capacity testing, horizontal scaling, and database tuning are deferred to the Growth phase, where the introduction of authentication and multi-user features makes scaling concerns meaningful. v1 is sized for a single user per anonymous identifier with low-frequency CRUD operations.

### NFR-11: Rate limiting & abuse protection

**Acknowledged v1 gap, not a v1 requirement.** A single anonymous client could in principle send unbounded requests to the API; v1 does not implement rate limiting or abuse protection. This is consistent with the deliberate "no auth, no monetization, single-user-per-browser" v1 surface and is unblocked by the Growth-phase introduction of accounts and identity.

### NFR-12: Integrations

**None.** The v1 product has no external integrations, no public API for third parties, no webhooks, no SDKs, and no calendar / email / notification connectors. Detail in Web Application Requirements (SEO / Real-time) and Product Scope → Vision (Future).
