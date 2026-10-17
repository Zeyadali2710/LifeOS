---
milestone: v1.0
status: phase_8_in_progress
last_updated: 2026-10-17
workflow: orchestrated phase loop (see AGENT_HANDOFF.md); GSD retired 2026-10-16
---

# Project State

Short current state only. History is in Git and the phase folders under `.planning/phases/`.

**Core value:** Know what matters, what needs attention, and what to do next — in one place.

## Deployed

- Homelab runs `main` as of d08ce89 (deployed 2026-10-17 morning), migrations through `0015_activity_type_time`.
- Owner-confirmed live: Phases 1–7 incl. 5.1/6 VM UAT, Socials page + connections, multiple Gmail accounts, Finances with first real CSV import and an agent reorganisation.

## Phases

- 1–7.1 complete. 7.1 Finances accepted after real import/reorganisation.
- 8 Knowledge + Goals: accepted 2026-10-17 after owner VM checks. Review: Codex plan critique + Codex/Claude phase review, all findings fixed.
- 9 Automation + Daily intelligence: built and pushed 2026-10-17 (autonomous run). Accepted 2026-10-17 after owner VM checks. Codex plan critique + Codex/Claude phase review, findings fixed (one info item declined: the Home lead counts priorities as "items").
- 10 Hardening: accepted 2026-10-17 (restore drill OK after the drill/backup-ordering fix d08ce89).
- 11 Polish: built and pushed 2026-10-17 (axe audit on every page, a11y + mobile fixes). Milestone v1.0 roadmap complete pending owner VM acceptance of Phases 8–11.

## Open owner items

See `.planning/OWNER-ACTIONS.md`. Main deferred live check: Socials real posting and scheduling.

## Verification checkpoints

- 2026-10-17 morning gate (after Phases 8–11): typecheck, lint (0 errors / 19 existing warnings), worker bundle; Vitest 1,116 (unit + DB); Playwright 149 passed / 17 intentionally skipped (desktop + mobile), plus the new axe audit.
- Earlier "unit only" checkpoints (563 tests) did not include the DB suite; always run the full suite now.

## Decisions

- Phase 8 auto-decisions (owner to review): semantic search off by default, OpenRouter `openai/text-embedding-3-small` via the existing key; Knowledge agent paid-only + hard-private; agents read-only (writes deferred); one objective per project; neglect = 21 days, momentum = 14-day windows; PDFs not supported; bookmarks are never fetched server-side.

- Phase 9 auto-decisions (owner to review): digest and briefings are deterministic (no LLM); briefing defaults morning 07:00 / evening 18:00 / weekly Sun 18:00 on, midday off; priority weights in docs/automations-briefings.md; automations max 20 runs/rule/day, schedules fire up to 30 min late; unattended ask-LifeOS runs are approval-floored and never use free models; Automations is a system agent (pause it to stop all rules).
- Finance: transfers count as income/spending; budgets carry forward until changed and cover all accounts; savings are net Savings-category contributions; integer AUD cents.
- Finance agent uses paid models only; finance data taints the run against free models.
- A category with budgets cannot leave the expense treatment until its budgets are cleared (2026-10-17 fix); agent proposals may clear budgets on any category.
