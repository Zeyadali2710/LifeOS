---
phase: 6
slug: outreach
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-10-13
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Source: 06-RESEARCH.md "Validation Architecture". Network and worker halves (Gmail, Google Calendar writes, URL import, triage LLM) are DB tests with fakes; Playwright covers UI flows on seeded rows (Pitfall 9).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^5.0.3 (unit + DB on local Postgres :5433), @playwright/test ^1.63.0 (e2e, system Chrome) |
| **Config file** | `vitest.config.ts`, `playwright.config.ts` |
| **Quick run command** | `npx vitest run tests/unit` |
| **Full suite command** | `npx tsc --noEmit && npx eslint . && npx vitest run tests/unit tests/db && npx playwright test && bash scripts/glass-gate.sh src` |
| **Estimated runtime** | ~240 seconds (unit ~20 s, DB ~120 s, e2e ~100 s) |

---

## Sampling Rate

- **After every task commit:** `npx vitest run tests/unit` plus the touched `tests/db/<file>` (each task's `<verify>` lists it)
- **After every plan wave:** `npx vitest run tests/unit tests/db && npx tsc --noEmit`
- **Before `/gsd:verify-work`:** full suite green (plan 19 Task 1), then the owner VM run `bash scripts/vm-db-test.sh` (plan 19 Task 2)
- **Max feedback latency:** 120 seconds per task

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 6-01-01 | 01 | 1 | OUT-01/02/03 | T-06-01..04 | no body column; stage check constraint | DB | `npx vitest run tests/db/migrations.test.ts` | ✅ | ✅ green |
| 6-01-02 | 01 | 1 | OUT-02 | — | N/A | unit | `npx vitest run tests/unit/outreach-types.test.ts` | ✅ | ✅ green |
| 6-02-01 | 02 | 1 | OUT-01 | T-06-05..07 | SSRF blocked at connect time, redirects re-checked, 2 MB cap | unit | `npx vitest run tests/unit/safe-get.test.ts` | ✅ | ✅ green |
| 6-02-02 | 02 | 1 | OUT-03 | T-06-08, T-06-10 | HTML stripped, images dropped, 16 KB code-point cap | unit | `npx vitest run tests/unit/mail-text.test.ts` | ✅ | ✅ green |
| 6-02-03 | 02 | 1 | OUT-03 | T-06-09 | CR/LF header injection stripped | unit | `npx vitest run tests/unit/mail-mime.test.ts` | ✅ | ✅ green |
| 6-03-01 | 03 | 2 | OUT-01 | T-06-11 | 500/feed cap, malformed ICS fixed error | unit | `npx vitest run tests/unit/outreach-ics.test.ts tests/unit/caldav-provider.test.ts` | ✅ | ✅ green |
| 6-03-02 | 03 | 2 | OUT-01 | T-06-12..14 | JSON-LD only, no scraping, safe url | unit | `npx vitest run tests/unit/outreach-jsonld.test.ts` | ✅ | ✅ green |
| 6-04-01 | 04 | 2 | OUT-01 | — | recurring no-collapse, Sydney filter | unit | `npx vitest run tests/unit/outreach-normalize.test.ts` | ✅ | ✅ green |
| 6-04-02 | 04 | 2 | OUT-01 | T-06-15 | regex-escaped interests | unit | `npx vitest run tests/unit/outreach-score.test.ts` | ✅ | ✅ green |
| 6-05-01 | 05 | 2 | OUT-03 | T-06-17, T-06-21 | calendar-only grant survives; no gmail.modify/send | DB | `npx vitest run tests/db/google-oauth.test.ts` | ✅ | ✅ green |
| 6-05-02 | 05 | 2 | OUT-03 | T-06-18, T-06-19 | Gmail 403 -> "scope", fixed host | unit | `npx vitest run tests/unit/gmail-client.test.ts` | ✅ | ✅ green |
| 6-06-01 | 06 | 2 | OUT-02 | T-06-23..27 | ±1 conditional moves, mock refused, audit ids only | DB | `npx vitest run tests/db/outreach-pipeline.test.ts` | ✅ | ✅ green |
| 6-06-02 | 06 | 2 | OUT-02 | T-06-22 | requireOwner on every action | DB | `npx vitest run tests/db/outreach-pipeline.test.ts` | ✅ | ✅ green |
| 6-07-01 | 07 | 3 | OUT-01 | T-06-28, T-06-33 | feeds only via safeGet; fixed keyed hosts | static | `npx tsc --noEmit && npx eslint src/server/outreach` | ✅ | ✅ green |
| 6-07-02 | 07 | 3 | OUT-01 | T-06-29..32 | sync never writes owner state; per-source isolation | DB | `npx vitest run tests/db/outreach-sync.test.ts` | ✅ | ✅ green |
| 6-08-01 | 08 | 3 | OUT-03 | — | fixtures only, no real Gmail | static | `npx tsc --noEmit` | ✅ | ✅ green |
| 6-08-02 | 08 | 3 | OUT-03 | T-06-34..38 | metadata only, quota cap, Calendar not paused | DB | `npx vitest run tests/db/mail-sync.test.ts` | ✅ | ✅ green |
| 6-09-01 | 09 | 4 | OUT-01/02 | T-06-40..44 | encrypted keys/URLs, constant validation URLs | DB | `npx vitest run tests/db/outreach-actions.test.ts` | ✅ | ✅ green |
| 6-09-02 | 09 | 4 | OUT-01 | T-06-39 | requireOwner x9, no secrets logged | DB | `npx vitest run tests/db/outreach-actions.test.ts` | ✅ | ✅ green |
| 6-09-03 | 09 | 4 | OUT-01 | T-06-90 | project writes never fail on rescore | DB | `npx vitest run tests/db/outreach-actions.test.ts tests/db/project-actions.test.ts` | ✅ | ✅ green |
| 6-10-01 | 10 | 4 | OUT-01/03 | T-06-46..49 | untrusted envelope, body never stored | DB | `npx vitest run tests/db/outreach-tools.test.ts` | ✅ | ✅ green |
| 6-10-02 | 10 | 4 | OUT-03 | T-06-45, T-06-46 | hard mail taint with toggle on; content floor | DB + unit | `npx vitest run tests/db/routing-loop.test.ts tests/unit/policy.test.ts` | ✅ | ✅ green |
| 6-11-01 | 11 | 5 | OUT-03 | T-06-50 | strict triage schema; forced tool | unit | `npx vitest run tests/unit/mail-triage.test.ts tests/db/loop.test.ts` | ✅ | ✅ green |
| 6-11-02 | 11 | 5 | OUT-03 | T-06-50..55 | Haiku only, cap pause, one notification | DB | `npx vitest run tests/db/mail-triage.test.ts` | ✅ | ✅ green |
| 6-12-01 | 12 | 5 | OUT-03 | T-06-59, T-06-62 | mail_reply kind registered with the tool; locks | unit | `npx vitest run tests/unit/approval-kinds.test.ts` | ✅ | ✅ green |
| 6-12-02 | 12 | 5 | OUT-03 | T-06-56..61, T-06-91 | server-filled recipients overwrite model input; one send across every adopt branch | DB | `npx vitest run tests/db/mail-agent.test.ts` | ✅ | ✅ green |
| 6-13-01 | 13 | 5 | OUT-01/03 | T-06-63, T-06-64 | host+label / last4 only in UI | static + unit | `npx tsc --noEmit && npx vitest run tests/unit/icons.test.ts && bash scripts/glass-gate.sh src` | ✅ | ✅ green |
| 6-13-02 | 13 | 5 | OUT-01 | T-06-65 | server validation authoritative | e2e | `npx playwright test tests/e2e/settings.spec.ts` | ✅ | ✅ green |
| 6-14-01 | 14 | 6 | OUT-03 | T-06-67, T-06-70..72, T-06-92 | local archive/flag; Save-to-drafts claim race; mail-linked task titles redacted for agents | DB | `npx vitest run tests/db/mail-actions.test.ts` | ✅ | ✅ green |
| 6-14-02 | 14 | 6 | OUT-03 | T-06-68, T-06-69 | locked fields from base; text nodes only | unit + e2e | `npx vitest run tests/unit/mail-approval-draft.test.ts && npx playwright test tests/e2e/approvals.spec.ts` | ✅ | ✅ green |
| 6-15-01 | 15 | 6 | OUT-01 | — | no ciphertext selected | DB | `npx vitest run tests/db/outreach-queries.test.ts` | ✅ | ✅ green |
| 6-15-02 | 15 | 6 | OUT-01/02 | T-06-73..75 | no dangerouslySetInnerHTML; MOCK badges | static + e2e | `npx tsc --noEmit && bash scripts/glass-gate.sh src && npx playwright test tests/e2e/shell-nav.spec.ts` | ✅ | ✅ green |
| 6-16-01 | 16 | 7 | OUT-02 | — | N/A | static | `npx tsc --noEmit && bash scripts/glass-gate.sh src` | ✅ | ✅ green |
| 6-16-02 | 16 | 7 | OUT-01/02 | T-06-77, T-06-79, T-06-80 | uuid guard; isSafeUrl links | static | `npx tsc --noEmit && bash scripts/glass-gate.sh src` | ✅ | ✅ green |
| 6-16-03 | 16 | 7 | OUT-01 | T-06-78 | escaped LIKE | unit + e2e | `npx vitest run tests/unit/palette.test.ts && npx playwright test tests/e2e/palette.spec.ts` | ✅ | ✅ green |
| 6-17-01 | 17 | 8 | OUT-03 | — | no body in DTO | DB | `npx vitest run tests/db/mail-queries.test.ts` | ✅ | ✅ green |
| 6-17-02 | 17 | 8 | OUT-03 | T-06-81..83 | plain text only; validated Gmail link | static | `npx tsc --noEmit && bash scripts/glass-gate.sh src` | ✅ | ✅ green |
| 6-17-03 | 17 | 8 | OUT-02/03 | — | N/A | static + e2e | `npx tsc --noEmit && npx playwright test tests/e2e/organization.spec.ts` | ✅ | ✅ green |
| 6-18-01 | 18 | 9 | OUT-01/02/03 | T-06-85 | seeded data only | e2e | `npx playwright test tests/e2e/outreach.spec.ts` | ✅ | ✅ green |
| 6-18-02 | 18 | 9 | OUT-01/03 | T-06-86 | docs state floors and taint | static | `grep -n "free_private_ok" docs/permissions.md` | ✅ | ✅ green |
| 6-19-01 | 19 | 10 | OUT-01/02/03 | — | full local suite | all | full suite command above | ✅ | ✅ green |
| 6-19-02 | 19 | 10 | OUT-01/02/03 | T-06-87..89 | owner VM run + UAT | manual | `bash scripts/vm-db-test.sh ...` (owner) | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Test scaffolds are created inside the task that first needs them (each `<verify>` names its file):

- [x] `tests/helpers/fake-gmail.ts` + `tests/fixtures/gmail/messages.json` — plan 08 Task 1 (profile, list incl. rfc822msgid search, metadata/full get, history page + 404, drafts create/get/delete/send, 401/403/429 switches)
- [x] `tests/fixtures/outreach/{luma-sydney.ics,meetup-group.ics,eventbrite-page.html,humanitix-page.html,no-jsonld.html}` — plan 03
- [x] `safeGet` injectable `lookup` / `request` seams — plan 02 Task 1
- [x] `gmail.googleapis.com` in `tests/helpers/fake-google.ts` HOSTS — plan 05 Task 2
- [x] e2e seeds `insertOutreachEvent`, `insertMailMessage`, `insertGmailConnection`, `insertMailApproval` in `tests/e2e/owner.ts` — plan 18

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Migration 0008 on the VM + VM DB suite | OUT-01/02/03 | Owner-only VM (homelab policy) | plan 19 Task 2 steps 1-2 |
| Real Google re-consent with Gmail scopes (unverified app) | OUT-03 | Needs the owner's Google account | plan 19 Task 2 step 3 |
| Real Luma Sydney feed discovery | OUT-01 | Live third-party feed | plan 19 Task 2 step 4 |
| Real Add to calendar + real Gmail send in thread | OUT-02/03 | Live Google writes | plan 19 Task 2 steps 5, 7 |
| Eventbrite organizer listing with a private token (A1) / Luma API path (A2) | OUT-01 | Needs owner keys | OWNER-ACTIONS optional items |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 120s per task
- [x] `nyquist_compliant: true` set in frontmatter (plan 19 Task 1 after execution)

**Approval:** local gates green; owner VM run + UAT pending (OWNER-ACTIONS.md)
