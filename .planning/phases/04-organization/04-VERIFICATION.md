---
phase: 04-organization
verified: 2026-10-12T00:00:00Z
status: human_needed
score: 3/3 must-haves verified
human_verification:
  - test: "iCloud shared/read-only calendar shows as read-only (CR-A03 privilege-set parsing)"
    expected: "Shared read-only iCloud calendar is read-only in Settings/UI; writes are refused"
    why_human: "Parsing never run against live iCloud since the fix"
  - test: "Recurring edits 'All events' and 'This and following' on real Google + iCloud calendars (CR-A01/A02, CR-B01/B02)"
    expected: "Series shifts/edits correctly in the Google and iCloud apps; Repeat select appears for simple series; detail sheet shows the real rule"
    why_human: "Recurring-edit logic changed after the owner's live sign-off; provider behaviour cannot be faked"
  - test: "Agent create/edit time validation (CR-A04) with an approved agent write"
    expected: "Invalid times are rejected; valid ones run after approval"
    why_human: "Post-review change not re-verified live"
  - test: "Keyboard focus and screen-reader navigation on the calendar grids"
    expected: "Arrow/tab navigation works and focus is visible"
    why_human: "Interaction check"
---

# Phase 04: Organization Verification Report

**Phase Goal:** Calendars and tasks live in LifeOS: Google + iCloud events in one view, tasks and reminders alongside, with conflicts flagged and free time suggested.
**Status:** human_needed (automated checks pass, no gaps)
**Re-verification:** No, initial verification

## Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Google + iCloud events appear together in day/week/month via CalendarProvider | VERIFIED | `src/server/calendar/{providers,types}.ts`, `google/provider.ts` (263 lines), `caldav/provider.ts` (294), `sync.ts`, `queries.ts`, `expand.ts`; UI `src/organization/{organization-view,time-grid,month-grid}.tsx` with day/week/month switching; `calendar-sync` worker job. Owner live-verified with real accounts (04-21-T3). |
| 2 | Event create/edit/delete (incl. recurring): owner UI direct + audit-logged; agent create/edit APPROVE, agent delete HIGH_RISK | VERIFIED | `events.ts` writes through providers and inserts `auditLog` (actor, approvalId); `recurrence-edit.ts` (250 lines); `agents/tools/calendar.ts` declares `calendar.create_event` and `calendar.update_event` as `tier: "APPROVE"` and `calendar.delete_event` as `tier: "HIGH_RISK"`; `agents/approvals.ts` executes approved calls with approvalId passed to the audit; tests `calendar-tools`, `approvals`, `approval-actions` green. |
| 3 | Tasks/reminders created and completed; overlaps flagged; scheduling suggestions | VERIFIED | `tasks.ts`/`task-actions.ts` (audited), `tasks-card.tsx`, `task-dialog.tsx`, `worker/jobs/task-reminders.ts`; `conflicts.ts` and `free-slots.ts` consumed by `plan.ts` and `plan-card.tsx`; tests `tasks`, `task-reminders`, `conflicts` green. |

**Score:** 3/3

## Behavioral Spot-Checks (re-run by verifier)

| Check | Result | Status |
|-------|--------|--------|
| `npx vitest run tests/unit` | 33 files, 262/262 | PASS |
| `npx vitest run tests/db` (throwaway Postgres, port 5433) | 38 files, 216/216 | PASS |

Playwright (74 passed / 16 skipped / 0 failed) and typecheck are as reported in 04-REVIEW-FIX.md and were not re-run.

## Requirements Coverage

| Requirement | Plans | Status | Evidence |
|-------------|-------|--------|----------|
| ORG-01 | many (19 plan references) | SATISFIED | Truth 1 |
| ORG-02 | many (15 references) | SATISFIED | Truth 2 |
| ORG-03 | many (12 references) | SATISFIED | Truth 3 |

No orphaned requirements: REQUIREMENTS.md maps only ORG-01..03 to this phase, and all three appear in plan frontmatter. Note the REQUIREMENTS.md checkboxes are still unchecked and should be ticked.

## Anti-Patterns

No TBD/FIXME/XXX markers in the calendar/task/approval source. Review findings: 04-REVIEW-FIX.md reports 53 fixed, 1 skipped (IN-B05, not a bug), and IN-C02 partially fixed (race fixed with an advisory lock; unique index deferred to the next migration). This is a minor warning, not a blocker.

## Human Verification Required

The code review fixes changed recurring-edit, iCloud read-only detection, and agent time validation logic after the owner's live sign-off. Those are listed in the frontmatter. The recurring edits and iCloud read-only checks are the ones I judge necessary. The keyboard-focus check is lower priority.

## Gaps Summary

None. Each success criterion has implementation, wiring, and passing tests. Only the post-review live re-check remains.

_Verified: 2026-10-12_
_Verifier: Claude (gsd-verifier)_
