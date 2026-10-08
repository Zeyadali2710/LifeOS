---
phase: 03-agent-infrastructure-github
plan: 06
subsystem: agents
tags: [spend-cap, run-controls, threads, sweep]
requires: [03-01, 03-02]
provides: [spend.ts, runs.ts, threads.ts, handleSweep]
key-files:
  created:
    - src/server/agents/spend.ts
    - src/server/agents/runs.ts
    - src/server/agents/threads.ts
    - src/worker/jobs/sweep.ts
    - tests/db/spend.test.ts
    - tests/db/runs.test.ts
requirements-completed: [AGT-05]
completed: 2026-10-08
---

# Phase 3 Plan 06: Spend, run controls, threads Summary

Sydney-month spend accounting with an integer US$1..1000 cap (default 20) and once-per-month URGENT notice, plus pause/cancel/model/sweep/counts and thread storage, all DB-tested.

## Commits
- Task 1 (spend.ts + test): feat(03-06) spend accounting
- Task 2 (runs.ts, threads.ts, sweep.ts + test): feat(03-06) run controls

## Notes
- cancelRun on waiting_approval is one transaction with status-conditional updates (CAS); also cancels pending approval, waiting tool_calls and a waiting parent run.
- sweepOrphans only touches status = 'running' (stale heartbeat, or null heartbeat with stale startedAt).
- listThreads message count uses a raw correlated subquery (drizzle's column interpolation rendered unqualified `id`, matching the wrong table).

## Deviations
None of substance. `npm run typecheck` clean; vitest for both files passes (5 tests). Pre-existing eslint `no-explicit-any` errors in gateway.ts (plan 05) are out of scope.

## Self-Check: PASSED
