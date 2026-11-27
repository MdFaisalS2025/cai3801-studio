# Runs the real classroom version of the Studio on this computer.
#
#   .\start-local.ps1            only this computer (http://localhost:8080)
#   .\start-local.ps1 -Share     also gives a temporary public https link for teammates
#                                 (needs cloudflared: winget install --id Cloudflare.cloudflared)
#
# Data is kept in platform\backend\data\classroom.db, so accounts survive a restart.
# The first time, the setup code is printed below. Open /setup with it to create the faculty account.

param([switch]$Share, [int]$Port = 8080)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$backend = Join-Path $root 'platform\backend'

Write-Host 'Building the site...'
node (Join-Path $root 'build-site.js') | Out-Null

if (-not (Test-Path (Join-Path $backend 'node_modules'))) {
  Write-Host 'Installing server packages (first run only)...'
  Push-Location $backend; npm install --no-audit --no-fund; Pop-Location
}

$env:PORT = "$Port"
$env:HOST = '127.0.0.1'
$env:CLASS_STORE = 'sqlite'
$env:CLASS_DB = (Join-Path $backend 'data\classroom.db')
$env:LLM_PROVIDER = 'none'
$env:SITE_DIR = (Join-Path $root 'site')

if ($Share) {
  # A fresh install isn't on PATH until a new window opens, so also look in the install folders.
  $cf = @((Get-Command cloudflared -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source),
          "$env:ProgramFiles\cloudflared\cloudflared.exe", "${env:ProgramFiles(x86)}\cloudflared\cloudflared.exe") |
        Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
  if (-not $cf) {
    Write-Host 'cloudflared is not installed. Install it with:  winget install --id Cloudflare.cloudflared'
    exit 1
  }
  Write-Host 'Starting a temporary public link. Look for the https://...trycloudflare.com address below.'
  Write-Host 'It works only while this window stays open and this computer is awake.'
  $tunnel = Start-Process $cf -ArgumentList @('tunnel', '--url', "http://localhost:$Port") -PassThru -NoNewWindow
}

Write-Host "Studio: http://localhost:$Port   (press Ctrl+C to stop)"
try {
  Push-Location $backend
  node classroom/server.js
} finally {
  Pop-Location
  if ($tunnel) { Stop-Process -Id $tunnel.Id -ErrorAction SilentlyContinue }
}
