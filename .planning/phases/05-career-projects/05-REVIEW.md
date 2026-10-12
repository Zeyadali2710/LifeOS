---
phase: 05-career-projects
reviewed: 2026-10-13T00:00:00Z
depth: standard
files_reviewed: 62
files_reviewed_list:
  - drizzle/0005_projects.sql
  - src/app/(os)/career/[owner]/[repo]/page.tsx
  - src/app/(os)/career/loading.tsx
  - src/app/(os)/career/page.tsx
  - src/app/(os)/page.tsx
  - src/app/(os)/projects/[id]/page.tsx
  - src/app/(os)/projects/loading.tsx
  - src/app/(os)/projects/page.tsx
  - src/app/globals.css
  - src/career/activity-feed.tsx
  - src/career/career-view.tsx
  - src/career/language-bar.tsx
  - src/career/repo-card.tsx
  - src/career/repo-detail.tsx
  - src/career/sparkline.tsx
  - src/lib/calendar-types.ts
  - src/lib/project-payload.ts
  - src/lib/project-rules.ts
  - src/lib/project-types.ts
  - src/lib/task-payload.ts
  - src/organization/task-dialog.tsx
  - src/projects/active-projects.tsx
  - src/projects/blockers-list.tsx
  - src/projects/dependency-picker.tsx
  - src/projects/link-dialog.tsx
  - src/projects/milestone-dialog.tsx
  - src/projects/progress-ring.tsx
  - src/projects/project-card.tsx
  - src/projects/project-dialog.tsx
  - src/projects/project-tasks.tsx
  - src/projects/project-workspace.tsx
  - src/projects/projects-view.tsx
  - src/projects/status.tsx
  - src/projects/timeline-strip.tsx
  - src/projects/workspace-card.tsx
  - src/server/agents/registry.ts
  - src/server/agents/tools/index.ts
  - src/server/agents/tools/projects.ts
  - src/server/career.ts
  - src/server/db/schema.ts
  - src/server/github/sync.ts
  - src/server/palette-actions.ts
  - src/server/project-actions.ts
  - src/server/project-blockers.ts
  - src/server/project-queries.ts
  - src/server/projects.ts
  - src/server/task-actions.ts
  - src/server/tasks.ts
  - src/shell/palette-items.ts
  - src/shell/palette.tsx
  - src/ui/icon-names.ts
  - tests/db/career-queries.test.ts
  - tests/db/github-sync.test.ts
  - tests/db/migrations.test.ts
  - tests/db/project-actions.test.ts
  - tests/db/project-dependencies.test.ts
  - tests/db/project-queries.test.ts
  - tests/db/project-tools.test.ts
  - tests/db/schema-projects.test.ts
  - tests/db/tasks.test.ts
  - tests/e2e/career.spec.ts
  - tests/e2e/projects.spec.ts
findings:
  critical: 1
  warning: 5
  info: 7
  total: 13
status: issues_found
---

# Phase 5: Code Review Report

**Reviewed:** 2026-10-13
**Depth:** standard
**Files Reviewed:** 62
**Status:** issues_found

## Summary

The server layer is mostly solid. Every server action calls `requireOwner()`, ids are validated as uuids, link URLs only allow http(s), the workspace path is screened for shell metacharacters, and cycle detection runs under an advisory lock. The agent tools are read-only and leave out the workspace path and brief.

The main defect is a contract mismatch between the delete-project client and server. If a project's only linked data is a dependency edge, it can't be deleted from the UI. The other findings are that some actions bypass the read-only guard on archived projects, unarchiving loses the project's earlier status, and some task mutations skip the blocked/unblocked transition events.

## Critical Issues

### CR-01: Projects whose only linked data is a dependency edge can't be deleted

**File:** `src/projects/project-workspace.tsx:94-111` (client), `src/server/projects.ts:107-117` (server)
**Issue:** The server refuses deletion without `confirmUnlink` when there are tasks, milestones, links **or dependency edges**, where an edge can point in either direction (`edges` at projects.ts:107-110). The client works out `hasData = nTasks + nMs + nLinks > 0` and leaves edges out. That means a project that depends on another project (or that another project depends on), and has no tasks, milestones or links, sends `confirmUnlink=false`. The server returns `{ok:false, error:"has_linked_data"}` and the user only sees "Couldn't delete that. Try again." Retrying fails the same way. The only way out is to remove the dependency by hand, and that is impossible from this page when the edge is incoming, because incoming edges aren't shown here. Separately, `counts` in the response leaves out `edges`, so a client that did use the counts would show "0 tasks, 0 milestones, 0 links".
**Fix:** The confirm dialog is already shown to the user, so always confirm from the client and keep the server's guard for other callers:
```tsx
const r = await deleteProjectAction(p.id, true).catch(() => ({ ok: false }) as const);
```
Also add `dependencies: edges` to the `counts` payload, and mention dependency edges in the confirm body when there are any (for example, add `dependents` to `ProjectWorkspaceDTO`).

## Warnings

### WR-01: Tasks in an archived project can still be toggled and edited

**File:** `src/projects/project-tasks.tsx:75-77`
**Issue:** `readOnly` hides "New task" and disables the milestone checkboxes (line 153), but the task `Checkbox` and the title button that opens `TaskDialog` ignore `readOnly`. Archived projects therefore stay mutable through tasks (completion, title, project and milestone reassignment, blockers), which contradicts the archived banner. The task dialog also can't show the archived project in its Project select, because `taskDialogOptions` leaves out archived projects. The select then visibly shows "No project" while the task's projectId is still kept.
**Fix:** Pass `disabled={readOnly}` to the task Checkbox and gate `setDlg({ task: t })` on `!readOnly` (or open the dialog read-only).

### WR-02: Unarchiving always sets status to "active" and loses paused/done

**File:** `src/server/projects.ts:79-84`
**Issue:** `setProjectArchived(..., false)` writes `status: "active"` no matter what the status was before archiving. A project that was "done" when archived comes back as active. Health is then computed again, and an old target date makes it show "Behind". It also starts appearing on Home's Active projects and can newly block its dependents through `withBlockTransition` (A3 treats active/paused as blocking).
**Fix:** Store the pre-archive status (for example a nullable `archived_from` column) and restore it, or unarchive to `paused` so a project doesn't silently become active again.

### WR-03: Blocked-state transitions are not evented for task delete or for moving a task between projects

**File:** `src/server/task-actions.ts` (deleteTaskAction, updateTaskAction); `src/server/tasks.ts:85-110`
**Issue:** `toggleTaskAction` wraps completion in `withBlockTransition`, but `deleteTaskAction` does not. Deleting a blocking task cascades its `task_dependencies` rows and can unblock downstream projects with no `project.unblocked` event. `updateTask` can change `projectId`, which moves a blocked task (and its blocked state) from one project to another, also with no events. Only time-based and CI transitions are documented as un-evented (project-blockers.ts:76), so these are gaps rather than accepted trade-offs.
**Fix:** In `deleteTaskAction` and `updateTaskAction`, collect the old and new projectIds plus the downstream projectIds (the same query as `toggleTaskAction`), then wrap the mutation in `withBlockTransition`.

### WR-04: toggleTaskAction runs its pre-queries outside `run()`

**File:** `src/server/task-actions.ts:43-53`
**Issue:** The two `select`s that gather affected projectIds run outside `run(...)`. A DB error there throws from the server action instead of returning `{ok:false,error:"failed"}` and skips the `log.error`. That breaks the convention every other action follows. Callers recover only because they add `.catch()`.
**Fix:** Move the lookups inside the `run(async () => { ... })` callback.

### WR-05: Task dialog keeps a stale `added` blocker list after a partial failure on a new task

**File:** `src/organization/task-dialog.tsx:125-141`
**Issue:** The loop iterates over the closure arrays `removed` and `added` and compares them with `ids === added`. When a new task saves but one blocker fails, `savedId` is set and the dialog stays open. The successful blockers are filtered out of state, but `snap`/`initial` still compares against the first snapshot. The dirty check then reports the dialog as dirty and prompts "Discard changes?", even though everything except the failed blocker is already saved, and the user can't tell what was persisted. Also, `task` is still undefined after the save, so the Completed checkbox and Delete button stay hidden for a task that now exists.
**Fix:** After a partial save, reset the snapshot baseline (put `initial` in state and update it once the task row is saved), and treat `savedId` like `task` for showing the Delete and Completed controls.

## Info

### IN-01: Agent `projects.get` name lookup is ambiguous

**File:** `src/server/agents/tools/projects.ts:56-57`
**Issue:** `ilike(name, escapeLike(term))` with `.limit(1)` and no `orderBy`. Project names aren't unique, so the tool returns an arbitrary match when two names differ only in case or are duplicates, and it includes archived projects.
**Fix:** Order by `status <> 'archived'` and then `updatedAt desc`, or return `ambiguous` when there is more than one match.

### IN-02: Launch command breaks on paths ending in a backslash under bash

**File:** `src/lib/project-rules.ts:167-171`
**Issue:** `cd "C:\proj\" && claude`: in bash or zsh, `\"` escapes the closing quote and leaves an unterminated string. Also, `!` inside double quotes triggers history expansion in interactive bash. This is not injection (newlines and `$` are already blocked), but the copied command can fail.
**Fix:** Strip trailing backslashes (`p.replace(/\\+$/, "")`), or use single quotes and reject `'`.

### IN-03: `?new=project` drops the active filter and sort

**File:** `src/projects/projects-view.tsx:60-67`
**Issue:** `router.replace("/projects")` drops the `category` and `sort` params that were present, while the local state still holds them. The URL and the UI then disagree.
**Fix:** `router.replace(url(filter, sort), { scroll: false })`.

### IN-04: Optimistic toggles are never cleared

**File:** `src/projects/project-tasks.tsx:49-64, 136-146`
**Issue:** The `optimistic` maps override server data for the rest of the component's life. If the same task or milestone is changed elsewhere (dialog, Organization page, agent) and the page refreshes, the stale override wins.
**Fix:** Delete the entry after a successful `router.refresh()`, or key the override on the server's `completedAt`.

### IN-05: Overdue rule differs between server health and task rows

**File:** `src/projects/project-tasks.tsx:21-25` vs `src/lib/project-rules.ts:95-97`
**Issue:** The rows mark a task overdue by `dueDate < today`, while health or blockers use `dueAt < now`. A task due earlier today is "Behind" in health but not red in the list. Health also reports "target in 0 days" when the target is today (project-rules.ts:118-119).
**Fix:** Pass `isTaskOverdue(t, now)` through to the row, and special-case `left === 0` as "target is today".

### IN-06: Project search failure blanks all palette search results

**File:** `src/server/palette-actions.ts:28-32`
**Issue:** `searchProjects` (which runs `gather` plus blocker loading) shares a `Promise.all` with the event and task search. A failure in the heavier project read wipes the event and task hits too.
**Fix:** `searchProjects(db(), q).catch(() => [])`.

### IN-07: "Link repository" and "Add link" open the same dialog in the same mode

**File:** `src/projects/project-workspace.tsx:280-286`
**Issue:** Both buttons call `setLink(true)`, and LinkDialog defaults to `kind="repo"`, so "Add link" doesn't open the URL tab.
**Fix:** Pass an initial kind: `setLink("url")` and `<LinkDialog initialKind={link} ...>`.

---

_Reviewed: 2026-10-13_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
