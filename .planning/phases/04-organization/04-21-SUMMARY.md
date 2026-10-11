---
phase: 04-organization
plan: 21
subsystem: palette/gate
tags: [palette, e2e, validation, owner-gate]
requires: ["04-15", "04-19", "04-20"]
provides: [paletteSearchAction, organization e2e, phase 4 sign-off]
key-files:
  created:
    - src/server/palette-actions.ts
    - tests/e2e/organization.spec.ts
  modified:
    - src/shell/palette-items.ts
    - src/shell/palette.tsx
    - src/organization/organization-view.tsx
    - tests/unit/palette.test.ts
    - tests/e2e/agents.spec.ts
    - tests/e2e/settings.spec.ts
    - .planning/phases/04-organization/04-VALIDATION.md
requirements-completed: [ORG-01, ORG-02, ORG-03]
completed: 2026-10-12
---

# Phase 4 Plan 21: Palette, e2e and phase gate Summary

New event / New task palette commands with data-backed Events and Tasks scopes, Organization/Settings/Agents e2e specs, and the owner's live VM sign-off of the whole phase ("Approved").

## Commits
- a053867 feat(04-21): palette commands and Events/Tasks scopes (Task 1)
- 16d640e test(04-21): organization/settings/agents e2e specs and validation map (Task 2)
- Task 3: owner live verification on the VM, reply "Approved"
- Gate fixes during Task 3: f8f4862, 31fccfd, 74be472 (below)

## Verification
- Initial VM DB run 140/144 (4 failures, fixed below). After fixes: full DB suite 38 files / 206 tests green against a real Postgres (throwaway test DB via scripts/vm-db-test.sh compose db).
- Unit 246/246. Full Playwright e2e: 73 passed, 16 skipped (project-scoped skips), 0 failed.
- Owner live-verified steps 3-9 (Google + iCloud connect, combined Day/Week/Month views, owner writes, recurring scopes, AI approvals APPROVE / HIGH_RISK, reminders, palette) and the four known weak spots: "Approved".

## Deviations from Plan / Issues Found at the Gate

**1. [Rule 1 - Bug] checkLocked key-order comparison (f8f4862).** `checkLocked` compared locked fields with `JSON.stringify`; jsonb reorders the stored `before` snapshot keys, so every agent `calendar.update_event` approval was rejected "This can't be changed." Now key-order-independent (`src/lib/approval-kinds.ts`), with a unit regression in `tests/unit/approval-kinds.test.ts`.

**2. [Rule 1 - Spec mismatch] Conflict activity detail (f8f4862).** "Conflict found" detail now matches UI-SPEC "{A} overlaps {B} · {time}" (`src/server/calendar/sync.ts`).

**3. [Test fixes] (f8f4862).** Per-file DB isolation in icloud-connect and calendar-sync; conflict time is the overlap start (07:30); Google sync fixture scripts the owned Family calendar (owned calendars start ticked per UI-SPEC D-01).

**4. [Test fix] Quick-add e2e (31fccfd).** Scoped to the Tasks region (task also renders in Today's plan, causing a strict-mode violation; the toPass retry was resubmitting).

**5. [Test fix] Shell-nav e2e (74be472).** Expects the real Organization H1 variants.

## Known Stubs
None.

## Self-Check: PASSED
