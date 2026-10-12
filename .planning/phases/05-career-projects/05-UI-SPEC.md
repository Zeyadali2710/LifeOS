---
phase: 5
slug: career-projects
status: approved
reviewed_at: 2026-10-12
shadcn_initialized: false
preset: none
created: 2026-10-12
---

# Phase 5 (Career + Projects) — UI Design Contract

> Auto-mode: no questions asked. Priority of sources: 05-CONTEXT.md D-01..D-20 > Glass system (`04.1-UI-SPEC.md` tokens/tiers, `04.1-SPACING-RUBRIC.md` wins on radius/spacing) > `design/glass/Glass Career.dc.html`, `Glass Projects.dc.html`, `Glass Home.dc.html` (layout and content order ONLY). Design placeholder data (zeyad/lifeos, 1,184 commits, fake agents, fake session transcript, tabs Architecture/Deployments/Documentation) is never ported. Assumed choices are tagged **[assumed]**.
> No new tokens, no new fonts, no new radii. Everything below reuses `src/app/globals.css` utilities (`glass-card`, `glass-menu`, `text-text*`, `rounded-24/16/14/full/6`) and `src/ui/*` primitives.

---

## Design System

| Property | Value |
|---|---|
| Tool | none (hand-built `src/ui/*`; shadcn gate and registry gate not applicable) |
| Preset | not applicable |
| Component library | none (Tailwind v4 `@theme inline`) |
| Icon library | Material Symbols Outlined self-hosted subset. **Add to `src/ui/icon-names.ts` and regenerate subset** (verify each glyph, a missing one renders ligature text): `commit`, `call_merge` (PR), `bug_report` (issue), `link`, `archive`, `unarchive`, `folder_open`, `sync_problem`. Already present and reused: `code`, `terminal`, `open_in_new`, `content_copy`, `arrow_back`, `add`, `block`, `check`, `check_circle`, `deployed_code`, `warning`, `error`, `refresh`, `link_off`, `edit`, `delete`, `schedule`, `more_horiz`, `expand_more` |
| Display font | Instrument Serif 400 (`font-display`) |
| UI font | Familjen Grotesk (`font-sans`); code/paths/launch command only in `font-code` |
| Theme | Dark only |

Reused primitives (do not re-create): `PageHeader`, `SectionHeader`, `StatusTile`, `Badge` (`status|tag|count`, tones red/amber/green/blue/neutral), `Progress`, `EmptyState`, `Button` (primary/secondary/ghost/destructive/ai), `Dialog` (menu tier, `p-6`, rounded-30), `Field/Input/Select`, `InlineError`, `Skeleton`, `StatusDot`, `Disclosure`, task rows/dialog from `src/organization/*`.

**New components** (all in `src/career/*` and `src/projects/*`, composed from the above, no new tokens): `RepoCard`, `LanguageBar`, `Sparkline`, `ProgressRing`, `HealthDot`, `ProjectCard`, `ProjectDialog`, `MilestoneDialog`, `LinkDialog`, `DependencyPicker`, `TimelineStrip`, `BlockersList`, `WorkspaceCard`, `ActivityFeed`.

---

## Spacing Scale

Scale 4/8/16/24/32/48/64 plus the closed 04.1 exception set. Rubric applied literally:

| Context | Value |
|---|---|
| Page container | `max-w-[1480px]`, vertical stack of sections `gap-8` (32) |
| Page header block | eyebrow, H1 `mt-2.5`, lead `mt-2.5`; header to first section 32 |
| Section header row to content | `gap-3.5` (14) via `SectionHeader` |
| Card grid | `gap-3` (12) |
| Two-column layout (Career repos + Live column; project workspace main + side) | `gap-6` (24); desktop `grid-cols-[minmax(0,1fr)_360px]` at `>=1100px` (`desk:`), single column below, side column stacks under main |
| Card padding | `p-5` standard; dense (compact repo card in workspace, list rows) `p-4`; list container `p-2`, rows `px-3 py-2.5` |
| Card header row inside card | first child, `mb-3`, `items-center` |
| Dialog | `p-6`; form fields `gap-4`; footer actions `gap-2`, `mt-6`, right-aligned |
| Toolbar controls | `h-8`, `gap-2`, same flex row as title, `items-end`; coarse pointer `h-11` |
| Chips (filters) | `h-8 px-3.5 rounded-full gap-2`, count in `text-text-3` |
| Touch targets | all `a, button` `>=44px` on coarse pointer (Button `touch` size / `size-11`) |

Exceptions: none beyond the 04.1 table. Ring sizes 28 (card) / 72 (workspace header) and sparkline height 28 are graphic sizes, not spacing. Sticky or scrolling inner regions (timeline strip) are clipped by `overflow-hidden`/`overflow-x-auto` inside the `rounded-24` card.

---

## Typography

Closed 04.1 scale reused; **no new sizes or weights**. Weights 400 and 500 only on this phase's content (600 reserved for existing `Badge` status caps).

| Role | Font / size / weight / line-height | Used for |
|---|---|---|
| H1 | Serif `clamp(34px,4.4vw,60px)` / 400 / .95 | `Career`, `Projects` page titles (via `PageHeader`); project name on workspace uses same H1, last word not italic |
| Section value | Serif 20 / 400 / 1.1 | `StatusTile` values, project/repo name on cards |
| Empty / dialog title | Serif 22/1.15 (EmptyState), 26/1.1 (Dialog h2) | |
| Lead | Grotesk 15 / 400 / 1.5 `text-2` | page lead |
| Body | Grotesk 14 / 400 / 1.5 | descriptions, task titles, blocker body |
| Row / button | Grotesk 13.5 / 400 (500 for names) | repo row names, activity titles |
| Small | Grotesk 12.5 / 400 `text-2` or `text-3` | helper, chips, meta line |
| Eyebrow / caps | Grotesk 11, 500, tracking .14em uppercase `text-3` (section) / 10.5 and 10 caps for tags, health label, timestamps | |
| Code | `font-code` 11.5 `text-2` | workspace path, launch command, context brief preview |

Informative text is never `text-4`. Minimum size 10px.

---

## Color

Glass 60/30/10 unchanged: canvas `#121214` + glow (60%), glass card `rgba(255,255,255,.045)` and menu tier for dialogs (30%), accent (10%).

Accent (`#0a84ff` fill / `#0071e3` solid / `#64d2ff` text) reserved for: primary `Button` (`New project`, `Create project`, `Save`); `Progress` and `ProgressRing` fill below 80% (ring uses same rule as `Progress`: 80-99 amber, >=100 and Done = green **[assumed: for projects, 100% is success, so ring uses green at 100% instead of Progress's red; do not reuse `Progress` colour logic for rings]**); selected filter chip (`rgba(10,132,255,.12)` fill, `rgba(10,132,255,.45)` border, as in Projects design); links and "Open on GitHub" text (`text-cyan`); sparkline last-7-bars highlight; focus ring `#64d2ff`; Workspace card border `rgba(100,210,255,.30)` (design's cyan-bordered panel) with `bg rgba(100,210,255,.05)` tint overlay (rubric: tint as `before:` overlay on `glass-card`, never opaque).

Status colours (single `HEALTH`, `PROJECT_STATUS`, `CI` maps in `src/projects/status.ts`, one source for Career, Projects, Home):

| Concept | Value | Colour | Badge tone |
|---|---|---|---|
| Health On track | computed | `--green` `#30d158` | green |
| Health At risk | computed | `--amber` `#ff9f0a` | amber |
| Health Behind | computed | `--red` `#ff6961` | red |
| Owner status Active | stored | green dot only (no badge, avoids doubling health) | |
| Owner status Paused | stored | `text-2` neutral | neutral |
| Owner status Done | stored | green, `check_circle` icon | green |
| Owner status Archived | stored | `text-3` neutral | neutral |
| CI passing / failing / none / running | github_runs | green / red / `text-3` (label `No CI`) / cyan (pulse `lo-pulse` 2s) | |
| Priority P1 / P2 / P3 | stored | tag `rounded-6`: P1 `#ff6961` bg w/ `#121214` text, P2 `#ff9f0a` w/ `#121214`, P3 `#aeaeb2` on `rgba(255,255,255,.07)` (design values) | |
| Category (Personal/Career/Startup/Technical/Social/Learning) | stored | plain caps text `text-3` joined with ` · `, no colour coding **[assumed]** | |
| Activity icons | commit cyan, PR purple-text, issue amber, CI by CI colour, task done green | | |

Health and owner status are shown separately (D-10): health = coloured dot (8px, `rounded-full`) + caps label next to the name; owner status = text chip. Always paired with text, never colour alone. Destructive `#ff6961` only for Delete project / Remove link / failing states.

Language bar segments (graphic, no text): fixed hash-to-palette from existing tokens only: cyan, green, amber, pink, purple, `#0a84ff`, then `text-3` grey for "Other" (top 5 languages + Other). Legend text beside bar in `text-2` 12.5 names with percentages, so colour is never the only channel.

---

## Layout and Content Order

### `/career` (replaces Career in `domain-page.tsx`)

1. `PageHeader`: eyebrow `CAREER` (amber, Career agent identity), title `Career`, lead `Your repositories and engineering activity, live from GitHub.`
2. Status tile row (`StatusTile`, honest derived values only): `Repositories` (count of non-archived), `Open PRs`, `Open issues`, `CI failing` (dot red if >0 else green). No fake "tracked actively" or streak metrics. Right of page title row: `Sync now` secondary button (existing Phase 3 action, `refresh` icon, loading state) + `Show archived` toggle (segmented control per rubric, `aria-pressed`) **[assumed: toggle lives in the Repositories section header row]**.
3. Two columns (`gap-6`):
   - Left: `SectionHeader` `REPOSITORIES` + meta `N repos · synced {relative time}`; grid `repeat(auto-fill,minmax(min(100%,320px),1fr))` of `RepoCard`.
   - Right (360px, `desk:` sticky not required): `SectionHeader` `LIVE FROM GITHUB` + meta `newest first`; one `glass-card rounded-24 p-2` list container of rows `rounded-16 px-3 py-2.5`: icon, title (13.5, truncate), repo + actor meta (12.5 `text-3`), time (10.5 `text-3`). Rows are links to repo detail. Max 20 rows, no infinite scroll; footer text `Showing latest 20` is omitted, no "load more" **[assumed]**. New rows via existing live provider use `lo-in`.
4. The design's 26-week contribution heatmap and "Projects" cards on Career are **not** built (no data source beyond 14-day commits; projects live at `/projects`). Section `PROJECTS` is replaced by a single link row under the tiles: `View projects` (cyan link, `arrow_forward`) **[assumed]**.

**RepoCard** (`glass-card rounded-24 p-5`, whole card is a `next/link` to `/career/{owner}/{repo}`, hover border `.16` + `-translate-y-px`, `text-text` colour set explicitly since global `a` is cyan):
- Row 1: name (Serif 20) `owner/` prefix omitted when single owner **[assumed: show `repo` only, full `owner/repo` in `title` and aria-label]**; right: CI chip (dot + `Passing` / `Failing` / `Running` / `No CI`).
- Row 2: description 14 `text-2`, 2-line clamp; empty description renders nothing (no placeholder text).
- Row 3: `LanguageBar` (h-1.5, `rounded-full`, `role="img"` with `aria-label="Languages: TypeScript 72%, CSS 20%..."`), primary language label beneath 12.5 `text-2`. No languages yet (sync hasn't backfilled): bar omitted, label `Language unknown`.
- Row 4: `Sparkline` 14 daily bars (28px high, bar `rounded-[2px]`, `bg-white/[.12]`, last 7 `bg-accent`, `role="img"` with `aria-label="Commits, last 14 days: N total"`); zero commits shows flat 2px baseline bars and meta `No commits in 14 days`.
- Row 5 meta line (12.5 `text-3`): `{n} PRs`, `{n} issues`, `Pushed {relative}`; archived repos show Badge `neutral` `Archived`.

**Repo detail** `/career/[owner]/[repo]` **[chosen: owner/repo path per D-03]**: back link `arrow_back Career`; H1 = repo name, eyebrow `REPOSITORY` amber; meta row: primary language, default branch (`font-code`), CI chip, `open_in_new GitHub` link (`rel="noopener noreferrer"`, opens new tab, accessible name `Open {repo} on GitHub`); description under. Then `LanguageBar` card + legend. Sections in order (each a `glass-card rounded-24 p-2` list, rows `rounded-16 px-3 py-2.5`): `OPEN PULL REQUESTS` (title, #number, author, review state Badge: `Approved` green, `Changes requested` red, `Review required` amber, `Draft` neutral), `OPEN ISSUES`, `RECENT CI RUNS` (workflow name, branch, conclusion chip, duration if known, time), `RECENT COMMITS` (message first line, short sha in `font-code`, author, time). Each row links out to GitHub. Each section has its own honest empty row (`No open pull requests.`, etc., 13.5 `text-2`, centered). Unknown/missing repo: 404 `EmptyState` (`Repository not found`). Linked projects: a `LINKED PROJECTS` row of chips linking to `/projects/{id}` when any **[assumed]**. Read-only: no write controls.

### `/projects` (replaces Projects in `domain-page.tsx`)

1. `PageHeader`: eyebrow `PROJECTS` (cyan), title `Projects`, lead `Everything you're building, in one place.` Meta under lead is derived and honest: `{n} projects · {n} due this week · {n} at risk` (show all three clauses so layout is stable; with zero projects show only `No projects yet`). Toolbar (same row, `items-end`): sort segmented control `Priority | Due | Recent` (D-15; design said Deadline/Progress, CONTEXT wins), and primary `New project` button (`add` icon).
2. Filter chips row (`role="group" aria-label="Filter by category"`, `aria-pressed`): `All`, `Personal`, `Career`, `Startup`, `Technical`, `Social`, `Learning`, each with count. Chips with zero count stay visible, `text-3`. Archived projects hidden from All and categories; a trailing chip `Archived {n}` appears only when n>0 **[assumed]**. Filter state in the URL query (`?category=`, `?sort=`) so it survives reload **[assumed]**.
3. Grid of `ProjectCard` `repeat(auto-fill,minmax(min(100%,340px),1fr))`, `gap-3`.
4. Empty (no projects at all) and filtered-empty use `EmptyState` (copy below).

**ProjectCard** (`glass-card rounded-24 p-5`, whole card `next/link` to `/projects/{id}`; `text-text` explicit):
- Row 1: priority tag (`rounded-6`), category caps `text-3`, spacer, health dot + health caps label.
- Row 2: name (Serif 20) and `ProgressRing` (36px, 3px stroke, centered `NN%` 11/500) on the right.
- Row 3: next task line `Next · {title}` 13.5 truncate + due (`text-amber` if due within 3 days or overdue shows `text-red`, else `text-3`); no open tasks: `No open tasks`; no tasks and no milestones: `No tasks yet`.
- Row 4: compact timeline bar (D-12): 4px track `bg-white/[.08]`, today marker (white 2px tick), fill from created date to target date (accent, or amber/red by health). No target date: row omitted. aria: `role="img"` `aria-label="Target {date}, {n} days left"` / `overdue by n days`.
- Row 5 (12.5 `text-3`): `Last activity {relative}` with the source (e.g. `commit pushed`, `task completed`); none: `No activity yet`. Owner-status Paused/Done/Archived shows a neutral chip in row 1 after category.

### `/projects/[id]` workspace

Header block (not a card; page header pattern): back link `arrow_back Projects`; eyebrow = category caps; H1 = name; lead = description (omitted when empty); chips row: owner-status chip, health dot + label, priority tag, target date chip (`schedule` icon, `Target {date}` or `No target date`). Right of the title (same row, `items-end`): `ProgressRing` 72px (6px stroke) with `NN%` Serif 20 inside, `Edit` secondary button, overflow menu (`more_horiz`, menu tier popover rounded-24) with `Archive project` / `Unarchive project` and `Delete project`.

Two-column layout (`gap-6`; main then side; mobile single column in this order: header, workspace, blockers, tasks, milestones, repos, activity):

Main column:
1. `WORKSPACE` (Claude Code) card, see below.
2. `TASKS` card: `SectionHeader` + `New task` (secondary xs, opens Phase 4 task dialog with project preselected). Milestone filter = segmented/select `All milestones | {milestone titles}`. Rows = existing Phase 4 task rows (checkbox, title, due, priority) reused from `tasks-card.tsx`; `Blocked` Badge (amber, `block` icon, tooltip/text `Blocked by {task}`) on tasks with incomplete dependencies. Empty: `No tasks in this project.` + `Add a task` link-button.
3. `MILESTONES + TIMELINE` card: `TimelineStrip` (horizontal, `overflow-x-auto` inside card, min-w 640): date axis with week ticks, today line (accent, 1.5px, `aria-hidden`), milestone diamonds (done = green filled, overdue = red, open = white/.4) and task-due dots, labels below truncated. A visually-hidden ordered list (`<ol>`) mirrors it for screen readers and is the keyboard-focusable alternative; the strip itself is `aria-hidden`. Below: milestone list (rows `rounded-16`): checkbox toggle, title, due date, `n/m tasks`, `Edit`. `Add milestone` secondary xs. No dated items: strip replaced by `Add a target date or milestone to see the timeline.`
4. `RECENT ACTIVITY` list (same row pattern as Career live column): commits/PRs/CI for linked repos plus task completions, newest first, max 15. Empty: `No activity yet. Link a repository or complete a task.`

Side column:
1. `BLOCKERS` card (D-09): derived rows, each `block` icon red/amber + title + reason: `Task "{t}" is blocked by "{u}"`, `Waiting on project "{p}" ({status})`, `Milestone "{m}" is overdue`, `CI failing on {repo}`; each row links to its source (task opens dialog, project, milestone, repo). Plus owner free-text `Blocker note` row (editable inline via Edit dialog, shows as `Note` with `edit` icon). No blockers: green `check_circle` row `Nothing is blocking this project.`
2. `HEALTH` mini-card: health label, one-line deterministic reason (`Behind: 2 overdue tasks`, `At risk: target in 5 days at 40%`, `On track`), progress sentence (`12 of 20 tasks done`, `3 of 4 milestones done`, or `No tasks yet`).
3. `LINKED REPOSITORIES`: compact `RepoCard` (`p-4`, rows 1, 3-meta only: name + CI chip + sparkline + pushed). `Link repository` and `Add link` buttons. URL links list below as rows (label, host, `open_in_new`, remove `close`). `Depends on` rows for project dependencies: chip links with unlink `close`; `Add dependency` opens `DependencyPicker`.

**WorkspaceCard** (D-14, `glass-card rounded-24 p-5`, cyan border/tint above):
- Header row: `CLAUDE CODE WORKSPACE` eyebrow; right chip `Not connected live` (neutral, 10.5 caps) with tooltip text `LifeOS can't see Claude Code sessions on your machine.` **[assumed wording]**. Honest, no fake "connected".
- No path set: body `Add the folder this project lives in on your machine to get a launch command and a context brief.` + `Set workspace` secondary button (opens Edit dialog focused on path).
- Path set: path line (`font-code` 11.5, truncate, `title` full path) and optional machine label chip; actions row (`gap-2`, wrap): `Copy context` (secondary), `Copy launch command` (**primary**, `terminal` icon), `Open on GitHub` (ghost, `open_in_new`, only when a primary linked repo exists, new tab). Primary linked repo = first linked repo by link order **[assumed]**.
- Context brief preview: `glass-card`-nested inset panel (`rounded-14`, `bg-white/[.03] border-white/[.08]`, `p-4`, `font-code` 11.5, `max-h-[220px] overflow-auto`, `tabIndex=0`, `role="region" aria-label="Context brief preview"`) showing the generated Markdown. Same text is what Copy context copies.
- Copy feedback: button label swaps to `Copied` with `check` icon for 2s plus a polite `role="status"` live region and the existing toast `Copied launch command` / `Copied context brief`. Clipboard failure (insecure context/denied): toast `Couldn't copy. Select the text and copy it manually.` and the preview/command stays selectable. The launch command is also shown as selectable `font-code` text under the buttons: `cd "<path>" && claude`. Paths are escaped for double quotes server-side; no `vscode://` or custom protocols.

### Home "Active projects" (D-18)

Existing Home section, real data: up to 4 Active projects by priority then latest activity. Compact card (`glass-card rounded-24 p-4`, link): priority tag, name 13.5/500, health dot, `ProgressRing` 28px, linked repo `Sparkline` (compact 20px) when a repo is linked. Header meta `{n} active`. Empty: existing section empty state with copy below and link button `New project`. Layout and card counts follow `Glass Home.dc.html` section grid; no placeholder fallback rows.

### Dialogs (menu tier, `Dialog`, `p-6`, rounded-30; focus trap, Esc, restore via existing `useDialog`)

- **ProjectDialog** (New/Edit): Name (required, max 80), Description (textarea rounded-14, max 500), Category (Select, required, default Personal), Status (Select, edit only; new = Active), Priority (segmented P1/P2/P3, default P2), Target date (`input type="date"`, optional, clearable), Workspace path (`font-code` input, optional, helper `Folder on your machine, e.g. C:\code\lifeos or ~/code/lifeos`), Machine label (optional, max 40), Blocker note (textarea, optional). Create button `Create project`; edit `Save project`.
- **MilestoneDialog**: Title (required), Due date (optional), Done toggle (edit only). Buttons `Add milestone` / `Save milestone`; edit also has destructive text button `Delete milestone`.
- **LinkDialog**: tab-like segmented `Repository | URL`. Repository: Select of synced repos (searchable by type-ahead via native select; empty list says `No repositories synced yet. Connect GitHub in Settings.` with link to Settings → Connections). URL: Label (required), URL (required, must be http or https, error `Enter a full web address starting with http:// or https://`). Button `Add link`.
- **DependencyPicker** (task and project): Select of eligible items (self excluded); cycle rejected server-side surfaces `InlineError`: `That would create a circular dependency. Pick a different {task|project}.` Button `Add dependency`.
- **Task dialog** (Phase 4, extended): new `Project` Select (`No project` default) and dependent `Milestone` Select (disabled until a project is chosen, `No milestone`), plus `Blocked by` multi-add (list with remove). Placed after Due date, before Notes **[assumed]**. Changing project clears milestone.
- Form pattern as Phase 4: labels above fields (`Field`), inline validation on blur and submit, first invalid field focused, `aria-invalid` + `aria-describedby`, submit disabled while saving with `loading` Button.

---

## Interaction and States

Every data surface specifies loading / empty / error / content:

| Surface | Loading | Not connected | Sync error | Empty |
|---|---|---|---|---|
| `/career` repos | `Skeleton` cards (3), live column 6 skeleton rows; route `loading.tsx` | EmptyState `deployed_code`, link to `/settings` (Connections) | `InlineError` above grid showing `lastSyncError` verbatim + `Sync now` retry; last good data still shown with meta `Last synced {time}` | EmptyState (connected, no repos) |
| Live column | skeleton | hidden when not connected | omitted (page-level error covers it) | row text `No GitHub activity yet.` |
| Repo detail | skeleton | as above | `InlineError` + retry | per-section empty rows |
| `/projects` | skeleton cards | n/a | `InlineError` `Couldn't load projects.` + `Try again` | EmptyState |
| Workspace | skeleton for each card | linked-repo areas show `GitHub isn't connected` + Settings link | CI failing derived only from stored data; sync error shown in linked-repos card `InlineError` | per-section |

- **Hover/focus**: cards border `.16`, `translateY(-1px)`; global focus ring; whole-card links have a single tab stop; inner buttons on a card are not nested inside the link (use overlay-link pattern: card `relative`, link `after:absolute after:inset-0`, buttons `relative z-10`) so there is no interactive-in-interactive markup.
- **Optimistic**: task check/milestone toggle updates immediately, revert + toast `Couldn't update. Try again.` on failure. Creating/editing projects awaits server action (`loading` button), then `router.refresh()`; success toast `Project created` / `Project saved`.
- **Archive**: no confirm (reversible); toast with `Undo` is not required **[assumed]**; archived project page shows a neutral banner `This project is archived.` + `Unarchive` button and is read-only except unarchive/delete.
- **Sort/filter**: instant, client-side on the loaded list; `aria-live="polite"` visually-hidden region announces `{n} projects shown`.
- **Timeline**: no drag; all editing through dialogs (D-12).
- **Motion**: only existing `lo-in` (new live rows), `lo-pulse` (CI running), `lo-rise` (dialogs/menus), `lo-shimmer` (skeleton). `prefers-reduced-motion` global rule already covers all.
- **Responsive**: `>=1100` two columns; 760-1099 single column, repo grid 2 cols; `<760` single column, `px-5`, chips row horizontally scrollable (`overflow-x-auto`, no wrap) with `scroll-snap`; dialogs full-width minus gutters; `TimelineStrip` scrolls horizontally inside its card.

---

## Accessibility

- Sparkline, language bar, ring, timeline bars: `role="img"` with full-sentence `aria-label`; rings use `role="progressbar"` with `aria-valuenow/min/max` and `aria-label="{name} progress"`.
- Health and CI always have visible text, not colour alone.
- Filter chips and sort are `aria-pressed` buttons in labelled groups; sort segmented control follows existing Org range-control pattern.
- Page landmarks: one `h1` per page; sections `aria-labelledby` the `SectionHeader` id; live column `aria-label="Live from GitHub"` list.
- Task checkbox, milestone toggle: real `<input type="checkbox">` or `role="checkbox"` with label = title (reuse Phase 4 task row).
- Overflow menu: `aria-haspopup="menu"`, arrow-key navigation, Esc returns focus, as More menu pattern.
- Contrast: only 04.1 measured pairs (text tiers `text`, `text-2`, `text-3` on card; `text-4` decorative only). Priority P1/P2 `#121214` on `#ff6961`/`#ff9f0a` passes (5.7+/9.1). No new colour pairs.

---

## Copywriting Contract

| Element | Copy |
|---|---|
| Primary CTA (Projects) | `New project` (page), `Create project` (dialog submit) |
| Primary CTA (Career) | `Sync now` (secondary), no primary CTA when connected |
| Primary CTA (workspace) | `Copy launch command` |
| Career not connected: heading | `GitHub isn't connected` |
| Career not connected: body | `Connect GitHub to see your repositories, pull requests and CI here. LifeOS only reads; it never changes anything on GitHub.` + button `Open Settings` (link to `/settings`, Connections) |
| Career connected, no repos: heading | `No repositories synced yet` |
| Career connected, no repos: body | `Your first sync may still be running. Use Sync now, or check that your token can see the repositories you expect.` |
| Career sync error | `GitHub sync failed: {lastSyncError}. Showing the last data we have. Try Sync now, or check the connection in Settings.` |
| Repo no CI | chip `No CI`; detail section empty: `No CI runs found for this repository.` |
| Archived toggle | `Show archived` / `Hide archived` |
| Projects empty (none exist): heading | `No projects yet` |
| Projects empty: body | `A project groups tasks, milestones and repositories toward one outcome. Create your first one to start tracking progress.` + button `Create a project` |
| Projects filtered empty: heading | `No projects in {Category}` |
| Projects filtered empty: body | `Nothing is filed under this category yet. Create one or pick another filter.` + `Create a project` |
| Home Active projects empty | heading `No active projects`, body `Projects you mark Active show up here with progress and health.`, link button `New project` |
| Tasks empty (project) | `No tasks in this project.` |
| Progress with nothing | `No tasks yet` |
| Blockers none | `Nothing is blocking this project.` |
| Workspace card (no path) | `Add the folder this project lives in on your machine to get a launch command and a context brief.` |
| Not-live chip tooltip | `LifeOS can't see Claude Code sessions on your machine.` |
| Copy success | `Copied launch command` / `Copied context brief` |
| Copy failure | `Couldn't copy. Select the text and copy it manually.` |
| Generic load error | `Couldn't load {thing}. Try again.` (button `Try again`) |
| Save error | `Couldn't save the project. Check the highlighted fields and try again.` |
| Validation | name: `Give the project a name.`; milestone title: `Give the milestone a title.`; link URL as above |
| Cycle rejected | `That would create a circular dependency. Pick a different {task|project}.` |
| Destructive: Delete project (no linked data) | Title `Delete project`: `Delete "{name}"? This can't be undone.` Buttons `Delete project` (destructive) / `Cancel` |
| Destructive: Delete project (with linked data) | `Delete "{name}"? Its {n} tasks stay in your task list without a project, and {m} milestones and {k} links are removed. This can't be undone.` (D-05: tasks `SET NULL`) Buttons `Delete project` / `Cancel` |
| Destructive: Delete milestone | `Delete milestone: Delete "{title}"? Tasks assigned to it stay in the project without a milestone.` Buttons `Delete milestone` / `Cancel` |
| Destructive: Remove link | `Remove link: Remove "{label}" from this project? The repository itself is not affected.` Buttons `Remove link` / `Cancel` |
| Archive | non-destructive, no confirm; toast `Project archived` / `Project unarchived` |

Confirmations use the existing destructive-confirm pattern (menu-tier `Dialog`, default focus on `Cancel`, destructive button outline style).

Project status/priority/category/health label strings are literal: `Active`, `Paused`, `Done`, `Archived`; `P1`, `P2`, `P3`; `On track`, `At risk`, `Behind`.

---

## Palette, Agent Surfaces and Nav (UI-facing items only)

- Palette: new `Projects` scope group (search by name, row = icon `deployed_code`, name, category and health in meta, navigates to `/projects/{id}`) and command `New project` (opens ProjectDialog on `/projects`). Row copy/pattern follows existing palette scopes. No Career repo search this phase **[assumed]**.
- Nav: Career and Projects entries already exist; no nav changes. `Projects` page title in nav/tooltips unchanged.
- Agents: read-only tools, no UI beyond existing agent tool lists; no approval UI.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | none (not initialized) | not applicable |
| third-party | none | not applicable |

---

## Assumed Choices Log

1. Repo detail route `/career/[owner]/[repo]`.
2. Sort options `Priority | Due | Recent` (CONTEXT D-15 over design's Deadline/Progress).
3. No heatmap, no streak metrics, no design tabs (Architecture/Deployments/Documentation/Agents) and no fake agent activity column (no real data source).
4. Category shown as plain caps text, not colour-coded; filter state stored in URL query.
5. Archived chip on `/projects` only when count > 0; archive has no confirm and no undo toast.
6. Ring colour: green at 100%/Done (differs from `Progress`'s red at 100%).
7. Primary linked repo = first link by creation order.
8. Task dialog field order: Project, Milestone, Blocked by after Due date.
9. Workspace "Not connected live" chip and tooltip wording.
10. Live column capped at 20 rows, no pagination; Career has no repo scope in palette.

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending


## Checker Resolutions (2026-10-12, binding — override anything above that conflicts)

- Primary save button label is **Save project** everywhere (never bare "Save").
- Single-word buttons get nouns: **Edit project**, **Edit milestone**, **Unarchive project**.
- Focal points: `/career` = repository grid; `/projects` = project card grid (`New project` is the only accent button); `/projects/[id]` = Claude Code workspace card (`Copy launch command` is the primary button); Home = Active projects grid.
- Icon-only buttons have accessible names: overflow `more_horiz` → `aria-label="Project actions"`; remove link `close` → `Remove {label}`; dependency unlink → `Remove dependency on {project}`; task-dialog Blocked-by remove → `Remove {task}`.
- Progress ring sizes: **28px** (Home compact), **36px** with 3px stroke (ProjectCard), **72px** (workspace header).
- Sparkline = **14 bars** with `rounded-[2px]` (not an SVG polyline).
- Owner status chips: Active = green dot; **Paused, Done and Archived = neutral chip** (Done keeps the `check_circle` icon but neutral colour). Health colours remain the only coloured status signal.
