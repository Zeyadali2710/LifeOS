---
phase: 03-agent-infrastructure-github
plan: 05
subsystem: agents
tags: [gateway, approvals, idempotency]
requires: [03-01, 03-02]
provides: [callTool, GatewayResult, fakeTools]
key-files:
  created: [src/server/agents/gateway.ts, tests/helpers/fake-tools.ts, tests/db/gateway.test.ts, tests/db/idempotency.test.ts]
metrics:
  completed: 2026-10-08
---

# Phase 3 Plan 05: Tool gateway Summary

callTool implements the six-step gateway (allow-list, liveness, cancel, availability, zod, resolve, tier policy, row claim, approval branch, handler with output validation) with injected tools.

## Decisions
- Idempotency (Task 2) is built into the single row-claim insert: `onConflictDoNothing()` with no target covers both the idempotency_key and (run_id, tool_use_id) unique indexes; the loser reads the stored row (done -> duplicate output, failed -> error, running -> "already running", waiting_approval -> same approvalId).
- Rejections (not allowed, not live, cancelled, unavailable, invalid input, resolve failure) are recorded as failed tool_calls rows and bump toolCallCount.
- Approval row + tool_calls row + toolCallCount bump are one transaction; activity/notification emitted after commit.
- Tests mock the registry via vi.mock.

## Deviations
None. The worktree started on a stale base and was reset to 0210b52 per the base check.

## Verification
7 DB tests pass (gateway + idempotency); `tsc --noEmit` clean.

## Commits
- dfd8348 feat(03-05): callTool gateway
- dee408c test(03-05): idempotency tests

## Self-Check: PASSED
