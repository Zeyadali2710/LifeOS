---
phase: 03-agent-infrastructure-github
plan: 02
subsystem: agents
tags: [anthropic, pg-boss, pricing, policy, contracts]
requires: []
provides:
  - Agent DTO/type contracts (src/lib/agent-types.ts, issue-payload.ts)
  - Agent registry, policy, pricing, redaction, Anthropic client wrapper
  - Send-only enqueue helper, notifyLive, isSafeGithubUrl, scriptedLlm test seam
affects: [03-03, 03-04, 03-05, 03-06, 03-07]
tech-stack:
  added: ["@anthropic-ai/sdk ^0.132.1"]
key-files:
  created:
    - src/lib/agent-types.ts
    - src/lib/issue-payload.ts
    - src/lib/format.ts
    - src/server/agents/types.ts
    - src/server/agents/llm.ts
    - src/server/agents/registry.ts
    - src/server/agents/policy.ts
    - src/server/agents/pricing.ts
    - src/server/agents/redact.ts
    - src/server/queue.ts
    - tests/helpers/fake-llm.ts
    - tests/unit/policy.test.ts
    - tests/unit/pricing.test.ts
    - tests/unit/agent-contracts.test.ts
  modified:
    - package.json
    - package-lock.json
    - src/server/env.ts
    - src/server/events.ts
    - src/lib/safe-url.ts
    - .env.example
    - tests/unit/env.test.ts
    - tests/unit/safe-url.test.ts
requirements-completed: [AGT-01, AGT-04, AGT-05]
duration: 10min
completed: 2026-10-08
---

# Phase 3 Plan 02: Agent contracts and pure logic Summary

Wave 0 contracts: Anthropic SDK, optional API key, DTOs, 11-agent registry, HIGH_RISK-floor policy, per-model cost with DST-correct Sydney month bounds, redaction, send-only pg-boss enqueue, notifyLive, and a scripted fake LLM.

## Package gate (T-03-SC)
- `npm view @anthropic-ai/sdk scripts.postinstall` -> empty output
- `npm view @anthropic-ai/sdk repository.url` -> `git+https://github.com/anthropics/anthropic-sdk-typescript.git`
- Installed `@anthropic-ai/sdk@^0.132.1`.

## Commits
- a938bf1: SDK, optional env key, DTO contracts
- b222e61: types, registry, policy, pricing, redact, format
- (task 3 commit): queue, notifyLive, isSafeGithubUrl, fake LLM

## Deviations from Plan
- Worktree base was reset to 62a8471 per the startup check (merge-base differed).
- queue.ts uses `new PgBoss({ connectionString, supervise:false, schedule:false, migrate:false })`; flags confirmed in pg-boss types.
- `toAnthropicTool` deletes `$schema` from a copied object rather than destructuring (lint-clean).
- Otherwise none.

## Verification
vitest (env, policy, pricing, agent-contracts, safe-url) pass; `npm run typecheck` clean; lint: 0 errors (2 pre-existing warnings in live-provider.tsx).

## Known Stubs
Disabled agents have empty systemPrompt/tools by design (arrival labels carry the phase).

## Self-Check: PASSED
