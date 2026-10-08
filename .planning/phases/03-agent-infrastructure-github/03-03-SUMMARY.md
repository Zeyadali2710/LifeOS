---
phase: 03-agent-infrastructure-github
plan: 03
subsystem: ui
tags: [ui-primitives, icons, execution-trace]
requires: [03-02]
provides: [Field/Input/Textarea/Select, Disclosure, Dialog, Progress, StatusDot, ExecutionTrace, lo-scan/lo-caret keyframes, 63-icon subset]
key-files:
  created: [src/ui/field.tsx, src/ui/disclosure.tsx, src/ui/dialog.tsx, src/ui/progress.tsx, src/ui/status-dot.tsx, src/agents/execution-trace.tsx, tests/unit/execution-trace.test.ts]
  modified: [src/ui/icon-names.ts, src/app/fonts/material-symbols-outlined.woff2, src/app/globals.css, tests/unit/icons.test.ts]
requirements-completed: [AGT-04, AGT-05]
completed: 2026-10-08
---

# Phase 3 Plan 03: UI primitives, icons, ExecutionTrace Summary

Five UI primitives, a 63-icon regenerated Material Symbols subset with lo-scan/lo-caret keyframes, and a shared ExecutionTrace (panel and timeline sizes) with tested pure helpers stepView/actorLabel.

## Commits
- 74866e0 primitives
- d5163f0 icons + keyframes
- ExecutionTrace + test (third commit)

## Decisions / Deviations
- Icons: many planned names (hub, deployed_code, space_dashboard, etc.) already existed; only 17 were added (46 -> 63). icons.test.ts count updated 46 -> 63.
- Dialog passes `initialFocus` straight to useDialog (which already keeps it in a ref); a render-time ref assignment failed the react-hooks/refs lint rule.
- ExecutionTrace inlines its own button/region instead of using Disclosure, because the whole grid header must be the button. Disclosure remains for other callers.
- Disclosure body uses `inert` when collapsed so hidden content is not focusable.
- Reduced motion: existing global `animation: none !important` rule covers lo-scan, lo-caret, lo-pulse.
- Trace renders summaries as React text only (no dangerouslySetInnerHTML; grep returns 0).

## Manual check pending
Dev-server check that `hub` renders as a glyph rather than ligature text was not run in this worktree (no browser). The subset was regenerated from Google Fonts with all 63 names (fetch succeeded, 18 KB woff2, icons test passes).

## Verification
vitest icons + execution-trace pass; typecheck clean; eslint src/ui src/agents clean.

## Self-Check: PASSED
