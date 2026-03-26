param(
	[string]$TaskName = "VibeCityMediaAutofill",
	[int]$IntervalMinutes = 15,
	[int]$BatchLimit = 1000,
	[int]$BatchConcurrency = 20,
	[switch]$UseWiki
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ($IntervalMinutes -lt 5) {
	throw "IntervalMinutes must be >= 5"
}
if ($BatchLimit -lt 1) {
	throw "BatchLimit must be >= 1"
}
if ($BatchConcurrency -lt 1) {
	throw "BatchConcurrency must be >= 1"
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$logDir = Join-Path $repoRoot "logs"
$logFile = Join-Path $logDir "media-autofill-task.log"
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
if (Test-Path $logFile) {
	$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
	$backup = "$logFile.$stamp.bak"
	Move-Item -Path $logFile -Destination $backup -Force
}
[System.IO.File]::WriteAllText($logFile, "", [System.Text.Encoding]::UTF8)

$runnerScript = Join-Path $repoRoot "scripts\run-media-autofill-task.ps1"
$actionArgs = "-NoProfile -ExecutionPolicy Bypass -File `"$runnerScript`" -TaskName `"$TaskName`" -BatchLimit $BatchLimit -BatchConcurrency $BatchConcurrency"
if ($UseWiki) {
	$actionArgs += " -UseWiki"
}
$action = New-ScheduledTaskAction `
	-Execute "powershell.exe" `
	-Argument $actionArgs

$startAt = (Get-Date).AddMinutes(1)
$trigger = New-ScheduledTaskTrigger `
	-Once `
	-At $startAt `
	-RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes) `
	-RepetitionDuration (New-TimeSpan -Days 3650)

$settings = New-ScheduledTaskSettingsSet `
	-AllowStartIfOnBatteries `
	-DontStopIfGoingOnBatteries `
	-StartWhenAvailable `
	-MultipleInstances IgnoreNew `
	-ExecutionTimeLimit (New-TimeSpan -Hours 2)

Register-ScheduledTask `
	-TaskName $TaskName `
	-Action $action `
	-Trigger $trigger `
	-Settings $settings `
	-Description "Auto backfill venue media to Supabase Storage" `
	-Force | Out-Null

Start-ScheduledTask -TaskName $TaskName

Write-Host "Scheduled task installed: $TaskName" -ForegroundColor Green
Write-Host "Runs every $IntervalMinutes minute(s)." -ForegroundColor Green
Write-Host "Log file: $logFile" -ForegroundColor Green
