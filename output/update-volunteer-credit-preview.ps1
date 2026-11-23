$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path '.').Path
$qaRoot = Join-Path $workspace 'node_modules/.cache/shop-wallet-preview'
$stateFile = Join-Path $qaRoot 'state.json'
$state = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
if ($state.apiPort -ne 3111 -or $state.database -notmatch '^ktb_interface_qa_[a-f0-9]+$') { throw 'This is not the expected disposable preview.' }
$current = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $state.apiPid)
if ($current.Name -ne 'node.exe' -or $current.CommandLine -notmatch 'dist[/\\]main.js') { throw 'The preview API process has changed.' }
$listener = Get-NetTCPConnection -LocalPort 3111 -State Listen | Select-Object -First 1
if ($listener.OwningProcess -ne $state.apiPid) { throw 'Port 3111 belongs to a different process.' }
$keys = @('DATABASE_URL','NODE_ENV','API_PORT','API_HOST','SMS_PROVIDER','EMAIL_PROVIDER','AUTH_ALLOW_MOCK_OTP','AUTH_ALLOW_DEV_HEADERS','JWT_SECRET','DASHBOARD_ORIGIN')
$previous = @{}
foreach ($key in $keys) { $previous[$key] = [Environment]::GetEnvironmentVariable($key) }
try {
  $env:DATABASE_URL = 'postgresql://ktb_interface_qa@127.0.0.1:' + $state.port + '/' + $state.database
  $env:NODE_ENV = 'development'
  $env:API_PORT = '3111'
  $env:API_HOST = '127.0.0.1'
  $env:SMS_PROVIDER = 'local-mock'
  $env:EMAIL_PROVIDER = 'local-mock'
  $env:AUTH_ALLOW_MOCK_OTP = 'true'
  $env:AUTH_ALLOW_DEV_HEADERS = 'false'
  $env:JWT_SECRET = [IO.File]::ReadAllText((Join-Path $qaRoot '.qa-jwt-secret')).Trim()
  $env:DASHBOARD_ORIGIN = 'http://127.0.0.1:3110'
  & node apps/api/node_modules/typeorm/cli.js migration:run -d apps/api/dist/database/data-source.js *> output/volunteer-credit-preview-migration.log
  if ($LASTEXITCODE -ne 0) { Get-Content output/volunteer-credit-preview-migration.log -Tail 18; throw 'The preview migration failed; the running API has not been stopped.' }
  Stop-Process -Id $state.apiPid -Force
  $api = Start-Process node -ArgumentList 'dist/main.js' -WorkingDirectory (Join-Path $workspace 'apps/api') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $qaRoot 'volunteer-credit-api.log') -RedirectStandardError (Join-Path $qaRoot 'volunteer-credit-api-error.log') -PassThru
  $state.apiPid = $api.Id
  $state | ConvertTo-Json | Set-Content -LiteralPath $stateFile
  $ready = $false
  for ($attempt=0; $attempt -lt 40; $attempt++) {
    try { $response = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:3111/api/health/ready' -TimeoutSec 2; if ($response.StatusCode -eq 200) { $ready=$true; break } } catch {}
    Start-Sleep -Milliseconds 400
  }
  if (!$ready) { Get-Content (Join-Path $qaRoot 'volunteer-credit-api-error.log') -Tail 12; throw 'The updated preview API did not become ready.' }
  Write-Output 'Updated only the disposable API on port 3111; migrations and readiness verified.'
} finally {
  foreach ($key in $keys) { [Environment]::SetEnvironmentVariable($key, $previous[$key]) }
}
