# Requirements: LifeOS

## v1 Requirements

### Foundation
- [ ] **FND-01**: Owner can sign in with email + password; public sign-up is disabled
- [ ] **FND-02**: Unauthenticated requests to any app page redirect to /login
- [ ] **FND-03**: Session cookies are httpOnly, Secure (in prod), SameSite=Lax; login is rate limited
- [ ] **FND-04**: App fails fast at boot with a clear message if required env is missing/invalid
- [ ] **FND-05**: Schema is managed by checked-in migrations that apply cleanly to an empty DB
- [ ] **FND-06**: /api/health reports db and worker heartbeat status without leaking internals
- [ ] **FND-07**: Structured JSON logs with secret redaction from web and worker
- [ ] **FND-08**: Integration secrets can be encrypted/decrypted at rest (AES-256-GCM)
- [ ] **FND-09**: Whole stack runs via Docker Compose with healthchecks, restart policies, resource limits, nightly backups, Tailscale HTTPS
- [ ] **FND-10**: Security headers (CSP, HSTS, frame-ancestors, nosniff, referrer) on all responses
- [ ] **FND-11**: CI runs typecheck, lint, tests, dependency audit and secret scan
- [ ] **FND-12**: Design tokens + base primitives establish the LifeOS visual language (dark-first, light supported)

### Shell
- [x] **SHL-01**: Desktop navigation rail + mobile bottom bar across all domain pages
- [x] **SHL-02**: Command palette (Ctrl/Cmd-K) for navigation and AI prompts
- [x] **SHL-03**: Home shows date/time, greeting, priorities, today, activity, approvals, system status (with honest empty states)
- [x] **SHL-04**: Activity stream updates live (SSE)
- [x] **SHL-05**: Notifications: categories URGENT/IMPORTANT/FYI/AGENT/APPROVAL/REMINDER; read, snooze, dismiss

### Agents
- [x] **AGT-01**: Tool gateway enforces tiers READ/PREPARE/APPROVE/EXECUTE/HIGH_RISK; HIGH_RISK cannot be lowered
- [x] **AGT-02**: APPROVE/HIGH_RISK actions create approvals; run suspends and resumes on decision
- [x] **AGT-03**: Side-effecting calls are idempotent
- [x] **AGT-04**: Orchestrator chat streams responses, shows tool status, delegates to domain agents
- [x] **AGT-05**: Agent Command Centre: status, queue, runs, tool calls, errors, latency, tokens, cost; pause/resume/retry/cancel
- [x] **AGT-06**: GitHub read-only integration feeds Career data and activity
- [x] **AGT-07**: Agent runs are routed per run to the cheapest capable model: simple delegated tasks on a free OpenRouter model at US$0, reasoning tasks and any free-model failure on claude-sonnet-5-5, orchestrator always claude-opus-5-5; routing is visible (trace, Command Centre), overridable per agent, priced per turn, private-repo data gated; with no OpenRouter key behaviour is unchanged.

### Organization
- [ ] **ORG-01**: Google Calendar + iCloud CalDAV via CalendarProvider; day/week/month views
- [ ] **ORG-02**: Create/edit/delete events, recurring events (owner UI writes direct + audit-logged; agent writes to external calendars APPROVE tier, agent deletes HIGH_RISK — Phase 4 D-06/D-07)
- [ ] **ORG-03**: Tasks + reminders; conflict detection; scheduling suggestions

### Career & Projects
- [ ] **CAR-01**: Repository dashboard (status, languages, commits, PRs, issues, activity)
- [ ] **CAR-02**: Cross-domain projects with tasks, milestones, dependencies, blockers, timeline
- [ ] **CAR-03**: Project workspace view incl. Claude Code workspace links

### Outreach
- [ ] **OUT-01**: Sydney event discovery from real sources with relevance scoring
- [ ] **OUT-02**: Pipeline SAVED→INTERESTED→ATTENDING→ATTENDED→FOLLOW_UP
- [ ] **OUT-03**: Email intelligence: classify, summarize, flag, extract actions, draft replies (send = APPROVE)

### Socials
- [ ] **SOC-01**: Providers for LinkedIn, Instagram, TikTok, Portfolio honest about API capabilities
- [ ] **SOC-02**: Drafts, platform variants, content calendar; publish = APPROVE
- [ ] **SOC-03**: Analytics where APIs permit

### Knowledge & Goals
- [ ] **KNW-01**: Notes, documents, bookmarks with keyword + semantic retrieval
- [ ] **GOL-01**: Vision→Goals→Objectives→Projects→Tasks hierarchy with progress and neglect detection

### Automation & Intelligence
- [ ] **AUT-01**: Trigger→conditions→actions automations through the permission gateway
- [ ] **AUT-02**: Morning/midday/evening/weekly briefings

## v2 Requirements
- Finance agent (read/organize/analyze; bank data source TBD)
- Passkeys-only login, PWA install + push notifications
- Outlook mail provider

## Out of Scope
See PROJECT.md.

## Traceability
| Requirement | Phase |
|---|---|
| FND-* | 1 |
| SHL-* | 2 |
| AGT-* | 3 |
| AGT-07 | 3.1 |
| ORG-* | 4 |
| CAR-* | 5 |
| OUT-* | 6 |
| SOC-* | 7 |
| KNW-01, GOL-01 | 8 |
| AUT-* | 9 |
