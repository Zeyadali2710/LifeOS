---
phase: 02-shell
verified: 2026-10-08T00:00:00Z
status: human_needed
score: 3/3 roadmap success criteria verified (automated); 2 deferred human checks
overrides_applied: 0
gaps: []
human_verification:
  - test: "Desktop visual match at ~1400px and ~900px widths against the design shots"
    expected: "Sidebar (232px) / forced 68px rail, top bar, Home layout match the hi-fi design"
    why_human: "Visual fidelity cannot be checked by grep or e2e; owner deferred it at the 02-13 checkpoint"
  - test: "Windows shortcuts in Chrome and Edge: Ctrl+K, Ctrl+J, Alt+2, Ctrl+\\, Ctrl+,"
    expected: "Palette opens, AI panel toggles, navigates to Career, sidebar compacts, Settings opens, with no browser-default hijack"
    why_human: "Browser-reserved key handling differs per browser and OS; owner deferred it"
---

# Phase 2: Shell Verification Report

**Goal:** LifeOS feels like an OS: navigable, live, honest about what's connected.
**Status:** human_needed (no blocking gaps)

## Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Owner can navigate all domain pages on desktop and phone | VERIFIED | `src/shell/nav.ts` lists 9 domains plus Approvals and Settings. Pages exist under `src/app/(os)/*`. Sidebar, rail, bottom bar and More sheet exist in `src/shell`. `shell-nav.spec.ts` and `a11y-shell.spec.ts` cover them. Owner approved mobile on an iPhone. |
| 2 | A new activity event appears on Home without a refresh | VERIFIED | `emitActivity` in `src/server/events.ts` inserts a row and calls `pg_notify`. `/api/events` is the SSE route. `live-provider.tsx` opens an `EventSource`. Home renders `ActivityList` and `SystemTile`. `live-activity.spec.ts` exists and passes per the last run. |
| 3 | Notifications can be read, snoozed, dismissed | VERIFIED | `src/server/notifications.ts` has `snoozeUntil` and `dismissOne`. `notification-row.tsx` calls the `markRead`, `dismiss` and `snooze` server actions. The inbox excludes dismissed and snoozed rows. `notifications.spec.ts` exists. |

Supporting behaviour: the command palette, AI panel and command bar exist (the command bar shows a not-connected error, which is honest). The degraded/restored health check was passed live by the owner.

## Behavioral Checks

| Check | Result |
|-------|--------|
| `npx vitest run` (re-run by me) | 18 files, 71/71 passed |
| Typecheck, lint, Playwright | Not re-run. Reported by the orchestrator: typecheck clean, lint 0 errors, Playwright 40 passed / 12 skipped. |
| TBD/FIXME/XXX markers in `src` | None found |

## Requirements Coverage

Every ID in the PLAN frontmatter is accounted for in REQUIREMENTS.md, which maps SHL-* to Phase 2. There are no orphans.

| Req | Plans | Status |
|-----|-------|--------|
| SHL-01 navigation rail and bottom bar | 03, 06, 08, 09, 13 | SATISFIED. Desktop-visual part is human-pending. |
| SHL-02 command palette | 08, 10, 13 | SATISFIED. Chrome/Edge shortcuts are human-pending. |
| SHL-03 Home | 02, 06, 11, 13 | SATISFIED |
| SHL-04 live SSE activity | 01, 04, 05, 07, 11, 13 | SATISFIED |
| SHL-05 notifications | 02, 04, 05, 07, 12, 13 | SATISFIED |

## Code Review Warnings (advisory, none block a success criterion)

CR-01 (open redirect) is fixed in cb7e6df. Eight warnings and six info items remain open.

- **WR-06 (DB outage crashes the shell with no styled error page): the most significant.** It weakens the "honest about what's connected" goal. The degraded states do work when the worker or version is unhealthy, which the owner verified live. A full Postgres outage still shows the bare Next error screen. This does not fail the three success criteria, but I recommend fixing it early in Phase 3 or 10: a try/catch in `checkHealth` plus `global-error.tsx`.
- **WR-03 (SSE retries forever on a 401 after the session expires):** a UX flaw. Security is unaffected because the route checks the session on connect. It should be fixed.
- **WR-01 (forged sign-out audit rows from unauthenticated POSTs):** an audit-integrity weakness for Phase 10 hardening.
- **WR-02, WR-04, WR-05, WR-07, WR-08:** robustness and UX items. WR-05 (Alt+digit while typing) overlaps the deferred shortcut human check.
- **IN-02:** the sidebar shows "ONLINE" while the system tile shows "Unknown" when health is null. This is a minor honesty inconsistency.

## Gaps Summary

There are no blocking gaps. The status is human_needed only because of the two deferred owner checks above. The open review warnings should be carried into a follow-up or the Phase 10 hardening backlog.

_Verifier: Claude (gsd-verifier)_
