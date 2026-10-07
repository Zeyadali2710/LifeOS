# Phase 2: Shell - Context

**Gathered:** 2026-10-07
**Status:** Ready for planning

<domain>
## Phase Boundary

LifeOS feels like an OS: the app shell from the hi-fi design (sidebar / compact rail / mobile bottom bar, top bar, command bar, ⌘K palette, ⌘J AI panel shell, notifications drawer, toasts) wrapped around every domain page, plus a real Home (date/weather, greeting, status tiles, live activity over SSE, honest empty states) and working notifications (read, snooze, dismiss). Requirements SHL-01..05.

Not in scope: agents/orchestrator (Phase 3), any domain data (Career, Outreach, …), approvals backend (Phase 3).

</domain>

<decisions>
## Implementation Decisions

### Design fidelity
- **D-01:** `design/` (imported from Claude Design, see `design/INVENTORY.md`) is the visual source of truth for layout, tokens, components, motion and a11y. Content in it is placeholder — never ship placeholder names/numbers.
- **D-02:** Replace the Phase 1 placeholder tokens in `src/app/globals.css` with the design's tokens 1:1 (surfaces, text 1–4, 8 accents, type scale, space, radius, elevation, motion).

### Theme & assets
- **D-03:** Dark only. Remove the Phase 1 light theme / `prefers-color-scheme: light` block. Light is a later token swap.
- **D-04:** Self-host everything; no Google Fonts at runtime. Geist + Geist Mono via `next/font` (already used); Material Symbols Outlined self-hosted (subset/variable font file) so icons match the design.

### AI surfaces before agents
- **D-05:** Build the full UI shell for the command bar, ⌘J AI panel (empty state, suggestion chips, composer) and palette "Ask LifeOS" row. Submitting a prompt shows the design's InlineError pattern stating the orchestrator isn't connected yet (arrives with agents in Phase 3). No mock flows, no fake traces. Phase 3 only wires the backend.
- **D-06:** Command palette in Phase 2 = Commands + Jump-to pages only (navigation, open notifications, open AI, toggle compact sidebar, sign out). No empty scope tabs — each later phase adds its own scope when its data exists. Keep the keyboard model (↑↓ Enter Esc; Tab for scopes once >1 scope exists).

### Home
- **D-07:** Keep the design's full Home layout. Sections without a data source (Priorities, Today, Active projects, Agent activity, Upcoming) render the design's EmptyState in place, with a CTA that routes somewhere real (e.g. Settings / connections) or none.
- **D-08:** Status tiles show real values only: Agents (0 running, none configured yet), Approvals (0 waiting), System health (Phase 1 health: db, worker, overall). No invented numbers.
- **D-09:** Weather in the date line: add a small Sydney weather fetch (Open-Meteo, no API key), cached server-side (e.g. 30 min), failing silently to date-only. Format follows the design: `WEDNESDAY, OCTOBER 7 · SYDNEY · 17°C CLEAR`. Timezone Australia/Sydney.
- **D-10:** Live activity stream (SSE over Postgres LISTEN/NOTIFY per ADR-005) is fed in Phase 2 by:
  - auth events: sign-in, sign-out, failed sign-in (already in audit log → also emit activity_events)
  - system events: worker started, health status changes, migrations applied, deploy/version change
  Notification read/snooze/dismiss are NOT activity events (too noisy).
- **D-11:** Activity list uses the design's ActivityItem + enter animation (translateY −6→0, 450ms, faint tint), `role=log aria-live=polite`, honours reduced motion.

### Notifications
- **D-12:** Drawer only (right side, desktop; full sheet on mobile), opened from bell and the sidebar Notifications item. No /notifications page.
- **D-13:** Keep the design's time grouping NOW / TODAY / EARLIER. The DB `category` (URGENT/IMPORTANT/FYI/AGENT/APPROVAL/REMINDER) drives icon, tone colour and a small category label; URGENT + IMPORTANT render as the design's bold "important" rows. Add a compact category filter row at the top of the drawer.
- **D-14:** Snooze opens a small menu: 1 hour / Tonight (e.g. 18:00 or next evening) / Tomorrow 9am, computed in Australia/Sydney. Snoozed items reappear when `snoozedUntil` passes. Read/unread toggle, dismiss, mark all read, per-row action (actionUrl) as designed.
- **D-15:** Phase 2 notification sources (real only): failed sign-in → URGENT; worker down / health degraded → IMPORTANT; deploy/version change → FYI. No seed/mock notifications.
- **D-16:** Unread count badges on bell and sidebar item; new notifications arrive live over the same SSE channel.

### Claude's Discretion
- Sidebar compact-state persistence (cookie vs localStorage), mobile "More" sheet contents, exact keyboard shortcuts on Windows (design's ⌥1–9 = Alt+1–9, ⌘ = Ctrl), SSE reconnection/backoff, component file structure, how domain pages render as placeholders (EmptyState per page per design).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Design (visual source of truth)
- `design/INVENTORY.md` — token tables, shell anatomy, Home order, breakpoints, component map, Phase 2 gaps
- `design/LifeOS.dc.html` — app shell prototype (sidebar, top bar, command bar, palette, AI panel, notifications drawer, toast); markup + inline styles are the exact values
- `design/Design System.dc.html` — tokens, buttons, inputs, badges, agent states, empty/loading/error states, overlays, motion, a11y rules
- `design/Home.dc.html` — Home layout and ActivityItem
- `design/Mobile Layouts.dc.html` — mobile/tablet layouts and breakpoints (<720 bottom bar, 720–1100 68px rail, >1100 232px sidebar)
- `design/shots/home.jpg` — desktop Home reference screenshot
- `design/support.js` — Claude Design runtime, reference only; do not ship

### Architecture
- `docs/decisions/ADR-002-nextjs.md` — Next.js App Router + Tailwind v4
- `docs/decisions/ADR-005-event-system.md` — activity_events + LISTEN/NOTIFY (SSE source)
- `docs/decisions/ADR-010-providers.md` — honest UI / labelled mocks
- `docs/architecture.md`, `docs/database.md`, `docs/api.md`
- `node_modules/next/dist/docs/` — this Next.js version has breaking changes (see AGENTS.md); read before writing Next code

### Requirements
- `.planning/REQUIREMENTS.md` — SHL-01..05
- `.planning/phases/01-foundation/01-SUMMARY.md` — what Phase 1 delivered

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/server/db/schema.ts`: `activityEvents` and `notifications` tables + `notification_category` enum already exist (readAt, snoozedUntil, dismissedAt, actionUrl, partial inbox index).
- `src/server/health.ts` `checkHealth()`: feeds the System tile and health-change events.
- `src/server/audit.ts`: auth events already audited — hook point for auth activity events.
- `src/server/session.ts` `requireOwner()`: guard for the (os) layout, SSE route and server actions.
- `src/app/(os)/page.tsx`: existing greeting/date logic (Australia/Sydney) to migrate into the new Home.
- `src/ui/button.tsx`: restyle to the design's Primary/Secondary/Ghost/Destructive variants.
- `src/worker/index.ts`: place to emit worker-started / heartbeat-derived events.

### Established Patterns
- Tailwind v4 `@theme inline` mapping CSS vars → utilities in `globals.css`.
- Server components + `requireOwner()` per route; Better Auth sessions.
- pino logging, zod env validation (`src/server/env.ts`).

### Integration Points
- `src/app/(os)/layout.tsx` becomes the AppShell.
- New SSE route under `src/app/api/` (LISTEN on a channel, stream activity + notification events).
- Domain routes under `src/app/(os)/` for Career, Socials, Outreach, Organization, Projects, Knowledge, Goals, Agents, Approvals, Settings (placeholder empty states).

</code_context>

<specifics>
## Specific Ideas

- "Make it look like the design" — owner designed the whole OS in Claude Design; match spacing, typography, monospace labels, restrained glow.
- Voice: calm chief of staff, fact first, no exclamation marks/emoji (design a11y & voice rules).

</specifics>

<deferred>
## Deferred Ideas

- Light theme — later token swap.
- Palette search scopes (Projects/Tasks/Events/Emails/People/Notes/GitHub/Agents) — each owning phase adds its scope.
- Mock AI flows — rejected; real flows arrive in Phase 3.
- Full /notifications history page — not needed now.

</deferred>

---

*Phase: 02-shell*
*Context gathered: 2026-10-07*
