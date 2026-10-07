---
phase: 02-shell
plan: 08
subsystem: shell-chrome
tags: [nextjs, layout, keyboard, a11y, sidebar]
requires: [02-02, 02-05, 02-06, 02-07]
provides:
  - ShellProvider/useShell state + global keyboard map (matchShortcut)
  - Sidebar/rail, TopBar, BottomBar, MoreSheet, Toast, AppShell
  - useDialog focus-trap hook
  - (os)/layout.tsx hosting every page in AppShell behind requireOwner()
affects: [02-09, 02-10, 02-12]
key-files:
  created: [src/shell/nav.ts, src/shell/shortcuts.ts, src/shell/use-dialog.ts, src/shell/shell-provider.tsx, src/shell/toast.tsx, src/shell/sidebar.tsx, src/shell/top-bar.tsx, src/shell/bottom-bar.tsx, src/shell/more-sheet.tsx, src/shell/app-shell.tsx, tests/unit/shortcuts.test.ts]
  modified: ["src/app/(os)/layout.tsx", "src/app/(os)/sign-out.tsx"]
decisions:
  - "Container query class @container/main sits on the column wrapping TopBar and main, so the top-bar clock/Kbd hide rules can use it."
  - "isApple via useSyncExternalStore (false on server) to avoid setState-in-effect."
  - "Sidebar shows RECONNECTING only once loaded && !connected, to avoid flicker on first paint."
  - "Approvals count is a literal 0 until Phase 3 (commented)."
metrics:
  tasks: 2
  completed: 2026-10-08
---

# Phase 2 Plan 08: Shell chrome Summary

Responsive OS chrome (232/64px sidebar, 68px rail, mobile bottom bar + More sheet) with a single global keyboard handler, live unread/health badges, real version, and toasts, wired into the `(os)` layout behind `requireOwner()`.

## Tasks
1. Nav data, `matchShortcut` (5 tests, TDD), `useDialog`, `ShellProvider`, `Toast` - 8a0c12a
2. Sidebar, TopBar, BottomBar, MoreSheet, AppShell, `(os)/layout.tsx`, restyled sign-out - dd293d7

## Verification
- `npx vitest run tests/unit`: 46 passed. `npm run typecheck`: clean. `npx eslint src tests`: 0 errors, 2 accepted warnings (live-provider). `npm run build`: passes.
- Breakpoint behaviour not browser-verified here (deferred to plan 09 e2e / plan 13 visual checkpoint).

## Deviations from Plan
None of substance. Mount points for plans 10 and 12 are JSX comments in app-shell.tsx after the content div. Esc is handled by useDialog (stopPropagation + preventDefault); the window handler skips defaultPrevented events.

## Known Stubs
Approvals count (`APPROVALS_WAITING = 0`) is intentional until Phase 3.

## Self-Check: PASSED
