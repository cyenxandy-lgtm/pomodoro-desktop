param(
  [ValidatePattern('^[a-z0-9][a-z0-9-]{0,63}$')]
  [string]$ProfileName = 'manual-acceptance',
  [switch]$SmokeTimer,
  [switch]$AutoStart
)

$ErrorActionPreference = 'Stop'
$workspaceRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$testRoot = [System.IO.Path]::GetFullPath((Join-Path $workspaceRoot '.test-data'))
$dataDirectory = [System.IO.Path]::GetFullPath((Join-Path $testRoot $ProfileName))
$expectedPrefix = $testRoot.TrimEnd('\') + '\'

if (-not $dataDirectory.StartsWith($expectedPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Unsafe test profile path: $dataDirectory"
}
if ($AutoStart -and -not $SmokeTimer) {
  throw '-AutoStart requires -SmokeTimer.'
}

$executable = Join-Path $workspaceRoot 'src-tauri\target\release\app.exe'
if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) {
  throw "Release executable not found. Run npm run build:tauri first: $executable"
}

$env:POMODORO_TEST_PROFILE = '1'
$env:POMODORO_DATA_DIR = $dataDirectory
$env:POMODORO_SMOKE_TIMER = if ($SmokeTimer) { '1' } else { '0' }
$env:POMODORO_SMOKE_AUTOSTART = if ($AutoStart) { '1' } else { '0' }

$process = Start-Process -FilePath $executable -WorkingDirectory (Split-Path $executable) -PassThru
Write-Output "PID=$($process.Id)"
Write-Output "TEST_DATA=$dataDirectory"
Write-Output "SMOKE_TIMER=$($SmokeTimer.IsPresent)"
Write-Output "AUTO_START=$($AutoStart.IsPresent)"
