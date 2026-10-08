---
phase: 03-agent-infrastructure-github
plan: 07
subsystem: live
tags: [sse, dto, hub]
requires: [03-01, 03-02]
provides: [toRunDTO, toStepDTO, toApprovalDTO, run/approval SSE kinds, useLiveEvents]
key-files:
  created: [src/server/agents/dto.ts, tests/unit/agent-dto.test.ts]
  modified: [src/server/events.ts, src/server/hub.ts, src/lib/live-types.ts, src/shell/live.ts, src/shell/live-provider.tsx, tests/db/hub.test.ts, tests/unit/live.test.ts]
requirements: [AGT-04, AGT-05]
completed: 2026-10-08
---

# Phase 3 Plan 07: Live run/approval events Summary

Run and approval changes now stream over the existing SSE hub as RunDTO/ApprovalDTO, with pure DTO mappers shared by query modules and a `useLiveEvents` hook for client components.

## Tasks
1. DTO converters (f9a2fc8): pure toRunDTO/toStepDTO/toApprovalDTO; no messages/ciphertext exposed.
2. Live kinds end to end: LiveKind + hub whitelist (DATA_KINDS) + loadEventRow branches + isRun/isApproval guards + `useLiveEvents(kind, cb)` in live-provider (subscriber set via context, not provider state). Subscribers get `null` as a "refetch" signal on resync/reconnect.

## Deviations
- Worktree was based on an older commit; reset to the specified base e6ecc23 at start.
- Delegate step action uses `Delegating to ${labels(tool)}` (labels lookup supplies the agent name; falls back to the raw tool value).

## Verification
vitest (agent-dto, hub, live, all unit) pass; `npm run typecheck` clean.

## Self-Check: PASSED
