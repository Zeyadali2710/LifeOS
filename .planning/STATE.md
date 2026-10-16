---
milestone: v1.0
status: locally_verified_pending_deployment
last_updated: 2026-10-16
workflow: direct feature development (owner requested; GSD discontinued)
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-10-07)

**Core value:** Know what matters, what needs attention, and what to do next — in one place.
**Current focus:** Year-to-date social post history imports; Phase 8 not started.

## Current Position

Phase 7: all seven implementation plans completed and review findings fixed.
LinkedIn, Instagram and TikTok connected by the owner. Latest account-ID display fix committed and pushed (dc2ef11).

Completed locally (owner requested 2026-10-16): Instagram post insights and multiple Gmail accounts. Implementation is in commit 6954eec; final verification regressions and this checkpoint are follow-up changes.
Next phase: Knowledge + Goals (Phase 8), not scoped or started.

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
Stopped at: Historical post import implemented and locally verified. Next: deploy including migration 0011, choose Socials → Sync now, and verify existing Instagram/TikTok posts in Published and YTD analytics. Multiple Gmail accounts still require the previously documented owner live check.
Resume file: None

## Social post history follow-up (2026-10-16)

The owner reported existing posts were missing. Root cause: sync only updated already-known LifeOS variants and used a 90-day cutoff. Sync now imports the current Sydney calendar year of available Instagram posts and public TikTok videos, retaining original dates, captions/titles and links. Migration 0011 adds account-bound import identity and uniqueness. Existing approved LifeOS text is preserved, repeat syncs reuse rows, and imported source text is tainted/read-only. Missing Instagram insights does not prevent importing history; invalid tokens still require reconnect. Analytics defaults to YTD. LinkedIn prior personal posts remain unavailable with the current self-serve permissions (restricted r_member_social required).

Verification: 553 unit tests (66 files) and 35 Socials/migration DB tests (2 files) passed; focused lint, typecheck and worker build passed. The final production build also passed. No live provider calls or homelab deployment performed. Prior uncommitted verification/checkpoint edits were preserved.
