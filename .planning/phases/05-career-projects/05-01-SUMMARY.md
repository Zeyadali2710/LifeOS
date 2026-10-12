---
phase: 05-career-projects
plan: 01
subsystem: contracts
tags: [types, zod, rules, icons]
requires: []
provides: [project-types, project-payload, project-rules, icons-77]
affects: [05-02..05-12]
key-files:
  created: [src/lib/project-types.ts, src/lib/project-payload.ts, src/lib/project-rules.ts, tests/unit/project-rules.test.ts]
  modified: [src/ui/icon-names.ts, src/app/fonts/material-symbols-outlined.woff2, tests/unit/icons.test.ts]
decisions:
  - "health(): non-active returns reason empty string; target-passed (A2) and CI-failing-alone (A4) implemented as documented"
  - "languageBar remainder goes on the first (largest) slice"
metrics:
  tasks: 3
  completed: 2026-10-13
---

# Phase 5 Plan 01: Contracts and Pure Rules Summary

Client-safe Phase 5 DTOs, zod payloads (http(s)-only links, shell-safe workspace paths, Sydney dates) and one clock-free rules module (CI health, language bar, sparkline, progress, health, blockers, timeline, launch command, brief), plus 8 new icon glyphs (77 total).

## Commits
- feat: DTO types and zod payloads (Task 1)
- test: failing rules tests (Task 2 RED)
- feat: pure project rules module (Task 2 GREEN)
- feat: 8 Material Symbols glyphs, subset font regenerated (Task 3)

## Verification
tsc, eslint clean; project-rules (43 tests) and icons tests green.

## Deviations from Plan
- Worktree HEAD was behind the expected base; reset to 69f9501 per the start-up check.
- Dropped the plan's unused `TaskDTO` import from project-rules (not needed). Test fixture for sparkline adjusted to a correct Sydney-day instant (test bug, not a rule change).

## Known Stubs
None.

## Self-Check: PASSED
