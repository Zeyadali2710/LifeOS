# Phase 5: Career + Projects - Discussion Log

> Audit trail only. Decisions live in 05-CONTEXT.md.

**Date:** 2026-10-12
**Mode:** --auto (owner away: "keep going ... moving on to the next one without updating me"). Every choice below is the recommended default; review and override in 05-CONTEXT.md before or after planning.

[--auto] Selected all gray areas: Career dashboard scope, Languages data, Project model, Dependencies & blockers, Progress & health, Workspace / Claude Code links, Agent access, Home & palette integration.

| Area | Question | Auto-selected (recommended) | Alternatives considered |
|---|---|---|---|
| Career dashboard | What does /career show? | Repo cards (health, language, PRs/issues, 14-day commits) + live GitHub activity column + repo detail route | Repo table only; projects-first Career page as in the design |
| Languages | CAR-01 asks for languages; only primary language is synced | Add `/languages` fetch to the existing sync, jsonb on github_repos | Primary language only; live fetch on page load |
| Project model | Where do project tasks come from? | Reuse Phase 4 tasks via `tasks.project_id` FK | Separate project-task entity |
| Milestones | Needed for CAR-02? | Yes, simple table; tasks optionally belong to one | Tags on tasks |
| Dependencies | Granularity | Task→task and project→project "blocked by", cycles rejected | Task-only; free-text only |
| Blockers | Entity or derived? | Derived (blocked tasks, blocking project, overdue milestones, failing CI) + optional note | Manual blocker records |
| Progress / health | How computed? | Rules: tasks done ratio; health On track / At risk / Behind by dates + CI | Owner-set only; LLM assessment |
| Claude Code workspace | How to "link" a workspace? | Stored local path; Copy context brief + Copy launch command; no session reading | vscode:// links; desktop companion sync (deferred) |
| Agent access | Agent permissions on projects | READ tools only (projects.list/get) on Projects agent | PREPARE→APPROVE writes now |
| Owner writes | Direct or approval? | Direct + audit-logged (local data, Phase 4 D-06) | Approval for destructive ops |
| Home / palette | Integration | Home Active projects real; palette Projects scope + New project | Leave Home empty until later |

| Health edge cases | Target passed? CI alone? Archived blocker? | Target passed & not Done = Behind (A2); CI failing alone = At risk (A4); Archived blocking project doesn't block (A3) — recorded as D-10a | D-10 literal only |
| Commit fetch size | Enough commits for a 14-day sparkline? | Raise sync commits per_page 20 → 100 | Keep 20 |
| Blocked notification | Notify when a project becomes blocked? | Activity event only this phase | In-app notification |

## Claude's Discretion
Table/column names, repo detail route shape, sparkline buckets, activity-event list, task dialog picker UX.

## Deferred Ideas
Claude Code session sync, agent project writes, goal links (Phase 8), drag Gantt, socials/outreach in projects.
