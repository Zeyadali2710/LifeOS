---
phase: 02-shell
reviewed: 2026-10-08T00:00:00Z
depth: standard
files_reviewed: 75
files_reviewed_list:
  - eslint.config.mjs
  - scripts/fetch-symbols.mjs
  - src/instrumentation.ts
  - src/app/(os)/layout.tsx
  - src/app/(os)/page.tsx
  - src/app/(os)/template.tsx
  - src/app/(os)/loading.tsx
  - src/app/(os)/error.tsx
  - src/app/(os)/sign-out.tsx
  - src/app/(os)/agents/page.tsx
  - src/app/(os)/approvals/page.tsx
  - src/app/(os)/career/page.tsx
  - src/app/(os)/goals/page.tsx
  - src/app/(os)/knowledge/page.tsx
  - src/app/(os)/organization/page.tsx
  - src/app/(os)/outreach/page.tsx
  - src/app/(os)/projects/page.tsx
  - src/app/(os)/settings/page.tsx
  - src/app/(os)/socials/page.tsx
  - src/app/api/activity/route.ts
  - src/app/api/events/route.ts
  - src/app/api/notifications/route.ts
  - src/app/globals.css
  - src/app/layout.tsx
  - src/app/login/login-form.tsx
  - src/app/login/page.tsx
  - src/lib/live-types.ts
  - src/lib/safe-url.ts
  - src/scripts/migrate.ts
  - src/worker/index.ts
  - src/server/auth-events.ts
  - src/server/auth.ts
  - src/server/events.ts
  - src/server/home.ts
  - src/server/hub.ts
  - src/server/monitor.ts
  - src/server/notification-actions.ts
  - src/server/notifications.ts
  - src/server/time.ts
  - src/server/weather.ts
  - src/shell/activity-list.tsx
  - src/shell/ai-panel.tsx
  - src/shell/app-shell.tsx
  - src/shell/bottom-bar.tsx
  - src/shell/command-bar.tsx
  - src/shell/domain-page.tsx
  - src/shell/live-provider.tsx
  - src/shell/live.ts
  - src/shell/more-sheet.tsx
  - src/shell/nav.ts
  - src/shell/notification-meta.ts
  - src/shell/notification-row.tsx
  - src/shell/notifications-drawer.tsx
  - src/shell/palette-items.ts
  - src/shell/palette.tsx
  - src/shell/shell-provider.tsx
  - src/shell/shortcuts.ts
  - src/shell/sidebar.tsx
  - src/shell/snooze-menu.tsx
  - src/shell/system-tile.tsx
  - src/shell/toast.tsx
  - src/shell/top-bar.tsx
  - src/shell/use-dialog.ts
  - src/ui/badge.tsx
  - src/ui/button.tsx
  - src/ui/empty-state.tsx
  - src/ui/icon-names.ts
  - src/ui/icon.tsx
  - src/ui/inline-error.tsx
  - src/ui/kbd.tsx
  - src/ui/page-header.tsx
  - src/ui/section-header.tsx
  - src/ui/skeleton.tsx
  - src/ui/status-tile.tsx
  - tests/db/helpers.ts
  - tests/e2e/owner.ts
findings:
  critical: 1
  warning: 8
  info: 6
  total: 15
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-10-08
**Depth:** standard
**Files Reviewed:** 75
**Status:** issues_found

## Summary

I reviewed the shell, the live pipeline (LISTEN hub, SSE route, LiveProvider), the notification actions and API routes, the monitor and worker hooks, auth event emission, and the UI primitives, comparing diff `cf1bdb6..HEAD`.

Things that hold up:
- Every API route checks `getSession`, and every server action calls `requireOwner()` before it parses input.
- The SSE route clears its ping and max-lifetime timers and unsubscribes from the hub on abort, cancel and enqueue failure.
- The hub reconnects with backoff, ignores errors from dead clients, and guards against handling the same lost connection twice.
- Activity rows contain only fixed text. No email, IP or user agent reaches the feed.
- `error.tsx` correctly uses the `retry` prop from Next 16.4.

Problems found:
- **One blocker:** `isSafePath` lets an open redirect through. Browsers strip tab and newline characters when parsing URLs, so `/\t/evil.com` passes the check and then resolves to `//evil.com`. This affects the post-login redirect.
- **Main warnings:**
  - Anyone, without signing in, can create audit rows and activity items that say the owner signed out.
  - Sign-out ignores failures.
  - The SSE client keeps retrying forever after a 401 and never sends the user to the login page.
  - When an optimistic notification update fails, it rolls back to an old copy of the list.
  - The Alt+digit shortcuts also fire while the user is typing in a text field.

## Critical Issues

### CR-01: `isSafePath` bypassed with a tab or newline: open redirect after login

**File:** `src/lib/safe-url.ts:2-4` (used by `src/app/login/page.tsx:12-13`, `src/app/login/login-form.tsx:30`, `src/shell/notification-row.tsx:52-55`)
**Issue:** The check only looks for a leading `/`, a leading `//` and backslashes. The WHATWG URL parser removes ASCII tab, LF and CR anywhere in the input. So `next=/%09/evil.com` decodes to `"/\t/evil.com"`, which passes `isSafePath`, yet `new URL("/\t/evil.com", origin)` gives `https://evil.com/` (checked with Node). There are two ways in:
1. `LoginForm` calls `router.replace(next)` after a successful sign-in. The app router treats the result as an external URL and does a full navigation to the attacker's host. This is a phishing path: sign in, then land on a fake "session expired, enter your password" page.
2. `LoginPage` calls `redirect(target)` for a user who is already signed in. The `Location` header is resolved the same way.

The same check also gates `actionUrl` on notifications.
**Fix:**
```ts
export function isSafePath(p: string | null | undefined): p is string {
  if (!p || !p.startsWith("/") || /[\x00-\x1f\x7f\\]/.test(p)) return false;
  try {
    const base = "http://local.invalid";
    return new URL(p, base).origin === base;
  } catch {
    return false;
  }
}
```
Add test cases for `"/\t/evil.com"`, `"/\n/evil.com"` and `"/\r//evil.com"`.

## Warnings

### WR-01: Anyone can forge "owner signed out" audit rows and activity items

**File:** `src/server/auth.ts:38-48`
**Issue:** The `after` hook treats every non-error `/sign-out` call as an owner sign-out. Better-auth's sign-out returns `{ success: true }` even when there is no session cookie (`node_modules/better-auth/dist/api/routes/sign-out.mjs`), and its origin check is skipped when the request has no cookie. `/api/auth/*` is public in `src/proxy.ts`. As a result, `curl -X POST /api/auth/sign-out` with no credentials writes `audit_log{actor:"owner", action:"auth.sign_out"}` and pushes a "Signed out" item to the live feed, up to the 100/min rate limit. That undermines the audit trail and lets anyone spam the feed.
**Fix:** Only record sign-out when a session existed. One way is to read the session in a `before` hook and stash it in `ctx`. Another is to check for the session cookie on `ctx.request` and skip `audit`/`emitAuthEvent` when it is missing:
```ts
if (ctx.path === "/sign-out" && !getSessionCookie(ctx.request!)) return;
```

### WR-02: Sign-out ignores failure, so the user appears signed out while the session stays live

**File:** `src/shell/shell-provider.tsx:100-104`, `src/app/(os)/sign-out.tsx:13-16`
**Issue:** `authClient.signOut()` reports failures by returning `{ error }`, not by throwing. Both handlers ignore the result and call `router.replace("/login")`. If the call failed (network, 5xx), the cookie and session are still valid. `/login` then sends the user straight back to `/`. On a shared device the user may believe they are signed out when they are not.
**Fix:**
```ts
const { error } = await authClient.signOut();
if (error) { toast("Couldn't sign out. Try again.", "error"); return; }
router.replace("/login"); router.refresh();
```
Make `sign-out.tsx` use `useShell().signOut` so there is one implementation (see IN-01).

### WR-03: The SSE client retries forever after the session expires and never redirects to login

**File:** `src/shell/live-provider.tsx:160-167`
**Issue:** When `/api/events` returns 401 (expired or revoked session that still has a cookie), `EventSource` fires `error` without `open`. The handler closes it and reconnects with backoff up to 30s, indefinitely. `resync` only runs on `open`, so the 401 handling in `resync` and `refetchNotifications` never fires. The tab shows "RECONNECTING" forever while actually signed out, and keeps sending requests every 30s.
**Fix:** In the `error` handler, after a few failures or on every error, probe `fetch("/api/notifications")` (`refetchNotifications` already redirects on 401) before scheduling the reconnect:
```ts
es.addEventListener("error", async () => {
  es?.close(); setConnected(false);
  if (closed) return;
  await refetchNotifications(); // assigns /login on 401
  backoff = nextBackoff(backoff);
  timer = setTimeout(connect, backoff);
});
```

### WR-04: Failed optimistic updates roll back to an old list, and resync can drop live notifications

**File:** `src/shell/notification-row.tsx:30-46`, `src/shell/notifications-drawer.tsx:32-47`, `src/shell/live-provider.tsx:79-83`
**Issue:**
- `mutate` and `readAll` save `previous = notifications` from the closure of the render that started the action. If an SSE `notification` arrives or another optimistic action lands while the server action is in flight, a failure calls `setNotifications(previous)`. That deletes the new arrival and undoes the other action.
- `refetchNotifications` replaces the whole list with the snapshot. A notification inserted after the snapshot query, but delivered over SSE before the response is applied, disappears until the next refetch.
**Fix:** On failure, undo only the item you changed with a functional update, e.g. `setNotifications(cur => cur.map(i => i.id === n.id ? original : i))` or re-insert the dismissed or snoozed item. Simpler still: on failure, call `refetchNotifications()` instead of restoring a snapshot. When applying a snapshot, merge items whose `createdAt` is newer than the snapshot's newest item.

### WR-05: Alt+digit and Ctrl+, shortcuts fire while typing in text fields

**File:** `src/shell/shortcuts.ts:25-29`, `src/shell/shell-provider.tsx:107-111`
**Issue:** The global `keydown` handler calls `preventDefault()` and navigates for Alt+1 to Alt+9 no matter what has focus. On macOS, Option+digit types characters (`¡™£¢∞§¶•ª`). On several Windows layouts, Alt+digit sequences are used for input. Inside the AI textarea, the palette input or the login form, the user loses the character and is taken to another page, discarding their draft.
**Fix:** Skip `nav` actions when the event target is editable:
```ts
const t = e.target as HTMLElement | null;
const editable = t?.closest("input,textarea,select,[contenteditable='true']");
if (a.type === "nav" && editable) return;
```

### WR-06: Database outage crashes the whole shell with no styled error page

**File:** `src/app/(os)/layout.tsx:8-11`, `src/server/health.ts:22`
**Issue:**
- `requireOwner()` (`getSession` hits the database) and `checkHealth()` throw when Postgres is unreachable. `checkHealth` only catches the `select 1`; the settings read on line 22 can throw too.
- Errors thrown in a layout are not caught by that segment's own `error.tsx`, and there is no `src/app/global-error.tsx`. The user gets the bare Next error screen.
- As a result, the "Database not responding" and "LIFEOS OFFLINE" UI states built in this phase can never be shown for the most likely outage.
**Fix:** Wrap the health read in `checkHealth` with try/catch (return `{status:"degraded", worker:"unknown"}`). Add `src/app/global-error.tsx`, or an `error.tsx` at the root segment, with fixed copy for "LifeOS can't reach its database".

### WR-07: Unread badge and "Mark all read" use a list capped at 100

**File:** `src/shell/live-provider.tsx:197`, `src/server/notifications.ts:11`
**Issue:** Once the provider has loaded, `unread` comes from `unreadOf(notifications)`. That list is capped by `inbox(limit = 100)`, and the server's accurate `snapshot.unread` is thrown away by `parseSnapshot` callers. With more than 100 visible notifications, the badge undercounts. "Mark all read" can be disabled (`unread === 0`) even though older unread items exist past the cap.
**Fix:** Store `snap.unread` in state and adjust it on optimistic changes. Alternatively, use `Math.max(snap.unread, unreadOf(notifications))` until the next refetch.

### WR-08: SSE payloads are cast without validation, so one bad frame can crash the shell

**File:** `src/shell/live-provider.tsx:144-157`, `src/shell/live.ts:35-42`, `src/shell/notification-row.tsx:24-26`
**Issue:**
- `activity` and `notification` frames are only `JSON.parse`d and cast. Only the presence of `id` is checked.
- `NotificationRow` reads `CATEGORY_META[n.category].important`, and `ActivityList` calls `a.source.toLowerCase()`. A category that is not in the client map, or a missing field, throws during render and takes down the shell, since there is no error boundary around the provider.
- This can happen, for example, after a deploy adds a new enum value while an old tab is still open.
- `isNotification` in `parseSnapshot` likewise only checks that `category` is a string.
**Fix:** Validate frames with the same guards. Check `NOTIFICATION_CATEGORIES.includes(category)` in `isNotification` and run it on SSE notification frames. Add an `isActivity` guard. Fall back to `CATEGORY_META.FYI` in `NotificationRow`.

## Info

### IN-01: Sign-out is implemented twice

**File:** `src/app/(os)/sign-out.tsx:8-22`, `src/shell/shell-provider.tsx:100-104`
**Issue:** The two copies already share the bug in WR-02.
**Fix:** Have `SignOut` call `useShell().signOut`.

### IN-02: Sidebar shows "LIFEOS ONLINE" when health is unknown

**File:** `src/shell/sidebar.tsx:91-94`
**Issue:** When `health` is null, the `else` branch shows a green pulsing "ONLINE", while `SystemTile` shows "Unknown". The two contradict each other.
**Fix:** Add a branch for `health === null` that shows "STATUS UNKNOWN" with a muted dot.

### IN-03: Several landmarks share the label "Primary"

**File:** `src/shell/sidebar.tsx:98,138`, `src/shell/bottom-bar.tsx:26`
**Issue:** The sidebar `<aside>`, the nested `<nav>` and the bottom-bar `<nav>` are all labelled "Primary". Screen-reader landmark lists show duplicate entries.
**Fix:** Label the aside "Sidebar" and keep "Primary" on one nav.

### IN-04: The SSE stream outlives sign-out or session revocation for up to 15 minutes

**File:** `src/app/api/events/route.ts:22-27`
**Issue:** The session is checked only when the stream opens. This is the documented T-02-21 ceiling, noted here for traceability.
**Fix:** Optionally re-check `getSession` on each 20s ping and close the stream when the session is gone.

### IN-05: `emitActivity` lets `payload` overwrite `detail` and `tone`

**File:** `src/server/events.ts:36`
**Issue:** `{ detail, tone, ...a.payload }` lets a caller's payload silently replace the typed fields.
**Fix:** Spread the payload first: `{ ...a.payload, detail: a.detail, tone: a.tone }`.

### IN-06: The version check runs every 30 seconds

**File:** `src/server/monitor.ts:136`
**Issue:** `run` calls `checkVersion()` on every interval, although the version can only change on process start.
**Fix:** Call `checkVersion()` once in the 1s startup timeout, and let the interval run only `tick()`.

---

_Reviewed: 2026-10-08_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
