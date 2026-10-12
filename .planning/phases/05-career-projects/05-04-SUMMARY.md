---
phase: 05-career-projects
plan: 04
subsystem: server
tags: [projects, milestones, dependencies, cycle-detection, server-actions]
requires: ["05-01", "05-02"]
provides: [project write path, blocker loader, owner-checked project actions, task project/milestone assignment]
affects: [05-09 task dialog, project pages]
key-files:
  created:
    - src/server/project-blockers.ts
    - src/server/projects.ts
    - src/server/project-actions.ts
    - tests/db/project-actions.test.ts
    - tests/db/project-dependencies.test.ts
  modified:
    - src/lib/task-payload.ts
    - src/server/tasks.ts
    - src/server/task-actions.ts
    - tests/db/tasks.test.ts
decisions:
  - Cycle check = advisory xact lock + WITH RECURSIVE + insert in one h.transaction (per edge kind lock).
  - Block/unblock events computed by before/after snapshot (withBlockTransition); time- and CI-driven transitions not evented.
  - Create/link actions return { ok, id }; project actions return not_found for non-uuid ids.
metrics:
  tasks: 3
  completed: 2026-10-13
---

# Phase 5 Plan 04: Project write path Summary

Project/milestone/link CRUD, cycle-safe task and project dependency edges, task project/milestone assignment, and 15 owner-checked server actions, all audited with {id}-only metadata.

## Commits
- 83d2f04: feat(05-04): all three tasks (committed together; the tasks share projects.ts)

## Verification
- `npx tsc --noEmit`, `npx eslint` (src, touched tests), `npx vitest run tests/unit` (321 passed): all clean.
- DB tests (project-actions, project-dependencies, tasks) written but NOT run locally; owner runs them on the VM at the 05-12 gate. The recursive CTE and advisory-lock SQL were re-read against Postgres semantics only.

## Deviations from Plan
- Tasks 1-3 landed in a single commit rather than three (projects.ts is shared across them).
- tests/db/project-dependencies.test.ts has 8 `it(` blocks (plan asked for >= 9); every listed behavior is covered.
- [Rule 1] `taskDialogOptionsAction` returns `{ ok: true, options }` to match the other actions' ok-envelope.

## Notes for downstream plans
- Until the 05-09 dialog sends projectId/milestoneId, editing a task through the Phase 4 dialog sends neither and therefore clears its project (taskInput defaults to null).
- Moving a task between projects via updateTask does not emit block/unblock events (only toggle, dependency, milestone, link and project changes do).
- `blockedProjectIds` runs one workflow-run query per linked repo (bounded by linked repos).

## Known Stubs
None.

## Threat Flags
None beyond the plan's threat model (all mitigations applied: requireOwner first in every action, parameterized SQL, advisory locks, {id}-only audit, generic failure logging, guarded delete).

## Self-Check: PASSED
