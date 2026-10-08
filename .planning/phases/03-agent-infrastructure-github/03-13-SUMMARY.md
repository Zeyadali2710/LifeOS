---
phase: 03-agent-infrastructure-github
plan: 13
subsystem: api
tags: [chat, ndjson, threads, status]
requires: [03-06, 03-07, 03-11]
provides: [POST /api/chat, GET /api/threads, GET /api/threads/[id], GET /api/agents/status, assistantStatus, startChat, threadDetail, useAgentStatus]
key-files:
  created: [src/server/agents/chat.ts, src/app/api/chat/route.ts, src/app/api/threads/route.ts, "src/app/api/threads/[id]/route.ts", src/app/api/agents/status/route.ts, src/shell/use-agent-status.ts, tests/db/chat-route.test.ts]
requirements-completed: [AGT-04, AGT-05]
completed: 2026-10-08
---

# Phase 3 Plan 13: Chat endpoint, threads, status Summary

NDJSON streaming chat endpoint over the real loop, with session, JSON content-type and Origin checks, a 10/min rate limit and key/pause/cap preflight (409/429, no run row created). Plus thread list/detail routes, the status route, and a debounced `useAgentStatus` hook.

## Decisions
- Preflight order in `startChat`: no_key, rate_limited, paused, cap; thread and user message are created only after it passes (no orphan threads).
- `threadDetail` builds one turn per top-level run in the thread (ordered by createdAt); steps include child-run (delegate) steps, which have `threadId` null and are found via `parentRunId`.
- `request.signal` only stops writing; it is never passed to `advance`.

## Deviations
None of substance. Hook defers its first fetch with `setTimeout(0)` to satisfy the react-hooks/set-state-in-effect rule. One remaining eslint warning (window.location.assign to /login) mirrors live-provider.

## Verification
`npx vitest run tests/db/chat-route.test.ts` 4 passed; `npm run typecheck` clean; eslint 0 errors on touched files. `next build` not run (orchestrator, end of wave).

## Self-Check: PASSED
