# Roadmap: LifeOS

## Overview
From an empty repo to a personal OS: secure foundation and deploy path first, then the shell and live activity, then the agent/permission core proven end-to-end with GitHub, then one life domain per phase, then automation, hardening and polish. Phase 0 (architecture, ADRs, this roadmap) is complete.

Development now follows direct, owner-requested feature work (GSD discontinued on 2026-10-16). Historical plans are retained as implementation records. Implementation status and outstanding live acceptance checks are listed separately below.

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
- [x] **Phase 5.1: Project agent writes + repo contents** (INSERTED) - Agent creates/updates projects via approval; reads repo files (completed 2026-10-13)
- [x] **Phase 6: Outreach** - Sydney event discovery, pipeline, email intelligence, drafting (completed 2026-10-13)
- [x] **Phase 7: Socials** - Closed 2026-10-16 after owner confirmed the deployed page and pushed the recent changes. Live publishing/scheduling remains a separate operational check.
- [ ] **Phase 7.1: Finances** (INSERTED) - CSV imports, deduplication, automatic categories, monthly graphs and carried category budgets. Locally verified; deployment and owner acceptance pending.
- [x] **Phase 8: Knowledge + Goals** - Notes/docs/retrieval, goal hierarchy (built 2026-10-17 autonomous run; owner VM acceptance pending)
- [x] **Phase 9: Automation + Daily intelligence** - Automation engine, briefings (built 2026-10-17 autonomous run; owner VM acceptance pending)
- [x] **Phase 10: Hardening** - Security review, restore-tested backups, observability, performance (built 2026-10-17 autonomous run; owner VM restore drill pending)
- [x] **Phase 11: Polish** - Motion, accessibility audit, mobile refinement (built 2026-10-17 autonomous run)

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
- [x] 05.1-01: projects.context column + migration 0007, shared draft payload schemas
- [x] 05.1-02: github.list_tree / github.get_file READ tools + Studio fixtures
- [x] 05.1-03: D-06 content floor in the gateway, per-agent run limits, io:input tool schemas
- [x] 05.1-04: project_create / project_update approval kinds, locks, summaries, stale check
- [x] 05.1-05: projects.create / projects.update APPROVE tools (one transaction, adopt), registry + prompts, Studio flow tests
- [x] 05.1-06: Project approval card (edit-before-approve), list row, AI panel card, seeded e2e
- [x] 05.1-07: Context in ProjectDialog, workspace CONTEXT card, Copy context brief
- [x] 05.1-08: Docs, validation, local gates, owner VM migrate 0007 + live Studio UAT (owner steps pending — OWNER-ACTIONS.md)

### Phase 6: Outreach
**Goal**: Outreach stops being an honest-empty page: Sydney events are discovered from real sources and scored for relevance, saved events move through a pipeline into the calendar and follow-ups, and Gmail is triaged by an agent that classifies, summarises, flags, extracts actions and drafts replies, with sending always behind approval.
**Depends on**: Phase 3 (agents, approvals), Phase 4 (calendar, tasks, Google OAuth), Phase 5 (projects/tasks reuse)
**Requirements**: OUT-01, OUT-02, OUT-03
**Success Criteria**:
  1. An `EventSourceProvider` seam returns normalized Sydney events from every source whose API or public feed actually permits discovery (verified at research time — e.g. public iCal feeds of followed Luma/Meetup calendars, schema.org JSON-LD URL import, Eventbrite/Luma APIs where a key adds value); sources without usable access run as real mock classes badged MOCK. Eventbrite/Luma API keys are entered only in Settings → Connections (encrypted like the GitHub token), never in .env. Events are deduplicated and scored for relevance against the owner's interests/projects with an explainable score.
  2. A saved event moves SAVED → INTERESTED → ATTENDING → ATTENDED → FOLLOW_UP; ATTENDING can put it on the calendar (existing CalendarProvider, owner write) and FOLLOW_UP creates follow-up tasks (Phase 4 tasks); every transition is an activity event.
  3. Gmail connects through the existing Google OAuth client with an added Gmail scope and a "Reconnect Google" step in Settings; messages sync incrementally (read-only scope plus compose/send for drafts) and the Outreach/Email agent classifies, summarises, flags and extracts actions (to tasks) under READ tier; drafting a reply creates a draft, and sending is an APPROVE-tier action with edit-before-approve. Mail content is untrusted (Phase 5.1 content floor) and private (03.1 free-model gate).
  4. The Outreach page (events list + pipeline board, email triage view) follows the Claude Design Outreach file in the Glass system; e2e + VM DB tests cover providers (fixtures), pipeline, Gmail sync and the send approval path.
**Plans**: 19 plans in 10 waves
Plans:
- [x] 06-01-PLAN.md — Schema + migration 0008 (event_sources, outreach_events, mail_messages, task FKs, connections.scopes), queue names, client-safe outreach types
- [x] 06-02-PLAN.md — SSRF-safe safeGet, shared text helpers, Gmail body extraction, reply MIME builder
- [x] 06-03-PLAN.md — iCal feed parser (reuses Phase 4 expansion) and schema.org JSON-LD event extraction
- [x] 06-04-PLAN.md — Normalize/dedup keys, Sydney/window filter, explainable 60/20/20 relevance score + why line
- [x] 06-05-PLAN.md — Google scope split (Gmail optional, calendar required), stored scopes, Gmail client
- [x] 06-06-PLAN.md — Pipeline server: stage transitions + activity, Add to calendar, follow-up tasks, 'outreach' live kind
- [x] 06-07-PLAN.md — Event providers (ics, Eventbrite/Luma keyed-or-mock, Meetup/Humanitix mocks), sync/upsert/merge/prune/score, 6-hour worker
- [x] 06-08-PLAN.md — Gmail incremental sync (metadata only, quota-safe, 404 fallback) + fake Gmail helper
- [x] 06-09-PLAN.md — Feeds, Eventbrite/Luma keys, organizer ids, URL import, interests, Sync now actions
- [x] 06-10-PLAN.md — Outreach agent live with READ tools, content floor, hard mail taint
- [x] 06-11-PLAN.md — Haiku mail triage as recorded runs with cap pause + mail worker schedules
- [x] 06-12-PLAN.md — mail.send_reply APPROVE tool, mail_reply approval kind, idempotent send
- [x] 06-13-PLAN.md — Settings: Reconnect Google + Gmail status, event keys/feeds, Outreach interests, icons
- [x] 06-14-PLAN.md — Mail owner actions (body, archive, flag, add as task, triage, Save to Gmail drafts) + mail approval UI
- [x] 06-15-PLAN.md — /outreach page, EVENTS list, EventCard, WHY block, Add to calendar dialog
- [x] 06-16-PLAN.md — Pipeline board, follow-up + import dialogs, event detail route, palette scope + command
- [x] 06-17-PLAN.md — EMAIL and FOLLOW-UPS tabs with draft-reply approval flow
- [x] 06-18-PLAN.md — e2e outreach spec on seeded rows + docs
- [x] 06-19-PLAN.md — Phase gate: local gates, validation map, OWNER-ACTIONS, owner VM migrate + UAT

### Phase 7: Socials
**Goal**: Socials stops being an honest-empty page: the owner drafts posts once and gets platform variants, plans them on a content calendar, and publishes or schedules through each provider only as far as its API honestly allows — every publish behind approval — with analytics shown where APIs permit.
**Depends on**: Phase 3 (agents, approvals), Phase 4 (calendar view patterns), Phase 5/6 (projects/events as post sources, encrypted connection store, mocks)
**Requirements**: SOC-01, SOC-02, SOC-03
**Success Criteria**:
  1. A `SocialProvider` seam covers LinkedIn, Instagram, TikTok and Portfolio, each declaring real `capabilities` (draft/publish/schedule/analytics) verified at research time; providers without approved developer apps run as real mock classes badged MOCK, and credentials are entered only in Settings → Connections (encrypted), never in .env.
  2. The owner (or the Socials agent, PREPARE tier) creates a draft from scratch or from a project/event/repo, gets per-platform variants with length/format checks, and places drafts on a content calendar (week/month) alongside existing calendar views.
  3. Publishing or scheduling a variant is an APPROVE-tier action with edit-before-approve, idempotent on retry, and honest when a provider can't publish (copy-to-clipboard/open-in-app fallback instead of pretending).
  4. Analytics per post/platform are synced where the API permits and shown on the Socials page; elsewhere the page says what isn't available. Page follows the Claude Design Socials file in the Glass system; e2e + VM DB tests cover providers (fixtures/mocks), drafts, calendar and the publish approval path.
**Plans**: 7 plans in 6 waves
- [x] 07-01-PLAN.md — Schema, pure rules, providers, encrypted connections and fixtures
- [x] 07-02-PLAN.md — Owner drafts and queries, Social agent, atomic publish approval
- [x] 07-03-PLAN.md — Bound publish executor, analytics sync and TikTok OAuth
- [x] 07-04-PLAN.md — DB tests, integration docs and owner action gates
- [x] 07-05-PLAN.md — Socials shell, platform cards and honest status states
- [x] 07-06-PLAN.md — Board, post sheet, calendar and analytics views
- [x] 07-07-PLAN.md — Approval UI, Settings connections, palette and e2e spec

Follow-ups (2026-10-16): Instagram post-level insights implemented; multiple Gmail accounts implemented for Outreach with separate tokens, sync history and account-bound approved replies. Migration 0010 preserves existing mail. Verified with 108 affected database tests; multiple-account Gmail acceptance remains pending. Subsequent history fix imports existing Instagram/public TikTok posts from January 1, defaults analytics to YTD, and requires migration 0011; verified with 553 unit tests and 35 Socials/migration DB tests. The owner subsequently confirmed the Socials page looks good, pushed the recent changes and requested closure of this phase. Live publishing/scheduling was not separately verified in this session.

### Phase 7.1: Finances (INSERTED)

**Goal:** Replace the owner's manual transaction workbook with an owner-only finance dashboard, based on its categories and monthly summaries.
**Workflow:** Direct feature development requested by the owner; no GSD execution or router.
**Scope:** CSV preview and explicit confirmation, per-account deduplication, review of ambiguous matches, local keyword categorisation and remembered corrections, transaction search/filtering, monthly income/spending charts, category breakdowns, monthly category budgets carried forward with overrides, and removable import batches.
**Decisions:** Transfers in/out count as income/spending. All figures are AUD integer cents. Budgets cover all imported accounts; a saved monthly limit carries into later months until changed. Savings/investments show net contributions, not account valuation. No private transactions or workbook keyword mappings in source control, fixtures or external AI calls.
**Database:** Additive migration `0012_finances`; production deployment and the owner's first import remain pending.
**Reference:** `docs/finances.md` describes supported CSV formats, import checks and deployment.

**Agent increment (2026-10-16):** Owner requested orchestrator access to Finance. Live Finance agent reads transaction history and proposes category/rule replacements, bulk recategorisation, individual corrections and budget changes through one HIGH_RISK approval. Complete merchant coverage and server snapshots protect bulk edits; existing transaction amounts/dates and carried budget history are preserved. Paid models only, including subsequent delegated/private context; owner deployment and live acceptance remain pending.

### Phase 8: Knowledge + Goals
**Goal:** KNW-01 and GOL-01. Design source: `design/glass/Glass Knowledge.dc.html`, `Glass Goals.dc.html` (layout only; content is placeholder). Plan written 2026-10-17 by Claude (autonomous run, owner asleep); decisions below are auto-decisions for owner review.

**A. Knowledge**
1. Migration `0013_knowledge`: `knowledge_items` (kind note|document|bookmark|idea|research, title, body, url, tags text[], source manual|upload|agent, optional `project_id` set-null, `viewed_at`, generated weighted `tsvector` + GIN, nullable `embedding vector(1536)` + `embedded_hash`). Requires `create extension if not exists vector` (image is pgvector/pgvector:pg17).
2. Server: owner-only CRUD actions, `.md`/`.txt` document upload (≤ 500 KB, text only, no PDF parsing), bookmark URL via existing `isSafeUrl` (no server-side fetch), keyword search (`websearch_to_tsquery` + prefix fallback, ranked), section/tag filters and counts, recently viewed.
3. Semantic search: **off by default**, owner opt-in setting `knowledge.semantic`, uses the existing encrypted OpenRouter key and `openai/text-embedding-3-small` via OpenRouter embeddings. A worker job embeds changed items in batches; query embedding at search time; cosine `<=>` ranking. When off or no key, the Semantic mode shows an honest disabled state. Item text only leaves LifeOS when the owner opts in.
4. UI `/knowledge` per design: search with Keyword/Semantic, tags, sections with counts, recently viewed, results, detail article with linked project, create/edit dialog, delete confirm, mobile stacking.
5. Knowledge agent live (Sonnet, private tools): `knowledge.search`, `knowledge.get` (READ, private, untrusted content), `knowledge.save_note` (APPROVE, new approval kind `knowledge_note`, editable title/body/tags before approval, idempotent by approval id). Orchestrator delegates.

**B. Goals**
6. Migration `0014_goals`: `goals` (title, color, target_date, status active|done|archived, sort), `objectives` (goal cascade, title, target_date, optional manual progress 0–100, sort), `objective_projects` link table (cascade both). Vision in `settings` key `goals.vision`.
7. Read model: objective progress = manual value if set, else completed/total tasks of linked projects; goal progress = mean of objectives. Momentum = linked tasks completed in last 14 days vs the 14 before (rising/steady/slowing). Neglect = active objective with no linked task completion or project update for 21 days. Horizons: objectives by target date (this week / month / year / long term).
8. UI `/goals` per design: editable vision, horizon tabs + target cards, 4-column goal → objective → project → task tree (task tick reuses the existing task completion action), CRUD dialogs, project link picker, neglect badges, header sentence from real momentum.
9. Goals agent live, read-only `goals.overview` (private) so the orchestrator can answer progress questions. Agent goal writes deferred.

**After Codex plan critique (2026-10-17):**
- Knowledge agent is paid-only and hard-private like Finance (no free model even with the private opt-in); retrieved items are untrusted data. The page says Ask Knowledge sends retrieved notes to Anthropic.
- `knowledge.save_note` and the `knowledge_note` approval kind are **deferred**; Phase 8 agents are read-only.
- One objective per project (`objective_projects.project_id` is the primary key) so tasks are never double counted. Unlinked projects appear only in the link picker.
- Progress: objective with no tasks and no manual value = "no tasks yet" and is excluded from the goal mean; archived projects excluded; a manual value stays fixed until cleared. Neglect = active objective under an active goal whose last activity (linked task created/completed, or the objective's own creation/edit) is over 21 days old.
- Task ticks go through the existing task completion service (dependency checks kept); blocked tasks show as blocked.
- Embedding: a scheduled job embeds items whose content hash differs from `embedded_hash`, so edits re-index and deletes need nothing; failures are logged and retried next run; the page shows "N of M indexed". Semantic results honour section/tag filters.
- Limits: title 200, body 200k chars, ≤12 tags × 40 chars, URL 2000, query 200; upload must be valid UTF-8. Prefix tsquery is built only from `[\p{L}\p{N}]+` tokens.
- Prod DB role is the image's bootstrap superuser, so `create extension vector` works in the migration.

**Risks:** pgvector extension on the existing prod volume (migration must create it); embedding cost/latency (batch, hash-skip); FTS language config (use `simple` for names/tech terms); keeping finance/mail privacy taint semantics (knowledge content is private).

**Done when:** full gate green, Codex + Claude phase review fixed, docs (`docs/knowledge-goals.md`, agents/permissions) updated, owner VM steps in OWNER-ACTIONS.

### Phase 9: Automation + Daily intelligence
**Goal:** AUT-01 and AUT-02, plus the Home sections still showing placeholders (Priorities, Today, Upcoming). Plan written 2026-10-17 by Claude (autonomous run); decisions are auto-decisions for owner review. No new external services, credentials or dependencies.

**A. Daily digest, Home, briefings**
1. `src/server/digest.ts`: one deterministic read model (no LLM, nothing leaves LifeOS) from existing data: today's events and conflicts, tasks due/overdue today, tasks completed today, approvals waiting, unread IMPORTANT mail (subjects), saved/attending Sydney events in the next 3 days, neglected or slowing objectives, over-budget categories this month, CI failures in the last 24 h, next 6 days of events.
2. Ranked **Priorities** (top 5) from that digest with fixed weights: overdue high-priority tasks, approvals waiting, important mail, today's conflicts, CI failures, over-budget categories, neglected objectives. Each item links to its page.
3. Home: replace the Priorities, Today and Upcoming placeholders with real data (honest empty states when a source isn't connected).
4. Migration `0014_briefings`: `briefings` (kind morning|midday|evening|weekly, period key, sections jsonb, created_at, read_at; unique (kind, period)). Worker job `briefings.tick` every 15 min generates any enabled briefing whose Sydney time has passed for the current period, idempotent on the unique key, then emits one FYI notification linking to `/briefings/<id>`. Morning = today; midday = what's left today; evening = done today + tomorrow; weekly (Sunday) = week's completed tasks, goal momentum, month budget, next week's calendar.
5. Settings → Briefings: per-kind on/off and Sydney time (defaults: morning 07:00 on, midday 12:30 off, evening 18:00 on, weekly Sun 18:00 on). `/briefings` lists recent briefings; `/briefings/<id>` renders one.

**B. Automations**
6. Migration `0015_automations`: `automations` (name, enabled, trigger, conditions, actions as validated jsonb) and `automation_runs` (automation, trigger ref, status, result/error; unique (automation, trigger ref) for idempotency).
7. Triggers: an activity event type (from the existing event vocabulary, e.g. `github.ci.failed`, `mail.important`, `calendar.conflict`) or a Sydney schedule (time + weekdays). Conditions: all-of filters on event title/source/detail (`contains`/`equals`, case-insensitive). Events whose source is `automation` never trigger automations (no loops).
8. Actions: `notify` (title/body/priority), `create_task` (title, due in N days, optional project), and `ask_agent` (prompt to the orchestrator). `ask_agent` runs go through the normal gateway and approval tiers; automation-originated runs additionally floor every side-effect tool at APPROVE because nobody is watching. Spend cap applies. A per-automation rate limit (max 20 runs/day) prevents storms.
9. Worker job `automations.tick` every minute: scans activity events after a stored cursor and due schedules, evaluates, records runs, executes actions. Failures recorded per run; no retries of side-effecting actions.
10. UI `/automations` (linked from Agents and the palette): list with enabled toggle, last run, recent runs; create/edit dialog with trigger, conditions and actions; delete confirm.

**After Codex plan critique (2026-10-17):**
- Every action goes through the gateway: a live, non-LLM `automations` agent owns tools `automation.notify`, `automation.create_task` (EXECUTE, owner-authored config) and `automation.ask_agent`. Each automation run gets an agent run (model `automation`) and calls tools with deterministic tool-use ids `a<runId>:<actionIndex>`, so a crashed run re-executed by recovery returns the earlier results instead of duplicating (gateway unique (run, toolUseId) + idempotency key). Tool calls appear in Command Centre traces.
- `ask_agent` creates an orchestrator run with a trusted `agent_runs.origin = 'automation'` column (migration) and enqueues the existing resume job. The gateway floors side-effect tools at APPROVE when the run's root (via parent/retry chain) has that origin, covering delegated and resumed runs.
- No event cursor: event triggers consider events from the last hour that occurred after the automation was (re)enabled (`enabled_at`), and claim `automation_runs` with `insert … on conflict (automation_id, trigger_ref) do nothing`. Rate limit (20/24 h) is checked inside the claim transaction under a per-automation advisory lock. A failing event never blocks others.
- Recovery: runs left `running` for over 5 minutes are re-executed (idempotent as above) up to 3 attempts, then marked failed.
- Sydney periods: briefing period key = Sydney date (weekly = that Sunday's date); generation + its notification happen in one transaction keyed on (kind, period). A late worker still generates within the same period; missed periods are skipped. Scheduled automation trigger ref = `schedule:<Sydney date>T<HH:MM>`, fired up to 30 minutes late, else skipped. Local times use Intl Sydney parts (DST-safe).
- Privacy: briefings and run results stay in LifeOS (owner-only pages). Notifications carry counts only, never mail subjects. `ask_agent` runs get the normal privacy taint; nothing in the editor sends data externally on its own.
- Home sections stay in scope but reuse the digest (no extra queries).

**Risks:** duplicate execution on worker restart (unique trigger ref + transaction); automation loops (source filter + rate limit); unattended agent side effects (APPROVE floor); notification noise (briefing defaults, rate limit).

**Done when:** full gate green, Codex + Claude phase review fixed, docs (`docs/automations-briefings.md`, agents/permissions) updated, owner VM steps in OWNER-ACTIONS.

### Phase 10: Hardening
Built 2026-10-17 (autonomous run, direct loop: Claude implemented, Codex reviewed the diff plus the auth/session/proxy/crypto/gateway/OAuth code).
- Static owner-guard test: every exported server action must call `requireOwner()` first; every API route checks the session except auth and health; every signed-in page requires the owner.
- Verified backups: `docker/backup.sh` keeps a dump only after it fully restores into a throwaway database; status in `settings.backup.last`; failed, stale (>36 h) or never-recorded backups become a red Home priority. `scripts/restore-drill.sh` for owner drills.
- Master key rotation: `rotate-key` script (dry run, single transaction, verified re-encryption, all-or-nothing, audited).
- Performance: `(type, occurred_at)` index on `activity_events` for the per-minute automation scan (migration 0015).
- Security review: no findings in auth, CSRF/origin, CSP, client-IP handling, crypto, gateway tiers or OAuth callbacks; login `next` is path-checked. npm audit: no high-severity production advisories (4 moderate in dev-only drizzle-kit).
- Deferred: pg-boss failed-job visibility, activity_events retention, passkeys (v2).

### Phase 11: Polish
Built 2026-10-17 (autonomous run).
- Accessibility: new `tests/e2e/a11y-audit.spec.ts` runs axe-core (already installed via eslint-plugin-jsx-a11y) on every signed-in page, desktop and mobile, failing on any serious/critical WCAG 2.0/2.1 A/AA violation. Fixed: live activity `role="log"` on a `<ul>` broke list semantics; label-in-name mismatches (status tiles, Socials connect links, Goals vision); icon ligature names and shortcut hints now render via CSS `content: attr(...)` so they never leak into accessible names, copy/paste or find-in-page; Ask buttons expose `aria-keyshortcuts`.
- Mobile: Knowledge sections as a horizontal row and the open item first; Goals horizon tabs as a 4-column grid; briefings list stacks headline under the name.
- Motion: existing global `prefers-reduced-motion` rule covers all new UI (no new animation added).

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
| 5.1 Project agent writes | 8/8 | Complete (owner VM UAT pending) | 2026-10-13 |
| 6. Outreach | 19/19 | Complete (owner VM UAT pending) | 2026-10-13 |
| 7. Socials | 7/7 | Owner accepted deployed page; closed. Live publishing remains an operational check. | 2026-10-16 |
| 7.1 Finances | Direct feature | Locally verified; deployment and owner acceptance pending | - |
| 8–11 | - | Not started | - |
