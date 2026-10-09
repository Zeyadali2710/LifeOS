# Phase 4: Organization - Research

**Researched:** 2026-10-09
**Domain:** Calendar integration (Google Calendar API + iCloud CalDAV), recurrence, sync, tasks/reminders, agent tools on the existing approval machine
**Confidence:** MEDIUM (codebase findings HIGH; external API details MEDIUM, a few ASSUMED)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01 Owner picks calendars (Settings -> Connections lists every calendar with a checkbox; only checked sync; holiday/birthday/subscribed off unless ticked).
- D-02 Category = per-calendar mapping (Work, Personal, Social, Career, Events, Deadlines); no per-event override, no AI classification.
- D-03 Sync every 5 min + Sync now, pg-boss schedule, same pattern as GitHub sync. Incremental: Google `syncToken`, CalDAV ctag/etag. No push webhooks. Sync emits activity events (Calendar source, `event` icon `#4fd1a1`) for meaningful changes only.
- D-04 Sync window 30 days back, 12 months ahead. Recurring events expanded into instances within the window for display; series master kept for edits.
- D-05 Connections follow Phase 3 D-09: Google OAuth tokens and iCloud app-specific password AES-256-GCM encrypted in `connections`, never shown again, rotatable without redeploy, status (connected / RECONNECT / last sync) visible. Auth failures pause sync and mark RECONNECT.
- D-06 Owner UI writes go direct (audit-logged); agent writes PREPARE then owner APPROVEs (existing state machine, edit-before-approve per Phase 3 D-04).
- D-07 Agent deletes are HIGH_RISK; agent create/edit = APPROVE.
- D-08 Recurring edit scopes: This event / This and following / All events. Research must confirm iCloud CalDAV path for "this and following" (RRULE UNTIL on old series + new series) and exceptions (RECURRENCE-ID / EXDATE).
- D-09 Create form has calendar picker defaulting to last-used; default settable in Settings.
- D-10 Tasks live in LifeOS Postgres only (`tasks` table per docs/database.md), nullable project link OK, don't build projects. No external task sync.
- D-11 Task shape: title, due date (optional time), priority, notes, done/completed_at, optional remind_at. No recurring tasks, no subtasks.
- D-12 Reminder delivery = in-app REMINDER notification raised by a worker job when `remind_at` passes, live over SSE, snoozable via Phase 2 snooze menu. No Web Push / email.
- D-13 Reminders are for tasks only; event alerts stay with Google/iCloud.
- D-14 Conflict = overlapping busy events, or a due task with no free slot before its due time. Ignore all-day, free/transparent, declined. Deterministic, no LLM.
- D-15 Today's plan is pure rules, no LLM (free slots within waking hours, open tasks, conflicts; slot tasks by due date then priority; templated "why" lines).
- D-16 Computed live on page load (and on refresh / relevant SSE updates); no worker job, no stored snapshot.
- D-17 "Add to calendar" on a plan item creates a real event immediately (owner action). "Skip" dismisses that item for today.
- D-18 Plan card label honest: drop "ORGANIZATION AGENT" tag (e.g. "TODAY'S PLAN"). Header summary uses real computed numbers only.
- D-19 Organization agent goes live for chat. Tools: READ (events, free slots, conflicts, tasks), PREPARE->APPROVE event create/edit, HIGH_RISK event delete. Routed per Phase 3.1 (tier tag, free model when simple, D-09 private gate concept applies). Agent creating/completing LifeOS tasks directly is the planner's call; default READ + APPROVE consistency unless clearly safe.

### Claude's Discretion
- Google OAuth flow details (redirect over tailscale serve HTTPS, least-privilege scopes), iCloud CalDAV discovery, choice of CalDAV / iCal / RRULE libraries (prefer small, maintained; avoid new deps where a small adapter suffices).
- DB schema for `calendars`, `calendar_events` (raw payload JSONB allowed), `tasks`.
- Waking-hours bounds, slot granularity, plan ordering ties.
- Timezone handling (Australia/Sydney display; store UTC; respect event TZ).
- How Home page Today / Upcoming EmptyStates use this data (wire if cheap).
- Palette scopes for Events / Tasks.

### Deferred Ideas (OUT OF SCOPE)
- Google Tasks / Apple Reminders sync; Web Push reminders; recurring tasks and subtasks; LLM-written plan narrative; travel-time buffers; per-event category override.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ORG-01 | Google Calendar + iCloud CalDAV via CalendarProvider; day/week/month views | Provider seam, Google REST adapter, tsdav adapter, local expansion, schema, sync job |
| ORG-02 | Create/edit/delete events (APPROVE tier for external), recurring | Approval-machine generalisation (critical), recurring-edit mechanics, tool definitions |
| ORG-03 | Tasks + reminders; conflict detection; scheduling suggestions | tasks schema, reminder worker job, pure-function conflict/free-slot/plan modules |
</phase_requirements>

## Summary

The codebase has strong reusable patterns (encrypted `connections` row, `createSync` factory with injected fetch/emit/now, pg-boss schedule in `src/worker/index.ts`, `Tool` type with tiers and `toApproval`, notifications with REMINDER category). The plan should mirror them rather than invent new ones. The one big hidden cost: **the approval machine is hard-wired to GitHub issues**. `approvals.ts`, `dto.ts`, `agent-types.ts` (`ApprovalDTO.original: IssuePayload`, `result: {number,url}`), `approval-detail.tsx`, `approval-edit-form.tsx` all parse `issuePayloadSchema`, catch `GithubError`, build "issue was not created" strings and look up `githubRepos` for privacy. Calendar tools cannot plug in until this is generalised (per-tool payload schema + preview/edit renderer + generic result). This must be an early, explicit plan (Wave 1) before any calendar tool.

External integration: write a small fetch-based Google client (same style as `github/client.ts`, zod-validated, no `googleapis`). For CalDAV use `tsdav` for discovery/REPORT/PUT/DELETE and `ical.js` for parsing, editing and recurrence expansion of VEVENTs. Do NOT use `rrule-temporal` (transitive via pg-boss): Node 24 has no global `Temporal` (verified `typeof Temporal === "undefined"` on local Node 24.19) so it would additionally need `temporal-polyfill`. ical.js already expands RRULE/EXDATE/RECURRENCE-ID with VTIMEZONE support and is zero-dependency.

Uniform design: both providers store series masters + override rows in `calendar_events`, and instances are expanded at read time from masters inside the requested range (not materialised), using one expander for both. Conflict detection and free-slot computation are pure functions over `{start,end,busy}` intervals (no deps), unit-testable without DB or network.

**Primary recommendation:** Wave 1 = generalise approvals + schema/migration + CalendarProvider seam & fake provider; Wave 2 = Google adapter, CalDAV adapter, sync job; Wave 3 = pure conflicts/free-slots/plan + tasks + reminder job; Wave 4 = UI + agent tools/registry flip. Add exactly two npm deps (`tsdav`, `ical.js`), human-verified.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Google OAuth code exchange, token storage/refresh | API / Backend (route handlers) | Database (encrypted `connections`) | Secrets never reach browser |
| Calendar sync (Google/CalDAV) | Worker (pg-boss) | Database | Matches GitHub sync; 5-min schedule |
| Event expansion, conflicts, free slots, plan | API / Backend (pure modules, server-side) | Browser (render only) | Deterministic, testable, D-16 compute on load |
| Owner event writes | API / Backend (server actions) | Provider (Google/iCloud) | D-06 direct, audit-logged |
| Agent event writes | Approval executor (server) | Provider | D-06/D-07 APPROVE / HIGH_RISK |
| Task CRUD | API / Backend (server actions) | Database | LifeOS-only data |
| Reminder firing | Worker (pg-boss every minute) | Notifications + SSE | D-12 |
| Day/Week/Month rendering | Browser / Client | Frontend Server | UI-SPEC handles visuals |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| tsdav | 2.4.0 (modified 2026-10-06) | CalDAV discovery, calendar-query/sync REPORT, create/update/delete objects with etag | Maintained TS CalDAV client, 2 deps (`debug`, `xml-js`), no postinstall [VERIFIED: npm registry metadata; package name ASSUMED legit, see audit] |
| ical.js | 2.2.1 | Parse/serialise iCalendar, RRULE expansion, RECURRENCE-ID/EXDATE, VTIMEZONE | Zero deps, Mozilla/kewisch, since 2014 [VERIFIED: npm registry metadata] |
| pg-boss | ^12.37.0 (installed) | Sync + reminder schedules | Already in use |
| zod | ^4.6.5 (installed) | Validate Google JSON and tool I/O | Already in use |
| drizzle-orm | ^0.45.3 (installed) | Schema/migrations | Already in use |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| fetch Google client | `googleapis` / `@googleapis/calendar` | Heavy deps (gaxios, google-auth-library); a REST subset is ~6 endpoints |
| ical.js | `rrule-temporal` + `ts-ics` | Needs `temporal-polyfill` on Node 24; more pieces |
| tsdav | hand-rolled PROPFIND/REPORT | iCloud discovery (well-known -> principal -> calendar-home-set) and XML quirks are the exact edge cases to avoid hand-rolling |

**Installation:**
```bash
npm install tsdav ical.js
```
**Version verification:** `npm view tsdav version` = 2.4.0; `npm view ical.js version` = 2.2.1 (2026-10-09). `scripts.postinstall` empty for both.

## Package Legitimacy Audit

| Package | Registry | Age | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-------------|-----------|-------------|
| tsdav | npm | since 2021-06 | github.com/natelindev/tsdav | unavailable (installed slopcheck only checks PyPI, returned false SLOP; not valid for npm) | [ASSUMED] gate behind checkpoint:human-verify |
| ical.js | npm | since 2014-05 | github.com/kewisch/ical.js | unavailable (same) | [ASSUMED] gate behind checkpoint:human-verify |

**Packages removed due to slopcheck [SLOP]:** none (the PyPI-only tool's SLOP output is a wrong-ecosystem artefact and was disregarded).
**Packages flagged [SUS]:** none. Planner: insert one `checkpoint:human-verify` before `npm install tsdav ical.js`. Both have long histories and public repos on npm metadata.

## Architecture Patterns

### System Architecture Diagram

```
Settings > Connect Google ---> /api/connections/google/start --(state+PKCE cookie)--> accounts.google.com
                                 /api/connections/google/callback <--code-- (BETTER_AUTH_URL origin)
                                    |-> token exchange -> encrypt -> connections(google_calendar)
Settings > iCloud (Apple ID + app password) -> tsdav login+discovery -> encrypt -> connections(icloud_calendar)
                                    |
                      list calendars -> owner ticks + category -> calendars table
pg-boss "calendar.sync" */5 + Sync now
  -> for each connection (skip if RECONNECT):
       Google: events.list(syncToken | full) per enabled calendar  \
       CalDAV: ctag compare -> sync-collection / etag diff          /--> upsert calendar_events (masters+overrides, raw JSONB)
       auth fail -> status=error (RECONNECT), emit once
       meaningful diff -> emitActivity(source "calendar")
pg-boss "task.reminders" * * * * *  -> UPDATE tasks SET reminded_at WHERE remind_at<=now AND reminded_at IS NULL AND done_at IS NULL RETURNING -> emitActivity + REMINDER notification
/organization (server component)
  range -> load masters+overrides -> expand(ical.js) -> instances -> conflicts(), freeSlots(), plan() -> render
Owner create/edit/delete (server action) -> provider.write -> upsert local row -> audit -> notifyLive
Agent tool (PREPARE/APPROVE/HIGH_RISK) -> gateway creates approval -> owner edits/approves -> executeApproved -> tool.handler -> provider.write
```

### Recommended Project Structure
```
src/server/calendar/
  types.ts          # CalendarProvider interface, NormalizedEvent, WriteScope
  google/client.ts  # fetch + zod, token refresh, GoogleError(kind)
  google/provider.ts
  caldav/provider.ts# tsdav wrapper; ical.js serialise/edit
  connections.ts    # save/refresh/get (mirrors github/connections.ts)
  sync.ts           # createSync({handle,fetch,emit,now}) like github/sync.ts
  expand.ts         # ical.js master+overrides -> instances in [from,to)
  recurrence-edit.ts# this / this-and-following / all, per provider
  conflicts.ts      # pure
  free-slots.ts     # pure
  plan.ts           # pure
src/server/tasks.ts # CRUD + reminder firing
src/server/agents/tools/calendar.ts
src/worker/jobs/calendar-sync.ts, task-reminders.ts
src/app/api/connections/google/{start,callback}/route.ts
```

### Pattern 1: CalendarProvider seam
```ts
interface CalendarProvider {
  listCalendars(): Promise<{ remoteId: string; name: string; readOnly: boolean }[]>;
  sync(cal: CalendarRow, cursor: string | null, window: {from: Date; to: Date}): Promise<{ upserts: NormalizedEvent[]; deletes: string[]; cursor: string | null; reset?: boolean }>;
  create(cal: CalendarRow, e: EventInput): Promise<NormalizedEvent>;
  update(cal, remoteId, e: EventInput, scope: "this"|"following"|"all", instanceStart?: string): Promise<NormalizedEvent[]>;
  remove(cal, remoteId, scope, instanceStart?): Promise<void>;
}
```
Tests inject a fake provider (labelled mock per ADR-010); production wires only real ones. Errors: `ProviderError.kind = auth|not_found|rate_limit|conflict|client|unavailable` (mirrors `GithubError`; docs/integrations.md error mapping).

### Pattern 2: Google (REST, no SDK)
- Auth: authorization-code flow, `access_type=offline`, `prompt=consent`, PKCE + `state` in an HttpOnly cookie, redirect `${BETTER_AUTH_URL}/api/connections/google/callback`. Scopes (least privilege): `calendar.calendarlist.readonly` + `calendar.events` [CITED: developers.google.com/workspace/calendar/api/auth; MEDIUM, confirm names at implementation]. Store `{refresh_token, access_token, expires_at}` as one encrypted JSON blob in `connections.ciphertext`; refresh when <60 s left; `invalid_grant` -> RECONNECT.
- Sync: `GET /calendar/v3/calendars/{id}/events?singleEvents=false&showDeleted=true&maxResults=250` then loop `pageToken`; save `nextSyncToken`. Incremental params must match the initial request and `syncToken` is incompatible with most filters (400) -> do NOT pass timeMin/timeMax with syncToken; filter to the D-04 window locally (drop far-future masters is unnecessary; expansion is range-bounded). `410 Gone` = clear that calendar's events and full resync [CITED: developers.google.com/workspace/calendar/api/guides/sync].
- Recurring: with `singleEvents=false` you get masters (`recurrence: ["RRULE:..","EXDATE:.."]`) and exceptions (`recurringEventId`, `originalStartTime`, may be `status: cancelled`). Store both; expand locally.
- Writes: `events.insert/patch/delete`. "All" = patch master. "This" = patch the instance (id `<masterId>_<originalStartUTC>`, found via `events.instances` or constructed). "This and following" = patch master `RRULE` to add `UNTIL=<instanceStart-1s>` (all-day: UNTIL as DATE) and insert a new event with the same fields and the original RRULE (drop COUNT or recompute remaining count) starting at the instance. Use `sendUpdates=none` (avoid emailing attendees).
- Owner-write dedupe: after a write, upsert the returned event locally and let the next sync overwrite idempotently by (calendar_id, remote_id).

### Pattern 3: iCloud CalDAV (tsdav)
- `createDAVClient({ serverUrl: "https://caldav.icloud.com", credentials: { username: appleId, password: appSpecificPassword }, authMethod: "Basic", defaultAccountType: "caldav" })` [CITED: tsdav README uses this shape for iCloud CardDAV; CalDAV host `caldav.icloud.com` ASSUMED]. App-specific passwords are generated at appleid.apple.com (needs 2FA). Validate on save by running discovery + `fetchCalendars`; 401 -> "rejected".
- Sync: compare calendar `ctag`/`syncToken`; if changed, `fetchCalendarObjects` with a time-range filter for the D-04 window (iCloud time-range REPORT returns masters whose recurrence intersects), diff by `etag` against stored rows, delete rows whose URL disappeared. ctag/etag diff is the safe path; sync-collection support on iCloud is not guaranteed [ASSUMED] so implement etag diff as the baseline.
- Each `.ics` resource may contain a master VEVENT plus override VEVENTs (same UID, with `RECURRENCE-ID`). Store one `calendar_events` row per resource (UID), raw ICS in `raw`, and derive display from it with ical.js (`ICAL.Event` handles exceptions via `relateException`).
- Writes: PUT `.ics` with `If-Match: <etag>` (update) or `If-None-Match: *` (create, new `uid@lifeos`); DELETE with `If-Match`. 412 -> refetch, `conflict` error. Preserve unknown properties by editing the parsed component, never regenerating from scratch (round-trip safety for X- props, ALARMs, attendees).
- Recurrence edits (D-08, confirmed per RFC 5545 semantics):
  - **All:** modify master VEVENT.
  - **This event:** add an override VEVENT in the same resource with `RECURRENCE-ID` (= original start, same TZID/VALUE type as DTSTART) and new DTSTART/DTEND; delete-this = add `EXDATE` to the master (and remove any override).
  - **This and following:** set `UNTIL` on the master RRULE to just before the instance (remove COUNT; use DATE form for all-day; UTC `Z` form for timed events when DTSTART has a TZID), drop overrides/EXDATEs at or after the split, and create a NEW resource (new UID) with the original RRULE from the instance start (and its later overrides moved over). If the instance is the first occurrence, treat as "all". RANGE=THISANDFUTURE exists in the spec but is poorly supported (do not use).

### Pattern 4: Pure scheduling modules
```ts
type Busy = { id: string; start: number; end: number }; // epoch ms
conflicts(items: Busy[]): [string,string][]   // sort by start; sweep; strict overlap (a.end > b.start); touching != overlap
freeSlots(busy: Busy[], day: {start,end}, minMs=15*60_000): {start,end}[]  // merge busy, subtract from waking window
plan(slots, tasks): { item, slot, why }[]     // tasks by dueAt asc (nulls last) then priority, estimate default 30 min, first-fit
```
Filter before conflict detection per D-14: not all-day, `transparency !== "transparent"`, not declined (own attendee `responseStatus === "declined"`; Google `status: cancelled` already deleted). Waking hours default fixed 08:00-22:00 Sydney (store as `settings` keys later if wanted). Use `sydneyInstant` from `src/server/time.ts` for window bounds (DST-safe). A "due task with no free slot before due time" = task not placed by `plan()`.

### Pattern 5: Reminders
Worker queue `task.reminders` on `* * * * *`. Atomic claim to survive double-run: `UPDATE tasks SET reminded_at=now() WHERE remind_at<=now() AND reminded_at IS NULL AND done_at IS NULL RETURNING ...` then `emitActivity({type:"task.reminder", source:"calendar",...}, {category:"REMINDER", ...})` per row. Editing `remind_at` resets `reminded_at` to NULL. Snooze reuses existing notification snooze.

### Anti-Patterns to Avoid
- **Plugging calendar tools into approvals as-is** (GitHub-typed; will throw in `issuePayloadSchema.parse`, and `toDTOs` drops rows on parse error silently).
- Materialising expanded instances in the DB (stale on edit; RRULE series to 12 months bloats) - expand at read.
- Passing timeMin/timeMax together with Google syncToken.
- Regenerating ICS from scratch on edit.
- Storing times as local strings without TZID (DST bugs). Store `start_at`/`end_at` as timestamptz (UTC) plus `tz` text and `all_day` bool; all-day events stored as date strings (`start_date`/`end_date`) or UTC-midnight with flag, never shifted by TZ.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| RRULE/EXDATE/RECURRENCE-ID expansion, VTIMEZONE | custom recurrence engine | ical.js `RecurExpansion` / `ICAL.Event.iterator` | BYDAY/BYSETPOS/DST edge cases |
| CalDAV discovery & XML | PROPFIND/REPORT builder | tsdav | iCloud principal/home-set redirects |
| OAuth token encryption | new crypto | `src/server/crypto.ts` encrypt/decrypt | AES-256-GCM, rotatable (ADR-007) |
| Notification/SSE | new channel | `emitActivity` + `notifyLive` | Existing REMINDER category |
| Time-zone maths | date lib | `Intl` + `src/server/time.ts` | Already used project-wide |
| Interval overlap | O(n^2) library | 15-line sweep | Trivial, tested |

## Runtime State Inventory
Not a rename/refactor phase - omitted.

## Common Pitfalls

### Pitfall 1: Approval machine is GitHub-shaped
**What goes wrong:** Calendar approvals fail to parse/render; expiry notification says "issue was not created"; DTO builder silently drops the row.
**How to avoid:** Plan a dedicated task: add `kind`/tool-keyed payload schemas (`payloadSchemaFor(tool)`), tool-provided `preview` fields (title/summary lines), generic `result: unknown`, generic error mapping (`ProviderError` alongside `GithubError`), tool-provided expiry message, private flag via tool (`isPrivate(payload)`; calendar = always private). Update `ApprovalDTO`, `approval-detail.tsx`, `approval-edit-form.tsx`, `listApprovals` toDTOs. Keep GitHub behaviour test-green (existing `tests/db/approvals*.test.ts`).
**Warning signs:** `issuePayloadSchema` imports in any calendar path.

### Pitfall 2: Google refresh token expires in 7 days in "Testing" publishing status
**Why:** External-user OAuth apps left in Testing get time-limited refresh tokens [CITED: developers.google.com OAuth docs; MEDIUM]. **Avoid:** document that the owner must set the consent screen to "In production" (unverified is acceptable for a single user; shows a warning) or use Internal if Workspace. Treat `invalid_grant` as RECONNECT, which the D-05 flow already handles.

### Pitfall 3: Google redirect URI on `*.ts.net`
Google requires HTTPS exact-match redirect URIs on a public-suffix-listed domain. Whether Google accepts `https://lifeos.<tailnet>.ts.net/...` is unverified [ASSUMED it works; ts.net believed to be on the PSL]. The owner verifies on the VM; fallback = a "paste the redirect URL" manual flow using a loopback redirect (`http://localhost`). Put this as an early human-verify checkpoint, not a late surprise. Google's device flow does not allow Calendar scopes [ASSUMED].

### Pitfall 4: Google sync-token semantics
410 -> full resync; params must match across pages/incremental; deleted events arrive as `status: cancelled` minimal bodies (no start/end) - delete locally by id; cancelled exceptions on a recurring series mean EXDATE-like removal of that instance.

### Pitfall 5: Timezones and all-day
All-day Google events use `start.date` (end exclusive). iCloud all-day uses `VALUE=DATE`. Floating times (no TZID) in ICS: interpret as Australia/Sydney. Events with TZID not in the IANA set (Windows names, e.g. "AUS Eastern Standard Time") need VTIMEZONE from the same ICS (ical.js registers it) - fall back to Sydney with a log.
Node 24 `Intl` DST: use `sydneyInstant`, never add 24h to step days.

### Pitfall 6: Duplicate / lost updates
Owner writes return the stored remote event; upsert by `(calendar_id, remote_id)` unique key and let sync reconcile. For CalDAV always use If-Match; on 412 refetch and surface an InlineError, never overwrite blindly. Approved agent writes: use the approval id as an idempotency marker (Google `extendedProperties.private.lifeosApproval`; ICS `X-LIFEOS-APPROVAL`) so the existing `adopt` (ambiguous retry) path can search before re-creating, mirroring the GitHub marker pattern in `tools/github.ts`.

### Pitfall 7: Private-data gate
The Phase 3.1 gate taints runs that touch private repos (`routing.ts` / `loop.ts` scan tool outputs). Calendar data is private by nature: calendar tool outputs must set `sawPrivate` (extend the scan in `loop.ts` ~line 205 so calendar tool results always taint), so free models never see event titles unless the owner's `ai.free_private_ok` is on. Without this, D-19's "D-09 gate concept applies" is silently unmet.

### Pitfall 8: Secrets in logs / agent output
Redact: `redact.ts` must cover calendar tool inputs/outputs for fields like description/location? (private but not secret). Tokens never in tool I/O, logs, or `lastError`. iCloud app password only ever decrypted inside `caldav/provider.ts`.

### Pitfall 9: Worker bundle / Next boundaries
`build:worker` uses esbuild `--packages=external`; new deps must be in production `dependencies` (they are, via `npm install`) and the Docker `proddeps` stage. `ical.js` v2 is ESM-friendly. Check AGENTS.md note: read `node_modules/next/dist/docs/01-app` for route handlers, server actions and `proxy.ts` (middleware renamed) before writing the OAuth routes; `src/proxy.ts` may need the callback route allowed to carry the session cookie (it is owner-authenticated, so keep it protected - the callback requires the logged-in owner session plus matching `state`).

## Code Examples

### Reminder claim (atomic, idempotent)
```ts
// Source: pattern from approvals.ts executeApproved (conditional UPDATE ... RETURNING)
const due = await h.update(tasks).set({ remindedAt: now })
  .where(and(lte(tasks.remindAt, now), isNull(tasks.remindedAt), isNull(tasks.doneAt)))
  .returning();
for (const t of due) await emitActivity({ type: "task.reminder", source: "calendar", title: t.title }, { category: "REMINDER", title: t.title, entityType: "task", entityId: t.id, actionUrl: "/organization" }, h);
```

### Overlap sweep
```ts
export function conflicts(xs: Busy[]) {
  const s = [...xs].sort((a, b) => a.start - b.start), out: [string, string][] = [];
  for (let i = 0; i < s.length; i++)
    for (let j = i + 1; j < s.length && s[j].start < s[i].end; j++) out.push([s[i].id, s[j].id]);
  return out; // ponytail: O(n*k) on overlap depth, fine for a personal calendar
}
```

### Tool registration (mirrors github.create_issue)
`calendar.create_event` tier APPROVE, `calendar.update_event` APPROVE, `calendar.delete_event` HIGH_RISK (gateway: `resolvePolicy` floors HIGH_RISK; `needsApproval` covers it), READ tools: `calendar.list_events`, `calendar.free_slots`, `calendar.conflicts`, `tasks.list`. Each write tool: `available()` checks connection status, `resolve()` re-validates calendar id/enabled/not read-only, `toApproval()` returns the editable payload, `handler` throws `ToolError("not_allowed")` if `!ctx.approvalId`. Add names to the `organization` entry in `registry.ts` (`live: true`, `routable: true`, `requiresTools: true`, orchestrator prompt updated), `TOOLS` map in `tools/index.ts`, and `delegateTool`'s `ids` picks the agent up automatically.

## State of the Art

| Old | Current | Impact |
|-----|---------|--------|
| `rrule` (2023, unmaintained) | ical.js / rrule-temporal | Do not add `rrule` |
| Google push channels | syncToken polling | Required here (no public endpoint) |
| Node without Temporal | Temporal not yet global in Node 24 | rrule-temporal would need polyfill |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `tsdav` and `ical.js` are legitimate (slopcheck unavailable for npm) | Package audit | Supply-chain; mitigated by human-verify checkpoint |
| A2 | Google accepts `https://*.ts.net` redirect URI | Pitfall 3 | OAuth connect blocked; fallback manual-paste flow |
| A3 | iCloud CalDAV host `caldav.icloud.com`, ctag + etag diff works; sync-collection unreliable | Pattern 3 | Sync adapter tweaks |
| A4 | Google Calendar scope names `calendar.calendarlist.readonly` + `calendar.events` suffice for list + event CRUD | Pattern 2 | Add `calendar.readonly` |
| A5 | Device flow disallows Calendar scopes | Pitfall 3 | None (only affects fallback choice) |
| A6 | "In production" unverified single-user app avoids 7-day refresh expiry | Pitfall 2 | Weekly reconnect; documented in RECONNECT flow |
| A7 | ical.js 2.x `RecurExpansion` handles overrides + VTIMEZONE as described | Don't Hand-Roll | Spike in plan 1 (unit test with fixtures) |

## Open Questions

1. **Does Google accept the tailnet redirect URI?** Unknown until tried; plan a checkpoint on the VM early; implement manual-paste fallback only if it fails.
2. **Multiple Google accounts?** Context implies one Google + one iCloud. Recommend single connection per provider (`connections` ids `google_calendar`, `icloud_calendar`); extend `ConnectionId`/`getConnections` IDS list.
3. **Agent task writes (D-19 discretion):** recommend READ-only tasks tool plus `tasks.create` at APPROVE for consistency; local-only completion could be EXECUTE-tier later. Default: READ + APPROVE.
4. **Instance identity for "this event" via the agent:** payload should carry `{eventId, instanceStart, scope}`; planner defines in zod schema.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | runtime | yes (local 24.19; image `node:24-slim`) | 24 | - |
| Temporal global | rrule-temporal | no | - | Not used (ical.js) |
| Google Cloud OAuth client | ORG-01 | owner action | - | none; blocks Google only |
| Apple ID app-specific password | ORG-01 | owner action | - | none; blocks iCloud only |
| Tailscale HTTPS origin | OAuth redirect | on VM | - | manual-paste flow |
| Local dev stack | tests | NOT assumed | - | tests run via `npm test` against test DB on VM over SSH (per owner constraint) |

Live-integration verification (real Google/iCloud) is owner-run on the VM; plans must contain `checkpoint:human-verify` tasks for it. All code paths testable with fake provider + recorded fixtures.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^5.0.3 (`vitest.config.ts`), Playwright for e2e |
| Layout | `tests/unit` (pure), `tests/db` (Postgres-backed, helpers in `tests/db/helpers.ts`), `tests/e2e` |
| Quick run | `npx vitest run tests/unit` |
| Full suite | `npm test` (+ `npm run typecheck && npm run lint`) |

### Phase Requirements -> Test Map
| Req | Behavior | Type | Command | Exists |
|-----|----------|------|---------|--------|
| ORG-01 | Google JSON -> normalized, syncToken incremental, 410 resets, cancelled deletes | db (fake fetch) | `npx vitest run tests/db/calendar-sync-google.test.ts` | Wave 0 |
| ORG-01 | CalDAV ICS fixtures -> normalized, etag diff, deletes | db | `... calendar-sync-caldav.test.ts` | Wave 0 |
| ORG-01 | Recurrence expansion w/ EXDATE, override, DST, all-day | unit | `... tests/unit/expand.test.ts` | Wave 0 |
| ORG-01 | Auth failure -> RECONNECT, sync paused, one notification | db | `... calendar-sync-auth.test.ts` | Wave 0 |
| ORG-02 | Agent create/edit -> pending approval, no provider call before approve | db | `... calendar-tools.test.ts` | Wave 0 |
| ORG-02 | Delete tool resolves HIGH_RISK, override cannot lower | db | same | Wave 0 |
| ORG-02 | Recurring scopes this/following/all produce expected ICS/Google calls | unit | `... recurrence-edit.test.ts` | Wave 0 |
| ORG-02 | Approvals regression: GitHub issue approval flow unchanged | db | existing `approvals*.test.ts` | exists |
| ORG-02 | Owner UI write audit-logged | db | `... calendar-actions.test.ts` | Wave 0 |
| ORG-03 | conflicts (touching, nested, all-day/transparent/declined ignored) | unit | `... conflicts.test.ts` | Wave 0 |
| ORG-03 | free slots + plan ordering (due then priority) incl. DST day | unit | `... plan.test.ts` | Wave 0 |
| ORG-03 | reminder fires once, resets on remind_at edit, skips done | db | `... task-reminders.test.ts` | Wave 0 |
| ORG-03 | tasks CRUD / complete | db | `... tasks.test.ts` | Wave 0 |
| Security | token never in DTO/log/tool output; calendar tool output taints run | db | `... calendar-privacy.test.ts` | Wave 0 |
| UI | Day/Week/Month render, empty/not-connected | e2e (VM only) | `npx playwright test tests/e2e/organization.spec.ts` | Wave 0 |

### Sampling Rate
- Per task commit: `npx vitest run tests/unit` plus the touched test file
- Per wave merge: `npm test && npm run typecheck && npm run lint`
- Phase gate: full suite green plus owner VM UAT (real Google + iCloud connect, create/edit/delete incl. recurring)

### Wave 0 Gaps
- [ ] Fixtures: Google events JSON (single, recurring master, exception, cancelled, all-day), iCloud ICS (recurring w/ EXDATE & RECURRENCE-ID, VTIMEZONE, floating, all-day) under `tests/fixtures/calendar/`
- [ ] Fake `CalendarProvider` (labelled mock, tests only)
- [ ] Test files above; no new framework needed

## Security Domain

### Applicable ASVS Categories (L1)

| ASVS | Applies | Control |
|------|---------|---------|
| V2 Authentication | yes | Callback route requires owner session; OAuth `state` + PKCE |
| V3 Session | yes | Existing better-auth session; state cookie HttpOnly, SameSite=Lax, short TTL, single use |
| V4 Access Control | yes | Server actions owner-guarded (existing pattern); agent allow-list in gateway |
| V5 Input Validation | yes | zod on tool inputs, Google responses, ICS size caps; sanitize ICS text fields (CRLF injection in SUMMARY/DESCRIPTION when serialising - use ical.js property setters, never string concat) |
| V6 Cryptography | yes | AES-256-GCM via `crypto.ts`; no hand-rolled; master key from env |
| V7 Error/Logging | yes | No tokens/event bodies in logs, `lastError` is a fixed string |
| V9/V13 Comms/API | yes | Constant provider hosts (no user-supplied URL fetch: SSRF); CalDAV serverUrl fixed to iCloud; follow only same-host redirects |

### Threat Patterns

| Pattern | STRIDE | Mitigation |
|---------|--------|------------|
| OAuth CSRF / code injection on callback | Spoofing | `state` bound to session + PKCE verifier; reject on mismatch |
| Refresh-token theft from DB | Info disclosure | Encrypted at rest, never returned to client (DTO exposes status/last4-like only); rotation by reconnect |
| Over-scoped Google token | Elevation | Only `calendar.events` + `calendarlist.readonly`; no `calendar` full |
| App-specific password exposure | Info disclosure | Encrypted; shown once at entry; revocable at appleid.apple.com; never in logs/audit (audit metadata: no secret, last4 optional) |
| Prompt-injection via event title/description steering agent into writes | Tampering | All agent writes need approval (APPROVE/HIGH_RISK); approval UI shows full payload incl. attendees; treat event text as untrusted data in prompt |
| Agent self-approving / tier downgrade | Elevation | `resolvePolicy` HIGH_RISK floor; permission override cannot lower delete; handler rejects without `approvalId` |
| Approved payload tampered after approval | Tampering | Existing `payloadHash` + edit-before-approve re-validated by per-tool schema |
| Duplicate execution on retry | Tampering/Repudiation | Conditional UPDATE claim + approval-id marker + `adopt` search |
| Attendee notification spam on write | DoS/harm | `sendUpdates=none` default; attendees editing out of scope unless shown in approval |
| ICS injection / malicious remote ICS parse DoS | Tampering/DoS | Size caps, try/catch per resource, skip bad resources and log count only |
| Calendar data to free models | Info disclosure | Taint run via private gate (Pitfall 7) |

## Sources

### Primary (HIGH)
- Codebase read: `src/server/github/{connections,sync}.ts`, `agents/{approvals,gateway,registry,types,policy}.ts`, `tools/{github,delegate,index}.ts`, `worker/index.ts`, `server/{env,time,queue,events}.ts`, `db/schema.ts`, `package.json`, `docker/Dockerfile`
- developers.google.com/workspace/calendar/api/guides/sync (syncToken, 410, restricted params)
- npm registry metadata (tsdav 2.4.0, ical.js 2.2.1, rrule-temporal 2.2.8 + lockfile via pg-boss)

### Secondary (MEDIUM)
- github.com/natelindev/tsdav README (Basic auth with app-specific password pattern)
- Google OAuth docs via web search (Testing-mode 7-day refresh expiry; HTTPS exact-match redirect URIs)

### Tertiary (LOW)
- RFC 5545 recurrence-edit mechanics, iCloud specifics (from training knowledge, ASSUMED A3/A7)

## Metadata

**Confidence breakdown:**
- Standard stack: MEDIUM - libraries exist/current, not exercised against iCloud
- Architecture: HIGH - mirrors proven in-repo patterns
- Pitfalls: MEDIUM - approvals coupling is HIGH (code-verified); Google/iCloud behaviours MEDIUM/LOW

**Research date:** 2026-10-09
**Valid until:** 2026-11-08
