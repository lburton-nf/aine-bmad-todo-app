# SECURITY_REVIEW — todo-app-3

**Reviewer:** Claude (Opus 4.7), security review + light pen test
**Date:** 2026-05-09
**Target:** the production Docker artifact (`todo-app-3:latest`), built from the current `main`.
**Method:** static review of the auth boundary, persistence layer, validators, headers, and Dockerfile; live pen probes against a containerised instance on `:3097`; `npm audit` across all three workspaces; React-render XSS probe via Playwright.

> **TL;DR.** No exploitable vulnerabilities found. The v1 design's "no auth, anonymous identity, single-user-per-browser" stance is internally consistent and well-defended against the threats it does try to stop: cross-user data leakage, SQL injection, XSS, oversized-payload DoS, container privilege, and supply-chain. The findings list below is **2 Low (both fixed in commit `b243532`) + 4 Informational** — none exploitable today; the Lows have been closed proactively to harden against deploy variations.

## Status (post-review fixes)

- ✅ **L1 fixed** in `b243532` — `@fastify/cors` now configured with an explicit `methods: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS']`. Verified by a new regression test in `server/src/server.test.ts` that issues a preflight and asserts both PATCH and DELETE appear in `Access-Control-Allow-Methods`. Re-run pen probe **P11** confirmed: `access-control-allow-methods: GET, HEAD, POST, PATCH, DELETE, OPTIONS`.
- ✅ **L2 fixed** in `b243532` — `@fastify/helmet` registered with a strict CSP suited to the Vite production bundle (`default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`). Helmet's other defaults (X-Frame-Options, X-Content-Type-Options: nosniff, Referrer-Policy, Strict-Transport-Security, X-Permitted-Cross-Domain-Policies, etc.) ride along. Verified by a new regression test asserting CSP and the load-bearing flags. The full 6-test production smoke suite still passes — CSP doesn't break the bundle.

The four `I*` items remain as documented design statements rather than work to do.

---

## Threat model

What's exposed: a single Fastify HTTP service on one port, serving `/healthz`, four `/todos` REST endpoints, and the production React bundle as static files. One SQLite database. One process. One container, non-root, with one mounted volume.

| Asset                      | Sensitivity                               | Trust boundary                       |
| -------------------------- | ----------------------------------------- | ------------------------------------ |
| Per-user todo descriptions | Low (no PII; user-supplied text)          | crosses HTTP into SQLite             |
| `anon-{uuid}` identity     | Low (no auth; equivalent to a session id) | client-minted, sent as `X-User-Id`   |
| `todos.db` SQLite file     | Low                                       | `/data` volume on host filesystem    |
| `npm_package_version`      | Low (build metadata)                      | exposed via `/healthz`               |
| Container filesystem       | Medium                                    | confined by USER node + volume mount |

**In-scope threats**

1. **Cross-user data access** — A sends a request that reads/mutates B's data.
2. **Injection** — SQL via headers/body/params; XSS via stored description; HTTP smuggling via headers.
3. **Resource exhaustion** — oversized payloads, header-bomb, recursive request floods.
4. **Static-file traversal** — `/etc/passwd`, `/data/todos.db`, server source via the static plugin.
5. **Container compromise paths** — root inside the container, secrets leaking through ENV, supply-chain via `better-sqlite3` native binary, image build layers leaking credentials.
6. **PII exposure in logs** — X-User-Id reaching a log stream.

**Explicitly out of scope** (v1 architectural decisions, documented in the PRD/architecture)

- Real authentication and authorisation. v1 trusts whichever client sends an `X-User-Id` to be that user. Anyone who knows or guesses another user's `anon-{uuid}` _is_ that user. The threat model is "one person on one browser per ID"; cross-device sync, account theft, and credential rotation are Growth-phase.
- Rate limiting / abuse protection. Acknowledged gap (PRD NFR-11). A single anonymous client can spam mutations.
- TLS termination. Production deploy responsibility — the app speaks HTTP and expects an upstream reverse proxy / load balancer to terminate TLS.

---

## Control assessment

### Authentication & authorisation

**Mechanism.** Custom header `X-User-Id`, format `anon-<canonical UUID>` (regex `/^anon-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/`), validated in a plugin-scoped Fastify `preHandler` at `server/src/routes/todos.ts:88-96`. Reject → `400` with the canonical error envelope; never echoes the offending value back to the caller (verified by an explicit test at `server/src/routes/todos.test.ts:139` and pen probe **P12**).

**Scoping.** Every SQL statement that touches the `todos` table is parameterised, prepared once at module load, and includes `WHERE user_id = ?`. The persistence module (`server/src/db.ts`) is the only place SQL appears in the codebase — pinned by an architectural invariant. PATCH and DELETE on a row owned by a different user return `404` with the same envelope as a not-found row, so an attacker cannot enumerate which IDs exist (verified by tests at `routes/todos.test.ts:226-256` and pen probe **P3/P4**).

**Verdict:** ✅ The trust model is "the X-User-Id IS the principal" by design. Everything downstream of that assumption is enforced rigorously.

### Input validation

| Surface                                                                      | Control                                                                                  | Verified by                   |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------- |
| `X-User-Id` header (presence, shape, length, character set, multiple values) | Strict regex on a scoped preHandler                                                      | tests + probes **P1/P12/P13** |
| Request body size (≥ 1 KB rejected)                                          | Fastify `bodyLimit: 1024` (server/src/server.ts:36)                                      | unit test + probe **P5**      |
| Request body shape                                                           | `asJsonObject` helper rejects non-objects/arrays; per-field validators on POST and PATCH | unit tests                    |
| `description` length (≤ 280 graphemes)                                       | `Intl.Segmenter` grapheme count, not UTF-16 code units                                   | unit tests                    |
| `description` whitespace-only / empty                                        | Trim-then-check; trimmed value is what gets stored                                       | unit tests                    |
| Path param `:id` (UUID 8-4-4-4-12 hex)                                       | Regex check before any DB call                                                           | unit tests                    |
| PATCH body extras (typo defence)                                             | Reject any field other than `completed`                                                  | unit tests                    |

**Verdict:** ✅ Defence in depth. The body-limit / regex / length / type checks each fail loudly and cite the canonical envelope.

### SQL injection

**Vector closure:** every SQL statement is `Database.prepare(...)` once at module load, with `?` placeholders, called with a typed argument tuple. There is no string concatenation, no template-literal SQL, no dynamic table or column names. **Probe P2** seeded `'; DROP TABLE todos; --` as both a description and (rejected upstream) as an X-User-Id. Round-trip: stored verbatim, table intact, list reads back the literal characters.

**Verdict:** ✅ No injection surface.

### XSS / output encoding

**Vector closure:** descriptions are user-supplied strings stored verbatim (after trim) and rendered in React via `{todo.description}` and template-literal interpolation into `aria-label` attributes. React's default escaping renders both as text, never as HTML. **Probe P21** seeded `<img src=x onerror=alert(1)>` and verified through Playwright that:

- `innerHTML` of `.todo-item__description` contains `&lt;img` (escaped), NOT `<img`.
- No `dialog` event fires (no `alert(1)` execution).
- The text-search assertion `getByText('<img src=x onerror=alert(1)>')` matches the _literal_ string.

There is no `dangerouslySetInnerHTML` anywhere in the client (`grep -r dangerouslySetInnerHTML client/src` is empty).

**Verdict:** ✅ React's default behaviour stops stored XSS at the boundary.

### Static file serving / path traversal

**Configuration:** `@fastify/static` registered at `server/src/server.ts:67-72` with `root: STATIC_ROOT` (the built client bundle), `prefix: '/'`, `decorateReply: false`. **Probe P6** swept five traversal candidates (`/../../../etc/passwd`, `/etc/passwd`, `/data/todos.db`, `/dist/server/src/index.js`, `/index.html.bak`) and **probe P18** swept dotfiles and source paths (`/.DS_Store`, `/package.json`, `/.git/config`, `/server/src/db.ts`). Every probe → `404`. The static plugin normalises paths and refuses to serve outside its root.

The runtime container's directory layout has the server source compiled to `/app/dist`, **not** under `STATIC_ROOT=/app/client/dist`, so even a hypothetical static-plugin escape couldn't reach server code.

**Verdict:** ✅ No traversal pathway found.

### CORS

**Configuration:** `@fastify/cors` registered at `server/src/server.ts:49-55` with `origin: opts.corsOrigin || false` (empty CORS_ORIGIN coerces to no allow-list — refuses cross-origin browser access entirely) and `allowedHeaders: ['Content-Type', 'X-User-Id']`. In production the env var is required (server refuses to start without it).

Probe **P10** sent `Origin: https://evil.example` against `/healthz`: the server replied with `access-control-allow-origin: http://localhost:3097` (the configured value). Browsers checking SOP would refuse to read the body. Note that for non-browser clients (curl, server-to-server), CORS is not a server-side protection and the body still reaches the wire — this is normal and not a finding.

Probe **P11** issued a CORS preflight from the allowed origin: `204 No Content` ✓. **But:** the response's `access-control-allow-methods` lists only `GET,HEAD,POST` — see Finding **L1** below.

### Headers

What's set by default (probe **P19**): `access-control-allow-origin`, `accept-ranges`, `cache-control: public, max-age=0`, `content-type`, `last-modified`, `etag`. What's NOT set: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Strict-Transport-Security`, `Content-Security-Policy`. See Finding **L2**.

### Logging & PII

`server/src/server.ts:37-40` configures Pino with `redact: ['req.headers["x-user-id"]']`. Fastify v5's default request serializer doesn't include headers in the log line, so the redact rule is **defensive only** — currently a no-op because there's nothing for it to scrub. NFR-5 ("user identifiers omitted from logs or hashed") holds because the header isn't logged in the first place. The redact rule pre-empts a future regression where someone enriches the request log with headers and forgets that this one is sensitive. See Finding **I3**.

### Container

| Control                                         | Status | Evidence                                                                                                           |
| ----------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------ |
| Runs as non-root                                | ✅     | probe **P15** → `uid=1000(node) gid=1000(node)`                                                                    |
| `/data` owned by `node`                         | ✅     | Dockerfile:45 + writeable inside container                                                                         |
| No secrets in ENV                               | ✅     | probe **P16** → only NODE_ENV, PORT, DB_PATH, STATIC_ROOT, CORS_ORIGIN                                             |
| No secrets in build layers                      | ✅     | probe **P17** → `docker history --no-trunc` grep for `secret\|password\|token\|api_?key\|aws\|gcp` matches nothing |
| Multi-stage build                               | ✅     | Stage 3 has only the runtime npm-ci-omit-dev set + compiled artefacts; tsc / vitest never reach the runtime image  |
| `npm_package_version` injection via `npm start` | ✅     | `/healthz` returns the actual server version, not `'0.0.0'`                                                        |
| Healthcheck via busybox `wget`                  | ✅     | no extra package install needed                                                                                    |

### Supply chain

`npm audit` across all three workspaces — root, `client/`, `server/` — both with and without devDependencies. **All six runs report 0 vulnerabilities.** `better-sqlite3` is the only native dep; ships prebuilt binaries via npm and is built by a single maintained organisation (WiseLibs).

### HTTP method surface

Probe **P9**: `HEAD /todos` → 200 (Fastify auto-routes HEAD on registered GETs; benign), `OPTIONS /todos` → 400 (intercepted by the X-User-Id preHandler; mildly surprising but not a security issue), `PUT /todos` → 404 (only declared verbs are routable).

---

## Pen test summary

| #     | Probe                                                  | Expected                                    | Actual                                          | Verdict   |
| ----- | ------------------------------------------------------ | ------------------------------------------- | ----------------------------------------------- | --------- |
| P1    | SQL injection via `X-User-Id`                          | 400 (regex reject)                          | 400                                             | ✅        |
| P2    | SQL injection via `description`                        | 201, value stored verbatim, table intact    | 201 + intact                                    | ✅        |
| P3    | Cross-user PATCH                                       | 404, no leak                                | 404                                             | ✅        |
| P4    | Cross-user DELETE                                      | 404, no leak                                | 404                                             | ✅        |
| P5    | 1.5 KB JSON body                                       | 413                                         | 413                                             | ✅        |
| P6    | Path traversal `/../../../etc/passwd` and friends (×5) | 404                                         | 404 (all)                                       | ✅        |
| P7    | Stored XSS payload accepted by API                     | 201                                         | 201                                             | ✅        |
| P8    | Stored XSS reflected in served `index.html`            | 0 occurrences                               | 0 occurrences                                   | ✅        |
| P9    | HEAD/OPTIONS/PUT verb surface                          | only declared verbs route                   | only declared verbs route                       | ✅        |
| P10   | Cross-origin Origin → ACAO header                      | configured value, not requesting origin     | configured value                                | ✅        |
| P11   | CORS preflight from allowed origin                     | 204 + correct methods/headers               | 204 ✓; allow-methods lists `GET,HEAD,POST` only | ⚠️ **L1** |
| P12   | 10 KB X-User-Id                                        | 400                                         | 400                                             | ✅        |
| P13   | `X-User-Id: admin` / empty                             | 400                                         | 400                                             | ✅        |
| P14   | CRLF injection in X-User-Id                            | curl-rejected at client; server unreachable | curl-rejected                                   | ✅        |
| P15   | Container `id`                                         | non-root                                    | uid=1000(node)                                  | ✅        |
| P16   | Container ENV — no secrets                             | only documented config                      | only documented config                          | ✅        |
| P17   | `docker history` for secret-shaped strings             | none                                        | none                                            | ✅        |
| P18   | Dotfile / source visibility (×5)                       | 404                                         | 404                                             | ✅        |
| P19   | Browser-defence response headers                       | (informational)                             | none of CSP/XFO/XCTO/RP/HSTS set                | ⚠️ **L2** |
| P20   | `/healthz` headers                                     | 200, version string                         | 200, `1.0.0`                                    | ✅        |
| P21   | Stored XSS executes via React render                   | escaped, no alert                           | escaped, no alert                               | ✅        |
| audit | `npm audit` × 6 (root/client/server × prod/all)        | 0 vulnerabilities each                      | 0 vulnerabilities each                          | ✅        |

---

## Findings

### Severity legend

- **High** — exploitable today against the current production deploy.
- **Medium** — exploitable under a plausible deploy variation.
- **Low** — latent, would be exploitable only if the deploy shape changes (split-origin, embedded-iframe, behind-TLS) or a future code change adds the feature that the missing control would defend.
- **Informational** — design decisions worth flagging for completeness but not vulnerabilities under v1's stated scope.

### L1. ✅ FIXED — CORS preflight does not advertise PATCH or DELETE — latent split-origin breakage

**Where:** `server/src/server.ts:49-55` (`@fastify/cors` registration).

**What:** Probe **P11** issued a preflight `OPTIONS /todos` from the allowed origin with `Access-Control-Request-Method: PATCH` (and again with `DELETE`). Both responses returned `204 No Content` with `Access-Control-Allow-Methods: GET,HEAD,POST` — neither PATCH nor DELETE was included. A browser doing a cross-origin PATCH or DELETE would fail the preflight check and the actual request would never fire.

**Why this isn't biting today:** v1 ships as a single-image deploy where the client and API share the same origin. Browsers don't send preflight for same-origin requests, so the missing methods in the response are never consulted. The PATCH and DELETE handlers are themselves correctly defined on the server (the routes exist, requests against them succeed when origin doesn't apply — verified by every existing test).

**When this would bite:** Growth-phase split-origin deploys (e.g., client on `app.example.com`, API on `api.example.com`). Toggle and delete operations would silently stop working in browsers; reading and creating todos would still work. Confusing to debug because GET/POST work fine.

**Fix:** add `methods: ['GET', 'POST', 'PATCH', 'DELETE']` (or include 'OPTIONS' / 'HEAD') to the `@fastify/cors` config. One line.

**Severity:** Low (no exploit; latent functional bug under deploy variation).

### L2. ✅ FIXED — No browser-defence response headers

**Where:** every response from the server (`server/src/server.ts`).

**What:** Probe **P19** captured the response headers on `GET /` and `GET /healthz`. Missing:

- `X-Content-Type-Options: nosniff` — would prevent a browser sniffing the response body and treating a JSON 200 as something else.
- `X-Frame-Options: DENY` (or `Content-Security-Policy: frame-ancestors 'none'`) — would prevent the page being embedded in a third-party iframe (clickjacking).
- `Referrer-Policy: no-referrer` (or `strict-origin-when-cross-origin`) — would limit referer leakage if the page links externally.
- `Strict-Transport-Security` — only meaningful behind TLS; should be set when the deploy adds an upstream proxy that terminates TLS.
- `Content-Security-Policy` — XSS defence in depth. The architecture document explicitly defers CSP to Growth-phase, so this isn't a surprise.

**Why this isn't biting today:** v1 has no auth, no PII, no real cross-domain attackers, and no inline scripts (Vite's bundle uses module scripts, not `script` tags with inline content). The clickjacking surface is a checkbox toggle on rows the framing site can't see; the worst-case impact is a confused user, not data loss or impersonation.

**Fix:** register `@fastify/helmet` (or set headers manually via an `onSend` hook). One block of config:

```ts
await app.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // Vite emits inline style for CSS
      imgSrc: ["'self'", 'data:'],
      frameAncestors: ["'none'"],
    },
  },
});
```

**Severity:** Low (defence in depth; no exploit demonstrated).

### I1. No rate limiting

**Where:** server-wide.

**What:** Acknowledged in PRD NFR-11 ("acknowledged v1 gap, not a v1 requirement"). A single anonymous client can issue unbounded create/toggle/delete cycles. The 1 KB body limit caps individual request size but not request frequency.

**Why this isn't biting today:** v1's target population is "one person, one browser, one list." There's no monetisation, no hot data path, no upstream system being protected.

**Fix:** add `@fastify/rate-limit` when the threat model changes (multi-user, post-auth). Out of scope for v1.

**Severity:** Informational.

### I2. `X-User-Id` is essentially a session identifier with no entropy guarantee

**Where:** `server/src/routes/todos.ts:8` (regex).

**What:** The server validates that the `X-User-Id` header is `anon-<canonical UUID>`. Anyone who knows another user's UUID _is_ that user. The regex enforces 122 bits of UUID v4 entropy (effectively unguessable when `crypto.randomUUID()` is the source), but the server has no way to verify the value was minted by the legitimate client — it could just as well be copied from another browser, a leaked log, or an XSS payload in some other application that has read access to the user's localStorage.

**Why this isn't biting today:** v1 is single-user-per-browser by design. The PRD calls this out explicitly. There is no PII to steal and no cross-account state that an attacker would gain by impersonation.

**Fix:** Real authentication. Out of scope for v1; documented as Growth-phase.

**Severity:** Informational (by-design).

### I3. Pino redact rule is defensive against a future regression

**Where:** `server/src/server.ts:37-40`.

**What:** `redact: ['req.headers["x-user-id"]']` is configured, but Fastify v5's default request log serializer emits only `method, url, version, host, remoteAddress, remotePort` — no `headers`. The redact path matches nothing today; NFR-5 ("user identifiers omitted from logs") holds because the header is never logged in the first place.

**Why this isn't biting today:** the X-User-Id never reaches a log line. Verified by inspecting the live container's stdout during the pen test (only `req.method`, `req.url`, `req.host`, `req.remoteAddress`, `req.remotePort` appeared per request).

**When this would bite:** any future change to enrich the request logger with headers (e.g., for tracing or debugging) would leak the X-User-Id into logs unless the redact path is re-validated. The current rule pre-empts this regression but a developer adding a debug logger needs to know it's there.

**Fix:** add a regression test that captures Pino output, sends a request with a known X-User-Id, and asserts the captured log line does not contain that string. Test plan was sketched in `_bmad-output/implementation-artifacts/deferred-work.md`. Worth doing in a hardening pass.

**Severity:** Informational.

### I4. `/healthz` discloses package version

**Where:** `server/src/server.ts:57-59`.

**What:** `GET /healthz` returns `{ ok: true, version: '<package.json version>' }`. The version is a build-time identifier injected via `npm_package_version`. Standard fingerprinting surface — an attacker could correlate the version against published CVEs (currently zero, per `npm audit`).

**Why this isn't biting today:** the application's own version is public-by-design (it's just the manifest version of an open-source-shaped project). The transitive dependency versions are not exposed.

**Fix:** if you ever ship this for an organisation that classifies its own version numbers as confidential, switch to a constant string or a hashed build ID. Not relevant for v1.

**Severity:** Informational.

### I5. Request payload accepted with no `Content-Type` validation beyond Fastify's defaults

**Where:** `server/src/routes/todos.ts` POST/PATCH handlers.

**What:** Fastify parses JSON when `Content-Type: application/json` is sent, and rejects others. Probe **P9**'s `PUT /todos` returned `404` (verb not registered) rather than reaching content-type handling, so this surface wasn't fully exercised. There's no explicit content-type allow-list — the server relies on Fastify's default content-type parser. Standard practice; not a finding.

**Severity:** Informational (working as designed).

---

## Suggested fix order (by ROI)

1. ~~**L1 + L2**~~ — done in `b243532`.
2. **I3** — add the captured-Pino-output regression test. ~30 lines, no production change. Highest cost-effective remaining hardening because it makes the redact rule self-checking.
3. The remaining `I*` items are by-design statements rather than work to do — they're recorded here so a future security review can verify the model hasn't drifted.

Nothing in this review blocks the v1 portfolio piece from shipping. The application is well-defended against the threats it targets, and the remaining gaps are either acknowledged-by-design or — for L1 / L2 — already closed.
