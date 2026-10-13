---
phase: 06-outreach
plan: 11
subsystem: mail-triage
tags: [mail, triage, haiku, worker, spend-cap]
requires: [06-07, 06-08, 06-10]
provides: [runTriage, triageBatch, triageResult, TRIAGE_PAUSED_KEY, addRunUsage, LlmClient toolChoice, mail.sync and mail.triage worker jobs]
key-files:
  created: [src/server/agents/usage.ts, src/server/mail/triage.ts, src/worker/jobs/mail-sync.ts, src/worker/jobs/mail-triage.ts, tests/unit/mail-triage.test.ts, tests/db/mail-triage.test.ts]
  modified: [src/server/agents/loop.ts, src/server/agents/types.ts, src/server/agents/llm.ts, src/worker/index.ts]
decisions:
  - Over-long triage fields are rejected (not cut); a bad batch leaves its rows untriaged and the run failed.
  - Bodies are fetched live per batch (cut to 4000 chars, snippet on fetch failure) and never written.
  - Triage runs without an AI key or Gmail read scope degrade quietly (skip / snippets).
metrics:
  completed: 2026-10-13
---

# Phase 6 Plan 11: Mail triage Summary

Bulk mail is classified OTHER/LOW by rules; everything else goes to Haiku in batches of at most 10 with a forced `record_triage` tool inside an escaped, untrusted `<mail_data>` envelope. Each batch is a recorded outreach agent run (sawPrivate true, run_turns cost) gated by the spend cap, and the worker now runs mail.sync every 5 minutes plus a singleton mail.triage job.

## Commits
- 07c8481 feat(06-11): shared run usage helper, forced toolChoice and triage schema
- 452cecb feat(06-11): cap-aware Haiku mail triage job and mail worker registration

## Tests
- `npx vitest run tests/unit`: 49 files, 440 passed
- `npx vitest run tests/db`: 51 files, 393 passed
- `npx tsc --noEmit` clean; eslint 0 errors on touched dirs.
- tests/db/mail-triage.test.ts (8 tests): rules vs LLM split with 10+2 batches and recorded runs, envelope/forced tool/escaping with the injection fixture, foreign and missing ids, invalid output, cap pause and clear, 7-day and 100 limits, one HIGH notification, id-targeted triage.

## Deviations from Plan
- Removed the now-unused `runTurns` and `costUsd` imports from loop.ts after lifting `addRunUsage` (no behaviour change; loop tests green).
- The ids path (`runTriage({ ids })`) still only selects rows with no `triagedAt`, so a re-triage of an already triaged message is not supported by this plan.

## Owner actions
None. Live triage needs ANTHROPIC_API_KEY and Google consent with gmail.readonly (tracked from 06-05).

No stubs.
