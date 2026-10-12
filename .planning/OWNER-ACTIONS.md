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

## Phase 5.1 — project agent writes + repo contents

- [ ] **Add "Contents: Read-only" to the GitHub fine-grained read token** (github.com → Settings → Developer settings → Fine-grained tokens → the LifeOS read token → Repository permissions → Contents: Read-only → Update). If GitHub issues a new token value, paste it in LifeOS Settings → Connections → GitHub (read).
  Unblocks: live `github.list_tree` / `github.get_file` on the VM (without it they return 404 → "not found"). Local tests use fixtures, so the build isn't blocked.
- [ ] **Make sure the Studio repo is synced** (it shows on /career). Needed for the "create a project from my Studio repo" UAT.
- [ ] **Review auto-decisions** in `.planning/phases/05.1-project-agent-writes-repo-contents-inserted/05.1-DISCUSSION-LOG.md` — notably Projects agent run limits (16 tool calls / 150k tokens ≈ ≤US$0.50 per run on Sonnet), draft caps (12 milestones / 40 tasks / 10 links, 16 KB per file), no agent deletes. If your 3.1 private-repo free-model toggle is ON, private README/docs content may go to free models.
