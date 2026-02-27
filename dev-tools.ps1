# VibeCity Developer Commands
# Run this script or copy commands to execute tasks

function Show-Menu {
    Write-Host "============================" -ForegroundColor Cyan
    Write-Host "   VibeCity Dev Console     " -ForegroundColor Yellow
    Write-Host "============================" -ForegroundColor Cyan
    Write-Host "1. Run Dev Server (bun run dev)"
    Write-Host "2. Run Unit Tests (bun run test:unit)"
    Write-Host "3. Run E2E Tests (npx playwright test)"
    Write-Host "4. Build Production (bun run build)"
    Write-Host "5. Preview Build (bun run preview)"
    Write-Host "6. Lint & Fix (bun run lint)"
    Write-Host "q. Quit"
    Write-Host "============================" -ForegroundColor Cyan
}

do {
    Show-Menu
    $choice = Read-Host "Select an option"
    
    switch ($choice) {
        "1" { Write-Host "Starting Dev Server..." -ForegroundColor Green; npm run dev }
        "2" { Write-Host "Running Unit Tests..." -ForegroundColor Green; npm run test:unit }
        "3" { Write-Host "Running E2E Tests..." -ForegroundColor Green; npx playwright test }
        "4" { Write-Host "Building Project..." -ForegroundColor Green; npm run build }
        "5" { Write-Host "Previewing Build..." -ForegroundColor Green; npm run preview }
        "6" { Write-Host "Linting Code..." -ForegroundColor Green; bun run lint }
        "q" { Write-Host "Exiting..." -ForegroundColor Gray }
        default { Write-Host "Invalid option, please try again." -ForegroundColor Red }
    }
    if ($choice -ne "q") {
        Read-Host "Press Enter to continue..."
    }
} until ($choice -eq "q")
