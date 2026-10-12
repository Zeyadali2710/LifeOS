---
phase: 05-career-projects
plan: 05
subsystem: ui
tags: [components, status-map, glass]
requires: [05-01]
provides: [HealthDot, StatusChip, PriorityTag, CiChipView, ProgressRing, Sparkline, LanguageBar, RepoCard, ActivityFeed]
key-files:
  created:
    - src/projects/status.tsx
    - src/projects/progress-ring.tsx
    - src/career/sparkline.tsx
    - src/career/language-bar.tsx
    - src/career/repo-card.tsx
    - src/career/activity-feed.tsx
metrics:
  completed: 2026-10-13
---

# Phase 5 Plan 05: Shared Career/Projects components Summary

Presentational components (single status map, ring, 14-bar sparkline, language bar, RepoCard, ActivityFeed) built from DTOs only, with honest empty/unsynced states and accessible labels.

## Deviations from Plan

- `RepoCard` and `ActivityFeed` take a required `now: string` (ISO) prop; `relativeTime` is exported from repo-card.tsx and reused by the feed (plan only specified `now` for the feed's signature implicitly).
- Serif uses the project's `font-display` utility; ring colours use `var(--green|--amber|--accent)`.

## Verification
tsc, eslint (src/projects, src/career) and glass-gate all clean. Task commits: b440305 and the RepoCard/ActivityFeed commit that follows it.

## Known Stubs
None.

## Self-Check: PASSED
