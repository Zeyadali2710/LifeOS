---
phase: 03-agent-infrastructure-github
plan: 14
subsystem: agents
tags: [read-models, owner-actions, command-centre]
requires: [03-06, 03-07, 03-11]
provides: [agentsOverview, agentDetail, recentRuns, runDetail, pauseAllAction, resumeAllAction, pauseAgentAction, resumeAgentAction, cancelRunAction, retryRunAction, setAgentModelAction]
key-files:
  created: [src/server/agents/queries.ts, src/server/agent-actions.ts, tests/db/agent-queries.test.ts, tests/db/agent-actions.test.ts]
requirements-completed: [AGT-05]
completed: 2026-10-08
---

# Phase 3 Plan 14: Agent read models and owner actions Summary

SQL-aggregate read models for the Command Centre, agent detail and run detail (server-side redacted tool I/O), plus seven owner-guarded control actions with audit rows.

## Decisions
- Disabled agents return `stats: null`; live agents without runs get `{last:null, queue:0, health:null, sparkline: 24 zeros}`.
- Status precedence PAUSED > WORKING > ATTENTION (last run failed, or github_read in error for projects) > ONLINE/READY. `globalPaused` is detected via `isPaused(h, "__global__")` (unregistered id isolates the global flag).
- recentRuns cursor is the last item's created_at as a microsecond ISO string; ties on identical timestamps could be skipped (marked `ponytail:`).
- Actions return `{ok, code?, runId?}`, audit only on success (`agents.pause_all`, `agents.resume_all`, `agents.pause`, `agents.resume`, `run.cancel`, `run.retry`, `agent.model`); errors are logged and return `{ok:false}`.
- "runsToday" is the rolling 24h count of top-level runs.

## Deviations
None. Tests truncate `agent_runs, agents, settings` per test since the test DB is per file, not per test.

## Verification
`npx vitest run tests/db/agent-queries.test.ts tests/db/agent-actions.test.ts` 11 passed; `tsc --noEmit` and eslint clean; 7 `await requireOwner()`; no `messages` in queries.ts.

## Known Stubs
None.

## Self-Check: PASSED
