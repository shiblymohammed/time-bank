$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
$qaRoot = Join-Path $workspace 'node_modules\.cache\interface-qa'
$statePath = Join-Path $qaRoot 'state.json'
if (-not (Test-Path -LiteralPath $statePath)) { throw 'No interface QA state found' }
$qaState = Get-Content -LiteralPath $statePath | ConvertFrom-Json
foreach ($processId in @($qaState.apiPid,$qaState.webPid,$qaState.mobilePid)) {
  if (-not $processId) { continue }
  $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId=$processId"
  if ($processInfo -and $processInfo.Name -eq 'node.exe' -and $processInfo.CommandLine -match '(dist/main.js|next/dist/bin/next|interface-qa.*serve-mobile)') {
    & taskkill.exe /PID $processId /T /F | Out-Null
  }
}
$cacheAbsolute = [IO.Path]::GetFullPath($qaRoot).TrimEnd('\')
$clusterAbsolute = [IO.Path]::GetFullPath($qaState.cluster)
if (-not $clusterAbsolute.StartsWith($cacheAbsolute + '\', [StringComparison]::OrdinalIgnoreCase) -or (Split-Path -Leaf $clusterAbsolute) -notmatch '^pg-[a-f0-9]{32}$') { throw 'Unexpected QA cluster location; refusing cleanup' }
if (Test-Path -LiteralPath $clusterAbsolute) {
  & 'C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe' -D $clusterAbsolute -m fast -w stop
  if ($LASTEXITCODE -ne 0) { throw 'Could not stop QA PostgreSQL; preserving its files' }
  Remove-Item -LiteralPath $clusterAbsolute -Recurse -Force
}
Remove-Item -LiteralPath $statePath
Write-Output 'Stopped local QA services and removed only their disposable database.'
