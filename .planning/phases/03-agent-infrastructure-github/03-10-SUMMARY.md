---
phase: 03-agent-infrastructure-github
plan: 10
subsystem: settings
tags: [settings, github, spend-cap, server-actions]
requires: [03-03, 03-04, 03-06]
provides: [settings page (Connections, AI and spend), settings server actions]
affects: [src/app/(os)/settings/page.tsx]
key-files:
  created:
    - src/server/settings-actions.ts
    - tests/db/settings-actions.test.ts
    - src/settings/settings-nav.tsx
    - src/settings/connection-row.tsx
    - src/settings/token-form.tsx
    - src/settings/connections-section.tsx
    - src/settings/spend-section.tsx
  modified:
    - src/app/(os)/settings/page.tsx
requirements-completed: [AGT-05, AGT-06]
completed: 2026-10-08
---

# Phase 3 Plan 10: Settings Summary

Settings page with owner-guarded token, sync and spend-cap actions, a Connections section (GitHub read/write, read-only Anthropic row) and an AI and spend section.

## What was built
- `settings-actions.ts`: saveTokenAction, removeTokenAction, syncNowAction, setSpendCapAction. Each starts with `await requireOwner()` and validates with zod. Results never contain the token. Enqueues `github.sync` (singletonKey `github.sync`) after a read-token save and on Sync now.
- Settings page (`?section=connections|ai`, awaits `searchParams`) with nav, header and SignOut.
- Token form: password input, state cleared right after submit, the four UI-SPEC error messages.
- Remove-token dialog with focus on Cancel.
- Spend section: cap input, amber below-MTD helper, progress, per-model table with `scope="col"`.

## Verification
`npx vitest run tests/db/settings-actions.test.ts` passes (4 tests). `tsc --noEmit` and eslint are clean (0 errors, 0 warnings).

## Deviations
- Worktree HEAD began at 74fb125, not the expected base. I reset to 9f08627 per the branch check.
- Connections nav icon is `hub`, because `extension` is not in the icon set.
- Decision: private-repo lock is read from `github_repos` by full name in the page and passed as a privacy map. Repos not yet synced show no lock.
- Decision: a successful read-token save also enqueues a sync; the enqueue failure is swallowed so the save still succeeds.
- No UI component tests or browser check were run (none in plan).

## Self-Check: PASSED
