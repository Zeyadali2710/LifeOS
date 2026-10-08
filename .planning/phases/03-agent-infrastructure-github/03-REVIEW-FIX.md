---
phase: 03-agent-infrastructure-github
fixed_at: 2026-10-09T00:00:00Z
review_path: .planning/phases/03-agent-infrastructure-github/03-REVIEW.md
iteration: 1
findings_in_scope: 10
fixed: 10
skipped: 0
status: all_fixed
---

# Phase 3: Code Review Fix Report

**Source review:** .planning/phases/03-agent-infrastructure-github/03-REVIEW.md
**Iteration:** 1

**Summary:** 10 findings in scope (2 critical, 8 warning), 10 fixed, 0 skipped. Info findings were out of scope.

**Verification:** `npm run typecheck` clean. `npx eslint .` reported 0 errors and 5 warnings (all pre-existing `window.location.assign` warnings). `npm test` passed 42 files and 192 tests.

## Fixed Issues

### CR-01 and WR-03: Approval stuck in `executing`; resume job swallowed errors
**Files modified:** `src/server/agents/approvals.ts`, `src/worker/jobs/agents.ts`, `tests/db/approvals.test.ts`
**Commit:** 94c428c (shared with WR-02)
**Applied fix:**
- `expireDue` now moves `executing` rows with `updatedAt` older than 2 minutes to `failed` with `ambiguous = true`, so Retry adopts via the marker.
- `handleResume` rethrows after logging, so pg-boss `retryLimit` applies. Malformed job data is still logged and dropped, because retrying cannot fix it. The definite-failure early return is kept.
- Test: a stuck `executing` row becomes failed and ambiguous, then Retry works.
- Not tested: the `handleResume` rethrow itself, because there is no practical way to inject a DB failure there.

### WR-02: Cancelling after approve still created the issue
**Files modified:** `src/server/agents/runs.ts`, `src/server/agents/approvals.ts`, `tests/db/approvals.test.ts`
**Commit:** 94c428c
**Applied fix:**
- `cancelRun` now cancels `pending`, `approved` and `failed` approvals.
- The `executeApproved` claim refuses (returns `skipped`) when the run is `cancelled` or `expired`.
- Tests: cancelling after approve, and a run cancelled while its approval is still `approved`. Both assert no POST is made.

### CR-02: ETag saved before data persisted
**Files modified:** `src/server/github/sync.ts`, `tests/db/github-sync.test.ts`
**Commit:** aebd1cc
**Applied fix:**
- `cond` returns `{ data, save }`. Each caller calls `save()` only after it has finished persisting that resource.
- Test: a 500 on the reviews call fails the first sync, and the next sync stores both PRs. Previously this returned a 304 and stored nothing.

### WR-01: Login redirect built from `request.url`
**Files modified:** `src/proxy.ts`, `tests/unit/proxy.test.ts` (new)
**Commit:** 2b00cb0
**Applied fix:**
- The proxy now returns a 307 with a relative `Location: /login?next=...`. The `next` param is kept and encoded as before.
- A relative redirect needs no origin, so localhost and e2e behave the same.

### WR-04: `<tool_data>` wrapper could be closed by tool content
**Files modified:** `src/server/agents/loop.ts`, `tests/db/loop.test.ts`
**Commit:** 990b169
**Applied fix:**
- `<` in the serialised tool output is replaced with `<`. This is still valid JSON.
- Test: output containing `</tool_data>` yields a single closing tag.

### WR-07 and WR-08: Cost lost on stream failure; `finish` could resurrect a swept run
**Files modified:** `src/server/agents/loop.ts`, `tests/db/loop.test.ts`
**Commit:** d2c48a4
**Applied fix:**
- WR-07: if the stream throws after text was streamed, an estimated usage is recorded before the error is rethrown. Output is about 4 chars per token of streamed text; input is the serialised messages divided by 4. I did not charge when nothing streamed, so pre-request failures such as auth errors do not inflate spend.
- WR-08: `setStatus`, and therefore `finish`, now updates only `WHERE status = 'running'`. If the run is no longer running, it returns the current status and does not emit "done". The thread answer and activity event are written only when the status is `completed`.
- Tests: a failed stream with partial text records a cost; a run swept mid-stream stays `failed`.
- Needs human verification (WR-07): the token figures are heuristic (a ceiling on accuracy). They are a floor on real usage, not the billed amount.

### WR-06: Unknown `threadId` caused a 500; prompt duplicated on retry
**Files modified:** `src/app/api/chat/route.ts`, `src/server/agents/chat.ts`, `tests/db/chat-route.test.ts`
**Commit:** bdb6c8c
**Applied fix:**
- The route returns `400 { code: "invalid" }` when `threadId` does not exist.
- `startChat` now creates the run first and appends the user message only after `createRun` succeeds. `createRun` already adds the prompt to the run's messages, so the LLM history is unchanged.
- Test: unknown thread returns 400; a paused request leaves no message in the thread.

### WR-05: Stale ETags after token replace or remove
**Files modified:** `src/server/github/connections.ts`, `tests/db/connections.test.ts`
**Commit:** 3b650ab
**Applied fix:**
- `saveToken` and `removeToken` for `github_read` delete all `githubEtags` rows, so the next sync does a full fetch.
- Not done: purging the synced repo, PR and issue tables on removal or login change. This is the finding's "optional" part. It changes what agents can read after disconnect, which is a product decision, so I left it out.

## Skipped Issues

None.

---

_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
