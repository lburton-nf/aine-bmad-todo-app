---
type: product-brief
project: todo-app-3
author: Lisaannburton
date: 2026-05-08
source: user-provided (chat) during bmad-create-prd / step-01-init
---

# Product Brief — todo-app-3

The goal of this project is to design and build a simple full-stack Todo application that allows individual users to manage personal tasks in a clear, reliable, and intuitive way. The application should focus on clarity and ease of use, avoiding unnecessary features or complexity, while providing a solid technical foundation that can be extended in the future if needed.

From a user perspective, the application should allow the creation, visualization, completion, and deletion of todo items. Each todo represents a single task and should include a short textual description, a completion status, and basic metadata such as creation time. Users should be able to immediately see their list of todos upon opening the application and interact with it without any onboarding or explanation.

The frontend experience should be fast and responsive, with updates reflected instantly when the user performs an action such as adding or completing a task. Completed tasks should be visually distinguishable from active ones to clearly communicate status at a glance. The interface should work well across desktop and mobile devices and include sensible empty, loading, and error states to maintain a polished user experience.

The backend will expose a small, well-defined API responsible for persisting and retrieving todo data. This API should support basic CRUD operations and ensure data consistency and durability across user sessions. While authentication and multi-user support are not required for the initial version, the architecture should not prevent these features from being added later if the product evolves.

From a non-functional standpoint, the system should prioritize simplicity, performance, and maintainability. Interactions should feel instantaneous under normal conditions, and the overall solution should be easy to understand, deploy, and extend by future developers. Basic error handling is expected both client-side and server-side to gracefully handle failures without disrupting the user flow.

The first version of the application intentionally excludes advanced features such as user accounts, collaboration, task prioritization, deadlines, or notifications. These capabilities may be considered in future iterations, but the initial delivery should remain focused on delivering a clean and reliable core experience.

Success for this project will be measured by the ability of a user to complete all core task-management actions without guidance, the stability of the application across refreshes and sessions, and the clarity of the overall user experience. The final result should feel like a complete, usable product despite its deliberately minimal scope.

---

## Decisions captured during PRD discovery (2026-05-08)

- **User identity model (v1): per-browser anonymous identity, with `user_id` as a first-class column from day one.** Each browser instance gets its own list, identified via a client-generated ID (e.g. `anon-{uuid}`) stored in cookie or localStorage and sent with every request. The backend persists todos in a table whose primary scoping column is `user_id` — populated with the anonymous ID in v1, ready to hold real account IDs later. No login, no signup, no JWT, no shared list in v1.
- **Why this shape (not full JWT auth in v1):** Keeps v1 build inside the 4-hour budget; explicitly satisfies the brief's "architecture should not prevent later auth/multi-user" requirement; future migration to real auth becomes a *new login flow + one-time reassignment of anonymous rows to real accounts*, not a schema rewrite.
- **Explicit non-goal for v1, reaffirmed:** No user accounts, no JWT, no signup/login UI, no password handling. Cross-device access and storage-clearing resilience are accepted v1 limitations; both unlock when real auth is added later.

### Tech-stack steer (recorded; final choices in architecture step)

- **Runtime:** Node.js
- **Server framework:** Fastify (with TypeScript)
- **Client framework:** React (with TypeScript)
- **Language:** TypeScript on both client and server
- **Database (v1):** SQLite — chosen with the explicit constraint that the schema and queries must remain straightforward to migrate to Postgres later. No SQLite-only features in load-bearing positions.
- **Governing principle:** *boring*. Mainstream, well-trodden choices. Restraint over novelty. The KATA value is in *how* simple choices are composed, not in any individual library.
- **Implicit anti-patterns** (not exhaustive — recorded for clarity): no microservices; no GraphQL (REST is the boring fit); no SSR framework; no Redux / Zustand / Jotai (React's built-in state primitives are sufficient at this scope); no heavyweight ORM with code generation if a thin query layer suffices.

### Architecture-step razor verdicts (recorded; final in architecture step)

These are pre-decided answers to two places where unnecessary complexity is most likely to sneak in despite the "boring" governor. They preserve the architectural-openness NFR and the v1 time budget simultaneously.

- **TypeScript type sharing between client and server.** Razor-recommended option: **duplicate the type definitions** in client and server, OR have a single shared `types.ts` file imported by both — *without* introducing workspaces / monorepo / shared-package tooling. With a ~4-route API surface, the cost of accidental type drift is negligible compared with the build-system complexity that workspace-style sharing introduces. The architecture step may select either of the two boring variants; it should not choose any non-boring variant.
- **SQLite v1 with Postgres-shaped migration path.** Razor-recommended option: **raw SQL** via `better-sqlite3`. Vanilla `CREATE TABLE` / `SELECT` / `INSERT` / `UPDATE` / `DELETE` against a small, named-column schema is *more portable* than any ORM abstraction — ORMs add complexity to defend against a portability problem we do not have today. Do **not** introduce Prisma, Drizzle, or Knex "for portability reasons." A thin hand-written query module is the right shape.
- **`raw SQL` + `TypeScript strict` cast surface — accepted v1 cost.** `better-sqlite3` query results are `unknown`-typed. The v1 query module hand-writes the type assertion (e.g. `row as Todo`) at the query boundary. Runtime validation of every query result with `zod` or similar is over-engineering at this scope and is **not** a v1 requirement. (At the *input* boundary — request bodies — runtime validation is still appropriate.)
- **Frontend styling: Tailwind or CSS Modules — pick one at architecture time.** Both honor the "boring" governor. Tailwind is the time-to-polish winner; CSS Modules is the boring-purist winner. Either is valid; the architecture step must commit before the build starts to avoid mid-build mode-switching cost.

