param(
  [string]$ProjectPath
)

$ErrorActionPreference = 'Stop'

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$SourceRepoAgentSkills = Join-Path $RepoRoot '.agent\skills'
$SourceRepoAgentsSkills = Join-Path $RepoRoot '.agents\skills'
$SourceUserAgentsSkills = 'C:\Users\menum\.agents\skills'
$SourceUserCodexSkills = 'C:\Users\menum\.codex\skills'
$AgentsSource = Join-Path $RepoRoot 'AGENTS.md'
$GlobalRoot = 'C:\Users\menum\.codex\skill-bundles'
$GlobalSkillPack = Join-Path $GlobalRoot 'vibecity.live-all'

$SourceSkillRoots = @(
  $SourceUserAgentsSkills,
  $SourceUserCodexSkills,
  $SourceRepoAgentSkills,
  $SourceRepoAgentsSkills
)

if (-not (Test-Path $SourceRepoAgentSkills) -and -not (Test-Path $SourceRepoAgentsSkills)) {
  throw "No repo skills folder found. Expected one of: $SourceRepoAgentSkills or $SourceRepoAgentsSkills"
}

New-Item -ItemType Directory -Force -Path $GlobalSkillPack | Out-Null

# Copy each top-level skill folder to avoid recursive copy issues and allow source priority.
foreach ($root in $SourceSkillRoots) {
  if (-not (Test-Path $root)) {
    continue
  }

  $skillDirs = Get-ChildItem -Force -Directory -Path $root |
    Where-Object { $_.Name -notin @('vibecity.live', 'vibecity.live-all') }

  foreach ($dir in $skillDirs) {
    $targetDir = Join-Path $GlobalSkillPack $dir.Name
    New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
    $null = robocopy $dir.FullName $targetDir /E /R:1 /W:1 /NFL /NDL /NJH /NJS /NC /NS
    if ($LASTEXITCODE -ge 8) {
      throw "robocopy failed for '$($dir.FullName)' -> '$targetDir' with exit code $LASTEXITCODE"
    }
  }
}

if (-not $ProjectPath) {
  Write-Output "Global skills synced to: $GlobalSkillPack"
  Write-Output "To bootstrap a new project now:"
  Write-Output "  powershell -ExecutionPolicy Bypass -File `"$PSCommandPath`" -ProjectPath `"C:\path\to\new-project`""
  exit 0
}

if (-not (Test-Path $ProjectPath)) {
  throw "Project path not found: $ProjectPath"
}

$ProjectPathResolved = (Resolve-Path $ProjectPath).Path
$TargetAgentsDir = Join-Path $ProjectPathResolved '.agents'
$TargetAgentDir = Join-Path $ProjectPathResolved '.agent'
$TargetAgentsSkillsLink = Join-Path $TargetAgentsDir 'skills'
$TargetAgentSkillsLink = Join-Path $TargetAgentDir 'skills'
$TargetAgentsFile = Join-Path $ProjectPathResolved 'AGENTS.md'

New-Item -ItemType Directory -Force -Path $TargetAgentsDir | Out-Null
New-Item -ItemType Directory -Force -Path $TargetAgentDir | Out-Null

foreach ($linkPath in @($TargetAgentsSkillsLink, $TargetAgentSkillsLink)) {
  if (Test-Path $linkPath) {
    $existingItem = Get-Item $linkPath -Force
    if ($existingItem.Attributes -band [IO.FileAttributes]::ReparsePoint) {
      cmd /c "rmdir `"$linkPath`"" | Out-Null
      if (Test-Path $linkPath) {
        throw "Failed to remove existing link: $linkPath"
      }
    } else {
      throw "Refusing to replace non-link path: $linkPath"
    }
  }

  New-Item -ItemType Junction -Path $linkPath -Value $GlobalSkillPack | Out-Null
}

if (-not (Test-Path $AgentsSource)) {
  throw "AGENTS.md source not found: $AgentsSource"
}

$agentsContent = Get-Content -Raw -Path $AgentsSource
$agentsContent = $agentsContent -replace [regex]::Escape('C:/vibecity.live/.agents/skills'), 'C:/Users/menum/.codex/skill-bundles/vibecity.live-all'
Set-Content -Path $TargetAgentsFile -Value $agentsContent -Encoding utf8

Write-Output "Global skills synced to: $GlobalSkillPack"
Write-Output "Project bootstrapped: $ProjectPathResolved"
Write-Output "- Junction: $TargetAgentsSkillsLink -> $GlobalSkillPack"
Write-Output "- Junction: $TargetAgentSkillsLink -> $GlobalSkillPack"
Write-Output "- AGENTS.md: $TargetAgentsFile"
Write-Output "- Tip: If your IDE shows '.agent/skills', this is now linked and ready."
