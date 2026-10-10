---
phase: 04-organization
plan: 22
subsystem: docs
tags: [docs, calendar, permissions, security]
requirements-completed: [ORG-01, ORG-02, ORG-03]
key-files:
  modified: [docs/integrations.md, docs/agents.md, docs/permissions.md, docs/database.md, docs/security.md, docs/third-party.md]
completed: 2026-10-10
---
# Phase 4 Plan 22: Phase 4 docs Summary

Six docs updated to match the shipped code: Google/iCloud adapters, sync cadence/window/meaningful-change rule, rotation, owner Google setup (Branding page home page + privacy URLs on `<tailnet>.ts.net` before publishing to In production; GOOGLE_CLIENT_ID/SECRET in both web and worker; iCloud app password entered in Settings, never .env), calendar tool tiers and the ORG-02 owner-direct/agent-approved rule, migration 0003 tables, security notes, tsdav (MIT) and ical.js (MPL-2.0, from package-lock).

## Deviations
- Worktree base was behind; corrected with `git reset --hard e6ec833` per startup check.
- node_modules absent in worktree, so licences were read from package-lock.json.
- Docs state no manual-paste Google fallback exists (04-03: redirect accepted).

## Self-Check: PASSED (task greps match)
