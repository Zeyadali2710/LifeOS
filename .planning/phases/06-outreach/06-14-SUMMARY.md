---
phase: 06-outreach
plan: 14
subsystem: mail-actions-and-approval-ui
tags: [mail, gmail, approvals, server-actions, redaction]
requires: [06-08, 06-11, 06-12]
provides: [mail-actions, mail-approval-ui]
affects: [src/server/mail-actions.ts, src/approvals, src/shell/ai/approval-card.tsx]
key-files:
  created: [src/server/mail-actions.ts, src/approvals/mail-approval.tsx, tests/db/mail-actions.test.ts, tests/unit/mail-approval-draft.test.ts]
  modified: [src/server/tasks.ts, src/server/agents/tools/calendar.ts, src/server/agents/tools/projects.ts, src/lib/project-types.ts, src/server/project-queries.ts, src/approvals/approval-detail.tsx, src/approvals/approval-list.tsx, src/approvals/event-approval.tsx, src/shell/ai/approval-card.tsx, tests/db/project-queries.test.ts]
requirements-completed: [OUT-03]
completed: 2026-10-13
---

# Phase 6 Plan 14: Mail actions and mail approval UI Summary

Seven owner-only mail server actions (live body, local archive/flag, Add as task, triage-one, Sync now, Save to Gmail drafts) plus the mail_reply approval UI on /approvals (detail, list row) and in the AI panel card, with mail-linked task titles redacted from agent tools.

## Commits
- 240ae8f feat(06-14): owner mail actions with save-to-drafts and mail-task redaction
- 5f6022e feat(06-14): mail_reply approval UI on /approvals and in the AI panel

## What was built
- `src/server/mail-actions.ts`: each action starts with `requireOwner()` and zod-parses args. getMailBodyAction fetches live via Gmail getFull and returns capped plain text (nothing stored; no read scope -> `not_connected`). archive/flag only set `archivedAt`/`flaggedAt` (zero Gmail calls). addMailTaskAction creates the task and sets `mail_message_id` in one transaction, dedupes an open task with the same title, falls back to no due date if the model date is unusable. triageMailAction pre-checks the spend cap (`paused`) and enqueues `{ ids: [id] }` with singletonKey `mail.triage.one:{id}`. saveReplyToDraftsAction creates a Gmail draft, then claims pending -> rejected with `result.gmailDraftId`; a lost claim deletes the draft and returns `not_pending`; audit carries `movedToDrafts: true` and no body.
- D-28: `MAIL_TASK_TITLE` / `mailLinkedTaskIds` in tasks.ts; tasks.list, projects.list nextTask and projects.get tasks emit "Email follow-up (private)" for mail-linked tasks.
- `src/approvals/mail-approval.tsx`: mailOf, toMailDraft, validateMailDraft (recipients/thread always from base), sameMail, mailResolved, MailApprovalBody (untrusted note, facts, data-sent list, locked To/Cc preview, edit form). Text nodes only.
- approval-detail.tsx: MailApprovalShell (SEND REPLY / EDIT / SAVE TO GMAIL DRAFTS / REJECT), dispatcher guarded by payloadSchemaFor safeParse, resolved states incl. "Moved to Gmail drafts" and the Reconnect Google link. List row gets the `mail` icon and subject. AI card gets the mail_reply branch.

## Verification
- `npx tsc --noEmit`, eslint on touched files (0 errors; only pre-existing warnings), glass gate: clean
- `npx vitest run tests/unit`: 50 files, 452 tests passed
- `npx vitest run tests/db`: 53 files, 418 tests passed (mail-actions.test.ts: 13 tests)
- `npx playwright test tests/e2e/approvals.spec.ts tests/e2e/project-approval.spec.ts`: 11 passed, 1 skipped (desktop-only test on mobile project, by design)

## Deviations
1. [Rule 3] `nextTask` in project cards gained `id` (src/lib/project-types.ts, project-queries.ts) so projects.list can redact by task id; tests/db/project-queries.test.ts expectation updated.
2. [Rule 3] `Fact` in event-approval.tsx is now exported and shared by the mail body and detail shell (removes a duplicate in approval-detail.tsx).
3. WHERE fact reads "Gmail" without the connected address: the address is not in the approval payload and the client has no connection data; adding a fetch was out of scope.
4. "Open email" link uses the local `messageId` (validated uuid) from the payload, not the Gmail id from the send result.
5. SAVE TO GMAIL DRAFTS patches the visible approval locally (status rejected, `result.gmailDraftId`) because the action returns no approval row; live frames confirm it.
6. The "approval was no longer pending" delete-draft path is tested by flipping the approval to approved mid-request (race simulation) since the action also pre-checks pending and returns without touching Gmail.

## Owner actions
None.

## Self-Check: PASSED
