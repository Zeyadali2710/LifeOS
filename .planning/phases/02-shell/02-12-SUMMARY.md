---
phase: 02-shell
plan: 12
subsystem: shell
tags: [notifications, drawer, snooze, e2e]
requires: [02-02, 02-04, 02-05, 02-08, 02-10]
provides: [NotificationsDrawer, NotificationRow, SnoozeMenu, CATEGORY_META]
key-files:
  created: [src/shell/notification-meta.ts, src/shell/notification-row.tsx, src/shell/snooze-menu.tsx, src/shell/notifications-drawer.tsx, tests/e2e/notifications.spec.ts]
  modified: [src/shell/app-shell.tsx]
decisions:
  - Snooze/dismiss remove the row optimistically, then refetch so nextWake is rescheduled
requirements: [SHL-05]
metrics:
  completed: 2026-10-08
---

# Phase 2 Plan 12: Notifications drawer Summary

Right-side drawer (full sheet on mobile) with NOW/TODAY/EARLIER grouping, category filter, optimistic read/unread, snooze menu (1 hour / Tonight / Tomorrow, Sydney), dismiss, mark all read, and an Open action gated by isSafePath.

## Commits
- 2bebef5 feat: notification meta, row and snooze menu
- ef8e25f feat: drawer mounted in shell
- test commit: notifications e2e

## Verification
- typecheck clean; `eslint src tests` 0 errors (2 accepted location.assign warnings); vitest 71 passed (18 files).
- `npx playwright test notifications --workers=1`: 11 passed, 3 skipped (project-specific tests), desktop and mobile. Covers live badge increment, NOW + tag, read/unread, dismiss persisting across reload, keyboard snooze + toast, snoozed-until-3s reappearance, safe Open navigation, unsafe `//evil.example` has no Open, filter, mark all read, Esc focus return, mobile sheet and More entry.

## Deviations
- [Rule 1] SnoozeMenu anchor held in state (button element) rather than a ref read during render, to satisfy react-hooks/refs.
- Test notes: toast text is prefixed by its icon glyph name, so toast assertions are not `^`-anchored.

## Known Stubs
None.

## Self-Check: PASSED
