---
phase: 06-outreach
plan: 02
subsystem: server-primitives
tags: [ssrf, mime, html-to-text]
requires: []
provides: [safeGet/SafeGetError, capUtf8/htmlToText/decodeEntities, bodyText/headerOf/parseAddrList, buildReplyMime/replyMessageId]
key-files:
  created: [src/server/net/safe-get.ts, src/server/text.ts, src/server/mail/text.ts, src/server/mail/mime.ts, tests/unit/safe-get.test.ts, tests/unit/mail-text.test.ts, tests/unit/mail-mime.test.ts]
  modified: [src/server/agents/tools/github.ts]
metrics:
  completed: 2026-10-13
---

# Phase 6 Plan 02: Pure/security primitives Summary

SSRF-safe stdlib fetcher (connect-time vetted IP, BlockList incl. IPv4-mapped, per-hop isSafeUrl, 3 redirects, byte cap, total timeout, URL-free errors), shared UTF-8 cap and HTML-to-text, Gmail body extraction, and an injection-safe threaded reply MIME builder.

## Commits
- feat(06-02): SSRF-safe safeGet with connect-time IP vetting
- feat(06-02): shared text helpers, Gmail body extraction, github get_file reuses capUtf8
- test(06-02): reply MIME builder tests (mime.ts itself landed in the previous commit)

## Tests
- tests/unit: 43 files, 397 tests passed (safe-get 16, mail-text 11, mail-mime 7)
- tests/db: 45 files, 310 tests passed
- tsc clean; eslint 0 errors (10 pre-existing warnings)

## Deviations
- mail/text.ts and mime.ts declare a local structural `Addr` type (identical to src/lib/outreach-types.ts Addr) to stay dependency-free.
- mime.ts was committed together with the text helpers commit rather than with its tests.

## Owner actions
None.

## Self-Check: PASSED
