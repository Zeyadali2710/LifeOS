---
phase: 04-organization
plan: 01
subsystem: agents/approvals
tags: [approvals, calendar, zod]
requirements: [ORG-02]
key-files:
  created:
    - src/lib/approval-kinds.ts
    - src/lib/event-payload.ts
    - src/server/calendar/errors.ts
    - tests/unit/approval-kinds.test.ts
  modified:
    - src/server/agents/approvals.ts
    - src/server/agents/dto.ts
    - src/server/agents/gateway.ts
    - src/server/db/schema.ts
    - tests/db/approvals.test.ts
metrics:
  completed: 2026-10-09
---

# Phase 4 Plan 01: Per-kind approval machine Summary

Approvals now validate, lock, execute and expire per tool kind (issue / event_create / event_update / event_delete), with ProviderError mapped to definite/ambiguous failures; issue behaviour is unchanged.

## Commits
- 1095fc4 feat(04-01): per-kind contracts (approval-kinds, event-payload, ProviderError) + unit test
- see git log: feat(04-01): generalise approval machine per tool kind

## Verification
- `vitest tests/unit/approval-kinds.test.ts tests/unit/agent-dto.test.ts`: 11 passed
- `npm run typecheck`, eslint on touched files: clean
- DB tests NOT run (no Postgres in worktree). A new "calendar kind" test was added to tests/db/approvals.test.ts; the regression gate (approvals, approval-actions, github-tools, gateway) runs at the 04-06 VM gate.

## Deviations
- [Rule 1] approvalSummary for kind "issue" uses a loose string check on repo/title (not issuePayloadSchema) so Phase 3 notifications for any payload (e.g. the test.approve fake) stay identical.
- The hung-executing sweep picks its message by SQL `case` on `tool like 'calendar.%'` (single UPDATE, no per-row loop).
- toDTOs skips event-kind rows until 04-02 tags the DTO.
- Worktree base was corrected with `git reset --hard aec7ff3` per the startup check.

## Known Stubs
None.

## Self-Check: PASSED
