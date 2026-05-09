# REVIEW_1 — todo-app-3

**Reviewer:** Claude (Opus 4.7), aggressive review pass
**Date:** 2026-05-09
**Scope:** Entire repo. Compared shipped code against PRD, architecture, and product brief.
**Method:** Verified by running `npm run lint` (clean), `npm test` (114/114 pass), `npm run format:check` (clean), and reading every source/test/config file. No CI to consult.

> **TL;DR.** This is a strong build for a 4-hour learning exercise that grew teeth. Server is genuinely good — cross-user isolation tests are rigorous, the 413 / 404-envelope / AI-3 invariants are all asserted, env.ts module-side-effect testing is correctly done. The headline gap is that **NFR-2 (the flagship "optimistic UI rollback" contract) has no automated test**, **FR9 client-side identity reset is unimplemented dead code**, and **the lint config is one rung below what NFR-9 specifies**. There are also several documentation drifts: the architecture document, the deferred-work file, and the stock Vite client/README all describe a different system than the one that shipped. Below: ranked findings with file:line refs.

---

## Status (updated post-review)

- ✅ **M1 fixed** — `e2e/rollback.spec.ts` adds three NFR-2 rollback tests (POST/PATCH/DELETE), one per mutation, with a 500 ms response delay so the optimistic frame is observable.
- ✅ **M2 fixed** — `client/src/api.ts` now resets identity and retries once on `400` with an `X-User-Id` complaint; bounded by a `retried` flag. Three new tests in `client/src/api.test.ts`.
- ✅ **M3 fixed** — both eslint configs upgraded to `recommendedTypeChecked` with `projectService: true`; server tsconfigs split (`tsconfig.json` for type-check / lint, new `tsconfig.build.json` for `tsc` emit). Sync Fastify handlers de-asynced; redundant `(err as ...).code` cast dropped.
- ➕ **New: production smoke suite** — `playwright.docker.config.ts` + `e2e/smoke.docker.spec.ts` + `scripts/test-e2e-docker.sh`. Six tests run against the actual Docker artifact via `npm run test:e2e:docker`. Closes the static-serve / same-origin / production-bundle / AI-2-under-`@fastify/static` gap that the dev e2e never exercised, and incidentally covers the FR11 part of **Mo12**.

Open: M4 (touch targets / hover-only delete), M5 (CI workflow), M6 (Firefox + WebKit Playwright projects), all Moderate / Minor items.

---

## Severity legend

- **Major** — load-bearing claim from PRD/architecture is unmet, or a real user-facing bug. Should fix before pitching as portfolio.
- **Moderate** — drift, dead code, missing test coverage of a stated requirement, or visible inconsistency between docs and code.
- **Minor** — nits, micro-correctness, polish.
- **Praise** — things to keep.

---

## Major

### M1. ✅ FIXED — NFR-2 (Optimistic UI rollback) is not automatically tested anywhere

PRD calls this the _flagship_ differentiator: Journey 2 is built around it; Technical Success and the Cross-cutting NFR both elevate it; the Test Strategy presumably required it. The reducer's transitions are unit-tested in `client/src/reducer.test.ts`, but **no test exercises the full create/toggle/delete → server-rejects → rollback path** through either:

- the App layer (`client/src/App.test.tsx` only mocks happy-path responses + a fail-on-load + retry; no mutation-rejection rollback), or
- the e2e layer (`e2e/todo.spec.ts` has no `page.route('**/todos', route => route.abort())` for any of POST/PATCH/DELETE).

**Why it matters:** the unit reducer test proves the reducer is pure; it does _not_ prove the App actually dispatches `ROLLBACK_*` when the api wrapper throws. A future refactor that swaps the dispatch order in `App.tsx:60-114` could silently break the contract and every existing test would still pass.

**Fix:** add three Playwright tests (one per mutation) that abort the network call and assert the optimistic row reverts + an alert appears. ~30 LOC each. The accessibility spec already shows the route-abort pattern at `e2e/accessibility.spec.ts:46`.

### M2. ✅ FIXED — FR9 client identity-reset is dead code

PRD FR9: _"When the server receives a request with no identifier, it responds with an error in the application's standard error shape; **the client treats this as a reset and generates a fresh identifier.**"_

`client/src/identity.ts:28` exports `reset()`. It is never imported by anything except its own test (`grep -rn "reset" client/src/ --include='*.ts*' | grep -v test` returns only the export and the doc comment). When the api wrapper sees a 400 from the X-User-Id preHandler, it throws `ApiError('server', 'X-User-Id header missing or malformed', 400)`. `App.tsx:14` translates that to a generic "Server error." string and renders the ErrorState. **The client never resets and the user is stuck.**

**Repro:** open DevTools, run `localStorage.setItem('todo.userId', 'garbage')`, refresh. Expected per FR9: silent reset + fresh load. Actual: error banner; user has to manually edit localStorage to recover.

**Fix:** in `client/src/api.ts:67`, before throwing, detect `response.status === 400 && message.includes('X-User-Id')` (or use a typed error code from the server) and call `identity.reset()` + retry once. Keep the retry single-shot so a misbehaving server doesn't loop.

### M3. ✅ FIXED — ESLint config is "recommended", not "recommended-type-checked" — NFR-9 partially unmet

PRD NFR-9 / Technical Success → Code quality: _"ESLint extends a recognized TypeScript-aware **strict** configuration (e.g., `@typescript-eslint/recommended-type-checked` or equivalent)."_

Both `client/eslint.config.js:14` and `server/eslint.config.mjs:9` extend `tseslint.configs.recommended`. The `recommended` preset does **not** enable type-checked rules — `no-floating-promises`, `no-unsafe-assignment`, `no-unsafe-member-access`, `no-misused-promises`, etc. are disabled.

**Concrete impact in this codebase:** `App.tsx` uses `void load()` (line 35), `void (async () => { ... })()` (lines 57, 73, 90, 105) — these are exactly the patterns `no-floating-promises` is designed to flag, and they're invisible to the current config. The body of those IIFEs throws inside a `.catch`-less `try` only because the try is inside the IIFE. Add a missing await somewhere down the line and `no-floating-promises` would catch it; today, nothing would.

The unaccompanying client-level `client/README.md:16-44` is the _Vite default README_ and literally tells the reader how to upgrade — but the upgrade was never done.

**Fix:** swap to `tseslint.configs.recommendedTypeChecked` and wire `parserOptions.project` to the per-runtime tsconfig in both eslint configs. Expect ~5–15 new findings; review each.

### M4. Touch targets violate the 44 px floor stated in the PRD

PRD Web App Reqs → Responsive design → _"Touch targets ≥ 44 px square."_ User-acceptance demo step 7 explicitly tests at 320 px width.

- `client/src/components/TodoItem.tsx:13-19` — checkbox `width: 18px; height: 18px` (`App.css:84-89`). The native checkbox hit-area is exactly the 18×18 box. Mistap risk on phones is real.
- `client/src/components/TodoItem.tsx:25-32` — delete button is 44×44 (`App.css:101-105`) ✓ **but `visibility: hidden`** until `:hover`, `:focus-within`, or `:focus`. **On touch devices, hover does not fire.** The e2e test at `e2e/todo.spec.ts:59` is forced to call `row.hover()` before the click — a tell-tale that the UX requires a mouse to discover.

**Fix (cheapest):** remove the `visibility: hidden` and just dim the delete glyph. Bump the checkbox visible area by wrapping it in a 44×44 label and styling the surrounding `<li>` row to be a single tap-target for the toggle.

### M5. No CI/CD configuration

There is no `.github/workflows/`, no `.gitlab-ci.yml`, no Husky, no pre-commit hooks. Lint, tests, typecheck, prettier, docker integration, e2e — all run only on a developer's local machine. For a portfolio piece written for senior engineers at Nearform, this is the first thing a reviewer will look for.

**Fix:** add a single `.github/workflows/ci.yml` that runs on PR + push to main: `npm install` (root + both prefixes), `npm run lint`, `npm run test:coverage`, `npm run format:check`, `docker build`, `npm run test:docker`, `npm run test:e2e:install` + `npm run test:e2e`. Probably 60 lines of YAML.

### M6. Browser support matrix is asserted but never tested

PRD NFR-8: last two stable Chrome (desktop + mobile/Android), Firefox, Safari (desktop + iOS), Edge. `playwright.config.ts:22-27` configures **only** Chromium. The seven todo + three a11y specs run in one browser. Safari (`webkit`) is the highest-risk omission given React 19 + modern CSS + `AbortSignal.timeout` + native `crypto.randomUUID()` — all OK in current Safari but the matrix hasn't been _verified_ to be true.

**Fix:** add `firefox` and `webkit` projects to playwright.config.ts and run them in CI. ~6 LOC.

---

## Moderate

### Mo1. `architecture.md` is materially out of sync with the code

Three discrepancies a senior reviewer will hit immediately:

- **JSON wire format**: `architecture.md:407-409` says _"JSON over the wire: camelCase. The translation between snake_case SQL and camelCase JSON happens **only** in the server's db-query module."_ Reality: `shared/types.ts:8` and `db.ts:32-37` ship snake_case (`created_at`) on the wire. The README's "AI integration log" acknowledges this drift — the architecture document does not.
- **`server/src/identity.ts` and `server/src/validation.ts`**: prescribed in `architecture.md:578-583` and explicitly listed as "single owners" of two architectural concerns at `architecture.md:600-605`. **Neither file exists.** The X-User-Id regex now lives at `server/src/routes/todos.ts:5`; validation lives inline at lines 19-65 of the same file. Architecture's "single owner per concern" rule is technically still satisfied (one owner, in routes/todos.ts), but the doc lies about _which_ owner.
- **`Decisions provided by this starter approach` → CSS Modules**: architecture doubled down on CSS Modules at `architecture.md:169`. Reality: plain `App.css` global styles, no `.module.css` files. (This is fine; CSS Modules add zero value for ~10 components — but the doc is wrong.)

**Fix options:** either update architecture.md to reflect what shipped (preferred, since the choices were deliberate), or delete the parts that no longer hold and link to the README's "Things that surprised" section.

### Mo2. `_bmad-output/implementation-artifacts/deferred-work.md` is stale

Front-matter at lines 1-7 declares `status: build-incomplete` with the body asserting Stories 1.2–5.4 were deferred. Git log shows all five epics shipped over multiple commits. The file has genuine value (the open-question lists at lines 73-99 still apply), but the meta-status will mislead any future reader.

**Fix:** flip front-matter to `status: build-complete`, replace the "What remains" section with a one-line "Resumed; all stories shipped — see git log starting at commit a9a2fbb", and keep the open-question lists.

### Mo3. `client/README.md` is the stock Vite template

It's the boilerplate that `npm create vite@latest` emits, including phrases like "If you are developing a production application, we recommend updating the configuration..." (lines 14-16). It tells the reader how to upgrade ESLint to `recommended-type-checked` — exactly the upgrade _this_ codebase didn't make (see **M3**). Either replace with a useful client-level README (build, run, test, structure), or delete the file (the root README covers everything).

### Mo4. `USER_ID_REGEX` is laxer than the test fixture and the toy `UUID_REGEX`

`client/src/identity.ts:5` and `server/src/routes/todos.ts:5` both define:

```ts
const USER_ID_REGEX = /^anon-[0-9a-f-]{36}$/;
```

This matches `anon-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa` (36 hex chars, no dashes — not a UUID at all). Meanwhile:

- `server/src/routes/todos.ts:6` validates **todo** ids with the strict canonical UUID regex (8-4-4-4-12).
- `client/src/identity.test.ts:5` asserts the _minted_ value matches the strict canonical regex.

The fact that `crypto.randomUUID()` always emits a canonical UUID hides the bug in practice. But the asymmetry between "server accepts laxer than the client mints" + "test asserts stricter than production validates" is a real foot-gun. The architecture's exact regex (architecture.md:265) was the source of this; since the test already enforces the stricter shape, **tighten production to match the test**:

```ts
const USER_ID_REGEX = /^anon-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
```

Same regex, same place — server and client. No behavior change for legitimate users.

### Mo5. `shared/types.ts` doc-comment is wrong

`shared/types.ts:7` says of `created_at`: _"Client-minted at creation; never mutated."_ Reality: server mints at `db.ts:91` (`const created_at = Date.now();`). The CreateTodoRequest type correctly omits `created_at`, so the wire contract isn't ambiguous — only the comment is. **Fix:** change to _"Server-minted at INSERT; never mutated."_

### Mo6. Pino redact rule targets a path that doesn't exist in Fastify v5's default request log

Already documented as an open question in `deferred-work.md:94-95` but not fixed. The configured redact path is `req.headers["x-user-id"]`; Fastify v5's default `req` serializer emits only `method, url, version, host, remoteAddress, remotePort` — no `headers`. So the redact rule is currently a no-op. NFR-5 is satisfied today _only because_ the X-User-Id never reaches the log at all. Any future story that adds debug logging or enriches the req serializer (e.g., for tracing) would silently leak the header.

**Fix:** add a test that captures Pino output (custom destination stream), invokes a request with a known X-User-Id, and asserts the captured line does not contain it. This is the test that `deferred-work.md:94` already laid out — just needs to be written.

### Mo7. Description is not trimmed before storage

`server/src/routes/todos.ts:34-44` validates `description.trim()` for empty-check but persists `description` (raw) at line 109. A user typing `"  buy bread  "` gets that value — leading and trailing whitespace — written to SQLite and rendered back in the list. Probably not what FR1/FR25 intended.

**Fix:** at `routes/todos.ts:44` return `{ ok: true, value: { id, description: trimmed } }`.

### Mo8. TodoItem delete button has a generic aria-label

`client/src/components/TodoItem.tsx:29` — `aria-label="Delete"`. Compare to the checkbox at line 18 which is correctly contextualized: `Mark "${todo.description}" as complete`. A screen-reader user tabbing through the list hears: "Mark Buy milk as complete… Delete… Mark Pick up dry cleaning as incomplete… Delete…" — losing the connection between action and target.

**Fix:** `aria-label={\`Delete "${todo.description}"\`}`. One line.

### Mo9. Demo step 3 is ambiguous and probably broken as written

PRD Success Criteria → User Success → step 3: _"Click 'Buy milk' to mark it complete — the visual change is instant"_. The natural read is "click the description text." `TodoItem.tsx` only wires the checkbox; clicking the description span is a no-op. Either:

- the demo script means "click the row's checkbox" (then the script is misleading); or
- the description should be a clickable label that toggles completion (then the implementation under-ships).

**Fix:** Wrap description + checkbox in a single `<label>` so clicking either toggles. Bonus: this also expands the touch target (see **M4**).

### Mo10. Healthcheck command in Dockerfile vs. README claim disagree

`README.md` framework-comparison table claims: _"Container runtime: node:20-alpine — curl available for HEALTHCHECK"_. Actual `Dockerfile:58-59` uses `wget` (busybox provides it; alpine has no `curl` by default). The `fix(docker, e2e)` commit explicitly changed to wget. The README didn't get the memo.

**Fix:** in README, change `curl available for HEALTHCHECK` → `busybox wget for HEALTHCHECK`.

### Mo11. `<title>client</title>` in production HTML

`client/index.html:7` is unchanged from the Vite scaffold. Users see "client" in their browser tab. Should be "Todos" (or whatever the product brief settled on as the user-facing name).

### Mo12. e2e tests don't cover FR11/FR12 demo steps

PRD demo steps 4 ("Refresh the browser — the task is still present") and 8 ("Close the browser tab and reopen the URL — todos preserved") have no automated coverage. Today's `tests/docker.test.ts` covers volume persistence (FR12) at the HTTP layer; nothing covers identity persistence across page reloads. A simple Playwright test that creates a row, calls `page.reload()`, and asserts the row is still visible would pin FR11. ~10 LOC.

### Mo13. `@types/node` version drift between client and server

`client/package.json:21` — `^24.12.2`. `server/package.json:28` — `^25.6.2`. Both runtimes use `crypto.randomUUID` and `AbortSignal.timeout`, available since Node 18, so neither is breaking — but a single pinned version reduces "works on my machine" foot-guns.

---

## Minor

### Mi1. `client/src/smoke.test.ts` is dead

Self-described at line 1: _"This proves the test harness works. Remove when the first real test exists."_ 60+ real tests now exist. Same story for `client/src/types.smoke.test.ts:3-4` — "Remove or expand when the first real consumer lands in Epic 3" and Epic 3+ is shipped. Net: +2 tests in coverage that don't earn their keep.

### Mi2. Dev server binds 0.0.0.0 unconditionally

Documented in `deferred-work.md:97`. `server/src/index.ts:29` hardcodes `host: '0.0.0.0'`. Correct for Docker; incorrect for dev — exposes the API on the local LAN. Either gate by `env.NODE_ENV` or introduce a `HOST` env var defaulting to `127.0.0.1` outside production.

### Mi3. UTF-16 length-counting on description

Documented in `deferred-work.md:79`. A 280-emoji description fails at ~140 emoji because each surrogate pair counts as 2. Acceptable for v1; flag for the user when this surface gets v2 treatment.

### Mi4. ROLLBACK_DELETE_ALL doesn't clear `optimisticPending`

`client/src/reducer.ts:127` — restores `todos` but leaves the pending set untouched. If any single-row mutation was in flight when delete-all was dispatched, those entries linger. Visible bug only if an interleaved confirm/rollback arrives after the delete-all rollback; behaviorally inconsistent in any case.

### Mi5. POST 400 / duplicate-id error message is helpful but technically distinguishable from cross-user duplicate

Both surfaces return `{ message: "id already exists" }`. The architecture's AI-3 unification is correctly enforced for PATCH/DELETE (404 envelope identical for "not yours" and "not exists"); for POST, the corresponding "duplicate id, but it's another user's" surfaces the same `id already exists` as "duplicate id, your own retry" — which is correct (both are 400, identical envelope). The rigorous test at `routes/todos.test.ts:230-245` confirms this. ✓ — but worth noting that the test even exists is excellent, since most engineers would miss it.

### Mi6. DeleteAllControl auto-focuses the destructive default

`client/src/components/DeleteAllControl.tsx:37` — when the confirmation row appears, focus jumps to the **Erase** button, not Cancel. Common a11y/UX guidance defaults focus to the safe action so an accidental Enter can't destroy data. Debatable; flagging for consideration.

### Mi7. No automated p95 perf benchmark

NFR-4: server p95 < 100 ms over ≥ 100 requests. There's no `autocannon`/`k6`/Playwright-perf script. For SQLite + `inject()`-based testing this is trivial to add; for a portfolio piece it's the kind of signal a reviewer looks for.

### Mi8. Vite proxy doesn't include `/healthz` in cookie-domain alignment

Not a real issue (no cookies in v1), but `vite.config.ts:11-14` proxies `/todos` and `/healthz` only. Anything else added later (e.g., an admin route) needs to be added here too. Already an architectural seam — keeping a list of one-line entries is fine.

### Mi9. `description.length > MAX` check uses raw length, not trimmed length

`server/src/routes/todos.ts:38` — a 281-char description with one trailing space is rejected on length even though the meaningful content is 280. Combined with **Mo7**, the right fix is: trim, then check `trimmed.length > MAX`, then store `trimmed`. One change handles both.

### Mi10. `better-sqlite3` is platform-specific

Multi-arch Docker builds need `--platform=linux/amd64` (or `arm64`) explicit if you ever build on Mac silicon and ship to a Linux host of a different arch. `npm ci` on the runtime stage will refuse silently otherwise. Nice to mention in the README's "Production deploy" subsection (which doesn't exist yet).

---

## Praise — keep doing this

- **Cross-user isolation testing is rigorous.** `server/src/routes/todos.test.ts:134-148` ("400 response does NOT echo the bad X-User-Id value"), 230-245 (AI-3 unification on POST), and the 404-envelope-identical assertions throughout PATCH/DELETE are not the tests an average implementation would have. They're the tests a _paranoid_ reviewer asks for. Genuinely portfolio-worthy.
- **`env.test.ts` testing pattern is correct.** `vi.resetModules()` + dynamic `await import('./env')` (lines 9-20) is the right way to test side-effectful module load. Most engineers do this wrong.
- **Reducer is exhaustive and pure.** `client/src/reducer.ts:132-137` has the `_exhaustive: never` check; pending-set immutability is preserved across actions; ROLLBACK actions carry inverse data so the reducer doesn't need history. Strong design.
- **413 + 404 + AI-1 + AI-2 + AI-3 are all asserted.** `server/src/server.test.ts:35-63` proves the bodyLimit and SPA-fallback invariants; the cross-user-isolation tests cover AI-3. The architectural invariants list at the bottom of `architecture.md:805-810` translated into tests, not vibes.
- **Production SQLite hygiene done right.** `db.ts:64-67` (`WAL`, `busy_timeout`), the CHECK constraint on `completed`, the `id DESC` tiebreaker, the idempotent `close()`, the `RETURNING` clause for atomic read-after-write, the empty-`dbPath` guard. Each is a small choice; cumulatively they read as "engineer who has been bitten before."
- **`api.ts` error categorization is mature.** Five distinct failure modes: 4xx with JSON message, 4xx with non-JSON, network error, timeout, and 2xx-with-non-JSON (the SPA-fallback guard). All five tested. The 2xx-with-non-JSON guard at `api.ts:71-81` is exactly the kind of defensive trim that catches the bugs nobody plans for.
- **Honest README.** The "Things that surprised the planning ↔ implementation seam" section is rare. Most projects pretend the plan went perfectly. Yours says "the architecture defaulted DB_PATH to /data which broke first dev run on macOS" — that's the kind of artifact that makes a senior reviewer trust the rest of the doc.
- **Multi-stage Dockerfile, runs as `USER node`, `/data` chowned, busybox-wget healthcheck, no curl install bloat.** The image is what a production deploy actually wants.

---

## Suggested fix order (by ROI)

1. ~~**M2** + **Mo7** + **Mo9** + **Mi9**~~ — M2 done; Mo7/Mo9/Mi9 (description trim/length) still open and still coalesce into one ~10-line pass.
2. ~~**M1**~~ — done.
3. ~~**M3**~~ — done.
4. **M4** — single-tap toggle (wrap in `<label>`) + un-hide delete button. ~10 lines + visual polish. Big a11y/mobile win.
5. **M5** — single CI workflow file. ~60 lines. Table-stakes for portfolio. Now even more leverage — `npm run test:e2e:docker` is ready to wire up.
6. **Mo1** + **Mo2** + **Mo3** — doc cleanup. ~1 hour.
7. **M6** — Firefox + WebKit projects in playwright config. ~6 lines.
8. The rest in any order.

---

_End of REVIEW_1. Ask for REVIEW_2 if you want me to focus deeper on a specific area (e.g., security hardening, performance, accessibility audit, or planning-artifact ↔ code traceability)._
