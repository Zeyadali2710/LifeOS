---
phase: 04-organization
status: all_fixed
findings_in_scope: 54
fixed: 53
skipped: 1
iteration: 1
parts: [A, B, C]
---

# Phase 4 Review Fix

Fixed in three sequential passes, one per review part. Skipped: IN-B05 (not a bug). Partial: IN-C02 (race fixed via advisory lock; unique index deferred to the next migration).

Final checks (local throwaway Postgres): typecheck clean, unit 262/262, DB 216/216, Playwright 74 passed / 16 skipped (project-scoped) / 0 failed.

# Part A


# Phase 4: Code Review Fix Report (Part A: server side)

**Fixed at:** 2026-10-12
**Source review:** .planning/phases/04-organization/04-REVIEW.md (Part A)
**Iteration:** 1

**Summary:**
- Findings in scope: 19
- Fixed: 19
- Skipped: 0

**Verification (final run):** `npx tsc --noEmit` clean; `tests/unit` 33 files / 256 tests passed; `tests/db` 38 files / 209 tests passed. The baseline before the fixes was 246 unit and 206 DB tests. ESLint is clean on the changed files.

## Fixed Issues

### CR-A01: Editing a recurring event with scope "all" moves the series start to the clicked occurrence
**Files modified:** `src/server/calendar/events.ts`, `tests/db/calendar-actions.test.ts`
**Commit:** 46303ac (and acca44e, which removes an unused constant)
**Applied fix:** `updateEvent` (the shared write service) now passes the write through `rebaseSeries()`. When the event is recurring, the scope is "all" and `instanceStart` is set, the change is applied as a delta onto the master start. For timed events the delta is in ms. For all-day events it is in whole days. For an all-day <-> timed switch it is in whole days from the occurrence date to the series date. Regression test: a weekly series edited from its 3rd occurrence keeps its master start, and a 1 h move shifts the master by 1 h.
**Status:** fixed: requires human verification (logic). Known limit: if the clicked occurrence is itself a moved override, the delta is measured from its original slot.

### CR-A02: "This and following" is two non-atomic remote writes
**Files modified:** `src/server/calendar/recurrence-edit.ts`, `src/server/calendar/google/provider.ts`, `src/server/calendar/caldav/provider.ts`, plus tests
**Commit:** c1a8efe
**Applied fix:**
- **Order:** the new series is created first and the master is truncated second. This applies to both Google (`googlePlan` op order) and CalDAV (`write()`).
- **Compensation:** if the truncation fails, the new series is deleted (best effort) and the error is rethrown. At worst this leaves a duplicated tail, never a lost one.
- **Retries:** the continuation id is deterministic per approval (Google `lifeos<approvalId>f`, CalDAV `<approvalId>-f@lifeos`). A retry therefore adopts the continuation: Google on 409 via GET, CalDAV through the existing 412 adopt in `put()`.
- **Google safety guard:** a GET that returns a *cancelled* continuation (one an earlier compensation deleted) aborts before the truncation.
- **Tests:** compensation and adopt on Google; compensation on CalDAV.
**Not done:** `apply()` in a `finally` for partial results. Compensation makes partial results rare, and the next sync reconciles them.

### CR-A03: One failed write to a read-only iCloud calendar pauses all iCloud sync
**Files modified:** `src/server/calendar/caldav/provider.ts`, `tests/unit/caldav-provider.test.ts`
**Commit:** 25d4b41
**Applied fix:** `statusError(403)` and thrown "403/forbidden" transport errors now map to `client`, so only 401 pauses the connection. `realDav` also requests `DAV:current-user-privilege-set` (tsdav's default props plus that one, projected). `readOnlyFrom()` marks a calendar `reader` only when the server reports a privilege set with no write/bind/all privilege. An unknown set stays writable, so a parsing surprise cannot lock the owner out.
**Status:** fixed: requires human verification. The privilege-set parsing has not been run against live iCloud. Check on the VM that shared calendars now show as read-only.

### CR-A04: Agent event times without a UTC offset are read differently
**Files modified:** `src/lib/event-payload.ts`, `tests/unit/approval-kinds.test.ts`
**Commit:** afc55a6
**Applied fix:** `checkRange` (used by `eventFields`, `eventInput`, `eventCreatePayload` and `eventUpdatePayload`) now requires:
- timed start/end: `z.iso.datetime({ offset: true })`, which accepts `Z` or an explicit offset;
- all-day start/end: `YYYY-MM-DD`.

An offset-less agent value is therefore rejected at `resolve()`, before an approval is stored. The owner dialog already sends `toISOString()` values. Format checks on `before`, delete payloads, `timeZone`, `etag` and `instanceStart` are left to WR-C05 as instructed.

### WR-A01: Google incremental sync never removes events moved outside the window
**Files modified:** `src/server/calendar/google/provider.ts`, `tests/unit/google-provider.test.ts`
**Commit:** ba82ab0
**Applied fix:** in `fetchAll`, an event outside the window is now pushed to `deletes`.

### WR-A02: Truncated fetches combined with reset delete real events
**Files modified:** `src/server/calendar/google/client.ts`, `src/server/calendar/google/provider.ts`, `src/server/calendar/caldav/provider.ts`, `src/server/calendar/types.ts`, `src/server/calendar/sync.ts`, plus tests
**Commit:** 899ac40 (the paginate contract test is updated in 19eaa01)
**Applied fix:**
- **Google:** `paginate` returns `truncated`. A truncated events fetch returns `reset: false` and keeps the old cursor. A truncated calendar list throws `unavailable`, so it never prunes.
- **CalDAV:** the 5000-object cap moved into the provider. When truncated, it returns `reset: false` and keeps the old ctag. Unreadable or oversized objects go into a new `SyncResult.keepUrls`, and `sync.ts` never deletes rows whose url is in it.
**Not done:** `timeMin` on Google full syncs. Combining it with sync tokens is a behaviour change on the live calendar, and the truncation guard already prevents the data loss.

### WR-A03: An empty calendar list wipes calendar settings and events
**Files modified:** `src/server/calendar/calendars.ts`, `src/server/calendar/caldav/provider.ts`, plus tests
**Commit:** 3d64ef5
**Applied fix:** `refreshCalendarList` (the shared function) never prunes on an empty list. CalDAV calendars with no reported component set are treated as able to hold events.

### WR-A04: Splitting a series brings back deleted occurrences
**Files modified:** `src/server/calendar/recurrence-edit.ts`, `src/server/calendar/google/provider.ts`, plus tests
**Commit:** 95b627d
**Applied fix:** a new `carriedExdates()` keeps the exclusions at or after the split and rebases them by the edit's time shift.
- **CalDAV:** adds EXDATEs to the new series for the master's EXDATEs and its STATUS:CANCELLED overrides.
- **Google:** builds the continuation's recurrence from:
  - the master's EXDATE lines;
  - its cancelled instances (`GET .../instances?showDeleted=true`, first 4 pages);
  - output written as `EXDATE;TZID=...` lines, the form Google uses.

  If the instances lookup fails, the edit fails before any write.
- **Skipped cases:** the carry is skipped when the edit switches between all-day and timed.
**Status:** fixed: requires human verification (logic, DST edge noted in a `ponytail:` comment).

### WR-A05: Google "all" scope with a simple repeat overwrites the recurrence array
**Files modified:** `src/server/calendar/google/provider.ts`, `tests/unit/google-provider.test.ts`
**Commit:** eaaa3f3
**Applied fix:** `bodyFor` receives the stored recurrence and keeps the non-RRULE lines whenever it sets a new rule. "Does not repeat" still clears the array.

### WR-A06: The approval.edit audit stores the full event text
**Files modified:** `src/lib/approval-kinds.ts`, `src/server/agents/approvals.ts`, `tests/db/approvals.test.ts`
**Commit:** f9adbeb
**Applied fix:** a new `changedKeys()` reuses the key-order-independent `stable` compare. For non-issue kinds, `editMeta()` records only `{ approvalId, changed: [field names] }`. Issue edits are unchanged.

### WR-A07: Owner calendar-settings writes are not audit-logged
**Files modified:** `src/server/calendar/calendars.ts`, `src/server/calendar/connections.ts` (exported `aud`), `tests/db/calendar-settings-actions.test.ts`
**Commit:** 1826142
**Applied fix:** `setCalendarEnabled`, `setCalendarCategory` and `setDefaultCalendar` (on success) write `calendar.settings` audit rows containing `{ calendarId, field, value }` (ids and enums only).

### WR-A08: The CalDAV ctag short-circuit freezes the sliding window
**Files modified:** `src/server/calendar/caldav/provider.ts`, `src/server/db/schema.ts` (comment only), `tests/unit/caldav-provider.test.ts`
**Commit:** 5b3298c
**Applied fix:** CalDAV's otherwise unused `syncCursor` now stores the window day of the last full fetch. An equal ctag short-circuits only on the same day, so a full fetch is forced once a day. No migration was needed.

### IN-A01: Google occurrencesBefore ignores EXDATEs when counting COUNT
**Files modified:** `src/server/calendar/google/provider.ts`, `tests/unit/google-provider.test.ts`
**Commit:** 6843136
**Applied fix:** `before()` now expands only the RRULE line, so EXDATE'd occurrences still use up COUNT. This matches `icsApply`.

### IN-A02: Disconnecting Google does not revoke the refresh token
**Files modified:** `src/server/calendar/connections.ts`, `tests/db/calendar-store.test.ts`
**Commit:** b53afc2
**Applied fix:** `removeCalendarConnection` POSTs the refresh token to the fixed host `https://oauth2.googleapis.com/revoke` before deleting the connection. The call has a 5 s timeout and never throws: failures are only logged, without the token, and never block the disconnect.

### IN-A03: iCloud update/delete overwrites blindly when the stored etag is null
**Files modified:** `src/server/calendar/caldav/provider.ts`, `tests/unit/caldav-provider.test.ts`
**Commit:** 371eb2a
**Applied fix:** when the stored etag is null, the provider re-fetches the object. It uses the server's etag only if the content equals the stored ICS. Otherwise, or if the server gives no etag, it refuses with `conflict`.

### IN-A04: The blocked-run message talks about private repos only
**Files modified:** `src/server/agents/loop.ts`, `src/server/agents/tools/delegate.ts`
**Commit:** ed371d0
**Applied fix:** the message now reads "private data (private repos, calendar or tasks)". The Settings toggle wording is UI (Part B) and was not changed.

### IN-A05: An agent instanceStart that isn't an exact string match fails confusingly
**Files modified:** `src/server/agents/tools/calendar.ts`, `tests/db/calendar-tools.test.ts`
**Commit:** d0dcf36
**Applied fix:** `load()` rejects an unparseable value with a clear `invalid_input` ToolError. It normalises timed values to `toISOString()` (dates stay `YYYY-MM-DD`) before matching, and stores the normalised value in the payload.

### IN-A06: A CalDAV "this" override is created without the master's other properties
**Files modified:** `src/server/calendar/recurrence-edit.ts`, `tests/unit/recurrence-edit.test.ts`
**Commit:** 351982d
**Applied fix:** a new override is a deep clone of the master VEVENT with RRULE/RDATE/EXDATE removed. RECURRENCE-ID is then added and the edited fields applied, so VALARM and X- props survive.

### IN-A07: Google 403 insufficientPermissions never prompts a reconnect
**Files modified:** `src/server/calendar/google/client.ts`, `tests/unit/google-client.test.ts`
**Commit:** 19eaa01
**Applied fix:** a 403 with reason `insufficientPermissions` now maps to `auth`. A plain `forbidden` 403 deliberately stays `client`: it is what a write to a read-only calendar returns, and mapping it to `auth` would bring back the CR-A03 problem.

---

_Fixed: 2026-10-12_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_

# Part B


# Phase 4: Code Review Fix Report (Part B: UI)

**Fixed at:** 2026-10-12
**Source review:** .planning/phases/04-organization/04-REVIEW.md (Part B)
**Iteration:** 1

**Summary:**
- Findings in scope: 23
- Fixed: 22
- Skipped: 1 (IN-B05, not a bug)

**Verification (final run):**
- `npx tsc --noEmit`: clean.
- ESLint: clean on every changed `.ts`/`.tsx` file.
- `tests/unit`: 33 files, 258 tests passed. Part A ended at 256; this run adds 2 layout tests.
- `tests/db`: 38 files, 211 tests passed. Part A ended at 209; this run adds 2 tests, for CR-B01 and CR-B02.
- Playwright (`organization`, `settings`, `palette` and `agents` specs, desktop and mobile): 24 passed, 4 skipped. The skips are the specs' own conditional skips.

## Fixed Issues

### CR-B01: rrule is humanised twice
**Files modified:** `src/server/calendar/queries.ts`, `src/lib/calendar-types.ts`, `src/organization/event-dialog.tsx`, `tests/db/calendar-queries.test.ts`
**Commit:** 208d020
**Applied fix:**
- **DTO:** `loadInstances` now returns the raw RRULE, and the `InstanceDTO.rrule` field is documented as raw. `page.tsx` already humanises it for `repeatText`, so the detail sheet shows the real rule, and `repeatOf` in the dialog now parses a real RRULE.
- **No other consumers:** I checked for other readers of the human form. The agent `list_events` tool, the palette and `events.ts` never read `rrule`.
- **Repeat select:** in the dialog, a recurring event whose Repeat select is left unchanged is sent as `custom`, which the server maps to `keep`. The stored rule (UNTIL, COUNT, EXDATE) is therefore rewritten only when the owner actually changes Repeat.
- **Test:** a DB test checks that instances carry `FREQ=DAILY;COUNT=3`.
**Status:** fixed: requires human verification. Logic change: the Repeat select now appears for simple recurring series.

### CR-B02: Reload on a recurring occurrence loads the master's times
**Files modified:** `src/server/calendar/queries.ts` (new `occurrenceOf`), `src/server/calendar-actions.ts`, `src/organization/event-dialog.tsx`, `src/server/agents/tools/calendar.ts`, `tests/db/calendar-actions.test.ts`
**Commit:** 558f45d
**Applied fix:**
- **Server:** `reloadEventAction(id, instanceStart?)` now expands the series on the server. For an occurrence it returns that occurrence's start and end (or dates), title, location, description and showAs, plus the row etag. A missing or unparseable occurrence returns `not_found`.
- **Dialog:** passes `instance.instanceStart` when the event is recurring.
- **Shared helper:** `occurrenceOf()` is the lookup the agent tool already used. The tool now calls it too.
- **Test:** reloading the 3rd weekly occurrence returns that occurrence's times, not the master's. A bad or unknown instanceStart returns `not_found`.
**Status:** fixed: requires human verification (logic).

### WR-B01: Time grid jumps back to "now" on every refresh
**Files modified:** `src/organization/time-grid.tsx`
**Commit:** bd8e053
**Applied fix:** the initial scroll runs once for each `firstDay:length:startHour` key, which a ref tracks. A refresh no longer changes the key, so it keeps the user's scroll position. Toggling the earlier hours still re-scrolls, as before.

### WR-B02: Overnight tails before 07:00 vanish with no "earlier" pill
**Files modified:** `src/organization/layout.ts`, `tests/unit/org-layout.test.ts`
**Commit:** 91df70c
**Applied fix:** `earlierCount` now counts exactly the timed items that `blockGeometry` hides. Callers already pre-filter with `touches`. Test: a 22:00–06:00 event counts on the second day and not on the first.

### WR-B03: "Sync now" reports success for a queued job; the banner never clears
**Files modified:** `src/organization/header.tsx`, `src/settings/calendar-connection-row.tsx`, `src/server/calendar/sync.ts`
**Commit:** a1ab656
**Applied fix:**
- **Copy:** changed to "Sync started". This differs from the UI-SPEC "Calendar synced", but the new copy is accurate because the action only queues the job.
- **Worker, success path:** sends `notifyLive("calendar")` when a successful sync clears a previous `lastSyncError`, in addition to the existing "events changed" case.
- **Worker, failure path:** also notifies when a sync newly fails, so the banner both appears and clears live.

### WR-B04: `?new=event` without a writable calendar is a no-op
**Files modified:** `src/organization/organization-view.tsx`
**Commit:** 261043a
**Applied fix:** the effect returns right after `router.push(CONNECTIONS)`, so the `replace` no longer overrides it.

### WR-B05: Server-action rejections leave the UI busy
**Files modified:** `plan-card.tsx`, `task-dialog.tsx`, `tasks-card.tsx`, `event-dialog.tsx` (reload), `approval-detail.tsx` (both the event and the issue `guard`), `calendar-connection-row.tsx` (disconnect), `src/shell/ai/approval-card.tsx` (decide)
**Commits:** 46558e6, 27a287c (chat card, same pattern)
**Applied fix:** each call now has a `.catch()` that maps a thrown action to the component's normal failure result. Busy state therefore always resets, the existing failure toast or copy appears, and quick-add puts the typed title back.

### WR-B06: TaskDialog ignores the toggleTaskAction result
**Files modified:** `src/organization/task-dialog.tsx`
**Commit:** f57c270
**Applied fix:** when the toggle fails, the dialog shows "Saved, but couldn't change completion. Try again.", refreshes and stays open.

### WR-B07: TaskDialog can submit twice
**Files modified:** `src/organization/task-dialog.tsx`
**Commit:** 55f5434
**Applied fix:** `submit` returns early while busy, and the hidden submit button is `disabled={busy}`.

### WR-B08: TasksCard optimistic state is never reconciled
**Files modified:** `src/organization/tasks-card.tsx`
**Commit:** 4cae2e3
**Applied fix:**
- **Reconcile with the server:** optimistic entries are now `{ done, ok }`. Once the server confirms (`ok`), the next server props replace the entry, using the render-time prop-change pattern the file already uses for `CalendarList`.
- **Racing toggles:** a newer toggle wins over a stale in-flight result.
- **Collapse timers:** tracked per task. A new toggle or a failure cancels the task's timer, and unmount clears them all.
**Status:** fixed: requires human verification (state logic).

### WR-B09: Palette scope persists after results disappear
**Files modified:** `src/shell/palette.tsx`
**Commit:** 66cee3d
**Applied fix:** every query change now resets `scope` to "all" and clears `data`. The selection is then computed against the state that will actually render, so stale hits can't be opened during the debounce.

### WR-B10: `issueOf` uses `.parse` during render
**Files modified:** `src/approvals/approval-detail.tsx`, `src/shell/ai/approval-card.tsx`
**Commit:** 8b202cf
**Applied fix:** `issueOf` now uses `safeParse` and returns null when the payload is invalid. Both callers render a new `UnreadableApproval` fallback ("This request can't be displayed. It expires on its own.") for an `issue` row that can't be parsed.

### WR-B11: Keyboard focus is lost when navigating
**Files modified:** `src/organization/organization-view.tsx`
**Commit:** d400a6e
**Applied fix:**
- **Grid stays mounted:** the navigation skeleton is gone. TimeGrid already dims with `pending`, and MonthGrid is now wrapped in a dimmed, `aria-busy` div.
- **Focus restore:** if focus was inside the grid when `go()` ran and has been lost once navigation finishes, it moves to the grid's roving `tabindex=0` cell, or to the region if there is none.
**Status:** fixed: requires human verification (keyboard/screen-reader check on the VM).

### WR-B12: CalendarList optimistic revert clobbers concurrent changes
**Files modified:** `src/settings/calendar-list.tsx`
**Commit:** 2c9f923
**Applied fix:** the patch is applied with a functional updater. On failure, only the fields this change set are reverted, and only if they still hold the value it wrote. This also works for "set default", which touches every row.

### IN-B01: `ScopeDialog.firstInstance` is always false
**Files modified:** `src/organization/scope-dialog.tsx`, `src/organization/event-dialog.tsx`
**Commit:** e58ebf5
**Applied fix:** removed the dead prop. "This and following" is always offered, and a comment notes that the server folds it into "all" on the first occurrence.

### IN-B02: Event detail drops the end of multi-day all-day events
**Files modified:** `src/organization/event-detail.tsx`
**Commit:** fe3f30c
**Applied fix:** reuses `whenText(startDate, endDate, true)` from `event-approval.tsx`.

### IN-B03: A zero-length event before 07:00 renders at 07:00
**Files modified:** `src/organization/layout.ts`, `tests/unit/org-layout.test.ts`
**Commit:** b2795ed
**Applied fix:** the hide condition is now `eh <= startHour && sh < startHour`. Because of WR-B02 the hidden event is counted as earlier exactly once. A zero-length event at 07:00 still shows. Tests added.

### IN-B04: A state updater mutates the previous Set
**Files modified:** `src/organization/tasks-card.tsx`
**Commit:** fa31ce5
**Applied fix:** the updater copies the Set and then deletes from the copy.

### IN-B06: iCloud "invalid" uses the "couldn't reach" copy
**Files modified:** `src/settings/icloud-form.tsx`
**Commit:** 8020aa1
**Applied fix:** new copy: "Check the Apple ID format (it looks like an email address) and the app-specific password. Nothing was saved." The server returns `invalid` for a malformed Apple ID or an over-long password.

### IN-B07: Edit → Delete and TaskDialog close discard edits silently
**Files modified:** `src/organization/event-dialog.tsx`, `src/organization/task-dialog.tsx`
**Commit:** f17a7bc
**Applied fix:**
- **EventDialog:** the discard prompt now remembers its follow-up action (close or delete), so "Delete event" in a dirty form asks first.
- **TaskDialog:** Escape, backdrop and Cancel now check a snapshot of the form and show the same "Discard changes?" prompt.

### IN-B08: The chat ApprovalCard cannot show a stale target
**Files modified:** `src/server/agents/approvals.ts` (exported `toDTOs`), `src/server/agents/chat.ts`, `src/shell/ai/approval-card.tsx`
**Commit:** 70bfede
**Applied fix:** the thread transcript now builds approval DTOs with the same `toDTOs` as the Approvals view, which computes `targetChanged`. The card shows the detail view's stale copy and disables Approve.
**Not done:** live `approval` frames (`events.ts`) still send `targetChanged: null`. Importing `approvals.ts` there would create a heavy import cycle. Approval frames fire on decisions, so the transcript load is where staleness matters.

### IN-B09: Result-card items use index keys
**Files modified:** `src/shell/ai/result-card.tsx`
**Commit:** 98fb24f
**Applied fix:** the key is now `key|href|title|subtitle|i`. It is built from the item's content, so a different item never reuses another item's node. The index keeps exact duplicates unique.

### IN-A04 (Part A leftover): Settings free-model opt-in wording
**Files modified:** `src/settings/connections-section.tsx`
**Commit:** 3e1edcd
**Applied fix:**
- **Label:** "Allow private data (private repos, calendar and tasks) to be sent to free models (may be logged by provider)".
- **Helper text:** now names "a private repository, your calendar or your tasks".
- **Toasts:** now say "Private data allowed on / kept off free models".

## Skipped Issues

### IN-B05: The sync error banner shows raw provider/internal error text
**File:** `src/organization/organization-view.tsx:308`
**Reason:** skipped: not a bug. `lastError` and `lastSyncError` are only written by LifeOS code (`sync.ts`, `events.ts`, `markCalendarError`), always with fixed copy: "Access was rejected.", "{Provider} rate limit reached.", "{Provider} didn't respond." or "Sync failed. Retrying in 5 minutes.". No provider or exception text is ever stored, so the banner already shows fixed copy.
**Original issue:** the banner renders whatever was stored as the error.

---

_Fixed: 2026-10-12_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_

# Part C


# Phase 4 (Part C): Code Review Fix Report

**Source review:** .planning/phases/04-organization/04-REVIEW.md (`# Part C` findings only)
**Iteration:** 1
**Migrations added:** none. Every fix is app-level.

**Summary:** 12 findings in scope. 12 fixed, 0 skipped.

## Fixed Issues

| ID | Commit | Applied fix |
|----|--------|-------------|
| WR-C01 | 70d449a | If a reminder's notification write fails, the reminder is un-claimed so the next run retries it. |
| WR-C02 | 5f98bf1 | Reopening a task turns off a reminder whose time passed while the task was completed. |
| WR-C03 | f5b2ce0 | A blank `KEY=` line now counts as unset for optional and defaulted env vars. |
| WR-C04 | f528376 | The control-char range in `isSafeUrl` is now written with escapes, and `safe-url.ts` uses LF line endings, so git treats it as text again. |
| WR-C05 | e42a0c4 | Event payload `timeZone`, `etag`, `instanceStart`, `before` and delete fields now have length and format limits. Impossible all-day dates are rejected. |
| WR-C06 | 235caa9 | Impossible task due dates are rejected, and so are `remindAt` values with no UTC offset. |
| IN-C01 | 25de5b9 | `loadInstances` no longer loads every CalDAV event ever stored. Single events are limited to their stored date range. |
| IN-C02 | d6bb519 | `setDefaultCalendar` and the default-picking step in `refreshCalendarList` now take a transaction-scoped advisory lock first (`pg_advisory_xact_lock`), so concurrent default changes cannot leave two defaults. Added a DB test that fires 5 default changes at once and checks there is exactly one default. *Partial:* there is no unique index or CHECK constraints because this fix adds no migration. A `ponytail:` comment says to add a partial unique index on `is_default` with the next migration. |
| IN-C03 | 368bd22 | The palette now searches today-7 to today+55, which matches the 62-day `listEvents` cap, so no days are silently cut off. Upcoming and ongoing events come first (soonest first), then past events (most recent first), and the list is cut to 4 after that. Logic change: needs human verification. |
| IN-C04 | a041d99 | `dueBody` is now exported from `tasks.ts` and reused for the palette task subtitle, which shows day and month, and a time only when `dueTime` is set. The trailing period is removed. |
| IN-C05 | 3572e3a | `handleCalendarSync` now wraps its body in a try/catch that logs only `{ err }`, the same way `handleTaskReminders` does. |
| IN-C06 | 3448fbc | Documentation only. A header comment in `scripts/vm-db-test.sh` explains the project/volume naming, says the DB is left running on purpose (repeat runs skip startup), and gives the `down -v` command to wipe leftover `lifeos_test_*` DBs. No teardown trap was added, because it would slow every run. |

## Verification (after all fixes)

- `npx tsc --noEmit`: clean
- eslint on the changed files: clean
- `npx vitest run tests/unit`: 33 files, 262 tests passed
- `npx vitest run tests/db` (throwaway PG on 5433): 38 files, 216 tests passed
- `npm run build:worker`: ok
- `npx playwright test`: 74 passed, 16 skipped, 0 failed (90 total)

---

_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
