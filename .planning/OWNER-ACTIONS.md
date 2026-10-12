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

### Phase 5.1 — deploy, migrate 0007, VM tests, live UAT

- [ ] **Deploy; migrations 0006 AND 0007 both apply on this deploy** (0007 adds `projects.context`).
  ```bash
  cd ~/lifeos && git pull && lc up -d --build
  lc logs migrate | tail -5        # expect 0007_project_context applied (and 0006 if not yet), no error
  bash scripts/vm-db-test.sh tests/db/migrations.test.ts tests/db/github-tools.test.ts tests/db/project-agent-writes.test.ts tests/db/gateway.test.ts tests/db/loop.test.ts tests/db/routing-loop.test.ts tests/db/approvals.test.ts tests/db/project-tools.test.ts tests/db/project-actions.test.ts
  ```
- [ ] **Live UAT** (browser, tailnet HTTPS origin; needs the Contents: Read-only PAT above and the Studio repo synced):
  1. Confirm Settings -> Connections still shows the GitHub read token connected.
  2. Ask LifeOS: "Create a project based on my Studio repository, fully set up". Trace shows list_tree then get_file calls; exactly one approval card (AI panel + /approvals) listing files (untrusted note), context notes, milestones, tasks and the Studio repo link.
  3. On /approvals: EDIT, remove one task, change the name or a due date, DONE, CREATE PROJECT. Card shows Project created + Open project; agent replies with the /projects/<id> link.
  4. /projects/<id> shows the context card, milestones, tasks (minus the removed one) and repo link; Copy context includes "## Context".
  5. Ask "add a milestone 'Beta' with two tasks to Studio": one UPDATE PROJECT card with NEW tags; approve; project shows them, workspace path unchanged.
  6. Edit the project's context in the dialog, then edit only its name: the context stays.

  Unblocks: phase 5.1 human verification (CAR-02, CAR-03, AGT-01 live). Any failure becomes a gap for `/gsd:plan-phase 5.1 --gaps`. Reply with the 0007 migrate log line and pass/issue per UAT item (never paste tokens).
- [ ] **During the 5.1 UAT, also check the two edit-form review fixes** (05.1-REVIEW-FIX CR-01/CR-02): in an approval card, a task drafted without a milestone stays "No milestone" after you edit anything else; editing a `project_update` card doesn't clear existing tasks' due date / priority / milestone. Note: once a conversation has read repo files, issues, PRs or commit messages, any side-effecting tool now asks for approval even if you set it to auto (intended security floor, 05.1 WR-01/WR-02).
