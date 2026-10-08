# Roadmap: LifeOS

## Overview
From an empty repo to a personal OS: secure foundation and deploy path first, then the shell and live activity, then the agent/permission core proven end-to-end with GitHub, then one life domain per phase, then automation, hardening and polish. Phase 0 (architecture, ADRs, this roadmap) is complete.

## Phases
- [x] **Phase 1: Foundation** - Repo, Next.js + worker, Postgres/migrations, auth, crypto, logging, health, design tokens, Compose, CI
- [x] **Phase 2: Shell** - Navigation, command palette, Home, live activity stream, notifications, AI panel UI
 (completed 2026-10-07)
- [ ] **Phase 3: Agent infrastructure + GitHub** - Tool gateway, permissions, approvals, runs, orchestrator chat, Agent Command Centre, GitHub read-only
- [ ] **Phase 4: Organization** - Calendars (Google, iCloud), tasks, conflicts, scheduling suggestions
- [ ] **Phase 5: Career + Projects** - Repo dashboards, cross-domain projects, project workspaces
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
- [ ] 03-09-PLAN.md — GitHub tools: DB-backed READ tools + APPROVE create_issue with marker adoption
- [x] 03-10-PLAN.md — Settings: Connections + AI and spend, owner actions
- [ ] 03-11-PLAN.md — Resumable agent loop, delegation, limits, retry
- [ ] 03-12-PLAN.md — Approval state machine, actions, resume/expire worker handlers
- [ ] 03-13-PLAN.md — POST /api/chat NDJSON, threads + status routes, useAgentStatus
- [ ] 03-14-PLAN.md — Command Centre read models + agent control actions
- [ ] 03-15-PLAN.md — AI panel: streaming chat, live trace, inline approvals, threads
- [ ] 03-16-PLAN.md — Approval Centre page with edit-before-approve
- [ ] 03-17-PLAN.md — Agent Command Centre, agent detail, run detail pages
- [ ] 03-18-PLAN.md — Worker job registration + shell wiring (badges, AI row, Home, palette)
- [ ] 03-19-PLAN.md — Phase gate: e2e, docs, live owner verification

### Phase 4–11
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
| 3. Agents + GitHub | 9/19 | In Progress|  |
| 4–11 | - | Not started | - |
