---
phase: 03-agent-infrastructure-github
plan: 04
subsystem: github
tags: [github, tokens, crypto, fetch]
requires: [03-01, 03-02]
provides: [createGithub, GithubError, saveToken, removeToken, readToken, writeToken, getConnections, markConnectionError, recordSync, fakeGithub]
key-files:
  created:
    - src/server/github/client.ts
    - src/server/github/connections.ts
    - tests/helpers/fake-github.ts
    - tests/fixtures/github/user.json
    - tests/fixtures/github/repos.json
    - tests/unit/github-client.test.ts
    - tests/db/connections.test.ts
decisions:
  - "saveToken/readToken/writeToken accept an optional encryption key (test seam) so tests need no env"
  - "No over-permission warning (fine-grained PATs expose no scope header)"
requirements-completed: [AGT-06]
completed: 2026-10-08
---

# Phase 3 Plan 04: GitHub client and token store Summary

Origin-locked fetch GitHub client (ETag, bounded Link pagination, typed errors) plus an AES-256-GCM token store with verify-on-save and separate read/write token accessors.

## Commits
- 998fb96: GitHub fetch client, fake-github helper, fixtures, unit test
- see git log: connection store and DB test

## Deviations
None of substance. Note: `audit()` uses the global `db()`, so in DB tests it logs "audit write failed" (env unset) and does not throw; audit rows are therefore not asserted in tests. Both tests pass; `npm run typecheck` clean.

## Known Stubs
None.

## Self-Check: PASSED
