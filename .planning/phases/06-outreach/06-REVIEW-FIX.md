---
phase: 06-outreach
fixed_at: 2026-10-13T16:10:00Z
review_path: .planning/phases/06-outreach/06-REVIEW.md, .planning/phases/06-outreach/06-REVIEW-UI.md
iteration: 1
findings_in_scope: 23
fixed: 23
skipped: 0
status: all_fixed
---

# Phase 6: Code Review Fix Report

**Fixed at:** 2026-10-13
**Source review:** .planning/phases/06-outreach/06-REVIEW.md (server). The UI fixer appends its results for 06-REVIEW-UI.md below.
**Iteration:** 1

## Server findings

**Summary:**
- Findings in scope: 9 (CR-S01, WR-S01 to WR-S08)
- Fixed: 9. WR-S02 and WR-S03 share one commit because both change the same block in `send.ts`.
- Skipped: 0
- Also fixed (Info, as requested): IN-S01, IN-S03 (in the CR-S01 commit), IN-S08 (only the `mail.list` half)

**Gates after all fixes:**
- `npx tsc --noEmit`: clean.
- `npx eslint .`: 0 errors, 19 warnings. All 19 are underscore-unused-var warnings that were there before these fixes.
- `npx vitest run tests/unit`: 50 files, 455 tests, all passing.
- `npx vitest run tests/db` (Postgres on :5433): 55 files, 440 tests, all passing.

### CR-S01: Disconnecting or reconnecting Google leaves mail data and sync state behind

**Files modified:** `src/server/calendar/connections.ts`, `src/server/calendar/google/oauth.ts`, `tests/db/google-oauth.test.ts`, `tests/db/calendar-store.test.ts`
**Commit:** 799f38d
**Applied fix:**
- A new `resetMailState(h)` deletes `mail_messages` (`tasks.mail_message_id` is set to null) and the `mail.sync` and `mail.triage_paused` settings.
- `removeCalendarConnection("google_calendar")` now calls it after the token is revoked.
- `completeGoogleOAuth` resets mail state when the new primary account (the email) differs from either the previous `connections.login` or the stored `mail.sync.email`. The comparison ignores case. The next full sync then picks up the new owner email from the Gmail profile.
- IN-S03: the callback now also queues `mail.sync` when Gmail is granted.
- Tests cover the disconnect wipe and three reconnect cases: same account keeps the state, a different login wipes it, and a different stored mailbox email wipes it.

### WR-S01: Failed triage batches are retried with no limit

**Files modified:** `src/server/mail/triage.ts`, `tests/db/mail-triage.test.ts`
**Commit:** 5d28101
**Applied fix:**
- Attempts are counted in `triage_model` while `triaged_at` is still null: `null` → `failed:1` → `failed:2`. This needs no migration.
- An unusable batch counts as an attempt for every row in it. A row the model leaves out also counts.
- Once a row reaches `failed:2` (`TRIAGE_GAVE_UP`), the automatic selection skips it. The owner's Triage button (`ids`) still retries it, and success overwrites the marker.
- The test checks that a third paid call is never made, that an id-based retry succeeds, and that an omitted id counts as an attempt.

### WR-S02: Adopt-path idempotency rests on unverified Gmail behaviours

**Files modified:** `src/server/mail/send.ts`, `src/server/mail/client.ts`, `tests/helpers/fake-gmail.ts`, `tests/db/mail-agent.test.ts`
**Commit:** e49b7dd
**Applied fix:**
- The checkpoint now also stores `at` (the time just before `createDraft`).
- On adopt, if checks (a) to (c) all miss, a new check (c2) calls `threads.get(threadId, format=minimal)`. Any `SENT` message with `internalDate >= at - 60s` counts as already sent. The 60s margin covers clock skew between the VM and Gmail.
- New client method: `gmail.getThread`.
- The fake now supports `/threads/:id`, plus two switches: `searchBlind` (Gmail rewrote the Message-ID, or search is lagging) and `rejectSend`.
- Test: an ambiguous send with a new id and a blind search is still adopted, with no second send.
- Known trade-off (marked `ponytail:` in the code): if the owner replies from Gmail itself in the same thread during that window, it also counts as sent. That was chosen over risking a double send.
- Still for the owner: check behaviours (b) and (c) once against real Gmail during UAT.

### WR-S03: A definite send failure orphans the Gmail draft

**Files modified:** same commit as WR-S02 (`src/server/mail/send.ts`, `tests/db/mail-agent.test.ts`)
**Commit:** e49b7dd
**Applied fix:**
- When `sendDraft` fails with a definite error (any `ProviderError` except `unavailable`), the draft is deleted (best effort).
- The checkpoint is now checked whenever a `draftId` is stored, whatever `adopt` says. If the draft still exists, it is reused and sent.
- The thread check from WR-S02 stays limited to adopt.
- Two tests:
  - A 400 on send deletes the draft, and the retry sends exactly once with no orphan left.
  - A 400 on both send and delete keeps the draft, and the non-adopt retry reuses it (1 create, 1 send).

### WR-S04: Mail-derived task titles reach agents through project blocker labels

**Files modified:** `src/server/tasks.ts`, `src/server/agents/tools/projects.ts`, `tests/db/mail-actions.test.ts`
**Commit:** 0a8095f
**Applied fix:**
- `mailBlockerRedactor(h, taskIds)` loads the blocked tasks and the tasks blocking them. In blocker labels, it replaces the quoted title of any mail-linked task with `"Email follow-up (private)"`.
- `projects.get` passes its `blockers[].label` through it.
- The `projects.update` `before` snapshot was checked and left unchanged. It never reaches the model: the gateway returns only `{status: "waiting_approval", approvalId}`, and `applyDraft` returns only counts. Redacting it would also break the WR-03 `itemsChanged` title comparison.
- The test covers both directions: a mail task that is blocked, and a mail task that is the blocker.

### WR-S05: Gmail label state goes stale

**Files modified:** `src/server/mail/sync.ts`, `tests/db/mail-sync.test.ts`
**Commit:** 75f1975
**Applied fix:**
- `incremental()` now passes `labelsAdded` events that add INBOX to `fetchNew`. Since `fetchNew` skips known ids, only unknown messages are fetched.
- When the INBOX listing in `full()` is not truncated, it is treated as the truth for the 30-day window:
  - Stored rows in the window that are missing from the listing lose `INBOX` (`array_remove`).
  - Listed rows that lack `INBOX` get it back.
  - A truncated listing (more than 500 messages) skips this step, so rows are never wrongly archived.
- Two tests: an unarchive of an unknown message during an incremental sync, and a 404 resync that both removes and restores INBOX.

### WR-S06: One invalid provider date fails the whole source sync

**Files modified:** `src/server/outreach/sync.ts`, `tests/db/outreach-sync.test.ts`
**Commit:** 31e7427
**Applied fix:**
- The guard sits in `upsertEvents`, which every provider and URL import goes through.
- A raw event with an invalid `startAt` or `endAt` is skipped and counted, and the count is logged with `log.warn`.
- The test runs with `filter: false`, so `inWindow` cannot hide the problem. One bad start and one bad end are skipped, and the valid event is stored.

### WR-S07: The URL dedup key is too loose and merges distinct events

**Files modified:** `src/lib/outreach-types.ts`, `src/server/outreach/ics.ts`, `src/server/outreach/sync.ts`, `tests/db/outreach-sync.test.ts`
**Commit:** 17c3355
**Applied fix:**
- `RawEvent` gains an optional `urlFromText`. ICS sets it when the link was taken from the DESCRIPTION rather than the `URL` property.
- These events still store `url` for display, but `canonicalUrl` is null.
- `sameEvent` now compares stored `canonicalUrl` values instead of raw `url`s. The same-start-minute requirement is unchanged.
- The reviewer's extra rule ("never merge two refs from the same source") was not added. Feeds that regenerate UIDs would then create duplicates.
- Test: two ICS sessions at the same time with a shared registration link stay as two rows.

### WR-S08: Importing a dismissed event's URL reports success but leaves it dismissed

**Files modified:** `src/server/outreach/sources.ts`, `tests/db/outreach-actions.test.ts`
**Commit:** d5557fa
**Applied fix:**
- When the matched row is unsaved and dismissed, `importEventUrl` calls `restoreEvent` before `moveStage(null → SAVED)`.
- The test checks that the row ends up `SAVED` with `dismissedAt` set to null.

### Info items fixed

- **IN-S01** (`fdf529c`): `safe-get.ts` now also denies these ranges:
  - `64:ff9b::/96` and `64:ff9b:1::/48` (NAT64)
  - `2002::/16` (6to4, blocked whole)
  - `192.0.0.0/24` and `198.18.0.0/15`
  - The unit test also checks the NAT64 and 6to4 literals.
  - The port restriction was not done.
- **IN-S03** (in `799f38d`): reconnecting with Gmail granted queues `mail.sync`.
- **IN-S08** (`9d7b729`): by default, `mail.list` now requires the `INBOX` label as well as `archivedAt IS NULL`, which matches `loadMailView`. Its `archived` output flag is true for mail archived in Gmail. The `mail.triage_paused` half of IN-S08 was not done.

### Not fixed (Info, out of scope)

IN-S02, IN-S04, IN-S05, IN-S06, IN-S07, IN-S09, IN-S10, the port restriction from IN-S01, and the triage-paused flag from IN-S08.


## UI findings

**Source review:** .planning/phases/06-outreach/06-REVIEW-UI.md

**Summary:**
- Findings in scope: 14 (CR-U01 to CR-U04, WR-U01 to WR-U10)
- Fixed: 14, one commit each.
- Skipped: 0
- Info items IN-U01 to IN-U08 were out of scope and were not touched.
- Totals across server and UI: 23 in scope, 23 fixed, 0 skipped.

**Gates after all fixes (server and UI):**
- `npx tsc --noEmit`: clean.
- `npx eslint .`: 0 errors, 19 warnings. These are the same underscore-unused-var warnings that were there before.
- `npx vitest run tests/unit`: 50 files, 455 tests, all passing. New assertions were added inside existing tests, so the counts did not change.
- `npx vitest run tests/db` (Postgres on :5433): 55 files, 440 tests, all passing.
- `bash scripts/glass-gate.sh src`: exit 0.
- `npx playwright test tests/e2e/outreach.spec.ts tests/e2e/approvals.spec.ts tests/e2e/settings.spec.ts`: 27 passed, 1 skipped. The skip is the existing desktop-only approvals test on the mobile project.

### CR-U01: `?draft=1` auto-drafts a reply to a different email

**Files modified:** `src/app/(os)/outreach/page.tsx`, `src/outreach/email-view.tsx`
**Commit:** 2e40618
**Applied fix:**
- `autoDraft` is now true only when `?mail=` is a valid id and that exact message is the selected one. There is no fallback to `items[0]`.
- A new `missing` flag shows "Couldn't find that email. It may have left your inbox in Gmail." when the requested mail isn't in the loaded list.
- `setParams` in `EmailView` always deletes `draft`, so selecting a mail, changing category or using the arrow keys can never carry the flag on to another email.
- On mobile the sheet starts open when `autoDraft` is set. The one-shot runs there and drops the param.

### CR-U02: Edit-before-approve state was captured once and could overwrite newer edits

**Files modified:** `src/outreach/draft-reply.tsx`, `src/approvals/approval-detail.tsx`
**Commit:** 5d4b1eb
**Applied fix:**
- In both mail editors (the DraftReply `Pending` and `MailApprovalShell`), "Edit draft" re-seeds from the current payload and records it as `base`.
- On save or on approve-while-editing, if the approval changed underneath (`!sameMail(base, saved)`), the action is refused. The editor reloads the latest text and an error toast explains why.
- The event and project shells also re-seed when edit starts. The Phase 3 issue shell was left unchanged.
- `saveEditAction` already returned the fresh approval through `run()`, and the UI already patched it in with `onPatch` / `onChange`. No server change was needed.

### CR-U03: AI-panel approval card hid Cc and other recipients

**Files modified:** `src/shell/ai/approval-card.tsx`, `src/lib/mail-payload.ts`, `src/lib/approval-kinds.ts`, `src/server/agents/tools/mail.ts`, `src/approvals/mail-approval.tsx`, `tests/db/mail-agent.test.ts`, `tests/unit/approval-kinds.test.ts`
**Commit:** 058e1af
**Applied fix:**
- The card now lists every To and Cc address, and the headline says "and N others".
- The mail reply payload gains an optional `from`: the original From, display only. `resolve()` fills it from the live header, and it is added to `LOCKED.mail_reply`.
- A shared `redirectNote()` puts an amber "Replies go to X (the email's Reply-To), not the sender Y." line on the card.
- Tests: the DB test asserts that `from` is stored, and the unit test asserts that `from` is locked.
- Approvals created before this change have no `from`, so they show no redirect note.
- The suggestion to route replies with Cc to "Review and edit" was not done.

### CR-U04: "Draft with agent" hung when the AI panel was already open or busy

**Files modified:** `src/shell/ai-panel.tsx`, `src/outreach/draft-reply.tsx`
**Commit:** c2684b5
**Applied fix:**
- The panel now consumes every new `aiPrompt`, not only the one sent when it opens.
- A prompt that arrives while a run is streaming waits until the stream ends.
- When the assistant is blocked (no key, cap or paused), the prompt goes into the input box under the block error instead of being dropped.
- While drafting, DraftReply shows "Follow it in the AI panel." and a "Stop waiting" link that restores the button.
- Status: fixed, requires human verification. This changes how the panel consumes prompts, and no automated test covers that path.

### WR-U01: iCloud row read "Reconnect Google"

**Files modified:** `src/settings/calendar-connection-row.tsx`
**Commit:** c89734b
**Applied fix:**
- The label is now `!connected ? "Connect X" : google ? "Reconnect Google" : "Reconnect"`.
- The dead ternary was removed.

### WR-U02: Settings showed Gmail "Allowed" when only read was granted

**Files modified:** `src/lib/calendar-types.ts`, `src/server/calendar/connections.ts`, `src/settings/calendar-connection-row.tsx`, `tests/db/google-oauth.test.ts`
**Commit:** b5c2789
**Applied fix:**
- `gmail` is now `"granted" | "read_only" | "missing"`.
- The row shows "Read only · Reconnect Google to allow replies." in amber.
- The DB test covers a granular grant (calendar plus readonly).

### WR-U03: "Reply sent" toast fired on approve

**Files modified:** `src/outreach/draft-reply.tsx`, `src/approvals/approval-detail.tsx`, `src/shell/ai/approval-card.tsx`
**Commit:** 1691c2b
**Applied fix:**
- The toast is now "Reply approved · sending".
- The resolved states already report "Reply sent…" or the failure.

### WR-U04: A rejected or expired draft read as "The agent didn't draft a reply"

**Files modified:** `src/outreach/draft-reply.tsx`
**Commit:** c790fcf
**Applied fix:** `phase` is reset to `"idle"` during render once a pending approval is visible.

### WR-U05: Event detail back link relied on `document.referrer`

**Files modified:** `src/outreach/outreach-view.tsx`, `src/outreach/event-detail.tsx`
**Commit:** 9a6251a
**Applied fix:**
- `OutreachView` saves the current list URL to `sessionStorage["outreach:list"]`.
- "All events" pushes that URL if it matches `^/outreach(\?|$)`. Otherwise it falls back to the plain `/outreach` href.
- Modifier clicks and middle clicks are left to the link.

### WR-U06: A redirected reply (Reply-To ≠ From) was not flagged

**Files modified:** `src/outreach/draft-reply.tsx`, `src/approvals/mail-approval.tsx`
**Commit:** db6b65b
**Applied fix:**
- DraftReply and the Approvals `Recipients` block show the amber `redirectNote()` line.
- It uses the payload `from` added in CR-U03 rather than passing `mail.from` down, so it works on every surface.
- Approvals created before this change have no `from` and show no note.

### WR-U07: Follow-up dialog errors attached to the wrong row

**Files modified:** `src/outreach/follow-up-dialog.tsx`
**Commit:** 24651ee
**Applied fix:**
- Removing a row clears `errors`. The next submit re-validates.
- Adding a row appends, so it does not shift indexes and was left unchanged.

### WR-U08: Mock-disabled buttons explained themselves only through `title`

**Files modified:** `src/outreach/pipeline-board.tsx`, `src/outreach/event-detail.tsx`
**Commit:** 180904d
**Applied fix:**
- Event detail shows a visible 12.5px reason ("Mock events can't create follow-up tasks or go on your calendar."). Both disabled buttons point to it with `aria-describedby`.
- The board's Follow up button uses the EventCard sr-only span plus `aria-describedby`.

### WR-U09: A mail failure also took down event follow-ups

**Files modified:** `src/app/(os)/outreach/page.tsx`
**Commit:** 421cef8
**Applied fix:** `followUpCount` and `listFollowUps` now run in their own `try`/`catch`.

### WR-U10: The e2e send test passed even when the send failed

**Files modified:** `tests/e2e/outreach.spec.ts`
**Commit:** a420730
**Applied fix:**
- The e2e stack runs no worker and has no outbound network, so the test now requires status exactly `approved`.
- It also checks that the "Reply approved · sending" toast and "Sending the reply…" are shown.
- "Exactly one fake-Gmail send with the edited body" (D-37) is already asserted in `tests/db/mail-agent.test.ts` ("sends the edited body once…"). Moving it to e2e would need a worker and a fake Gmail inside the e2e stack.
- The task-cleanup half was already done: `deleteMailMessage` and `deleteOutreachEvent` in `tests/e2e/owner.ts` delete linked tasks first.

### Not fixed (Info, out of scope)

IN-U01 to IN-U08.

---

_Fixed: 2026-10-13_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
