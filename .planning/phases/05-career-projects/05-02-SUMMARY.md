---
phase: 05-career-projects
plan: 02
subsystem: database
tags: [schema, migration, drizzle, projects]
requires: []
provides: [projects, milestones, task_dependencies, project_dependencies, project_links, tasks.project_id FK, tasks.milestone_id, github_repos.languages]
key-files:
  created: [drizzle/0005_projects.sql, drizzle/meta/0005_snapshot.json, tests/db/schema-projects.test.ts]
  modified: [src/server/db/schema.ts, src/lib/calendar-types.ts, drizzle/meta/_journal.json, tests/db/migrations.test.ts]
decisions:
  - "Both task FKs (project_id, milestone_id) ON DELETE SET NULL; project delete guarded in the service layer (plan 05-04)"
metrics:
  completed: 2026-10-13
---

# Phase 5 Plan 02: Schema and migration 0005 Summary

Phase 5 tables (projects, milestones, task_dependencies, project_dependencies, project_links with kind CHECK + partial unique repo index), `github_repos.languages` jsonb, `tasks.project_id` FK and new `tasks.milestone_id`, and TaskDTO `projectId`/`milestoneId`; migration 0005 generated offline and applied on the VM by the owner.

## Commits
- 4aa5b4c feat: schema tables, task FKs, TaskDTO ids
- 6dd5130 feat: migration 0005_projects + constraint tests

## Verification
- Local: `npx tsc --noEmit` clean.
- Owner VM gate (2026-10-13): `lc logs migrate` → `migrations applied`; `bash scripts/vm-db-test.sh tests/db/migrations.test.ts tests/db/schema-projects.test.ts tests/db/schema-organization.test.ts tests/db/tasks.test.ts` → Test Files 4 passed, Tests 19 passed (schema-projects 8/8).

## Deviations
None.

## Self-Check: PASSED
