---
phase: 07-socials
fixed_at: 2026-10-15T23:54:01Z
review_path: .planning/phases/07-socials/07-REVIEW.md
iteration: 1
findings_in_scope: 14
fixed: 14
skipped: 0
status: all_fixed
verified_head: 074746c
---

# Phase 7: Code Review Fix Report

**Fixed at:** 2026-10-15T23:54:01Z
**Source review:** `.planning/phases/07-socials/07-REVIEW.md` (preserved unchanged)
**Iteration:** 1
**Task:** Phase 7 review fixes, starting at `147638e` on isolated branch `gsd-reviewfix/07-20261016`.

**Summary:** 14 findings in scope; 14 fixed; 0 skipped. `all_fixed` means the reported fixes were applied and committed. It does not mean Phase 7, DB concurrency, deployment, or owner acceptance has passed. Logic changes below require human verification.

## Fixed Issues

### CR-01: A fresh approval can publish an old Instagram container

**Status:** fixed: requires human verification
**Files modified:** `src/server/socials/drafts.ts` (new), `src/server/socials-actions.ts`, `src/server/agents/tools/socials.ts`, `src/server/socials/providers.ts`, `src/server/socials/publish.ts`, `src/socials/variant-panel.tsx`, `tests/unit/social-actions.test.ts`, `tests/unit/social-draft.test.ts`, `tests/unit/socials-ui.test.ts`, `tests/db/socials.test.ts`.
**Commit:** `d1da259`
**Applied fix:** Shared redraft rules clear the entire resolved attempt, including container, remote result, approval binding, publication time and metrics. ERROR/EXPIRED Instagram containers are classified as terminal. Agents and ordinary owner saves cannot discard an unresolved attempt. Owner Review retry requires an explicit platform check and duplicate-risk acknowledgement, bound to the displayed attempt timestamp. The server first reconciles a stored remote ID or an Instagram result using its original credential binding. Known results become published without a fresh approval. An acknowledged unresolved reset and its prior attempt evidence are written in one transaction. Fresh request/preparation rejects inherited remote/container evidence. Cancel schedule also follows approval-before-variant lock order and compares its original approval.
**Verification:** Local owner redraft, acknowledgement refusal/acceptance, stored-ID reconciliation, agent terminal/uncertain cases and provider tests pass. VM DB cases cover terminal container -> fresh approval with edited caption/image -> a new container, plus stored-ID reconciliation. DB cases are unrun.

### CR-02: Refresh can overwrite a replacement account with an old token

**Status:** fixed: requires human verification
**Files modified:** `src/server/socials/connections.ts`, `src/server/socials/sync.ts`, `src/server/socials/publish.ts`, `tests/unit/social-refresh.test.ts` (new), `tests/unit/socials-providers.test.ts`, `tests/db/socials.test.ts`.
**Commit:** `5533808`
**Applied fix:** Refresh carries the original ciphertext and credential generation across the remote call and compares both during its update. Sync uses only the snapshot produced by that comparison. Delayed auth errors, sync errors and successful sync persistence are guarded by the same snapshot; analytics persistence locks the matching connection. Publication auth errors compare the approved generation. A lost comparison cannot change the replacement account.
**Verification:** Local deferred-fetch cases pass for replacement during a successful/401 refresh and for two refreshes completing out of order. Deferred reconnect DB cases are added but unrun.

### CR-03: Cancelling a Social run permanently locks its pending variant

**Status:** fixed: requires human verification
**Files modified:** `src/server/agents/runs.ts`, `src/server/socials/publish.ts`, `tests/db/socials.test.ts`.
**Commit:** `ec212b2`; connected schedule cancellation lock alignment in `d1da259`.
**Applied fix:** Actual `cancelRun` cancellation locks candidate approvals before their variants, cancels only eligible approval IDs, and resets matching pending/unclaimed scheduled variants. Publishing variants and their approval evidence are retained. Publish claiming follows the same approval-before-variant lock order. Social live signals are emitted; stale queued jobs cannot match the cleared approval ID.
**Verification:** Typecheck and local publish guard tests pass. Actual cancelRun -> draft -> fresh request and old-job no-op DB cases cover pending and approved schedules; DB execution is pending on the VM.

### CR-04: An enqueue failure creates a schedule the recovery sweep cannot execute

**Status:** fixed: requires human verification
**Files modified:** `src/server/agents/tools/socials.ts`, `tests/unit/social-enqueue.test.ts` (new), `tests/unit/social-publish-executor.test.ts`, `tests/db/socials.test.ts`.
**Commit:** `5f884a0`
**Applied fix:** Once the approved scheduled snapshot is durable, rejection/timeout while delivering the publish job does not fail the approval. Preparation completes and the scheduled sweep can deliver it. Failed, rejected, cancelled and expired approvals remain unauthorized by the publish guard.
**Verification:** Local rejection/timeout handler cases and closed approval guard cases pass. VM cases exercise decide -> executeApproved -> runScheduled -> publishVariant after delivery failure; unrun locally.

### CR-05: Agent draft updates can overwrite a variant that entered review or publishing

**Status:** fixed: requires human verification
**Files modified:** `src/server/agents/tools/socials.ts`, `tests/unit/social-draft.test.ts`, `tests/db/socials.test.ts`.
**Commits:** `c6bfdb3`, typed regression entry point `fa7b291`, lock integration `ece2558`, deterministic DB regression `074746c`; timestamp precision handling in `d1da259`.
**Applied fix:** Agent updates compare the selected status, timestamp and approval and require a returned row. Losing the comparison throws inside the post/variant transaction. Existing-post saves also lock their parent before reading variants. Timestamp comparisons normalize PostgreSQL precision to the milliseconds represented by JavaScript Date.
**Verification:** Local lost-comparison test passes. A deterministic VM test queues a real owner request and agent save behind a held parent lock and checks that the losing save cannot change post/variant content. That DB test is unrun.

### CR-06: Delete can remove a post after its publication guard becomes stale

**Status:** fixed: requires human verification
**Files modified:** `src/server/socials-actions.ts`, `src/server/agents/gateway.ts`, `src/server/agents/tools/socials.ts`, `tests/unit/social-draft.test.ts`, `tests/db/socials.test.ts`.
**Commits:** `ece2558`, `074746c`
**Applied fix:** Deletion locks the parent then its variants and rechecks all blocked states before deleting. The gateway locks the same parent before entering review. Owner platform creation/removal and agent saves use the same parent-first protocol, preventing creation/transition after an unlocked deletion guard.
**Verification:** Local guards and typecheck pass. VM tests explicitly observe PostgreSQL lock waiters and release a held parent lock with deletion first and request first; they assert exactly one operation succeeds. DB execution is pending.

### CR-07: Instagram smoke confirmation is not bound to the verified credential generation

**Status:** fixed: requires human verification
**Files modified:** `src/server/socials/connections.ts`, `src/server/socials-actions.ts`, `src/settings/social-connections.tsx`, `tests/unit/social-actions.test.ts`, `tests/db/socials.test.ts`.
**Commits:** `22949f6`, `7b24962`
**Applied fix:** The client submits its safely projected credential generation. The owner action validates it and atomically compares generation plus verification_pending. Only a successful comparison writes a generation-specific verification audit in the same transaction; stale confirmations cannot authorize or audit a replacement.
**Verification:** Local action/settings tests pass, including a lost update with no audit insert. The stale-before-submission DB case is added but unrun. Browser interaction and live smoke confirmation remain owner actions.

### WR-01: Owner publish requests resume into the LLM loop

**Status:** fixed: requires human verification
**Files modified:** `src/server/socials-actions.ts`, `src/worker/jobs/agents.ts`, `tests/unit/social-owner-resume.test.ts` (new).
**Commit:** `ec9a3be`
**Applied fix:** Existing run model metadata explicitly marks synthetic Social owner actions. After successful approved execution, handleResume completes that run and returns before consulting LLM availability. Actual chat runs continue normally. No migration was introduced.
**Verification:** Four local worker tests pass: synthetic runs with/without an LLM, skipped execution, and ordinary chat continuation. Real queue delivery remains unverified.

### WR-02: Connecting a different account displays the previous account's history

**Status:** fixed: requires human verification
**Files modified:** `src/server/socials/connections.ts`, `tests/unit/social-account-identity.test.ts` (new), `tests/unit/socials-providers.test.ts`, `tests/db/socials.test.ts`.
**Commit:** `9473302`
**Applied fix:** Account credential saves lock the old connection and clear platform account snapshots when identity changes or no prior identity exists. Same-login replacement preserves history. Disconnect removes snapshots, including the TikTok account disconnected with its app. Guarded sync cannot append a stale account's result afterward.
**Verification:** Local same-account replacement/change/disconnect checks pass. A VM case covers A history, same-account replacement, B before its first sync, B after sync, and disconnect; unrun locally.

### WR-03: Month calendar omits posts on the adjacent dates it displays

**Status:** fixed: requires human verification
**Files modified:** `src/socials/model.ts`, `src/app/(os)/socials/page.tsx`, `tests/unit/socials-ui.test.ts`.
**Commit:** `6fd10ee`
**Applied fix:** The server query uses the same calendarDays grid as the client, with Sydney midnight bounds and an exclusive end after the final displayed date.
**Verification:** Local edge tests include September 28 and November 1 in the October 2026 grid, including late-day schedules and daylight savings date conversion. Browser calendar rendering remains pending.

### WR-04: Agent-created source drafts lose the required untrusted-content provenance

**Status:** fixed: requires human verification
**Files modified:** `src/server/agents/tools/socials.ts`, `tests/unit/social-draft.test.ts` (new), `tests/db/socials.test.ts`.
**Commits:** `a336aa7`, `fa7b291`
**Applied fix:** Optional validated source metadata is preserved. New/existing draft taint is derived conservatively from completed content reads in the existing run content scope. Existing taint is updated with OR and cannot be cleared by agent input.
**Verification:** Local recorded-read and monotonic-taint checks pass. A VM case covers actual content tool read -> new/existing draft save -> owner approval facts; unrun locally.

### WR-05: Shared checks accept URLs that the publish/export path rejects

**Status:** fixed: requires human verification
**Files modified:** `src/lib/social-types.ts`, `src/server/socials/providers.ts`, `tests/unit/social-types.test.ts`, `tests/unit/socials-ui.test.ts`.
**Commit:** `dcc1afe`
**Applied fix:** Shared platform checks reject non-HTTPS/credential-bearing LinkedIn links and invalid optional Portfolio public image URLs. The real provider retains the same shared HTTPS defense. Existing draft UI and approval validation display the shared errors before publishing/export.
**Verification:** Invalid protocol/credentials and rendered Portfolio error tests pass locally.

### WR-06: The token rotation DB test expires according to the wall clock

**Status:** fixed
**Files modified:** `tests/db/socials.test.ts`.
**Commit:** `b16ab71`
**Applied fix:** The rotation fixture freezes Date to its injected sync instant and restores real timers afterward. Network/DB timers are not faked. The fixture now uses the same instant for provider readiness and sync.
**Verification:** Typecheck passes. The DB case is unrun locally. Deferred refresh unit tests independently freeze Date and pass despite the actual wall clock being after the original fixture expiry.

### WR-07: Removing TikTok app credentials does not perform the stated disconnect

**Status:** fixed: requires human verification
**Files modified:** `src/server/socials/connections.ts`, `tests/db/socials.test.ts`; connected unit coverage in `tests/unit/social-account-identity.test.ts`.
**Commits:** `64da2ba`, snapshot integration `9473302`
**Applied fix:** App removal transactionally deletes the dependent TikTok connection and history, producing the promised mock/disconnected state.
**Verification:** Local account history/disconnect checks pass. The VM case checks both removed rows, mock provider selection and the next sync making no request; DB execution is pending.

## Verification evidence and limits

- Full local unit suite: **65 files, 544 tests passed** with one worker, stable TMP and TEMP at the existing main `node_modules/.vitest-temp`.
- Full TypeScript check: **passed**, including the DB test source. Rechecked after the final source/test followups.
- Full ESLint: **0 errors, 19 existing warnings** in unrelated mail/project/chat/live/outreach files. No lint warnings were added in the changed files.
- Worker/migration/owner-script esbuild bundle: **passed** using the existing build:worker arguments; no scripts were executed against a DB.
- Focused post-suite attestation action check: **8 tests passed** after making its generation audit transactional.
- `git diff --check`: **passed**. Source changes are committed through `074746c`; only this report is intentionally uncommitted for the orchestrator.
- Default Next production build **passed in the main checkout after fast-forward**. The ordinary sandbox attempt hit the known Windows canonicalization denial; the scoped filesystem retry compiled, typechecked and generated all routes successfully. The earlier isolated-worktree attempt could not resolve ancestor node_modules beyond its lockfile root; its webpack fallback was interrupted and no fallback pass is claimed. No junction, dependency installation or product/config change was used.
- One early focused Vitest run hit transient sandbox temp ENOENT errors; setting both TMP and TEMP to the stable existing directory resolved it. Subsequent focused/full suites passed. The existing OAuth helper fixture still emits the known caught notifyLive error from a mock without execute; it is not DB/SSE evidence.
- **Not run:** local/VM DB execution (known local port 5433 restriction was not retried), browser/render/focus/mobile/UAT, real pg-boss delivery/restarts, migrations, deployment, OAuth consent, or live provider calls. Added DB tests are deterministic regression source, not a concurrency pass.
- Instagram per-image insights remain intentionally unavailable pending real owner evidence and implementation; confirmation does not implement missing metrics.
- Original review, schema/migrations, STATE, ROADMAP, requirements and configuration gates are unchanged. No push, deployment, external action or phase acceptance occurred.

## Handoff and cleanup

The parent orchestrator prepared the worktree and recovery sentinel and retains responsibility for the transactional handoff: fast-forward main, capture this uncommitted report, remove the worktree, delete the temporary branch only after a successful fast-forward, then remove the sentinel only after worktree removal succeeds. Preserve the branch on divergence. The intact review worktree is `C:/Users/footb/Desktop/LifeOS/.claude/worktrees/gsd-reviewfix-07-20261016`; no source changes were made in main.

The orchestrator verified the report copy by SHA-256, fast-forwarded main through `074746c`, removed the clean temporary worktree, deleted its fully merged branch, then removed the recovery marker. All fix commits are preserved on main.

Next checkpoint: targeted reviewer validation and GSD phase verification, followed by owner VM DB/concurrency, queue, browser and live acceptance. This report does not advance Phase 7.

---

_Fixed: 2026-10-15T23:54:01Z_
_Fixer: Codex (gsd-code-fixer)_
_Iteration: 1_

## Iteration 2: Targeted WR-08 follow-up

**Fixed at:** 2026-10-16T00:04:04Z
**Source review:** `.planning/phases/07-socials/07-REVIEW-RECHECK.md`, committed at `ef67a3d`.
**Scope:** WR-08 only (CR-02 residual); 1 finding in scope, 1 fixed, 0 skipped; status `all_fixed` for this iteration. The iteration 1 history above is preserved.
**Source checkpoint:** `0301ad5` on `gsd-reviewfix/07-20261016-r2`.

### WR-08: Delayed publish authentication failure can disable a freshly refreshed token

**Status:** fixed: requires human verification
**Files modified:** `src/server/socials/publish.ts`, `tests/unit/social-publish-auth.test.ts` (new).
**Commit:** `0301ad5` — `fix(07): WR-08 bind publish auth failures to original token snapshot`.
**Applied fix:** The publish executor reads the connection once, constructs the provider from that exact row through the existing decoder/provider functions, and retains its original ciphertext plus credential generation in a local server-only snapshot. A delayed ProviderAuthError passes that original snapshot to the existing connection comparison. No expected ciphertext is reread after the remote request. An unchanged credential still enters error/RECONNECT; a successfully refreshed same-generation credential does not match the old ciphertext and remains connected. The variant retains its own failed state. Approval payloads, client props, events and logging receive no snapshot fields.

**Regression evidence:** Four focused, network-free tests use the real publish executor, real provider fixture request handling, real refresh helper and real generated connection predicates against a small in-memory DB handle:

- Defer an Instagram publish 401, successfully refresh A to B under the same generation, then release A's response: B's ciphertext and connected state remain intact.
- Repeat with a delayed 403: same result.
- Without intervening refresh, both 401 and 403 mark the unchanged connection error/RECONNECT.
- The fixture predicate supports generation-only comparisons as well as ciphertext comparisons, so omitting ciphertext would reproduce the stale error update. Tests also assert a single connection read and no token/ciphertext leakage in emitted activity output.

**Checks performed:**

- Focused publish-auth/executor/refresh suite: **3 files, 10 tests passed** with stable existing TMP/TEMP and one worker.
- After the final fixture predicate/clock refinement, publish-auth alone: **4 tests passed**.
- Full `tsc --noEmit`: **passed**. The subsequent fixture refinement changed only a boolean predicate and froze the test clock; its focused run passed.
- ESLint on both changed files: **passed, no warnings/errors**.
- Existing worker build arguments: **passed** for worker/migration/owner-script bundles. No bundled script was run against a DB.
- Modified source reread and `git diff --check`: **passed**.

**Not run in iteration 2:** full unit suite, default Next production build, DB/VM/concurrency execution, browser/UAT, real queue delivery/restarts, migrations/deployment, OAuth or live provider calls. The orchestrator will run the normal default Next build on main after fast-forward. No worktree Next build, junction, fallback build or dependency installation was attempted in this iteration. Prior iteration/main verification evidence remains attributed above; no new acceptance claim is made here.

**Handoff:** Source is committed through `0301ad5`. This appended report is intentionally uncommitted for the parent orchestrator to capture. The isolated worktree is `C:/Users/footb/Desktop/LifeOS/.claude/worktrees/gsd-reviewfix-07-20261016-r2`; main source was not edited. Leave the worktree, temporary branch and recovery sentinel intact until the orchestrator captures the report, fast-forwards main, removes the worktree, deletes the merged branch, and removes the sentinel. Preserve the branch on divergence. Review artifacts, schema/migrations, STATE, ROADMAP and configuration gates are unchanged by this targeted fix.

_Fixed: 2026-10-16T00:04:04Z_
_Fixer: Codex (gsd-code-fixer)_
_Iteration: 2_

## Orchestrator verification after iteration 2

- Main was fast-forwarded through `0301ad5`; the appended report was captured after verifying that its existing history was unchanged.
- The clean temporary worktree and fully merged branch were removed, followed by the recovery sentinel.
- Full main-checkout unit suite: **66 files, 548 tests passed**, with stable TMP/TEMP and one worker.
- Normal `npm run build`: **passed**, including TypeScript and all route generation, with the scoped Windows filesystem permission already required by this repository.
- DB/browser/queue/live checks remain owner actions. Next checkpoint is final targeted review of WR-08 and phase verification; no acceptance or phase transition is claimed.
