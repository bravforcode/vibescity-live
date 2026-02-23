Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$hookPath = Join-Path $repoRoot ".githooks"

if (-not (Test-Path $hookPath)) {
	Write-Error "Missing .githooks directory: $hookPath"
	exit 1
}

git config core.hooksPath ".githooks"
if ($LASTEXITCODE -ne 0) {
	Write-Error "Failed to set core.hooksPath to .githooks"
	exit $LASTEXITCODE
}

Write-Host "Git hooks configured: core.hooksPath=.githooks" -ForegroundColor Green
