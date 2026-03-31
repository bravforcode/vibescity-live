[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [string]$SourceRepo = "C:\vibecity.live",

    [Parameter(Mandatory = $false)]
    [string]$ReleaseWorktree = "C:\vibecity.live.release\2026-02-05-prod",

    [Parameter(Mandatory = $true)]
    [string]$ProdEnvFile,

    [Parameter(Mandatory = $true)]
    [string]$SupabaseProjectRef,

    [Parameter(Mandatory = $false)]
    [string]$SupabaseCliVersion = "2.75.4",

    [Parameter(Mandatory = $true)]
    [string]$VercelProject,

    [Parameter(Mandatory = $true)]
    [string]$VercelScope,

    [Parameter(Mandatory = $false)]
    [ValidateSet("railway", "fly", "none")]
    [string]$BackendProvider = "fly",

    [Parameter(Mandatory = $false)]
    [string]$RailwayProjectId,

    [Parameter(Mandatory = $false)]
    [string]$RailwayEnvironment,

    [Parameter(Mandatory = $false)]
    [string]$RailwayWorkerService,

    [Parameter(Mandatory = $false)]
    [string]$RailwayClockService,

    [Parameter(Mandatory = $false)]
    [string]$FlyApp,

    [Parameter(Mandatory = $false)]
    [string]$FlyConfigPath = "fly.toml",

    [Parameter(Mandatory = $false)]
    [int]$CanaryVus = 5,

    [Parameter(Mandatory = $false)]
    [string]$CanaryDuration = "30s",

    [Parameter(Mandatory = $false)]
    [switch]$DryRunOnly
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Write-Phase {
    param([string]$Message)
    Write-Host "\n=== $Message ===" -ForegroundColor Cyan
}

function Write-Info {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Gray
}

function Write-Warn {
    param([string]$Message)
    Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function Invoke-Checked {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FilePath,
        [Parameter(Mandatory = $false)]
        [string[]]$Arguments = @(),
        [Parameter(Mandatory = $false)]
        [string]$WorkingDirectory = (Get-Location).Path,
        [Parameter(Mandatory = $false)]
        [int[]]$AllowedExitCodes = @(0),
        [Parameter(Mandatory = $false)]
        [switch]$CaptureOutput
    )

    Push-Location $WorkingDirectory
    try {
        $cmdText = "$FilePath $($Arguments -join ' ')"
        Write-Host "> $cmdText" -ForegroundColor DarkGray

        if ($CaptureOutput) {
            $output = & $FilePath @Arguments 2>&1
            $exitCode = $LASTEXITCODE
            if ($AllowedExitCodes -notcontains $exitCode) {
                throw "Command failed ($exitCode): $cmdText`n$($output -join [Environment]::NewLine)"
            }
            return ($output -join [Environment]::NewLine)
        }

        & $FilePath @Arguments
        $exitCode = $LASTEXITCODE
        if ($AllowedExitCodes -notcontains $exitCode) {
            throw "Command failed ($exitCode): $cmdText"
        }
    }
    finally {
        Pop-Location
    }
}

function Require-File {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) {
        throw "Required file not found: $Path"
    }
}

function Parse-DotEnv {
    param([string]$Path)

    $dict = @{}
    Get-Content -LiteralPath $Path | ForEach-Object {
        $line = $_.Trim()
        if (-not $line -or $line.StartsWith("#")) {
            return
        }

        $eq = $line.IndexOf("=")
        if ($eq -lt 1) {
            return
        }

        $key = $line.Substring(0, $eq).Trim()
        $value = $line.Substring($eq + 1).Trim()

        if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
            $value = $value.Substring(1, $value.Length - 2)
        }

        $dict[$key] = $value
    }

    return $dict
}

function Parse-VersionMajor {
    param([string]$Version)
    if (-not $Version) {
        return $null
    }

    $match = [regex]::Match($Version, "^(?:[^0-9]*)([0-9]+)")
    if (-not $match.Success) {
        return $null
    }

    return [int]$match.Groups[1].Value
}

function Get-AllowlistedMigrationFiles {
    param([string]$ReleaseRoot)

    $allowlistPath = Join-Path $ReleaseRoot "scripts/release/config/migration-delta-allowlist.txt"
    Require-File $allowlistPath

    return @(Get-Content -LiteralPath $allowlistPath |
            ForEach-Object { $_.Trim() } |
            Where-Object { $_ -and -not $_.StartsWith("#") })
}

function Get-RequiredSecrets {
    param([string]$ReleaseRoot)

    $requiredFromFile = @()
    $requiredFilePath = Join-Path $ReleaseRoot "scripts/release/config/required-supabase-secrets.txt"
    Require-File $requiredFilePath
    $requiredFromFile = @(Get-Content -LiteralPath $requiredFilePath |
            ForEach-Object { $_.Trim() } |
            Where-Object { $_ -and -not $_.StartsWith("#") })

    $scanPattern = 'Deno\.env\.get\("([A-Z0-9_]+)"\)'
    $fromCode = New-Object System.Collections.Generic.HashSet[string]
    Get-ChildItem -LiteralPath (Join-Path $ReleaseRoot "supabase/functions") -Recurse -File -Filter "*.ts" |
        ForEach-Object {
            $matches = Select-String -LiteralPath $_.FullName -Pattern $scanPattern -AllMatches
            foreach ($m in $matches) {
                foreach ($g in $m.Matches) {
                    [void]$fromCode.Add($g.Groups[1].Value)
                }
            }
        }

    $all = New-Object System.Collections.Generic.HashSet[string]
    foreach ($name in $requiredFromFile) { [void]$all.Add($name) }
    foreach ($name in $fromCode) { [void]$all.Add($name) }

    return @($all | Sort-Object)
}

function Parse-SupabaseSecretNames {
    param([string]$SecretListOutput)

    $names = New-Object System.Collections.Generic.HashSet[string]
    foreach ($line in ($SecretListOutput -split "`r?`n")) {
        $trim = $line.Trim()
        if (-not $trim) { continue }
        if ($trim.StartsWith("NAME")) { continue }
        if ($trim.StartsWith("---")) { continue }
        if (-not $trim.Contains("|")) { continue }

        $parts = $trim.Split("|")
        if ($parts.Count -lt 2) { continue }

        $name = $parts[0].Trim()
        if ($name -and $name -notmatch '^[0-9]+$') {
            [void]$names.Add($name)
        }
    }

    return @($names | Sort-Object)
}

function Parse-PendingMigrations {
    param([string]$MigrationListOutput)

    $pending = New-Object System.Collections.Generic.HashSet[string]

    foreach ($line in ($MigrationListOutput -split "`r?`n")) {
        if (-not $line.Contains("|")) { continue }
        if ($line -match "Local\s*\|\s*Remote") { continue }
        if ($line -match "^-+") { continue }

        $parts = $line.Split("|")
        if ($parts.Count -lt 2) { continue }

        $local = $parts[0].Trim()
        $remote = $parts[1].Trim()

        if (-not $local) { continue }
        if (-not $remote) {
            [void]$pending.Add($local)
        }
    }

    return @($pending | Sort-Object)
}

function Require-Command {
    param([string]$Name)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command not found on PATH: $Name"
    }
}

function Ensure-PathParent {
    param([string]$Path)
    $parent = Split-Path -Parent $Path
    if ($parent -and -not (Test-Path -LiteralPath $parent)) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }
}

function Sync-AllowlistFiles {
    param(
        [string]$FromRoot,
        [string]$ToRoot,
        [string[]]$RelativePaths
    )

    foreach ($relPath in $RelativePaths) {
        $src = Join-Path $FromRoot $relPath
        if (-not (Test-Path -LiteralPath $src)) {
            throw "Allowlisted source file is missing: $src"
        }

        $dst = Join-Path $ToRoot $relPath
        Ensure-PathParent -Path $dst
        Copy-Item -LiteralPath $src -Destination $dst -Force
    }
}

function Assert-OnlyAllowlistChanges {
    param(
        [string]$RepoRoot,
        [string[]]$AllowedPaths
    )

    $output = Invoke-Checked -FilePath "git" -Arguments @("-C", $RepoRoot, "status", "--porcelain", "--untracked-files=all") -CaptureOutput

    $changed = @()
    foreach ($line in ($output -split "`r?`n")) {
        if (-not $line) { continue }
        if ($line.Length -lt 4) { continue }
        $path = $line.Substring(3).Trim()
        if ($path -like "* -> *") {
            $path = $path.Split(" -> ")[1].Trim()
        }
        if ($path) {
            $changed += $path
        }
    }

    $violations = @($changed | Where-Object { $AllowedPaths -notcontains $_ })
    if ($violations.Count -gt 0) {
        throw "Release worktree has non-allowlisted changes: $($violations -join ', ')"
    }
}

if ($PSVersionTable.PSVersion.Major -lt 7) {
    throw "This pipeline must run on PowerShell 7+. Current version: $($PSVersionTable.PSVersion)"
}

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptRoot "../..") | Select-Object -ExpandProperty Path
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$artifactsDir = Join-Path $ReleaseWorktree "artifacts/release/$timestamp"
$releaseBranch = "release/prod-oneshot-$timestamp"
$previousProdDeploymentUrl = $null
$stagedDeploymentUrl = $null
$promoted = $false
$railwayWorkerDeployed = $false
$railwayClockDeployed = $false
$flyDeployed = $false

if ($BackendProvider -eq "railway") {
    if (-not $RailwayProjectId -or -not $RailwayEnvironment -or -not $RailwayWorkerService -or -not $RailwayClockService) {
        throw "Railway backend selected, but RailwayProjectId/RailwayEnvironment/RailwayWorkerService/RailwayClockService are missing."
    }
}

if ($BackendProvider -eq "fly" -and -not $DryRunOnly) {
    if (-not $FlyApp) {
        throw "Fly backend selected, but FlyApp is missing."
    }
}

Require-File $ProdEnvFile
$prodEnv = Parse-DotEnv -Path $ProdEnvFile

$requiredEnvVars = @(
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY"
)
foreach ($required in $requiredEnvVars) {
    if (-not $prodEnv.ContainsKey($required) -or -not $prodEnv[$required]) {
        throw "Missing required key in ProdEnvFile: $required"
    }
}

Write-Phase "Phase 0 - Toolchain Bootstrap"
Require-Command -Name "git"
Require-Command -Name "npm"
Require-Command -Name "npx"
Require-Command -Name "k6"

$npmCmd = Get-Command "npm.cmd" -ErrorAction SilentlyContinue
if ($npmCmd) {
    $npmCmd = $npmCmd.Source
}
else {
    $npmCmd = "npm"
}

$npxCmd = Get-Command "npx.cmd" -ErrorAction SilentlyContinue
if ($npxCmd) {
    $npxCmd = $npxCmd.Source
}
else {
    $npxCmd = "npx"
}

try {
    Invoke-Checked -FilePath "winget" -Arguments @("upgrade", "--id", "Microsoft.PowerShell", "--exact", "--silent", "--accept-package-agreements", "--accept-source-agreements")
}
catch {
    Write-Warn "PowerShell winget upgrade failed or unavailable. Continuing because script already runs in pwsh 7+."
}

Invoke-Checked -FilePath $npmCmd -Arguments @("install", "-g", "vercel@latest", "@railway/cli@latest")
Invoke-Checked -FilePath "vercel" -Arguments @("--version")
Invoke-Checked -FilePath "railway" -Arguments @("--version")
Invoke-Checked -FilePath $npxCmd -Arguments @("supabase@$SupabaseCliVersion", "--version")

Write-Phase "Phase 1 - Isolated Release Workspace"
if (-not (Test-Path -LiteralPath $SourceRepo)) {
    throw "SourceRepo not found: $SourceRepo"
}

if (Test-Path -LiteralPath $ReleaseWorktree) {
    throw "ReleaseWorktree already exists. Use a new path: $ReleaseWorktree"
}

Invoke-Checked -FilePath "git" -Arguments @("-C", $SourceRepo, "fetch", "origin", "main")
Invoke-Checked -FilePath "git" -Arguments @("-C", $SourceRepo, "worktree", "add", "-B", $releaseBranch, $ReleaseWorktree, "origin/main")

$allowlistedMigrationFiles = Get-AllowlistedMigrationFiles -ReleaseRoot $repoRoot
$allowlistedRelativePaths = @(
    "scripts/release/prod-one-shot.ps1",
    "scripts/release/config/function-allowlist.json",
    "scripts/release/config/migration-delta-allowlist.txt",
    "scripts/release/config/required-supabase-secrets.txt",
    "docs/runbooks/2026-02-05-prod-one-shot.md",
    "supabase/config.toml",
    "supabase/functions/admin-slip-export/index.ts",
    "backend/constraints-production.txt"
)
$allowlistedRelativePaths += @($allowlistedMigrationFiles | ForEach-Object { "supabase/migrations/$_" })
$allowlistedRelativePaths = @($allowlistedRelativePaths | Sort-Object -Unique)

Sync-AllowlistFiles -FromRoot $SourceRepo -ToRoot $ReleaseWorktree -RelativePaths $allowlistedRelativePaths
Assert-OnlyAllowlistChanges -RepoRoot $ReleaseWorktree -AllowedPaths $allowlistedRelativePaths

Write-Phase "Phase 2 - Patch/Minor Dependency Upgrades"
Invoke-Checked -FilePath $npmCmd -Arguments @("update") -WorkingDirectory $ReleaseWorktree

$outdatedJson = Invoke-Checked -FilePath $npmCmd -Arguments @("outdated", "--json", "--depth=0") -WorkingDirectory $ReleaseWorktree -AllowedExitCodes @(0, 1) -CaptureOutput
if ($outdatedJson.Trim()) {
    $outdatedObject = $outdatedJson | ConvertFrom-Json
    foreach ($pkg in $outdatedObject.PSObject.Properties.Name) {
        $entry = $outdatedObject.$pkg
        $currentMajor = Parse-VersionMajor -Version $entry.current
        $latestMajor = Parse-VersionMajor -Version $entry.latest
        if ($currentMajor -ne $null -and $latestMajor -ne $null -and $latestMajor -gt $currentMajor) {
            Write-Info "Major update intentionally not applied: $pkg ($($entry.current) -> $($entry.latest))"
        }
    }
}

$pythonExe = Join-Path $ReleaseWorktree ".venv\Scripts\python.exe"
if (-not (Test-Path -LiteralPath $pythonExe)) {
    $pythonExe = "python"
}

$pyOutdatedJson = Invoke-Checked -FilePath $pythonExe -Arguments @("-m", "pip", "list", "--outdated", "--format=json") -WorkingDirectory $ReleaseWorktree -CaptureOutput
$pyJsonMatch = [regex]::Match($pyOutdatedJson, "\[.*\]", [System.Text.RegularExpressions.RegexOptions]::Singleline)
if ($pyJsonMatch.Success) {
    $pyOutdatedJson = $pyJsonMatch.Value
}
else {
    $pyOutdatedJson = "[]"
}
if ($pyOutdatedJson.Trim()) {
    $pyOutdated = $pyOutdatedJson | ConvertFrom-Json
    foreach ($entry in $pyOutdated) {
        $currentMajor = Parse-VersionMajor -Version $entry.version
        $latestMajor = Parse-VersionMajor -Version $entry.latest_version

        if ($currentMajor -ne $null -and $latestMajor -ne $null -and $currentMajor -eq $latestMajor) {
            Invoke-Checked -FilePath $pythonExe -Arguments @("-m", "pip", "install", "--upgrade", "$($entry.name)==$($entry.latest_version)") -WorkingDirectory $ReleaseWorktree
        }
        else {
            Write-Info "Skip Python major update: $($entry.name) ($($entry.version) -> $($entry.latest_version))"
        }
    }
}

$freezeOutput = Invoke-Checked -FilePath $pythonExe -Arguments @("-m", "pip", "freeze") -WorkingDirectory $ReleaseWorktree -CaptureOutput
$constraintsHeader = @(
    "# Generated from .venv after dependency upgrade gates.",
    "# Use with: pip install -r backend/requirements.txt -c backend/constraints-production.txt"
)
$constraintsPath = Join-Path $ReleaseWorktree "backend/constraints-production.txt"
($constraintsHeader + ($freezeOutput -split "`r?`n")) | Out-File -FilePath $constraintsPath -Encoding UTF8

Invoke-Checked -FilePath $npmCmd -Arguments @("run", "lint") -WorkingDirectory $ReleaseWorktree
Invoke-Checked -FilePath $npmCmd -Arguments @("run", "test:unit") -WorkingDirectory $ReleaseWorktree
Invoke-Checked -FilePath $pythonExe -Arguments @("-m", "pytest", "backend/tests") -WorkingDirectory $ReleaseWorktree
Invoke-Checked -FilePath $npxCmd -Arguments @("playwright", "test", "--grep", "@smoke") -WorkingDirectory $ReleaseWorktree

if (-not $prodEnv.ContainsKey("CANARY_BASE_URL") -or -not $prodEnv["CANARY_BASE_URL"]) {
    throw "CANARY_BASE_URL is required in ProdEnvFile for pre-prod canary load gate."
}

$env:K6_BASE_URL = $prodEnv["CANARY_BASE_URL"]
Invoke-Checked -FilePath "k6" -Arguments @("run", "--vus", $CanaryVus, "--duration", $CanaryDuration, "k6-tests/realistic-load.js") -WorkingDirectory $ReleaseWorktree
Remove-Item Env:K6_BASE_URL -ErrorAction SilentlyContinue

Write-Phase "Phase 3 - Blocker and Delta Validation"
$zipByCheck = Select-String -Path (Join-Path $ReleaseWorktree "supabase/functions/admin-slip-export/index.ts") -Pattern 'const zipBy:'
if (-not $zipByCheck) {
    throw "zipBy parse blocker is not fixed in admin-slip-export/index.ts"
}

$deltaMigrationPath = Join-Path $ReleaseWorktree "supabase/migrations/20260207120000_prod_uuid_unification_delta.sql"
Require-File $deltaMigrationPath

Write-Phase "Phase 4 - Production Preflight Gates"
Invoke-Checked -FilePath $npxCmd -Arguments @("supabase@$SupabaseCliVersion", "projects", "list", "--output", "json") -WorkingDirectory $ReleaseWorktree | Out-Null

$vercelInspect = Invoke-Checked -FilePath "vercel" -Arguments @("project", "inspect", $VercelProject, "--scope", $VercelScope) -WorkingDirectory $ReleaseWorktree -CaptureOutput
if (-not $vercelInspect -or $vercelInspect -notmatch [regex]::Escape($VercelProject)) {
    throw "Unable to verify Vercel project access for $VercelProject"
}

if ($DryRunOnly) {
    Write-Info "DryRunOnly: skipping backend provider validation."
}
elseif ($BackendProvider -eq "railway") {
    Invoke-Checked -FilePath "railway" -Arguments @("whoami") -WorkingDirectory $ReleaseWorktree
    Invoke-Checked -FilePath "railway" -Arguments @("link", "--project", $RailwayProjectId, "--environment", $RailwayEnvironment) -WorkingDirectory $ReleaseWorktree
    Invoke-Checked -FilePath "railway" -Arguments @("status") -WorkingDirectory $ReleaseWorktree
}
elseif ($BackendProvider -eq "fly") {
    Invoke-Checked -FilePath "flyctl" -Arguments @("auth", "whoami") -WorkingDirectory $ReleaseWorktree
    Invoke-Checked -FilePath "flyctl" -Arguments @("status", "-a", $FlyApp) -WorkingDirectory $ReleaseWorktree
}

$requiredSecrets = Get-RequiredSecrets -ReleaseRoot $ReleaseWorktree
$secretListOut = Invoke-Checked -FilePath $npxCmd -Arguments @("supabase@$SupabaseCliVersion", "secrets", "list", "--project-ref", $SupabaseProjectRef) -WorkingDirectory $ReleaseWorktree -CaptureOutput
$remoteSecretNames = Parse-SupabaseSecretNames -SecretListOutput $secretListOut
$missingSecrets = @($requiredSecrets | Where-Object { $remoteSecretNames -notcontains $_ })
if ($missingSecrets.Count -gt 0) {
    throw "Supabase secret completeness gate failed. Missing: $($missingSecrets -join ', ')"
}

New-Item -ItemType Directory -Path $artifactsDir -Force | Out-Null
Invoke-Checked -FilePath $npxCmd -Arguments @("supabase@$SupabaseCliVersion", "db", "dump", "--linked", "--file", (Join-Path $artifactsDir "backup_schema.sql")) -WorkingDirectory $ReleaseWorktree
Invoke-Checked -FilePath $npxCmd -Arguments @("supabase@$SupabaseCliVersion", "db", "dump", "--linked", "--data-only", "--file", (Join-Path $artifactsDir "backup_data.sql")) -WorkingDirectory $ReleaseWorktree

if ($DryRunOnly) {
    Write-Phase "Dry Run Only - Stopping Before Production Rollout"
    $drySummary = [ordered]@{
        timestamp_utc = (Get-Date).ToUniversalTime().ToString("o")
        release_worktree = $ReleaseWorktree
        supabase_project_ref = $SupabaseProjectRef
        vercel_project = $VercelProject
        vercel_scope = $VercelScope
        backend_provider = $BackendProvider
        railway_project_id = $RailwayProjectId
        railway_environment = $RailwayEnvironment
        fly_app = $FlyApp
        fly_config = $FlyConfigPath
        dry_run_only = $true
        artifacts_dir = $artifactsDir
    }
    $drySummaryPath = Join-Path $artifactsDir "release-summary.json"
    $drySummary | ConvertTo-Json -Depth 5 | Out-File -FilePath $drySummaryPath -Encoding UTF8
    Write-Host "Dry run completed. Artifacts: $artifactsDir" -ForegroundColor Green
    Write-Host "Summary:   $drySummaryPath" -ForegroundColor Green
    exit 0
}

Write-Phase "Phase 5 - One-Shot Rollout"

try {
    $allMigrationVersions = @(Get-ChildItem -LiteralPath (Join-Path $ReleaseWorktree "supabase/migrations") -File -Filter "*.sql" |
            Sort-Object Name |
            ForEach-Object { $_.BaseName })
    $allowedVersions = @($allowlistedMigrationFiles | ForEach-Object { [IO.Path]::GetFileNameWithoutExtension($_) })
    $baselineVersions = @($allMigrationVersions | Where-Object { $allowedVersions -notcontains $_ })

    foreach ($version in $baselineVersions) {
        Invoke-Checked -FilePath $npxCmd -Arguments @("supabase@$SupabaseCliVersion", "migration", "repair", $version, "--status", "applied", "--linked") -WorkingDirectory $ReleaseWorktree
    }

    $migrationListOut = Invoke-Checked -FilePath $npxCmd -Arguments @("supabase@$SupabaseCliVersion", "migration", "list", "--linked") -WorkingDirectory $ReleaseWorktree -CaptureOutput
    $pending = Parse-PendingMigrations -MigrationListOutput $migrationListOut
    $unexpectedPending = @($pending | Where-Object { $allowedVersions -notcontains $_ })
    if ($unexpectedPending.Count -gt 0) {
        throw "Unexpected pending migrations before dry-run: $($unexpectedPending -join ', ')"
    }

    $dryRunOut = Invoke-Checked -FilePath $npxCmd -Arguments @("supabase@$SupabaseCliVersion", "db", "push", "--linked", "--include-all", "--dry-run") -WorkingDirectory $ReleaseWorktree -CaptureOutput
    $dryRunOut | Out-File -FilePath (Join-Path $artifactsDir "migration_dry_run.log") -Encoding UTF8

    Invoke-Checked -FilePath $npxCmd -Arguments @("supabase@$SupabaseCliVersion", "db", "push", "--linked", "--include-all") -WorkingDirectory $ReleaseWorktree

    Invoke-Checked -FilePath $npxCmd -Arguments @("supabase@$SupabaseCliVersion", "secrets", "set", "--project-ref", $SupabaseProjectRef, "--env-file", $ProdEnvFile) -WorkingDirectory $ReleaseWorktree

    $functionAllowlistPath = Join-Path $ReleaseWorktree "scripts/release/config/function-allowlist.json"
    $functionAllowlist = Get-Content -LiteralPath $functionAllowlistPath -Raw | ConvertFrom-Json

    foreach ($fn in $functionAllowlist.functions) {
        $args = @("supabase@$SupabaseCliVersion", "functions", "deploy", $fn.name, "--project-ref", $SupabaseProjectRef, "--use-api")
        if (-not [bool]$fn.verify_jwt) {
            $args += "--no-verify-jwt"
        }
        $deployOut = Invoke-Checked -FilePath $npxCmd -Arguments $args -WorkingDirectory $ReleaseWorktree -CaptureOutput
        $deployOut | Out-File -FilePath (Join-Path $artifactsDir ("function_{0}.log" -f $fn.name)) -Encoding UTF8
    }

    $previousListOut = Invoke-Checked -FilePath "vercel" -Arguments @("list", "--environment", "production", "--scope", $VercelScope) -WorkingDirectory $ReleaseWorktree -CaptureOutput
    $prevMatch = [regex]::Matches($previousListOut, 'https://[^\s]+') | Select-Object -First 1
    if ($prevMatch) {
        $previousProdDeploymentUrl = $prevMatch.Value
    }

    $deployOutput = Invoke-Checked -FilePath "vercel" -Arguments @("deploy", "--prod", "--skip-domain", "--yes", "--scope", $VercelScope) -WorkingDirectory $ReleaseWorktree -CaptureOutput
    $deployOutput | Out-File -FilePath (Join-Path $artifactsDir "vercel_staged_deploy.log") -Encoding UTF8

    $stagedMatch = [regex]::Matches($deployOutput, 'https://[^\s]+') | Select-Object -First 1
    if (-not $stagedMatch) {
        throw "Unable to parse staged Vercel deployment URL from deploy output."
    }
    $stagedDeploymentUrl = $stagedMatch.Value.TrimEnd('/')

    foreach ($path in @("/", "/api/v1/health")) {
        $url = "$stagedDeploymentUrl$path"
        Write-Info "Smoke check: $url"
        try {
            $response = Invoke-WebRequest -Uri $url -Method Get -UseBasicParsing -TimeoutSec 20
            if ($response.StatusCode -ge 400) {
                throw "Unexpected status code: $($response.StatusCode)"
            }
        }
        catch {
            throw "Smoke check failed for $url : $($_.Exception.Message)"
        }
    }

    $env:K6_BASE_URL = $stagedDeploymentUrl
    Invoke-Checked -FilePath "k6" -Arguments @("run", "--vus", $CanaryVus, "--duration", $CanaryDuration, "k6-tests/realistic-load.js") -WorkingDirectory $ReleaseWorktree
    Remove-Item Env:K6_BASE_URL -ErrorAction SilentlyContinue

    Invoke-Checked -FilePath "vercel" -Arguments @("promote", $stagedDeploymentUrl, "--yes", "--scope", $VercelScope) -WorkingDirectory $ReleaseWorktree
    $promoted = $true

    if ($BackendProvider -eq "railway") {
        Invoke-Checked -FilePath "railway" -Arguments @("up", "--project", $RailwayProjectId, "--environment", $RailwayEnvironment, "--service", $RailwayWorkerService, "--detach", "--ci") -WorkingDirectory $ReleaseWorktree
        $railwayWorkerDeployed = $true

        Invoke-Checked -FilePath "railway" -Arguments @("up", "--project", $RailwayProjectId, "--environment", $RailwayEnvironment, "--service", $RailwayClockService, "--detach", "--ci") -WorkingDirectory $ReleaseWorktree
        $railwayClockDeployed = $true
    }
    elseif ($BackendProvider -eq "fly") {
        Invoke-Checked -FilePath "flyctl" -Arguments @("deploy", "--remote-only", "-a", $FlyApp, "-c", $FlyConfigPath) -WorkingDirectory $ReleaseWorktree
        $flyDeployed = $true
    }
}
catch {
    Write-Warn "Rollout failed: $($_.Exception.Message)"

    if ($promoted -and $previousProdDeploymentUrl) {
        Write-Warn "Attempting Vercel rollback to previous deployment: $previousProdDeploymentUrl"
        Invoke-Checked -FilePath "vercel" -Arguments @("rollback", $previousProdDeploymentUrl, "--yes", "--scope", $VercelScope) -WorkingDirectory $ReleaseWorktree
    }

    if ($railwayClockDeployed) {
        Write-Warn "Attempting Railway rollback (down) for clock service"
        Invoke-Checked -FilePath "railway" -Arguments @("down", "--service", $RailwayClockService, "--environment", $RailwayEnvironment, "--yes") -WorkingDirectory $ReleaseWorktree -AllowedExitCodes @(0, 1)
    }

    if ($railwayWorkerDeployed) {
        Write-Warn "Attempting Railway rollback (down) for worker service"
        Invoke-Checked -FilePath "railway" -Arguments @("down", "--service", $RailwayWorkerService, "--environment", $RailwayEnvironment, "--yes") -WorkingDirectory $ReleaseWorktree -AllowedExitCodes @(0, 1)
    }

    if ($flyDeployed) {
        Write-Warn "Attempting Fly rollback (latest previous release)"
        try {
            Invoke-Checked -FilePath "flyctl" -Arguments @("releases", "rollback", "-a", $FlyApp) -WorkingDirectory $ReleaseWorktree -AllowedExitCodes @(0, 1)
        }
        catch {
            Write-Warn "Fly rollback failed: $($_.Exception.Message)"
        }
    }

    throw
}

Write-Phase "Phase 6 - Post-Deploy Verification and Record"
$summary = [ordered]@{
    timestamp_utc = (Get-Date).ToUniversalTime().ToString("o")
    release_worktree = $ReleaseWorktree
    supabase_project_ref = $SupabaseProjectRef
    vercel_project = $VercelProject
    vercel_scope = $VercelScope
    staged_deployment_url = $stagedDeploymentUrl
    promoted = $promoted
    backend_provider = $BackendProvider
    railway_project_id = $RailwayProjectId
    railway_environment = $RailwayEnvironment
    railway_worker_service = $RailwayWorkerService
    railway_clock_service = $RailwayClockService
    fly_app = $FlyApp
    fly_config = $FlyConfigPath
    artifacts_dir = $artifactsDir
}

$summaryPath = Join-Path $artifactsDir "release-summary.json"
$summary | ConvertTo-Json -Depth 5 | Out-File -FilePath $summaryPath -Encoding UTF8

Write-Host "\nRelease completed successfully." -ForegroundColor Green
Write-Host "Artifacts: $artifactsDir" -ForegroundColor Green
Write-Host "Summary:   $summaryPath" -ForegroundColor Green
