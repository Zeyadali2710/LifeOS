---
phase: 04-organization
reviewed: 2026-10-12T00:00:00Z
depth: standard
files_reviewed: 86
parts: [server+agents (A), UI (B), contracts/schema/worker (C)]
findings:
  critical: 6
  warning: 26
  info: 22
  total: 54
status: issues_found
---

# Phase 4 Code Review

Reviewed in three parallel parts (A: server + agents, 30 files; B: UI, 33 files; C: shared contracts, schema, tasks, worker, 23 files). Finding IDs carry the part letter.


# Part A


# Phase 4: Code Review Report (Part A: server side)

**Reviewed:** 2026-10-12
**Depth:** standard
**Files Reviewed:** 30
**Status:** issues_found

## Summary

Reviewed the Phase 4 server side: Google OAuth routes, the Google REST and iCloud CalDAV adapters, sync, the shared write service, the owner server actions, and the agent calendar tools, approvals and loop changes.

The security basics hold up. OAuth uses PKCE S256 with an encrypted single-use state cookie and a timing-safe compare. Redirects are built only from `BETTER_AUTH_URL`. Google hosts are fixed and paths are checked. iCloud URLs are pinned to `https://*.icloud.com`. Secrets are encrypted and never selected on the DTO path. Every owner action calls `requireOwner()`. An agent write with no `approvalId` is refused even when a permission override lowers the tier.

The main problems are data loss and correctness in recurring-event edits, sync pruning, and how errors are classified:

- An owner edit with "All events" moves the whole series to the occurrence that was clicked.
- A "this and following" split is two non-atomic remote writes, so one failure can delete every future occurrence.
- An unreliable read-only check on iCloud, combined with "403 means auth", lets one failed write pause all iCloud sync.
- An agent's time with no UTC offset is read one way by the approval card and another way by Google, so the owner can approve a different time from the one that gets written.

## Critical Issues

### CR-A01: Editing a recurring event with scope "all" moves the series start to the clicked occurrence

**File:** `src/server/calendar/events.ts:56-72, 115-128` (with `src/server/calendar/google/provider.ts:85-100`, `src/server/calendar/recurrence-edit.ts:131-135`)
**Issue:** The owner EventDialog fills the form from the clicked occurrence (`initial(inst)` uses `inst.start`/`inst.end`) and sends those times to `updateEventAction`. For `scope: "all"`, `toWrite` passes `input.start`/`input.end` through unchanged:
- Google: `googlePlan` PATCHes the master with `start`/`end` set to that occurrence.
- CalDAV: `icsApply` calls `applyFields(master, …)`, which rewrites DTSTART/DTEND.

So changing only the title of the 5th occurrence and choosing "All events" makes the 5th occurrence the new series start. Every earlier occurrence disappears from the provider. On a COUNT series the end also moves later. Existing EXDATEs and overrides keep pointing at the old start. The agent path has a milder form of this: `load()` uses the master's times for `scope: "all"`, but if the model sends a `start` taken from a `list_events` occurrence, the series moves too. The approval card does show the before/after.
**Fix:** In `updateEvent` (the shared write service, so both callers are covered), when the event is recurring, `scope === "all"` and `instanceStart` is set, apply the user's change as a delta from the occurrence onto the master:
```ts
if (args.scope === "all" && s.event.recurrence?.length && args.instanceStart && !w.allDay) {
  const delta = Date.parse(w.start) - Date.parse(args.instanceStart);
  const dur = Date.parse(w.end) - Date.parse(w.start);
  const ms = s.event.startAt!.getTime() + delta;
  w.start = new Date(ms).toISOString();
  w.end = new Date(ms + dur).toISOString();
} // same in whole days for all-day using startDate
```
Add a test: a weekly series, edit the title of the 3rd occurrence with scope "all", and assert the master DTSTART/start has not changed.

### CR-A02: "This and following" is two non-atomic remote writes; a failed second write deletes the future of the series

**File:** `src/server/calendar/google/provider.ts:177-219` (ops from `src/server/calendar/recurrence-edit.ts:209-219`); `src/server/calendar/caldav/provider.ts:159-181`
**Issue:** For `scope: "following"` + update, the master is first truncated (Google PATCH with `UNTIL`, CalDAV PUT of `r.updated`), then the new series is created (Google POST, CalDAV `put`). If the second call fails (timeout, 5xx, rate limit, process crash), the original series has already lost every occurrence after the split and no continuation exists. `run()`/`write()` throw before returning `upserts`, so `apply()` never runs and the local DB still shows the old series, which hides the loss. A retry cannot recover: the master's etag has changed, so `updateEvent` returns `changed`, and the adopt branch in `calendar.update_event` is limited to `scope === "all"`. The owner then has to rebuild the rest of the series by hand.
**Fix:** Create the new series first, then truncate the master. A failure then leaves at worst a duplicated tail, which is recoverable, instead of a lost one. If the truncation fails after the create succeeded, delete the new series as compensation. Use a deterministic id for the new series (Google `lifeos<approvalId>f`, CalDAV `${approvalId}-f@lifeos`) so a retry adopts it the same way `create` does. Either way, persist the partial results with `apply()` in a `finally` so the cache matches the remote.

### CR-A03: One failed write to a read-only iCloud calendar pauses all iCloud sync

**File:** `src/server/calendar/caldav/provider.ts:41-43, 96, 189`; `src/server/calendar/events.ts:87-94`
**Issue:** `realDav` admits it cannot detect read-only calendars (`readOnly` matches only projected props, which tsdav never fills). As a result, shared and read-only iCloud calendars are reported as `access: "owner"`, `kind: "owned"`. `refreshCalendarList` then enables them as `personal`, and they can be picked as `isDefault` or as the agent's default write target. A write to such a calendar returns 403. `statusError(403)` maps that to `kind: "auth"`, and `events.ts guard()` then calls `markCalendarError(…, "Access was rejected.")`. That sets the connection to `status: "error"`, so `sync.run` skips it (`paused`) until the owner reconnects. One rejected write to a shared calendar silently stops all iCloud syncing.
**Fix:** Treat 403 on a write as `client` (permission), not `auth`. Only 401 should pause the connection:
```ts
if (status === 401) return fail("auth", status);
if (status === 403) return fail("client", status); // read-only / forbidden resource
```
Also map the shared-calendar case properly: request `DAV:current-user-privilege-set` in `fetchCalendars` (`props`) or flag calendars whose owner principal differs, so shared calendars are `reader` and never default targets.

### CR-A04: Agent event times without a UTC offset are read differently by the approval card and by Google

**File:** `src/lib/event-payload.ts:6-7` (used by `src/server/agents/tools/calendar.ts:169-198, 243-291`); `src/server/calendar/google/provider.ts:82-83`
**Issue:** `start`/`end` are `z.string()`. The tool description asks for "ISO instants with offset", but nothing enforces it. For `"2026-10-15T09:00:00"`:
- The approval card (`approvalSummary` → `new Date(p.start)`) and `checkRange` parse it as server-local time, which is UTC in the container. The owner sees and approves "Thu 15 Oct 20:00".
- Google gets `{ dateTime: "2026-10-15T09:00:00", timeZone: "Australia/Sydney" }` and creates the event at 09:00 Sydney.
- CalDAV (`timeProp` → `new Date(value)`) creates it at 20:00.

The executed action does not match what was approved, which breaks the approval contract. Bad all-day values are also accepted: `allDay` start/end are never checked against `YYYY-MM-DD`, and an ISO date-time is silently sliced.
**Fix:** Validate the format at the shared schema, depending on `allDay`:
```ts
const instant = z.iso.datetime({ offset: true });
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
// in checkRange: if (!(v.allDay ? date : instant).safeParse(v.start).success) ctx.addIssue(...)
```
Alternatively, normalise `start`/`end` to `new Date(x).toISOString()` in `resolve()` before the approval payload is stored, so the stored value, the card and the provider all use the same instant.

## Warnings

### WR-A01: Google incremental sync never removes or moves events edited to a time outside the sync window

**File:** `src/server/calendar/google/provider.ts:75-79, 119-134`
**Issue:** `fetchAll` drops changed events for which `outside(n, window)` is true. They are neither upserted nor deleted. In incremental mode, an event moved from next week to 18 months out (or into the past beyond 30 days) keeps its old local row and still shows at the old time, counting toward conflicts and free slots until the next full resync.
**Fix:** In `fetchAll`, when `outside(n, window)` is true, push `e.id` to `deletes` instead of skipping it.

### WR-A02: Truncated fetches combined with `reset: true` delete real events locally; Google truncation also drops the sync token for good

**File:** `src/server/calendar/google/client.ts:106-120`; `src/server/calendar/caldav/provider.ts:101, 199-209`; `src/server/calendar/sync.ts:85`
**Issue:**
- `paginate` stops at 40 pages without signalling it. A full Google sync has no `timeMin` and uses `showDeleted=true`, so a calendar with more than 10,000 items (cancelled items included) is cut short. `nextSyncToken` only arrives on the last page, so `cursor` is saved as `null`.
- Every 5-minute run then does another 40-page full sync. `reset: true` deletes every local row that falls past page 40.
- CalDAV has the same problem: `.slice(0, MAX_OBJECTS)`, plus objects skipped as oversized or unparseable, are absent from `upserts` and get deleted by `reset`, and only a warning is logged. Events that really exist vanish from the schedule, conflicts and free slots.

**Fix:** Have `paginate` return `truncated: true` when it hits the page limit. The providers should then return `reset: false` and keep the old cursor. Add the remote ids of skipped CalDAV objects to a "keep" set so `reset` does not delete their existing rows. Add `timeMin` to Google full syncs; it is allowed when there is no `syncToken`.

### WR-A03: An empty or partial calendar list from the provider wipes the owner's calendar settings and cached events

**File:** `src/server/calendar/calendars.ts:23-24`; `src/server/calendar/sync.ts:76`
**Issue:** Every sync calls `refreshCalendarList` with whatever `listCalendars()` returned. It deletes every calendar not in that list, and the delete cascades to events. CalDAV filters on `c.components.includes("VEVENT")`, so a tsdav response with missing `components`, or a transient empty `calendar-home-set`, returns `[]` and deletes every iCloud calendar row. The calendars come back on the next run, but the owner's `enabled`/`category`/`isDefault` choices are reset, and events vanish in the meantime.
**Fix:** In `sync`, skip the prune when `remote.length === 0`. Treat CalDAV calendars with no `components` as VEVENT-capable. Optionally, prune a calendar only after it has been missing for N consecutive syncs.

### WR-A04: Splitting a series ("following") brings back deleted occurrences in the new series

**File:** `src/server/calendar/recurrence-edit.ts:174-181, 213-218`
**Issue:**
- CalDAV: `icsApply` copies the master into the new series and calls `nm.removeAllProperties("exdate")`, which drops the EXDATEs after the split point as well as the ones before it.
- Google: `googlePlan` creates the new series with `recurrence: [RRULE:…]` only. Cancelled-instance exceptions belong to the old master id, and EXDATE lines are discarded.

Occurrences the owner had deleted after the split point come back in the new series.
**Fix:** Carry over EXDATEs (and, for Google, the `originalStart` of cancelled overrides) at or after the split key, rebased to the new series. Drop only the ones before the split.

### WR-A05: Google "all" scope with a simple repeat value overwrites the whole recurrence array

**File:** `src/server/calendar/google/provider.ts:95-98`
**Issue:** When `repeat !== "keep"`, `bodyFor` sets `b.recurrence = [RRULE:…]`. That replaces every `EXDATE`/`RDATE` line Google stored with the master, which is common for imported series. `repeatOf` in the dialog looks only at the RRULE, so a weekly series with EXDATEs shows as "weekly" and gets its exclusions erased on any "all" edit, even a title-only one.
**Fix:** Keep the non-RRULE lines: `b.recurrence = [...(ev.recurrence ?? []).filter(l => !/^RRULE:/i.test(l)), ...(rule ? [`RRULE:${rule}`] : [])]`. This means passing the stored recurrence into `bodyFor`. Or send `repeat: "keep"` when the rule did not change.

### WR-A06: The `approval.edit` audit stores the full event text

**File:** `src/server/agents/approvals.ts:96, 125`
**Issue:** `aud(h, "approval.edit", id, { original: orig, edited: parsed.data })` was written for issues. It now runs for calendar payloads, so the event title, the description (up to 8000 chars), the location and the `before` snapshot all go into `audit_log.metadata`. This breaks T-04-40 ("no event text in audit metadata"), which `events.ts` follows correctly.
**Fix:** For `approvalKind(cur.tool) !== "issue"`, record only the edited field names, `{ approvalId: id, changed: Object.keys(parsed.data).filter(k => stable(orig[k]) !== stable(parsed.data[k])) }`, and no values.

### WR-A07: Owner calendar-settings writes are not audit-logged

**File:** `src/server/calendar-settings-actions.ts:44-80`; `src/server/calendar/calendars.ts:34-62`
**Issue:** `setCalendarEnabled` (which deletes every cached event of that calendar), `setCalendarCategory` and `setDefaultCalendar` write without an audit row. Connect and disconnect are audited. The project rule is that owner UI writes run directly and are audit-logged.
**Fix:** Add an `aud(h, "calendar.settings", id, { field, value })` call (ids and enums only) to each of the three functions, in the same style as `connections.ts`.

### WR-A08: The CalDAV ctag short-circuit freezes the sliding sync window

**File:** `src/server/calendar/caldav/provider.ts:195`
**Issue:** When the ctag is unchanged, sync returns early. But the window is time-based (`now - 30d .. now + 365d`). Events that enter the 365-day horizon are never fetched, and events that leave the past window are never pruned, until something in that calendar changes. On a quiet calendar, distant events (yearly ones, for example) can be missing for months.
**Fix:** Also store the window start date (or the last full fetch date) and force a full fetch once a day even when the ctag matches.

## Info

### IN-A01: Google `occurrencesBefore` ignores EXDATEs when counting COUNT

**File:** `src/server/calendar/google/provider.ts:103-109`
**Issue:** `before()` counts occurrences with `expand()`, which drops EXDATE'd occurrences. Under RFC 5545, excluded occurrences still use up COUNT, so the new series gets too many occurrences. `icsApply` counts with the raw iterator, which is correct, so the two providers disagree.
**Fix:** Count with `ICAL.Recur.iterator` as `icsApply` does, or pass `lines: []` when expanding for the count.

### IN-A02: Disconnecting Google does not revoke the refresh token

**File:** `src/server/calendar/connections.ts:54-57`
**Issue:** The encrypted secret is deleted locally, but the refresh token stays valid at Google until the owner revokes it by hand.
**Fix:** Before deleting, decrypt the secret and POST to `https://oauth2.googleapis.com/revoke` (best effort, fixed host).

### IN-A03: iCloud update/delete overwrites blindly when the stored etag is null

**File:** `src/server/calendar/caldav/provider.ts:105-106, 172, 176`
**Issue:** `etag ?? undefined` sends no `If-Match`, so concurrent remote edits are overwritten without a 412.
**Fix:** Refuse the write (or re-fetch first) when `ev.etag` is null.

### IN-A04: The blocked-run message for private calendar data talks about private repos

**File:** `src/server/agents/loop.ts:243`
**Issue:** A run tainted by `taintByTool` (calendar or tasks) that is pinned to free fails with "This run needs private-repo data…". The free-model opt-in (`getFreePrivateOk`) also unlocks calendar data, which the setting's wording doesn't make clear.
**Fix:** Use a generic message ("private calendar or repo data"), or a separate opt-in for calendar data.

### IN-A05: An agent `instanceStart` that isn't an exact string match fails confusingly

**File:** `src/server/agents/tools/calendar.ts:232-238`
**Issue:** `x.instanceStart === instanceStart` is plain string equality. `"…T08:00:00Z"` and `"…T08:00:00.000Z"` don't match, which gives "occurrence no longer exists". An unparseable value makes `new Date(NaN)` reach `sydneyYmd`, which can throw a RangeError that surfaces as "Tool failed".
**Fix:** Compare normalised values (`Date.parse` for instants, a `YYYY-MM-DD` regex for dates) and reject NaN with a `ToolError`.

### IN-A06: A CalDAV "this" override is created without the master's other properties

**File:** `src/server/calendar/recurrence-edit.ts:145-152`
**Issue:** The new RECURRENCE-ID VEVENT carries only UID, RECURRENCE-ID and the edited fields. VALARMs, ORGANIZER/ATTENDEE, URL and CATEGORIES are lost for that occurrence, so editing a title drops its reminder.
**Fix:** Clone the master VEVENT, remove RRULE/RDATE/EXDATE, set RECURRENCE-ID, then apply the fields.

### IN-A07: Google 403 "insufficientPermissions" never prompts a reconnect

**File:** `src/server/calendar/google/client.ts:89-100`
**Issue:** If the owner removes a granted scope from their Google account settings, the 403 is classified as `client`. Sync then reports "Sync failed. Retrying in 5 minutes." indefinitely instead of pausing with a reconnect prompt.
**Fix:** Map `reason === "insufficientPermissions"` or `"forbidden"` on calendarList or the events list to `auth`.

---

_Reviewed: 2026-10-12_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

# Part B


# Phase 4 (Part B: UI): Code Review Report

**Reviewed:** 2026-10-12
**Depth:** standard
**Files Reviewed:** 33
**Status:** issues_found

## Narrative Findings (AI reviewer)

## Summary

I reviewed the Phase 4 UI: the Organization page (grid, month view, event and task dialogs, plan and tasks cards), the Settings calendar connections, the event approval views, and the AI panel and palette additions. I traced the key data paths into `src/server/calendar/queries.ts`, `expand.ts`, `calendar-actions.ts`, `sync.ts` and `palette-actions.ts`.

**Security looks sound:**
- Untrusted calendar text is only rendered as React text.
- Event `location` becomes a link only when `isSafeUrl` passes (https, no credentials, no control characters).
- Approval locations and descriptions are plain text.
- The "View in calendar" href is checked against a UUID pattern.
- Result-card and palette hrefs are built on the server from validated ids.
- The iCloud app password is cleared from React state before the server action is awaited.
- No `dangerouslySetInnerHTML` was found.

**The serious problems are in the recurring-event edit flow:**
- The DTO `rrule` is already humanised on the server and then humanised again on the page. As a result the repeat UI is broken for every recurring event.
- "Reload event" after a conflict loads the series master's start and end into the form for a single occurrence. Saving then moves that occurrence.

**Warnings cover:**
- Scroll position resetting on every refresh.
- Overnight events that silently disappear from the grid.
- "Sync now" reporting success when the job was only queued.
- Unhandled server-action rejections that leave buttons stuck.
- Duplicate task submits.
- Optimistic task state that never reconciles with the server.
- Palette scope that stays set after results are gone.
- Render-time `.parse` calls that can throw.

## Critical Issues

### CR-B01: `rrule` is humanised twice, so the repeat UI is broken for every recurring event

**File:** `src/app/(os)/organization/page.tsx:26`, `src/organization/event-dialog.tsx:57-69` (`repeatOf`), `src/organization/event-dialog.tsx:83` (`initial`); root at `src/server/calendar/queries.ts:105`
**Issue:** `loadInstances` already sets `rrule: i.rrule ? humanRule(i.rrule) : null`, so `InstanceDTO.rrule` holds text like `"Repeats weekly on Tuesday"`, not an RRULE. Two things break as a result:
1. `page.tsx:26` calls `humanRule(i.rrule)` again. Splitting the human text on `;`/`=` gives no `FREQ`, so `repeatText` is always the generic `"Repeats"`. The detail sheet never shows the real rule.
2. `repeatOf(inst.rrule, …)` in the event dialog parses the human text as an RRULE. The key `"Repeats weekly on Tuesday"` is not in the allowed list, so it always returns `"custom"`.

The consequences in the edit dialog:
- Every recurring event shows "Custom repeat (edit in Google Calendar or iCloud)".
- The Repeat select is hidden.
- `repeat: "custom"` is always sent, which the server maps to `keep`.
- The user cannot stop a series repeating or change its frequency from LifeOS at all.

`reloadEventAction` returns the raw RRULE. So after a reload, the same event suddenly gets a working Repeat select and sends a concrete `repeat` value instead of `keep`. The edit behaviour is inconsistent.
**Fix:** Keep one representation. Send the raw rule in the DTO and humanise only for display:
```ts
// queries.ts
rrule: i.rrule,           // raw RRULE
// page.tsx (unchanged): repeatText = i.rrule ? humanRule(i.rrule) : null
```
Then grep for other `InstanceDTO.rrule` consumers (agents/tools) that may rely on the human form and give them `humanRule(...)` explicitly.

### CR-B02: "Reload event" on a recurring occurrence loads the series master's times, and saving moves the occurrence

**File:** `src/organization/event-dialog.tsx:227-237`
**Issue:** `reload()` calls `reloadEventAction(instance.eventId)`, which returns the stored row's `startAt`/`endAt` (or `startDate`/`endDate`). For a recurring instance that row is the series master, so these are the first occurrence's times. The dialog merges them over the instance (`{ ...instance, ...r }`) and resets both `base` and `f`, so the form now shows the master's date. If the user then changes the title and saves with scope "This event", `payload()` sends the master's start and end together with `instanceStart`. The occurrence is moved to the series' first date. That is silent data corruption on the provider calendar.
**Fix:** For recurring instances, keep the instance's own times and refresh only the etag and the non-time fields. Alternatively, have the server return the occurrence identified by `instanceStart`:
```ts
const next = {
  ...initial({ ...instance, title: r.title, location: r.location, description: r.description, free: r.showAs === "free",
    ...(instance.recurring ? {} : { start: r.start, end: r.end, allDay: r.allDay, startDate: r.allDay ? r.start : null, endDate: r.allDay ? r.end : null }) } as OrgInstance, undefined, ""),
  calendarId: instance.calendarId,
};
```
A better option is to add an `instanceStart` argument to `reloadEventAction` and expand the series server-side.

## Warnings

### WR-B01: Time grid jumps back to "now" on every refresh

**File:** `src/organization/time-grid.tsx:75-81`
**Issue:** The initial-scroll effect depends on `[days, today, startHour, nowMs]`. `days` (`data.range.days`) is a new array and `nowMs` is a new value after every `router.refresh()`. That covers the 5-minute interval, every `calendar`/`task` live event, and every save. The effect therefore re-runs and sets `scrollTop` again, which contradicts the "keeps scroll and focus" intent stated at `organization-view.tsx:148`. A user looking at the evening is yanked back to the current time whenever anything syncs.
**Fix:** Scroll once per date range. Use a stable key such as `const rangeKey = days[0] + days.length` and a ref:
```ts
const scrolledFor = useRef<string | null>(null);
useEffect(() => { const k = `${days[0]}:${days.length}:${startHour}`; if (scrolledFor.current === k) return; scrolledFor.current = k; /* scroll */ }, [days, startHour, today, nowMs]);
```

### WR-B02: Overnight events that end before 07:00 vanish from the grid with no "earlier" indicator

**File:** `src/organization/layout.ts:29`, `src/organization/layout.ts:83-85`
**Issue:** Take an event from 22:00 to 06:00 on the next day:
- `blockGeometry` sets `startsBefore = true`, so `sh = 0` and `eh = 6`. The condition `eh <= startHour && sh < eh` makes it return `null`, so the event is hidden.
- `earlierCount` requires `ymdOf(start) === ymd`, so the event is not counted either.

On the second day the event is invisible and the "N earlier" pill is missing, so the user cannot reveal it.
**Fix:** Count any timed event that touches the day and ends at or before `START_HOUR` on that day:
```ts
items.filter((i) => !i.allDay && ymdOf(new Date(i.end)) === ymd && hourOf(new Date(i.end)) <= START_HOUR).length
```
(The callers already pre-filter with `touches`.)

### WR-B03: "Sync now" reports success when the job is only queued, and the error banner never clears

**File:** `src/organization/header.tsx:60-70,133`, `src/organization/organization-view.tsx:192-199`, `src/settings/calendar-connection-row.tsx:73-81`
**Issue:** `syncCalendarsNowAction` only enqueues a job and returns `{ ok: true }` (see `calendar-actions.ts:126-134`). Two problems follow:
- The header announces "Calendar synced" and the Settings row sets `done = "Calendar synced"` and calls `router.refresh()` immediately. All of this happens before the sync has run, so the refresh shows the old data.
- The sync worker only calls `notifyLive("calendar")` when `changed > 0` (`sync.ts:109-112`). A sync that fixes a previous error but finds no event changes clears `lastError` in the database, but the Organization page's "Calendar data couldn't be refreshed" banner stays up until the 5-minute poll.

**Fix:**
- Change the copy to "Sync started".
- Have the worker call `notifyLive(h, "calendar", id)` whenever the connection's error or `lastSyncAt` state changed, not only when events changed.
- Alternatively, have the client poll `router.refresh()` a few seconds after enqueueing.

### WR-B04: `?new=event` with no writable calendar is a no-op, because the `push` is overridden by `replace`

**File:** `src/organization/organization-view.tsx:90-93,97-105`
**Issue:** When `data.calendars.length === 0`, `onNewEvent()` calls `router.push(CONNECTIONS)`. The effect then immediately calls `router.replace('/organization?...')` in the same tick. The last navigation wins, so the palette's "New event" command leaves the user on Organization with no dialog and no explanation.
**Fix:** Return early when redirecting:
```ts
if (newParam === "event" && data.calendars.length === 0) return router.push(CONNECTIONS);
```

### WR-B05: Server-action rejections leave UI stuck in a busy state (several components)

**File:**
- `src/organization/plan-card.tsx:62-81`
- `src/organization/task-dialog.tsx:61-94`
- `src/organization/tasks-card.tsx:48-74`
- `src/organization/event-dialog.tsx:227` (`reload`)
- `src/approvals/approval-detail.tsx:146-150`
- `src/settings/calendar-connection-row.tsx:83-90`

**Issue:** These handlers `await` server actions without `try`/`catch`/`finally`. A network failure, deploy skew or a `requireOwner` redirect throws. The effects:
- `busy` stays set, so spinners and disabled buttons never recover.
- The rejection is unhandled.
- In `quickAdd`, the typed title is lost because `setTitle("")` runs before the await.
- In `EventApprovalShell.guard`, all decision buttons stay disabled.

`event-dialog.tsx` `save`/`DeleteFlow.run` and `icloud-form.tsx` show the correct pattern.
**Fix:** Wrap each call: `try { r = await fn(); } catch { r = { ok: false } } finally { setBusy(null) }`, and restore any input you cleared optimistically.

### WR-B06: TaskDialog ignores the result of `toggleTaskAction`

**File:** `src/organization/task-dialog.tsx:78`
**Issue:** `if (task && done !== !!task.completedAt) await toggleTaskAction(task.id, done);` discards the result. If the update succeeds but the toggle fails, the user sees "Task saved" and the completion change is silently lost.
**Fix:** Check `r.ok`. On failure, toast "Saved, but couldn't change completion" and keep the dialog open.

### WR-B07: TaskDialog can submit twice (duplicate tasks)

**File:** `src/organization/task-dialog.tsx:61,205`
**Issue:** Pressing Enter in the form triggers the hidden `<button type="submit" hidden />`, which is never disabled. `submit()` does not check `busy`. Pressing Enter twice during the round-trip creates two tasks. `EventDialog` avoids this because its only submit button is disabled while loading.
**Fix:** Add `if (busy) return;` at the top of `submit`, or set `disabled={busy}` on the hidden submit button.

### WR-B08: TasksCard optimistic state is never reconciled with the server

**File:** `src/organization/tasks-card.tsx:33,41,51-52`
**Issue:** `optimistic[t.id]` overrides `t.completedAt` forever. After a refresh, a server-side change wins nothing. For example, if the AI reopens a task or the task is toggled on another device, the card keeps showing the stale optimistic value until it remounts. Separately, the 4-second collapse `setTimeout` is never cancelled. If you complete, reopen, then complete again, the task collapses immediately, and the timer fires after unmount.
**Fix:**
- Drop the optimistic entry once the server confirms: on `r.ok`, `setOptimistic(({ [t.id]: _, ...o }) => o)` before `router.refresh()`.
- Alternatively, reset `optimistic` when the `tasks` prop identity changes.
- Track the collapse timers in a ref and clear them on reopen and unmount.

### WR-B09: Palette scope persists after results disappear, which hides Commands and Jump to

**File:** `src/shell/palette.tsx:33,49,106,140`
**Issue:** Tab sets `scope` to `"events"` or `"tasks"`, but nothing resets it:
- If the user then edits the query below 2 characters, or to a query with no hits, `hasData` becomes false but `scope` stays.
- `buildPalette` then drops the Commands and Jump to groups, so typing "sett" shows only the Ask row.
- The footer hint disappears, so the user cannot cycle back.

There are two related problems:
- `onChange` computes `setSel` with `scope` but without `data`, so `noMatch` is wrong whenever a scope is active.
- `data` from a previous query is shown during the 200 ms debounce for the next one, so Enter can open a stale hit.

**Fix:** Reset the stale state when the query changes:
```ts
onChange={(e) => { setQuery(e.target.value); setScope("all"); setData(undefined); ... }}
```

### WR-B10: `issueOf` uses `.parse` during render, so a malformed payload crashes the approvals page and the AI panel

**File:** `src/approvals/approval-detail.tsx:24-28`; used in `src/shell/ai/approval-card.tsx:28,87`
**Issue:** `issuePayloadSchema.parse` throws during render. One legacy or malformed `issue` approval row takes down the whole Approvals view, or the whole chat transcript in the AI panel. There is no error boundary around it.
**Fix:** Use `safeParse` and fall back to a minimal "This request can't be displayed" body. Alternatively, validate payloads in `toApprovalDTO`.

### WR-B11: Keyboard focus is lost when navigating the month or time grid

**File:** `src/organization/organization-view.tsx:229-230`, `src/organization/month-grid.tsx:61-62`
**Issue:** `go()` runs inside `startNav`, and while `navPending` the body is replaced by `<Skeleton>`. This unmounts `MonthGrid`/`TimeGrid`. So PageUp/PageDown in the month grid, Enter on a day header, or `[`/`]` drop focus to `<body>`, and the roving-tabindex position is lost. Screen-reader and keyboard users must tab back in from the top of the page.
**Fix:**
- Keep the grid mounted with `aria-busy` and dimming (TimeGrid already supports `pending`) instead of swapping in the skeleton.
- Alternatively, restore focus to the `gridRef` region and the selected cell after `navPending` turns false.

### WR-B12: CalendarList optimistic revert can clobber a concurrent change

**File:** `src/settings/calendar-list.tsx:27-39`
**Issue:** `change()` captures `before = rows` from the render closure and, on failure, calls `setRows(before)`. Suppose two quick edits are made, for example unticking Sync on calendar A and then changing the category of calendar B, and the first call fails. The revert restores the snapshot taken before both edits, which wipes B's successful optimistic state. It also applies `patch(rows)` to a stale closure rather than the latest state.
**Fix:**
- Apply the patch with a functional updater: `setRows((r) => patch(r))`.
- On failure, revert only the affected row: `setRows((r) => r.map((c) => (c.id === id ? before.find((b) => b.id === id)! : c)))`.

## Info

### IN-B01: `ScopeDialog.firstInstance` is always `false`

**File:** `src/organization/event-dialog.tsx:240,395`, `src/organization/scope-dialog.tsx:15-25`
**Issue:** Both callers hard-code `firstInstance={false}`, so "This and following" is always offered. The server folds this into "all" (`recurrence-edit.ts:129,202`), so the prop is dead and its doc comment is misleading.
**Fix:** Delete the prop, or pass `instance.instanceStart === <series first>` from the DTO.

### IN-B02: The event detail drops the end date of multi-day all-day events

**File:** `src/organization/event-detail.tsx:32-34`
**Issue:** `${shortDate(inst.start)} · All day` shows only the first day of a multi-day all-day event. The approval view already has a correct `whenText` (`event-approval.tsx:46-56`).
**Fix:** Reuse `whenText(inst.startDate!, inst.endDate!, true)` for all-day events.

### IN-B03: A zero-length event before 07:00 renders at 07:00 and is also counted as "earlier"

**File:** `src/organization/layout.ts:29`
**Issue:** When `sh === eh < startHour`, the `sh < eh` guard fails. The block is drawn at the top of the 07:00 row with the wrong time position, and it is also counted by `earlierCount`.
**Fix:** Use `if (eh <= startHour && sh < startHour) return null;`.

### IN-B04: A state updater mutates the previous Set

**File:** `src/organization/tasks-card.tsx:52`
**Issue:** `setCollapsed((c) => (c.delete(t.id), new Set(c)))` mutates the existing state object, and updaters run twice in StrictMode.
**Fix:** Use `setCollapsed((c) => { const n = new Set(c); n.delete(t.id); return n; })`.

### IN-B05: The sync error banner shows raw provider/internal error text

**File:** `src/organization/organization-view.tsx:308`
**Issue:** `why={state.lastError…}` renders whatever was stored as the error. That contradicts the "fixed, provider-agnostic copy" rule that `ErrorNote` follows in `event-dialog.tsx`. It is not XSS, because it is rendered as React text.
**Fix:** Map `lastError` to a fixed set of messages.

### IN-B06: iCloud "invalid" error uses the "couldn't reach" copy

**File:** `src/settings/icloud-form.tsx:11`
**Issue:** An `invalid` result (a bad Apple ID format, for example) tells the user that iCloud is unreachable.
**Fix:** Add specific copy for `invalid`, such as "Check the Apple ID format."

### IN-B07: Edit → Delete and TaskDialog close discard unsaved edits without asking

**File:** `src/organization/event-dialog.tsx:252-254`, `src/organization/task-dialog.tsx:123,136`
**Issue:**
- "Delete event" inside a dirty edit form replaces the dialog without the discard prompt that `close()` uses.
- TaskDialog's Escape, backdrop click and Cancel close with no dirty check.

**Fix:** Route both through a dirty check, as `EventDialog.close` does.

### IN-B08: The chat ApprovalCard cannot show a stale-target state

**File:** `src/shell/ai/approval-card.tsx:137`
**Issue:** The chat DTOs are built with `targetChanged = null` (`chat.ts:67`, `loop.ts:201`). The card therefore lets the user approve an `event_update`/`event_delete` whose target has changed, while the Approvals detail view blocks it (`approval-detail.tsx`, `stale`). The server's etag check catches it, but only after the user approves.
**Fix:** Compute `targetChanged` for chat DTOs, or link to the detail view for event kinds.

### IN-B09: Result-card items use index keys

**File:** `src/shell/ai/result-card.tsx:21`
**Issue:** `key={i}` on streamed or replaced item lists can reuse DOM nodes and focus across different items.
**Fix:** Use `key={it.href + it.title}` or an id from the DTO.

---

_Reviewed: 2026-10-12_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

# Part C


# Phase 4 (part C): Code Review Report

**Reviewed:** 2026-10-12
**Depth:** standard
**Files Reviewed:** 23
**Status:** issues_found

## Summary

Scope: shared contracts, schema and migration 0003, tasks and reminders, live hub, worker jobs, palette search, and env (diff `aec7ff3..HEAD`).

These parts hold up:
- All task and palette server actions call `requireOwner()` before doing anything, and outside the try/catch, so `redirect()` still propagates.
- The reminder claim is a single atomic `UPDATE ... RETURNING`, so it cannot double-fire across overlapping jobs.
- Hub signal frames are id-only, with the id checked to be a string of 1 to 64 characters.
- Migration 0003 is additive only: new tables, FKs and indexes. The snapshot `prevId` chain is intact.

No blockers. The real defects:
- A claimed reminder is lost silently when the notification write fails.
- A stale reminder fires as soon as a completed task is reopened.
- An empty `GOOGLE_CLIENT_*=` line in `.env` takes down both app and worker.
- `safe-url.ts` is now a binary file to git, which hides its security diff from review.
- Date, time and timezone fields are only loosely validated at the zod trust boundary.

## Warnings

### WR-C01: Claimed reminder is silently lost when the notification write fails

**File:** `src/server/tasks.ts:121-134`
**Issue:** `fireDueReminders` sets `remindedAt` in one statement, outside any transaction, and only then calls `emit(...)` for each claimed row. `emitActivity` (`src/server/events.ts:33-65`) never throws: on any DB error it logs and returns `null`. The return value is ignored here. So a transient failure (pool exhaustion, a deadlock, a 23505 on activity insert) leaves the task marked as reminded with no notification ever created, and the next run never retries it. The same happens if the worker crashes between the claim and the loop. This is at-most-once delivery for the one feature whose whole job is to deliver once.
**Fix:** Claim and emit each row in the same transaction, or un-claim on failure:
```ts
for (const r of claimed) {
  const ok = await emit({...}, {...}, h);
  if (!ok) await h.update(tasks).set({ remindedAt: null }).where(and(eq(tasks.id, r.id), eq(tasks.remindedAt, now)));
}
```
(Better: `h.transaction(tx => claim one row ... FOR UPDATE SKIP LOCKED; emitActivity(..., tx))`, so the claim rolls back with the notification.)

### WR-C02: Reopening a completed task fires a stale reminder straight away

**File:** `src/server/tasks.ts:92-98`, `src/server/tasks.ts:125`
**Issue:** The claim filter excludes `completedAt IS NOT NULL`, so completing a task before its `remindAt` leaves `remindedAt = NULL`. `setTaskCompleted(..., false)` clears `completedAt` but leaves `remindedAt` alone. Within a minute the reminder job claims the row (`remindAt <= now`) and sends "Reminder: X" for a time that may be days old.
**Fix:** When completing, mark the reminder as consumed:
```ts
.set({ completedAt: done ? now : null, ...(done ? { remindedAt: sql`coalesce(${tasks.remindedAt}, ${now})` } : {}), updatedAt: now })
```
Or, on reopen, null out `remindAt` when it is already in the past.

### WR-C03: An empty `GOOGLE_CLIENT_ID=` / `GOOGLE_CLIENT_SECRET=` crashes the app and worker

**File:** `src/server/env.ts:11-12`; `.env.example:34-35`; `docker/compose.yml:7` (`env_file`)
**Issue:** `z.string().min(1).optional()` accepts `undefined` but rejects `""`. With `env_file`, a line like `GOOGLE_CLIENT_ID=` (the convention `TS_AUTHKEY=` uses in the same file) gives the empty string. `env()` then throws "Invalid environment", and every server route and the worker fail to start. These credentials are documented as optional, and an uncommented blank line is the obvious way to "disable" them. Setting only one of the two also passes validation silently; the consumers handle that, but nothing warns.
**Fix:**
```ts
const optional = z.preprocess((v) => (v === "" ? undefined : v), z.string().min(1).optional());
GOOGLE_CLIENT_ID: optional,
GOOGLE_CLIENT_SECRET: optional,
```
`ANTHROPIC_API_KEY` has the same bug and should get the same fix.

### WR-C04: `safe-url.ts` is now a binary file in git (literal control bytes), so its security diff is hidden

**File:** `src/lib/safe-url.ts:20`
**Issue:** The new `isSafeUrl` regex contains the literal bytes NUL, 0x1F and 0x7F (`/[<00>-<1F><7F>]/`) instead of escapes. The runtime behaviour is correct, but:
- `git diff` reports `Binary files ... differ`. This review only recovered the contents with `--text`, so the security-relevant change was invisible in normal diffs and PR review.
- `git ls-files --eol` shows `i/-text`, so the `eol=lf` normalisation was skipped and the file is committed with CRLF line endings.
- `grep` and ripgrep report "Binary file matches" and skip it, so `isSafeUrl` usages no longer show up in searches of this file.
- Any editor or formatter that strips NULs will silently change the regex to something else.

`isSafePath` in the same file already uses the escaped form.
**Fix:** `if (!u || /[\u0000-\u001f\u007f]/.test(u)) return false;`, then re-normalise the file to LF so git treats it as text again.

### WR-C05: Event payload `start`/`end`/`timeZone`/`etag`/`instanceStart` have no format or length checks at the trust boundary

**File:** `src/lib/event-payload.ts:7-9, 30-32, 40-48`
**Issue:**
- `start`/`end` are bare `z.string()`. For `allDay`, `checkRange` only does a lexicographic `v.end <= v.start`, so `start: "a", end: "b"` passes.
- For timed events, anything `Date.parse` accepts passes (e.g. `"1"`, or local-time strings interpreted in the server TZ).
- `timeZone` is an arbitrary unbounded string. It flows into Google `timeZone` and into the iCal DTSTART/DTEND TZID through `recurrence-edit.ts:80-81`, and an invalid zone makes `Intl` throw a `RangeError` later.
- `etag`, `instanceStart` and every field of `before` are unbounded.

These schemas are the validation for LLM-produced approval payloads, for owner-edited approvals, and for `calendar-actions.ts`.
**Fix:**
```ts
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const instant = z.iso.datetime({ offset: true });
start: z.union([instant, ymd]), end: z.union([instant, ymd]),
timeZone: z.string().max(64).refine((tz) => { try { new Intl.DateTimeFormat("en", { timeZone: tz }); return true; } catch { return false; } }, "Unknown time zone.").default("Australia/Sydney"),
etag: z.string().max(512).nullable(), instanceStart: z.string().max(40).nullable(),
```
In `checkRange`, also require `ymd` when `allDay` and `instant` otherwise. Cap the lengths of the `before` fields.

### WR-C06: Task `dueDate` accepts impossible dates, and `remindAt` accepts timezone-less strings

**File:** `src/lib/task-payload.ts:7, 10-14`; `src/server/tasks.ts:23-28`
**Issue:**
- `dueDate` only matches `^\d{4}-\d{2}-\d{2}$`, so `2026-02-31` or `2026-13-45` gets stored as text while `deriveDueAt` → `Date.UTC` rolls over to a different day (`2026-03-03`). The stored `dueDate` and `dueAt` then disagree. Sorting and the "today" filter use `dueAt`, but `dueBody` and the UI show `dueDate`.
- `remindAt` is any string `Date.parse` accepts, unbounded. `"2026-10-13T09:00"` (no offset) is read in the server's TZ (UTC in the container), not Sydney, so a reminder like that fires 10 to 11 hours off. The bundled client always sends `toISOString()`, but the server action is the trust boundary.

**Fix:**
```ts
dueDate: z.iso.date("Enter a valid date.").nullable().default(null),   // rejects 02-31
remindAt: z.iso.datetime({ offset: true, message: "Enter a valid reminder time." }).nullable().default(null),
```

## Info

### IN-C01: Indexes in migration 0003 don't serve `loadInstances` or the reminder scan

**File:** `drizzle/0003_organization.sql:61-68`; `src/server/calendar/queries.ts:72-90`
**Issue:**
- `loadInstances` filters events through a join on `calendars.enabled` and a 5-way `OR`, which includes `jsonb_exists(raw,'ics')`. That branch matches every CalDAV row regardless of date. Neither `(calendar_id, start_at)` nor `(calendar_id, recurring_remote_id)` can be used for this predicate, so it is a full scan, and all iCloud events of all time get expanded on every page load and palette keystroke. Correctness holds today; flagged because the indexes give a false sense that the range query is bounded.
- `tasks_remind_at_index` covers every reminder ever fired. A partial index fits the claim query exactly: `CREATE INDEX ... ON tasks (remind_at) WHERE reminded_at IS NULL AND completed_at IS NULL`.

**Fix:** Bound the CalDAV branch, e.g. masters only (`recurrence IS NOT NULL`), with the start/end columns filled in for single CalDAV events. Switch the remind index to the partial form.

### IN-C02: No uniqueness guarantee for `calendars.is_default`, and no CHECK constraints on enum-like columns

**File:** `drizzle/0003_organization.sql:28-44, 46-59`
**Issue:**
- `setDefault` (`calendar/calendars.ts:51-52`) clears and then sets inside a READ COMMITTED transaction. Two concurrent calls can both commit and leave two defaults, and nothing in the DB prevents it.
- `tasks.priority`, `calendars.access`/`category`/`kind`, `calendar_events.status`/`transparency` are free text or integers with no CHECK. The DTO mappers mask bad values (`toTaskDTO` turns priority 7 into null) rather than rejecting them.

**Fix:**
```sql
CREATE UNIQUE INDEX calendars_one_default ON calendars ((true)) WHERE is_default;
ALTER TABLE tasks ADD CONSTRAINT tasks_priority_chk CHECK (priority IN (1,2,3));
```

### IN-C03: The palette search window is silently clamped, and results favour past events

**File:** `src/server/palette-actions.ts:22`
**Issue:**
- The palette asks for `today-7 .. today+60` (67 days), but `listEvents` clamps to `MAX_RANGE_DAYS = 62` (`queries.ts:25,125-126`), so the last 5 days are never searched.
- `listEvents` sorts by start ascending and then `slice(0, 4)`, so up to 4 matches from last week crowd out upcoming ones.

**Fix:** Use `addDaysYmd(today, 55)`, or export the max-range constant. Sort upcoming events first before slicing.

### IN-C04: Palette task subtitle shows "23:59" for date-only tasks and has no date

**File:** `src/server/palette-actions.ts:241-245`
**Issue:** `dueAt` for a date-only task is 23:59 Sydney, so the subtitle reads "Due Mon 23:59". It also shows only the weekday, which is ambiguous for tasks due more than a week out.
**Fix:** Use `t.dueTime` to decide whether to show a time, and include the day and month. Reusing `dueBody` from `tasks.ts` would do both.

### IN-C05: `handleCalendarSync` has no try/catch, unlike `handleTaskReminders`

**File:** `src/worker/jobs/calendar-sync.ts:6-12`
**Issue:** The code relies on "run() never throws", but `createCalendarSync(...)` construction and the result mapping (`"ok" in v` on an unexpected shape) are unguarded. A throw fails the pg-boss job and triggers retries alongside the next `*/5` schedule.
**Fix:** Wrap the body in try/catch and log `{ err }` only, matching `task-reminders.ts`.

### IN-C06: `vm-db-test.sh` leaves the test Postgres running, and its name is misleading

**File:** `scripts/vm-db-test.sh:7-12`
**Issue:** It reuses `compose.dev.yml` under project `lifeos-test`, but the compose file sets `name: lifeos-dev`. `-p` overrides that, but the volume is still `pgdata-dev` in a different namespace, which is confusing. The DB is never torn down, so data from crashed runs (`lifeos_test_*` DBs left behind when a run fails) builds up.
**Fix:** Add `trap 'docker compose -f docker/compose.dev.yml -p lifeos-test down' EXIT`, or document that the DB is left running on purpose.

---

_Reviewed: 2026-10-12_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
