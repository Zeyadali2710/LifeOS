---
phase: 02-shell
plan: 13
subsystem: shell
tags: [a11y, docs, e2e, polish]
requires: [02-01, 02-12]
provides: [a11y shell e2e, phase docs, validation map]
key-files:
  created: [tests/e2e/a11y-shell.spec.ts]
  modified: [src/shell/app-shell.tsx, src/app/globals.css, tests/e2e/owner.ts, tests/e2e/shell-nav.spec.ts, eslint.config.mjs]
decisions:
  - Legacy colour aliases dropped; design/** excluded from eslint (vendored support.js)
  - Page gutters per UI-SPEC applied on the shell content wrapper
  - Inputs are 16px under pointer:coarse to stop iOS Safari focus zoom
requirements: [SHL-01, SHL-02, SHL-03, SHL-04, SHL-05]
metrics:
  completed: 2026-10-08
---

# Phase 2 Plan 13: Cleanup, a11y e2e, docs, owner check Summary

Removed legacy colour aliases, added an a11y shell e2e, wrote API/architecture/third-party docs and the validation map, and ran the owner device check (mobile approved; desktop items pending).

## Commits
- 3b74c5b feat: drop legacy colour aliases, add a11y shell e2e
- d23d143 docs: api, architecture, third-party, validation map; green gate
- f54fb3a fix: page gutters, no iOS input zoom, deflake Alt+2 e2e

## Verification
- typecheck clean; lint 0 errors (2 accepted warnings); vitest 71/71; playwright 40 passed / 12 skipped (before the f54fb3a fixes; Alt+2 then passed 10/10).

## Deviations
- [Rule 3] Added `design/**` to eslint ignores (vendored design/support.js errors).
- [Rule 1] tests/e2e/owner.ts signIn random IP range (100-249) collided with auth.spec fixed IPs; fixed.
- [Rule 1] Owner phone test found: (a) UI-SPEC page container padding (20/16 mobile, 36/32 desktop, bottom clearing bottom bar / 170px command bar) never implemented; (b) iOS Safari zoomed on <16px inputs; (c) flaky Alt+2 e2e. All fixed in f54fb3a.

## Owner checkpoint (Task 3)
- PASSED: mobile visual on iPhone over Tailscale ("Looks good on mobile"); degraded health (worker stopped -> Degraded, restarted -> Healthy).
- Not exercised live: failed sign-in live check (covered by live-activity e2e).
- PENDING human verification (desktop): visual match at ~1400 and ~900 widths vs design shots; Windows shortcuts in Chrome/Edge (Ctrl+K palette, Ctrl+J assistant, Alt+2 Career, Ctrl+\ collapse, Ctrl+, Settings).

## Follow-ups
- T-02-45: on first Proxmox deploy verify server actions behind the proxy; set `experimental.serverActions.allowedOrigins` if Origin and Host differ.

## Known Stubs
None.

## Self-Check: PASSED
