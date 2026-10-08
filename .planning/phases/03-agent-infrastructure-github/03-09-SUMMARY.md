---
phase: 03-agent-infrastructure-github
plan: 09
subsystem: agents
tags: [github, tools, approval]
requires: [03-04, 03-05]
provides: [githubTools]
key-files:
  created:
    - src/server/agents/tools/github.ts
    - tests/db/github-tools.test.ts
decisions:
  - "All DB-backed reads share one { connected, message?, items[] } output envelope and a dbRead() factory"
  - "create_issue handler needs ctx.approvalId; adoption only runs when ctx.adopt is set"
requirements-completed: [AGT-01, AGT-03, AGT-06]
completed: 2026-10-08
---

# Phase 3 Plan 09: GitHub agent tools Summary

Projects-agent GitHub tools: five DB-backed READ tools, one live read-token PR fetch, and an APPROVE-tier `create_issue` that uses only the write token, appends a `lifeos-approval:{id}` marker and adopts an existing marked issue on ambiguous retry.

## Commits
- see `git log` (feat(03-09))

## Deviations
- Acceptance grep `tier: "READ"` returns 2 rather than 6: the five DB reads share a `dbRead()` factory, so the literal appears once there and once in get_pull_request. All 6 tools verified as READ in the test. `tier: "APPROVE"` appears exactly once; `writeToken(` occurs only in connections.ts and tools/github.ts.
- Tests mock `@/server/env` to supply a master key; audit-write log noise in tests is the known plan-04 behavior.

## Verification
`npx vitest run tests/db/github-tools.test.ts` 4 passed; `npm run typecheck` and eslint clean.

## Known Stubs
None.

## Self-Check: PASSED
