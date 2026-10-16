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

- Homelab runs `main` as of 96fcc02 (owner confirmed 2026-10-17), migrations through `0012_finances`.
- Owner-confirmed live: Phases 1–7 incl. 5.1/6 VM UAT, Socials page + connections, multiple Gmail accounts, Finances with first real CSV import and an agent reorganisation.

## Phases

- 1–7.1 complete. 7.1 Finances accepted after real import/reorganisation.
- 8 Knowledge + Goals: in progress (see ROADMAP Phase 8 details).
- 9 Automation + Daily intelligence, 10 Hardening, 11 Polish: not started.

## Open owner items

See `.planning/OWNER-ACTIONS.md`. Main deferred live check: Socials real posting and scheduling.

## Verification checkpoints

- 2026-10-17 full gate: typecheck, lint, build, worker bundle; Vitest 1,065 (unit + DB) after fixing 3 stale/date-dependent tests; Playwright full desktop + mobile after fixing 2 stale specs.
- Earlier "unit only" checkpoints (563 tests) did not include the DB suite; always run the full suite now.

## Decisions

- Finance: transfers count as income/spending; budgets carry forward until changed and cover all accounts; savings are net Savings-category contributions; integer AUD cents.
- Finance agent uses paid models only; finance data taints the run against free models.
- A category with budgets cannot leave the expense treatment until its budgets are cleared (2026-10-17 fix); agent proposals may clear budgets on any category.
