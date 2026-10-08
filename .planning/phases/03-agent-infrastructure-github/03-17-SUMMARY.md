---
phase: 03-agent-infrastructure-github
plan: 17
subsystem: ui
tags: [agents, command-centre, run-detail]
requires: [03-03, 03-07, 03-14]
key-files:
  created: [src/agents/command-centre.tsx, src/agents/agent-card.tsx, src/agents/runs-table.tsx, src/agents/agent-detail.tsx, src/agents/run-detail.tsx, "src/app/(os)/agents/[agentId]/page.tsx", "src/app/(os)/agents/runs/[runId]/page.tsx"]
  modified: ["src/app/(os)/agents/page.tsx"]
requirements-completed: [AGT-05]
completed: 2026-10-08
---

# Phase 3 Plan 17: Agent Command Centre pages Summary

`/agents`, `/agents/[agentId]` and `/agents/runs/[runId]` now render real read-model data with pause/resume, cancel/retry and per-agent model control, all refreshing from run events.

## What was built
- Command Centre: header with live counts and approvals link, orchestrator hero, spend strip (cap-reached text, aria-live), 10 agent cards (disabled ones show only NOT CONNECTED and the arrival phase, no stats), recent runs table (real `<table>`, mobile card list, empty state).
- Agent detail: current/last run with timeline, queue, recent runs, health, capabilities, permissions, tools, configuration (model Select via `setAgentModelAction`, read-only limits). Disabled agents get the EmptyState plus permissions and capabilities. No Run now, no Autonomy.
- Run detail: facts grid, Cancel/Retry, timeline, tool calls table with Disclosure and redacted INPUT/OUTPUT blocks with copy.
- Pages `await params`, `notFound()` on unknown agent or non-uuid or missing run, `requireOwner` on each.

## Deviations
- Show more uses `?limit=N` (20 to 100, server re-render) instead of cursor pagination; no list action exists in plan 14.
- Agent `tools` and `systemPrompt` are stripped (agent detail) or blanked (run detail) in the server page so the system prompt never reaches the browser.
- Child-run links on run detail are not shown (runDetail returns no children); parent and "Retry of" links are.
- Agent detail health/status is derived client-side from the latest run and config.paused (global pause not reflected there).
- Not browser-tested; e2e is plan 19.

## Verification
`npm run typecheck` clean, eslint clean on touched files, `npx next build` succeeded and lists `/agents`, `/agents/[agentId]` and `/agents/runs/[runId]`. The build was run with no other executor active.

## Known Stubs
None.

## Self-Check: PASSED
