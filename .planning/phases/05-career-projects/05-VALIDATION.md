---
phase: 5
slug: career-projects
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-10-12
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Source: 05-RESEARCH.md "Validation Architecture".

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (existing config); DB tests use `setupTestDb()` from `tests/db/helpers.ts` |
| **Config file** | existing `vitest.config.*` — no change |
| **Quick run command** | `npx vitest run tests/unit` (local, no DB) |
| **Full suite command** | `bash scripts/vm-db-test.sh` (VM only — owner runs; no local Postgres) |
| **Estimated runtime** | unit ~15 s; VM suite ~60 s |

---

## Sampling Rate

- **After every task commit:** relevant unit file + `npx tsc --noEmit` + `npx eslint src`
- **After every plan wave:** `npx vitest run tests/unit`; DB files queued for the VM run
- **Before `/gsd:verify-work`:** full VM suite green + `bash scripts/glass-gate.sh src` + owner UAT
- **Max feedback latency:** 30 seconds locally

---

## Per-Task Verification Map

Filled by the planner per task. Requirement → test map:

| Requirement | Behavior | Test Type | Automated Command | File Exists | Status |
|-------------|----------|-----------|-------------------|-------------|--------|
| CAR-01 | languages via ETag cond; 304 keeps; 404 skips repo, sync continues | db | `bash scripts/vm-db-test.sh tests/db/github-sync.test.ts` | extend | ⬜ pending |
| CAR-01 | `ciHealth`, language bar, 14-day sparkline (Sydney buckets) | unit | `npx vitest run tests/unit/project-rules.test.ts` | ❌ W0 | ⬜ pending |
| CAR-01 | career queries: PR/issue counts, archived hidden, activity order, not-synced repos | db | `tests/db/career-queries.test.ts` | ❌ W0 | ⬜ pending |
| CAR-02 | schema FKs/CHECKs/uniques (SET NULL, cascade, link kind) | db | `tests/db/schema-projects.test.ts` | ❌ W0 | ⬜ pending |
| CAR-02 | dependency cycle rejection (task + project) | db | `tests/db/project-dependencies.test.ts` | ❌ W0 | ⬜ pending |
| CAR-02 | progress / health / blockers rules incl. boundaries | unit | `tests/unit/project-rules.test.ts` | ❌ W0 | ⬜ pending |
| CAR-02 | project/milestone/link actions, audit, activity events, delete guard | db | `tests/db/project-actions.test.ts` | ❌ W0 | ⬜ pending |
| CAR-02 | tasks with project/milestone (mismatch rejected) | db | extend `tests/db/tasks.test.ts` | extend | ⬜ pending |
| CAR-03 | `buildBrief` snapshot; `launchCommand` rejects shell metacharacters | unit | `tests/unit/project-rules.test.ts` | ❌ W0 | ⬜ pending |
| CAR-03 | `loadProject` composition | db | `tests/db/project-queries.test.ts` | ❌ W0 | ⬜ pending |
| D-17 | `projects.list/get` READ tools, bounded, no workspace path leak | unit+db | `tests/unit/agent-contracts.test.ts`, `tests/db/project-tools.test.ts` | extend + ❌ W0 | ⬜ pending |
| D-19 | palette Projects scope + New project command | unit | `npx vitest run tests/unit/palette.test.ts` | extend | ⬜ pending |
| D-20 | Glass gate | script | `bash scripts/glass-gate.sh src` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/project-rules.test.ts`
- [ ] `tests/db/schema-projects.test.ts`, `tests/db/project-dependencies.test.ts`, `tests/db/project-actions.test.ts`, `tests/db/project-queries.test.ts`, `tests/db/career-queries.test.ts`, `tests/db/project-tools.test.ts`
- [ ] languages route via existing `tests/helpers/fake-github.ts` (generic routes; no helper change)

No framework install needed.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Career/Projects/workspace pages render with real data and honest empty/error states | CAR-01..03 | browser on deployed VM | Owner opens /career, /career/{o}/{r}, /projects, /projects/{id} on desktop + phone |
| Copy context / Copy launch command | CAR-03 | clipboard needs secure origin | Click both on the Tailscale HTTPS origin; paste to confirm |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
