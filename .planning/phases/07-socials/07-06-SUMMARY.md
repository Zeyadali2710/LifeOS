---
phase: 07-socials
plan: 06
subsystem: ui
tags: [socials, content-board, calendar, analytics, approvals, accessibility]
requires:
  - phase: 07-05
    provides: server-loaded Socials shell, safe card metadata, platform identities
  - phase: 07-03
    provides: owner publish, schedule, manual posting and query capabilities
provides:
  - Owner source/platform draft creation, content board and guarded post/variant editing
  - Sydney week/month content calendar and time-only rescheduling
  - Returned-field post analytics and follower history without invented values
affects: [07-07, owner-uat]
tech-stack:
  added: []
  patterns: [house primitives, server capability gating, Sydney wall-time validation, plain-text Markdown preview]
key-files:
  created: [src/socials/content-board.tsx, src/socials/post-sheet.tsx, src/socials/variant-panel.tsx, src/socials/new-post-dialog.tsx, src/socials/schedule-dialog.tsx, src/socials/mark-posted-dialog.tsx, src/socials/model.ts, src/socials/content-calendar.tsx, src/socials/analytics-view.tsx, src/socials/followers-chart.tsx, src/socials/posts-table.tsx, tests/unit/socials-ui.test.ts]
  modified: [src/socials/socials-view.tsx, src/server/socials/queries.ts]
key-decisions:
  - Only draft variants are editable; pending, scheduled, publishing, published, failed and manually posted text stays read-only.
  - Explicit failed Retry restores the unchanged variant through the existing save action before requesting a fresh approval; no direct publishing path is introduced.
  - Agent drafting uses the existing shell AI entry with saved post ID, source and selected platforms rather than introducing another agent endpoint.
  - Analytics uses stored board variants for MOCK-labelled published rows and safe card histories for follower series; mock followers never enter totals.
requirements-completed: [SOC-02, SOC-03]
duration: 16min
completed: 2026-10-15
---

# Phase 7 Plan 06: Owner drafting, calendar and honest analytics Summary

Socials now supports source-aware ideas and variants, approval requests, read-only scheduled content, manual Markdown/TikTok workflows, a Sydney calendar and analytics that distinguish missing data from returned zero.

## Task Commits

1. **Task 1: Content board, post sheet and draft/action dialogs** — `9cab2f7` (`feat`).
2. **Task 2: Week/month calendar and returned-field analytics** — `9fb65b0` (`feat`).

## Accomplishments

- Five board columns derive from variant state and owner stage. Ideas/Draft moves are optimistic, roll back on action failure, and remain audit-logged through existing actions. Cards carry platform and MOCK labels and real-only view sums.
- New post offers blank/project/saved-or-attended event/repo sources, starter text through the existing server action, platform selection and a default scheduling date. The same flow can open the existing AI panel with the saved post and selected platforms. Board New idea starts in Ideas; palette/calendar default to Draft.
- The full-screen mobile/large desktop post sheet uses the existing focus-trap hook. It exposes source information, untrusted text notice, owner title/idea/stage/platform controls, per-variant saves, checks, character counters and discard/remove/delete confirmations.
- Drafts alone are editable. Approval editing links to Approvals. Scheduled text/image/link fields remain read-only until confirmed cancellation; rescheduling changes only time. Failed retry is explicit and asks for fresh approval. Publish/Schedule controls require server capabilities; real unverified/error Instagram and manual providers have no publish button.
- Portfolio preview renders text, with Copy Markdown and client Blob download. TikTok exposes caption copy, a fixed app URL and owner Mark as posted. Optional live URLs require HTTPS and the platform host; TikTok requires the full video URL. External post links are validated and use noopener/noreferrer.
- Calendar has URL-backed Week/Month, anchor date, Today and previous/next controls, platform filters, add-on-day, chronological chips, MOCK names and overflow expansion. Mobile week becomes a vertical agenda. Sydney wall times are round-trip checked so nonexistent DST times cannot silently change.
- Analytics has URL-backed 7D/30D/90D/1Y, platform follower filters, accessible SVG/data summaries, sparse-history messaging, dashed mock series and real-only follower totals. Post columns appear only when a metric was returned somewhere; absent cells show em dash plus `not provided`, while zero remains zero. Real Instagram verification and missing TikTok scope explanations remain explicit.

## Verification

- Before implementation, the new test file failed because its UI model did not exist.
- Task 1 focused run: **7 tests passed**; `npx tsc --noEmit` passed.
- Final focused `socials-ui` run: **8 tests passed**. Tests exercise board derivation, capability gates, scheduled read-only rendering, escaped text, safe external URLs, Sydney calendar/DST maths, mock total exclusion and missing/zero table rendering.
- Combined `socials-ui` + existing `socials-overview`: **13 tests passed** with stable `node_modules/.vitest-temp` and `--maxWorkers=1`. One earlier parallel attempt failed before collecting tests with the known sandbox Temp `ENOENT`; the stable-temp rerun passed.
- Final `npx tsc --noEmit`: passed.
- Focused `npx eslint src/socials tests/unit/socials-ui.test.ts src/server/socials/queries.ts`: passed without warnings.
- `git diff --check`: passed. Both task commits contain no file deletions.
- No production build, full suite, browser render, VM DB/e2e or live provider check was run in this plan. Final local gates and owner VM acceptance remain Plan 07/owner work.

## Deviations from Plan

1. **[Rule 2 — Shared correctness rules] Added `src/socials/model.ts`.** The UI and focused tests share capability gating, read-only state, host validation, Sydney day/time conversion and missing/mock metric rules. It imports no database code or new dependency.
2. **[Rule 1 — Missing calendar state] Added `publishing` to `calendarItems` query.** The approved calendar includes publishing variants, but the existing query only selected scheduled/published/manually posted records. No new query surface or credential projection is introduced.
3. **[Rule 3 — Existing retry contract] Failed Retry first saves unchanged text/image/link back to draft.** `requestPublish` correctly accepts draft only, so calling it directly on a failed row would always fail. The existing action still validates status and creates a fresh approval.
4. **Existing shell agent path reused.** Source/platform drafting opens the AI panel with a saved post ID and explicit request to save local drafts. No additional agent job or polling mechanism was introduced. Dedicated Social live event refresh remains Plan 07-07.

## Known Stubs

None in these components. Missing source lists, follower history, metrics and provider capabilities have explicit honest empty/unavailable states. The temporary Calendar/Analytics copy from Plan 05 is removed.

## Threat Review

- All draft/provider text and Markdown previews render as React text nodes, without HTML injection.
- Scheduled text cannot be edited in the sheet; the existing server guards remain authoritative for mutations and publish approvals.
- Platform post URLs are HTTPS/host validated, credentials are rejected in URLs, external links use noopener/noreferrer, app URLs are fixed, and downloads stay in the client.
- No schema, auth endpoint, package, token handling or live provider call was added.

## Remaining Checkpoint

Plan 07-07 owns Settings, approval/palette integration, Social live event signals and full mock e2e. Browser focus/visual/mobile checks and the homelab migration/DB/e2e/UAT are still required before owner acceptance. No push, VM migration, deployment or real social action occurred. STATE, ROADMAP and gates remain unchanged pending their acceptance workflow.

## Self-Check: PASSED

- All twelve created source/test files and this summary exist.
- Both task commits `9cab2f7` and `9fb65b0` resolve to Git commit objects and contain no file deletions.
- Focused tests, typecheck, ESLint and whitespace checks passed as recorded above. Temporary ignored commit-preparation copies were removed.
