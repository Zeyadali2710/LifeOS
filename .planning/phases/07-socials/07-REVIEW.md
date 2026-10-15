---
phase: 07-socials
reviewed: 2026-10-15T10:40:34Z
depth: standard
diff_base: 95b9416
reviewed_head: 1130b38
files_reviewed: 79
files_reviewed_list:
  - drizzle/0009_socials.sql
  - src/app/(os)/settings/page.tsx
  - src/app/(os)/socials/loading.tsx
  - src/app/(os)/socials/page.tsx
  - src/app/api/connections/tiktok/callback/route.ts
  - src/app/api/connections/tiktok/start/route.ts
  - src/approvals/approval-detail.tsx
  - src/approvals/approval-list.tsx
  - src/approvals/social-approval.tsx
  - src/lib/approval-kinds.ts
  - src/lib/live-types.ts
  - src/lib/social-types.ts
  - src/server/agents/approvals.ts
  - src/server/agents/gateway.ts
  - src/server/agents/policy.ts
  - src/server/agents/registry.ts
  - src/server/agents/tools/index.ts
  - src/server/agents/tools/socials.ts
  - src/server/db/schema.ts
  - src/server/events.ts
  - src/server/hub.ts
  - src/server/palette-actions.ts
  - src/server/queue.ts
  - src/server/socials-actions.ts
  - src/server/socials/connections.ts
  - src/server/socials/markdown.ts
  - src/server/socials/providers.ts
  - src/server/socials/publish.ts
  - src/server/socials/queries.ts
  - src/server/socials/sync.ts
  - src/settings/connection-row.tsx
  - src/settings/connections-section.tsx
  - src/settings/social-connections.tsx
  - src/settings/token-form.tsx
  - src/shell/ai/approval-card.tsx
  - src/shell/live-provider.tsx
  - src/shell/palette-items.ts
  - src/shell/palette.tsx
  - src/socials/analytics-view.tsx
  - src/socials/content-board.tsx
  - src/socials/content-calendar.tsx
  - src/socials/followers-chart.tsx
  - src/socials/mark-posted-dialog.tsx
  - src/socials/model.ts
  - src/socials/new-post-dialog.tsx
  - src/socials/platform-card.tsx
  - src/socials/platform-chip.tsx
  - src/socials/platform.ts
  - src/socials/post-sheet.tsx
  - src/socials/posts-table.tsx
  - src/socials/schedule-dialog.tsx
  - src/socials/socials-view.tsx
  - src/socials/variant-panel.tsx
  - src/ui/icon-names.ts
  - src/ui/section-header.tsx
  - src/worker/index.ts
  - tests/db/migrations.test.ts
  - tests/db/socials.test.ts
  - tests/e2e/owner.ts
  - tests/e2e/social-executor.ts
  - tests/e2e/socials.spec.ts
  - tests/fixtures/socials/instagram/container.json
  - tests/fixtures/socials/linkedin/post.json
  - tests/fixtures/socials/tiktok/user.json
  - tests/fixtures/socials/tiktok/videos.json
  - tests/helpers/fake-socials.ts
  - tests/unit/agent-contracts.test.ts
  - tests/unit/icons.test.ts
  - tests/unit/palette.test.ts
  - tests/unit/social-actions.test.ts
  - tests/unit/social-live.test.ts
  - tests/unit/social-publish-executor.test.ts
  - tests/unit/social-publish-kind.test.ts
  - tests/unit/social-review.test.ts
  - tests/unit/social-settings.test.ts
  - tests/unit/social-types.test.ts
  - tests/unit/socials-overview.test.ts
  - tests/unit/socials-providers.test.ts
  - tests/unit/socials-ui.test.ts
findings:
  critical: 7
  warning: 7
  info: 0
  total: 14
status: issues_found
---

# Phase 7: Code Review Report

**Reviewed:** 2026-10-15T10:40:34Z
**Depth:** standard
**Files Reviewed:** 79 source, test and migration files
**Status:** issues_found

## Narrative Findings (AI reviewer)

## Summary

The approval hash and provider checks do not cover the complete lifetime of retries and credential replacement. The highest risks are publishing an older Instagram container under newly approved content and storing an old account's refreshed token under a replacement account's credential generation. Approval cancellation, failed enqueue recovery, concurrent edits/deletion and Instagram attestation also leave gaps.

Scope: explicit `git diff 95b9416..1130b38 --name-only -- src tests drizzle`, with connected approval/run/worker/session/crypto/time callers read as needed. Generated migration metadata and the binary font are excluded from the source file count. No structural pre-pass was supplied. No source, state, roadmap or gate changes were made.

## Critical Issues

### CR-01: A fresh approval can publish an old Instagram container

**Classification:** BLOCKER
**File:** `C:/Users/footb/Desktop/LifeOS/src/server/socials-actions.ts:109-111`
**Related:** `src/server/agents/tools/socials.ts:79-80`, `src/server/socials/publish.ts:80-85`, `src/server/socials/providers.ts:151-183`
**Issue:** Returning a failed variant to draft clears its approval/hash but retains `containerId`, `remoteId` and the other publication state. The visible Retry action invokes this redraft and requests a new approval. If the owner edits the text/image in that approval, the worker checks the new text hash, then passes the old container to Instagram. A FINISHED container is published using only `creation_id`, so Instagram receives the old caption/image while LifeOS records the newly approved text. ERROR/EXPIRED containers also make every fresh retry fail again. Retained remote IDs can cause a new approval to be finalized without sending its content.
**Evidence:** A network-free provider probe passed new text/image plus an old container and observed the only POST body `creation_id=old-container`; neither new content field was sent.
**Fix:** Keep remote/container state bound to the approval and credential generation that created it. Reconcile ambiguous attempts before allowing a fresh publish. A genuine new draft/approval must clear resolved prior-attempt publication fields in both owner and agent redraft paths; do not discard an uncertain remote result and blindly repost. Test a failed container, fresh approval with edited text/image, and both a terminal container and a stored remote ID.

### CR-02: Refresh can overwrite a replacement account with an old token

**Classification:** BLOCKER
**File:** `C:/Users/footb/Desktop/LifeOS/src/server/socials/connections.ts:92-101`
**Related:** `src/server/socials/sync.ts:16-34,38-47,94-96`
**Issue:** Each refresher reads a connection and makes its remote request, but `refreshSocialToken` then reads the connection again and compares against that newer ciphertext. If the owner reconnects/replaces the account while the remote refresh is pending, the stale response overwrites the replacement tokens while retaining the replacement login and credential generation. Instagram approvals bound to the replacement can consequently authorize a token for the old account. Two simultaneous refreshes have the same stale-response overwrite problem. Auth-error updates also target only the platform and can mark a newly replaced connection erroneous.
**Evidence:** An isolated helper probe supplied the replacement row as the helper's read and an old account's refresh response. The write stored the old token and omitted any generation change; the replacement generation remained in place.
**Fix:** Carry the original ciphertext and credential generation from before the network call into the refresh update predicate. Reject a lost comparison without changing the replacement connection, including its auth/sync error state. Apply the same generation predicate to delayed auth failures. Add deferred-fetch tests for reconnect and two concurrent refreshes.

### CR-03: Cancelling a Social run permanently locks its pending variant

**Classification:** BLOCKER
**File:** `C:/Users/footb/Desktop/LifeOS/src/server/agents/gateway.ts:169-173`
**Related:** `src/server/agents/runs.ts:62-85`, `src/server/agents/approvals.ts:63-67,89-94,267-270`
**Issue:** The gateway changes the variant to `pending_approval`. The existing Cancel run/AI Stop path cancels its approval through `cancelRun`, but never resets that variant. The new reset helper is called only by rejection and expiry; cancelled approvals are excluded from the expiry sweep. The variant remains in Review forever: it cannot be edited, removed, deleted, republished or passed to Cancel schedule.
**Fix:** In the cancellation transaction, reset only variants still pending with one of the approval IDs actually cancelled. Handle approved-but-unclaimed schedules consistently, without changing a publishing variant or a newer approval. Emit the Social signal. Add an integration test using the actual `cancelRun` path, followed by a fresh publish request.

### CR-04: An enqueue failure creates a schedule the recovery sweep cannot execute

**Classification:** BLOCKER
**File:** `C:/Users/footb/Desktop/LifeOS/src/server/agents/tools/socials.ts:109`
**Related:** `src/server/agents/approvals.ts:195-199,237-244`, `src/server/socials/publish.ts:21,115-123`
**Issue:** Approval commits the variant as scheduled. If the resumed handler's publish enqueue throws or times out, `executeApproved` changes the approval to failed. The minute sweep keeps enqueuing the due variant, but `inspectPublish` accepts only approved/executed approvals, so every attempt is a no-op. The approved-approval recovery query excludes failed rows; the Social approval shell exposes no approval retry action. After seven days the approval expires while the variant remains scheduled. A transient queue outage therefore requires manual cancellation and a new approval instead of the promised recovery.
**Evidence:** An isolated guard probe returned `noop` for a valid due scheduled variant whose approval failed at enqueue.
**Fix:** Treat publish enqueue failure as a recoverable scheduling-delivery failure after the approved snapshot is durable. Either finish the preparation and let the sweep deliver it, or explicitly reconcile only this safe failed-enqueue state. Do not generally authorize failed/rejected approvals. Test enqueue rejection and timeout through `decide -> executeApproved -> runScheduled -> publishVariant`.

### CR-05: Agent draft updates can overwrite a variant that entered review or publishing

**Classification:** BLOCKER
**File:** `C:/Users/footb/Desktop/LifeOS/src/server/agents/tools/socials.ts:76-80`
**Issue:** The agent checks draft/failed status in a SELECT, then performs its UPDATE using only the ID. The transaction does not lock the selected variant. A concurrent publish request can move it into pending approval, scheduled or publishing between those statements; the agent then writes draft content and clears the active approval. This bypasses the server's promised read-only rule, can strand the approval, and can permit another request while the original remote publish is in flight. The owner save action already demonstrates the needed status predicate.
**Fix:** Lock the row before checking it, or condition the update on the allowed status and expected version/approval, require a returned row, and roll back the post/variant transaction on a lost race. Test an interleaved agent save and owner publish/approval.

### CR-06: Delete can remove a post after its publication guard becomes stale

**Classification:** BLOCKER
**File:** `C:/Users/footb/Desktop/LifeOS/src/server/socials-actions.ts:136-138`
**Issue:** Delete checks for pending/scheduled/publishing variants in one statement, then deletes the parent in another without a lock or transaction. Between those statements a concurrent publish request can claim a draft and approval execution can schedule/publish it. The cascading DELETE then removes the guarded variant and its stored publication evidence. In the publishing interleaving, the worker may already hold the approved content and make the external call after the owner receives successful deletion.
**Fix:** Serialize deletion against variant creation and transitions into review/publishing, using a consistent parent/variant locking protocol across the delete and gateway paths. Recheck the blocked statuses under those locks and return not_allowed after a competing transition. A transaction around the current unlocked SELECT alone is insufficient. Add an interleaved DB test proving either deletion or the request wins, never both.

### CR-07: Instagram smoke confirmation is not bound to the verified credential generation

**Classification:** BLOCKER
**File:** `C:/Users/footb/Desktop/LifeOS/src/server/socials/connections.ts:172-174`
**Related:** `src/server/socials-actions.ts:219-225`, `src/settings/social-connections.tsx:21-23`
**Issue:** The owner action checks that the current connection is verification_pending, then the helper marks whichever Instagram row exists connected using only its ID. More basically, the client sends no generation with the attestation. A token can be replaced after the owner checked the smoke boxes or while confirmation is pending, and that old attestation enables real publishing for the replacement token. Re-keying the Settings component does not protect an already submitted request.
**Fix:** Send the generation displayed alongside the smoke checks and condition the update on that generation plus verification_pending, returning failure if no row wins. Audit only the successful generation. Add a stale-confirmation test where a replacement occurs before submission and during the action.

## Warnings

### WR-01: Owner publish requests resume into the LLM loop

**Classification:** WARNING
**File:** `C:/Users/footb/Desktop/LifeOS/src/server/socials-actions.ts:242-247`
**Related:** `src/worker/jobs/agents.ts:20-29`, `src/server/agents/loop.ts:187,301-309`
**Issue:** The synthetic owner run is sent through the ordinary agent resume job. After executing the approved enqueue, that handler requires an Anthropic key and invokes `runQueued`. Synthetic runs have the default empty message history, so a configured client is called with an empty conversation; without a key the run is marked failed despite successful publish preparation. This violates the owner path's no-LLM contract and adds false failures/API calls. Direct executor browser tests do not exercise this worker path.
**Fix:** Mark synthetic owner action runs explicitly and complete them after the approved tool executes; continue the LLM only for actual chat runs. Test `handleResume` with and without an LLM and assert no LLM call for the synthetic path.

### WR-02: Connecting a different account displays the previous account's history

**Classification:** WARNING
**File:** `C:/Users/footb/Desktop/LifeOS/src/server/socials/queries.ts:49-60`
**Related:** `src/server/socials/connections.ts:49-55,81-87`, `src/server/socials/sync.ts:77-81`
**Issue:** Account snapshots are keyed only by platform and are neither cleared nor account-qualified on replacement/removal. Connect TikTok account A, sync followers, disconnect, then connect B with stats scope: B's card immediately shows A's follower count/history, and B's next snapshot continues A's growth series. Instagram has the same issue after confirmation.
**Fix:** Associate history with stable account identity, or clear the platform's account snapshots when the login changes (including remove/reconnect). Preserve history for a token refresh/replacement for the same login. Test A-to-B reconnect before and after the first B sync.

### WR-03: Month calendar omits posts on the adjacent dates it displays

**Classification:** WARNING
**File:** `C:/Users/footb/Desktop/LifeOS/src/app/(os)/socials/page.tsx:19-25`
**Related:** `src/socials/model.ts:25-32`, `src/socials/content-calendar.tsx:28-36`
**Issue:** Month data is fetched only from the first of the month to the first of the next month, but the rendered Monday-to-Sunday grid includes adjacent-month dates. For October 2026 the visible September 28-30 and November 1 cells can contain scheduled posts yet appear empty. Adding a post on one of those visible cells still leaves it absent on returning to the calendar.
**Fix:** Derive the server query range from the same first/last grid days as the client, ending after the last visible day in Sydney time. Test a schedule on each adjacent-month edge.

### WR-04: Agent-created source drafts lose the required untrusted-content provenance

**Classification:** WARNING
**File:** `C:/Users/footb/Desktop/LifeOS/src/server/agents/tools/socials.ts:57-58,69-71`
**Issue:** The owner source flow sets draftedFromContent, but the agent save schema accepts no source and new posts always retain the default false. An agent can read a repo/event and create a new post through this advertised tool; its resulting approval has no untrusted-source warning. Updating a blank existing post from repo/event content has the same missing marker. The content floor does not restore that owner-facing provenance.
**Fix:** Preserve source metadata and conservatively derive content provenance from the run's actual content reads; never let agent input clear an existing taint. Test source read -> save new/existing draft -> approval facts.

### WR-05: Shared checks accept URLs that the publish/export path rejects

**Classification:** WARNING
**File:** `C:/Users/footb/Desktop/LifeOS/src/lib/social-types.ts:26-51`
**Related:** `src/server/agents/tools/socials.ts:17-18`, `src/server/socials/providers.ts:84-85`, `src/server/socials/markdown.ts:5`, `src/socials/variant-panel.tsx:44-48`
**Issue:** checkVariant does not validate LinkedIn link protocol or Portfolio's optional image URL. Zod's generic URL check accepts protocols such as http/mailto/javascript. Thus LinkedIn can show Ready to publish, create an approval, and fail only when the real provider enforces HTTPS. A Portfolio variant with an HTTP image reports no format error, but Markdown generation throws; the UI silently hides the preview and disables export while its copy says invalid fields are listed. The mock publish path also does not expose the real-provider rejection.
**Fix:** Put the actual platform URL requirements in the shared checks/schema used by draft UI, approval and provider. Show the precise URL error before approval/export, while retaining provider validation as defense in depth. Add invalid-protocol tests and a Portfolio invalid-image rendering test.

### WR-06: The token rotation DB test expires according to the wall clock

**Classification:** WARNING
**File:** `C:/Users/footb/Desktop/LifeOS/tests/db/socials.test.ts:242-266`
**Related:** `src/server/socials/providers.ts:190-192`
**Issue:** The DB test injects October 15, 2026 into syncSocials and refreshes to October 16, 2026 02:00 UTC, while getProvider checks token readiness with real Date.now(). Once the test runs after that instant, analytics is disabled, snapshots are not inserted and the assertion fails despite unchanged production behavior. Owner VM acceptance is deliberately later than implementation, so this is an immediate reliability problem.
**Fix:** Freeze the system clock for this test and restore it afterward, or consistently inject the same clock into provider readiness. Add a check that the test remains deterministic with a wall clock after the fixture token expiry.

### WR-07: Removing TikTok app credentials does not perform the stated disconnect

**Classification:** WARNING
**File:** `C:/Users/footb/Desktop/LifeOS/src/server/socials/connections.ts:181-183`
**Related:** `src/settings/social-connections.tsx:69-70,86-87`, `src/server/socials/sync.ts:18-19`
**Issue:** Removing tiktok_app deletes only that row, but its confirmation says LifeOS stops syncing and returns to MOCK. The tiktok access/refresh credential remains connected, provider selection remains real and sync continues while the access token is valid. Later refresh fails because the app credentials are missing, producing a connected-but-broken account instead of the promised mock state.
**Fix:** Make the remove-app operation transactionally remove/disconnect the dependent TikTok account, or state and implement an explicit separate behavior in the confirmation. Test removing app credentials from a connected account and the next sync/provider selection.

## Verification evidence and limits

- Ran the existing focused Socials unit files: **56 tests passed across 10 files**, using the existing stable temp directory and one worker. The run logs the known caught notifyLive error from a fake DB handle without execute; this is not a PostgreSQL/SSE transport result.
- Ran three temporary, in-memory, network-free assertion probes against production exports. They reproduced stale refresh overwrite, new content ignored by an old Instagram container, and no-op recovery for a scheduled variant with failed approval.
- Concurrency findings above are grounded in the actual SELECT/UPDATE predicates and connected callers. Their interleavings were not executed against PostgreSQL locally; add deterministic transactional regressions on the owner test DB during fixing.
- Reviewed the browser helper's isolated lifeos_e2e guard, no-fetch policy, mock binding assertion and use of production publishVariant. It proves neither pg-boss delivery nor ordinary agent.resume behavior. The existing focused tests do not cover cancellation of a Social run, a fresh approval over an old container, a replacement during an in-flight refresh/confirmation, enqueue failure through the full approval lifecycle, or concurrent agent save/deletion.
- **Not run:** owner VM DB tests, migrations, browser execution/render/focus/mobile checks, real queue delivery/restarts, OAuth consent or live provider APIs. No DB/browser/live pass is claimed. Full lint/typecheck/build were not repeated for this read-only review.
- **Known intentional limitation:** Instagram per-image insights remain disabled pending owner response evidence and follow-up implementation. Account analytics capability does not prove per-image metrics. Preserve missing values and tell the owner this limitation survives Settings confirmation; do not invent metric values or treat the attestation as code implementation.
- **Owner checkpoint order:** fix/review the blockers, retain local verification evidence, then the reviewed VM deploy/migrate 0009 checkpoint, isolated VM DB suite, and Chromium-equipped Playwright/UAT per OWNER-ACTIONS. The documented VM script deliberately leaves its separate test Postgres running. The documented e2e prerequisite uses CI=1 with bundled Chromium and the installed Playwright Chromium/system dependencies; no install or acceptance action was performed here.

---

_Reviewer: Codex (gsd-code-reviewer)_
_Depth: standard_

