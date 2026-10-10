---
phase: 04-organization
plan: 17
subsystem: agents
tags: [organization-agent, calendar-tools, approvals, private-data, clock]
requires: [04-02, 04-09, 04-14]
provides: [calendarTools, live organization agent, Tool.private taint, Sydney clock line]
affects: [orchestrator delegation, loop routing gate]
key-files:
  created:
    - src/server/agents/tools/calendar.ts
    - tests/db/calendar-tools.test.ts
    - tests/db/calendar-privacy.test.ts
  modified:
    - src/server/agents/types.ts
    - src/server/agents/tools/index.ts
    - src/server/agents/registry.ts
    - src/server/agents/loop.ts
    - tests/unit/agent-contracts.test.ts
key-decisions:
  - "Locked fields (calendarId/label/provider, eventId, etag, scope, instanceStart, before, title/times for delete) are rebuilt from the DB in resolve; model values are overwritten. Payloads are validated in resolve so bad input is a clean tool error, not a gateway throw."
  - "Read output carries ISO times plus a Sydney 'when' label (Thu 8 Oct 14:00-15:00); free slots (epoch ms) are formatted the same way."
  - "Tasks stay READ-only for the agent."
requirements-completed: [ORG-02, ORG-03]
duration: ~35min
completed: 2026-10-10
---

# Phase 4 Plan 17: Organization agent Summary

Organization agent is live: seven calendar/task tools (4 private READ, create/update APPROVE, delete HIGH_RISK), orchestrator delegation, a Sydney "Current time" line on every system prompt, and a per-tool private taint that moves free-model runs to Sonnet after calendar data is read.

## Tasks
1. Calendar and task tools: `510a036` (types.ts `private`, tools/calendar.ts, tools/index.ts, tests/db/calendar-tools.test.ts)
2. Registry flip, clock line, taint: `bd8188a` (registry.ts, loop.ts, agent-contracts test, tests/db/calendar-privacy.test.ts)

## Behaviour notes
- Agent writes call 04-14 `createEvent/updateEvent/deleteEvent` with `actor: "agent"` and the approvalId (deterministic Google/iCloud remote id for creates). No `repeat` field exists on any tool input.
- Update retry with `ctx.adopt` succeeds if the stored non-recurring event already equals the target (`ponytail:` ceiling: recurring edits report "changed"). Delete retry with `adopt` treats a missing event as success.
- Loop: `taintByTool` sets `tainted` and `agent_runs.saw_private` after each tool batch and on the resume path when any called tool has `private: true`; the existing D-09 gate does the switch. Name-matching taint untouched.

## Deviations from Plan
None of substance. `tests/unit/agent-contracts.test.ts` expectations updated (organization live, arrival null) as the plan anticipated; one assertion added.

## Verification
- `npm run typecheck` clean; eslint clean for touched files; `npx vitest run tests/unit/agent-contracts.test.ts tests/unit/routing.test.ts` passes (27 tests).
- **DB tests NOT run (no local Postgres): UNVERIFIED.** Run on the VM:
  `bash scripts/vm-db-test.sh tests/db/calendar-tools.test.ts tests/db/calendar-privacy.test.ts tests/db/routing-loop.test.ts tests/db/loop.test.ts tests/db/agent-queries.test.ts tests/db/github-tools.test.ts`
  The two new DB test files were written blind and may need small harness fixes (mock shapes, seeding).

## Known Stubs
None.

## Self-Check: PASSED
Files and commits `510a036`, `bd8188a` exist.
