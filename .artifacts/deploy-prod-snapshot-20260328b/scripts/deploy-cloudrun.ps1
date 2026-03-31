# scripts\deploy-cloudrun.ps1
# VibeCity — One-command deploy to Google Cloud Run
# Usage: .\scripts\deploy-cloudrun.ps1 -ProjectId YOUR_PROJECT_ID
#
# Prerequisites:
#   1. gcloud CLI installed: https://cloud.google.com/sdk/docs/install
#   2. gcloud auth login
#   3. Secrets set in Secret Manager (see migration_plan.md)

param(
    [Parameter(Mandatory=$true)]
    [string]$ProjectId,

    [string]$Region = "asia-southeast1",
    [string]$ServiceName = "vibecity-api",
    [string]$Memory = "512Mi",
    [string]$Cpu = "1",
    [int]$MinInstances = 0,
    [int]$MaxInstances = 10
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Write-Host "[+] VibeCity Cloud Run Deploy" -ForegroundColor Cyan
Write-Host "[+] Project: $ProjectId | Region: $Region" -ForegroundColor Cyan

# 1. Set project
Write-Host "[1] Setting GCP project..." -ForegroundColor Yellow
gcloud config set project $ProjectId

# 2. Enable required APIs
Write-Host "[2] Enabling APIs..." -ForegroundColor Yellow
gcloud services enable run.googleapis.com secretmanager.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com

# 3. Build & Deploy
Write-Host "[3] Building and deploying to Cloud Run..." -ForegroundColor Yellow
Write-Host "    This may take 3-5 minutes on first build."

$SecretFlags = @(
    "SUPABASE_URL=SUPABASE_URL:latest",
    "SUPABASE_KEY=SUPABASE_KEY:latest",
    "SUPABASE_SERVICE_ROLE_KEY=SUPABASE_SERVICE_ROLE_KEY:latest",
    "VISITOR_SIGNING_SECRET=VISITOR_SIGNING_SECRET:latest",
    "STRIPE_SECRET_KEY=STRIPE_SECRET_KEY:latest",
    "REDIS_URL=REDIS_URL:latest"
) -join ","

$EnvFlags = @(
    "ENV=production",
    "PROJECT_NAME=VibeCity API",
    "FRONTEND_URL=https://vibecity.live",
    "METRICS_ENABLED=true"
) -join ","

gcloud run deploy $ServiceName `
    --source . `
    --region $Region `
    --platform managed `
    --allow-unauthenticated `
    --port 8000 `
    --memory $Memory `
    --cpu $Cpu `
    --min-instances $MinInstances `
    --max-instances $MaxInstances `
    --timeout 30s `
    --set-env-vars $EnvFlags `
    --set-secrets $SecretFlags `
    --project $ProjectId

# 4. Get service URL
Write-Host "[4] Getting service URL..." -ForegroundColor Yellow
$ServiceUrl = gcloud run services describe $ServiceName `
    --region $Region `
    --project $ProjectId `
    --format "value(status.url)"

Write-Host ""
Write-Host "[OK] Deploy complete!" -ForegroundColor Green
Write-Host "     URL: $ServiceUrl" -ForegroundColor Green
Write-Host ""

# 5. Health check
Write-Host "[5] Health check..." -ForegroundColor Yellow
$HealthUrl = "$ServiceUrl/health"
try {
    $Response = Invoke-WebRequest -Uri $HealthUrl -TimeoutSec 15 -UseBasicParsing
    if ($Response.StatusCode -eq 200) {
        Write-Host "[OK] Health check passed ($HealthUrl)" -ForegroundColor Green
    } else {
        Write-Warning "[!] Health endpoint returned $($Response.StatusCode)"
    }
} catch {
    Write-Warning "[!] Health check failed: $_"
    Write-Host "    Check logs: gcloud run logs read --service $ServiceName --region $Region --project $ProjectId"
}

Write-Host ""
Write-Host "[NEXT] Update Vercel env: VITE_API_URL = $ServiceUrl" -ForegroundColor Cyan
Write-Host "[NEXT] After verify: fly apps destroy vibecity-api" -ForegroundColor Cyan
Write-Host "[NEXT] Update osm-sync.yml PROD_ANALYTICS_STATS_URL to: $ServiceUrl" -ForegroundColor Cyan
