---
phase: 06-outreach
plan: 18
subsystem: outreach-e2e-and-docs
tags: [e2e, playwright, docs, outreach, gmail]
requires: [06-13, 06-14, 06-16, 06-17]
provides: [outreach-e2e, outreach-docs]
key-files:
  modified:
    - tests/e2e/owner.ts
    - tests/e2e/outreach.spec.ts
    - tests/e2e/agents.spec.ts
    - docs/integrations.md
    - docs/agents.md
    - docs/permissions.md
    - docs/database.md
requirements-completed: [OUT-01, OUT-02, OUT-03]
completed: 2026-10-13
---

# Phase 6 Plan 18: Outreach e2e and documentation Summary

Seeded-data Playwright coverage for the pipeline, mock limits, triaged mail, the edit-and-approve mail_reply flow and the /approvals mail card, plus the Outreach sections of the four docs.

## Commits
- 244f08c test(06-18): outreach e2e on seeded events, mail and mail_reply approvals
- bfb4dce docs(06-18): outreach sources, Gmail scopes, agent, permissions and tables
- test(06-18): agents list e2e expects Outreach live (7 not connected)

## What was built
- `owner.ts` seeds: `insertOutreachEvent`, `insertMailMessage`, `insertGmailConnection` (dummy ciphertext, Gmail scopes), `insertMailApproval`, with matching cleanup (`deleteOutreachEvent`, `deleteMailMessage`, `removeGmailConnection`; approvals via `deleteApprovalRun`). No real tokens or hosts (example.test addresses).
- `outreach.spec.ts` extended (the four 06-16 smoke tests kept): Save -> Interested -> Attend on the card, Mark attended and Follow up dialog (prefilled `Follow up: {title}`), task shows in FOLLOW-UPS as `From event · {title}`; mock event shows MOCK with a disabled Calendar cell and `Mock events can't go on your calendar.`; triaged mail summary and action item, Add as task, `From email · {subject} · Lee Direct` in FOLLOW-UPS; pending mail_reply edited (body) and sent from EmailDetail with To read-only, stored approval reads back approved with the edited body and original `to`; `/approvals?id=` shows the untrusted note and SEND REPLY. 9 tests x 2 projects.
- Docs: Outreach sources table (real vs MOCK), Luma Sydney feed how-to, SSRF guard and 2 MB cap, cadences, least-privilege Gmail scopes (readonly + compose, unverified-app click-through, 100-user cap), metadata-only storage, 404 full resync; Outreach agent and tools, triage job and cap pause; tool tiers, content floor, hard mail taint ignoring `ai.free_private_ok`, locked-recipient mail_reply approval and idempotent send; new tables, columns, migration 0008 and settings keys.

## Deviations from Plan
- [Rule 1 - Bug] `tests/e2e/agents.spec.ts` still asserted 8 "Not connected" agents; the Outreach agent went live in 06-10, so it failed in the full run (7 received, desktop and mobile). Updated to 7 and added an Outreach-is-connected assertion. Deterministic, not a flake; re-ran the spec (6 passed) and then the full suite.

## Verification
- `npx tsc --noEmit`, `npx eslint .` (0 errors, 19 pre-existing warnings), glass gate: clean.
- `npx vitest run tests/unit`: 50 files, 453 tests passed.
- `npx vitest run tests/db`: 55 files, 430 tests passed.
- `npx playwright test tests/e2e/outreach.spec.ts`: 18 passed.
- Full `npx playwright test`: first run 110 passed, 16 skipped, 2 failed (agents.spec stale count, both projects); after the fix and a fresh full run: 112 passed, 16 skipped, 0 failed (skips are viewport-specific tests by design).

## Owner actions
- Optional: read the new docs sections once; a real Gmail connect, Draft with agent and Send reply round trip is only verifiable on the VM (e2e never reaches Google or an LLM).

## Known Stubs
None.

## Self-Check: PASSED
