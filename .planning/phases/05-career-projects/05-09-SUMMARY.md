---
phase: 05-career-projects
plan: 09
subsystem: projects-ui
tags: [projects, index, filters, glass]
requires: [05-05, 05-06, 05-08]
provides: ["/projects index (ProjectCard, ProjectsView, loading)"]
key-files:
  created: [src/projects/project-card.tsx, src/projects/projects-view.tsx, src/app/(os)/projects/loading.tsx]
  modified: [src/app/(os)/projects/page.tsx]
requirements: [CAR-02]
metrics:
  tasks: 2
  completed: 2026-10-13
---

# Phase 5 Plan 09: Projects index Summary

/projects now lists project cards with category chips and counts, Priority/Due/Recent sort, a create dialog (also opened via `?new=project`), and honest empty, filtered-empty and load-error states.

## Commits
- a89780f ProjectCard
- e647661 page, loading, projects-view

## Decisions
- Load-error state is a server-rendered alert with a `Try again` Link, because InlineError only takes an onClick action and requires what/why/fix copy.
- Error logging records only the error name, not its contents (T-05-33).
- Reused `relativeTime` from `career/repo-card`. The card has a small local day-diff helper.
- The empty-state action uses the secondary button, so `New project` stays the only accent button.

## Deviations
None. Some pieces are unchecked:
- The visual check is deferred to the 05-12 owner gate.
- I did not run `vitest` because this plan changed no logic that has unit tests.

## Verification
`tsc --noEmit`, eslint on `src/projects` and `src/app/(os)/projects`, and `glass-gate.sh src` all exit 0.

## Self-Check: PASSED
