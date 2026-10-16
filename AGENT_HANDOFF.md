# LifeOS development workflow

Applies to development agents, not the agents inside LifeOS. Git, source, tests and `.planning/STATE.md` are the shared memory; a model's conversation is not. GSD and the PowerShell router were retired on 2026-10-16/17 (both are in Git history).

## Roles

- **Owner:** sets priorities, approves production deploys, destructive data actions, new external access/credentials, major architecture or security changes. Tests on the homelab VM.
- **Claude Code (orchestrator):** plans each phase, splits it into tasks, writes the risky code itself, dispatches mechanical tasks, merges review findings and makes the fixes.
- **Codex (critic and reviewer):** reviews the phase plan before work starts and reviews the full phase diff at the end. May execute mechanical tasks with the light tier. Runs headless from the orchestrator:
  ```bash
  codex exec -s read-only --ephemeral -o review.md "<instructions>"   # plan critique or diff review
  codex review --base <sha>                                          # standard review of a phase branch
  ```
- **Light executors:** Claude Sonnet/Haiku subagents or Codex `gpt-6-luna`. Only well-specified tasks with an exact file list.

One task has one active implementer. Parallel implementers need separate worktrees.

## Who writes what

| Orchestrator writes it | Light executor may write it |
|---|---|
| auth, sessions, owner checks | UI components to an agreed spec |
| agent tools, permissions, approvals, privacy taint | tests for already-written logic |
| money, imports, dedupe, migrations with data changes | docs, copy, additive schema scaffolding |
| concurrency, locking, idempotency, external writes | simple owner-only CRUD following an existing pattern |

## Phase loop

1. **Plan:** short phase section in `.planning/ROADMAP.md` (goal, scope, tasks, risks). Codex critiques it once; fix or note disagreements.
2. **Build:** one commit per task. Each task passes the focused tests, then the full suite before the next starts.
3. **Double review:** Codex reviews the phase diff while Claude reviews independently. Claude merges findings, fixes critical/warning items once, notes the rest.
4. **Gate and push:** the definition of done below, then push to `main` and record the phase in `.planning/STATE.md`. Owner deploys and tests on the VM.

Small one-off requests skip the loop: implement directly, then run the gate.

## Definition of done

```bash
npm run typecheck && npm run lint
npx vitest run          # FULL suite: unit + DB (needs TEST_DATABASE_ADMIN_URL, local docker Postgres on 5433)
npm run build && npm run build:worker
npx playwright test     # when UI changed (full suite, not just the touched spec)
```

Report what actually ran. Never skip or weaken a test to go green; fix the test only when the behaviour change was intended. GitHub CI runs the same gate on every push to `main`; check it after pushing.

Windows notes: set `TEMP`/`TMP` to the ignored `test-results/vitest-tmp`; never put temp files in `.next`. Playwright clears `test-results` and uses the disposable `lifeos_e2e` database, so don't run Vitest and Playwright at the same time.

## Safety (unchanged by the workflow change)

Keep owner authentication, validation, approval tiers (config can't lower a tool's floor), privacy boundaries, audit records and idempotency. Never commit secrets, private financial files or real transaction fixtures. `.codex/` stays local and ignored. In-product OpenRouter routing is separate from development providers; development workers on OpenRouter stay disabled.

## Handoff

On interruption, inspect `git status`/`git log` and the last STATE entry, then resume from the last verified commit. A handoff lists: what changed, checks run and results, decisions, owner blockers (also in `.planning/OWNER-ACTIONS.md`).
