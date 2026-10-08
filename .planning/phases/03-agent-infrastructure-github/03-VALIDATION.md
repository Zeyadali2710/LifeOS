---
phase: 3
slug: agent-infrastructure-github
status: validated
nyquist_compliant: true
wave_0_complete: true
validated: 2026-10-09
created: 2026-10-08
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^5 (+ `setupTestDb()` throwaway Postgres), Playwright ^1.63 e2e (prod build, port 3100, `lifeos_e2e` DB) |
| **Config file** | `vitest.config.ts`, `playwright.config.ts` |
| **Quick run command** | `npx vitest run <test file>` |
| **Full suite command** | `npm run typecheck && npm run lint && npm test && npm run e2e` |
| **Estimated runtime** | ~30 seconds (quick), several minutes (full incl. e2e) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run <relevant test file>`
- **After every plan wave:** Run `npm run typecheck && npm test`
- **Before `/gsd:verify-work`:** Full suite must be green + live manual check
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

Filled by the planner (plan-task -> automated command):

| Plan-Task | Requirement | Behavior | Test Type | Automated Command | Status |
|-----------|-------------|----------|-----------|-------------------|--------|
| 03-01-T2 | AGT-03 | migration 0001; unique idempotency key; cascades | db | `npx vitest run tests/db/migrations.test.ts tests/db/schema-agents.test.ts` | ✅ green |
| 03-02-T2 | AGT-01, AGT-05 | resolvePolicy HIGH_RISK floor; prices/cost/Sydney month; apiName; registry | unit | `npx vitest run tests/unit/policy.test.ts tests/unit/pricing.test.ts tests/unit/agent-contracts.test.ts` | ✅ green |
| 03-02-T3 | — | isSafeGithubUrl; fake LLM seam | unit | `npx vitest run tests/unit/safe-url.test.ts` | ✅ green |
| 03-03-T3 | AGT-04 | ExecutionTrace step states | unit | `npx vitest run tests/unit/execution-trace.test.ts` | ✅ green |
| 03-04-T1/T2 | AGT-06, D-09 | GitHub client errors/ETag/SSRF; token encrypted, last4 only, read/write split | unit + db | `npx vitest run tests/unit/github-client.test.ts tests/db/connections.test.ts` | ✅ green |
| 03-05-T1 | AGT-01, AGT-02 | allow-list, zod, resolve, tiers, approval creation | db | `npx vitest run tests/db/gateway.test.ts` | ✅ green |
| 03-05-T2 | AGT-03 | duplicate/concurrent idempotency key | db | `npx vitest run tests/db/idempotency.test.ts` | ✅ green |
| 03-06-T1 | AGT-05 | MTD spend, cap blocks, URGENT once/month | db | `npx vitest run tests/db/spend.test.ts` | ✅ green |
| 03-06-T2 | AGT-05 | pause/cancel/model/sweep/counts/threads | db | `npx vitest run tests/db/runs.test.ts` | ✅ green |
| 03-07-T1/T2 | AGT-04, AGT-05 | DTOs; run/approval SSE kinds | unit + db | `npx vitest run tests/unit/agent-dto.test.ts tests/db/hub.test.ts tests/unit/live.test.ts` | ✅ green |
| 03-08-T1 | AGT-06 | sync upserts, 304, diff events once, 401 pause, rate limit | db | `npx vitest run tests/db/github-sync.test.ts` | ✅ green |
| 03-09-T1/T2 | AGT-06, AGT-03 | READ tools; create_issue APPROVE, write token, marker adoption | db | `npx vitest run tests/db/github-tools.test.ts` | ✅ green |
| 03-10-T1 | AGT-05, D-09 | settings actions owner/zod | db | `npx vitest run tests/db/settings-actions.test.ts` | ✅ green |
| 03-11-T1..T3 | AGT-02, AGT-04 | loop streaming, pairing, limits, cancel, suspend, delegation, retry | db | `npx vitest run tests/db/loop.test.ts` | ✅ green |
| 03-12-T1/T2 | AGT-02, AGT-03 | approve once, edit re-validate, reject/expire, resume, actions | db | `npx vitest run tests/db/approvals.test.ts tests/db/approval-actions.test.ts` | ✅ green |
| 03-13-T1 | AGT-04 | NDJSON chat route 401/409/429/stream, threads | db | `npx vitest run tests/db/chat-route.test.ts` | ✅ green |
| 03-14-T1/T2 | AGT-05 | Command Centre read models; control actions | db | `npx vitest run tests/db/agent-queries.test.ts tests/db/agent-actions.test.ts` | ✅ green |
| 03-15-T1 | AGT-04 | chat reducer, NDJSON reader, safe answer parser | unit | `npx vitest run tests/unit/chat-state.test.ts tests/unit/answer-text.test.ts` | ✅ green |
| 03-10/16/17/18 UI tasks | AGT-02, AGT-05 | typecheck + lint (+ next build in 03-17) | static | `npm run typecheck && npm run lint` | ✅ green |
| 03-19-T1 | AGT-02, AGT-04, AGT-05 | approvals, agents, chat, settings e2e | e2e | `npm run e2e -- approvals.spec.ts agents.spec.ts chat.spec.ts settings.spec.ts` | ✅ green |
| 03-19-T3 | all | live success criteria 1-3 + assumptions A1-A7 | manual | human-verify checkpoint | ✅ green (owner, homelab) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] Injectable `LlmClient` (`stream(params)`) + injectable `fetch` for GitHub; scripted-stream helper in `tests/db/helpers.ts`
- [x] Recorded GitHub JSON fixtures under `tests/fixtures/github/`
- [x] Test files listed above; `tests/e2e/prepare-db.ts` seeds agents registry
- [x] Spike: one live Anthropic call with zod-derived tool schema + live `GET /user/repos` with a fine-grained PAT (planned as part of the 03-19 live checkpoint; offline guard: 03-02 toAnthropicTool shape test)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| "What's happening in my repos?" streams answer citing real repos/PRs | AGT-04, AGT-06 | Needs real Anthropic key + GitHub PAT | Set keys, connect GitHub, ask question in chat, confirm citations link to real repos |
| Command Centre shows real runs with tokens/cost/latency/tool calls | AGT-05 | Needs live run | After the above, open Agent Command Centre and check the run row |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-10-09

---

## Validation Audit 2026-10-09
| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

All 31 mapped test files exist and pass at HEAD ebee8b1: vitest 42 files / 192 tests, e2e (production build, desktop + mobile) 62 passed / 14 skipped by design / 0 failed, typecheck clean, lint 0 errors.
Added after planning: `tests/unit/proxy.test.ts` (login redirect uses the public BETTER_AUTH_URL), chat-route proxy-origin regression, review-fix regressions (03-REVIEW-FIX.md).
The e2e re-run caught a regression from review fix 2b00cb0 (relative Location rejected by Next's proxy); fixed in 3473af6.
Manual-only rows were verified live by the owner on the homelab deployment (03-19-SUMMARY.md).
