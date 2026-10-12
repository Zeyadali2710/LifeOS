# Owner actions

Things only the owner can do (VM, deploy, UAT, credentials). Autonomous runs append here and keep going with work that doesn't depend on them. Tick items off when done.

## Phase 5 — post-review fixes (added 2026-10-13, overnight run)

- [ ] **Deploy + apply migration 0006 (`projects.archived_from`)** — from WR-02 fix (unarchive restores the pre-archive status).
  ```bash
  cd ~/lifeos && git pull && lc up -d --build
  lc logs migrate | tail -5        # expect "migrations applied", no error
  bash scripts/vm-db-test.sh tests/db/migrations.test.ts tests/db/project-actions.test.ts tests/db/tasks.test.ts
  ```
  Unblocks: nothing in the overnight run (fixes are tested locally: unit 322, db 268 against Postgres, e2e projects+career 12/12). **Required before the new code runs on the VM** — /projects reads the new column, so the `migrate` service must apply 0006 (it does on `lc up`).
- [ ] **Quick re-check on the VM** (2 min, from 05-VERIFICATION human items): delete a project whose only link is a dependency (CR-01); archive a paused project and unarchive it — it should come back paused (WR-02); delete a blocking task → "became unblocked" activity event (WR-03); new task with a blocker that fails to save keeps the saved blockers listed (WR-05); tasks in an archived project can't be ticked (WR-01).
