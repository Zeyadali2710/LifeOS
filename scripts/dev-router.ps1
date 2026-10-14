param(
  [ValidateSet('status','plan','new','approve','run','resume','report','complete')][string]$Action = 'status',
  [string]$Id,
  [string]$Objective,
  [string]$Plan,
  [ValidateSet('codex','claude','auto')][string]$Provider = 'codex',
  [ValidateSet('lightweight','standard','advanced','critical')][string]$Tier = 'standard',
  [string]$Model,
  [ValidateSet('low','medium','high','xhigh','max','ultra')][string]$Reasoning,
  [switch]$CodexOnly,
  [switch]$AllowDirty,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$tasks = Join-Path $root '.dev-router/tasks'
$config = Get-Content (Join-Path $PSScriptRoot 'dev-router.json') -Raw | ConvertFrom-Json

function Save-Task($task) {
  New-Item -ItemType Directory -Force -Path $tasks | Out-Null
  $path = Join-Path $tasks "$($task.id).json"
  $tmp = "$path.tmp"
  $task | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $tmp -Encoding utf8
  Move-Item -LiteralPath $tmp -Destination $path -Force
}
function Get-Task($id) {
  if ($id -notmatch '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$') { throw 'Use a short task ID with letters, digits, _ or -.' }
  $path = Join-Path $tasks "$id.json"
  if (!(Test-Path -LiteralPath $path)) { throw "Task $id does not exist." }
  Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
}
function Git-Status { (git -C $root status --porcelain=v1 --untracked-files=normal | Where-Object { $_ -notmatch '^\?\? \.dev-router/' }) -join "`n" }
function Git-Fingerprint {
  $changes = git -C $root diff --binary HEAD | Out-String
  $newFiles = git -C $root ls-files --others --exclude-standard | Where-Object { $_ -notmatch '^\.dev-router/' } | ForEach-Object {
    "$($_):$((Get-FileHash -LiteralPath (Join-Path $root $_) -Algorithm SHA256).Hash)"
  }
  $bytes = [Text.Encoding]::UTF8.GetBytes("$changes`n$($newFiles -join "`n")")
  $hash = [Security.Cryptography.SHA256]::Create()
  try { [BitConverter]::ToString($hash.ComputeHash($bytes)).Replace('-', '') }
  finally { $hash.Dispose() }
}
function Resolve-Model($tier, $override, $effort) {
  $homePath = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $HOME '.codex' }
  $cachePath = Join-Path $homePath 'models_cache.json'
  if (!(Test-Path -LiteralPath $cachePath)) { throw 'Codex model catalog missing. Run Codex once to refresh it.' }
  $cache = Get-Content -LiteralPath $cachePath -Raw | ConvertFrom-Json
  $name = if ($override) { $override } else { $config.tiers.$tier.model }
  $level = if ($effort) { $effort } else { $config.tiers.$tier.reasoning }
  $item = $cache.models | Where-Object { $_.slug -eq $name -and $_.visibility -eq 'list' } | Select-Object -First 1
  if (!$item -or $level -notin @($item.supported_reasoning_levels.effort)) { throw "Unsupported Codex model/effort: $name/$level" }
  @{ model = $name; reasoning = $level }
}
function Is-UsageLimit($output) {
  $output -match '(?i)(usage limit|usage allowance|rate limit reached|you.ve reached your limit|out of (usage|credits))'
}
function Invoke-Provider($name, $task, $route, $prompt) {
  if ($name -eq 'codex') {
    if ($env:OPENAI_API_KEY) { throw 'OPENAI_API_KEY is set; remove it to keep Codex on ChatGPT subscription authentication.' }
    $args = @('-a','never','exec','-C',$root,'-s','workspace-write','-m',$route.model,'-c',"model_reasoning_effort=$($route.reasoning)",'-')
    $output = @($prompt | & codex @args 2>&1 | ForEach-Object { Write-Host $_; $_ }) -join "`n"
  } else {
    if ($env:ANTHROPIC_API_KEY -or $env:ANTHROPIC_BASE_URL) { throw 'Claude API environment is set; remove it before using subscription-based Claude routing.' }
    # Claude CLI is never invoked during setup; -p is only used after the owner selects Claude or auto.
    $output = @(& claude -p $prompt 2>&1 | ForEach-Object { Write-Host $_; $_ }) -join "`n"
  }
  @{ code = $LASTEXITCODE; output = $output }
}
function Run-Task($task, [bool]$isResume) {
  New-Item -ItemType Directory -Force -Path $tasks | Out-Null
  $lock = [System.IO.File]::Open((Join-Path $tasks "$($task.id).lock"), 'OpenOrCreate', 'ReadWrite', 'None')
  try {
  if (!$task.approved) { throw 'Owner approval required: review the plan and run approve first.' }
  if ($task.state -eq 'running' -and !$isResume) { throw 'Task is already running. Inspect its checkpoint before resuming.' }
  if ($task.state -eq 'complete') { throw 'Task already completed.' }
  $current = Git-Fingerprint
  if ($current -ne $task.gitFingerprint -and !$AllowDirty) { throw 'Working tree changed since the checkpoint. Inspect changes, then use -AllowDirty if they belong to this task.' }
  $route = Resolve-Model $task.tier $Model $Reasoning
  $selected = if ($CodexOnly -or $task.provider -eq 'codex') { 'codex' } elseif ($task.provider -eq 'claude') { 'claude' } else { 'claude' }
  $prompt = "Task $($task.id): $($task.objective)`nApproved GSD plan: $($task.plan). Read AGENTS.md, AGENT_HANDOFF.md, the plan, and current Git state. Continue from checkpoint: $($task.checkpoint). Work only within the approved plan. Do not update GSD phase status, commit, push, deploy, migrate, or perform external actions. Stop for owner approval where AGENT_HANDOFF.md requires it. Report changes, verification, and next checkpoint."
  if ($DryRun) { [pscustomobject]@{ id=$task.id; provider=$selected; model=$route.model; reasoning=$route.reasoning; checkpoint=$task.checkpoint; plan=$task.plan }; return }
  $task.state = 'running'; $task.owner = $selected; $task.gitFingerprint = $current; Save-Task $task
  try {
    $result = Invoke-Provider $selected $task $route $prompt
    if ($selected -eq 'claude' -and $result.code -ne 0 -and (Is-UsageLimit $result.output) -and (Git-Fingerprint) -eq $current) {
      $task.checkpoint = 'Claude usage exhausted before workspace changes; Codex taking ownership.'
      $task.owner = 'codex'; Save-Task $task
      $result = Invoke-Provider 'codex' $task $route $prompt
    }
    $log = Join-Path $tasks "$($task.id).last.txt"
    Set-Content -LiteralPath $log -Value $result.output -Encoding utf8
    $task.state = if ($result.code -eq 0) { 'review' } else { 'interrupted' }
    $task.checkpoint = if ($result.code -eq 0) { 'Agent finished; owner must review result and verification before completion.' } else { "Provider exited $($result.code); inspect last log and workspace before resume." }
    $task.gitFingerprint = Git-Fingerprint; Save-Task $task
    Write-Output "State: $($task.state). Log: $log"
    if ($result.code -ne 0) { throw "Provider exited $($result.code)." }
  } catch {
    if ($task.state -eq 'running') { $task.state = 'interrupted'; $task.checkpoint = 'Invocation interrupted; inspect workspace before resume.'; $task.gitFingerprint = Git-Fingerprint; Save-Task $task }
    throw
  }
  } finally { $lock.Dispose() }
}

if ($MyInvocation.InvocationName -eq '.') { return }
switch ($Action) {
  'status' {
    Write-Output "Git: $(git -C $root branch --show-current); dirty: $([bool](Git-Status))"
    Write-Output "GSD: $((Get-Content (Join-Path $root '.planning/STATE.md') | Select-String '^status:').Line)"
    foreach ($name in @('lightweight','standard','advanced','critical')) { $r = Resolve-Model $name '' ''; Write-Output "$name`: $($r.model)/$($r.reasoning)" }
    if (Test-Path $tasks) { Get-ChildItem $tasks -Filter '*.json' | ForEach-Object { Get-Content $_.FullName -Raw | ConvertFrom-Json | Select-Object id,state,owner,plan,checkpoint } }
  }
  'plan' {
    $workflow = Join-Path $HOME '.claude/get-shit-done/workflows/plan-phase.md'
    if (!(Test-Path $workflow)) { throw 'Installed GSD plan-phase workflow not found.' }
    $route = Resolve-Model 'advanced' $Model $Reasoning
    $prompt = "Plan the current GSD phase using the installed GSD workflow at $workflow. Read AGENTS.md, AGENT_HANDOFF.md, .planning/STATE.md, ROADMAP.md, the current phase context and UI spec, and any existing draft plans. Preserve the existing planning artifacts. Research and verify as required by GSD. Do not execute application plans or mark a phase complete. Stop for owner approval at GSD gates."
    if ($DryRun) { Write-Output "Codex plan: $($route.model)/$($route.reasoning) via $workflow"; break }
    Write-Host 'Starting Codex planning. Agent output will appear as it arrives.'
    $result = Invoke-Provider 'codex' @{} $route $prompt
    if ($result.code -ne 0) { throw "Codex planning exited $($result.code)." }
  }
  'new' {
    if (!$Id -or !$Objective -or !$Plan) { throw 'new requires -Id, -Objective, and -Plan.' }
    if ($Id -notmatch '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$') { throw 'Invalid task ID.' }
    if (Test-Path (Join-Path $tasks "$Id.json")) { throw "Task $Id already exists." }
    $state = Get-Content (Join-Path $root '.planning/STATE.md') -Raw
    $phase = [regex]::Match($state, '(?m)^Phase: (\d+)').Groups[1].Value
    if (!$phase -or !$Plan.StartsWith($phase)) { throw "Plan must belong to current Phase $phase." }
    $planPath = Get-ChildItem (Join-Path $root '.planning/phases') -Directory | Where-Object { $_.Name -match "^$phase-" } | ForEach-Object { Join-Path $_.FullName "$Plan-PLAN.md" } | Where-Object { Test-Path $_ } | Select-Object -First 1
    if (!$planPath) { throw "Plan $Plan not found in current Phase $phase." }
    $dirty = Git-Status
    if ($dirty -and !$AllowDirty) { throw 'Working tree is dirty. Review it, then pass -AllowDirty to record its baseline.' }
    $task = @{ id=$Id; objective=$Objective; plan=$Plan; provider=$Provider; tier=$Tier; approved=$false; state='pending_approval'; owner=''; checkpoint='Created; no agent run yet.'; gitFingerprint=(Git-Fingerprint) }
    Save-Task $task; Write-Output "Created $Id. Review $planPath, then approve."
  }
  'approve' { $task=Get-Task $Id; if ($task.state -ne 'pending_approval') { throw 'Only a pending task can be approved.' }; $task.approved=$true; $task.state='ready'; $task.checkpoint='Owner approved plan and task scope.'; Save-Task $task; Write-Output "Approved $Id." }
  'run' { $task=Get-Task $Id; if ($task.state -ne 'ready') { throw 'Task must be ready. Use resume for interrupted work.' }; Run-Task $task $false }
  'resume' { $task=Get-Task $Id; if ($task.state -notin @('interrupted','running')) { throw 'Only interrupted tasks can resume. Review completed agent output separately.' }; Run-Task $task $true }
  'report' { $task=Get-Task $Id; $task | ConvertTo-Json -Depth 8; $log=Join-Path $tasks "$Id.last.txt"; if (Test-Path $log) { Get-Content $log -Tail 40 } }
  'complete' { $task=Get-Task $Id; if ($task.state -ne 'review') { throw 'Task must be in review before completion.' }; $task.state='complete'; $task.checkpoint='Owner accepted the verified result.'; Save-Task $task; Write-Output "Completed $Id. GSD phase state was not changed." }
}
