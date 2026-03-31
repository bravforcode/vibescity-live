param(
	[string]$TaskName = "VibeCityMediaAutofill",
	[int]$BatchLimit = 1000,
	[int]$BatchConcurrency = 20,
	[switch]$UseWiki
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$logDir = Join-Path $repoRoot "logs"
$logFile = Join-Path $logDir "media-autofill-task.log"
New-Item -ItemType Directory -Path $logDir -Force | Out-Null

function Write-Log {
	param([string]$Line)
	$lineOut = if ($null -eq $Line) { "" } else { $Line }
	[System.IO.File]::AppendAllText(
		$logFile,
		"$lineOut`r`n",
		[System.Text.Encoding]::UTF8
	)
}

Set-Location -LiteralPath $repoRoot

$started = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Write-Log "$started start task=$TaskName"

$nodeArgs = @(
	"scripts/run-media-autofill-auto.mjs",
	"--max-rounds=1",
	"--sleep-ms=0",
	"--batch-limit=$BatchLimit",
	"--batch-concurrency=$BatchConcurrency"
)
if ($UseWiki) {
	$nodeArgs += "--use-wiki"
}

& node @nodeArgs 2>&1 | ForEach-Object {
	Write-Log "$_"
}
$exitCode = $LASTEXITCODE

$ended = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Write-Log "$ended end task=$TaskName exit=$exitCode"

exit $exitCode
