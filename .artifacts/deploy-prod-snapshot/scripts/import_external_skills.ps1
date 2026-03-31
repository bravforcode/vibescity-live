$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.IO.Compression.FileSystem

$repoRoot = Split-Path -Parent $PSScriptRoot
$canonicalSkillsRoot = Join-Path $repoRoot "skills"
$codexSkillsRoot = Join-Path $repoRoot ".agents\skills"

$archives = @(
    "C:\Users\menum\Downloads\files (4)\git-workflow.skill",
    "C:\Users\menum\Downloads\files (4)\monitoring-observability.skill",
    "C:\Users\menum\Downloads\files (4)\performance-profiling.skill",
    "C:\Users\menum\Downloads\files (4)\security-hardening.skill",
    "C:\Users\menum\Downloads\files (5)\api-design.skill",
    "C:\Users\menum\Downloads\files (5)\database-ops.skill",
    "C:\Users\menum\Downloads\files (5)\devops-pipeline.skill",
    "C:\Users\menum\Downloads\files (5)\fullstack-scaffold.skill",
    "C:\Users\menum\Downloads\files (5)\infra-as-code.skill",
    "C:\Users\menum\Downloads\files (5)\tech-research.skill"
)

New-Item -ItemType Directory -Force -Path $canonicalSkillsRoot | Out-Null
New-Item -ItemType Directory -Force -Path $codexSkillsRoot | Out-Null

$imported = @()

foreach ($archive in $archives) {
    if (-not (Test-Path -LiteralPath $archive)) {
        throw "Missing archive: $archive"
    }

    $zip = [System.IO.Compression.ZipFile]::OpenRead($archive)
    try {
        $skillRootEntry = $zip.Entries |
            Where-Object { $_.FullName -match "^[^/]+/SKILL\.md$" } |
            Select-Object -First 1

        if (-not $skillRootEntry) {
            throw "Archive does not contain a top-level SKILL.md: $archive"
        }

        $skillName = ($skillRootEntry.FullName -split "/")[0]
        $canonicalSkillPath = Join-Path $canonicalSkillsRoot $skillName
        $codexSkillPath = Join-Path $codexSkillsRoot $skillName

        if (Test-Path -LiteralPath $canonicalSkillPath) {
            Remove-Item -Recurse -Force -LiteralPath $canonicalSkillPath
        }

        [System.IO.Compression.ZipFile]::ExtractToDirectory($archive, $canonicalSkillsRoot)

        if (Test-Path -LiteralPath $codexSkillPath) {
            Remove-Item -Recurse -Force -LiteralPath $codexSkillPath
        }

        Copy-Item -Recurse -Force -LiteralPath $canonicalSkillPath -Destination $codexSkillPath

        $imported += $skillName
    }
    finally {
        $zip.Dispose()
    }
}

Write-Host "Imported skills:"
$imported | Sort-Object | ForEach-Object { Write-Host " - $_" }
