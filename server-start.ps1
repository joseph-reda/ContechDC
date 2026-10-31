$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $root

$node = Join-Path $root "runtime\node.exe"
$entry = Join-Path $root "backend\server.js"
$frontend = Join-Path $root "dist\index.html"
$logs = Join-Path $root "logs"
New-Item -ItemType Directory -Path $logs -Force | Out-Null
$log = Join-Path $logs "site.log"

if (-not (Test-Path -LiteralPath $node)) { throw "Node runtime is missing: $node" }
if (-not (Test-Path -LiteralPath $entry)) { throw "API entry point is missing: $entry" }
if (-not (Test-Path -LiteralPath $frontend)) { throw "Built frontend is missing: $frontend" }

# One production process serves the API and the built frontend on the existing URL.
$env:NODE_ENV = "production"
$env:HOST = "0.0.0.0"
$env:PORT = "5173"

# A previous task can leave a child process behind. The bundled executable is
# dedicated to this project, so only those processes are cleared on startup.
$previous = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
    Where-Object { $_.ExecutablePath -ieq $node }
foreach ($process in $previous) {
    Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
}
if ($previous) { Start-Sleep -Seconds 2 }

while ($true) {
    if ((Test-Path -LiteralPath $log) -and (Get-Item -LiteralPath $log).Length -gt 20MB) {
        Move-Item -LiteralPath $log -Destination (Join-Path $logs ("site-" + (Get-Date -Format 'yyyyMMdd-HHmmss') + ".log"))
    }
    Add-Content -LiteralPath $log -Value "Starting production server at $(Get-Date -Format o)"
    try {
        & $node $entry *>> $log
        $code = $LASTEXITCODE
        Add-Content -LiteralPath $log -Value "Server exited with code $code at $(Get-Date -Format o); restarting in 5 seconds"
    } catch {
        Add-Content -LiteralPath $log -Value "Server launch failed at $(Get-Date -Format o): $($_.Exception.Message); restarting in 5 seconds"
    }
    Start-Sleep -Seconds 5
}
