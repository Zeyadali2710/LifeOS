---
phase: 05-career-projects
plan: 07
subsystem: career-ui
tags: [career, github, rsc]
requires: [05-03, 05-05]
provides: ["/career dashboard", "/career/[owner]/[repo] read-only detail"]
key-files:
  created:
    - src/app/(os)/career/loading.tsx
    - src/app/(os)/career/[owner]/[repo]/page.tsx
    - src/career/career-view.tsx
    - src/career/repo-detail.tsx
  modified:
    - src/app/(os)/career/page.tsx
metrics:
  completed: 2026-10-13
---

# Phase 5 Plan 07: Career dashboard and repo detail Summary

Live /career repo dashboard (tiles, archived toggle, Live from GitHub column, none/error/empty states) plus read-only /career/{owner}/{repo} detail with regex-guarded params and 404s.

## Tasks
1. /career page, loading, CareerView client island (syncNowAction + router.refresh).
2. Repo detail page (segment regex before query, notFound on miss) and RepoDetail server component (PRs with review badge, issues, CI runs, commits, linked projects; isSafeGithubUrl + noopener noreferrer on all external links).

Both tasks committed together in one commit.

## Deviations
- Sync error banner is a plain role="alert" block instead of the structured InlineError primitive (which requires what/why/fix fields; the spec gives one sentence).
- Sync failure toast text: "Couldn't sync. Try again."; success just refreshes (no toast).

## Verification
tsc, eslint (career paths), glass-gate all clean. No visual check (owner gate 05-12).

## Self-Check: PASSED
