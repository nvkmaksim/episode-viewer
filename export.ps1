<#
 Pulls the episode data from a running CVAT (container cvat_server) into .\site.
 Needs Docker running and the cvat-sam stack up. Only this step touches CVAT; the viewer itself is static.

   .\export.ps1                 # episode 1, video re-encoded to 960 px for a slow uplink (needs ffmpeg)
   .\export.ps1 -Episode 2
#>
param(
    [int]$Episode = 1,
    [int]$Width = 1280
)
$ErrorActionPreference = 'Stop'
$site = Join-Path $PSScriptRoot 'site'
$tmp = Join-Path $PSScriptRoot 'export-tmp'
New-Item -ItemType Directory -Force $site | Out-Null

docker exec cvat_server rm -rf /tmp/viewer-data
docker exec cvat_server python manage.py export_viewer --episode $Episode --out /tmp/viewer-data --width $Width
if ($LASTEXITCODE -ne 0) { throw 'export_viewer failed' }
if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
docker cp cvat_server:/tmp/viewer-data $tmp
if ($LASTEXITCODE -ne 0) { throw 'docker cp failed' }
Get-ChildItem $tmp | Copy-Item -Destination $site -Force

# a light video for a home upload channel (about 1 Mbit/s); without ffmpeg the exported one stays
$ffmpeg = (Get-Command ffmpeg -ErrorAction SilentlyContinue).Source
if ($ffmpeg) {
    $small = Join-Path $PSScriptRoot 'video-small.mp4'
    & $ffmpeg -loglevel error -y -i (Join-Path $site 'video.mp4') -vf scale=960:-2 -c:v libx264 -preset slow -crf 30 `
        -maxrate 1000k -bufsize 2000k -profile:v main -pix_fmt yuv420p -g 60 -movflags +faststart -an $small
    if ($LASTEXITCODE -eq 0) { Move-Item -Force $small (Join-Path $site 'video.mp4') }
}
Remove-Item -Recurse -Force $tmp
Get-ChildItem $site | Select-Object Name, Length
