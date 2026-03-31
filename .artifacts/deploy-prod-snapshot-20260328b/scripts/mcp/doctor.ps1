[CmdletBinding(PositionalBinding = $false)]
param(
	[switch]$SkipWrapperHealth
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "_load-env-local.ps1")

$repoRoot = Resolve-RepoRoot -ScriptRoot $PSScriptRoot
$checksFailed = 0

function Write-CheckResult {
	param(
		[bool]$Ok,
		[string]$Name,
		[string]$Details = ""
	)

	if ($Ok) {
		Write-Host ("[OK]   {0}" -f $Name) -ForegroundColor Green
		if ($Details) {
			Write-Host ("       {0}" -f $Details) -ForegroundColor DarkGray
		}
		return
	}

	$script:checksFailed++
	Write-Host ("[FAIL] {0}" -f $Name) -ForegroundColor Red
	if ($Details) {
		Write-Host ("       {0}" -f $Details) -ForegroundColor DarkGray
	}
}

function Invoke-External {
	param(
		[Parameter(Mandatory = $true)]
		[string]$FilePath,
		[Parameter(Mandatory = $true)]
		[string[]]$Arguments
	)

	$output = & $FilePath @Arguments 2>&1
	$exitCode = $LASTEXITCODE
	return [pscustomobject]@{
		ExitCode = $exitCode
		Output   = $output
	}
}

function Test-NonPlaceholderSecret {
	param(
		[Parameter(Mandatory = $true)]
		[string]$Name,
		[AllowNull()]
		[string]$Value
	)

	if ([string]::IsNullOrWhiteSpace($Value)) {
		return [pscustomobject]@{ Ok = $false; Detail = "Missing or empty: $Name" }
	}

	if (-not (Test-SecretValue -Value $Value)) {
		return [pscustomobject]@{ Ok = $false; Detail = "Placeholder detected for $Name" }
	}

	return [pscustomobject]@{ Ok = $true; Detail = "$Name is present" }
}

Write-Host "MCP Doctor - env + registration checks" -ForegroundColor Cyan
Write-Host ("Repo: {0}" -f $repoRoot) -ForegroundColor DarkGray

try {
	Import-EnvLocal -RepoRoot $repoRoot | Out-Null
	Write-CheckResult -Ok $true -Name ".env.local parse" -Details "Loaded from repo root"
} catch {
	Write-CheckResult -Ok $false -Name ".env.local parse" -Details $_.Exception.Message
}

$requiredSecrets = @("TESTSPRITE_API_KEY", "SUPABASE_ACCESS_TOKEN")
foreach ($name in $requiredSecrets) {
	$envItem = Get-Item -Path ("Env:{0}" -f $name) -ErrorAction SilentlyContinue
	$envValue = if ($null -ne $envItem) { $envItem.Value } else { $null }
	$state = Test-NonPlaceholderSecret -Name $name -Value $envValue
	Write-CheckResult -Ok $state.Ok -Name ("env {0}" -f $name) -Details $state.Detail
}

$requiredScripts = @(
	"scripts/mcp/_load-env-local.ps1",
	"scripts/mcp/run-testsprite-mcp.ps1",
	"scripts/mcp/run-supabase-mcp.ps1"
)
foreach ($relative in $requiredScripts) {
	$path = Join-Path $repoRoot $relative
	Write-CheckResult -Ok (Test-Path $path) -Name ("file {0}" -f $relative) -Details $path
}

$codexAvailable = [bool](Get-Command codex -ErrorAction SilentlyContinue)
Write-CheckResult -Ok $codexAvailable -Name "codex CLI available"
if ($codexAvailable) {
	foreach ($server in @("testsprite", "supabase")) {
		$result = Invoke-External -FilePath "codex" -Arguments @("mcp", "get", $server)
		Write-CheckResult -Ok ($result.ExitCode -eq 0) -Name ("codex mcp get {0}" -f $server)
	}
}

$claudeAvailable = [bool](Get-Command claude -ErrorAction SilentlyContinue)
Write-CheckResult -Ok $claudeAvailable -Name "claude CLI available"
if ($claudeAvailable) {
	foreach ($server in @("testsprite", "supabase")) {
		$result = Invoke-External -FilePath "claude" -Arguments @("mcp", "get", $server)
		Write-CheckResult -Ok ($result.ExitCode -eq 0) -Name ("claude mcp get {0}" -f $server)
	}
}

if (-not $SkipWrapperHealth) {
	$testspriteWrapper = Join-Path $repoRoot "scripts/mcp/run-testsprite-mcp.ps1"
	$supabaseWrapper = Join-Path $repoRoot "scripts/mcp/run-supabase-mcp.ps1"

	$ts = Invoke-External -FilePath "powershell" -Arguments @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $testspriteWrapper, "-Help")
	Write-CheckResult -Ok ($ts.ExitCode -eq 0) -Name "testsprite wrapper health"

	$sb = Invoke-External -FilePath "powershell" -Arguments @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $supabaseWrapper, "-Version")
	Write-CheckResult -Ok ($sb.ExitCode -eq 0) -Name "supabase wrapper health"
}

if ($checksFailed -gt 0) {
	Write-Host ""
	Write-Host ("MCP doctor finished with {0} failing check(s)." -f $checksFailed) -ForegroundColor Red
	exit 1
}

Write-Host ""
Write-Host "MCP doctor passed all checks." -ForegroundColor Green
exit 0
