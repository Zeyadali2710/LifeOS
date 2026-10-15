---
phase: 07-socials
plan: 05
subsystem: ui
tags: [socials, glass, overview, connection-status, icons]
requires:
  - phase: 07-03
    provides: provider capabilities, queries and sync actions
provides:
  - Server-loaded Socials shell with URL-synced accessible tabs
  - Four platform cards showing stored data and honest connection capabilities
  - Complete 84-icon font subset including send, download and image
affects: [07-06, 07-07]
tech-stack:
  added: []
  patterns: [public account projection, provider-mode-filtered overview]
key-files:
  created: [src/socials/platform.ts, src/socials/platform-chip.tsx, src/socials/platform-card.tsx, src/socials/socials-view.tsx, src/app/(os)/socials/loading.tsx, tests/unit/socials-overview.test.ts]
  modified: [src/app/(os)/socials/page.tsx, src/server/socials/queries.ts, src/ui/icon-names.ts, src/ui/section-header.tsx, src/app/fonts/material-symbols-outlined.woff2, tests/unit/icons.test.ts]
key-decisions:
  - Card metadata excludes ciphertext and credential generation; only public status, scopes and fixed sync errors reach the client.
  - Published cards match their current provider mode; scheduled cards use approvedProviderMode before isMock is set during publish.
  - Missing follower values remain unavailable and revoked TikTok stats scope hides stale follower history.
requirements-completed: [SOC-01, SOC-02, SOC-03]
duration: 15min
completed: 2026-10-15
---

# Phase 7 Plan 05: Socials shell and platform overview

Socials now loads stored platform cards and board/calendar/analytics data on the server, then presents four Glass account cards and URL-synced Overview, Calendar and Analytics tabs. Cards distinguish MOCK, real verification pending, partial TikTok grants, expiry and reconnect states without invented handles or metrics.

## Task commits

- `d12dd5e` — Task 1: page shell, loading skeletons, platform map/chips/cards, optional SectionHeader action, complete icon subset and focused coverage.

## Verification

- `npx tsc --noEmit`: passed.
- Focused ESLint over Socials, query, shared primitive/icon edits and overview tests: passed without warnings.
- `npm run lint`: passed with the same 19 existing warnings outside this task.
- Full unit run: 497 passed, one icon subset test failed because the new names were unsorted and its expected count was 81. Corrected order and expected count, then reran icon and overview files: all 8 tests passed. No unrelated unit failures.
- FontTools validated every one of the 84 icon ligatures against the regenerated WOFF2, including send/download/image and all prior names. Font size remains within the existing icon test bounds.
- `git diff --check`: passed.
- No browser render, production build or VM DB check was run for this plan; visual/e2e checks remain downstream owner acceptance work.

## Deviations from Plan

1. **[Rule 2 - Missing critical data] Extended `platformCards` public projection.** Required scope, sync-error and history fields were absent. The query now exposes safe connection metadata, excludes credential generation from card props and hides previous-mode publications and unavailable follower history. No credential ciphertext or provider call is added.
2. **[Rule 1 - Test maintenance] Updated `tests/unit/icons.test.ts`.** Its exact subset count must increase from 81 to the approved 84 names; existing uniqueness, sorting, source coverage and binary checks remain intact.
3. **[Rule 2 - Verification] Added five focused overview tests.** Coverage checks missing counts, pending Instagram state, TikTok grants and escaped text, mock schedule binding, and expired-token reconnect.

## Known Stubs and next checkpoint

- `src/socials/socials-view.tsx` has explicit temporary Calendar and Analytics panel copy. Plan 07-06 supplies those panels, content board, new-post flow and post sheet; this plan only owns the shell and cards. Latest-post links are prepared for that sheet.
- The shell currently refreshes on existing approval events. The dedicated social live event channel and server signal wiring remain Plan 07-07 work.
- No mock account history is fabricated: the current provider supplies no persisted fixture history, so MOCK cards show unavailable followers and `No history yet` until corresponding data exists.
- Font ligatures were inspected programmatically; browser glyph rendering, responsive layout and full mock interaction checks remain Plan 07-07/owner e2e work.
- VM migration, deployment, developer apps, token entry and live social verification remain owner actions in `.planning/OWNER-ACTIONS.md`. No migration, push, deploy or live provider call occurred. STATE and ROADMAP remain unchanged pending acceptance.

## Threat review

- Provider labels, identity, errors and post titles render only as React text nodes.
- Card metadata contains no token ciphertext, refresh token or credential generation. Only stored fixed sync errors are displayed.
- No new network endpoint, auth path, database schema or dependency was introduced. The font script uses its existing fixed Google font endpoints.

## Self-Check: PASSED

- All six created source/test files and this summary exist.
- Task commit `d12dd5e` resolves in Git and includes no file deletions.
- Required typecheck/lint checks passed; focused regression tests and all 84 font ligatures passed as reported above.
