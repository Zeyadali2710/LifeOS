---
phase: 05-career-projects
verified: 2026-10-13T00:00:00Z
status: human_needed
score: 3/3 roadmap success criteria verified (39/39 plan truths verified or owner-confirmed)
overrides_applied: 0
human_verification:
  - test: "Apply drizzle/0006_project_archived_from.sql on the VM (npm run db:migrate, or the deploy's migrate step) before or with deploying commits 1f65222..52e566a, then load /projects, a project workspace and Home"
    expected: "Pages render. Without 0006, every select().from(projects) (project-queries.ts:52, projects.ts:64/81) fails on the missing archived_from column. /projects and the workspace would error, and Home's Active projects would silently show empty because of its .catch(() => [])"
    why_human: "Live VM database; the owner gate (113334d) ran before this schema change"
  - test: "On the VM, set a project to Paused (or Done), archive it, then unarchive it"
    expected: "Status returns to Paused/Done, not Active (WR-02). Archive then unarchive of an Active project still shows it in Home's Active projects"
    why_human: "Post-UAT behaviour change; db test covers the logic, but the deployed flow was not re-checked"
  - test: "On the VM, delete a task that blocks a task in another project, and move a blocking task to a different project"
    expected: "Project activity shows 'became unblocked' / 'became blocked' events where the blocked state changed (WR-03)"
    why_human: "New event paths have no dedicated automated test"
  - test: "Create a new task with blockers where one blocker add fails (or the completion change fails), then look at the dialog"
    expected: "Saved blockers stay listed, Delete/Completed controls are available, and only the unsaved changes count as dirty (WR-05)"
    why_human: "UI state logic with no automated coverage; e2e not re-run after the fix pass"
---

# Phase 5: Career & Projects Verification Report

**Phase Goal:** Career and Projects stop being honest-empty pages: GitHub repositories show live health and activity, cross-domain projects track tasks, milestones, dependencies and blockers on a timeline, and each project has a workspace view with its repos, tasks and Claude Code workspace links.
**Verified:** 2026-10-13
**Status:** human_needed
**Re-verification:** No. This is the initial verification.

## Goal Achievement

### Observable Truths (ROADMAP success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Career page shows a dashboard per synced repo (CI health, languages, commits, PRs/issues, activity) from the read-only GitHub sync, with honest empty/error states | VERIFIED | `career/page.tsx:13` calls `loadCareer(db(), now)`. `career.ts` exports `repoCards/repoActivity/loadCareer/loadRepoDetail` and imports chips, language bar and sparkline from `@/lib/project-rules`. `sync.ts:238` fetches `${base}/languages` and `:203` fetches commits with `per_page=100`. `career-view.tsx` has the "GitHub isn't connected" state (l.30), sync error with `lastSyncError` plus `syncNowAction` (l.43, 73), Show archived (l.87) and "No repositories synced yet" (l.93). The repo detail page 404s on a malformed segment or an unknown repo (`[repo]/page.tsx:15-18`). |
| 2 | A project can be created, edited and archived. It links repos, tasks (Phase 4), milestones, dependencies and blockers, shows progress on a timeline, and Home's Active projects reflects real projects | VERIFIED | `projects.ts` covers project, milestone, link and dependency mutations, with cycle checks under `WITH RECURSIVE` + advisory lock. `project-actions.ts` calls `requireOwner` in every action. `tasks.project_id/milestone_id` are FKs with `onDelete: "set null"` (`schema.ts:587-588`). `project-blockers.ts:71` runs `blockers()` over loaded rows. `health()` (`project-rules.ts:105`) matches D-10/D-10a. `TimelineStrip` exists. The task dialog has `defaultProjectId` + `taskDialogOptionsAction`. Home (`(os)/page.tsx`) calls `loadActiveProjects(db(), now)` and renders `<ActiveProjects cards=…/>`. |
| 3 | The project workspace view shows repos, tasks, milestones and Claude Code workspace links, and agents can read project data through the tool gateway under existing tiers | VERIFIED | `projects/[id]/page.tsx` has a `z.uuid()` guard, calls `loadProject` and returns `notFound`. `workspace-card.tsx` uses `navigator.clipboard`. `ProjectWorkspace` wires archive, delete, remove-link and remove-dependency actions. `agents/tools/projects.ts` defines `projects.list` and `projects.get` with `tier: "READ"`, `sideEffect: false` and `private: true`. Output is bounded (2000 chars, list caps) and built field by field, so the workspace path, machine label, brief and launch command are never included. These tools are spread into `TOOLS` (`tools/index.ts:8`) and listed on the Projects agent (`registry.ts:137-138`). |

**Score:** 3/3 roadmap truths verified.

### Plan must-haves (05-01..05-12)

All artifacts in plans 01, 02, 04, 05, 07, 08, 09, 11 and 12 pass `verify.artifacts`. The query tool could not parse the frontmatter of plans 03, 06 and 10, so I checked those by hand. Every exported symbol and file listed exists.

Some key links failed in `verify.key-links` for two tool reasons: an "Invalid regex" from double-escaped `\\(` patterns, and an unresolvable "to" target on links like `tasks.projectId` and the type-import link. I checked each of these by hand with grep and all are WIRED:

| From | To | Status | Evidence |
|------|----|--------|----------|
| project-rules.ts | project-types.ts | WIRED | `} from "./project-types";` l.12 |
| schema.ts | tasks.projectId FK | WIRED | l.587-588 `onDelete: "set null"` |
| project-blockers.ts | project-rules `blockers(` | WIRED | l.71 |
| career/page.tsx | career.ts `loadCareer(` | WIRED | l.13 |
| career/[owner]/[repo]/page.tsx | `loadRepoDetail(` | WIRED | l.17 |
| projects/page.tsx | `listProjects(` | WIRED | l.24 |
| (os)/page.tsx | `loadActiveProjects(` | WIRED | Home, render `ActiveProjects` |
| palette-actions.ts | `searchProjects(` | WIRED | l.31 |
| project-queries.ts | career.ts `repoCards(` | WIRED | l.62 |
| tools/index.ts | projectTools | WIRED | l.5, l.8 |
| project-tasks.tsx | TaskDialog `defaultProjectId` | WIRED | l.130 |
| project-workspace.tsx | project-actions | WIRED | l.9 import, used l.88/108/257/305 |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|----------|------|--------|-----------|--------|
| CareerView | CareerDTO | `loadCareer` over github_repos/commits/PRs/issues/runs + connections row | Yes (db tests: career-queries) | FLOWING |
| ProjectsView / ProjectCard | ProjectCardDTO[] | `listProjects` -> `select().from(projects)` + tasks/milestones/deps | Yes | FLOWING |
| ProjectWorkspace | ProjectWorkspaceDTO | `loadProject` | Yes | FLOWING |
| ActiveProjects (Home) | cards | `loadActiveProjects` (max 4, priority then activity) | Yes. `.catch(() => [])` hides DB errors as an empty list (see human item 1) | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Typecheck | `npx tsc --noEmit` | exit 0 | PASS |
| Unit suite | `npx vitest run tests/unit` | 36 files, 322 tests passed | PASS |
| Phase 5 DB suites | `npx vitest run tests/db/{project-actions,project-queries,project-dependencies,career-queries,schema-projects}.test.ts` (local PG :5433) | 5 files, 42 tests passed | PASS |
| E2E | not run (needs the VM stack). It passed at the owner gate before the fix pass (e5e6439) | n/a | SKIP |

### Probe Execution

There are no probe scripts in this phase. SKIPPED.

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| CAR-01 | 01,02,03,05,07,12 | Repository dashboard (status, languages, commits, PRs, issues, activity) | SATISFIED | Truth 1 |
| CAR-02 | 01,02,04,05,06,08,09,10,11,12 | Cross-domain projects with tasks, milestones, dependencies, blockers, timeline | SATISFIED | Truth 2 |
| CAR-03 | 01,06,08,10,12 | Project workspace view incl. Claude Code workspace links | SATISFIED | Truth 3 |

No requirements are orphaned. REQUIREMENTS.md maps only CAR-01..03 to this phase, and every plan claims a subset of them. The checkboxes in REQUIREMENTS.md are still `[ ]`, and the orchestrator should tick them.

### Anti-Patterns Found

No TBD, FIXME, XXX, TODO or placeholder markers appear in the Phase 5 source files (career, projects, project-*/projects server modules, agent tools, task-dialog, task-actions).

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| src/app/(os)/page.tsx | ~57 | `loadActiveProjects(...).catch(() => [])` | Info | A DB failure, such as the missing 0006 column, shows as the honest-empty state instead of an error |
| src/projects/project-tasks.tsx | n/a | WR-01 archived-project task gate is client-only | Info | The fixer documented this as a known limitation. The server still accepts task mutations on archived projects |

### Human Verification Required

1. **Apply migration 0006 on the VM.** This is genuinely required. The owner gate (113334d) ran before the review-fix pass added `projects.archived_from`, and the code now selects full `projects` rows. Without the migration, /projects and the workspace break, and Home shows an empty Active projects list.
2. **WR-02 unarchive restores the prior status.** Paused or Done goes to archived and comes back as Paused or Done.
3. **WR-03 blocked/unblocked events on task delete and project move.**
4. **WR-05 task dialog after a partial save.** Saved blockers stay listed and the dirty baseline resets.

Items 2-4 are small re-checks of the post-UAT fixes. Item 1 is the one that matters.

### Gaps Summary

There are no gaps. All three roadmap success criteria and all three requirement IDs have real, wired, data-backed implementations, and the owner approved UAT for CAR-01..03 on 2026-10-13. Status is human_needed only because the post-review fix pass changed the schema (0006) and logic after that approval, and none of it has been deployed or exercised on the VM yet.

---

_Verified: 2026-10-13_
_Verifier: Claude (gsd-verifier)_
