---
phase: 05-career-projects
plan: 11
subsystem: home-palette
tags: [home, palette, projects]
requires: [05-05, 05-06]
provides: [ActiveProjects, palette Projects scope, cmd-new-project]
key-files:
  created: [src/projects/active-projects.tsx]
  modified: [src/app/(os)/page.tsx, src/shell/palette-items.ts, src/shell/palette.tsx, src/server/palette-actions.ts, tests/unit/palette.test.ts]
requirements: [CAR-02]
completed: 2026-10-13
---

# Phase 5 Plan 11: Home Active projects and palette Summary

Home shows up to 4 real Active projects (ring, health, commit sparkline, honest empty state linking to New project) and the palette gains a Projects scope plus a New project command.

## Deviations from Plan

- searchProjects returns `category: string`, so palette-actions casts CATEGORY_LABEL to Record<string,string> with a raw-value fallback. No behaviour change.
- Empty-state action is a styled Link (no link-button component exists).

## Verification

tsc clean, eslint 0 errors (5 pre-existing warnings), glass-gate clean, vitest unit 322/322 pass.

## Self-Check: PASSED
