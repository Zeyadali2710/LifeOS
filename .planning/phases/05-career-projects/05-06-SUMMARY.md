---
phase: 05-career-projects
plan: 06
subsystem: projects-read-model
tags: [projects, agents, read-model]
requires: [05-03, 05-04]
provides: [listProjects, loadProject, loadActiveProjects, searchProjects, projects.list, projects.get]
affects: [05-07, 05-08, 05-09, 05-10, 05-11]
key-files:
  created: [src/server/project-queries.ts, src/server/agents/tools/projects.ts, tests/db/project-queries.test.ts, tests/db/project-tools.test.ts]
  modified: [src/server/projects.ts, src/server/agents/tools/index.ts, src/server/agents/registry.ts, docs/agents.md, tests/unit/agent-contracts.test.ts]
decisions:
  - "Project tools set private:true (like tasks.list) so free models never see project data unless ai.free_private_ok is on"
  - "searchProjects takes an optional now (default new Date()) so callers/tests can pin the clock"
metrics:
  tasks: 2
  completed: 2026-10-13
---

# Phase 5 Plan 06: Project read model and agent tools Summary

Project read model (index cards, workspace, Home top-4, palette search) computed from DB rows via project-rules in a fixed number of queries, plus path-free READ tools `projects.list`/`projects.get` on the Projects agent.

## Commits
- 7238ddd: project-queries.ts + tests, export toProjectDTO
- 6e570f4: agent tools, registry/prompt/docs, tests

## Deviations from Plan
- [Rule 2] Tools marked `private: true` (owner-private data, consistent with calendar/tasks tools).
- Worktree was behind the expected base; reset to b2f36e6 per the branch check, then ran `npm ci`.

## Verification
- `npx tsc --noEmit`, eslint on touched files, `npx vitest run tests/unit` (322 passed): green.
- DB tests (tests/db/project-queries.test.ts, project-tools.test.ts) not run locally; owner runs them on the VM at the 05-12 gate.

## Known Stubs
None.

## Self-Check: PASSED
