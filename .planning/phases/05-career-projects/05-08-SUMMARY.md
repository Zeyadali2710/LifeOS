---
phase: 05-career-projects
plan: 08
subsystem: ui
tags: [dialogs, projects, milestones, dependencies]
requires: [05-04]
provides: [ProjectDialog, MilestoneDialog, LinkDialog, DependencyPicker, TaskDialog project/milestone/blocked-by]
affects: [05-09, 05-10]
key-files:
  created: [src/projects/project-dialog.tsx, src/projects/milestone-dialog.tsx, src/projects/link-dialog.tsx, src/projects/dependency-picker.tsx]
  modified: [src/organization/task-dialog.tsx]
decisions:
  - "Blocked-by tracked as added/removed deltas so the dirty check is stable while options load"
  - "After a blocker (cycle) failure on a new task, savedId makes the next submit update instead of creating a duplicate"
metrics:
  completed: 2026-10-13
---

# Phase 5 Plan 08: Project editing dialogs Summary

ProjectDialog, MilestoneDialog, LinkDialog, DependencyPicker, and a TaskDialog extended with Project, Milestone (filtered, cleared on project change) and Blocked-by pickers plus `defaultProjectId`.

## Commits
- 0d1c33c ProjectDialog
- c433268 MilestoneDialog, LinkDialog, DependencyPicker
- Task 3 commit: task-dialog.tsx extension

## Deviations from Plan
- DependencyPicker cycle error uses InlineError (title/what/why/fix) as specified; other errors use a plain red alert.
- Task dialog always sends projectId/milestoneId (milestone nulled when no project).
- Project/Milestone/Blocked-by block placed before Priority (after Due date/time, before Notes).
- Worktree was reset to base b2f36e6 (was not an ancestor).

## Verification
tsc, eslint, glass-gate clean; vitest unit 321/321 pass.

## Known Stubs
None.

## Self-Check: PASSED
