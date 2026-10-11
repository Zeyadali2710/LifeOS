---
phase: 4
slug: organization
status: awaiting-owner-vm
nyquist_compliant: true
wave_0_complete: true
created: 2026-10-09
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^5.0.3 (unit + db), Playwright (e2e, VM only) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/unit` |
| **Full suite command** | `npm test && npm run typecheck && npm run lint` |
| **Estimated runtime** | ~60 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/unit` plus the touched test file
- **After every plan wave:** Run `npm test && npm run typecheck && npm run lint`
- **Before `/gsd:verify-work`:** Full suite must be green, plus owner VM UAT (real Google + iCloud connect, create/edit/delete incl. recurring)
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

Filled by the planner. Task IDs and threat refs are assigned in PLAN.md files. The requirement-to-test map comes from 04-RESEARCH.md:

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 04-01-T1 | 04-01 | 1 | ORG-02 | T-04-01, T-04-02 | Locked fields per kind, schema per tool | unit | `npx vitest run tests/unit/approval-kinds.test.ts` | ✅ | ✅ green |
| 04-01-T2 | 04-01 | 1 | ORG-02 | T-04-01, T-04-03 | GitHub approval flow unchanged; ProviderError mapped | db | `npx vitest run tests/db/approvals.test.ts tests/db/approval-actions.test.ts tests/db/github-tools.test.ts tests/db/gateway.test.ts` | ✅ | ✅ green |
| 04-02-T1 | 04-02 | 2 | ORG-02 | T-04-61 | Kind-tagged DTO, event kinds private | unit | `npx vitest run tests/unit/agent-dto.test.ts` | ✅ | ✅ green |
| 04-03-T2 | 04-03 | 1 | ORG-01 | T-04-SC, T-04-05 | Deps only after legitimacy sign-off; optional Google env | unit | `npx vitest run tests/unit/env.test.ts` | ✅ | ✅ green |
| 04-04-T1 | 04-04 | 1 | ORG-03 | T-04-08 | N/A | unit | `npx vitest run tests/unit/conflicts.test.ts tests/unit/plan.test.ts` | ✅ | ✅ green |
| 04-05-T1 | 04-05 | 1 | ORG-01 | T-04-09 | isSafeUrl https-only | unit | `npx vitest run tests/unit/safe-url.test.ts tests/unit/icons.test.ts` | ✅ | ✅ green |
| 04-06-T2 | 04-06 | 2 | ORG-01..03 | T-04-12 | Unique keys, cascade on disconnect | db | `npx vitest run tests/db/migrations.test.ts tests/db/schema-organization.test.ts` | ✅ | ✅ green (VM) |
| 04-06-T3 | 04-06 | 2 | ORG-01..03 | T-04-12 | 0003 applied on VM; DB suites on throwaway test Postgres | db (VM) | `bash scripts/vm-db-test.sh tests/db/migrations.test.ts tests/db/schema-organization.test.ts tests/db/approvals.test.ts tests/db/approval-actions.test.ts tests/db/github-tools.test.ts tests/db/gateway.test.ts` | ✅ | ✅ green |
| 04-07-T1 | 04-07 | 2 | ORG-01 | T-04-14 | Bounded expansion | unit | `npx vitest run tests/unit/expand.test.ts` | ✅ | ✅ green |
| 04-07-T2 | 04-07 | 2 | ORG-02 | T-04-13 | ICS built via setters (CRLF-safe) | unit | `npx vitest run tests/unit/recurrence-edit.test.ts` | ✅ | ✅ green |
| 04-08-T1/T2 | 04-08 | 3 | ORG-01 | T-04-16, T-04-17 | Secrets encrypted, never in DTO/audit; rotation overwrites the stored secret (D-05) | db | `npx vitest run tests/db/calendar-store.test.ts` | ✅ | ✅ green |
| 04-09-T1/T2 | 04-09 | 3 | ORG-01, ORG-03 | T-04-19 | DTOs carry display fields only | db | `npx vitest run tests/db/calendar-queries.test.ts` | ✅ | ✅ green |
| 04-10-T1 | 04-10 | 3 | ORG-03 | T-04-23 | Signal frames carry ids only | db | `npx vitest run tests/db/hub.test.ts` | ✅ | ✅ green |
| 04-10-T2 | 04-10 | 3 | ORG-03 | T-04-21 | Owner-guarded task actions | db | `npx vitest run tests/db/tasks.test.ts` | ✅ | ✅ green |
| 04-10-T3 | 04-10 | 3 | ORG-03 | T-04-22 | Reminder fires exactly once | db | `npx vitest run tests/db/task-reminders.test.ts` | ✅ | ✅ green |
| 04-11-T1/T2 | 04-11 | 4 | ORG-01, ORG-02 | T-04-26, T-04-28, T-04-29 | Least-privilege scopes, fixed hosts, idempotent create | unit | `npx vitest run tests/unit/google-client.test.ts tests/unit/google-provider.test.ts` | ✅ | ✅ green |
| 04-11-T3 | 04-11 | 4 | ORG-01 | T-04-24, T-04-25, T-04-27 | OAuth state + PKCE, owner-only callback, encrypted tokens | db | `npx vitest run tests/db/google-oauth.test.ts` | ✅ | ✅ green |
| 04-12-T1 | 04-12 | 4 | ORG-01, ORG-02 | T-04-31, T-04-32, T-04-33 | icloud.com host pinning, If-Match, size caps | unit | `npx vitest run tests/unit/caldav-provider.test.ts` | ✅ | ✅ green |
| 04-12-T2 | 04-12 | 4 | ORG-01 | T-04-30 | App password encrypted, never returned | db | `npx vitest run tests/db/icloud-connect.test.ts` | ✅ | ✅ green |
| 04-13-T1 | 04-13 | 4 | ORG-01 | T-04-36, T-04-37 | Meaningful-only activity, cursor after persist | db | `npx vitest run tests/db/calendar-sync.test.ts` | ✅ | ✅ green |
| 04-13-T2 | 04-13 | 4 | ORG-01 | T-04-35 | Auth failure pauses sync, one RECONNECT notification | db | `npx vitest run tests/db/calendar-sync-auth.test.ts` | ✅ | ✅ green |
| 04-14-T1 | 04-14 | 5 | ORG-01 | — | N/A | db | `npx vitest run tests/db/calendar-sync-google.test.ts tests/db/calendar-sync-caldav.test.ts` | ✅ | ✅ green |
| 04-14-T2/T3 | 04-14 | 5 | ORG-02, ORG-03 | T-04-38, T-04-39, T-04-40 | Owner UI writes audit-logged; stale etag refused | db | `npx vitest run tests/db/calendar-actions.test.ts` | ✅ | ✅ green |
| 04-15-T1 | 04-15 | 6 | ORG-01 | T-04-43 | Owner-guarded settings actions | db | `npx vitest run tests/db/calendar-settings-actions.test.ts` | ✅ | ✅ green |
| 04-16-T1 | 04-16 | 6 | ORG-01 | — | N/A | unit | `npx vitest run tests/unit/org-layout.test.ts` | ✅ | ✅ green |
| 04-17-T1 | 04-17 | 6 | ORG-02 | T-04-47, T-04-48, T-04-49 | No provider call before APPROVE; delete is HIGH_RISK floor | db | `npx vitest run tests/db/calendar-tools.test.ts` | ✅ | ✅ green |
| 04-17-T2 | 04-17 | 6 | Security | T-04-50, T-04-51 | Calendar tool output taints run; no secrets in tool output | db | `npx vitest run tests/db/calendar-privacy.test.ts` | ✅ | ✅ green |
| 04-18-T1 | 04-18 | 6 | ORG-03 | T-04-52 | N/A | unit | `npx vitest run tests/unit/plan-skips.test.ts` | ✅ | ✅ green |
| 04-20-T1 | 04-20 | 7 | ORG-02 | T-04-57 | Same-origin result links | unit | `npx vitest run tests/unit/agent-dto.test.ts` | ✅ | ✅ green |
| 04-21-T1 | 04-21 | 8 | ORG-01 | T-04-58 | Owner-guarded palette search | unit | `npx vitest run tests/unit/palette.test.ts` | ✅ | ✅ green |
| 04-21-T2 | 04-21 | 8 | UI | — | N/A | e2e (VM) | `npx playwright test tests/e2e/organization.spec.ts` | ✅ | ✅ green |

UI-only tasks without their own test (04-02-T2, 04-05-T2, 04-15-T2/T3, 04-16-T2/T3, 04-18-T2, 04-19-T1..T3, 04-20-T2/T3, 04-22) verify with `npm run typecheck && npm run lint` (04-19-T3 adds `npm run build`; 04-22 uses greps) and are covered by 04-21-T2 e2e and the owner VM checkpoint 04-21-T3.

DB mechanism: from the 04-06 gate on, every `tests/db/*` command runs against a separate throwaway test Postgres on the VM via `ssh <vm_ssh> "cd ~/lifeos && git pull -q && bash scripts/vm-db-test.sh <files>"` (alias recorded in 04-06-SUMMARY; owner-run with the same command if no SSH). Never against the production database. Wave 1 DB regression suites run at the gate.

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky. Unit rows green locally; DB rows green on the VM (38 files / 206 tests); e2e green (73 passed, 16 skipped, 0 failed).*

---

## Wave 0 Requirements

- [x] `tests/fixtures/calendar/`: Google events JSON (single, recurring master, exception, cancelled, all-day) and iCloud ICS (recurring with EXDATE and RECURRENCE-ID, VTIMEZONE, floating, all-day)
- [x] Fake `CalendarProvider` (labelled mock, tests only)
- [x] Test files listed above (no new framework needed)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real Google OAuth connect + sync | ORG-01 | Needs real Google account and tailnet redirect URI; owner tests only on VM | On VM: connect Google in Settings, confirm events appear in Day/Week/Month |
| Real iCloud CalDAV connect + sync | ORG-01 | Needs app-specific password | On VM: connect iCloud, confirm events appear alongside Google |
| Recurring create/edit/delete round-trip on real providers | ORG-02 | Provider behaviour can't be fully faked | Approve agent write; edit "this / following / all"; confirm in Google/iCloud apps |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** signed off by owner 2026-10-12 (04-21-T3 live verification on the VM)
