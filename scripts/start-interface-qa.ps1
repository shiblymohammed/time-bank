$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
$qaRoot = Join-Path $workspace 'node_modules\.cache\interface-qa'
New-Item -ItemType Directory -Force $qaRoot | Out-Null
$pg = 'C:\Program Files\PostgreSQL\18\bin'
if (-not (Test-Path -LiteralPath (Join-Path $workspace 'apps/api/dist/main.js'))) { throw 'Build the API before starting interface QA' }
$cluster = Join-Path $qaRoot ('pg-' + [guid]::NewGuid().ToString('N'))
$database = 'ktb_interface_qa_' + [guid]::NewGuid().ToString('N')
foreach ($listenPort in @(3000,3001,15449)) {
  $probe = [Net.Sockets.TcpClient]::new()
  try { $probe.Connect('127.0.0.1',$listenPort); throw "Port $listenPort is already occupied; stop the existing QA run before starting another." } catch [Net.Sockets.SocketException] {} finally { $probe.Dispose() }
}
$port = 15449
& "$pg\initdb.exe" -D $cluster -U ktb_interface_qa --auth=trust --encoding=UTF8 --locale=C --no-instructions *> "$qaRoot\init.log"
if ($LASTEXITCODE -ne 0) { throw 'QA database initialization failed' }
& "$pg\pg_ctl.exe" -D $cluster -l "$qaRoot\postgres.log" -o "-h 127.0.0.1 -p $port -F" -w start
if ($LASTEXITCODE -ne 0) { throw 'QA database startup failed' }
@{cluster=$cluster;port=$port;database=$database} | ConvertTo-Json | Set-Content "$qaRoot\state.json"
& "$pg\createdb.exe" -h 127.0.0.1 -p $port -U ktb_interface_qa $database
$environmentKeys = @('UI_QA_DATABASE_URL','DATABASE_URL','NODE_ENV','API_PORT','SMS_PROVIDER','AUTH_ALLOW_DEV_HEADERS','JWT_SECRET','API_INTERNAL_URL','DASHBOARD_ORIGIN')
$savedEnvironment = @{}
foreach ($key in $environmentKeys) { $savedEnvironment[$key] = [Environment]::GetEnvironmentVariable($key) }
try {
$env:UI_QA_DATABASE_URL = "postgresql://ktb_interface_qa@127.0.0.1:$port/$database"
& node "$workspace\scripts\interface-qa-fixture.cjs"
if ($LASTEXITCODE -ne 0) { throw 'QA fixture creation failed' }
$env:DATABASE_URL = $env:UI_QA_DATABASE_URL
$env:NODE_ENV = 'development'
$env:API_PORT = '3001'
$env:API_INTERNAL_URL = 'http://127.0.0.1:3001'
$env:DASHBOARD_ORIGIN = 'http://127.0.0.1:3000'
$env:SMS_PROVIDER = 'local-mock'
$env:AUTH_ALLOW_DEV_HEADERS = 'false'
$env:JWT_SECRET = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
$api = Start-Process node -ArgumentList 'dist/main.js' -WorkingDirectory "$workspace\apps\api" -WindowStyle Hidden -RedirectStandardOutput "$qaRoot\api.log" -RedirectStandardError "$qaRoot\api-error.log" -PassThru
$web = Start-Process node -ArgumentList 'node_modules/next/dist/bin/next','dev','--port','3000','--hostname','127.0.0.1' -WorkingDirectory "$workspace\apps\web" -WindowStyle Hidden -RedirectStandardOutput "$qaRoot\web.log" -RedirectStandardError "$qaRoot\web-error.log" -PassThru
@{cluster=$cluster;port=$port;database=$database;apiPid=$api.Id;webPid=$web.Id} | ConvertTo-Json | Set-Content "$qaRoot\state.json"
} finally {
  foreach ($key in $environmentKeys) { [Environment]::SetEnvironmentVariable($key, $savedEnvironment[$key]) }
}
Write-Output 'Disposable interface QA services started on API 3001, web 3000.'
