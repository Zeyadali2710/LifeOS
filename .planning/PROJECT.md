# LifeOS

## What This Is
A self-hosted, single-user personal operating system. It connects career (GitHub, projects, Claude Code workspaces), socials, outreach (Sydney events, email), calendars, projects, knowledge, goals and finance organization behind one premium web UI and a conversational AI orchestrator that delegates to observable, permission-bounded domain agents. Runs on the owner's Proxmox homelab, reachable over Tailscale from desktop, laptop, phone and tablet.

## Core Value
Open LifeOS and immediately know: what is happening, what matters, what needs attention, what's coming, what's being neglected, what opportunities exist, what agents are doing and what they need — and what to do next.

## Requirements
### Validated
- SHL-01..05 — OS shell: navigation across all domains, live activity over SSE, notifications (read/snooze/dismiss), command palette, honest health. Validated in Phase 2: Shell (desktop visual + Windows shortcut UAT pending).
- AGT-01..06 — Agent core: tiered tool gateway, approvals that suspend/resume runs, idempotent side effects, streaming orchestrator chat with delegation, Agent Command Centre, read-only GitHub sync. Validated in Phase 3: Agent infrastructure + GitHub (live on the homelab behind tailscale serve; review follow-ups CR-01/CR-02/WR-02 open).
- ORG-01..03 — Organization: Google Calendar + iCloud CalDAV behind a CalendarProvider seam (day/week/month), owner event writes direct + audit-logged, agent create/edit APPROVE and delete HIGH_RISK, recurring scopes, tasks + reminders, conflicts and Today's plan with free-slot suggestions. Validated in Phase 4: Organization (live on the homelab with real Google + iCloud; code review 53/54 fixed, re-verified by the owner).

### Active
See `REQUIREMENTS.md`.

### Out of Scope
- Multi-user / multi-tenant — single owner by design.
- Public internet exposure — Tailscale only.
- Autonomous financial transactions — Finance agent is read/organize/analyze only.
- Kubernetes or distributed infra.
- Native mobile apps — responsive web (PWA later) covers phone/tablet.

## Context
- Greenfield repo (empty at start, 2026-10-07). See `docs/environment-findings.md`.
- Owner: CS student in Sydney (UNSW), interests: software engineering, cybersecurity, AI, startups, networking.
- Full original brief preserved in spirit across `docs/` and this roadmap.

## Constraints
- TypeScript full-stack: Next.js + Node worker, Postgres 17 + pgvector, Drizzle, pg-boss, Better Auth, Anthropic SDK.
- Deploy: Debian VM on Proxmox, Docker Compose, Tailscale serve.
- Human in control: APPROVE / HIGH_RISK tiers for external, destructive, financial, reputational actions.
- No fake integrations: mocks are labelled.
- Definition of done includes: DB model, backend, frontend, permissions, errors, tests, loading/empty states, mobile, a11y, observability, docs, deploy.

## Key Decisions
| Decision | Rationale | Outcome |
|---|---|---|
| ADR-001 single package, web + worker | one image, less ceremony | Accepted |
| ADR-002 Next.js App Router + Tailwind v4 | UI+API one unit, server-only secrets | Accepted |
| ADR-003 Postgres + pgvector + Drizzle migrations | relational truth, vectors beside data | Accepted |
| ADR-004 pg-boss | no Redis | Accepted |
| ADR-005 activity_events + LISTEN/NOTIFY | durable event bus, zero infra | Accepted |
| ADR-006 Better Auth single owner | self-hosted auth, secure sessions | Accepted |
| ADR-007 env secrets + AES-GCM token encryption | no Vault needed | Accepted |
| ADR-008 Anthropic SDK + own tool gateway | control permissions/observability | Accepted; shipped in Phase 3 |
| ADR-009 Debian VM + Compose + Tailscale | simple, isolated, private | Accepted |
| ADR-010 capability providers + labelled mocks | honest UI over uneven APIs | Accepted |

## Project Reference
Docs: `docs/` · ADRs: `docs/decisions/` · Roadmap: `.planning/ROADMAP.md`

_Last updated: 2026-10-12 — Phase 4 (Organization) complete._
