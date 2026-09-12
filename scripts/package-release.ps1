$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$releaseNames = @('manifest.json','sidepanel.html','styles.css','app.js','calendar.js','recurrence.js','events.js','background.js','assets','README.md','VERIFICATION.md','screenshots','tests','scripts','package.json','package-lock.json')
$releasePaths = $releaseNames | ForEach-Object { Join-Path $projectRoot $_ }
foreach ($releasePath in $releasePaths) { if (-not (Test-Path -LiteralPath $releasePath)) { throw "Missing release file: $releasePath" } }
$destination = Join-Path ([IO.Path]::GetDirectoryName($projectRoot)) 'rooz-sidepanel.zip'
Compress-Archive -LiteralPath $releasePaths -DestinationPath $destination -Force
Write-Output $destination
