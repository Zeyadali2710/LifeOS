# Architecture

LifeOS is a single-user, self-hosted personal operating system. One owner, many integrations, an observable AI agent layer, and a relational database as the source of truth.

## Layers

```
┌────────────────────────────────────────────────────────────────┐
│ PRESENTATION   Next.js App Router (React, Tailwind v4)         │
│                server components + SSE for live updates        │
├────────────────────────────────────────────────────────────────┤
│ APPLICATION    src/server/** — deterministic services          │
│                (projects, calendar, outreach, notifications…)  │
├────────────────────────────────────────────────────────────────┤
│ AGENT ORCH.    orchestrator + tool gateway + approvals         │
│ DOMAIN AGENTS  Home, Career, Social, Outreach, Organization,   │
│                Projects, Knowledge, Goals, Finance, AgentOps   │
├────────────────────────────────────────────────────────────────┤
│ INTEGRATIONS   capability providers (Repo, Calendar, Mail,     │
│                Social, EventSource) → normalized models        │
├────────────────────────────────────────────────────────────────┤
│ EVENTS         activity_events (append-only) + LISTEN/NOTIFY   │
│                + pg-boss subscribers                           │
├────────────────────────────────────────────────────────────────┤
│ DATA           Postgres 17 + pgvector, Drizzle migrations      │
└────────────────────────────────────────────────────────────────┘
```

Rules between layers:
- Agents never touch the database directly. They call **tools**; tools call **application services**; services own persistence. (`agents.md`)
- Application code never calls a vendor API directly. It calls a **provider** through a capability interface. (`integrations.md`)
- Every meaningful state change writes an **activity event**. UI, notifications and agents react to events, not to each other.

## Processes

| Process | Entry | Responsibility |
|---|---|---|
| `web` | Next.js server | UI, API routes, auth, SSE stream, interactive orchestrator chat |
| `worker` | `src/worker/index.ts` | pg-boss jobs: syncs, delegated agent tasks, automations, schedules, heartbeat |
| `db` | Postgres + pgvector | All state, job queue, event bus |

Both `web` and `worker` are the same codebase/image with different commands (ADR-001).

## Event flow example

```
worker: github.sync job
  → RepoProvider.listPullRequests()  (normalized)
  → repositories service upserts PR, inserts activity_event{type:'github.pr.opened'}
  → pg NOTIFY 'activity'
      → web SSE pushes to Home timeline
      → pg-boss subscriber: Career agent evaluates relevance → maybe notification
  → Home agent reads recent events when building the daily briefing
```

## Live events
`emitActivity` writes `activity_events` (and `notifications` when needed), then `pg_notify('lifeos_events', {k, id})` with ids only. A `globalThis` hub in each web process holds one LISTEN connection and fans out to SSE clients (`/api/events`), which the client `LiveProvider` consumes; on reconnect the hub sends `resync`. The health monitor runs from `instrumentation.ts` and uses compare-and-swap on `settings` keys `health.last` and `app.version` so a status change emits exactly once.

## Failure model
- Providers wrap vendor errors into typed errors (`AuthExpired`, `RateLimited`, `Unavailable`, `Invalid`), record `integrations.status/error`, and the UI degrades per integration rather than failing the page.
- Jobs retry with backoff via pg-boss; side-effecting tool calls carry idempotency keys (unique index) so a retry never double-sends.
- AI provider down → deterministic pages keep working; AI panel shows a clear unavailable state.

See also: `database.md`, `agents.md`, `permissions.md`, `security.md`, `deployment.md`, `decisions/`.
