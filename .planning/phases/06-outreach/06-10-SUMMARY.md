---
phase: 06-outreach
plan: 10
subsystem: agents-outreach
tags: [agents, mail, privacy, content-floor, routing]
requires: [06-02, 06-05, 06-07, 06-08]
provides: [outreachTools, mailTools, MAIL_TOOLS, mailInScope, live outreach agent]
key-files:
  created: [src/server/agents/tools/outreach.ts, src/server/agents/tools/mail.ts, tests/db/outreach-tools.test.ts]
  modified: [src/server/agents/tools/index.ts, src/server/agents/policy.ts, src/server/agents/loop.ts, src/server/agents/registry.ts, tests/db/routing-loop.test.ts, tests/unit/policy.test.ts, tests/unit/agent-contracts.test.ts]
decisions:
  - Mail taint is hard: createRun marks the scope tainted AND forces privateOk=false when mailInScope is true, and the per-turn check switches a free model to Sonnet on mailInScope alone, regardless of ai.free_private_ok.
  - mail.get_message bodies are fetched live and returned only as the capped tool output; mail_messages is never written by the tool.
  - Outreach agent has no `routable` flag, so it always runs on its Sonnet default (D-29).
metrics:
  completed: 2026-10-13
---

# Phase 6 Plan 10: Outreach agent and mail privacy Summary

Four READ tools (outreach.list_events, outreach.get_event, mail.list, mail.get_message) are live on the Outreach agent. All four sit in CONTENT_TOOLS so later side effects are floored to APPROVE, and any mail tool in a run's content scope permanently keeps that scope off free models, even with ai.free_private_ok on.

## Commits
- b8c3690 feat(06-10): outreach and mail READ tools
- 7cf9582 feat(06-10): hard mail taint, content floor and live Outreach agent

## Tests
- `npx vitest run tests/unit`: 48 files, 437 passed
- `npx vitest run tests/db`: 50 files, 385 passed
- `npx tsc --noEmit` clean; eslint 0 errors (pre-existing unused-var warnings only).
- Privacy proof (routing-loop.test.ts, toggle `ai.free_private_ok` = true, free key present): control without mail stays on the free model; mail call in parent tree, or in a sibling run, makes createRun choose Sonnet; mail appearing after createRun switches the next turn to Sonnet before any free request (llm models = [Sonnet] only); a Free-only pin returns private_blocked. Mutation check: forcing mailInScope to false fails 4 of these tests.
- Floor proof (outreach-tools.test.ts): after each of the four tools, a fake EXECUTE side-effect tool returns waiting_approval; before, it executes.

## Deviations from Plan
- **[Rule 2 - hardening]** createRun also sets `privateTainted` when mailInScope is true (not only `privateOk=false`). With the plan's wording alone, a mail call visible to contentScope but not to privateInTree would not block free routing.
- **Test relocation:** the content-floor case lives in tests/db/outreach-tools.test.ts (fake EXECUTE tool, registry mock) instead of routing-loop.test.ts, because routing-loop uses the real registry. Routing and toggle cases are in routing-loop.test.ts as planned.
- **Updated tests/unit/agent-contracts.test.ts:** the live-agent list now includes outreach and its arrival is null; required because the registry changed.
- outreach tools set `private: false` explicitly.

## Owner actions
None for this plan. (Live mail reading needs Google re-consent with gmail.readonly, already tracked from 06-05; verify in phase UAT.)

No stubs.
