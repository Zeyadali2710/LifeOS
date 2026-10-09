# Phase 4: Organization - Context

**Gathered:** 2026-10-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Calendars and tasks live in LifeOS (ORG-01..03):
- Google Calendar + iCloud CalDAV events behind a `CalendarProvider` seam (ADR-010), shown together in the design's Day / Week / Month views on `/organization`.
- Create / edit / delete events incl. recurring, written back to Google / iCloud.
- LifeOS-native tasks with optional reminders.
- Conflict detection and a rules-based "Today's plan" with scheduling suggestions.
- The Organization domain agent goes live for chat (calendar/task questions and actions), replacing its "arrives in Phase 4" placeholder.

Not in this phase: Google Tasks / Apple Reminders sync, Web Push, email, project tasks/milestones (Phase 5), daily briefings (Phase 9).

</domain>

<decisions>
## Implementation Decisions

### Calendar sources & sync
- **D-01:** **Owner picks calendars.** After connecting an account, Settings → Connections lists every calendar in it with a checkbox; only checked calendars sync. Holiday / birthday / subscribed calendars are off unless ticked.
- **D-02:** **Category = per-calendar mapping.** Each synced calendar is assigned one of the design's categories (Work, Personal, Social, Career, Events, Deadlines) in Settings; all its events take that colour. No per-event override, no AI classification.
- **D-03:** **Sync every 5 minutes + Sync now**, pg-boss schedule, same pattern as GitHub sync (Phase 3 D-07). Incremental: Google `syncToken`, CalDAV ctag/etag. No push webhooks (Tailscale-only, no public endpoint). Sync emits activity events (Calendar source, `event` icon `#4fd1a1`) for meaningful changes only. *(Confirmed at planning, 2026-10-09: "meaningful" = an event added, changed or deleted whose start falls within the next 7 days.)*
- **D-04:** **Sync window: 30 days back, 12 months ahead.** Recurring events are expanded into instances within the window for display; the series master is kept for edits.
- **D-05:** Connections follow Phase 3 D-09: Google OAuth tokens and the iCloud app-specific password are stored AES-256-GCM encrypted in `connections`, never shown again, rotatable without redeploy, status (connected / RECONNECT / last sync) visible. Auth failures pause sync and mark the connection RECONNECT.

### Event writes & approvals
- **D-06:** **Owner UI writes go direct; agent writes need approval.** When the owner creates / edits / deletes an event in the calendar UI it is written to Google / iCloud immediately and audit-logged. When the Organization agent wants to write, the tool PREPAREs and the owner APPROVEs (existing approval state machine, edit-before-approve per Phase 3 D-04).
- **D-07:** **Agent deletes are HIGH_RISK tier** (stronger warning in the approval UI). Agent create/edit = APPROVE tier.
- **D-08:** **Recurring edit scopes: This event / This and following / All events** (Google-style). Research must confirm the iCloud CalDAV path for "this and following" (RRULE UNTIL on the old series + new series) and exception handling (RECURRENCE-ID / EXDATE).
- **D-09:** **Target calendar:** the create form has a calendar picker defaulting to the last-used calendar; a default can be set in Settings.

### Tasks & reminders
- **D-10:** **Tasks live in LifeOS Postgres only** — the `tasks` table from `docs/database.md`, designed so Phase 5 projects can attach tasks later (nullable project link is fine; don't build projects now). No external task sync.
- **D-11:** **Task shape:** title, due date (optional time), priority, notes, done/completed_at, optional remind_at. No recurring tasks, no subtasks.
- **D-12:** **Reminder delivery = in-app REMINDER notification** (existing category) raised by a worker job when `remind_at` passes, delivered live over SSE, snoozable via the Phase 2 snooze menu. No Web Push / email.
- **D-13:** **Reminders are for tasks only.** Calendar event alerts stay with Google / iCloud; LifeOS does not duplicate them.

### Conflicts & Today's plan
- **D-14:** **Conflict = overlapping busy events, or a due task with no free slot before its due time.** Ignore all-day events, events marked free/transparent, and declined events. Deterministic, no LLM.
- **D-15:** **Today's plan is pure rules, no LLM.** Code finds today's free slots (within sensible waking hours), open tasks and conflicts, and slots tasks into free time by due date then priority, with templated "why" lines. $0, predictable.
- **D-16:** **Computed live on page load** (and on refresh / relevant SSE updates) — no worker job, no stored snapshot.
- **D-17:** **"Add to calendar" on a plan item creates a real event immediately** on the chosen calendar (owner action, consistent with D-06). "Skip" dismisses that item for today.
- **D-18:** The plan card label must be honest: rules build it, so drop the design's "ORGANIZATION AGENT" tag (e.g. just "TODAY'S PLAN"). The design's header summary ("31 events this week · 11 free hours · 2 conflicts") uses real computed numbers only.

### Organization agent
- **D-19:** **The Organization agent goes live for chat.** The orchestrator delegates calendar/task questions to it ("what's on Thursday", "move gym to 6pm"). Tools: READ (events, free slots, conflicts, tasks), PREPARE→APPROVE event create/edit, HIGH_RISK event delete. Routed per Phase 3.1 (tier tag, free model when simple, D-09 gate concept applies to private data). Whether the agent may create/complete LifeOS tasks directly (local data, not external) is the planner's call — default to READ + APPROVE consistency unless clearly safe.

### Claude's Discretion
- Google OAuth flow details (redirect over tailscale serve HTTPS, scopes — least privilege: calendar read + events write), iCloud CalDAV discovery, choice of CalDAV / iCal / RRULE libraries (prefer small, maintained; avoid new deps where a small adapter suffices).
- DB schema shape for `calendars`, `calendar_events` (raw payload JSONB allowed per docs/database.md), and `tasks`.
- Waking-hours bounds for free-slot finding (settable or fixed default), slot granularity, plan ordering ties.
- Timezone handling (Australia/Sydney display; store UTC; respect event TZ).
- How the Home page's Today / Upcoming EmptyStates start using this data (wire if cheap, otherwise leave for later).
- Palette scopes for Events / Tasks (Phase 2 D-06: add scopes when data exists).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Design
- `design/Organization.dc.html` — Day/Week/Month CalendarGrid, category legend + colours, Today's plan card, Tasks · today list (content is placeholder)
- `design/INVENTORY.md` — tokens, components (CalendarGrid, EventCard, EmptyState), activity source colours, mobile layout
- `design/Mobile Layouts.dc.html` — mobile variants

### Architecture & policy
- `docs/decisions/ADR-010-providers.md` — capability providers, labelled mocks
- `docs/integrations.md` — `CalendarProvider`, error mapping, Apple CalDAV note, least-privilege scopes
- `docs/database.md` — planned `calendars`, `calendar_events`, `tasks` tables; JSONB rules
- `docs/permissions.md` — tiers (READ / PREPARE / APPROVE / HIGH_RISK)
- `docs/agents.md` — Organization agent, delegation, tier tag, spend cap
- `docs/decisions/ADR-007-secrets.md` — encrypted tokens
- `docs/decisions/ADR-004-pg-boss.md`, `docs/decisions/ADR-005-event-system.md` — jobs, activity events

### Prior phase context
- `.planning/phases/02-shell/02-CONTEXT.md` — design fidelity, notifications (REMINDER, snooze), palette scopes
- `.planning/phases/03-agent-infrastructure-github/03-CONTEXT.md` — connections, approvals, sync pattern, registry
- `.planning/phases/03.1-model-routing/03.1-CONTEXT.md` — routing, private-data gate

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/server/github/connections.ts` + `src/server/crypto.ts`: encrypted connection store pattern → Google / iCloud connections
- `src/server/github/sync.ts`: incremental sync job with ETags, diff → activity events, failure → RECONNECT; model for calendar sync
- `src/server/agents/tools/github.ts`, `tools/index.ts`, `gateway.ts`, `policy.ts`: tool registration with tiers, zod, approvals → Organization tools
- `src/server/agents/approvals.ts` + `src/approvals/approval-detail.tsx`: approval state machine and edit-before-approve UI
- `src/server/agents/registry.ts:85`: Organization agent currently `off(...)` "Phase 4" → flip live
- `src/server/notifications.ts`, `src/server/events.ts`, `src/server/time.ts`: notifications (REMINDER), activity emit, Sydney time helpers
- `src/ui/*`: EmptyState, InlineError, Dialog, Field, Badge, Skeleton, StatusTile, Icon
- `src/app/(os)/settings/page.tsx`: Connections section (ConnectionRow) to extend
- `src/app/(os)/organization/page.tsx`: current DomainPage placeholder to replace

### Established Patterns
- Drizzle schema in `src/server/db/schema.ts` + numbered migrations; owner-guarded server actions; live updates via SSE kinds
- No fake integrations; honest empty / not-connected states
- Owner verification runs on the homelab VM (tailscale serve HTTPS), not local dev

### Integration Points
- Google OAuth redirect must work behind tailscale serve (`BETTER_AUTH_URL` origin)
- Worker job registration (pg-boss) for calendar sync and reminder firing
- Orchestrator delegation to the new live agent

</code_context>

<specifics>
## Specific Ideas

- Category colours from the design: Work `#8b8cff`, Personal `#4fd1a1`, Social `#e889c4`, Career `#e8b86a`, Events `#6cb6ff`, Deadlines `#f07a6e`.
- Design header line pattern: "You're free Thursday afternoon." + counts line — compute from real data or omit.

</specifics>

<deferred>
## Deferred Ideas

- Google Tasks / Apple Reminders sync — revisit if LifeOS-only tasks prove limiting
- Web Push reminders (PWA) — later, with PWA work
- Recurring tasks and subtasks
- LLM-written plan narrative (agent-authored Today's plan) — possible Phase 9 daily intelligence
- Travel-time buffers between located events
- Per-event category override

</deferred>

---

*Phase: 04-organization*
*Context gathered: 2026-10-09*
