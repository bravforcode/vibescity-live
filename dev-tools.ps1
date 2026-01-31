# VibeCity Developer Commands
# Run this script or copy commands to execute tasks

function Show-AgentSkills {
    Write-Host "`n🚀 AI Agent Power Prompts (Copy & Paste these to Claude):" -ForegroundColor Magenta
    Write-Host "--------------------------------------------------------" -ForegroundColor Gray
    Write-Host "1. [Loki Mode] Build Startup/Feature:" -ForegroundColor Cyan
    Write-Host "   'Start Loki Mode to build a [Feature Name] from scratch. Define the PRD and start implementation.'"

    Write-Host "`n2. [UI/UX Pro Max] Redesign Interface:" -ForegroundColor Cyan
    Write-Host "   'Use ui-ux-pro-max to redesign [Page/Component]. Make it [Style e.g., Glassmorphism] with [dark/light] theme.'"

    Write-Host "`n3. [Pentest Checklist] Security Check:" -ForegroundColor Cyan
    Write-Host "   'Create a comprehensive penetration testing checklist for [Feature/API] using the pentest-checklist skill.'"

    Write-Host "`n4. [Voice Agents] Real-time Voice AI:" -ForegroundColor Cyan
    Write-Host "   'Architect a real-time voice agent using OpenAI Realtime API that can handle [Use Case].'"

    Write-Host "`n5. [3D Web] Immersive 3D Experience:" -ForegroundColor Cyan
    Write-Host "   'Create a 3D [Product/Scene] using Three.js and React Three Fiber. Allow user interaction.'"




    Write-Host "`n--- 🏙️ VIBECITY PROJECT SPECIFIC ---" -ForegroundColor Yellow

    Write-Host "6. [Style] VibeCity Aesthetic (Tailwind):" -ForegroundColor Cyan
    Write-Host "   'Use tailwind-patterns to polish [Component]. Match the VibeCity neon/glass aesthetic.'"

    Write-Host "`n7. [Perf] Map & App Optimization:" -ForegroundColor Cyan
    Write-Host "   'Use web-performance-optimization to analyze [File] for map rendering bottlenecks and CLS.'"

    Write-Host "`n8. [Data] Supabase & GeoSQL:" -ForegroundColor Cyan
    Write-Host "   'Use supabase-postgres-best-practices to optimize geospatial queries in [File].'"

    Write-Host "`n9. [Code] Vue Composable Refactor:" -ForegroundColor Cyan
    Write-Host "   'Refactor [useAppLogic.js/Files] to follow strict clean-code principles and improve reusability.'"

    Write-Host "`n10. [Visual] UI Visual Validator:" -ForegroundColor Cyan
    Write-Host "   'Use ui-visual-validator to verify if [Page/Component] matches the Neon/Glass aesthetic guidelines.'"

    Write-Host "`n11. [Feature] Vue Component Scaffold:" -ForegroundColor Cyan
    Write-Host "   'Use frontend-mobile-development-component-scaffold to create a new [Component Name] with TypeScript and Tailwind.'"

    Write-Host "`n12. [Debug] Systematic Debugging:" -ForegroundColor Cyan
    Write-Host "   'Use systematic-debugging to investigate [Bug/Error Message]
    in [File]. Find the root cause and fix it.'"

    Write-Host "--------------------------------------------------------" -ForegroundColor Gray

    Write-Host "`n--- 🛠️ QA & UX POWER TOOLS ---" -ForegroundColor Yellow

    Write-Host "13. [Test] Auto-Fix Failing Tests:" -ForegroundColor Cyan
    Write-Host "    'Use test-fixing to run the test suite and
    automatically fix any failures found.'"

    Write-Host "`n14. [Test] Full E2E Browser Test:" -ForegroundColor Cyan
    Write-Host "    'Use playwright-skill to test the user flow: Map Load -> Click Shop -> Open Drawer -> Scroll.'"

    Write-Host "`n15. [UX] Mobile-First Audit:" -ForegroundColor Cyan
    Write-Host "    'Use mobile-design to review [File/Component]. ensuring touch targets (>44px) and safe areas are correct.'"

    Write-Host "`n16. [UX] Accessibility Check (WCAG):" -ForegroundColor Cyan
    Write-Host "    'Use wcag-audit-patterns to audit the [Component] for color contrast and screen reader compatibility.'"

    Write-Host "`n17. [Visual] Cinematic Scroll Polish:" -ForegroundColor Cyan
    Write-Host "    'Use scroll-experience to refine the synchronization between the Card Scroll and Map FlyTo animation.'"

    Write-Host "`n18. [Debug] Deep Error Detective:" -ForegroundColor Cyan
    Write-Host "    'Use error-detective to analyze [Log File/Error Message]
     and find the root cause across the stack.'"

    Write-Host "--------------------------------------------------------" -ForegroundColor Gray
}

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
    Write-Host "7. ✨ Show AI Agent Skill Prompts"
    Write-Host "q. Quit"
    Write-Host "============================" -ForegroundColor Cyan
}

do {
    Show-Menu
    $choice = Read-Host "Select an option"

    switch ($choice) {
        "1" { Write-Host "Starting Dev Server..." -ForegroundColor Green; bun run dev }
        "2" { Write-Host "Running Unit Tests..." -ForegroundColor Green; bun run test:unit }
        "3" { Write-Host "Running E2E Tests..." -ForegroundColor Green; npx playwright test }
        "4" { Write-Host "Building Project..." -ForegroundColor Green; bun run build }
        "5" { Write-Host "Previewing Build..." -ForegroundColor Green; bun run preview }
        "6" { Write-Host "Linting Code..." -ForegroundColor Green; bun run lint }
        "7" { Show-AgentSkills }
        "q" { Write-Host "Exiting..." -ForegroundColor Gray }
        default { Write-Host "Invalid option, please try again." -ForegroundColor Red }
    }
    if ($choice -ne "q") {
        Read-Host "Press Enter to continue..."
    }
} until ($choice -eq "q")
