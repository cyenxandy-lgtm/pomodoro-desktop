param(
  [Parameter(Mandatory)]
  [ValidatePattern('^[a-z0-9][a-z0-9-]{0,63}$')]
  [string]$ProfileName
)

$ErrorActionPreference = 'Stop'
$workspaceRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$testRoot = [System.IO.Path]::GetFullPath((Join-Path $workspaceRoot '.test-data'))
$target = [System.IO.Path]::GetFullPath((Join-Path $testRoot $ProfileName))
$expectedPrefix = $testRoot.TrimEnd('\') + '\'
$marker = Join-Path $target '.pomodoro-test-profile'

if (-not $target.StartsWith($expectedPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Unsafe cleanup target: $target"
}
if (-not (Test-Path -LiteralPath $marker -PathType Leaf)) {
  throw "Refusing cleanup because the Pomodoro test marker is missing: $marker"
}
if ((Get-Content -LiteralPath $marker -Raw).Trim() -ne 'pomodoro-test-profile-v1') {
  throw "Refusing cleanup because the test marker is invalid: $marker"
}

$running = Get-Process app -ErrorAction SilentlyContinue | Where-Object {
  $_.Path -and [System.IO.Path]::GetFullPath($_.Path).StartsWith(
    $workspaceRoot.TrimEnd('\') + '\',
    [System.StringComparison]::OrdinalIgnoreCase
  )
}
if ($running) {
  throw 'Stop workspace Pomodoro test processes before cleanup.'
}

Remove-Item -LiteralPath $target -Recurse -Force
Write-Output "Removed isolated Pomodoro test profile: $target"
