---
phase: 02-shell
fixed_at: 2026-10-08T09:15:00Z
review_path: .planning/phases/02-shell/02-REVIEW.md
iteration: 1
findings_in_scope: 9
fixed: 9
skipped: 0
status: all_fixed
---

# Phase 02: Code Review Fix Report

**Fixed at:** 2026-10-08T09:15:00Z
**Source review:** .planning/phases/02-shell/02-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 9 (CR-01, WR-01 to WR-08)
- Fixed: 9 (CR-01 was fixed earlier in cb7e6df; 8 warnings fixed in this run)
- Skipped: 0

## Fixed Issues

### CR-01: `isSafePath` bypassed with a tab or newline: open redirect after login

**Files modified:** `src/lib/safe-url.ts` (plus tests)
**Commit:** cb7e6df (before this run)
**Applied fix:** Control characters are rejected. Not redone here.

### WR-01: Anyone can forge "owner signed out" audit rows and activity items

**Files modified:** `src/server/auth.ts`, `tests/e2e/auth.spec.ts`
**Commit:** 4325053
**Applied fix:** The `after` hook now skips `/sign-out` unless the request carries a validly signed session cookie (`ctx.getSignedCookie`). A cookie that is merely present is not enough, because it can be forged. Two e2e checks were added. One confirms that unauthenticated and forged-cookie sign-outs write no audit row. Before the fix, this check found 2 rows. The other confirms that a real UI sign-out still writes one.

### WR-02: Sign-out ignores failure

**Files modified:** `src/shell/shell-provider.tsx`, `src/app/(os)/sign-out.tsx`, `tests/e2e/auth.spec.ts`
**Commit:** 7c7e9d7
**Applied fix:** `signOut` treats both `{ error }` and a thrown error as failure. On failure it shows the toast "Couldn't sign out. Try again." and does not navigate. The Settings button now uses `useShell().signOut`, which also resolves IN-01. An e2e test makes `/api/auth/sign-out` return 500 and checks that the toast appears and the user stays on `/settings`.

### WR-03: SSE client retries forever after session expiry

**Files modified:** `src/shell/live-provider.tsx`, `tests/e2e/live-activity.spec.ts`
**Commit:** 2080ad8
**Applied fix:** The EventSource `error` handler now awaits `refetchNotifications()` before it schedules a reconnect. That call already redirects to `/login` on a 401. An e2e test sets `/api/events` to return 401, revokes the session row in the database, and expects a redirect to `/login`. Before the fix, this test timed out.

### WR-04: Optimistic rollback to an old list; resync drops live arrivals

**Files modified:** `src/shell/live.ts`, `src/shell/live-provider.tsx`, `src/shell/notification-row.tsx`, `src/shell/notifications-drawer.tsx`, `tests/unit/live.test.ts`
**Commit:** 7def112
**Applied fix:**
- A failed row action now restores only that item with `restoreItem`.
- A failed "mark all read" clears only the `readAt` timestamp it set.
- `refetchNotifications` applies the snapshot with `applySnapshot`. It keeps items whose ids arrived over SSE while the fetch was in flight, which is precise even when the snapshot is empty.
- Unit tests were added for both helpers.

### WR-05: Alt+digit and Ctrl+, fire while typing

**Files modified:** `src/shell/shortcuts.ts`, `tests/unit/shortcuts.test.ts`, `tests/e2e/palette.spec.ts`
**Commit:** 795b87f
**Applied fix:** `matchShortcut` returns null for `nav` actions when the event target is inside an input, textarea, select or contenteditable element. Ctrl+K, Ctrl+J and Escape still work from fields. The palette e2e test used to press Alt+2 while the AI textarea had focus. It now checks that this does not navigate, then blurs the field and checks that Alt+2 does navigate.

### WR-06: Database outage crashes the shell with no styled error page

**Files modified:** `src/app/error.tsx` (new), `src/server/health.ts`
**Commit:** 014053b
**Applied fix:** A new root `error.tsx` sits above the `(os)` layout and the login page. It shows fixed "LIFEOS OFFLINE / LifeOS can't reach its database." copy with a TRY AGAIN button wired to `retry`. `checkHealth` now catches a failed heartbeat read and reports the worker as `unknown`.
**Status:** fixed, requires human verification. I checked it manually against a production build pointed at an unreachable database, using a validly signed fake session cookie: `/` returned 500 and the browser rendered the new offline page. Observation: better-auth sometimes reports the database failure as "no session", and then the user is sent to `/login` instead. That is better-auth behaviour and was left unchanged. No `global-error.tsx` was added, because the root layout does no data access; add one if it ever does.

### WR-07: Unread badge and "Mark all read" use a list capped at 100

**Files modified:** `src/shell/live-provider.tsx`, `src/shell/notifications-drawer.tsx`
**Commit:** 326d1f6
**Applied fix:** The provider stores `hiddenUnread = snap.unread - unreadOf(snap.items)`, which is the number of unread items past the cap. `unread` is now `unreadOf(list) + hiddenUnread`. A successful "mark all read" refetches to reset the count. There is no e2e test with more than 100 rows, because desktop and mobile share the e2e database.

### WR-08: SSE payloads cast without validation

**Files modified:** `src/shell/live.ts`, `src/shell/live-provider.tsx`, `tests/unit/live.test.ts`
**Commit:** be6e0f4
**Applied fix:** `isNotification` now requires the category to be in `NOTIFICATION_CATEGORIES`, and it is exported. A new `isActivity` guard checks the fields, the tone and the health shape. Both guards run on SSE frames and on `/api/activity` resync items, and invalid entries are dropped. The suggested `CATEGORY_META.FYI` fallback in `NotificationRow` was not added, because rows can no longer receive an unknown category. Unit tests were added.

---

Note: this run worked directly in the main working tree instead of an isolated worktree. The e2e and test runs need the repo's `node_modules` and the configured lifeos_e2e setup. Each fix was staged by explicit path; `next.config.ts` and `.planning/config.json` were left untouched.

_Fixed: 2026-10-08T09:15:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
