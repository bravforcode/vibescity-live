[CmdletBinding(PositionalBinding = $false)]
param(
	[switch]$Help,
	[switch]$Version,
	[Parameter(ValueFromRemainingArguments = $true)]
	[string[]]$PassthroughArgs
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "_load-env-local.ps1")
$repoRoot = Resolve-RepoRoot -ScriptRoot $PSScriptRoot
Import-EnvLocal -RepoRoot $repoRoot | Out-Null

if (-not (Test-SecretValue -Value $env:TESTSPRITE_API_KEY)) {
	Write-Error "Required env var TESTSPRITE_API_KEY is missing or placeholder in .env.local"
	exit 1
}

$env:API_KEY = $env:TESTSPRITE_API_KEY
$forwardArgs = @()
if ($Help) {
	$forwardArgs += "--help"
}
if ($Version) {
	$forwardArgs += "--version"
}
if ($PassthroughArgs) {
	if ($PassthroughArgs[0] -eq "--" -and $PassthroughArgs.Count -gt 1) {
		$forwardArgs += $PassthroughArgs[1..($PassthroughArgs.Count - 1)]
	} elseif ($PassthroughArgs[0] -ne "--") {
		$forwardArgs += $PassthroughArgs
	}
}

$npxArgs = @("-y", "@testsprite/testsprite-mcp@latest")
if ($forwardArgs) {
	$npxArgs += $forwardArgs
}

$process = Start-Process -FilePath "npx.cmd" -ArgumentList $npxArgs -NoNewWindow -Wait -PassThru
exit $process.ExitCode
