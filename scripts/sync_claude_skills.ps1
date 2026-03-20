Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-NormalizedPath {
    param(
        [Parameter(Mandatory = $true)]
        [string] $Path
    )

    if (Test-Path -LiteralPath $Path) {
        return [System.IO.Path]::GetFullPath((Resolve-Path -LiteralPath $Path).Path)
    }

    return [System.IO.Path]::GetFullPath($Path)
}

function Get-LinkTargetPath {
    param(
        [Parameter(Mandatory = $true)]
        [System.IO.FileSystemInfo] $Item
    )

    $candidate = $null

    if ($Item.PSObject.Properties.Name -contains "LinkTarget" -and $Item.LinkTarget) {
        $candidate = $Item.LinkTarget
    } elseif ($Item.PSObject.Properties.Name -contains "Target" -and $Item.Target) {
        $candidate = $Item.Target
    }

    if ($candidate -is [System.Array]) {
        $candidate = $candidate[0]
    }

    if (-not $candidate) {
        return $null
    }

    return Get-NormalizedPath -Path ([string] $candidate)
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$sourceRoot = Join-Path $repoRoot ".agent\skills"
$targetRoot = Join-Path $repoRoot ".claude\skills"

if (-not (Test-Path -LiteralPath $sourceRoot)) {
    throw "Missing source directory: $sourceRoot"
}

if (-not (Test-Path -LiteralPath $targetRoot)) {
    New-Item -ItemType Directory -Path $targetRoot | Out-Null
}

$created = New-Object System.Collections.Generic.List[string]
$corrected = New-Object System.Collections.Generic.List[string]
$skipped = New-Object System.Collections.Generic.List[string]
$invalid = New-Object System.Collections.Generic.List[string]

$entries = Get-ChildItem -LiteralPath $sourceRoot -Force

foreach ($entry in $entries) {
    if (-not $entry.PSIsContainer) {
        $invalid.Add($entry.Name)
        continue
    }

    $skillFile = Join-Path $entry.FullName "SKILL.md"
    if (-not (Test-Path -LiteralPath $skillFile)) {
        $invalid.Add($entry.Name)
        continue
    }

    $targetPath = Join-Path $targetRoot $entry.Name
    $sourcePath = Get-NormalizedPath -Path $entry.FullName

    if (Test-Path -LiteralPath $targetPath) {
        $existing = Get-Item -LiteralPath $targetPath -Force
        $existingTarget = $null

        if ($existing.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
            $existingTarget = Get-LinkTargetPath -Item $existing
        }

        if ($existingTarget -and $existingTarget -eq $sourcePath) {
            $skipped.Add($entry.Name)
            continue
        }

        Remove-Item -LiteralPath $targetPath -Recurse -Force
        New-Item -ItemType Junction -Path $targetPath -Target $sourcePath | Out-Null
        $corrected.Add($entry.Name)
        continue
    }

    New-Item -ItemType Junction -Path $targetPath -Target $sourcePath | Out-Null
    $created.Add($entry.Name)
}

Write-Host ("Created:   {0}" -f $created.Count)
foreach ($name in $created) {
    Write-Host ("  + {0}" -f $name)
}

Write-Host ("Corrected: {0}" -f $corrected.Count)
foreach ($name in $corrected) {
    Write-Host ("  ~ {0}" -f $name)
}

Write-Host ("Skipped:   {0}" -f $skipped.Count)
foreach ($name in $skipped) {
    Write-Host ("  = {0}" -f $name)
}

Write-Host ("Invalid:   {0}" -f $invalid.Count)
foreach ($name in $invalid) {
    Write-Host ("  ! {0}" -f $name)
}
