---
stepsCompleted:
  - step-01-init
  - step-02-discovery
  - step-03-core-experience
  - step-04-emotional-response
  - step-05-inspiration
  - step-06-design-system
  - step-07-defining-experience
  - step-08-visual-foundation
  - step-09-design-directions
  - step-10-user-journeys
  - step-11-component-strategy
  - step-12-ux-patterns
  - step-13-responsive-accessibility
  - step-14-complete
status: complete
completedAt: '2026-05-08'
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/product-brief.md
  - _bmad-output/planning-artifacts/architecture.md
workflowType: 'ux-design'
project_name: 'todo-app-3'
user_name: 'Lisaannburton'
date: '2026-05-08'
---

# UX Design Specification — todo-app-3

**Author:** Lisaannburton
**Date:** 2026-05-08

This specification turns the PRD's polish ceiling and the architecture's component plan into concrete visual and interaction design decisions. It is the *single source of truth* for the look-and-feel of v1, in the same way the architecture document is the source of truth for code structure. Most decisions here are direct expressions of constraints already locked upstream; this document makes them concrete enough to build against.

---

## Discovery

### Audience and intent

One person, single device, no signup or login. The audience description from the PRD's persona section (Maya — mid-thirties, remote worker, has tried four todo apps and abandoned each because they demanded too much before letting her type her first task) is the design north star. Every interaction decision below either *removes a step* between intent and action, or *fails the brief*.

### Design philosophy in one sentence

**The interface should feel like a clean sheet of paper that remembers what you wrote.** No setup. No options. No prompts. Just the list, the input, and the actions a user might want.

### What the design must deliver

Three v1 outcomes, ranked by priority:

1. **Instant comprehension.** A user opens the app and knows what to do in under one second, without reading anything.
2. **Trust in persistence.** Every action gives unambiguous feedback that it worked (or didn't). The user never wonders whether their task was saved.
3. **Polish without ornament.** The aesthetic reads "considered" but not "designed-for-its-own-sake." A senior reviewer should respect the typography, spacing, and restraint without noting any single visual flourish.

### What the design must not deliver

Per the PRD's *Honest Limit* and *Polish ceiling — Explicitly deferred* lists, v1 explicitly does not include:

- Onboarding, tutorials, or empty-state hand-holding beyond a single line of text.
- Branding, logo, or app-name display larger than the document title.
- Decorative imagery, illustrations, or icons beyond the strictly functional ones (delete, complete).
- Settings, preferences, or theming controls (no dark-mode toggle in v1).
- Drag-and-drop reordering, keyboard shortcuts beyond Tab/Enter/Space, or animations beyond instant state changes.

---

## Core experience

The entire v1 experience is **one screen, one viewport-height, one purpose:**

```
┌────────────────────────────────────────────────────────┐
│                                                        │
│   Todos                                                │
│                                                        │
│   ┌──────────────────────────────────────────────┐     │
│   │ Add a todo…                                  │     │
│   └──────────────────────────────────────────────┘     │
│                                                        │
│   ┌──────────────────────────────────────────────┐     │
│   │ ☐  Reply to Henrik about the Q2 budget      ⟳│     │
│   ├──────────────────────────────────────────────┤     │
│   │ ☐  Pick up the dry cleaning                 ⟳│     │
│   ├──────────────────────────────────────────────┤     │
│   │ ☑  Buy milk                                 ⟳│     │
│   └──────────────────────────────────────────────┘     │
│                                                        │
│                                          Erase my data │
│                                                        │
└────────────────────────────────────────────────────────┘
```

(`☐` = incomplete checkbox · `☑` = completed checkbox · `⟳` = delete glyph appearing on hover/focus)

### Reading order (top to bottom)

1. **Page title** — "Todos." Reads as a label, not a brand.
2. **Input** — single text field, placeholder "Add a todo…", focused on page load. Submit on Enter.
3. **List** — todos in reverse-chronological order (newest first, FR2). Each row contains a completion checkbox, the description text, and a delete control.
4. **Erase-my-data link** — small, subdued, anchored bottom-right. Discoverable but not intrusive (FR21).

### Focus on first paint

The text input is auto-focused. The user can begin typing immediately without clicking anything. This is the "no friction" promise made literal.

---

## Emotional response

**What we want users to feel:**

| Moment | Feeling |
|---|---|
| First paint | "Oh — this is just a list." (relief) |
| Typing the first task | "It works the way I expected." (confidence) |
| Marking complete | "It's done." (completion satisfaction) |
| Refresh / return | "It's still here." (trust) |
| Network error | "It tried, it told me, I can retry." (no panic) |
| Deletion | "Gone, no fuss." (control) |

**What we want users to *not* feel:**

| Moment | Feeling avoided |
|---|---|
| First paint | "How do I…?" (confusion) — solved by auto-focus and zero-chrome layout |
| Typing | "Is this saving?" (anxiety) — solved by instant optimistic appearance |
| Mid-action | "Did that work?" (uncertainty) — solved by visible state changes |
| Network blip | "I lost my task." (panic) — solved by optimistic-rollback + clear error |
| Idle return | "Where's my list?" (dread) — solved by per-browser persistence |

**Emotional design principles:**

- **Calm over excited.** No celebratory animations on completion. The strikethrough is reward enough.
- **Honest over reassuring.** When something fails, the UI says so plainly. We do not hide errors behind pleasant-but-vague messaging.
- **Quiet confidence.** Visual hierarchy uses weight and spacing rather than colour or boxes-within-boxes.

---

## Inspiration

**Design references (not for direct copy, but for *attitude*):**

- **TodoMVC** (the reference implementation): for the discipline of "todo as essence" — what a todo app contains when you remove everything that doesn't earn its keep.
- **Things 3** (Cultured Code): for typography-led layout and unobtrusive controls.
- **iA Writer**: for the calm of a single text field on a near-blank canvas.
- **The default macOS / iOS check-list style**: for the visual grammar of a checkbox + text + completion strikethrough.

**What we are explicitly *not* taking inspiration from:**

- Asana / Jira / Notion: feature-rich productivity tools whose surfaces would betray the brief's "deliberately minimal scope" stance.
- Apps with onboarding flows, account walls, or in-app marketing.
- Apps with custom illustration systems or branded empty states.

---

## Design system

### Typography

**One typeface, three sizes.**

- **Family:** the platform's system UI font stack. No web font. The system-ui stack is the most boring possible choice and renders instantly without FOUT/FOIT:

  ```css
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
    'Helvetica Neue', Arial, sans-serif;
  ```

- **Sizes (with line-height):**

  | Token | Size | Line-height | Used for |
  |---|---|---|---|
  | `--font-title` | 24 px / 1.5rem | 1.25 | Page title ("Todos") |
  | `--font-body` | 16 px / 1rem | 1.5 | Todo descriptions, input text, error messages |
  | `--font-meta` | 13 px / 0.8125rem | 1.4 | "Erase my data" link |

- **Weight:** 400 (regular) for body, 600 (semibold) for the title. No italic in v1.

### Colour

**Three semantic tokens, used with restraint.**

| Token | Light | Dark (deferred to Growth) | Used for |
|---|---|---|---|
| `--color-surface` | `#ffffff` | — | Page background |
| `--color-text` | `#111827` | — | Primary text |
| `--color-text-muted` | `#6b7280` | — | Placeholder, completed-strikethrough, muted controls, "Erase my data" |
| `--color-accent` | `#2563eb` | — | Focus ring; checkbox checked-state fill |
| `--color-error-bg` | `#fef2f2` | — | Error-state row background |
| `--color-error-text` | `#991b1b` | — | Error-state body |
| `--color-border` | `#e5e7eb` | — | Row dividers, input border |

No gradients. No shadows beyond one subtle row-divider. **No dark mode in v1** (per Polish ceiling — Explicitly deferred); the tokens are named so dark-mode addition is mechanical.

### Spacing

**One spacing scale, multiples of 8 px.** Tokens: `--space-1` = 4 px (interior padding only), `--space-2` = 8 px, `--space-3` = 16 px, `--space-4` = 24 px, `--space-5` = 32 px, `--space-6` = 48 px, `--space-8` = 64 px (page max-width side gutters at desktop).

### Page layout

- Centred column, **max-width 480 px** at desktop.
- Page padding: `--space-6` top/bottom, `--space-3` left/right (collapses to `--space-2` left/right at < 480 px viewport).
- Vertical rhythm: `--space-4` between major regions (title → input → list → erase-link).

### Iconography

**Two functional icons only.** Both rendered as inline SVG (no icon font, no external library):

- A 16-px **delete glyph** (×, with 2-px stroke) next to each row, visible on row hover or row focus.
- A 16-px **error glyph** (⚠) inside the ErrorState component.

The completion checkbox is a native HTML `<input type="checkbox">` styled via CSS — no custom-painted glyph.

### No imagery

No photographs, no illustrations, no logo, no avatar. v1 carries zero raster imagery; no image-loading states need to be designed.

---

## Defining experience

The defining moment of the v1 experience is **the first task entry**. Every other decision serves to make this moment friction-free:

1. The user lands on the URL.
2. The page paints in under 300 ms (server p95 + Vite-bundled SPA = comfortably within budget).
3. The text input is already focused. The cursor blinks.
4. The user types. The placeholder ("Add a todo…") clears as they type.
5. They press Enter. The task appears at the top of the list. Instantly. No delay, no spinner.
6. The input clears, ready for the next task. Cursor still focused.

This sequence — **paint → focus → type → enter → appear → clear** — is the v1 acceptance demo step 2 made literal. Everything else in this spec exists to keep this sequence sacred.

---

## Visual foundation

**Light mode only, system font, generous spacing, low chrome.** The visual identity is "well-set type on a clean page." A user opening the app should feel that they are looking at a *document*, not a *product* — a document that happens to know how to receive new lines of text and remember them.

### Specific visual decisions

- **Border radius: 6 px** on the input and on each row. Soft, not pillow-soft.
- **Row divider: 1 px** `--color-border`. Below each row except the last. (No box-around-the-list — the dividers carry the structure.)
- **Hover affordance:** rows show a subtle background tint (`--color-border` at 50% opacity) on `:hover` (desktop) or stay flat (touch).
- **Focus ring:** 2-px `--color-accent` outline with 2-px offset on every focusable element. Always visible (not browser-default-only).
- **Completed-task styling:** description text receives `text-decoration: line-through` and `color: var(--color-text-muted)`. The checkbox shows the native checked state in `--color-accent`.
- **Optimistic-pending styling:** rows currently mid-mutation render at `opacity: 0.6`. Subtle enough to not spook the user; clear enough that an attentive eye sees it.
- **Error-state row:** rendered above the list, full-width, with `--color-error-bg` background and `--color-error-text` text. Includes a Retry button and a Dismiss (×) button.

### What the page looks like at scale 100% on desktop

- White background fills the viewport.
- Centred column 480 px wide.
- Page title sits at top, "Todos" in 24 px semibold.
- 24-px gap.
- Single text input, full column width, 48 px tall, 6-px border radius, 1-px border.
- 24-px gap.
- List of rows, each 48 px tall, divided by 1-px lines.
- 32-px gap.
- "Erase my data" link in 13 px muted text, right-aligned.
- Significant whitespace below the last element to avoid visual cramping.

---

## Design directions

The spec adopts **a single design direction**, not three to choose from. The PRD's *Honest Limit* explicitly walks away from staking a competitive aesthetic position; offering the user three visual directions to choose from would manufacture a decision the brief deliberately avoids.

The single direction: **"document, not product."** Justification: maps directly to the persona's stated frustration with feature-laden todo apps; aligns with the engineering-restraint guiding principle; and is the cheapest direction to implement at the polish ceiling (no custom typography, no illustration system, no theming).

If the architectural-openness NFR ever surfaces a need for theming (Growth phase), the colour-and-spacing token system above is the seam where theming gets added.

---

## User journeys (UI-grounded)

The PRD's three Maya journeys are reproduced here with the **specific UI elements** each one exercises.

### Journey 1 — first morning

- **Open URL.** Page paints; title "Todos" visible top-left of the centred column.
- **Empty state.** `EmptyState` component shown beneath the input: a single muted line of text reading *"No todos yet."* No illustration, no icon, no "Get started" button.
- **First task entry.** Input is focused; user types "Reply to Henrik…" and presses Enter.
- **Optimistic appearance.** Row appears at the top of the list — same row component used for confirmed todos, briefly at 60% opacity until the server confirms (typically < 100 ms; on dev / local Docker the optimistic-pending state is barely visible).
- **Completion.** User clicks the checkbox; row updates instantly: checkbox fills, description gets strikethrough, text colour shifts to muted.
- **Refresh.** Page reloads; `LoadingState` shows for the duration of the initial fetch (visible if > 200 ms); list reappears unchanged.

### Journey 2 — the blip

- **Optimistic appearance** (as above).
- **Server timeout.** After ~5 s, the API call rejects.
- **Rollback.** The row fades from the list (200-ms transition).
- **`ErrorState` appears** above the list: red-tinted row, message *"Couldn't save that task — try again?"*, Retry button (primary), Dismiss × (secondary, top-right of error row).
- **Retry success.** User clicks Retry. The original mutation re-runs; on success, the row reappears in the list, error row dismisses itself.

### Journey 3 — the narrow window

- **Browser at 380 px wide.** Centred column adapts; page padding collapses from `--space-3` to `--space-2`.
- **Touch targets.** Checkbox tap target is 44 × 44 px (visible glyph 16 px, surrounding hit area sized up). Delete glyph also 44 × 44 px.
- **Text wrapping.** Long todo descriptions wrap within the row; row height grows as needed (no truncation).
- **No horizontal scroll.** At any tested width down to 320 px, the page fits without overflow.

---

## Component strategy

### Component inventory

Eight v1 components, all functional, no decorative components:

| Component | Renders | Listens to | Dispatches | FR refs |
|---|---|---|---|---|
| `App` | Top-level layout, all child components | reducer state | initial fetch | structural |
| `TodoInput` | Single text input + invisible submit button | local input state | `OPTIMISTIC_CREATE` on Enter | FR1, FR23 |
| `TodoList` | Ordered list of `TodoItem` | reducer's `todos` array | — | FR2, FR3 |
| `TodoItem` | One row: checkbox + text + delete | reducer's `optimisticPending` Set | `OPTIMISTIC_TOGGLE`, `OPTIMISTIC_DELETE` | FR4–FR6, FR17, FR19 |
| `EmptyState` | "No todos yet." line | `todos.length === 0` | — | FR14 |
| `LoadingState` | Loading spinner + "Loading…" text | `loading === true` | — | FR15 |
| `ErrorState` | Error message + Retry + Dismiss | `error !== null` | `RETRY_LAST`, `ERROR_DISMISS` | FR16, FR18 |
| `DeleteAllControl` | "Erase my data" link + confirmation flow | local visibility state | `OPTIMISTIC_DELETE_ALL` | FR20, FR21 |

### `DeleteAllControl` interaction

This is the only v1 control with a confirmation step (FR6 says individual delete is single-tap-no-confirm; bulk delete is the exception because the consequences are permanent and total).

- Initial state: small muted link, "Erase my data".
- On click: link is replaced by a small inline confirmation row: *"Erase all your todos? This cannot be undone."* with two buttons: "Erase" (destructive, red text) and "Cancel" (muted text).
- On Erase: `OPTIMISTIC_DELETE_ALL` fires; list clears; on server confirm, complete. On server reject, restored + error state shown.
- On Cancel: confirmation row collapses back to the link.

### Component file → CSS module pairing

Every component has a same-name `.module.css` adjacent (per architecture step 6). No global stylesheet beyond a minimal `App.module.css` that defines the design tokens and resets.

### Design tokens file

Tokens defined in a single `client/src/tokens.css` file imported by `App.tsx`. CSS custom properties on `:root`. Components consume them via `var(--color-text)` etc., never raw values.

---

## UX patterns

### Input pattern

- Native `<input type="text">` with placeholder.
- `onChange` keeps local state.
- `onKeyDown` handles Enter (submit), Shift+Enter (no-op — single-line), Escape (clears local input).
- After successful submit (optimistic dispatch), input clears and re-focuses.
- Maximum input length: 280 (HTML `maxLength` attribute prevents over-typing entirely; server-side validation in FR25 is the second-line defense).

### Mutation pattern (every interaction)

1. User performs action.
2. Component dispatches `OPTIMISTIC_*` action; reducer updates state.
3. Component awaits API call.
4. On resolve: dispatches `MUTATION_CONFIRM`. Done.
5. On reject: dispatches `MUTATION_ROLLBACK`. Reducer reverts the optimistic change and sets `error`. `ErrorState` becomes visible.

### Error pattern

- Single `ErrorState` instance at a time. New errors replace old ones (no error stacking).
- Error message phrased as a plain sentence. No technical detail surfaced ("Internal server error") — only what the user can act on ("Couldn't save that task — try again?").
- Retry button calls the *exact same* mutation that failed, by the same `id`. The reducer holds the failed mutation as a pending retry.
- Dismiss clears the error state without retrying.

### Loading pattern

- `LoadingState` only on initial fetch. Subsequent operations use the optimistic pattern.
- If the initial fetch resolves in < 200 ms, the loading state is technically rendered but never visible; this is acceptable.
- A simulated-delay query parameter or environment variable allows the loading state to be demonstrated; details deferred to dev step.

### Empty pattern

- `EmptyState` is the *default* when no todos exist. It is a single line of muted text — *no* call-to-action button, no illustration, no "Add your first todo" prompt. The input above it IS the call to action.

### Confirmation pattern

- v1 confirms only the bulk-delete action (`DeleteAllControl`). No per-item confirmation.
- Confirmation is *inline*, not a modal. Modals are deferred (Polish ceiling — Explicitly deferred does not list modals, but the polish ceiling implicitly values "no extra surface").

---

## Responsive & accessibility

### Breakpoints

**Mobile-first single breakpoint:** `min-width: 480px`.

- Below 480 px: page padding `--space-2` left/right; input full-bleed within the column.
- 480 px and above: centred 480-px column; page padding `--space-3` left/right; consistent layout up to and beyond 1920 px.

This is the *whole* responsive system. There is no large/desktop breakpoint because the layout doesn't benefit from extra width — content stays at 480 px column even on a 4K display.

### Touch targets

- All interactive elements: minimum 44 × 44 px hit area (WCAG 2.1 / 2.2 target). Visible visual size may be smaller (16-px checkbox glyph, 16-px delete glyph) — the *hit area* is what matters.
- Row hit area for opening details: not applicable (no detail view in v1).

### Keyboard

- **Tab order:** input → checkbox of row 1 → delete of row 1 → checkbox of row 2 → delete of row 2 → … → "Erase my data" link.
- **Enter** in the input: submits.
- **Enter** or **Space** on a checkbox: toggles completion.
- **Enter** on the delete glyph: deletes the row.
- **Tab** never traps; **Shift+Tab** reverses cleanly.
- **Escape** in the input: clears it. Elsewhere: dismisses the `ErrorState` if visible.
- Focus indicator visible on every focusable element (NFR-7 / FR24).

### Screen reader

- Page title: `<h1>Todos</h1>`.
- Input: `<label>` (visually hidden) "Add a new todo".
- List: `<ul>` with each `TodoItem` as `<li>`.
- Checkbox: native `<input type="checkbox">` with `<label>` containing the description text.
- Delete glyph: `<button aria-label="Delete">×</button>`.
- Empty state: `aria-live="polite"` region announcing "No todos yet" when the list becomes empty.
- Error state: `role="alert"` so screen readers announce it without manual focus management.
- Loading state: `aria-busy="true"` on the list during initial fetch.

### Colour contrast

All text/background pairs meet WCAG 2.1 AA contrast ratios:

- `--color-text` on `--color-surface`: 16.5 : 1 ✓
- `--color-text-muted` on `--color-surface`: 4.6 : 1 ✓ (above 4.5 : 1 AA threshold)
- `--color-accent` on `--color-surface`: 5.5 : 1 ✓
- `--color-error-text` on `--color-error-bg`: 7.2 : 1 ✓

A full WCAG audit is **not** in scope for v1 (per NFR-7); the contrast and keyboard checks above are the v1 floor.

### What is *deliberately* not specified

- Reduced-motion support (`prefers-reduced-motion`): not applicable, v1 has no animations.
- High-contrast mode: deferred (Growth phase).
- RTL languages: not v1; English-only.
- Screen-reader-only "Skip to main content" link: not needed — there is no nav, no skipping required, the input is the first focusable element.

---

## Specification status

| Field | Value |
|---|---|
| Status | **Complete and ready for implementation** |
| Confidence | High — every visual decision derives from a constraint already locked in PRD or architecture |
| Companion documents | `prd.md`, `architecture.md`, `product-brief.md`, `risks-and-watchlist.md` |
| Implementation handoff | The component inventory in *Component strategy* and the patterns in *UX patterns* are the dev-step entry point |
