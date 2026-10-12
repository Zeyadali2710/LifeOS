# Phase 5: Career + Projects - Context

**Gathered:** 2026-10-12
**Status:** Ready for planning
**Mode:** `--auto` (owner away; every gray area resolved with the recommended default, logged in 05-DISCUSSION-LOG.md for review)

<domain>
## Phase Boundary

Career and Projects stop being honest-empty pages. Career becomes a live dashboard of the owner's GitHub repositories (from the existing Phase 3 read-only sync). Projects become a real, cross-domain object in LifeOS: tasks (Phase 4), milestones, dependencies and blockers, linked repos, progress on a timeline, and a per-project workspace view with Claude Code workspace links. Agents can read project data. Requirements: CAR-01, CAR-02, CAR-03.

Not in this phase: goals hierarchy (Phase 8), outreach/socials content in projects (their own phases), any new GitHub write action, reading Claude Code sessions from the owner's machines.

</domain>

<decisions>
## Implementation Decisions

### Career page = GitHub repository dashboard (CAR-01)
- **D-01:** `/career` lists every synced repository as a glass card: name + description, primary language + language bar, health (latest CI run on the default branch: passing / failing / none), last push, open PR and open issue counts, and a 14-day commit sparkline from `github_commits`. Archived repos are hidden behind a toggle. Honest states when GitHub is not connected (link to Settings → Connections), when sync has errored (show `lastSyncError`), and when a repo has no CI.
- **D-02:** A "Live from GitHub" activity column on `/career` shows recent commits, PRs, issues and CI runs across repos (from the synced tables, newest first), matching the Glass Career design's right column.
- **D-03:** Repository detail at `/career/[owner]/[repo]`: commits, open PRs (with review state), open issues, recent CI runs, links out to GitHub. Read-only.
- **D-04:** **Languages breakdown is added to the existing sync**: fetch `GET /repos/{o}/{r}/languages` with the existing ETag cache inside the Phase 3 sync job and store bytes-per-language as `jsonb` on `github_repos`. No new schedule — same 15-min cadence and "Sync now" as Phase 3 D-07.

### Project model (CAR-02)
- **D-05:** New `projects` table (Postgres only, no external sync): name, description, category (Personal / Career / Startup / Technical / Social / Learning — the design's filters), owner-set status (Active / Paused / Done / Archived), priority P1–P3, optional target date, optional Claude Code workspace path (D-12). Archive is soft (status), delete is hard with confirm and only when the project has no linked data or after unlinking.
- **D-06:** **Tasks attach via the existing nullable `tasks.project_id`** (Phase 4 D-10) — add the FK now (`ON DELETE SET NULL`). Tasks are still created/edited with the Phase 4 task dialog, which gains a project picker. No separate project-task type.
- **D-07:** **Milestones**: `milestones` table (project, title, due date, done/completed_at, sort order). Tasks may optionally belong to a milestone.
- **D-08:** **Dependencies**: task → task "blocked by" within or across projects (`task_dependencies`), and project → project "blocked by". Cycles are rejected server-side.
- **D-09:** **Blockers shown on a project are derived, not a separate entity**: open tasks blocked by incomplete dependencies, a blocking project that is not Done, overdue milestones, and failing CI on the default branch of a linked repo. Plus an optional free-text "blocker note" on the project for things LifeOS can't see. Deterministic, no LLM.
- **D-10:** **Progress = completed tasks ÷ all tasks** in the project (milestones done ÷ milestones when there are no tasks; 0% with an honest "no tasks yet" when neither). **Health** (On track / At risk / Behind) is computed by rules: Behind if any milestone or task is overdue; At risk if the target date is within 7 days and progress < 80% or a linked repo's CI is failing; else On track. Owner status (D-05) and computed health are shown separately.
- **D-11:** **Links**: `project_links` rows of kind `repo` (FK to `github_repos`) or `url` (label + http(s) URL, validated). A repo may belong to more than one project.
- **D-12:** **Timeline** = a horizontal date strip of milestones and task due dates for the project (and on `/projects` a compact per-project bar of target date vs today). No drag-to-reschedule; editing happens in dialogs.

### Project workspace view (CAR-03)
- **D-13:** `/projects/[id]` is the workspace: header (name, category, status, health, progress ring, target date), Claude Code workspace card, tasks (Phase 4 task rows, filterable by milestone), milestones + timeline, blockers, linked repos (repo cards from D-01, compact), and recent activity (commits/PRs/CI for linked repos + task completions), following the Glass Career design's project section.
- **D-14:** **Claude Code workspace = honest links only.** The owner stores a local path (and optional machine label) on the project. The card offers: "Copy context" (copies a generated Markdown brief: goal/description, open tasks, blockers, milestones, linked repos and latest CI) and "Copy launch command" (`cd "<path>" && claude`), plus "Open on GitHub" for the primary linked repo. LifeOS runs on the VM and cannot see Claude Code sessions on the owner's machines, so the design's "connected · last session" transcript is omitted (deferred). No `vscode://`/custom-protocol launching.
- **D-15:** `/projects` index follows the Glass Projects design: category filter chips with counts, sort (Priority / Due / Recent), project cards (priority tag, category, health dot, name, progress ring, next task + due, last activity line), "New project" dialog, honest empty state.

### Ownership, agents, integration
- **D-16:** **Owner UI writes go direct and are audit-logged** (same as Phase 4 D-06 for local data). Project, milestone, link and dependency mutations emit activity events (Projects source) for meaningful changes only (created, archived, milestone done, became blocked/unblocked).
- **D-17:** **Agents get READ tools only this phase**: `projects.list`, `projects.get` (incl. tasks, milestones, blockers, health), added to the existing Projects agent (which already owns GitHub tools) and available to the orchestrator via delegation. Agent writes to projects are deferred (default READ consistency per Phase 4 D-19).
- **D-18:** **Home**: the "Active projects" section shows real projects (up to 4 Active, by priority then most recent activity) with progress, health and the linked repo's commit sparkline; empty state links to New project.
- **D-19:** **Palette**: add a "Projects" scope (search projects by name) and a "New project" command, following Phase 2 D-06 (add scopes when data exists).
- **D-20:** UI follows the Phase 4.1 Glass system and `04.1-SPACING-RUBRIC.md` (cards 24, overlays 30, nested 14/16, controls full; no opaque card fills). Layout/content order from `design/glass/Glass Career.dc.html` and `design/glass/Glass Projects.dc.html`; design placeholder data is never ported.

### Claude's Discretion
- Exact table/column names and indexes (follow `docs/database.md` naming: `projects`, `project_links`, `milestones`, `task_dependencies`; repos stay `github_repos`).
- Whether repo detail lives at `/career/[owner]/[repo]` or `/career/[repoId]`.
- Sparkline bucket size and the precise "meaningful change" list for activity events.
- How the task dialog exposes project/milestone pickers.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope and requirements
- `.planning/ROADMAP.md` — Phase 5 goal and success criteria
- `.planning/REQUIREMENTS.md` — CAR-01, CAR-02, CAR-03

### Data model and prior decisions
- `docs/database.md` — table naming plan (`projects`, `project_links`, `milestones`, `task_dependencies`), `tasks.project_id` reserved for Phase 5
- `.planning/phases/04-organization/04-CONTEXT.md` — D-06 owner writes direct, D-10/D-11 task shape, D-19 agent READ+APPROVE default
- `.planning/phases/03-agent-infrastructure-github/` (CONTEXT/PLANs) — GitHub read-only sync, ETags, sync cadence, Projects agent tools
- `src/server/db/schema.ts` — `github_*` tables, `tasks`, `connections`

### UI
- `design/glass/Glass Career.dc.html` — Career layout, project section (workspace card, tasks, blockers, health, activity)
- `design/glass/Glass Projects.dc.html` — Projects index layout
- `design/glass/Glass Home.dc.html` — Active projects section
- `.planning/phases/04.1-glass-redesign-liquid-glass-restyle-of-tokens-fonts-ui-primi/04.1-SPACING-RUBRIC.md` — binding radius/spacing rules
- `.planning/phases/04.1-glass-redesign-liquid-glass-restyle-of-tokens-fonts-ui-primi/04.1-UI-SPEC.md` — Glass tokens/tiers

### Architecture
- `docs/decisions/ADR-008-*.md` — tool gateway / permission tiers
- `docs/decisions/ADR-010-providers.md` — honest UI, labelled mocks
- `docs/permissions.md`, `docs/agents.md` — agent tool registration and tiers

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/server/github/sync.ts` (`createSync`) + `client.ts` (ETag cache): extend for languages.
- `src/server/agents/tools/github.ts`: tool definition pattern for new `projects.*` READ tools; `src/server/agents/registry.ts` Projects agent (`id: "projects"`) already live.
- `src/server/tasks.ts`, `src/server/task-actions.ts`, `src/organization/task-dialog.tsx`, `src/organization/tasks-card.tsx`: task CRUD + UI to reuse for project tasks.
- `src/ui/*` Glass primitives (Dialog portal, EmptyState, PageHeader, SectionHeader, StatusTile, Badge, Progress, Field/Input/Select).
- `src/shell/domain-page.tsx`: current honest-empty Career/Projects pages to replace.
- `src/server/home.ts` + Home page "Active projects" empty state.
- Palette scopes pattern from Phase 4 (`src/shell/palette-items.ts`, `palette-actions.ts`).

### Established Patterns
- Server actions + `requireOwner()`; audit via `src/server/audit.ts`; activity events via `src/server/events.ts` (LISTEN/NOTIFY → SSE).
- Drizzle migrations + VM DB test runner (`scripts/vm-db-test.sh`); `[BLOCKING]` migration gate with owner VM migrate (Phase 4 04-06 pattern).
- Deterministic rules for computed views (Phase 4 D-14/D-15) — health/progress/blockers follow suit.

### Integration Points
- `tasks.project_id` FK + task dialog project picker.
- Home Active projects, palette scope, notifications for "project became blocked" (optional, planner's call), Projects agent tools.

</code_context>

<specifics>
## Specific Ideas

- Claude Code workspace card keeps the design's look (cyan-bordered panel, "Copy context" + primary action) but its primary action is "Copy launch command", and the transcript area shows the generated context brief preview instead of a fake session log.
- Health colours follow the design: On track/Active green, At risk amber, Behind red.

</specifics>

<deferred>
## Deferred Ideas

- Live Claude Code session sync (needs a desktop companion that reports sessions to LifeOS) — future phase.
- Agent writes to projects (create/group tasks and repos into projects via PREPARE→APPROVE) — later phase once READ is proven.
- Linking projects to goals (`goal_projects`) — Phase 8.
- Drag-to-reschedule Gantt timeline — Phase 11 polish if wanted.
- Social posts / outreach items attached to projects — Phases 6/7.

</deferred>
