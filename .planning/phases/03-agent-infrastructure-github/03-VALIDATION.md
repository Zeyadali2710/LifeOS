---
phase: 3
slug: agent-infrastructure-github
status: draft
nyquist_compliant: false
wave_0_complete: false
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

Filled by the planner per task. Requirement → test file map (from 03-RESEARCH.md):

| Requirement | Behavior | Test Type | Automated Command | File Exists | Status |
|-------------|----------|-----------|-------------------|-------------|--------|
| AGT-01 | `resolvePolicy`: HIGH_RISK never lowered; allow-list; paused; zod rejection | unit | `npx vitest run tests/unit/policy.test.ts` | ❌ W0 | ⬜ pending |
| AGT-01 | gateway rejects tool not in agent allow-list; ids not in DB | db | `npx vitest run tests/db/gateway.test.ts` | ❌ W0 | ⬜ pending |
| AGT-02 | APPROVE suspends; approve resumes once; reject/expire cancel; concurrent approve executes once | db | `npx vitest run tests/db/approvals.test.ts` | ❌ W0 | ⬜ pending |
| AGT-03 | duplicate idempotency key returns stored result; ambiguous retry adopts issue via marker | db | `npx vitest run tests/db/idempotency.test.ts` | ❌ W0 | ⬜ pending |
| AGT-04 | loop streams deltas, trace steps, delegation, tool_result pairing | db | `npx vitest run tests/db/loop.test.ts` | ❌ W0 | ⬜ pending |
| AGT-04 | NDJSON chat endpoint 401 without session; streams events | e2e | `npm run e2e -- chat.spec.ts` | ❌ W0 | ⬜ pending |
| AGT-05 | cost per model incl. cache; Sydney month bounds; cap blocks new run | unit + db | `npx vitest run tests/unit/pricing.test.ts tests/db/spend.test.ts` | ❌ W0 | ⬜ pending |
| AGT-05 | pause/cancel/retry transitions; orphan sweep | db | `npx vitest run tests/db/runs.test.ts` | ❌ W0 | ⬜ pending |
| AGT-06 | sync upserts from fixtures; 304; diff events once; 401 pauses | db | `npx vitest run tests/db/github-sync.test.ts` | ❌ W0 | ⬜ pending |
| D-09 | token encrypted, only last4 exposed | db | `npx vitest run tests/db/connections.test.ts` | ❌ W0 | ⬜ pending |
| UI | approvals/agents/settings a11y + approve flow | e2e | `npm run e2e -- approvals.spec.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Injectable `LlmClient` (`stream(params)`) + injectable `fetch` for GitHub; scripted-stream helper in `tests/db/helpers.ts`
- [ ] Recorded GitHub JSON fixtures under `tests/fixtures/github/`
- [ ] Test files listed above; `tests/e2e/prepare-db.ts` seeds agents registry
- [ ] Spike: one live Anthropic call with zod-derived tool schema + live `GET /user/repos` with a fine-grained PAT

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| "What's happening in my repos?" streams answer citing real repos/PRs | AGT-04, AGT-06 | Needs real Anthropic key + GitHub PAT | Set keys, connect GitHub, ask question in chat, confirm citations link to real repos |
| Command Centre shows real runs with tokens/cost/latency/tool calls | AGT-05 | Needs live run | After the above, open Agent Command Centre and check the run row |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
