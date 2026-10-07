---
phase: 02-shell
plan: 03
subsystem: ui-foundation
tags: [design-tokens, dark-theme, material-symbols, next-font-local]
requires: []
provides: [design-tokens, Icon, IconName, ICONS, --font-symbols]
affects: [login, home, all UI plans]
tech-stack:
  added: []
  patterns: [next/font/local subset woff2, typed icon names guarded by unit test]
key-files:
  created: [scripts/fetch-symbols.mjs, src/ui/icon-names.ts, src/ui/icon.tsx, src/app/fonts/material-symbols-outlined.woff2, tests/unit/icons.test.ts]
  modified: [src/app/globals.css, src/app/layout.tsx]
key-decisions:
  - "UI-SPEC token block pasted verbatim; legacy aliases kept for /login until plan 13"
requirements-completed: [SHL-01]
duration: 10min
completed: 2026-10-08
---

# Phase 2 Plan 03: Tokens and icon font Summary

Design tokens (dark only, light media block removed, themeColor #0b0c10), keyframes and reduced-motion rule in globals.css, plus a 14 KB self-hosted Material Symbols subset (46 icons) with a typed Icon and a guard test.

## Tasks
1. Icon subset font, fetch script, Icon, guard test: 36c90eb
2. Design tokens, dark theme, font wiring: e4bf49b

## Verification
- vitest icons.test.ts: 3 passed
- typecheck, `eslint src tests`, `next build`: pass

## Deviations from Plan
None. Note: `npm run lint` over the whole repo still reports the known design/support.js errors (deferred).

## Self-Check: PASSED
