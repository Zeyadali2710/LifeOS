---
phase: 04-organization
plan: 20
subsystem: agents-ui
tags: [approvals, calendar, ai-panel]
requires: [04-02, 04-05, 04-17]
provides: ["EventApprovalBody (create preview, update diff, delete warning, edit form)", "StepDTO.items / itemsMore", "ApprovalDTO.targetChanged", "AgentStatusDTO.calendarConnected", "events ResultCard + calendar examples"]
affects: [src/approvals, src/shell/ai, src/server/agents]
key-files:
  created: [src/approvals/event-approval.tsx]
  modified: [src/lib/agent-types.ts, src/server/agents/dto.ts, src/server/agents/approvals.ts, src/server/agents/chat.ts, src/approvals/approval-detail.tsx, src/shell/ai/approval-card.tsx, src/shell/ai/result-card.tsx, src/shell/ai-panel.tsx, tests/unit/agent-dto.test.ts, tests/unit/execution-trace.test.ts]
decisions:
  - "EventApprovalShell owns edit state and renders EventApprovalBody directly; the unused renderEvent slot from 04-02 was removed"
  - "targetChanged is computed only for pending update/delete approvals (missing event or etag mismatch = true)"
metrics:
  tasks: 3
  completed: 2026-10-10
---

# Phase 04 Plan 20: Calendar approval views and AI events card Summary

Per-kind calendar approvals (create preview, update before/after diff, delete red warning with REJECT focused first, stale-target amber block) and an events result card plus calendar examples in the AI panel.

## What was built
- DTOs: `ResultItemDTO`, `StepDTO.items/itemsMore` (max 8, same-origin hrefs built only from validated ymd/uuid), `ApprovalDTO.targetChanged` (etag lookup in `toDTOs`), `AgentStatusDTO.calendarConnected`.
- `event-approval.tsx`: facts, data-sent rows, preview/diff/delete warning, edit fields (calendar, scope and repeat read-only), client validation with `payloadSchemaFor` before save/approve, resolved texts incl. "View in calendar" link.
- `approval-detail.tsx`: event shell with EDIT/DONE, ADD TO CALENDAR / UPDATE EVENT / DELETE EVENT (red), approve disabled with the amber message when `targetChanged`.
- AI panel: events ResultCard rows (Next Link, "Show n more", "Open Connections" on no-calendar answer, closes panel on mobile after navigating), calendar examples, empty-thread copy.

## Deviations from Plan
- [Rule 3] `tests/unit/execution-trace.test.ts` (outside files_modified) updated for the two new required StepDTO fields so typecheck passes.
- Example rows: with a calendar and a repo, two GitHub plus two Organization rows; with a calendar and no repo, all four Organization rows.

## Verification
agent-dto/execution-trace/icons tests, full unit suite (235) pass; typecheck clean; lint 0 errors. The VM DB regression (`tests/db/approvals*.test.ts`) was not run (owner tests on the VM only).

## Known Stubs
None.

## Self-Check: PASSED
