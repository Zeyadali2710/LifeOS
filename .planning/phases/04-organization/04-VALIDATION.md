---
phase: 4
slug: organization
status: draft
nyquist_compliant: false
wave_0_complete: false
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
| TBD | TBD | TBD | ORG-01 | — | N/A | db | `npx vitest run tests/db/calendar-sync-google.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | ORG-01 | — | N/A | db | `npx vitest run tests/db/calendar-sync-caldav.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | ORG-01 | — | N/A | unit | `npx vitest run tests/unit/expand.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | ORG-01 | — | Auth failure pauses sync, one RECONNECT notification | db | `npx vitest run tests/db/calendar-sync-auth.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | ORG-02 | — | No provider call before APPROVE; delete is HIGH_RISK floor | db | `npx vitest run tests/db/calendar-tools.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | ORG-02 | — | N/A | unit | `npx vitest run tests/unit/recurrence-edit.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | ORG-02 | — | GitHub approval flow unchanged | db | existing `approvals*.test.ts` | ✅ | ⬜ pending |
| TBD | TBD | TBD | ORG-02 | — | Owner UI writes audit-logged | db | `npx vitest run tests/db/calendar-actions.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | ORG-03 | — | N/A | unit | `npx vitest run tests/unit/conflicts.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | ORG-03 | — | N/A | unit | `npx vitest run tests/unit/plan.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | ORG-03 | — | N/A | db | `npx vitest run tests/db/task-reminders.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | ORG-03 | — | N/A | db | `npx vitest run tests/db/tasks.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | Security | — | Token never in DTO/log/tool output; calendar tool output taints run | db | `npx vitest run tests/db/calendar-privacy.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | UI | — | N/A | e2e (VM) | `npx playwright test tests/e2e/organization.spec.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/fixtures/calendar/`: Google events JSON (single, recurring master, exception, cancelled, all-day) and iCloud ICS (recurring with EXDATE and RECURRENCE-ID, VTIMEZONE, floating, all-day)
- [ ] Fake `CalendarProvider` (labelled mock, tests only)
- [ ] Test files listed above (no new framework needed)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real Google OAuth connect + sync | ORG-01 | Needs real Google account and tailnet redirect URI; owner tests only on VM | On VM: connect Google in Settings, confirm events appear in Day/Week/Month |
| Real iCloud CalDAV connect + sync | ORG-01 | Needs app-specific password | On VM: connect iCloud, confirm events appear alongside Google |
| Recurring create/edit/delete round-trip on real providers | ORG-02 | Provider behaviour can't be fully faked | Approve agent write; edit "this / following / all"; confirm in Google/iCloud apps |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
