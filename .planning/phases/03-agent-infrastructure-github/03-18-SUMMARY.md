---
phase: 03-agent-infrastructure-github
plan: 18
subsystem: worker-shell
tags: [pg-boss, shell, agents]
requires: [03-06, 03-08, 03-12, 03-13]
provides: [worker job registration, live agent status in shell]
key-files:
  modified:
    - src/worker/index.ts
    - src/shell/sidebar.tsx
    - src/shell/top-bar.tsx
    - src/shell/palette-items.ts
    - src/shell/palette.tsx
    - src/shell/notification-row.tsx
    - src/shell/activity-list.tsx
    - src/app/(os)/page.tsx
    - tests/unit/palette.test.ts
metrics:
  tasks: 2
  completed: 2026-10-08
---

# Phase 3 Plan 18: Worker jobs and live shell status Summary

Worker now schedules github.sync (15m, singleton, plus an initial send), approval.expire and run.sweep (5m), and works agent.resume (retryLimit 3, backoff); sidebar, top bar, Home, palette and notification rows show live agent state.

## Commits
- Task 1: worker registration (feat(03-18) worker jobs)
- Task 2: shell wiring (feat(03-18) shell status)

## Deviations
- palette.tsx (not in plan file list) changed to feed `approvalsWaiting` from `useAgentStatus` into `buildPalette`; `Item` exported from activity-list.tsx so Home reuses the existing activity row.
- Retry options set on `createQueue` for resume (pg-boss queue-level), not per work call.
- CI GitHub URLs open via `window.open(..., "noopener,noreferrer")` after `isSafeGithubUrl`.

## Verification
palette test 6/6, typecheck clean, eslint 0 errors (pre-existing warnings only), build:worker OK.

## Self-Check: PASSED
