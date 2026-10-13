---
phase: 06-outreach
plan: 17
subsystem: outreach-ui
tags: [outreach, email, follow-ups, gmail, approvals]
requires: [06-14, 06-16]
provides: [mail-read-queries, email-tab, draft-reply-block, follow-ups-tab]
affects: [06-18]
key-files:
  created:
    - src/server/mail/queries.ts
    - tests/db/mail-queries.test.ts
    - src/outreach/email-view.tsx
    - src/outreach/email-card.tsx
    - src/outreach/email-detail.tsx
    - src/outreach/draft-reply.tsx
    - src/outreach/follow-ups.tsx
  modified:
    - src/outreach/outreach-view.tsx
    - src/app/(os)/outreach/page.tsx
    - src/lib/outreach-types.ts
requirements-completed: [OUT-02, OUT-03]
completed: 2026-10-13
---

# Phase 6 Plan 17: EMAIL and FOLLOW-UPS tabs Summary

The Outreach page now has EVENTS, EMAIL and FOLLOW-UPS tabs with real counts: triaged mail with a live plain-text body, the full draft-to-approval flow inside the email detail, and a list of open event/email-linked tasks.

## Commits
- 71e080a feat(06-17): mail and follow-up read queries
- 3374245 feat(06-17): EMAIL tab with triaged mail, live plain-text body and draft block
- fb26c17 feat(06-17): FOLLOW-UPS tab and EMAIL/FOLLOW-UPS tablist wiring

## What was built
- `queries.ts`: `mailStatus` (not_connected / scope_missing / reconnect / first_sync / ok + sync error + triage pause), `loadMailView` (counts incl. UNTRIAGED/ARCHIVED, newest-first list, inbox count; explicit columns, no body), `pendingReplyFor` (newest `mail.send_reply` approval, pending or resolved within a day), `listFollowUps` / `followUpCount`, `mailCatOf`. 6 DB tests.
- EMAIL: category nav (chip row below 1100px), EmailCard list with Up/Down roving selection, EmailDetail (AI SUMMARY or Triage button, ACTION ITEMS with Add as task, MESSAGE fetched live as a plain-text node, Archive/Unarchive and Flag with the specified toasts), mobile full-height sheet via `useDialog`. Honest states: three Gmail EmptyStates with Open Settings, `Syncing your inbox`, sync error, triage-paused note.
- DRAFT REPLY block: none / drafting / pending (locked To/Cc, edit subject+body, Send reply, Save to Gmail drafts, Reject draft) / resolved (sent, moved to drafts), reusing `validateMailDraft` and the same approve/save-edit/reject actions as /approvals.
- FOLLOW-UPS: due-sorted rows, optimistic checkbox (`toggleTaskAction`), context links, `Draft with agent` (switches to EMAIL with `?draft=1`) or `Open event`.
- Page loads mail and follow-ups in a separate try block so an email failure does not take down EVENTS.

## Deviations from Plan
- [Rule 3] `MailMessageDTO` already existed in `outreach-types.ts` (from/threadId shape); reused it instead of adding a second one.
- [Rule 2] Added `mailCatOf` so a bare `?mail=` link (notifications, follow-ups) opens the category that contains the mail.
- `?draft=1` one-shot param starts the draft when arriving from FOLLOW-UPS.
- Drafting state is client-side: set on click, cleared when the approval appears; a terminal run frame mentioning the mail id flips it to the failure/cap line. If the cap blocks run creation before any run exists, the block shows the cap line when triage is paused (used as the cap proxy).
- Follow-ups list is only queried when `tab=follow-ups`; the count is always loaded.
- Body fetch needs a real Gmail connection; with a dummy e2e connection it lands in the "Couldn't load the message" error state (expected).

## Verification
- `npx tsc --noEmit`, eslint (src/outreach, outreach route, src/server/mail), glass gate: clean.
- `npx vitest run tests/unit`: 50 files, 453 tests passed.
- `npx vitest run tests/db`: 55 files, 430 tests passed (mail-queries: 6).
- Playwright shell-nav + organization + outreach: 22 passed, 4 skipped (viewport-specific by design).

## Owner actions
- Visual pass on the VM with a connected Gmail account: category nav at 760-1099px, mobile sheet, a real "Draft with agent" round trip (needs an Anthropic key and the worker), and Open in Gmail on a long message.

## Known Stubs
None.

## Self-Check: PASSED
