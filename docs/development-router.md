# Development router (Windows PowerShell)

The router manages **development providers**. It does not change LifeOS application model routing. Use it from the repository root with Windows PowerShell or PowerShell 7.

## Current state

GSD 1.42.3 is installed at `~/.claude/get-shit-done`. Codex CLI 0.162.0-alpha.17.2 is authenticated with ChatGPT. The local Codex model catalog supports the four tier entries in `scripts/dev-router.json`. Claude was not invoked during setup. The project is on `main`, Phase 7 is `ready_to_plan`, and `07-01`/`07-02` are draft plans. Review and approve them through GSD before execution. The existing `.codex/config.toml` Claude Design MCP entry and `.planning/config.json` gates remain intact.

On 2026-10-15, a real `plan` invocation launched Codex but its file-read tools stalled in the local Windows CLI runtime. The agent reported planning blocked without changing project files, while the CLI process remained open. The router now streams output, but this runtime issue is unresolved. If it recurs, press Ctrl+C and use the Codex desktop chat for GSD planning; do not treat silence as successful planning.

## Commands

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/dev-router.ps1 status
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/dev-router.ps1 plan -DryRun
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/dev-router.ps1 plan
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/dev-router.ps1 new -Id socials-backend -Objective 'Implement approved 07-01' -Plan 07-01 -Provider codex -Tier advanced -AllowDirty
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/dev-router.ps1 approve -Id socials-backend
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/dev-router.ps1 run -Id socials-backend -CodexOnly -DryRun
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/dev-router.ps1 run -Id socials-backend -CodexOnly
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/dev-router.ps1 report -Id socials-backend
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/dev-router.ps1 resume -Id socials-backend -CodexOnly
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/dev-router.ps1 complete -Id socials-backend
```

`-ExecutionPolicy Bypass` applies only to this PowerShell process; it does not change your saved machine policy. `-AllowDirty` records or accepts the exact current Git status after you have inspected it; it does not discard changes. Leave it off for a clean task. `approve` means the owner reviewed the specified plan and task scope. The router never approves a plan itself. For later Claude-first tasks, create with `-Provider auto`, then run without `-CodexOnly`. Use `-Provider claude` for an explicit Claude assignment. Model overrides are `-Model <catalog ID> -Reasoning <supported level>`; both are checked against the local Codex catalog. The default provider is Codex.

Tier selection is explicit and deterministic: lightweight = `gpt-6-luna/low`, standard = `gpt-6.1-sol/medium`, advanced = `gpt-6.1-sol/high`, critical = `gpt-6-astra/high`. The operator chooses a tier from the task's risk; the router does not guess from task prose. These catalog entries are a local snapshot and the script rejects missing models or unsupported reasoning levels. It uses ChatGPT authentication; API-key environment variables block an invocation rather than switch billing. It does not change a model mid-session.

The router writes task contracts and the last provider output to ignored `.dev-router/tasks`. Keep this directory private; it can contain task text and agent output. `status` shows contracts and routing. `report` shows one contract and the tail of its last output. After a crash, inspect Git and the log, then `resume`; a per-task file lock prevents a second live process from running the same task. A successful CLI exit moves the contract to `review`, not `complete` or GSD accepted. Failed calls become `interrupted`.

Automatic Claude-to-Codex fallback recognizes a Claude usage-limit error from a router-launched call. It only proceeds if Git status is unchanged. Other errors stop for diagnosis. It does not take over interactive Claude sessions, guarantee recovery of untracked ignored files, or infer a lost agent's private reasoning. OpenRouter development work is disabled. Enabling it later requires separate approval, isolation, scoped data sharing, a diff, and verification; a model advertised as free may still have limits or charges.

## Verification

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/dev-router.test.ps1
```

The test mocks providers. It does not spend Claude usage or API credits. Run application checks only when an application task touches them.
