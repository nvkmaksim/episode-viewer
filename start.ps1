<#
 Serves .\site on http://localhost:8099/ ; with -Tunnel also opens a public link (cloudflared quick tunnel).
 The public link is open to anyone who has it, changes at every tunnel start, and the PC has to stay on.
#>
param(
    [int]$Port = 8099,
    [switch]$Tunnel
)
$ErrorActionPreference = 'Stop'
$site = Join-Path $PSScriptRoot 'site'
if (-not (Test-Path (Join-Path $site 'data.json.gz'))) { throw 'No data in site\: run .\export.ps1 first' }

$server = Start-Process python -ArgumentList @((Join-Path $PSScriptRoot 'serve.py'), $site, '--port', $Port) `
    -PassThru -WindowStyle Hidden
Start-Sleep 1
Write-Host "Viewer: http://localhost:$Port/"

if ($Tunnel) {
    $exe = (Get-Command cloudflared -ErrorAction SilentlyContinue).Source
    if (-not $exe) { $exe = 'C:\Program Files (x86)\cloudflared\cloudflared.exe' }
    $log = Join-Path $PSScriptRoot 'tunnel.log'
    Remove-Item $log -ErrorAction SilentlyContinue
    $tun = Start-Process $exe -ArgumentList @('tunnel', '--url', "http://localhost:$Port") -PassThru `
        -WindowStyle Hidden -RedirectStandardError $log
    $url = $null
    for ($i = 0; $i -lt 40 -and -not $url; $i++) {
        Start-Sleep 1
        if (Test-Path $log) { $url = Select-String -Path $log -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' | Select-Object -First 1 }
    }
    if ($url) { $url.Matches[0].Value | Set-Content (Join-Path $PSScriptRoot 'url.txt'); Write-Host ('Public link: ' + $url.Matches[0].Value) }
    else { Write-Host "No link yet, see $log" }
}
Write-Host 'Press Enter to stop.'
[void](Read-Host)
if ($tun) { Stop-Process $tun -ErrorAction SilentlyContinue }
Stop-Process $server -ErrorAction SilentlyContinue
