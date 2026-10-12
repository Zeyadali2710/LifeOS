---
phase: 05-career-projects
plan: 10
subsystem: ui
tags: [projects, workspace, clipboard, timeline]
requires: [05-05, 05-06, 05-08]
provides:
  - /projects/[id] workspace view (CAR-02 timeline/blockers, CAR-03 Claude Code workspace card)
key-files:
  created:
    - src/projects/workspace-card.tsx
    - src/projects/blockers-list.tsx
    - src/projects/project-tasks.tsx
    - src/projects/timeline-strip.tsx
    - src/projects/project-workspace.tsx
    - src/app/(os)/projects/[id]/page.tsx
metrics:
  completed: 2026-10-13
---

# Phase 5 Plan 10: Project workspace Summary

Per-project workspace at /projects/[id]: header, Claude Code card (copy brief / launch command, no live session), tasks with milestone filter and Blocked badges, milestones plus accessible timeline strip, derived blockers, health, links, dependencies and activity, with edit/archive/delete from the page.

## Commits
- 6803cef workspace card + blockers list
- db0f76e project tasks, milestone list, timeline strip
- 5b03f22 workspace composition + page (uuid guard, requireOwner, notFound)

## Deviations from Plan
- `?task={id}` is read in the server page (searchParams, uuid-validated) and passed as `openTaskId` instead of useSearchParams (avoids a Suspense boundary).
- Mobile section order: sidebar column (blockers, health, repos, deps) renders before the main column on narrow screens, rather than the exact interleaved order in the spec (workspace, blockers, tasks, ...). Not interleaved to keep the two-column markup simple.
- Both "Link repository" and "Add link" open the same LinkDialog (it already has a kind selector).

## Verification
tsc, eslint, glass-gate clean; vitest tests/unit 322 passed. Visual and clipboard check deferred to the 05-12 owner gate.

## Known Stubs
None.

## Self-Check: PASSED
