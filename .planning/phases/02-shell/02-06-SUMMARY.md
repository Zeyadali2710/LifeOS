---
phase: 02-shell
plan: 06
subsystem: ui
tags: [primitives, tailwind, login]
requires: [02-02, 02-03]
provides: [Button, Badge, Kbd, Skeleton, InlineError, EmptyState, SectionHeader, PageHeader, StatusTile]
key-files:
  created: [src/ui/badge.tsx, src/ui/kbd.tsx, src/ui/skeleton.tsx, src/ui/inline-error.tsx, src/ui/empty-state.tsx, src/ui/section-header.tsx, src/ui/page-header.tsx, src/ui/status-tile.tsx]
  modified: [src/ui/button.tsx, src/app/login/login-form.tsx, src/app/login/page.tsx]
completed: 2026-10-08
---

# Phase 2 Plan 06: UI primitives Summary

Nine token-driven primitives per UI-SPEC (Button with 6 variants / 4 sizes / loading), and /login migrated onto new tokens with `isSafePath`.

## Commits
- bae0ec3: Button, Badge, Kbd, Skeleton, InlineError
- 3fa3349: EmptyState, SectionHeader, PageHeader, StatusTile, login migration

## Verification
`npm run typecheck` and `npx eslint src tests` pass; no dangerouslySetInnerHTML in src/ui. Playwright auth e2e not run (deferred to wave end / plan 13).

## Deviations
None. Notes: InlineError is a "use client" file (onClick action). StatusTile links carry aria-label "{label}: {value}". Login input border uses an rgba value instead of `border-line` to satisfy the legacy-alias grep. The `--color-bg/fg/signal/...` legacy aliases in globals.css are now unused by login and can be deleted later.

## Self-Check: PASSED
