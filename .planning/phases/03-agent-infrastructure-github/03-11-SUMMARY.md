---
phase: 03-agent-infrastructure-github
plan: 11
subsystem: agents
tags: [loop, delegate, resume, limits]
requires: [03-05, 03-06, 03-07, 03-09]
provides: [createRun, advance, buildToolResults, resumeParent, retryRun, runQueued, TOOLS, toolLabel, delegateTool]
key-files:
  created: [src/server/agents/loop.ts, src/server/agents/tools/delegate.ts, src/server/agents/tools/index.ts, tests/db/loop.test.ts]
  modified: [src/server/agents/gateway.ts]
requirements-completed: [AGT-02, AGT-04, AGT-05]
completed: 2026-10-08
---

# Phase 3 Plan 11: Resumable agent loop Summary

Resumable, limited, cancellable agent loop: all state (messages, usage, tool calls) persisted per turn, tool calls routed through the gateway, one-level delegation to the Projects agent, suspend on approval and resume from persisted rows.

## Decisions
- `advance` accepts runs in `queued` or `waiting_approval`; on resume it rebuilds tool_results for a trailing assistant tool_use turn from tool_calls rows, and re-suspends if any are still pending.
- Delegate child waiting on an approval: the delegate tool_call is set to waiting_approval and the parent suspends. When the child reaches a terminal state, `resumeParent` (called from the child's finish) closes the delegate call and advances the parent. It no-ops unless the parent is waiting_approval, so inline delegation is unaffected.
- createRun skips re-adding the prompt if it is already the last thread message (avoids a duplicate user turn when the chat route stores it first).
- retryRun returns `{ok:false, code:"not_retryable"}` for non-terminal-failed runs.

## Deviations
- [Rule 3] Added an optional `onClaimed` hook to `GatewayCtx` in gateway.ts (3 lines) so the loop can emit the "running" step with the real row id before the handler (and before child steps for delegation). Not in the plan's file list; additive, gateway tests still pass.

## Verification
`npx vitest run tests/db/loop.test.ts tests/db/gateway.test.ts` 14 passed; `tsc --noEmit` and eslint clean; `"delegate"` appears once in registry.ts.

## Known Stubs
None.

## Self-Check: PASSED
