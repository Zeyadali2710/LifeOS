---
phase: 07-socials
reviewed: 2026-10-15T23:59:59Z
depth: targeted
iteration: 1
original_review: .planning/phases/07-socials/07-REVIEW.md
fix_report: .planning/phases/07-socials/07-REVIEW-FIX.md
diff_base: 147638e
reviewed_source_head: 074746c
checkout_head: 3beca87
files_reviewed: 26
files_reviewed_list:
  - src/app/(os)/socials/page.tsx
  - src/lib/social-types.ts
  - src/server/agents/gateway.ts
  - src/server/agents/runs.ts
  - src/server/agents/tools/socials.ts
  - src/server/socials-actions.ts
  - src/server/socials/connections.ts
  - src/server/socials/drafts.ts
  - src/server/socials/providers.ts
  - src/server/socials/publish.ts
  - src/server/socials/sync.ts
  - src/settings/social-connections.tsx
  - src/socials/model.ts
  - src/socials/variant-panel.tsx
  - src/worker/jobs/agents.ts
  - tests/db/socials.test.ts
  - tests/unit/social-account-identity.test.ts
  - tests/unit/social-actions.test.ts
  - tests/unit/social-draft.test.ts
  - tests/unit/social-enqueue.test.ts
  - tests/unit/social-owner-resume.test.ts
  - tests/unit/social-publish-executor.test.ts
  - tests/unit/social-refresh.test.ts
  - tests/unit/social-types.test.ts
  - tests/unit/socials-providers.test.ts
  - tests/unit/socials-ui.test.ts
original_findings:
  total: 14
  closed: 13
  partially_closed: 1
  open: 0
findings:
  critical: 0
  warning: 1
  info: 0
  total: 1
status: issues_found
---

# Phase 7: Targeted Review Recheck — Iteration 1

The original blocker behavior is addressed in the inspected changes. **One warning remains in CR-02's delayed publish-auth failure path.** Thirteen original findings are closed at code-review level; CR-02 is partially closed because reconnect/refresh response writes are guarded correctly but the publish error branch omits ciphertext. These dispositions are not VM acceptance or transactional execution results.

Scope was the 26-file fix diff `147638e..074746c`, the preserved original findings and directly connected approval/run/queue/provider callers. This was a targeted recheck, not a new audit of the original 79 files. The checkout was clean at `3beca87` before this artifact was written. Only this artifact is owned by this review.

## Original finding dispositions

| Original | Disposition | Evidence and remaining acceptance boundary |
|---|---|---|
| CR-01 — inherited publication attempts | Closed | Both owner and agent redrafts use clearedPublication and refuse unresolved evidence; fresh preparation rejects remote/container IDs. retryVariant binds the displayed attempt timestamp, reconciles stored IDs/results and requires explicit acknowledgement before abandoning unresolved evidence, auditing the transition transactionally. ERROR/EXPIRED containers are classified separately. New approval content therefore cannot inherit the prior container. Focused local owner/agent/provider tests pass; the full terminal-container -> edited fresh approval DB regression remains owner-run. |
| CR-02 — stale refresh overwrite/error | **Partially closed** | refreshSocialToken receives the original pre-network ciphertext/generation and uses both in its CAS. Sync persistence and delayed sync errors use that same snapshot; concurrent replacement cannot append old history. Deferred refresh/reconnect tests pass locally. Publish's delayed auth error still supplies generation only; see WR-08 below. |
| CR-03 — cancelled run leaves Review locked | Closed | cancelRun locks eligible approvals before associated variants, resets only matching pending/unclaimed scheduled variants, and emits Social signals. A publishing variant keeps its approval evidence. Publish claiming uses approval-before-variant order. The actual cancelRun -> fresh request DB regression is present but unrun. |
| CR-04 — enqueue failure cannot recover | Closed | Once the approved snapshot is durable, publish enqueue rejection/timeout is absorbed and preparation returns scheduled, allowing executeApproved to finish and the sweep to deliver. inspectPublish still refuses failed/rejected/cancelled/expired approvals. Focused rejection/timeout and guard tests pass; full DB lifecycle/queue delivery remains pending. |
| CR-05 — agent save overwrites active state | Closed | Existing-post agent saves lock the parent before reading variants. The variant UPDATE compares status, millisecond-normalized updatedAt and nullable approval ID, requires a returned row and throws inside the transaction on loss. Local predicate/lost-update cases pass; the interleaved parent-lock DB regression is present and unrun. |
| CR-06 — delete races publication | Closed | Delete locks the parent then its variants and rechecks blocked states. Gateway review transition, agent saves and owner platform mutations lock the same parent. Approval/publish/cancel operations lock approval before variant and do not acquire the parent afterward, so the inspected paths introduce no opposing parent/variant lock order. Two-order DB concurrency regressions are present but unrun. |
| CR-07 — stale Instagram attestation | Closed | Settings sends its displayed generation. The owner action validates it; the connection UPDATE compares generation plus verification_pending. Its successful generation-specific audit and Social signal occur in the same transaction. A lost comparison inserts no success audit. Focused action tests pass; live smoke remains owner evidence. |
| WR-01 — synthetic action invokes LLM | Closed | Synthetic Social runs have explicit owner-action model metadata. handleResume completes successful execution and returns before LLM lookup, including no-key operation; skipped execution does not finish a run. Ordinary chat continuation remains intact. Four focused worker cases pass. |
| WR-02 — account identity history | Closed | Credential saves lock the old connection and clear account snapshots on missing/different login, preserving same-login replacement. Removal clears dependent history. Sync's snapshot-bound locked persistence cannot append the old account's delayed result after replacement. Focused identity tests pass; A/B transactional history coverage remains owner-run. |
| WR-03 — adjacent calendar dates omitted | Closed | Page query bounds now derive from calendarDays through calendarRange, matching the rendered grid and using exclusive Sydney midnight after its last date. Local October 2026 spillover/DST assertions pass. Browser rendering remains pending. |
| WR-04 — agent source provenance absent | Closed | Optional validated source metadata is retained, taint derives conservatively from completed content reads in the existing run scope, and an existing marker is OR-preserved. New/existing draft and monotonic-taint tests pass; tool -> draft -> approval facts DB coverage is present and unrun. |
| WR-05 — publish/export URL checks disagree | Closed | Shared checks now enforce credential-free HTTPS LinkedIn links and valid optional Portfolio public image URLs. The real provider keeps shared HTTPS validation. Invalid protocol/credentials and rendered Portfolio error cases pass locally. |
| WR-06 — wall-clock-dependent rotation fixture | Closed | The DB rotation case freezes Date to the injected sync instant and restores real timers in afterEach, without faking DB/network timers. Deferred refresh unit tests use the same discipline. DB execution itself remains pending. |
| WR-07 — app removal leaves TikTok account connected | Closed | App removal deletes the app/account rows and TikTok snapshots transactionally; subsequent provider selection becomes mock. Focused disconnect/history checks pass. The DB case checking both rows, mock selection and no subsequent sync request is present and unrun. |

## Remaining findings

### WR-08: Delayed publish authentication failure can disable a freshly refreshed token

**Classification:** WARNING
**Original finding:** CR-02 residual
**File:** `C:/Users/footb/Desktop/LifeOS/src/server/socials/publish.ts:52`
**Related:** `src/server/socials/connections.ts:20-23,107-116,203-205`

**Issue:** The publish path constructs its provider from the current token, but on a later 401/403, fail() calls markSocialAuthError with only approvedConnectionGeneration. Refresh intentionally preserves that generation while replacing ciphertext. Consequently:

1. A publish starts using token A, generation G.
2. Refresh successfully stores token B under generation G.
3. The delayed authentication failure from the A request arrives.
4. The error UPDATE matches G and sets the B connection to error/RECONNECT.

That disables subsequent publishing/analytics despite a successful refresh and requires owner reconnect. The new sync path avoids this through its original ciphertext predicate; the publish path does not. This does not reintroduce the original cross-account overwrite because owner replacement changes generation.

**Evidence:** Traced currentBinding -> provider request -> ProviderAuthError -> fail -> markSocialAuthError. An isolated network-free production-helper probe confirmed the generated predicate contains platform and generation only, omits ciphertext, and permits the fresh-token row to be marked error. Existing deferred tests exercise sync refresh responses, not a publish response delayed across a same-generation refresh.

**Fix:** Retain the original connection snapshot used to construct the publish provider and pass its ciphertext plus generation into the auth-error update. Do not obtain the expected ciphertext by rereading after the request. Keep this entirely server-side.

**Regression check:** Defer a real-provider fixture publish's 401/403 response, successfully refresh the connection to a different ciphertext with the same generation, then release the old response. Assert the connection retains the refreshed ciphertext and connected state. A genuine auth failure without an intervening change must still mark RECONNECT. The failed variant can retain its own failure/review state.

## Verification performed in this recheck

- Existing focused tests: **70 passed across 11 files**:
  - social-actions, social-draft, social-refresh, social-owner-resume, social-account-identity, social-enqueue
  - social-publish-executor, social-publish-kind, social-types, socials-ui, socials-providers
- Used the existing stable node_modules/.vitest-temp for TEMP/TMP and one worker. No dependency install.
- The run includes expected caught notifyLive logging from the existing OAuth fake DB without execute and expected warnings for discarded refresh races. Those logs do not constitute PostgreSQL/SSE transport evidence.
- Inspected the added DB test interleavings and lifecycle assertions. They remain unexecuted locally; source inspection and unit predicates are not a concurrency pass.
- No optional broad build, full test suite, lint or typecheck rerun. The fix report records prior full-suite/typecheck/lint/worker/Next-build evidence; that evidence is attributed to the fixer/orchestrator, not this review.
- No VM access, migration, deployment, browser execution/render/focus/mobile test, real pg-boss delivery/restart, OAuth consent or live provider call was performed.
- Source, original review, fix report, STATE, ROADMAP, schema/migrations and gates were not modified. No commit, push or phase advance.

## Owner acceptance boundaries

Before acceptance, resolve WR-08 and run its focused regression. Preserve the existing owner checkpoint order: reviewed deploy/migrate 0009, isolated VM DB/concurrency/lifecycle checks, Chromium-equipped Playwright and deployed queue/restart/UAT checks. Current local passes do not replace those results.

Instagram per-image insights remain intentionally unavailable pending owner response evidence and implementation. Settings confirmation does not implement those metrics. Retain honest unavailable/missing-field UI and the existing live capability gate.

---

_Reviewer: Codex (gsd-code-reviewer)_
_Review mode: targeted iteration 1_

