---
phase: 2
slug: shell
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-10-08
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Source: `02-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (unit + db), @playwright/test (e2e desktop + mobile projects) |
| **Config file** | `vitest.config.ts`, `playwright.config.ts` (existing) |
| **Quick run command** | `npx vitest run tests/unit` |
| **Full suite command** | `npm run typecheck && npm run lint && npm test && npm run e2e` |
| **Estimated runtime** | ~10s quick; ~5 min full (prod build for e2e) |

---

## Sampling Rate

- **After every task commit:** `npx vitest run tests/unit` (+ the specific `tests/db/*` file touched)
- **After every plan wave:** `npm run typecheck && npm run lint && npm test`
- **Before `/gsd:verify-work`:** full suite incl. `npm run e2e` green
- **Max feedback latency:** 30 seconds (quick run)

---

## Per-Task Verification Map

Filled by the planner/executor against plan task IDs. Requirement → check map:

| Requirement | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|-------------|-----------------|-----------|-------------------|-------------|--------|
| SHL-01 | all routes behind `requireOwner()` | e2e | `npx playwright test shell-nav` | ✅ | ✅ green |
| SHL-01 | — | unit | `npx vitest run tests/unit/icons.test.ts` | ✅ | ✅ green |
| SHL-02 | AI submit never calls a backend | e2e | `npx playwright test palette` | ✅ | ✅ green |
| SHL-02 | — | unit | `npx vitest run tests/unit/palette.test.ts` | ✅ | ✅ green |
| SHL-03 | — | e2e | `npx playwright test home` | ✅ | ✅ green |
| SHL-03 | weather failure → date only | unit | `npx vitest run tests/unit/home.test.ts tests/unit/weather.test.ts` | ✅ | ✅ green |
| SHL-04 | NOTIFY carries ids only; hub reconnect + resync | db | `npx vitest run tests/db/hub.test.ts tests/db/events.test.ts` | ✅ | ✅ green |
| SHL-04 | SSE 401 without session; no IP/email in events | e2e | `npx playwright test live-activity` | ✅ | ✅ green |
| SHL-04 | — | unit | `npx vitest run tests/unit/live.test.ts` | ✅ | ✅ green |
| SHL-05 | inbox excludes dismissed/future-snoozed | db | `npx vitest run tests/db/notifications.test.ts tests/db/notification-actions.test.ts` | ✅ | ✅ green |
| SHL-05 | Sydney-time snooze presets, DST-safe | unit | `npx vitest run tests/unit/time.test.ts` | ✅ | ✅ green |
| SHL-05 | `actionUrl` rejects `//x`, `javascript:` | unit + e2e | `npx vitest run tests/unit/safe-url.test.ts`; `npx playwright test notifications` | ✅ | ✅ green |
| D-10/D-15 | monitor debounce + CAS emits once | db | `npx vitest run tests/db/monitor.test.ts` | ✅ | ✅ green |
| A11y | skip link, `role=log`, dialog focus trap/return | e2e | `npx playwright test a11y-shell` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] All test files listed above
- [x] `tests/db/helpers.ts` — throwaway-DB setup extracted from `tests/db/migrations.test.ts`
- [x] `tests/e2e/owner.ts` — `signIn(page)`, `seedHeartbeat()`, `insertNotification()` helpers
- No framework install needed.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Visual match to design | SHL-01/03 | pixel fidelity | Compare at <720, 720–1100, ≥1100 against `design/shots/home.jpg` and `design/LifeOS.dc.html` |
| Ctrl+K / Ctrl+J / Alt+1–9 on Windows Chrome + Edge | SHL-02 | browser-reserved shortcuts (A1) | Press each on Windows; confirm app handles, not browser |
| Server actions over Tailscale serve | SHL-05 | needs deployed host (A5) | On Proxmox deploy, snooze/dismiss a notification via tailnet URL |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** automated green 2026-10-08; manual-only checks pending owner (02-13 Task 3)
