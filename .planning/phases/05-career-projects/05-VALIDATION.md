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

| Task ID | Plan | Wave | Requirement | Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|----------|-----------|-------------------|-------------|--------|
| 05-01-T1 | 01 | 1 | CAR-01..03 | DTO + payload contracts compile, client-safe | type | `npx tsc --noEmit` | n/a | ⬜ pending |
| 05-01-T2 | 01 | 1 | CAR-01..03 | ciHealth, language bar, sparkline, progress/health/blockers, timeline, brief, launchCommand, payload rejects | unit | `npx vitest run tests/unit/project-rules.test.ts` | ❌ W0 (created in task) | ⬜ pending |
| 05-01-T3 | 01 | 1 | D-20 | icon subset includes new glyphs | unit | `npx vitest run tests/unit/icons.test.ts` | ✅ (extend) | ⬜ pending |
| 05-02-T1 | 02 | 1 | CAR-01, CAR-02 | schema + TaskDTO compile | type | `npx tsc --noEmit` | n/a | ⬜ pending |
| 05-02-T2 | 02 | 1 | CAR-02 | FKs SET NULL/cascade, CHECKs, link kind, unique repo link, languages null | db | `bash scripts/vm-db-test.sh tests/db/migrations.test.ts tests/db/schema-projects.test.ts` | ❌ W0 (created in task) | ⬜ pending |
| 05-02-T3 | 02 | 1 | CAR-02 | [BLOCKING] 0005 applied on VM | manual | owner: `lc logs migrate` | n/a | ⬜ pending |
| 05-03-T1 | 03 | 2 | CAR-01 | languages via ETag cond; 304 keeps; {} stored; 404 skips repo | db | `bash scripts/vm-db-test.sh tests/db/github-sync.test.ts` | ✅ (extend) | ⬜ pending |
| 05-03-T2 | 03 | 2 | CAR-01 | career cards, open counts, archived, not-synced, CI chip, activity order, repo detail | db | `bash scripts/vm-db-test.sh tests/db/career-queries.test.ts` | ❌ W0 (created in task) | ⬜ pending |
| 05-04-T1 | 04 | 2 | CAR-02 | project/milestone/link CRUD, audit {id}, events, delete guard, blocker loader | db | `bash scripts/vm-db-test.sh tests/db/project-actions.test.ts` | ❌ W0 (created in task) | ⬜ pending |
| 05-04-T2 | 04 | 2 | CAR-02 | cycle rejection self/direct/transitive/cross-project; concurrent inserts | db | `bash scripts/vm-db-test.sh tests/db/project-dependencies.test.ts` | ❌ W0 (created in task) | ⬜ pending |
| 05-04-T3 | 04 | 2 | CAR-02 | tasks with project/milestone, mismatch rejected; actions owner-checked | db + unit | `bash scripts/vm-db-test.sh tests/db/tasks.test.ts` ; `npx vitest run tests/unit` | ✅ (extend) | ⬜ pending |
| 05-05-T1/T2 | 05 | 2 | CAR-01, D-20 | shared status/graphics/RepoCard/ActivityFeed | type + lint + glass | `npx tsc --noEmit && bash scripts/glass-gate.sh src/projects src/career` | ✅ | ⬜ pending |
| 05-06-T1 | 06 | 3 | CAR-02, CAR-03, D-18 | listProjects, loadProject composition, loadActiveProjects (max 4, order), searchProjects | db | `bash scripts/vm-db-test.sh tests/db/project-queries.test.ts` | ❌ W0 (created in task) | ⬜ pending |
| 05-06-T2 | 06 | 3 | D-17 | projects.list/get READ, bounded, no workspace path; registry contract | unit + db | `npx vitest run tests/unit/agent-contracts.test.ts` ; `bash scripts/vm-db-test.sh tests/db/project-tools.test.ts` | ✅ extend + ❌ W0 | ⬜ pending |
| 05-07-T1/T2 | 07 | 3 | CAR-01 | /career + repo detail honest states | type + lint + glass (+ e2e in 05-12) | `npx tsc --noEmit && bash scripts/glass-gate.sh src/career` | ✅ | ⬜ pending |
| 05-08-T1..T3 | 08 | 3 | CAR-02 | dialogs + task dialog pickers | type + lint + unit | `npx tsc --noEmit && npx vitest run tests/unit` | ✅ | ⬜ pending |
| 05-09-T1/T2 | 09 | 4 | CAR-02, D-15 | /projects index | type + lint + glass (+ e2e in 05-12) | `npx tsc --noEmit && bash scripts/glass-gate.sh src/projects` | ✅ | ⬜ pending |
| 05-10-T1..T3 | 10 | 4 | CAR-02, CAR-03 | workspace, copy actions, timeline, blockers | type + lint + glass (+ e2e in 05-12) | `npx tsc --noEmit && bash scripts/glass-gate.sh src/projects` | ✅ | ⬜ pending |
| 05-11-T1 | 11 | 4 | D-18 | Home Active projects | type + unit | `npx tsc --noEmit && npx vitest run tests/unit/home.test.ts` | ✅ | ⬜ pending |
| 05-11-T2 | 11 | 4 | D-19 | palette Projects scope + New project command | unit | `npx vitest run tests/unit/palette.test.ts` | ✅ (extend) | ⬜ pending |
| 05-12-T1 | 12 | 5 | CAR-01..03 | e2e specs + all local gates | e2e (VM) + local | `npx tsc --noEmit && npx eslint . && npx vitest run tests/unit && bash scripts/glass-gate.sh src` | ❌ W0 (created in task) | ⬜ pending |
| 05-12-T2 | 12 | 5 | CAR-01..03 | full VM suite + playwright + owner UAT | manual + db + e2e | owner: `bash scripts/vm-db-test.sh` ; `npx playwright test` | n/a | ⬜ pending |

DB suites are written by executors and run on the VM by the owner (vm_ssh: owner-run): schema suites at the 05-02 gate, everything else at the 05-12 gate.

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## DB Test Deferral (accepted)

Executors cannot reach the VM (Phase 4 `vm_ssh: owner-run`; owner tests only on the VM). DB suites therefore run at the owner gates only: schema suites at the 05-02 migrate gate, all `tests/db/*` Phase 5 suites at the 05-12 gate. Between gates, DB-touching tasks verify with `npx tsc --noEmit`, `npx eslint`, unit tests and SQL review. Accepted latency trade-off; 05-02 Task 3 and 05-12 Task 2 are `checkpoint:human-action` tasks; execute-phase always presents human-action checkpoints to the owner (they cannot be auto-approved, even in auto mode), so wave 2 cannot start before the owner approves the migrate gate.

Per-task note: wherever the map below lists `bash scripts/vm-db-test.sh ...` for a 05-03/05-04/05-06 task, the executor's in-task command is tsc + eslint + unit tests; the listed VM suite is run by the owner at the 05-12 gate.

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
