param(
	[string]$TaskName = "VibeCityMediaAutofill"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if (-not $existing) {
	Write-Host "Scheduled task not found: $TaskName"
	exit 0
}

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
Write-Host "Scheduled task removed: $TaskName" -ForegroundColor Green
