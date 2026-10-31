param([string]$PostgresBin)

$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
if (-not $PostgresBin) {
  $PostgresBin = Split-Path -Parent (Get-Command initdb.exe -ErrorAction Stop).Source
}
foreach ($program in @('initdb.exe', 'pg_ctl.exe', 'createdb.exe')) {
  if (-not (Test-Path -LiteralPath (Join-Path $PostgresBin $program))) {
    throw "PostgreSQL executable missing: $program"
  }
}
$cacheRoot = Join-Path $workspace 'node_modules\.cache'
New-Item -ItemType Directory -Path $cacheRoot -Force | Out-Null
$cacheRoot = (Resolve-Path -LiteralPath $cacheRoot).Path
$runId = [guid]::NewGuid().ToString('N')
$cluster = Join-Path $cacheRoot "matching-pg-$runId"
$database = "ktb_matching_test_$runId"
$serverLog = Join-Path $cacheRoot "matching-pg-$runId.log"
$savedConnection = $env:MATCHING_TEST_DATABASE_URL
$started = $false
$testExitCode = 1

# Choose a separate loopback port; the user's installed database service is not used.
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
$listener.Start()
$port = $listener.LocalEndpoint.Port
$listener.Stop()

Push-Location $workspace
try {
  & node 'apps/api/node_modules/typescript/bin/tsc' --project 'packages/shared-types/tsconfig.json'
  if ($LASTEXITCODE -ne 0) { throw 'Shared type compilation failed' }

  & (Join-Path $PostgresBin 'initdb.exe') -D $cluster -U ktb_matching_test --auth=trust --encoding=UTF8 --locale=C --no-instructions *> "$serverLog.init"
  if ($LASTEXITCODE -ne 0) { Get-Content -LiteralPath "$serverLog.init"; throw 'Test PostgreSQL initialization failed' }

  $started = $true
  & (Join-Path $PostgresBin 'pg_ctl.exe') -D $cluster -l $serverLog -o "-h 127.0.0.1 -p $port -F" -w start
  if ($LASTEXITCODE -ne 0) { throw "Test PostgreSQL startup failed. See $serverLog" }
  & (Join-Path $PostgresBin 'createdb.exe') -h 127.0.0.1 -p $port -U ktb_matching_test $database
  if ($LASTEXITCODE -ne 0) { throw 'Could not create the isolated test database' }

  $env:MATCHING_TEST_DATABASE_URL = "postgresql://ktb_matching_test@127.0.0.1:$port/$database"
  Write-Output "Running booking concurrency tests on isolated PostgreSQL port $port."
  Push-Location (Join-Path $workspace 'apps/api')
  try {
    & node 'node_modules/jest/bin/jest.js' --config './test/jest-matching-concurrency.json' --runInBand --cacheDirectory='../../node_modules/.cache/matching-integration-jest'
    $testExitCode = $LASTEXITCODE
  } finally {
    Pop-Location
  }
} finally {
  $env:MATCHING_TEST_DATABASE_URL = $savedConnection
  $stopped = -not $started
  if ($started) {
    & (Join-Path $PostgresBin 'pg_ctl.exe') -D $cluster -m fast -w stop
    $stopped = $LASTEXITCODE -eq 0
  }
  if ($stopped -and (Test-Path -LiteralPath $cluster)) {
    # Only remove this run's generated directory after its server has stopped.
    $resolvedCluster = (Resolve-Path -LiteralPath $cluster).Path
    $expectedName = "matching-pg-$runId"
    if (-not $resolvedCluster.StartsWith($cacheRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -or
        (Split-Path -Leaf $resolvedCluster) -ne $expectedName) {
      throw 'Refusing cleanup outside the generated test cache directory'
    }
    Remove-Item -LiteralPath $resolvedCluster -Recurse -Force
  }
  if (-not $stopped) {
    $testExitCode = 1
    Write-Warning "Test server cleanup failed; inspect $cluster before removing it."
  }
  Pop-Location
}
exit $testExitCode
