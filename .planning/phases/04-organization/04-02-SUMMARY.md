---
phase: 04-organization
plan: 02
subsystem: agents/approvals
tags: [approvals, dto, ui]
requirements: [ORG-02]
key-files:
  modified:
    - src/lib/agent-types.ts
    - src/server/agents/dto.ts
    - src/server/agents/approvals.ts
    - src/approvals/approval-detail.tsx
    - src/approvals/approval-list.tsx
    - src/shell/ai/approval-card.tsx
    - tests/unit/agent-dto.test.ts
metrics:
  completed: 2026-10-09
---

# Phase 4 Plan 02: Kind-tagged approval DTO and UI Summary

ApprovalDTO now carries `kind` and per-tool parsed payloads, toDTOs delivers calendar approvals, and the approval list/card/detail dispatch on kind with the GitHub issue view unchanged.

## Commits
- feat(04-02): kind-tagged ApprovalDTO and per-kind mapper
- feat(04-02): approval UI dispatches on kind (issue view unchanged)

## Verification
- `vitest tests/unit/agent-dto.test.ts tests/unit/approval-kinds.test.ts`: 12 passed
- `npm run typecheck`: clean; `npm run lint`: 0 errors (5 pre-existing warnings)
- DB regression suites (approvals, approval-actions, github-tools) NOT run: no Postgres in the worktree. They run at the 04-06 VM gate.

## Notes
- `ApprovalDetail` dispatches: `issueOf(a)` non-null renders `IssueApprovalBody` (the previous component body, own article/header, behaviour unchanged); event kinds render `EventApprovalShell` (header, reason, expiry, decisions) with the `renderEvent` slot for plan 04-20. Event edit is not offered (no edit form yet).
- toDTOs: repo privacy map applied to issue rows only; event kinds get `repoPrivate: null`.
- Resolved texts use `nothingText(kind)` for event kinds in both detail and card.

## Deviations
- [Rule 1] approval-list `a.edited && ...` changed to `a.edited != null && ...` because `edited` is now `unknown`.
- Worktree base reset to e0527e3 per startup check.

## Known Stubs
`renderEvent` has no supplier until plan 04-20 (intentional, per plan).

## Self-Check: PASSED
