---
phase: 06-outreach
plan: 08
subsystem: mail-sync
tags: [gmail, sync, quota, fixtures]
requires: [06-01, 06-02, 06-05, 06-06]
provides: [createMailSync, mailSyncState, MAIL_SYNC_KEY, fakeGmail, manyMessages, gmail fixtures]
key-files:
  created: [src/server/mail/sync.ts, tests/helpers/fake-gmail.ts, tests/fixtures/gmail/messages.json, tests/db/mail-sync.test.ts]
  modified: []
decisions:
  - Known gmail ids are never refetched (quota); label changes arrive through history labelsAdded/Removed, so the conflict-update path only fires on a race and writes metadata columns only.
  - fakeGmail reuses fakeGoogle (host check, call log) by passing a Proxy route table that sends every Gmail request to one dispatcher, since fakeGoogle matches exact keys and Gmail paths carry ids.
metrics:
  completed: 2026-10-13
---

# Phase 6 Plan 08: Gmail metadata sync Summary

Metadata-only Gmail sync: a resumable full backfill (profile historyId saved first, INBOX newer_than:30d, at most 200 gets per run) followed by history-based incremental sync, with Gmail-only permission failures isolated from Calendar, plus a stateful fake Gmail and fixtures for all later mail plans.

## Commits
- 34fc6fc test(06-08): fake Gmail helper and message fixtures
- e6224b4 feat(06-08): resumable Gmail metadata sync with isolated failure modes

## Tests
- `npx vitest run tests/unit`: 48 files, 435 passed
- `npx vitest run tests/db`: 48 files, 351 passed (mail-sync: 12 tests; the file also ran green alongside calendar-sync-google)
- `npx tsc --noEmit` clean; eslint clean on touched files.
- Gates: no `getFull`/`format=full` in sync.ts; `MAX_GETS_PER_RUN = 200`, `newer_than:30d`, `not_found` fallback present.

## Deviations from Plan
- None functionally. fakeGmail is built on fakeGoogle through a catch-all Proxy route table (see decisions); it exposes `state` (mailbox, history, switches forbid/unauthorized/rateLimit/historyGone/newIdOnSend, drafts, sent) plus `calls`, `sent`, `drafts`.
- Worker registration of `mail.sync` is not here (plan 11 owns worker/index.ts, as planned). Triage enqueue is injectable; default is the real `enqueue`.

No stubs.

## Owner actions
None for this plan. (Live Gmail sync is covered by phase UAT after re-consent and deploy.)

## Self-Check: PASSED
