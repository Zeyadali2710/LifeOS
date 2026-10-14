$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'dev-router.ps1')
$tasks = Join-Path $root ".dev-router/test-$PID"
$partial = Join-Path $root "scripts/__router_partial_test_$PID.txt"
if (Test-Path -LiteralPath $partial) { throw "Refusing to overwrite $partial" }
New-Item -ItemType Directory -Force -Path $tasks | Out-Null
$script:calls = @()
$script:responses = @()
function Invoke-Provider($name, $task, $route, $prompt) {
  $script:calls += $name
  $next = $script:responses[0]
  $script:responses = @($script:responses | Select-Object -Skip 1)
  if ($next.touch) { Set-Content -LiteralPath $partial -Value 'partial edit' }
  $next
}
function Assert($ok, $message) { if (!$ok) { throw $message } }
function Test-Task($id, $provider = 'codex') {
  @{ id=$id; objective='Verify router'; plan='07-01'; provider=$provider; tier='standard'; approved=$true; state='ready'; owner=''; checkpoint='verified baseline'; gitFingerprint=(Git-Fingerprint) }
}
try {
  $route = Resolve-Model 'lightweight' '' ''
  Assert ($route.model -eq 'gpt-6-luna' -and $route.reasoning -eq 'low') 'lightweight route'
  $route = Resolve-Model 'standard' 'gpt-6-astra' 'high'
  Assert ($route.model -eq 'gpt-6-astra' -and $route.reasoning -eq 'high') 'override route'
  $failed = $false; try { Resolve-Model 'standard' 'invented-model' 'low' | Out-Null } catch { $failed=$true }
  Assert $failed 'unknown model must fail'

  $script:responses = @(@{code=0;output='done'})
  $task = Test-Task 'normal'; Run-Task $task $false | Out-Null
  Assert ($task.state -eq 'review' -and ($script:calls -join ',') -eq 'codex') 'normal provider'

  $script:calls=@(); $script:responses=@(@{code=1;output='You have reached your usage limit'},@{code=0;output='done'})
  $task=Test-Task 'fallback' 'auto'; Run-Task $task $false | Out-Null
  Assert (($script:calls -join ',') -eq 'claude,codex' -and $task.owner -eq 'codex') 'usage fallback'

  $script:calls=@(); $script:responses=@(@{code=1;output='authentication failed'})
  $task=Test-Task 'auth-error' 'auto'; try { Run-Task $task $false | Out-Null } catch {}
  Assert (($script:calls -join ',') -eq 'claude' -and $task.state -eq 'interrupted') 'non-usage error must not fallback'

  $script:calls=@(); $script:responses=@(@{code=1;output='usage limit';touch=$true})
  $task=Test-Task 'partial-edit' 'auto'; try { Run-Task $task $false | Out-Null } catch {}
  Assert (($script:calls -join ',') -eq 'claude' -and $task.state -eq 'interrupted') 'partial edit must not fallback'
  Remove-Item -LiteralPath $partial

  $script:calls=@(); $script:responses=@(@{code=0;output='done'})
  $task=Test-Task 'codex-only' 'auto'; $CodexOnly=$true; Run-Task $task $false | Out-Null; $CodexOnly=$false
  Assert (($script:calls -join ',') -eq 'codex') 'codex-only'

  $task=Test-Task 'approval'; $task.approved=$false
  $failed=$false; try { Run-Task $task $false | Out-Null } catch { $failed=$true }
  Assert $failed 'approval gate'

  $task=Test-Task 'dirty'; $task.gitFingerprint='different'
  $failed=$false; try { Run-Task $task $false | Out-Null } catch { $failed=$true }
  Assert $failed 'dirty tree gate'

  $task=Test-Task 'recovery'; $task.state='running'; $script:responses=@(@{code=0;output='resumed'})
  $failed=$false; try { Run-Task $task $false | Out-Null } catch { $failed=$true }
  Assert $failed 'duplicate execution gate'
  Run-Task $task $true | Out-Null
  Assert ($task.state -eq 'review') 'crash recovery'

  Assert (Is-UsageLimit 'rate limit reached') 'usage classifier'
  Assert (!(Is-UsageLimit 'network failure')) 'network classifier'
  Write-Output 'dev-router mock tests passed'
} finally {
  if (Test-Path -LiteralPath $partial) { Remove-Item -LiteralPath $partial }
  Remove-Item -LiteralPath $tasks -Recurse -Force
}
