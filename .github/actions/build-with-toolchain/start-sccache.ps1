# Start inside each compilation step, before parallel compiler launches.
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false

if (-not (Get-Command sccache -ErrorAction SilentlyContinue)) {
    throw 'sccache not on PATH although compiler caching was requested'
}

if ([string]::IsNullOrWhiteSpace($env:SCCACHE_DIR)) {
    if (-not [string]::IsNullOrWhiteSpace($env:RUNNER_TEMP)) {
        $env:SCCACHE_DIR = Join-Path $env:RUNNER_TEMP 'sccache'
    } else {
        $env:SCCACHE_DIR = Join-Path $env:LOCALAPPDATA 'Mozilla\sccache\cache'
    }
}
New-Item -ItemType Directory -Force -Path $env:SCCACHE_DIR | Out-Null
if ([string]::IsNullOrWhiteSpace($env:SCCACHE_SERVER_PORT)) {
    $env:SCCACHE_SERVER_PORT = '4226'
}
$env:SCCACHE_IDLE_TIMEOUT = '0'

if ($env:GITHUB_ENV) {
    $utf8 = [System.Text.UTF8Encoding]::new($false)
    $nl = [Environment]::NewLine
    [System.IO.File]::AppendAllText(
        $env:GITHUB_ENV,
        "SCCACHE_DIR=$($env:SCCACHE_DIR)$nl" +
        "SCCACHE_SERVER_PORT=$($env:SCCACHE_SERVER_PORT)$nl" +
        "SCCACHE_IDLE_TIMEOUT=0$nl",
        $utf8)
}

# A server left from this same job is not usable across steps. Drop it so
# this step binds the port itself. A refused connection here is expected.
& sccache --stop-server 2>&1 | Out-Null

$start = & sccache --start-server 2>&1
if ($LASTEXITCODE -ne 0) {
    $start | ForEach-Object { Write-Host $_ }
    throw "sccache --start-server failed ($LASTEXITCODE)"
}

$stats = & sccache --zero-stats 2>&1
if ($LASTEXITCODE -ne 0) {
    $stats | ForEach-Object { Write-Host $_ }
    throw "sccache server is not accepting clients ($LASTEXITCODE)"
}

Write-Host "sccache server up (dir=$($env:SCCACHE_DIR) port=$($env:SCCACHE_SERVER_PORT))"
