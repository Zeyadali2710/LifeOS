# LifeOS development agent protocol

This protocol applies to development agents, not the agents running inside LifeOS. Git, approved GSD artifacts, accepted ADRs, and verified checkpoints are the source of truth. A model's conversation is not.

## Roles and ownership

- **Owner:** Approves plans and major architecture, security, destructive, production, infrastructure, external-service, credential, and dependency decisions. Accepts completed work.
- **Claude Code:** May plan, implement, debug, and review when available. It owns only tasks explicitly assigned to it.
- **Codex:** May independently plan, implement, debug, test, and verify. It is the normal implementation provider and the fallback when a router-managed Claude call exhausts usage.
- **OpenRouter development worker:** Disabled. If later configured, it may receive only isolated low-risk work with deterministic checks. It must never receive secrets or private repository content without explicit owner permission. It must not touch authentication, authorization, credentials, agent permissions, migrations, financial logic, or deployment security. This is separate from LifeOS's in-product OpenRouter routing.

One task has one active provider. Concurrent tasks use separate worktrees or isolated branches. Neither Claude nor Codex permanently owns GSD. Returning to Claude does not automatically transfer a Codex task.

## Before work

1. Read `AGENTS.md`, this file, `.planning/STATE.md`, the assigned approved plan, and relevant ADRs or source files.
2. Check Git branch, status, current task contract, and the last verified checkpoint. Never overwrite another agent's uncommitted work.
3. Confirm task scope: objective, plan, files, acceptance criteria, verification commands, and security constraints. If the plan is a draft or GSD says `ready_to_plan`, seek owner approval before executing it.
4. Use the smallest change that completes the task. Do not change unrelated application behavior or advance another GSD phase.

## Execution and safety

- The PowerShell router in `scripts/dev-router.ps1` stores one contract per task in the ignored `.dev-router/tasks` directory. Its `approve` action is an explicit owner checkpoint. `run` refuses unapproved tasks, changed worktrees, and concurrent runs. The lock and checkpoint allow recovery after a crash. It never commits, pushes, merges, migrates, deploys, or calls OpenRouter.
- Router Codex calls use `workspace-write` and `-a never`. Commands that need broader access fail and must be brought to the owner. Never use sandbox-bypass flags for this workflow. Claude's own permission controls still apply when selected; do not preapprove broad tools.
- Before any major architectural change, auth redesign, agent permission change, destructive DB action, production deployment, security-affecting infrastructure change, external action, credential handling outside established procedures, or significant dependency change, stop and obtain explicit owner approval. The router's task approval does not authorize these later actions.
- Never weaken existing authorization, validation, tests, or GSD security gates. Do not expose secrets in prompts, logs, commits, or worker payloads. The router refuses API-key environment variables before invoking subscription providers.
- Keep `.planning/config.json` gates intact; do not turn on `cross_ai_execution` without a separate reviewed decision.

## Verification and handoff

Run focused checks first, then relevant `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, or `npm run e2e` checks. Report what actually ran. A result in `review` is not accepted: the owner inspects the diff, verification evidence, and `report` output before marking the task `complete`. Update GSD state only through its own acceptance gates. Do not independently change the roadmap or mark a phase complete.

Every handoff includes task ID, status, changed files, checks and results, decisions, remaining work, and the next verified checkpoint. On interruption, inspect the workspace and last log before `resume`. An automatically detected Claude usage limit can move a router-managed call to Codex only if Claude changed no workspace files. Authentication, network, and ordinary errors remain interrupted for diagnosis. Arbitrary interactive Claude sessions are outside this failover mechanism.
