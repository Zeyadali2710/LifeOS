---
phase: 03-agent-infrastructure-github
plan: 12
subsystem: agents
tags: [approvals, worker, server-actions]
requires: [03-04, 03-11]
provides: [decide, saveEdit, executeApproved, expireDue, retryApproval, listApprovals, getApproval, approveAction, rejectAction, saveEditAction, retryApprovalAction, handleResume, handleExpire]
key-files:
  created: [src/server/agents/approvals.ts, src/server/approval-actions.ts, src/worker/jobs/agents.ts, tests/db/approvals.test.ts, tests/db/approval-actions.test.ts]
requirements-completed: [AGT-02, AGT-03]
completed: 2026-10-08
---

# Phase 3 Plan 12: Approval state machine, actions, worker handlers Summary

Compare-and-set approval lifecycle (pending -> approved -> executing -> executed/failed, plus rejected/expired), owner-only server actions, and worker handlers that execute then resume suspended runs.

## Decisions
- Resume uses `runQueued` (advance rebuilds tool_results from tool_calls rows), so no separate buildToolResults call in the worker. Delegated child approvals resume the child; its finish resumes the parent.
- Audit rows in approvals.ts are written with the caller's handle (not the global `audit()`), so they land in the right DB and are asserted in tests.
- Failure classification: GithubError client/auth/not_found/rate_limit = definite (ambiguous false, "GitHub rejected it: ..."); network/server/timeout/unknown = ambiguous (retry runs with adopt).
- Edited repo must equal the original repo ("Repository can't be changed.").
- handleResume executes the approval before the no-key check, so an approved action is never dropped for lack of an LLM key; the run is then failed (errorKind llm).
- retryApproval also requires expires_at > now.

## Deviations
None of substance. Handlers are not registered in the worker (plan 18).

## Verification
`npx vitest run tests/db/approvals.test.ts tests/db/approval-actions.test.ts` 16 passed; tsc and eslint clean.

## Known Stubs
None.

## Self-Check: PASSED
