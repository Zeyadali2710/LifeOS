---
phase: 06-outreach
plan: 04
subsystem: outreach-rules
tags: [dedup, filter, scoring]
requires: [06-01]
provides: [canonUrl, canonTitle, minuteKey, sameEvent, sydneyCheck, inWindow, scoreEvent, projectKeywords]
key-files:
  created: [src/server/outreach/normalize.ts, src/server/outreach/score.ts, tests/unit/outreach-normalize.test.ts, tests/unit/outreach-score.test.ts]
metrics:
  completed: 2026-10-13
---

# Phase 6 Plan 04: Normalize + score Summary

Pure dedup keys (URL merge also requires the same start minute), positive-evidence Sydney filter with 60-day window, and the 60/20/20 explainable score (interests, projects incl. category and context keywords, schedule) with a why line built only from signals.

## Commits
- feat(06-04): outreach normalize, dedup keys, Sydney and window filter
- feat(06-04): explainable relevance score and why line

## Tests
- tests/unit: 47 files, 429 tests passed (normalize 10, score 7)
- tests/db: 45 files, 310 tests passed
- tsc clean; eslint clean

## Deviations
- Schedule: tentative overlaps are scored 10 ("optional"), so only the SchedItem type is imported from conflicts.ts rather than busyOf (which counts tentative as busy).
- Interest/project matching uses letter/digit lookarounds instead of `\b` so terms like "C++" match; terms are regex-escaped literals.
- State abbreviations (VIC, ACT, SA...) are matched case-sensitively so ordinary words like "act" do not drop events.

## Owner actions
None.

## Self-Check: PASSED
