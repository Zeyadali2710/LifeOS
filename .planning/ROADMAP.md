# Roadmap: LifeOS

## Overview
From an empty repo to a personal OS: secure foundation and deploy path first, then the shell and live activity, then the agent/permission core proven end-to-end with GitHub, then one life domain per phase, then automation, hardening and polish. Phase 0 (architecture, ADRs, this roadmap) is complete.

## Phases
- [x] **Phase 1: Foundation** - Repo, Next.js + worker, Postgres/migrations, auth, crypto, logging, health, design tokens, Compose, CI
- [x] **Phase 2: Shell** - Navigation, command palette, Home, live activity stream, notifications, AI panel UI
 (completed 2026-10-07)
- [x] **Phase 3: Agent infrastructure + GitHub** - Tool gateway, permissions, approvals, runs, orchestrator chat, Agent Command Centre, GitHub read-only
 (completed 2026-10-09)
- [x] **Phase 3.1: Model routing** (INSERTED) - Free OpenRouter models for routine agent work, Sonnet escalation, orchestrator stays on Opus
 (completed 2026-10-08)
- [x] **Phase 4: Organization** - Calendars (Google, iCloud), tasks, conflicts, scheduling suggestions (completed 2026-10-11)
- [x] **Phase 4.1: Glass redesign** (INSERTED) - Liquid-glass restyle of the whole app, same features (completed 2026-10-13)
- [x] **Phase 5: Career + Projects** - Repo dashboards, cross-domain projects, project workspaces
 (completed 2026-10-13)
- [ ] **Phase 5.1: Project agent writes + repo contents** (INSERTED) - Agent creates/updates projects via approval; reads repo files
- [ ] **Phase 6: Outreach** - Sydney event discovery, pipeline, email intelligence, drafting
- [ ] **Phase 7: Socials** - Social providers, drafts, content calendar, analytics
- [ ] **Phase 8: Knowledge + Goals** - Notes/docs/retrieval, goal hierarchy
- [ ] **Phase 9: Automation + Daily intelligence** - Automation engine, briefings
- [ ] **Phase 10: Hardening** - Security review, restore-tested backups, observability, performance
- [ ] **Phase 11: Polish** - Motion, accessibility audit, mobile refinement

## Phase Details

### Phase 1: Foundation
**Goal**: A secure, deployable skeleton every later phase builds on.
**Depends on**: Phase 0 (done)
**Requirements**: FND-01..FND-12
**Success Criteria**:
  1. Owner can sign in; everything else redirects to /login
  2. `docker compose up` brings up db, migrate, web, worker healthy; /api/health green
  3. Tests (unit + DB integration + e2e smoke) pass locally and in CI
  4. Docs + ADRs current
**Plans**: 3 plans
- [x] 01-01: Scaffold, env, logging, crypto, DB schema + migrations, tests
- [x] 01-02: Auth, middleware, security headers, design tokens, login + home shell, worker + health
- [x] 01-03: Docker, Compose (dev/prod, backup, tailscale), CI, e2e smoke

### Phase 2: Shell
**Goal**: LifeOS feels like an OS: navigable, live, honest about what's connected.
**Depends on**: Phase 1
**Requirements**: SHL-01..05
**Success Criteria**:
  1. Owner can navigate all domain pages on desktop and phone
  2. A new activity event appears on Home without refresh
  3. Notifications can be read, snoozed, dismissed
**Plans**: 13 plans in 6 waves
- [x] 02-01-PLAN.md — Event backbone: DTO contract, emitActivity (insert + id-only NOTIFY), LISTEN hub
- [x] 02-02-PLAN.md — Pure helpers: Sydney time/snooze/grouping, Open-Meteo weather, date line, lead, isSafePath
- [x] 02-03-PLAN.md — Design tokens 1:1, dark only, self-hosted Material Symbols subset + Icon
- [x] 02-04-PLAN.md — Event sources: auth hooks, web-process health/version monitor, worker/migrate events, e2e helpers
- [x] 02-05-PLAN.md — Notification queries + owner-guarded server actions; /api/events SSE, /api/activity, /api/notifications
- [x] 02-06-PLAN.md — UI primitives (Button variants, Badge, Kbd, EmptyState, InlineError, StatusTile...) + login migration
- [x] 02-07-PLAN.md — Client live store: EventSource reconnect, snapshot resync, snooze wake, useLive()
- [x] 02-08-PLAN.md — Shell chrome: ShellProvider + keyboard map, sidebar/rail, top bar, bottom bar, More sheet, (os) layout
- [x] 02-09-PLAN.md — 10 honest domain pages, template/loading/error, shell-nav e2e
- [x] 02-10-PLAN.md — Command palette, AI panel shell, command bar (not-connected InlineError), palette e2e
- [x] 02-11-PLAN.md — Real Home + live ActivityList + SystemTile, home/live-activity e2e
- [x] 02-12-PLAN.md — Notifications drawer: grouping, filter, read/snooze/dismiss, snooze menu, notifications e2e
- [x] 02-13-PLAN.md — Phase gate: alias cleanup, a11y e2e, docs/attributions, full suite, owner visual sign-off

### Phase 3: Agent infrastructure + GitHub
**Goal**: The orchestrator answers real questions about real GitHub data, with every tool call observable and every risky action gated.
**Depends on**: Phase 2
**Requirements**: AGT-01..06
**Success Criteria**:
  1. "What's happening in my repos?" streams an answer citing real repos/PRs
  2. A PREPARE→APPROVE action shows in approvals, and only runs after approval
  3. Agent Command Centre shows runs with tokens, cost, latency, tool calls
**Plans**: 19 plans in 7 waves
- [x] 03-01-PLAN.md — Schema: agents, permissions, threads, runs, tool_calls, approvals, connections, github_* + migration 0001
- [x] 03-02-PLAN.md — Contracts: SDK install, optional ANTHROPIC_API_KEY, DTOs, registry, policy, pricing, redact, queue sender, fake LLM
- [x] 03-03-PLAN.md — UI primitives (field, disclosure, dialog, progress, status dot), icon subset, ExecutionTrace
- [x] 03-04-PLAN.md — GitHub fetch client + encrypted connection store (read/write tokens)
- [x] 03-05-PLAN.md — Tool gateway callTool: allow-list, zod, tiers, approval creation, idempotency
- [x] 03-06-PLAN.md — Spend + cap, run controls, orphan sweep, threads
- [x] 03-07-PLAN.md — DTO mappers + run/approval live SSE kinds
- [x] 03-08-PLAN.md — GitHub sync (ETag, diff events, CI-failed notifications) + job handler
- [x] 03-09-PLAN.md — GitHub tools: DB-backed READ tools + APPROVE create_issue with marker adoption
- [x] 03-10-PLAN.md — Settings: Connections + AI and spend, owner actions
- [x] 03-11-PLAN.md — Resumable agent loop, delegation, limits, retry
- [x] 03-12-PLAN.md — Approval state machine, actions, resume/expire worker handlers
- [x] 03-13-PLAN.md — POST /api/chat NDJSON, threads + status routes, useAgentStatus
- [x] 03-14-PLAN.md — Command Centre read models + agent control actions
- [x] 03-15-PLAN.md — AI panel: streaming chat, live trace, inline approvals, threads
- [x] 03-16-PLAN.md — Approval Centre page with edit-before-approve
- [x] 03-17-PLAN.md — Agent Command Centre, agent detail, run detail pages
- [x] 03-18-PLAN.md — Worker job registration + shell wiring (badges, AI row, Home, palette)
- [x] 03-19-PLAN.md — Phase gate: e2e, docs, live owner verification

### Phase 03.1: Model routing (INSERTED)

**Goal:** Routine agent work runs on free models so spend goes only where reasoning is needed; the orchestrator stays on claude-opus-5-5.
**Requirements**: AGT-07
**Depends on:** Phase 3
**Success Criteria**:
  1. Simple delegated tasks (e.g. Projects agent listing/summarising synced repos, PRs, issues, commits) run on a free OpenRouter model (e.g. DeepSeek free) at US$0, and the run shows which model answered
  2. Tasks that need reasoning (multi-step analysis, drafting an issue, ambiguous asks) escalate to claude-sonnet-5-5; a free-model failure, timeout or invalid tool call falls back to Sonnet automatically
  3. The orchestrator always runs on claude-opus-5-5; routing is per-run, visible in the trace and Command Centre, and can be overridden per agent in its settings
  4. Spend cap, pricing and audit stay correct for mixed providers; with no OpenRouter key everything behaves exactly as today (Anthropic only)
**Notes:** GitHub sync makes no LLM calls today; the cost is in agent runs. Route behind the existing LlmClient seam (src/server/agents/llm.ts); OpenRouter speaks the OpenAI chat format, so tool-use translation and data-retention/privacy of free providers must be researched (free models may log prompts, so no tokens or private-repo content without an explicit owner choice).
**Plans:** 9/9 plans complete

Plans:
- [x] 03.1-01-PLAN.md — AGT-07, schema (tier, route mode/events, run_turns) + migration 0002 with backfill, route types/steps, registry flags
- [x] 03.1-02-PLAN.md — OpenRouter adapter (fetch, translation, FreeModelError, deny-retry) + $0 :free pricing
- [x] 03.1-03-PLAN.md — routing.ts: resolveModel, free model config, cooldown, D-08 heuristics, escalate tool, D-09 private scan
- [x] 03.1-04-PLAN.md — delegate tier, createRun model resolution, picker values, per-turn pricing + spend by turn model
- [x] 03.1-05-PLAN.md — Encrypted OpenRouter key, dispatching LlmClient, owner actions (key, private opt-in)
- [x] 03.1-06-PLAN.md — Loop: private gate, retry/fallback, escalate, sanity checks, Free-only failure, resume
- [x] 03.1-07-PLAN.md — Settings UI: OpenRouter row + private-repo opt-in toggle
- [x] 03.1-08-PLAN.md — Command Centre: route steps in traces, model chip, free/paid counts, 4-option picker
- [x] 03.1-09-PLAN.md — Docs/ADR, full suite and live OpenRouter smoke test on the VM

### Phase 4: Organization
**Goal**: Calendars and tasks live in LifeOS: Google + iCloud events in one view, tasks and reminders alongside, with conflicts flagged and free time suggested.
**Depends on**: Phase 3
**Requirements**: ORG-01..03
**Success Criteria**:
  1. Google Calendar and iCloud CalDAV events appear together in day/week/month views via a CalendarProvider seam
  2. Creating/editing/deleting an event (incl. recurring) on an external calendar works; owner UI writes run directly and are audit-logged, while agent-initiated create/edit goes through an APPROVE-tier approval and agent delete through HIGH_RISK before it runs (Phase 4 D-06/D-07)
  3. Tasks and reminders can be created and completed; overlapping events/tasks are flagged and scheduling suggestions are offered
**Plans**: 22 plans in 8 waves
- [x] 04-01-PLAN.md — Approval machine per tool kind, server side (approval-kinds, event payloads, ProviderError, approvals/gateway)
- [x] 04-02-PLAN.md — Kind-tagged ApprovalDTO + approval UI dispatch, GitHub regression pass
- [x] 04-03-PLAN.md — Package legitimacy check + install tsdav/ical.js, optional Google env, owner Google Cloud setup (redirect + In production)
- [x] 04-04-PLAN.md — TDD pure conflicts, free slots, Today's plan, header numbers
- [x] 04-05-PLAN.md — UI primitives: Dialog width/sheet, Checkbox, RadioGroup, isSafeUrl, icon subset
- [x] 04-06-PLAN.md — Schema + [BLOCKING] migration 0003, DTO/category contracts, VM DB test runner, owner VM migrate gate
- [x] 04-07-PLAN.md — CalendarProvider seam, ical.js expander, recurring-edit transforms (ICS + Google)
- [x] 04-08-PLAN.md — Encrypted calendar connection store (incl. rotation) + calendar list store
- [x] 04-09-PLAN.md — Read model: range instances, conflicts, plan, header, tasks, agent query helpers
- [x] 04-10-PLAN.md — Live calendar/task SSE signals, tasks service + actions, reminder job
- [x] 04-11-PLAN.md — Google client, provider and OAuth routes (state + PKCE)
- [x] 04-12-PLAN.md — iCloud CalDAV provider + connectIcloud
- [x] 04-13-PLAN.md — Provider-agnostic sync service (D-03 7-day activity, conflicts, RECONNECT)
- [x] 04-14-PLAN.md — Wire providers + worker sync, event write service, owner event actions
- [x] 04-15-PLAN.md — Settings: calendar connection rows, iCloud form, calendar list
- [x] 04-16-PLAN.md — Organization page: header, legend, Day/Week grid, event detail, states
- [x] 04-17-PLAN.md — Organization agent live: calendar/task tools, tiers, taint, clock
- [x] 04-18-PLAN.md — Today's plan card, tasks card, task dialog
- [x] 04-19-PLAN.md — Month view, event dialog with recurring scopes, page wiring
- [x] 04-20-PLAN.md — Calendar approval views and AI panel events card
- [x] 04-21-PLAN.md — Palette scopes, e2e, validation, owner VM verification
- [x] 04-22-PLAN.md — Docs: integrations, database, third-party, agents, permissions, security

### Phase 04.1: Glass redesign: liquid-glass restyle of tokens, fonts, UI primitives, shell (floating top pill nav, Ask bar, mobile pill tab bar, floating glass panels) and every page per the Claude Design LifeOS Glass files; same features and content, style and layout only (INSERTED)

**Goal:** The whole app wears the owner's liquid-glass design (floating pill header, mobile pill tab bar, Ask bar, floating glass panels, Instrument Serif + Familjen Grotesk) with the same features, content and behaviour, WCAG AA contrast and solid fallbacks, and smooth scrolling on the VM.
**Requirements**: TBD (CONTEXT decisions D-01..D-08)
**Depends on:** Phase 4
**Plans:** 15/15 plans complete

Plans:
- [x] 04.1-01-PLAN.md — Glass tokens, tier utilities, a11y fallbacks, fonts, gate script
- [x] 04.1-02-PLAN.md — UI primitives restyle (src/ui)
- [x] 04.1-03-PLAN.md — Header pills, non-modal More menu, System block, nav split
- [x] 04.1-04-PLAN.md — Floating AI panel and assistant sub-views
- [x] 04.1-05-PLAN.md — Notifications, palette, toast as floating cards; compact palette command removed
- [x] 04.1-06-PLAN.md — Mobile tab bar, More sheet, desktop Ask bar
- [x] 04.1-07-PLAN.md — Mount Glass shell, remove compact mode, delete old shell components
- [x] 04.1-08-PLAN.md — Home and honest empty domain pages
- [x] 04.1-09-PLAN.md — Organization header, legend, time/month grids, categories
- [x] 04.1-10-PLAN.md — Organization plan/tasks cards and dialogs
- [x] 04.1-11-PLAN.md — Agents command centre, cards, runs, detail, trace, identity colours
- [x] 04.1-12-PLAN.md — Approval centre
- [x] 04.1-13-PLAN.md — Settings
- [x] 04.1-14-PLAN.md — e2e/a11y updates, whole-src gates, owner VM verification
- [x] 04.1-15-PLAN.md — Login re-skin (tokens only)

### Phase 5: Career + Projects
**Goal**: Career and Projects stop being honest-empty pages: GitHub repositories show live health and activity, cross-domain projects track tasks, milestones, dependencies and blockers on a timeline, and each project has a workspace view with its repos, tasks and Claude Code workspace links.
**Depends on**: Phase 3 (GitHub read-only sync), Phase 4 (tasks), Phase 4.1 (Glass UI)
**Requirements**: CAR-01..03
**Success Criteria**:
  1. The Career page shows a dashboard per synced repository (status/CI health, languages, recent commits, open PRs and issues, activity) from the existing read-only GitHub sync, with honest empty/error states
  2. A project can be created, edited and archived; it links repos, tasks (reusing Phase 4 tasks), milestones, dependencies and blockers, and shows progress on a timeline; Home's "Active projects" reflects real projects
  3. A project workspace view shows the project's repos, tasks, milestones and Claude Code workspace links, and agents can read project data through the tool gateway under existing permission tiers
**Plans**: 12 plans
- [x] 05-01: Client-safe contracts (DTOs, zod payloads), pure rules module + unit tests, new icon glyphs
- [x] 05-02: [BLOCKING] Schema + migration 0005 (projects, milestones, dependencies, links, task FKs, repo languages); owner VM migrate gate
- [x] 05-03: GitHub sync languages + commit depth; career query layer
- [x] 05-04: Project writes: CRUD, cycle-safe dependencies, task project/milestone, audit + activity, server actions
- [x] 05-05: Shared status/graphics components, RepoCard, ActivityFeed
- [x] 05-06: Project read model + projects.list/projects.get READ agent tools
- [x] 05-07: /career dashboard and /career/[owner]/[repo] detail
- [x] 05-08: Project, milestone, link and dependency dialogs; task dialog pickers
- [x] 05-09: /projects index (filters, sort, cards, create)
- [x] 05-10: /projects/[id] workspace (Claude Code card, tasks, timeline, blockers, links)
- [x] 05-11: Home Active projects + palette Projects scope
- [x] 05-12: E2E, docs, local gates; owner deploy + VM tests + UAT

### Phase 5.1: Project agent writes + repo contents (INSERTED)
**Goal**: The owner can ask LifeOS "create a project from my <repo>" and get it fully set up in one turn: the Projects agent reads the repository's files (README, docs/, roadmap, file tree) and drafts the project (name, description, context, tasks, milestones, repo link), and the owner approves it once.
**Depends on**: Phase 5
**Requirements**: CAR-02, CAR-03 (agent-side), AGT-01 tier rules
**Success Criteria**:
  1. Read-only `github.list_tree` / `github.get_file` tools (size-capped, default branch, private repos via the existing read token) let agents read README, docs and roadmap files; repo content is treated as untrusted/tainted (cannot by itself trigger write actions).
  2. Projects agent gets write tools: create/update project (incl. description and context notes), add/update tasks and milestones, link repos/URLs, add dependencies — every write goes through PREPARE→APPROVE with edit-before-approve; one approval can create a project with its tasks, milestones and links.
  3. The owner's Studio prompt ("Create a project based on my Studio repository … fully set up") produces a single approval card that, once approved, creates the complete project; e2e + VM DB tests cover tools, tiers and the approval path.
**Plans**: 8 plans
- [ ] 05.1-01: projects.context column + migration 0007, shared draft payload schemas
- [ ] 05.1-02: github.list_tree / github.get_file READ tools + Studio fixtures
- [ ] 05.1-03: D-06 content floor in the gateway, per-agent run limits, io:input tool schemas
- [ ] 05.1-04: project_create / project_update approval kinds, locks, summaries, stale check
- [ ] 05.1-05: projects.create / projects.update APPROVE tools (one transaction, adopt), registry + prompts, Studio flow tests
- [ ] 05.1-06: Project approval card (edit-before-approve), list row, AI panel card, seeded e2e
- [ ] 05.1-07: Context in ProjectDialog, workspace CONTEXT card, Copy context brief
- [ ] 05.1-08: Docs, validation, local gates, owner VM migrate 0007 + live Studio UAT

### Phase 6–11
Goals per phase list above; detailed when each phase is planned (`/gsd-plan-phase N`).

## Credentials & external access needed
| When | What |
|---|---|
| Phase 1 deploy | Proxmox VM, Tailscale auth key + tailnet HTTPS enabled |
| Phase 3 | Anthropic API key, GitHub fine-grained PAT (read-only) |
| Phase 4 | Google OAuth client (Calendar), iCloud app-specific password |
| Phase 6 | Gmail OAuth (same Google client), event source API keys (Eventbrite/Luma; Meetup needs Pro) |
| Phase 7 | LinkedIn / Meta (Instagram) / TikTok developer apps — mocks until approved |

## Progress
| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 0. Architecture | - | Complete | 2026-10-07 |
| 1. Foundation | 3/3 | Complete | 2026-10-07 |
| 2. Shell | 13/13 | Complete   | 2026-10-07 |
| 3. Agents + GitHub | 19/19 | Complete   | 2026-10-09 |
| 4. Organization | 22/22 | Complete | 2026-10-11 |
| 4.1 Glass redesign | 15/15 | Complete | 2026-10-12 |
| 5. Career + Projects | 12/12 | Complete | 2026-10-13 |
| 5.1–11 | - | Not started | - |
