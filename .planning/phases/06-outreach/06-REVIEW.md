---
phase: 06-outreach
reviewed: 2026-10-13T00:00:00Z
depth: standard
scope: server
files_reviewed: 59
files_reviewed_list:
  - drizzle/0008_outreach.sql
  - src/lib/approval-kinds.ts
  - src/lib/calendar-types.ts
  - src/lib/live-types.ts
  - src/lib/mail-payload.ts
  - src/lib/outreach-types.ts
  - src/lib/project-types.ts
  - src/server/agents/approvals.ts
  - src/server/agents/llm.ts
  - src/server/agents/loop.ts
  - src/server/agents/policy.ts
  - src/server/agents/registry.ts
  - src/server/agents/tools/calendar.ts
  - src/server/agents/tools/github.ts
  - src/server/agents/tools/index.ts
  - src/server/agents/tools/mail.ts
  - src/server/agents/tools/outreach.ts
  - src/server/agents/tools/projects.ts
  - src/server/agents/types.ts
  - src/server/agents/usage.ts
  - src/server/calendar/caldav/provider.ts
  - src/server/calendar/connections.ts
  - src/server/calendar/errors.ts
  - src/server/calendar/google/client.ts
  - src/server/calendar/google/oauth.ts
  - src/server/calendar/queries.ts
  - src/server/db/schema.ts
  - src/server/events.ts
  - src/server/hub.ts
  - src/server/mail-actions.ts
  - src/server/mail/client.ts
  - src/server/mail/mime.ts
  - src/server/mail/queries.ts
  - src/server/mail/send.ts
  - src/server/mail/sync.ts
  - src/server/mail/text.ts
  - src/server/mail/triage.ts
  - src/server/net/safe-get.ts
  - src/server/outreach-actions.ts
  - src/server/outreach-pipeline-actions.ts
  - src/server/outreach/connections.ts
  - src/server/outreach/ics.ts
  - src/server/outreach/jsonld.ts
  - src/server/outreach/mock-events.ts
  - src/server/outreach/normalize.ts
  - src/server/outreach/pipeline.ts
  - src/server/outreach/providers.ts
  - src/server/outreach/queries.ts
  - src/server/outreach/score.ts
  - src/server/outreach/sources.ts
  - src/server/outreach/sync.ts
  - src/server/palette-actions.ts
  - src/server/project-actions.ts
  - src/server/project-queries.ts
  - src/server/queue.ts
  - src/server/tasks.ts
  - src/server/text.ts
  - src/worker/index.ts
  - src/worker/jobs/mail-sync.ts
  - src/worker/jobs/mail-triage.ts
  - src/worker/jobs/outreach-sync.ts
findings:
  critical: 1
  warning: 8
  info: 10
  total: 19
status: issues_found
---

# Phase 6: Code Review Report (server side)

**Reviewed:** 2026-10-13
**Depth:** standard
**Files Reviewed:** 59 (shared pre-existing files reviewed against the diff from `6010cfb^`)
**Status:** issues_found

## Summary

The server side of Outreach holds up well in the areas the brief called highest risk:

- **SSRF.** `safe-get.ts` vets the IP when the connection is made, through a custom `lookup` that also covers `all: true` and autoSelectFamily. It rejects IP-literal hosts before connecting and checks each redirect hop again with `isSafeUrl`. It enforces an overall deadline and a byte cap, and it never sends `accept-encoding`.
- **Secrets.** Feed URLs and keys are encrypted at rest. `url_ciphertext` is never selected on DTO paths, and errors use fixed strings.
- **Mail privacy.** `mailInScope` ignores `ai.free_private_ok` in both `createRun` and the per-turn `advance` check. Triage is pinned to Haiku through the dispatching client. All mail tools are `private: true` and in `CONTENT_TOOLS`.
- **The `mail_reply` locks.** These are enforced on edit, on approve and in the handler. `toApproval` is a pure destructure, so it can't throw.
- **Gmail 403.** A 403 on the Gmail base maps to `scope` and never pauses Calendar.
- **Server actions.** Every one checks `requireOwner()`.

The problems sit at the edges:

- **Disconnecting or reconnecting Google** leaves mail data and Gmail sync state behind. Agents keep serving that mail, and a reconnect to a different account corrupts the sync state. This is the blocker.
- **Triage retries** its failures with no limit.
- **Send idempotency on adopt** relies on Gmail behaviours nobody has verified.
- **Mail-derived task titles** reach agents through project blocker labels.
- **Gmail label state** goes stale after a resync or an unarchive.
- **Event sync:** one bad provider date fails a whole source, and the dedup is too loose.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-S01: Disconnecting or reconnecting Google leaves mail data and sync state behind; reconnecting a different account corrupts sync

**Files:** `src/server/calendar/connections.ts:76-80`, `src/server/mail/sync.ts:126-129,229-237`, `src/server/calendar/google/oauth.ts:59-62`, `src/server/agents/tools/mail.ts:42-57`

**Issue:**
- `removeCalendarConnection("google_calendar")` revokes the token and deletes the `connections` row. It does not touch:
  - `mail_messages` (subjects, snippets, addresses, AI summaries, action items);
  - the `settings` row `mail.sync` (`historyId`, `full: "done"`, `email`);
  - the `settings` row `mail.triage_paused`.
- **Privacy:** after disconnect, `mail.list` (which never checks the connection) and the Email tab keep serving the old mailbox's private metadata indefinitely. The 90-day prune only removes rows that have left INBOX, so these rows never age out. D-21 says disconnecting revokes Gmail, but the local copy stays.
- **Correctness after reconnect:** reconnecting, especially to a different Google account, keeps `full: "done"` and the old account's `historyId`. The next run goes straight to `incremental()` with a `historyId` from a different mailbox. Gmail either returns 404, which triggers the full resync and is the lucky case, or returns a meaningless history slice. In that case the new mailbox is never backfilled and the old account's mail stays mixed in.
- **Self-cc:** `mailSyncState().email` stays stale. The `replyAll` self-skip in `tools/mail.ts:187-188` then compares against the old address, so the owner's new address can be added to `cc`.

**Fix:** clear mail state on disconnect, and reset it when the account changes.

```ts
// calendar/connections.ts removeCalendarConnection
if (id === "google_calendar") {
  await revokeGoogle(h, opts);
  await h.delete(mailMessages);                                   // tasks.mail_message_id is ON DELETE SET NULL
  await h.delete(settings).where(inArray(settings.key, ["mail.sync", "mail.triage_paused"]));
}
```

In `completeGoogleOAuth`, once Gmail is granted, compare the profile `emailAddress` with `mailSyncState().email`. If they differ, or there is no stored state, reset the state to `EMPTY` and enqueue `QUEUES.mailSync`.

## Warnings

### WR-S01: Failed triage batches are retried on every sync with no limit, which burns spend

**File:** `src/server/mail/triage.ts:105-108,142-144`

**Issue:**
- An unusable model output leaves the whole batch untriaged. The cause can be a strict `max(300)` or `max(120)` violation (the comment says "rejected, not cut"), a missing tool call, or an LLM error.
- `runTriage` reselects the newest 100 untriaged rows from the last 7 days, and it is enqueued after every `mail.sync` that adds mail, which is every 5 minutes in an active inbox. A "poison" message, or a model that keeps exceeding the caps, gets re-sent to Haiku with up to 9 neighbours every few minutes for 7 days.
- Each attempt is a paid run, and the only thing that stops it is the monthly cap.
- The same applies to rows the model silently omits from `results`.

**Fix:** record attempts. For example, add `triage_attempts int` (or set `triage_model = 'failed'`) and increment it for every row in a failed batch and for every omitted id. Exclude rows with `attempts >= 3` from the automatic selection, so only the owner's "Triage" button retries them. Alternatively, truncate over-long strings instead of rejecting the whole batch: `summary.slice(0, 300)` after `safeParse` with `.catch`.

### WR-S02: Adopt-path idempotency rests on two unverified Gmail behaviours; if both fail, the reply is sent twice

**File:** `src/server/mail/send.ts:38-52`

**Issue:** After an ambiguous failure, a retry decides "not sent" (step d) only if all three checks miss:
- (a) the draft still exists;
- (b) the draft's message id carries `SENT`;
- (c) `rfc822msgid:<approval-…@lifeos.local> in:sent` finds the message.

Check (c) assumes Gmail keeps a caller-supplied `Message-ID`. Gmail is widely reported to replace it with its own `<…@mail.gmail.com>` on API sends. Gmail search indexing also lags by seconds to minutes, so (c) can miss a mail that was just sent. Check (b) assumes the sent copy keeps the draft's message id, which the comment for (c) itself doubts. No test against real Gmail confirms either assumption (D-37 uses only fakes). If (b) does not hold, an ambiguous `sendDraft` timeout, which is exactly the adopt case, leads to a second send.

**Fix:** add a thread-scoped check that does not depend on search or Message-ID. Call `threads.get(payload.threadId, format=metadata)` and treat any message with `SENT` whose `internalDate` is at or after the checkpoint time as already sent. Store `checkpointAt` alongside `draftId`. Also verify (b) and (c) once against real Gmail and record the result in OWNER-ACTIONS/UAT.

### WR-S03: A definite send failure orphans the Gmail draft, and the retry creates another one

**Files:** `src/server/mail/send.ts:53-55`, `src/server/agents/approvals.ts:209-215`

**Issue:**
- `createDraft` succeeds and the `draftId` is checkpointed in `approvals.result`. If `sendDraft` then fails with a definite `ProviderError`, the failure is recorded with `ambiguous: false`. Definite here means `auth`, `client`, `rate_limit` or `conflict`.
- On Retry, `adopt` is false, so the checkpoint is ignored and a second draft is created and sent.
- The first draft stays in the owner's Gmail Drafts, an unsent copy of a reply that was already sent. Each further definite failure adds another one.

**Fix:** always consult the checkpoint, whatever `adopt` says. A stored `draftId` means an earlier attempt already happened:

```ts
const [ap] = await h.select({ r: approvals.result }).from(approvals).where(eq(approvals.id, approvalId));
const cp = (ap?.r ?? {}) as { draftId?: string; draftMessageId?: string };
if (adopt || cp.draftId) { /* (a)-(c) as today */ }
```

### WR-S04: Mail-derived task titles reach agents through project blocker labels, bypassing `MAIL_TASK_TITLE` and the hard mail gate

**Files:** `src/server/agents/tools/projects.ts:85`, `src/lib/project-rules.ts:142`, `src/server/agents/tools/projects.ts:384-385`

**Issue:**
- Phase 6 replaces mail-linked task titles in `tasks.list`, in `projects.list` `nextTask` and in `projects.get` `tasks`. However, `projects.get` also returns `blockers[].label`, which is built as `Task "${title}" is blocked by "${blockedByTitle}"` from the raw task titles.
- `projects.update` `resolve` also copies raw `before.tasks[].title`.
- Once the owner moves an email action-item task into a project, or makes it a blocker, its title (text extracted from the email) reaches whichever model runs the projects agent.
- `projects.*` is only `private: true`, and that taint is overridden by `ai.free_private_ok`. So with the toggle on, email text reaches a free model, which breaks D-28 ("no toggle").

**Fix:** redact through the shared helper wherever task titles are surfaced. For example, build the blocker labels for agent output from `mailLinkedTaskIds` (`label: mail.has(b.refId) ? \`Task "${MAIL_TASK_TITLE}" is blocked\` : cut(b.label)`). Also cover `blockedByTitle`. The longer-term fix is to make `mailInScope` also return true when a run touched any mail-linked task.

### WR-S05: Gmail label state goes stale; unarchived mail never appears and resynced rows never update

**File:** `src/server/mail/sync.ts:191-204,215-216`

**Issue:**
- (1) `incremental()` ignores `labelsAdded` for messages it does not have (`if (!cur) continue`). A message older than the initial window, or one pruned earlier, that the owner moves back to INBOX in Gmail never shows up in LifeOS.
- (2) After a history 404 (more than a week offline), `full()` only fetches ids not already stored (`fetchNew` skips `have`). Rows archived or trashed in Gmail during the gap keep `INBOX` in `labelIds`. They keep showing in the Email tab and in `mail.list`, and they are never pruned, because the 90-day prune requires the row to have left INBOX.

**Fix:**
- In `incremental`, collect the `labelsAdded` events that add `INBOX` for unknown ids and pass those ids to `fetchNew`.
- In `full()` after a 404 resync, remove `INBOX` from stored rows that are absent from the fresh INBOX listing (bounded to rows received inside the listing window):

```ts
await h.update(mailMessages).set({ labelIds: sql`array_remove(${mailMessages.labelIds}, 'INBOX')` })
  .where(and(gte(mailMessages.receivedAt, windowStart), notInArray(mailMessages.gmailId, listedIds)));
```

### WR-S06: One invalid date from Eventbrite or Luma fails the whole source sync

**Files:** `src/server/outreach/providers.ts:263-264,353-354`, `src/server/outreach/sync.ts:39-69`

**Issue:**
- `new Date(e.start.utc)` and `new Date(e.start_at)` are not validated, unlike `jsonld.ts:150`.
- `inWindow` can still pass an `Invalid Date` start when `endAt` is valid and in the future. `minuteKey()` then calls `toISOString()` on it, which throws `RangeError` inside the `upsertEvents` transaction.
- That rolls back the source's entire batch, and the source shows the generic "Sync failed" on every run until the provider fixes its data.

**Fix:** drop invalid rows at the provider boundary, and add a guard in `upsertEvents`:

```ts
if (Number.isNaN(raw.startAt.getTime()) || (raw.endAt && Number.isNaN(raw.endAt.getTime()))) continue;
```

### WR-S07: The URL dedup key is too loose and merges distinct events (including within one feed)

**Files:** `src/server/outreach/ics.ts:60`, `src/server/outreach/sync.ts:63-80`, `src/server/outreach/normalize.ts:227-233`

**Issue:**
- For ICS, `url` falls back to the first `https://` link in the description. Common examples are a shared registration page, a society homepage or a ticketing landing page.
- `canonUrl` strips the query, so links that differ only by a query parameter compare equal.
- `sameEvent` merges two events whenever the canonical URLs match and the starts fall in the same minute, even when the titles are completely different and both rows come from the same source.
- So parallel sessions or tracks at a conference that share one registration link collapse into a single row. The second VEVENT's fields overwrite the first (`refresh` is true), and one event disappears from the list.

**Fix:**
- Do not use description-derived links as the canonical merge key. Store them as `url` but leave `canonicalUrl` null unless the link came from the `URL` property, a JSON-LD `url` or an API `url`.
- Never cross-merge two refs from the same `sourceId` (they already have distinct `remoteId`s): skip candidates whose `sources` already contain `ref.sourceId`.

### WR-S08: Importing the URL of a dismissed event reports success but leaves it dismissed and unsaved

**File:** `src/server/outreach/sources.ts:112-116`

**Issue:**
- When the imported URL matches an existing row with `stage === null` and `dismissedAt` set, `moveStage` returns `"changed"`, because its WHERE clause requires `dismissedAt IS NULL`. That error is swallowed (`m.error !== "changed"`) and the function returns `{ ok: true, existed: false|true }`.
- The owner sees "Imported", but the event stays hidden and does not go to SAVED, which contradicts D-05 ("Imported events go straight to SAVED").

**Fix:** restore before saving, or report the conflict:

```ts
if (row.stage === null) {
  await restoreEvent(h, row.id, now);
  const m = await moveStage(h, row.id, null, "SAVED", now);
  if (!m.ok) return { ok: false, error: "no_event" };
}
```

## Info

### IN-S01: SSRF blocklist gaps (low exploitability on the homelab VM)

**File:** `src/server/net/safe-get.ts:27-48`

**Issue:**
- These ranges are not denied: NAT64 `64:ff9b::/96` and `64:ff9b:1::/48`, 6to4 `2002::/16` (which can embed RFC1918 v4 addresses), `192.0.0.0/24`, `198.18.0.0/15`, and the documentation ranges.
- Any port is allowed (`https://public-host:22`).
- None of this is reachable without NAT64 or 6to4 routing, but it costs one line each to close.

**Fix:** add the subnets, and optionally restrict `URL.port` to `""` or `443`.

### IN-S02: A failed DB read of the mail sync state silently resets it

**File:** `src/server/mail/sync.ts:142`

**Issue:** `mailSyncState(h).catch(() => EMPTY)` turns a transient read failure into "never synced". `full()` then overwrites the saved `historyId` with the current profile value, and the label history in the gap is lost. Let the run fail instead (the outer catch already reports it).

### IN-S03: (Re)connecting Google does not enqueue a mail sync

**File:** `src/server/calendar/google/oauth.ts:61`

**Issue:** Only `calendar.sync` is enqueued, so after "Reconnect Google" the Email tab stays on `first_sync` or `scope_missing` for up to 5 minutes. Also enqueue `QUEUES.mailSync` when `gmail` is true.

### IN-S04: The private-blocked message and reason are wrong for mail runs

**File:** `src/server/agents/loop.ts:290`, `loop.ts:246`

**Issue:** The mail gate reuses `switchToSonnet("private", "private repo data")`. For an agent pinned to Free, the failure text tells the owner to "Allow it in Settings → Connections", but that toggle deliberately has no effect on mail. Pass a mail-specific reason and message.

### IN-S05: Mock events slide forward on every sync, including saved ones

**File:** `src/server/outreach/mock-events.ts:29-35`, `src/server/outreach/sync.ts:85-89`

**Issue:** The `remoteId` is stable but `startAt` is recomputed from `now`, and `refresh` is true for mock matches. A mock event the owner moved to SAVED or ATTENDING changes date every 6 hours and never reaches "past". It is harmless mock data but confusing. Skip the field refresh when `match.stage !== null`.

### IN-S06: The duplicate check in `addMailTaskAction` is outside the transaction

**File:** `src/server/mail-actions.ts:154-183`

**Issue:** A double click can pass the "already exists" check twice and create two tasks. Move the check inside the transaction, behind `select … for update` on the mail row.

### IN-S07: `mail.send_reply.available` checks only `compose`, but `resolve` needs `readonly`

**File:** `src/server/agents/tools/mail.ts:168-178`

**Issue:** With compose granted and readonly unticked, the tool is offered, and every call then fails in `getMetadata` with a 403 (mapped to NOT_ALLOWED). Require both scopes in `available`.

### IN-S08: `mail.list` ignores the INBOX label, and the "triage paused" flag stays set

**Files:** `src/server/agents/tools/mail.ts:44-57`, `src/server/mail/triage.ts:133`

**Issue:**
- Agents see messages that were archived or trashed in Gmail, while the UI's `loadMailView` filters on INBOX.
- `mail.triage_paused` is only cleared by the next successful batch, so "Triage paused" keeps showing after the monthly cap resets until new mail arrives.

### IN-S09: An Eventbrite organizer 404 is reported as "discovery not allowed"

**File:** `src/server/outreach/providers.ts:309`

**Issue:** A mistyped organizer ID (404) sets `discoverDenied` and shows `DISCOVER_DENIED`, which misleads the owner. Treat 404 as an unknown organizer and give it its own message.

### IN-S10: The `outreach_events.raw` column is never written

**Files:** `src/server/db/schema.ts` (`outreachEvents.raw`), `drizzle/0008_outreach.sql:67`

**Issue:** This is dead schema. Either drop it or populate it, capped, if D-10 still wants it.

---

_Reviewed: 2026-10-13_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
