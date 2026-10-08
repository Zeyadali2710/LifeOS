---
phase: 03-agent-infrastructure-github
plan: 15
subsystem: ui
tags: [ai-panel, chat, ndjson, approvals, threads]
requires: [03-03, 03-07, 03-12, 03-13, 03-14]
provides: [applyChatEvent, readNdjson, parseAnswer, AnswerText, ResultCard, ApprovalCard, RecentThreads, useChat]
key-files:
  created: [src/shell/ai/chat-state.ts, src/shell/ai/answer-text.tsx, src/shell/ai/result-card.tsx, src/shell/ai/approval-card.tsx, src/shell/ai/recent-threads.tsx, src/shell/ai/use-chat.ts, tests/unit/chat-state.test.ts, tests/unit/answer-text.test.ts]
  modified: [src/shell/ai-panel.tsx]
requirements-completed: [AGT-02, AGT-04]
completed: 2026-10-08
---

# Phase 3 Plan 15: AI panel to real orchestrator chat Summary

The Phase 2 shell panel now streams real orchestrator runs: live ExecutionTrace, inline approval cards, saved threads and honest blocked states.

## What was built
- `chat-state.ts`: pure `applyChatEvent` reducer (optimistic `pending` turn replaced by the `run` event, steps upserted in seq order, deltas appended, approvals upserted), `splitNdjson` + async `readNdjson` over `getReader()`.
- `answer-text.tsx`: safe-subset parser (paragraphs, `-` lists, fenced/inline code, `owner/repo[#n]` citations). Chips link only if `isSafeGithubUrl`; no `dangerouslySetInnerHTML`, no other links or images.
- `useChat`: POST `/api/chat` NDJSON, 409/429 mapped to block codes (draft kept), 401 to /login, thread list/open, Stop via `cancelRunAction`, thread refetch on live `run`/`approval` frames (covers worker-resumed runs), polite end-of-run announcement.
- `ResultCard`, `ApprovalCard` (CREATE ISSUE / REJECT / Review and edit, resolved footers, toasts), `RecentThreads` ("No conversations yet.").
- `ai-panel.tsx`: header sub-label from `useAgentStatus`, New/Recent/Close buttons, empty state with status-driven examples (repo example only when `firstRepo`), cap / no key / paused InlineErrors, Send becomes Stop, Esc steps out of Recent then closes and never cancels, `consumeAIPrompt` kept (deferred via setTimeout for the set-state-in-effect rule).

## Deviations
- Paused InlineError copy is not in UI-SPEC; wrote it in the same pattern (label `ERROR · PAUSED`, action OPEN AGENTS).
- `ApprovalCard` body preview uses a simple clamp toggle ("Show full preview"/"Show less") instead of the `Disclosure` component to avoid duplicating text.
- Added `noUncheckedIndexedAccess` fixes in the new code/tests.
- Existing e2e specs (`tests/e2e/home.spec.ts`, `palette.spec.ts`) reference the old not-connected panel copy; not run here, to be updated in plan 19.

## Verification
`vitest run tests/unit` 88 passed (incl. 5 new); `npm run typecheck` clean; eslint 0 errors (warnings: `window.location.assign('/login')`, same as live-provider). Not run: `next build`, e2e.

## Known Stubs
None.

## Self-Check: PASSED
