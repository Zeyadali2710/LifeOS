# Phase 4: Organization - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-09
**Phase:** 04-organization
**Areas discussed:** Calendar sources & sync, Event writes & approvals, Tasks & reminders, Conflicts & Today's plan

---

## Calendar sources & sync

| Question | Options | Selected |
|---|---|---|
| Which calendars | Pick per calendar / All / Primary only | Pick per calendar |
| Category colours | Map per calendar / Calendar + per-event override / Agent classifies | Map per calendar |
| Freshness | Poll 5 min + Sync now / Poll 15 min / Google push webhooks | Poll 5 min + Sync now |
| Window | 30d back, 12mo ahead / 7d, 3mo / You decide | 30d back, 12mo ahead |

## Event writes & approvals

| Question | Options | Selected |
|---|---|---|
| Who approves | Agent writes approve, owner clicks don't / Everything approves / Local-only | Agent writes approve, owner clicks don't |
| Recurring scopes | This/following/all / This/all / Create only | This/following/all |
| Target calendar | Chooser remembers last / Fixed default / Inferred from category | Chooser remembers last |
| Agent deletes | HIGH_RISK / APPROVE / No agent deletes | HIGH_RISK |

## Tasks & reminders

| Question | Options | Selected |
|---|---|---|
| Task store | LifeOS only / Google Tasks / Apple Reminders | LifeOS only |
| Delivery | In-app REMINDER / + Web Push / + email | In-app REMINDER |
| Task shape | Title, due, priority, notes, done / + recurring / Minimal | Title, due, priority, notes, done |
| Event reminders | Tasks only / Events too | Tasks only |

## Conflicts & Today's plan

| Question | Options | Selected |
|---|---|---|
| Conflict definition | Overlaps + due tasks with no slot / Overlaps only / + travel buffer | Overlaps + due tasks with no slot |
| Plan engine | Rules + agent narrative / Pure rules / Agent does everything | **Pure rules, no LLM** (deviated from recommendation) |
| Plan timing | Morning + on demand / Every change / On demand | Morning + on demand, then revised → compute live on load |
| Add to calendar | Real event, no approval / Tentative local / To approvals | Real event, no approval |
| Organization agent live? | Live for chat, plan stays rules / Live + keep agent label / Not live | Live for chat, plan stays rules |

**Notes:** Because the plan is rules-only, timing changed to live compute (no job) and the "ORGANIZATION AGENT" label on the plan card is dropped for honesty.

## Claude's Discretion

OAuth flow details, CalDAV/RRULE libraries, schema shape, waking-hours bounds, timezone handling, Home wiring, palette scopes.

## Deferred Ideas

Google Tasks / Apple Reminders sync, Web Push, recurring tasks/subtasks, LLM plan narrative, travel buffers, per-event category override.
