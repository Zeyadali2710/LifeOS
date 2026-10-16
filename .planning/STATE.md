---
milestone: v1.0
status: finances_locally_verified_pending_deployment
last_updated: 2026-10-17
workflow: direct feature development (owner requested; GSD discontinued)
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-10-07)

**Core value:** Know what matters, what needs attention, and what to do next — in one place.
**Current focus:** Phase 7.1 Finances: overview ranges, Savings/cash-flow trend charts, hover values and interactive category pie. Phase 8 Knowledge + Goals remains unstarted.

## Current Position

Phase 7: all seven implementation plans completed and review findings fixed.
LinkedIn, Instagram and TikTok connected by the owner. Latest account-ID display fix committed and pushed (dc2ef11).

Completed locally (owner requested 2026-10-16): Instagram post insights and multiple Gmail accounts. Implementation is in commit 6954eec; final verification regressions and this checkpoint are follow-up changes.
The owner confirmed the deployed Socials page looks good and said the recent changes were pushed. Phase 7 is closed on that acceptance; no new live publishing/scheduling results are claimed.
The owner requested Finances next, inserted as Phase 7.1 so the remaining roadmap numbering stays stable. Implementation is locally verified in the current working tree; production migration and first real import are pending.

The owner discontinued GSD on 2026-10-16. Work proceeds directly per requested feature, with relevant tests and existing application security/approval requirements preserved.

## Verification checkpoint

- Previous full local checkpoint: 548 unit tests and production build passed; review recheck found no remaining findings.
- Account-ID display cleanup: 5 focused tests and lint passed.
- Follow-up unit checkpoint: 550 tests passed across 66 files.
- Final affected DB checkpoint: 108 tests passed across 10 files against throwaway local Postgres databases (Docker). Includes migration 0010 existing-data preservation, duplicate message-ID isolation, account-specific triage and approved sends, disconnect during sync, and Instagram metric persistence.
- Typecheck, worker bundle and production build passed; full lint has 0 errors / 19 existing warnings.
- Deploy requires migration 0010_multiple_mail_accounts before the updated web/worker. No deployment or live provider writes were performed.
- Windows sandbox test runners need TEMP/TMP under ignored test-results/vitest-tmp. Do not put test temp files in .next: next build clears that directory and causes unrelated ENOENT failures.
- Homelab database/browser tests and real publishing/scheduling acceptance remain unconfirmed. Phase 5.1 and 6 owner VM UAT also remains unconfirmed.

## Accumulated Context

### Roadmap Evolution

- Phase 03.1 inserted after Phase 3: Model routing: free OpenRouter models for routine agent work, Sonnet escalation, orchestrator stays on Opus 5.5
- Phase 04.1 inserted after Phase 4: Glass redesign (liquid-glass restyle per Claude Design LifeOS Glass files; style/layout only) (URGENT)

### Decisions

- Phase 3: owner verification runs on the homelab VM (tailscale serve HTTPS), not local dev; same-origin checks compare to BETTER_AUTH_URL

- Phase 0: ADR-001..010 accepted (see docs/decisions)
- Phase 0: GitHub integration moved into Phase 3 as end-to-end proof of the agent path
- [Phase ?]: Phase 3.1: owner enabled private-repo free-model toggle; D-09 gate otherwise escalates most repo questions (mostly-private owner); no row filtering

### Pending Todos

- Import hi-fi design from Claude Design (claude_design MCP): project faf225f7-8c4a-46ca-982e-fd969ee2f29d, files LifeOS.dc.html + support.js → design/. Design is the visual source of truth; content is placeholder.

### Blockers/Concerns

- Phase 3 review findings CR-01/CR-02/WR-01..08 fixed (03-REVIEW-FIX.md); security verified 81/81 (03-SECURITY.md). Fixes redeployed; UAT 13/13 passed on the homelab (03-UAT.md). Residual info items IN-01/03/04 open.

## Session Continuity

Last session: 2026-10-16
Stopped at: Finance agent implemented and locally verified. Next: commit/push and redeploy web/worker, then ask the orchestrator to reorganise transactions and review the resulting proposal. No real transactions/categories have been changed by this development session. Socials page accepted by the owner. Multiple Gmail accounts still require the previously documented owner live check.
Resume file: None

## Social post history follow-up (2026-10-16)

The owner reported existing posts were missing. Root cause: sync only updated already-known LifeOS variants and used a 90-day cutoff. Sync now imports the current Sydney calendar year of available Instagram posts and public TikTok videos, retaining original dates, captions/titles and links. Migration 0011 adds account-bound import identity and uniqueness. Existing approved LifeOS text is preserved, repeat syncs reuse rows, and imported source text is tainted/read-only. Missing Instagram insights does not prevent importing history; invalid tokens still require reconnect. Analytics defaults to YTD. LinkedIn prior personal posts remain unavailable with the current self-serve permissions (restricted r_member_social required).

Verification: 553 unit tests (66 files) and 35 Socials/migration DB tests (2 files) passed; focused lint, typecheck and worker build passed. The final production build also passed. No live provider calls or homelab deployment performed. Prior uncommitted verification/checkpoint edits were preserved.

## Finances checkpoint (2026-10-16)

- Owner requested direct implementation based on the private Finances.xlsx workbook; workbook read only and left unchanged. Source and fixtures contain no private transactions or workbook keyword mappings.
- Owner decisions: transfers count as income/spending; monthly category budgets carry forward with monthly overrides. Saved monthly overrides become the limit for later months until changed; clearing an override restores the prior limit.
- New owner-only `/finances` page, shared navigation, CSV preview/confirmation, atomic deduplicated imports, possible-match review, per-account history, remembered keyword categories and rules CSV upload, monthly charts, transaction filters/review, all-account budgets, confirmed import removal.
- Additive migration `0012_finances` adds categories, rules, imports, transactions and budgets. No dependency, credential, agent permission or infrastructure changes. No financial data sent to an external AI provider.
- Read-only in-memory CSV conversion of the workbook parsed all 2,086 transactions and 272 rules. Historical export requires Month displayed as `yyyy-mm` so the CSV retains its year. No real records imported into a database.
- Final unit suite: 562 tests passed across 67 files, including finance and navigation. Focused finance and migration DB tests: 15 passed. Production build and 4 desktop/mobile browser tests passed, including populated chart assertions and screenshot inspection. Typecheck passed; full lint has 0 errors and 19 pre-existing warnings.
- Verification recovery: Playwright clears `test-results` at startup, so do not run Vitest using that directory for TEMP/TMP concurrently with Playwright. The interrupted unit run was rerun separately; navigation expectation updated for the new Finances entry.
- Deployment and first owner import remain pending. See `docs/finances.md` for formats, duplicate limits, reporting semantics and homelab commands. Changes are local and uncommitted; `.codex/` remains ignored.

### Bank CSV timestamp compatibility follow-up (2026-10-16)

The owner's current bank export uses `Transaction Date` with ISO timestamps and timezone offsets. The shared date parser now accepts that format and preserves the calendar date written in the export, preventing UTC conversion from shifting a transaction's day/month. Invalid dates, clock values and timezone offsets still fail validation. All 2,242 rows in the attached CSV passed read-only parsing and the upload size limit; no records were imported. Ten focused finance unit tests passed, including timestamp regression and month-boundary checks. Production deployment remains an owner step.

### Finance agent integration (2026-10-16)

Owner explicitly requested finance agent access and category/budget edits through the orchestrator. The existing `finance` registry entry is now live with paid Sonnet by default, private READ tools for overview, paginated merchant groups and transaction details, and one composite `finance.update` HIGH_RISK proposal. The orchestrator delegates finance requests to it; it appears in the command centre and has an Ask Finance entry on `/finances`.

Full reorganisations require every current merchant page to have been read in that run. Proposals expose category definitions/replacements, rule replacement, explicit transaction corrections, monthly budget limits and changed/uncategorised/fallback counts. Owner edits recompute impact server-side. A locked snapshot rejects stale data. Execution is atomic, preserves transaction amounts/dates/imports, merges carried budgets across all monthly boundaries and uses an audit marker for retry adoption. Configuration cannot lower the write tool's HIGH_RISK floor. Finance privacy taint, like mail, crosses siblings/threads/retries and cannot be disabled by the free-private-data toggle. No new bank connection or money-movement tools.

Verified: 563 unit tests; 64 affected Finance/routing/calendar privacy/project-approval DB tests, plus the final 11-test Finance agent suite including injected-write rollback, the permission floor and budget-only changes preserving transaction categories; original 9 Finance import/budget DB tests also passed. Four Finance agent desktop/mobile browser tests passed after correcting selectors, alongside the four existing finance browser tests. Browser tests use seeded data; LLM delegation tests use scripted models. Typecheck and focused lint passed; full lint has 0 errors and 19 existing warnings. Final production and worker builds passed.

Current changes are uncommitted. Existing work preserved; `.codex/` remains local/ignored. No homelab deploy, real financial reorganisation or paid model call performed. The agent requires no migration beyond the existing finance schema and no new credentials. User-facing setup and privacy notes are in `docs/finances.md`, agent/permission contracts in `docs/agents.md` and `docs/permissions.md`.

### Finance overview charts (2026-10-17)

Owner requested All time / 3m / 6m / 1yr overview options, three adjacent trend charts and point-hover values, then category toggles in Where the money went. Added those options alongside Month; rolling ranges end in the selected month, while All time uses the complete imported history for the selected account. Totals and all overview charts share the range; transaction lists and all-account budgets stay monthly.

Owner clarified cumulative savings means transactions categorised as Savings, not income-minus-spending. Savings treatment contributions accumulate net of withdrawals. Cumulative Savings and cumulative cash flow start at zero at the selected range boundary; they do not estimate bank balances. Monthly net cash flow includes all imported movements. Missing months remain no-data for monthly flow and carry recorded cumulative totals with an explicit note.

New charts are horizontal on desktop and stack on phones. All five charts support hover, focus and touch values, plus exact-value tables/lists. The pie now lists individual categories with checked/unchecked controls, recomputed slices/selected total, and Show all/Hide all. Display filtering does not change financial records or other overview totals; net credits stay in the figures/legend without negative slices.

Verification: 12 focused finance unit tests, 10 finance DB tests and all 6 desktop/mobile finance browser tests passed; typecheck, focused lint, production build and worker bundle passed. Browser checks cover all range options, desktop horizontal layout, hover/focus/touch values, individual pie filters, Show all/Hide all, existing imports and carried budgets. Browser fixture cleanup isolates range data from all-account budget tests. No new migration, dependency, credential or production changes. Current overview edits are uncommitted; see `docs/finances.md` for range and chart semantics.
