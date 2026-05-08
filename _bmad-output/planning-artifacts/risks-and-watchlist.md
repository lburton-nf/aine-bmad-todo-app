---
type: risks-and-watchlist
project: todo-app-3
author: Lisaannburton
date: 2026-05-08
source: produced during bmad-create-prd / step-02-discovery via Identify Potential Risks elicitation
status: living document — update as risks resolve or new ones surface
---

# Risks & Watchlist — todo-app-3

Project-level risks identified during PRD discovery that do **not** belong in the classification annotations but are real and worth tracking. Most will be resolved by later workflow steps (architecture, epics, dev); writing them down here prevents rediscovery as surprises.

## Schedule risks

| ID | Risk | Mitigation | Resolves at step |
|---|---|---|---|
| R1 | Stack-choice paralysis at hour 1 | Decide stack in the architecture step; favor mainstream + boring (e.g., React + Express/Fastify + SQLite) | Architecture |
| R2 | Debugging in container is slower than in dev | Get FE↔BE talking in dev mode first, containerize last | Architecture / Dev |
| R12 | Solo + fatigue over 4h focused window | Build in checkpoints; take short breaks | Throughout |

## Operational / deployment risks

| ID | Risk | Mitigation | Resolves at step |
|---|---|---|---|
| R3 | Container size — `node:latest` produces ~1GB+ images | Target ≤ 200MB image via multi-stage build; alpine or distroless base | Architecture / Dev |
| R4 | No healthcheck in Dockerfile → broken containers appear healthy | Add `HEALTHCHECK` instruction targeting a `/healthz` endpoint | Architecture / Dev |

## Quality / testing risks

| ID | Risk | Mitigation | Resolves at step |
|---|---|---|---|
| R5 | Test-budget waste — testing the framework instead of contracts | Tests target: API contracts, cross-user isolation, persistence durability, optimistic-UI rollback. Not "does React render text" | Epics / Dev |
| R6 | Flaky tests in containers — port collisions, timing | Keep test env minimal; random ports for parallel runs; deterministic clock where needed | Dev |
| R7 | Subjective success criteria — brief's "user can complete actions without guidance" has no clean automated test | Define a concrete **demo checklist** (e.g., 8-step "pretend-user" run) as the v1 acceptance gate. Run it before declaring done. | PRD success-criteria step / Dev |

## Maintainability risks

| ID | Risk | Mitigation | Resolves at step |
|---|---|---|---|
| R8 | No README / dev setup — "deployable" without a single-command run is half-deployed | README must include `docker build` + `docker run` quickstart; verified by following it from scratch before declaring done | Dev |

## UX / accessibility risks (known v1 gaps)

| ID | Risk | Mitigation | Resolves at step |
|---|---|---|---|
| R9 | Mobile only tested in dev tools, not on a real device | Document as known v1 gap | Acknowledged |
| R10 | Accessibility (keyboard nav, contrast, semantic HTML) not in brief | Semantic HTML is cheap — do it. Full WCAG audit out of scope; document as known v1 gap | UX / Dev |

## Dependency risks

| ID | Risk | Mitigation | Resolves at step |
|---|---|---|---|
| R11 | Pulling abandoned or heavyweight libraries | Stick to mainstream, well-maintained: Express / Fastify / Hono on the server; better-sqlite3 for persistence; native Intl or date-fns for date logic; React / Vue / Svelte on the client | Architecture |

## Watchlist closeouts (already captured elsewhere — listed here for traceability only)

These were surfaced during elicitation but are owned by other artifacts:

- FE↔BE integration seam (CORS, base URL, container networking) → **classification annotation** on `web_app`
- Cross-user isolation tests + Docker integration test → **classification annotation** on `medium` complexity
- Optimistic UI rollback contract → **NFR annotation**
- Server-side opaque-ID validation → **classification annotation** on `general` domain hygiene
- Schema typing discipline (`user_id TEXT/VARCHAR`) → **classification annotation** under transitional identity
- Secrets in Docker image / token logging → **classification annotation** on `general` domain hygiene
- Self-serve `DELETE my data` path → **classification annotation** on `general` domain hygiene
- Scope creep mid-build → **constrained-greenfield annotation**
- PRD eats build budget → **project memory** (`memory/project_deadline.md`)
