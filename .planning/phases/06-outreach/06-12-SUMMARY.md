---
phase: 06-outreach
plan: 12
subsystem: mail-send
tags: [mail, approvals, security, idempotency]
requires: [06-02, 06-05, 06-10]
provides: [mailReplyPayload, mail_reply approval kind, mail.send_reply tool, sendReply, saveReplyDraft]
key-files:
  created: [src/lib/mail-payload.ts, src/server/mail/send.ts, tests/db/mail-agent.test.ts]
  modified: [src/lib/approval-kinds.ts, src/server/agents/approvals.ts, src/server/agents/policy.ts, src/server/agents/tools/mail.ts, src/server/agents/registry.ts, src/approvals/approval-detail.tsx, src/approvals/approval-list.tsx, src/shell/ai/approval-card.tsx, tests/unit/approval-kinds.test.ts, tests/unit/policy.test.ts, tests/db/outreach-tools.test.ts]
decisions:
  - Recipients, thread and threading headers are always rebuilt in resolve() from the stored row and live Gmail headers (Reply-To preferred); the optional input fields exist only so executeApproved's re-parse keeps them.
  - toApproval only destructures; all validation is mailReplyPayload.safeParse in resolve() -> ToolError invalid_input.
  - The handler re-validates the approved payload with mailReplyPayload, so an invalid edit fails definitively.
  - Gmail "scope" errors during send become a ToolError with the Reconnect Google message; "auth" marks the Google connection errored.
metrics:
  completed: 2026-10-13
---

# Phase 6 Plan 12: Reply drafting and sending Summary

`mail.send_reply` is an APPROVE-tier, content-floored tool mapped to the new `mail_reply` approval kind. The owner approves (and can edit subject and body); recipients and thread are locked. Sending creates a threaded draft with a deterministic Message-ID, checkpoints the draft ids, then sends, and an ambiguous retry adopts what already happened instead of sending twice.

## Commits
- cba45c8 feat(06-12): mail_reply payload and approval kind contract
- 799fa61 feat(06-12): mail.send_reply approval tool with idempotent send and save-to-drafts helper

## Tests
- `npx vitest run tests/unit`: 49 files, 445 passed
- `npx vitest run tests/db`: 52 files, 405 passed
- `npx tsc --noEmit` clean; eslint 0 errors (pre-existing warnings only).

Security proofs (tests/db/mail-agent.test.ts, 12 tests; unit tests in approval-kinds and policy):
- (a) A model supplying attacker to/cc/threadId/inReplyTo/references: the stored approval payload has the Reply-To sender, empty cc, the stored thread; the sent MIME contains no "evil" string, no Cc header, and uses the stored threadId. Editing `to` on approve is rejected by LOCKED.
- (b) toApproval is called with `{}`, wrong types and null and never throws; validation errors surface as failed tool calls ("Add a subject.", "Unknown message.").
- (c) approvalKind("mail.send_reply") is mail_reply; the pending approval's tool call is tier APPROVE; audit rows contain no body text (including an edited body).
- (d) Idempotency: draft still exists -> sent once (1 create, 1 send); send landed with SENT label on the checkpointed message -> adopted (1 create, 1 send); new id on send found by rfc822msgid -> adopted; nothing found -> fresh send exactly once (2 creates, 1 send). 401 -> connection status "error", approval failed with ambiguous false, nothing sent.
- (e) CONTENT_TOOLS contains mail.send_reply (policy.test.ts).
- replyAll: cc = original To and Cc minus owner (case-insensitive) minus the recipient, deduped. Missing compose scope -> tool unavailable with "Reconnect Google".

## Deviations from Plan
- **[Rule 3 - blocking]** tests/db/outreach-tools.test.ts asserted every mail tool is READ and listed exactly two mail tools; updated to exclude/include mail.send_reply (its contract is covered in mail-agent.test.ts).
- UI maps in approval-detail/list/card are one-line entries only, as planned. Until plan 14 adds the mail shell, approval-detail renders a mail_reply approval through the generic event shell, so do not expose it in the UI before plan 14.
- Prettier flags a few touched files (line endings only, pre-existing repo state); not reformatted.

## Owner actions
None for this plan. Live sending needs Google re-consent with gmail.compose (tracked since 06-05); verify a real reply send in phase UAT.

No stubs.
