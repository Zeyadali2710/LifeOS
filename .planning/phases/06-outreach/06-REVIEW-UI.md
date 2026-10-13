---
phase: 06-outreach
scope: ui
reviewed: 2026-10-13T00:00:00Z
depth: standard
diff_base: 6010cfb7f170e5f16e2e1e615035f080494b7371^
files_reviewed: 40
files_reviewed_list:
  - src/app/(os)/outreach/events/[id]/page.tsx
  - src/app/(os)/outreach/loading.tsx
  - src/app/(os)/outreach/page.tsx
  - src/app/(os)/settings/page.tsx
  - src/app/api/connections/google/callback/route.ts
  - src/approvals/approval-detail.tsx
  - src/approvals/approval-list.tsx
  - src/approvals/event-approval.tsx
  - src/approvals/mail-approval.tsx
  - src/outreach/add-to-calendar-dialog.tsx
  - src/outreach/draft-reply.tsx
  - src/outreach/email-card.tsx
  - src/outreach/email-detail.tsx
  - src/outreach/email-view.tsx
  - src/outreach/event-card.tsx
  - src/outreach/event-detail.tsx
  - src/outreach/event-list.tsx
  - src/outreach/fmt.ts
  - src/outreach/follow-up-dialog.tsx
  - src/outreach/follow-ups.tsx
  - src/outreach/import-url-dialog.tsx
  - src/outreach/outreach-view.tsx
  - src/outreach/pipeline-board.tsx
  - src/outreach/use-stage.ts
  - src/outreach/why-block.tsx
  - src/projects/progress-ring.tsx
  - src/settings/calendar-connection-row.tsx
  - src/settings/connection-row.tsx
  - src/settings/connections-section.tsx
  - src/settings/outreach-connections.tsx
  - src/settings/outreach-section.tsx
  - src/settings/settings-nav.tsx
  - src/settings/token-form.tsx
  - src/shell/activity-list.tsx
  - src/shell/ai/approval-card.tsx
  - src/shell/live-provider.tsx
  - src/shell/palette-items.ts
  - src/shell/palette.tsx
  - src/ui/icon-names.ts
  - tests/e2e/outreach.spec.ts
findings:
  critical: 4
  warning: 10
  info: 8
  total: 22
status: issues_found
---

# Phase 6: Code Review Report (UI side)

**Reviewed:** 2026-10-13
**Depth:** standard
**Files Reviewed:** 40
**Status:** issues_found

## Summary

The basic rendering hygiene holds up. Mail bodies, snippets, summaries, event descriptions and sync errors are all rendered as React text nodes. Nothing uses `dangerouslySetInnerHTML` and no remote images load. The only external hrefs are `isSafeUrl` (https only, no credentials) for the event's original page and fixed `mail.google.com` URLs (with a `[A-Za-z0-9]+` threadId check). Every `target="_blank"` has `rel="noopener noreferrer"`. Both pages call `requireOwner()` and the event route checks the UUID with zod. In the mail approval, recipients are taken from `base` on both edit surfaces, so locked fields cannot be changed from the UI. The server re-checks `LOCKED` anyway. Mock events cannot reach the calendar or follow-up tasks through the UI, and the server enforces the same rule. Stage transitions in the card, board and detail views match `canMove` and the server's `from` check.

The real defects are in the email and approval flows:
- **Draft with agent can target the wrong email.** The `?draft=1` auto-draft can start on a different message from the one the owner picked.
- **Edits can be silently reverted.** The edit-before-approve state is captured once and never resynced, so it can overwrite edits the owner made elsewhere.
- **The AI-panel approval card hides recipients.** It shows only the first To address. A reply-all sends to up to 20 Cc addresses taken from attacker-controlled headers.
- **Draft with agent can hang.** It gets stuck in "drafting" for good when the docked AI panel is already open.

## Critical Issues

### CR-U01: `?draft=1` auto-drafts a reply to a different email than the one requested

**File:** `src/app/(os)/outreach/page.tsx:46-58`, `src/outreach/email-view.tsx:138-152,232-235`, `src/outreach/draft-reply.tsx:78-84`
**Issue:** FOLLOW-UPS "Draft with agent" navigates to `?tab=email&mail=<id>&draft=1`. The page then falls back silently to `selectedId = view.items[0]` when the requested mail is not in the loaded list. That happens in three cases:
- `mailCatOf` ignores the INBOX filter that `loadMailView` applies, so this covers any mail the owner archived or moved in Gmail after adding the task.
- The mail is beyond the 200-row limit.
- The mail is unknown.

`autoDraft` is still `true`, so `DraftReply` for the *first message in the category* calls `openAI("Draft a reply to email <other id>")`. The Outreach agent then reads a different email and prepares a reply to a different person.

There is a second path on mobile. The detail only mounts when the sheet is open, so the effect that clears `draft=1` never runs. `setParams` copies the whole query, so `draft=1` survives. The next email the owner taps then auto-starts a draft for *that* email.

**Fix:** Only honour the flag when the requested mail is the one selected, and drop the param from the URL in `EmailView` rather than inside the lazily mounted child:
```tsx
// page.tsx
const autoDraft = sp.draft === "1" && want !== null && selectedId === want;
mail = { status, ...view, cat, selectedId, approval, autoDraft };
// email-view.tsx: clear draft=1 on mount regardless of sheet state; setParams must delete "draft" on every select
const select = (id: string | null) => setParams({ mail: id, draft: null });
```
Also make `mailCatOf` apply the same `inbox` predicate as `loadMailView`, or show "This email is no longer in your inbox" when `want` is not found.

### CR-U02: Edit-before-approve state is captured once; stale draft silently overwrites newer edits

**File:** `src/outreach/draft-reply.tsx:156,190-199,267`; `src/approvals/approval-detail.tsx:270,305-312,344`
**Issue:** `draft` is `useState(() => toMailDraft(saved))`, so it is set only on mount. `Pending` is keyed by approval id and `MailApprovalShell` by detail id, so neither remounts when the same approval is edited elsewhere. The live `approval` frame plus `router.refresh` updates `saved`, but not `draft`.

A realistic sequence:
1. The owner edits the reply in the Approvals page (or another tab).
2. The owner later clicks "Edit draft" on the EmailDetail.
3. The editor shows the agent's original text.
4. "Done editing" (`!sameMail(draft, saved)`) calls `saveEditAction` with the stale text, or "Send reply" while editing approves it. The owner's earlier edits are discarded without warning.

There is a related problem: `saveEditAction` returns no approval. After "Done editing", the read view keeps showing the *pre-edit* `saved` text, with no EDITED badge, until a live frame arrives.

**Fix:** Seed the editor from the current payload each time editing starts, and patch locally after a save:
```tsx
onClick={() => { if (editing) void done(); else { setDraft(toMailDraft(saved)); setErrors({}); setEditing(true); } }}
// after a successful saveEditAction:
onPatch({ ...a, edited: payload });
```
Apply the same change to `MailApprovalShell`. The event and project shells share the pattern, so it is worth fixing there too.

### CR-U03: AI-panel approval card hides Cc and additional recipients of a mail reply

**File:** `src/shell/ai/approval-card.tsx:141,151`
**Issue:** The inline card shows "Outreach agent wants to reply to {to[0]}" and `To {mp.to[0]?.address}` only. It has a one-click SEND REPLY with no edit step.

`mail.send_reply` builds `to` from the **Reply-To** header and, when the model sets `replyAll`, adds up to 20 `cc` addresses from the original To and Cc headers. The sender of the email controls those headers, and prompt injection can set `replyAll`. The owner can therefore approve a reply that goes to many addresses the card never shows. The Approvals page and DraftReply do list everyone, but the AI panel is the main surface right after "Draft with agent". D-30's guarantee only helps if the owner can see who "thread participants" means.
**Fix:** Render the full recipient list, as `Recipients` in `mail-approval.tsx` does:
```tsx
{mp && (
  <div className="font-code text-[11px] break-words text-text-3">
    To {mp.to.map((x) => x.address).join(", ")}{mp.cc.length ? ` · Cc ${mp.cc.map((x) => x.address).join(", ")}` : ""}
  </div>
)}
```
Also consider routing replies with `cc.length > 0` to "Review and edit" instead of offering one-click SEND REPLY.

### CR-U04: "Draft with agent" hangs in "drafting" when the docked AI panel is already open (or the assistant is busy or blocked)

**File:** `src/outreach/draft-reply.tsx:68-72,86-87,122`
**Issue:** `start()` sets `phase="drafting"` and calls `openAI(prompt)`. `AIPanel` only consumes the prompt on the *open edge*: the effect deps are `[aiOpen, status === null, consumeAIPrompt]`, and docked mode is non-modal. When the panel is already open, for example after the first "Draft with agent" of the session, the prompt is never submitted.

`submit` also returns early without a signal when the panel is `blocked` (no_key, paused) or `streaming`. In every one of these cases no run frame arrives, so the skeleton and "Outreach agent is drafting…" stay up and the "Draft with agent" button is hidden (`!live && !drafting`). The only way out is a full reload.
**Fix:** Make the panel consume a new prompt whenever `aiPrompt` changes, not only on open. Also give `DraftReply` an exit, such as a timeout and a visible "Cancel" or "Try again" link while drafting:
```tsx
// ai-panel.tsx
}, [aiOpen, aiPrompt, status === null, consumeAIPrompt]);
// draft-reply.tsx: keep the button visible while drafting, or reset phase after ~60s with no run frame
```

## Warnings

### WR-U01: iCloud row now reads "Reconnect Google"

**File:** `src/settings/calendar-connection-row.tsx:57,66-71`
**Issue:** `label = connected ? "Reconnect Google" : …` is shared by the iCloud `<Button>{label}</Button>`, so a connected or errored iCloud row offers "Reconnect Google". The `google && connected ? label : conn.status === "error" ? "Reconnect" : label` ternary also has a dead middle branch, because error implies connected.
**Fix:** `const label = !connected ? \`Connect ${m.name}\` : google ? "Reconnect Google" : "Reconnect";` and render `{label}` in both branches.

### WR-U02: Settings shows Gmail "Allowed" when only `gmail.readonly` was granted

**File:** `src/settings/calendar-connection-row.tsx:58,114-117` (data from `getCalendarConnections` → `hasGmail(scopes, "read")`)
**Issue:** Granular consent lets the owner tick read and untick compose. The OAuth toast then says "Gmail not allowed", because the callback requires both scopes, but the Gmail row says "Allowed" in green. `mail.send_reply` is then unavailable (`NOT_ALLOWED`), and Settings never suggests reconnecting.
**Fix:** Expose `gmail: "granted" | "read_only" | "missing"` and show "Read only · Reconnect Google to allow replies" (amber) for `read_only`.

### WR-U03: "Reply sent" toast fires on approve, before anything is sent

**File:** `src/outreach/draft-reply.tsx:192`, `src/approvals/approval-detail.tsx:305`, `src/shell/ai/approval-card.tsx:131`
**Issue:** Approve only records the decision, and the worker sends later, possibly failing with NOT_CONNECTED or auth errors. The toast claims success while the same screen says "Sending the reply…". That breaks the "send failures are honest" rule (D-33).
**Fix:** Use `"Reply approved · sending"` and let the live resolved state report "Reply sent" or the failure.

### WR-U04: DraftReply shows "The agent didn't draft a reply" after a successful draft is rejected or expires

**File:** `src/outreach/draft-reply.tsx:61-66,117-118`
**Issue:** `phase` stays `"drafting"` after the approval appears. When the owner later rejects it, or it expires or is cancelled, the run's terminal frame (`cancelled`/`completed`) sets `phase="failed"`. With no resolved line to show, the copy then says the agent failed to draft, which is false.
**Fix:** Reset `phase` to `"idle"` once a pending approval for this mail is seen. For example, in render: `if (phase === "drafting" && approval?.status === "pending") setPhase("idle")`. Or only map a terminal run to `"failed"` when no approval was created for it.

### WR-U05: Event detail "All events" back link relies on `document.referrer`

**File:** `src/outreach/event-detail.tsx:72-78`
**Issue:** `document.referrer` is not updated by client-side navigation. It reflects the last full page load, and could be something like `/login?…/outreach`. So `router.back()` can run when the previous history entry is not the list, for example after landing from a palette or notification link. The owner is then sent to another page or out of the app. In the common case (sidebar → Outreach → card) the referrer has no `/outreach`, so the filters and view are lost, which defeats the purpose.
**Fix:** Pass the list query explicitly, e.g. `href={\`/outreach/events/${id}?from=${encodeURIComponent(qs)}\`}`, and build the back link from a validated `from`. Or store the last list URL in `sessionStorage` when navigating from the list.

### WR-U06: A redirected reply (Reply-To ≠ From) is not flagged in the draft UI

**File:** `src/outreach/draft-reply.tsx:221-239`, `src/approvals/mail-approval.tsx:111-115`
**Issue:** The server addresses the reply to `Reply-To` when one is present. EmailDetail shows the From address in the header, and the draft shows the locked To. A phishing mail with `From: boss@company` and `Reply-To: attacker@evil` produces a reply to the attacker, and nothing calls attention to the mismatch. The untrusted note is generic.
**Fix:** In `DraftReply`, compare `saved.to[0].address` with `m.from.address`. Pass `mail.from` down and, when they differ, show an amber line: "Replies go to {to} (the email's Reply-To), not the sender {from}."

### WR-U07: Follow-up dialog errors attach to the wrong row after a line is removed

**File:** `src/outreach/follow-up-dialog.tsx:29,36-41,79-83,93`
**Issue:** Errors are keyed by array index (`lines.${i}.title`), while rows are keyed by `l.key`. After a validation failure, removing an earlier row shifts the indexes, so a row that is now valid shows the next row's error, or an error vanishes. Server errors (`r.errors`) have the same mismatch.
**Fix:** Clear `errors` whenever a line is added or removed (`setErrors({})`), or key errors by `l.key` and map the server indexes back to keys at submit time.

### WR-U08: Disabled-with-reason controls explain themselves only through `title`

**File:** `src/outreach/pipeline-board.tsx:109-117`, `src/outreach/event-detail.tsx:160-168,181`
**Issue:** The board's mock "Follow up" button and the detail's mock "Follow up" and "Add to calendar" buttons are disabled with a `title` only. Disabled buttons are not focusable and `title` is not exposed reliably, so keyboard, screen-reader and touch users never learn why. The UI-SPEC requires `aria-describedby` text, as the event card does. The board has no other mock explanation.
**Fix:** Reuse the EventCard pattern: add an sr-only reason span plus `aria-describedby`, or keep the button focusable with `aria-disabled="true"` and show a visible 12.5px reason under it.

### WR-U09: A mail failure also takes down event follow-ups

**File:** `src/app/(os)/outreach/page.tsx:41-63`
**Issue:** `followUpCount` and `listFollowUps` run inside the mail `try`. If anything mail-related throws, such as `mailStatus`, `loadMailView`, `pendingReplyFor`, or a mail table missing before the owner runs the migration (D-03), FOLLOW-UPS shows "Couldn't load follow-ups" and the tab count shows 0. That includes event follow-ups, which have nothing to do with Gmail.
**Fix:** Give the follow-up queries their own `try`/`catch`.

### WR-U10: The e2e send test passes when the send fails and never checks the single fake-Gmail send

**File:** `tests/e2e/outreach.spec.ts:117-120`
**Issue:** `toMatch(/^(approved|executing|executed|failed)$/)` accepts `failed`, so a broken send path stays green. D-37 requires "approve → fake Gmail records one send". The tasks created by the follow-up and "Add as task" tests are also never cleaned up. `deleteOutreachEvent` and `deleteMailMessage` leave orphaned open tasks, because the FKs are `SET NULL`.
**Fix:** Wait for `executed` (with the fake Gmail enabled in the e2e env) and assert that the fake recorded exactly one send with the edited body. Delete the created tasks in `afterEach`.

## Info

### IN-U01: Email category dot colours are swapped versus the UI-SPEC

**File:** `src/outreach/email-view.tsx:20-29`
**Issue:** The spec has EVENTS as purple and FOLLOW-UP as cyan. The code has EVENTS as `bg-cyan` and FOLLOW-UP as `bg-purple-text`.
**Fix:** Swap the two entries.

### IN-U02: First-time Google connect toasts "Google reconnected"

**File:** `src/settings/connections-section.tsx:59`
**Issue:** The callback now always sends `gmail=0|1`, so the `gmail === null` branch ("Google Calendar connected · N calendars") never runs.
**Fix:** Base the wording on whether a connection existed before, or use "Google connected · N calendars · Gmail allowed/not allowed".

### IN-U03: `now` is frozen at mount in EmailView

**File:** `src/outreach/email-view.tsx:73,182`
**Issue:** After a live refresh, `lastSyncAt` is newer than the mount-time `now`, so "Synced just now" shows forever. `mailTime` labels also drift.
**Fix:** Refresh `now` when `status.lastSyncAt` changes, or tick it every minute.

### IN-U04: Follow-up default due date may be +3 days for all-day events

**File:** `src/outreach/fmt.ts:36-40`
**Issue:** ICS all-day `DTEND` is exclusive. If `endAt` stores it as is, `end + 2 days` lands one day later than D-18 intends.
**Fix:** For `allDay`, subtract one day from `endAt` before adding 2, or confirm that the normaliser already stores an inclusive end.

### IN-U05: Tab ARIA points at unrendered panels; the route skeleton is wrong for the detail page

**File:** `src/outreach/outreach-view.tsx:133`, `src/app/(os)/outreach/loading.tsx:5`
**Issue:** Inactive tabs' `aria-controls` reference ids that are not in the DOM. `outreach/loading.tsx` also applies to `/outreach/events/[id]`, which then shows a card-grid skeleton. `aria-busy` has no accessible name.
**Fix:** Omit `aria-controls` on non-selected tabs. Add an `events/[id]/loading.tsx` with a two-column skeleton and `aria-label="Loading"`.

### IN-U06: `aria-label` overrides visible field labels in the follow-up dialog

**File:** `src/outreach/follow-up-dialog.tsx:80,83`
**Issue:** The visible label "Title" or "Due date" differs from the accessible name "Task 1 title" (WCAG 2.5.3, label in name).
**Fix:** Drop the `aria-label` and use `Task {i+1} title` as the visible label for every row, or rely on `Field`'s label only.

### IN-U07: Gmail links hard-code `/u/0/`

**File:** `src/outreach/email-detail.tsx:226`, `src/outreach/draft-reply.tsx:145`
**Issue:** In a browser signed into several Google accounts, account 0 may not be the connected mailbox.
**Fix:** Use `https://mail.google.com/mail/?authuser=<connected email>#...`, taking the address from the sync state.

### IN-U08: Settings page re-implements the interests read

**File:** `src/app/(os)/settings/page.tsx:49-52`
**Issue:** It duplicates the shape validation and default from `loadInterests` in `@/server/outreach/queries`, so the two can drift.
**Fix:** `body = <OutreachSection interests={await loadInterests(h)} />`.

---

_Reviewed: 2026-10-13_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
