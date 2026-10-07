---
phase: 02-shell
plan: 10
subsystem: shell
tags: [palette, ai-panel, command-bar, e2e]
requires: [02-04, 02-08]
provides: [buildPalette, Palette, AIPanel, CommandBar]
key-files:
  created: [src/shell/palette-items.ts, src/shell/palette.tsx, src/shell/ai-panel.tsx, src/shell/command-bar.tsx, tests/unit/palette.test.ts, tests/e2e/palette.spec.ts]
  modified: [src/shell/app-shell.tsx]
decisions:
  - Typed query defaults selection to the first filtered result (not the Ask row) so Enter navigates; Ask is one ArrowUp away and is the only row on no-match
  - Send icon is arrow_upward (no "send" in the icon set)
metrics:
  completed: 2026-10-08
requirements: [SHL-02]
---

# Phase 2 Plan 10: Palette, AI panel, command bar Summary

Pure-model command palette (combobox/listbox, Tab reserved), AI panel shell (docked >=1100, overlay 720-1100, full-screen sheet <720) and floating command bar, all mounted in AppShell; every prompt yields the honest "LifeOS can't answer yet." InlineError with no network call.

## Commits
- 8f62e6c feat: palette model and component
- ce365c7 feat: AI panel, command bar, app-shell mounts
- 94651fa test: palette e2e + default-selection fix

## Verification
- `vitest tests/unit/palette.test.ts`: 5 passed. typecheck clean. `eslint src tests`: 0 errors (2 accepted location.assign warnings).
- `npx playwright test palette`: 2 passed, 2 skipped (project-specific). Ran against the prod build with lifeos_e2e DB. Asserts no POST and no non-framework request on submit.

## Deviations
- [Rule 1] UI-SPEC says selection resets to the first row, but the first row is the Ask row, which made "goa" + Enter ask the AI instead of opening Goals (plan e2e requires Goals). Default selection is now the first match when any exist.
- e2e: first Ctrl+K retried until hydrated; `_rsc` Next prefetch GETs excluded from the request allowlist; turns persist across close so the last alert is asserted.

## Known Stubs
None. The AI panel is intentionally not connected (D-05); Phase 3 wires the backend.

## Self-Check: PASSED
