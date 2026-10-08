---
phase: 03-agent-infrastructure-github
plan: 16
subsystem: ui
tags: [approvals, edit-before-approve, sse]
requires: [03-03, 03-04, 03-07, 03-12]
key-files:
  created: [src/approvals/approvals-view.tsx, src/approvals/approval-list.tsx, src/approvals/approval-detail.tsx, src/approvals/approval-edit-form.tsx]
  modified: [src/app/(os)/approvals/page.tsx]
requirements-completed: [AGT-02]
completed: 2026-10-08
---

# Phase 3 Plan 16: Approval Centre page Summary

`/approvals` now lists pending/resolved approvals live over SSE, with a detail pane for edit-before-approve, CREATE ISSUE / REJECT, and resolved footers (including Retry).

## What was built
- `page.tsx`: `requireOwner`, `await searchParams` (uuid-validated `id`), loads pending/resolved/selected + issues-write connection facts; unknown id shows the "That approval isn't available." InlineError.
- `approvals-view.tsx`: live count headline, list/detail panes, `useLiveEvents("approval")` upsert (moves to resolved, polite "Approval {state}"), mobile (<720) list-or-detail with back and prev/next 44px buttons. No auto-select after a decision.
- `approval-list.tsx`: tablist, listbox/options with roving arrows, exact empty copy, state colours, EDITED badge.
- `approval-detail.tsx`: facts, data-sent rows, escaped pre-wrap preview, EDITED + "View agent's original" Disclosure, CREATE ISSUE / EDIT-DONE / REJECT, missing-token explanation with Open Connections link, resolved `role="status"` footer focused on mount (no Undo, Retry on failed).
- `approval-edit-form.tsx`: Title/Body/Labels fields validated by `issuePayloadSchema`, read-only repo.

## Deviations
- Resync frames (`dto === null`) do not refetch; the server page re-keys the view on next navigation (no list-fetch action exists). Minor staleness after an SSE reconnect.
- Selection updates the URL with `history.replaceState` (client state) rather than a server navigation.
- Not browser-tested; e2e is plan 19.

## Verification
`npm run typecheck` clean; eslint 0 problems on touched files; no `Undo` / `dangerouslySetInnerHTML` in `src/approvals`.

## Known Stubs
None.

## Self-Check: PASSED
