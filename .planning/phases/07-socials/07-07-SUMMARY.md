---
phase: 07-socials
plan: 07
subsystem: ui
tags: [socials, approvals, connections, sse, playwright]
requires:
  - phase: 07-04
    provides: provider DB contracts and owner acceptance checklist
  - phase: 07-06
    provides: draft sheet, calendar, analytics and manual posting surfaces
provides:
  - editable Social approval detail and inline review with actual variant status
  - encrypted connection forms, Instagram owner attestation and actual TikTok scope display
  - post palette search and dedicated Social live refresh
  - isolated mock executor browser specs and homelab checklist
affects: [phase-07-verification, owner-acceptance]
tech-stack:
  added: []
  patterns: [id-only Social SSE signals, owner-only approval facts projection, test-only publish executor subprocess]
key-files:
  created:
    - src/approvals/social-approval.tsx
    - src/settings/social-connections.tsx
    - tests/e2e/socials.spec.ts
    - tests/e2e/social-executor.ts
    - tests/unit/social-review.test.ts
    - tests/unit/social-settings.test.ts
    - tests/unit/social-live.test.ts
  modified:
    - src/server/socials-actions.ts
    - src/server/socials/connections.ts
    - src/server/socials/publish.ts
    - src/server/socials/sync.ts
    - src/server/agents/tools/socials.ts
    - src/shell/live-provider.tsx
    - src/server/palette-actions.ts
    - tests/e2e/owner.ts
    - .planning/OWNER-ACTIONS.md
key-decisions:
  - Approval execution means queue preparation; published copy requires actual variant evidence.
  - Browser fixtures invoke production publishVariant with network prohibited and a future clock, without simulating publication through SQL.
  - Owner acceptance and GSD tracking remain untouched under AGENT_HANDOFF.md.
requirements-addressed: [SOC-01, SOC-02, SOC-03]
requirements-completed: []
duration: approximately 28min
completed: 2026-10-15
---

# Phase 7 Plan 07: Social review, connections and mock verification Summary

Social approvals now edit the exact outgoing content while locking provider/account bindings, show actual publish status, and refresh alongside Socials through dedicated live signals.

## Task Commits

1. **Task 1: Social approval UI and inline review card** — `2e3dce1` (`feat`).
2. **Task 2: Connections, palette and mock end-to-end path** — `91cf2fc` (`feat`).
3. **Verification fixes: UTF-8, malformed rows and requested lint cleanup** — `39c78e6` (`fix`).

## Accomplishments

- Detail and AI inline cards share Social review/edit controls. Stored original and current payloads are schema checked before rendering. Only text, image/link URLs and publish time are editable; client validation strips unexpected draft properties, and the existing server validation/transaction remains authoritative.
- The review shows locked platform, variant, account destination and real/mock mode, exact text/URLs, schedule time, untrusted source note, EDITED marker and original preview. Invalid edits or a changed connection disable Approve. Existing owner save/approve/reject flows persist edits.
- An owner-only server projection loads the current variant and source flag, checks credential generation, and returns only safe metadata. An executed approval does not imply publication: resolved copy distinguishes scheduled, publishing, published, failed and inactive/rejected states. External post links require HTTPS, no embedded credentials, the platform host and a real publication.
- The dedicated `socials` signal reaches `LiveKind`, `notifyLive`, the PostgreSQL hub, EventSource dispatch, Socials and review subscribers. Owner mutations, agent draft saves, approval preparation, worker publish transitions, sync completion and connection changes emit it. Signals carry only a bounded ID. Reconnect uses the existing resync path.
- Settings adds four anchored SOCIALS rows. LinkedIn/Instagram reuse password token forms with immediate local clearing, existing encrypted saves, last4/expiry display and removal confirmation. TikTok has password app credential fields, exact callback/copy, Connect/Disconnect confirmation, actual granted scopes and missing account/video capability explanations. Portfolio remains informational Markdown export.
- Instagram remains `verification_pending` until the owner attests to token/scopes/expiry, a public-image publish and a real insights response. All three checks are required by the UI; rotating the connection resets attestation state. No real provider validation or token was used during execution.
- Palette has New post, a Posts scope and parameterized title search linking to the existing post sheet. Existing source-aware URL/dialog, calendar, draft and manual sheet flows remain in use.
- Three Playwright cases cover source → Instagram error correction → approval edit → schedule/read-only sheet → actual mock executor publication/live refresh; TikTok copy/manual marking; and removal of a queued real credential without fallback mock publication. Desktop/mobile discovery yields six cases.
- The test subprocess asserts the database is exactly `lifeos_e2e`, refuses an existing provider credential, prohibits all fetch traffic, invokes production `publishVariant` twice to exercise retry behavior, and asserts actual mock remote IDs/no external URLs. The removed-real case seeds a queued real binding, calls production removal and verifies production execution fails. SQL is used for fixtures/readback/cleanup, never to pretend publishing succeeded.

## Verification

- Focused review/settings/live-hub/actions/approval/executor/palette run: **31 tests passed across 7 files**.
- Task 2 focused settings/palette run: **10 tests passed**.
- Full `npx vitest run tests/unit --maxWorkers=1`: **517 tests passed across 60 files**, using stable `TEMP`/`TMP` at ignored `node_modules/.vitest-temp`.
- After the final small fixes, provider/review targeted run: **20 tests passed**, including the newly added malformed-payload list case. The full suite count above precedes that additional regression test.
- `npx tsc --noEmit`: passed, including browser specs and subprocess helper. The final Next build also typechecked successfully.
- Full `npm run lint`: passed with **0 errors and 19 existing warnings**. An earlier run showed 21: `git blame` traced the extra `_input`/`_init` warnings to pre-existing `5fd2b365`; the requested tiny cleanup retains typed mock call assertions and restores the prior baseline. Focused lint on final changed files passed.
- `npm run build:worker`: passed.
- `npm run build`: passed with approved elevated filesystem access. Initial sandbox execution failed on the known Windows SWC canonicalization permission boundary. Compilation then caught an invalid UTF-8 inserted middle dot in the approval list; the source encoding was repaired and every modified source was scanned for invalid UTF-8. The final build compiled, typechecked and generated all routes successfully.
- `npx playwright test tests/e2e/socials.spec.ts --list`: passed, **6 cases**. Browser execution was **not** run locally.
- `git diff --check`: passed. Task/fix commits have no file deletions.
- The full unit output includes a harmless caught `notifyLive` error in an existing fake DB handle without `execute`; the provider assertions pass. The dedicated hub test verifies real dispatch behavior with a mocked transport, including bounded id-only frames and rejected malformed signals.
- No DB suite rerun: local PostgreSQL port 5433 was already proven inaccessible (`EACCES`) in Plan 04. No transactional DB result, browser render, queue-consumer delivery or live-provider success is claimed here.

## Deviations from Plan

1. **[Rule 2 — Actual publication evidence] Added `socialReviewFacts` and used the full review shell inline.** An approval's executed state means enqueue/preparation, so status and safe links must come from its current variant. The inline card also needs the same edit and locked destination guarantees. Files: Social approval, owner actions, existing AI card. Commit: `2e3dce1`.
2. **[Rule 2 — Live completion] Added the dedicated Social event channel and connected emitters/subscribers.** Prior plans explicitly deferred this wiring; approval events alone cannot refresh publication or analytics completion. Files: live types, events/hub/provider, Socials view, tools/actions/publish/sync/connections. Commits: `2e3dce1`, `91cf2fc`.
3. **[Rule 3 — Test harness] Added a test-only executor subprocess and owner helpers.** Existing Playwright starts no worker or LLM. The owner source path itself requires no LLM, so its normal synthetic approval is used; production mock publication is invoked directly rather than faking SQL status. Actual background queue delivery and agent/LLM integration remain DB/deployed checks. Commit: `91cf2fc`.
4. **[Rule 1 — Build/render correctness] Repaired approval-list UTF-8 and tolerated malformed payload objects.** Added a regression test; no rendering of untrusted HTML. Commit: `39c78e6`.
5. **[Owner-requested cleanup] Removed two unused provider fake-fetch parameters while preserving `typeof fetch` mock typing.** No provider behavior changed. Commit: `39c78e6`.
6. **[Project acceptance protocol] Did not update STATE, ROADMAP, requirements or configuration gates.** The owner-approved task contract and AGENT_HANDOFF.md reserve acceptance and phase advancement for their existing workflow. This summary records implementation ready for review, not owner acceptance.

## Known Stubs and Remaining Checks

No new placeholder component or simulated publish-success implementation remains in this plan. **Inherited limitation:** Instagram per-image insights in `src/server/socials/providers.ts` remain unavailable until the owner supplies the real response and any required follow-up is implemented. Clicking the Settings attestation does not implement or prove those metrics. Preserve missing-metric display and capability gates.

The e2e helper executes the same publication function as the worker, but does not prove pg-boss delivery, resume handling or service restart behavior. The browser specs have only been listed/typechecked here. Owner VM DB/e2e, visual/mobile/focus UAT, real queue delivery, OAuth consent and live provider smoke remain open in `.planning/OWNER-ACTIONS.md`.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: owner_read_action | src/server/socials-actions.ts | New owner-only approval facts read uses fixed column projections and validated local IDs; safe platform URLs only, no ciphertext/token projection. |

Other trust boundaries retain existing owner auth, encryption, locked approval generation and provider validation. No new route, schema, dependency or external service is introduced. Test subprocess/file access is confined to the existing e2e harness and isolated database.

## Owner Handoff

The exact homelab checklist is in `.planning/OWNER-ACTIONS.md`, Phase 7: reviewed deploy/migration `0009_socials`; isolated VM DB contracts; `CI=1 npm run e2e -- tests/e2e/socials.spec.ts` with Chromium prerequisites if missing; deployed tailnet UAT; LinkedIn app/token smoke; TikTok Sandbox consent and actual scopes; Instagram token/public-image/insights evidence before confirmation. Record deployed commit, counts and pass/issue without secrets.

No push, migration, deployment, dependency installation, live API call or real external post occurred. Next verified checkpoint is code/security review followed by owner VM/browser acceptance.

## Self-Check: PASSED

- All seven created source/test files and this summary exist.
- Task commits `2e3dce1`, `91cf2fc` and fix commit `39c78e6` resolve to commit objects and contain no deletions.
- Final typecheck, focused tests/lint, full lint, worker/Next builds and e2e discovery passed as recorded; DB/browser/live checks remain explicitly open.
