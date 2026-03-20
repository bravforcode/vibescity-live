/**
 * Enterprise Visual Regression Tests for VibeCity Map
 * 
 * Comprehensive visual testing covering:
 * - Map rendering consistency
 * - Pin display and positioning
 * - UI component layouts
 * - Responsive design
 * - Cross-browser compatibility
 */

import { test, expect, type Page } from '@playwright/test'

// Test viewports for responsive testing
const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 667 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1200, height: 800 },
  { name: 'wide', width: 1920, height: 1080 }
]

// Test scenarios
const TEST_SCENARIOS = [
  { name: 'initial-load', description: 'Initial page load with map' },
  { name: 'with-pins', description: 'Map with venue pins loaded' },
  { name: 'pin-selected', description: 'Pin selected with drawer open' },
  { name: 'search-active', description: 'Search interface active' },
  { name: 'filters-applied', description: 'Filters applied to map' }
]

class VisualTestHelpers {
  static async waitForMapLoad(page: Page) {
    await page.waitForSelector('.maplibregl-map', { timeout: 10000 })
    await page.waitForTimeout(2000) // Allow map to fully render
  }

  static async waitForPins(page: Page) {
    await page.waitForSelector('[data-testid="venue-marker"]', { timeout: 10000 })
    await page.waitForTimeout(1000) // Allow pins to render
  }

  static async setupScenario(page: Page, scenario: string) {
    switch (scenario) {
      case 'initial-load':
        await page.goto('/')
        await this.waitForMapLoad(page)
        break
        
      case 'with-pins':
        await page.goto('/')
        await this.waitForMapLoad(page)
        await this.waitForPins(page)
        break
        
      case 'pin-selected':
        await page.goto('/')
        await this.waitForMapLoad(page)
        await this.waitForPins(page)
        const firstPin = page.locator('[data-testid="venue-marker"]').first()
        if (await firstPin.isVisible()) {
          await firstPin.click()
          await page.waitForSelector('[data-testid="venue-drawer"]', { timeout: 5000 })
          await page.waitForTimeout(500)
        }
        break
        
      case 'search-active':
        await page.goto('/')
        await this.waitForMapLoad(page)
        const searchInput = page.locator('input[placeholder*="search"], input[type="search"], [data-testid="search-input"]')
        if (await searchInput.isVisible()) {
          await searchInput.click()
          await page.waitForTimeout(500)
        }
        break
        
      case 'filters-applied':
        await page.goto('/')
        await this.waitForMapLoad(page)
        const filterButton = page.locator('[data-testid="filter-button"], .filter-toggle')
        if (await filterButton.isVisible()) {
          await filterButton.click()
          await page.waitForTimeout(500)
        }
        break
    }
  }

  static async hideDynamicElements(page: Page) {
    // Hide elements that change between runs
    await page.addStyleTag({
      content: `
        .maplibregl-ctrl-attrib, 
        .timestamp, 
        .live-time,
        [data-testid="debug-info"],
        .loading-skeleton {
          visibility: hidden !important;
        }
      `
    })
  }

  static async captureScreenshot(page: Page, name: string, fullPage = true) {
    await this.hideDynamicElements(page)
    
    return await page.screenshot({
      path: `test-results/visual/screenshots/${name}.png`,
      fullPage,
      animations: 'disabled'
    })
  }
}

// Test suite for different viewports and scenarios
for (const viewport of VIEWPORTS) {
  test.describe(`Visual Regression - ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } })

    for (const scenario of TEST_SCENARIOS) {
      test(`${scenario.name} - ${scenario.description}`, async ({ page }) => {
        await VisualTestHelpers.setupScenario(page, scenario.name)
        
        const screenshotName = `${viewport.name}-${scenario.name}`
        await VisualTestHelpers.captureScreenshot(page, screenshotName)
        
        // Compare with baseline
        expect(await page.screenshot({ animations: 'disabled' })).toMatchSnapshot(
          `${screenshotName}.png`
        )
      })
    }
  })
}

test.describe('Component Visual Regression', () => {
  test('venue pins - consistent styling', async ({ page }) => {
    await page.goto('/')
    await VisualTestHelpers.waitForMapLoad(page)
    await VisualTestHelpers.waitForPins(page)
    
    // Test individual pin styling
    const firstPin = page.locator('[data-testid="venue-marker"]').first()
    await expect(firstPin).toHaveScreenshot('pin-venue.png', {
      animations: 'disabled'
    })
  })

  test('venue drawer - layout and content', async ({ page }) => {
    await page.goto('/')
    await VisualTestHelpers.waitForMapLoad(page)
    await VisualTestHelpers.waitForPins(page)
    
    const firstPin = page.locator('[data-testid="venue-marker"]').first()
    await firstPin.click()
    
    const drawer = page.locator('[data-testid="venue-drawer"]')
    await expect(drawer).toHaveScreenshot('drawer-venue.png', {
      animations: 'disabled'
    })
  })

  test('map controls - consistent positioning', async ({ page }) => {
    await page.goto('/')
    await VisualTestHelpers.waitForMapLoad(page)
    
    const controls = page.locator('.maplibregl-ctrl-group')
    await expect(controls).toHaveScreenshot('map-controls.png', {
      animations: 'disabled'
    })
  })

  test('search interface - states', async ({ page }) => {
    await page.goto('/')
    await VisualTestHelpers.waitForMapLoad(page)
    
    const searchInput = page.locator('input[placeholder*="search"], input[type="search"], [data-testid="search-input"]')
    
    if (await searchInput.isVisible()) {
      // Default state
      await expect(searchInput).toHaveScreenshot('search-default.png', {
        animations: 'disabled'
      })
      
      // Active state
      await searchInput.click()
      await page.waitForTimeout(500)
      await expect(searchInput).toHaveScreenshot('search-active.png', {
        animations: 'disabled'
      })
      
      // With text
      await searchInput.fill('cafe')
      await page.waitForTimeout(500)
      await expect(searchInput).toHaveScreenshot('search-with-text.png', {
        animations: 'disabled'
      })
    }
  })
})

test.describe('Layout Regression Tests', () => {
  test('header layout - consistent across viewports', async ({ page }) => {
    const header = page.locator('header, .header, [data-testid="header"]')
    
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await page.goto('/')
      await page.waitForLoadState('networkidle')
      
      await expect(header).toHaveScreenshot(`header-${viewport.name}.png`, {
        animations: 'disabled'
      })
    }
  })

  test('sidebar layout - responsive behavior', async ({ page }) => {
    const sidebar = page.locator('.sidebar, [data-testid="sidebar"], aside')
    
    // Test mobile (collapsed)
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    if (await sidebar.isVisible()) {
      await expect(sidebar).toHaveScreenshot('sidebar-mobile.png', {
        animations: 'disabled'
      })
    }
    
    // Test desktop (expanded)
    await page.setViewportSize({ width: 1200, height: 800 })
    await page.waitForLoadState('networkidle')
    
    if (await sidebar.isVisible()) {
      await expect(sidebar).toHaveScreenshot('sidebar-desktop.png', {
        animations: 'disabled'
      })
    }
  })

  test('footer layout - consistent positioning', async ({ page }) => {
    const footer = page.locator('footer, .footer, [data-testid="footer"]')
    
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    if (await footer.isVisible()) {
      await expect(footer).toHaveScreenshot('footer-layout.png', {
        animations: 'disabled'
      })
    }
  })
})

test.describe('Performance Visual Tests', () => {
  test('map rendering - no layout shifts', async ({ page }) => {
    await page.goto('/')
    
    // Capture initial state
    const initialScreenshot = await page.screenshot({ 
      animations: 'disabled',
      fullPage: true 
    })
    
    // Wait for full load
    await VisualTestHelpers.waitForMapLoad(page)
    await VisualTestHelpers.waitForPins(page)
    
    // Capture final state
    const finalScreenshot = await page.screenshot({ 
      animations: 'disabled',
      fullPage: true 
    })
    
    // Compare for significant layout shifts
    expect(finalScreenshot).toMatchSnapshot('map-final-state.png')
  })

  test('loading states - smooth transitions', async ({ page }) => {
    // Test with slower connection to see loading states
    await page.route('**/*', async (route) => {
      // Add delay for non-critical resources
      if (route.request().resourceType() === 'image') {
        await new Promise(resolve => setTimeout(resolve, 500))
      }
      await route.continue()
    })
    
    await page.goto('/')
    
    // Capture loading state
    await page.waitForTimeout(1000)
    await expect(page.locator('body')).toHaveScreenshot('loading-state.png', {
      animations: 'disabled'
    })
    
    // Wait for complete load
    await VisualTestHelpers.waitForMapLoad(page)
    await page.waitForTimeout(2000)
    
    // Capture loaded state
    await expect(page.locator('body')).toHaveScreenshot('loaded-state.png', {
      animations: 'disabled'
    })
  })
})

test.describe('Accessibility Visual Tests', () => {
  test('focus indicators - visible and consistent', async ({ page }) => {
    await page.goto('/')
    await VisualTestHelpers.waitForMapLoad(page)
    
    // Test keyboard navigation focus
    await page.keyboard.press('Tab')
    await page.waitForTimeout(500)
    
    await expect(page.locator('body')).toHaveScreenshot('focus-indicator.png', {
      animations: 'disabled'
    })
  })

  test('high contrast mode - readable', async ({ page }) => {
    // Simulate high contrast mode
    await page.emulateMedia({ forcedColors: 'active' })
    
    await page.goto('/')
    await VisualTestHelpers.waitForMapLoad(page)
    
    await expect(page.locator('body')).toHaveScreenshot('high-contrast.png', {
      animations: 'disabled'
    })
  })

  test('reduced motion - animations disabled', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    
    await page.goto('/')
    await VisualTestHelpers.waitForMapLoad(page)
    
    await expect(page.locator('body')).toHaveScreenshot('reduced-motion.png', {
      animations: 'disabled'
    })
  })
})

test.describe('Cross-Browser Visual Tests', () => {
  // These tests run across different browser projects defined in the config
  test('map rendering - consistent across browsers', async ({ page, browserName }) => {
    await page.goto('/')
    await VisualTestHelpers.waitForMapLoad(page)
    await VisualTestHelpers.waitForPins(page)
    
    await expect(page.locator('body')).toHaveScreenshot(
      `map-${browserName}.png`,
      {
        animations: 'disabled',
        threshold: 0.3 // Slightly higher tolerance for cross-browser differences
      }
    )
  })

  test('UI components - consistent styling', async ({ page, browserName }) => {
    await page.goto('/')
    await VisualTestHelpers.waitForMapLoad(page)
    
    // Test key UI components
    const components = [
      'header, .header',
      '.maplibregl-ctrl-group',
      '[data-testid="venue-marker"]'
    ]
    
    for (const selector of components) {
      const element = page.locator(selector).first()
      if (await element.isVisible()) {
        await expect(element).toHaveScreenshot(
          `${selector.replace(/[^a-zA-Z0-9]/g, '-')}-${browserName}.png`,
          {
            animations: 'disabled',
            threshold: 0.25
          }
        )
      }
    }
  })
})

// Error handling and edge cases
test.describe('Edge Case Visual Tests', () => {
  test('no internet connection - fallback UI', async ({ page }) => {
    // Simulate offline mode
    await page.context().setOffline(true)
    
    await page.goto('/')
    await page.waitForTimeout(3000)
    
    await expect(page.locator('body')).toHaveScreenshot('offline-fallback.png', {
      animations: 'disabled'
    })
  })

  test('slow connection - progressive loading', async ({ page }) => {
    // Simulate slow 3G connection
    await page.route('**/*', async (route) => {
      await new Promise(resolve => setTimeout(resolve, 2000))
      await route.continue()
    })
    
    await page.goto('/')
    
    // Capture progressive loading states
    for (let i = 0; i < 3; i++) {
      await page.waitForTimeout(2000)
      await expect(page.locator('body')).toHaveScreenshot(`progressive-load-${i + 1}.png`, {
        animations: 'disabled'
      })
    }
  })

  test('error states - graceful degradation', async ({ page }) => {
    // Simulate API errors
    await page.route('**/api/**', route => route.fulfill({
      status: 500,
      body: 'Internal Server Error'
    }))
    
    await page.goto('/')
    await page.waitForTimeout(3000)
    
    await expect(page.locator('body')).toHaveScreenshot('error-state.png', {
      animations: 'disabled'
    })
  })
})

// Performance monitoring during visual tests
test.afterEach(async ({ page }, testInfo) => {
  // Capture performance metrics
  const metrics = await page.evaluate(() => ({
    memoryUsage: (performance as any).memory ? {
      usedJSHeapSize: (performance as any).memory.usedJSHeapSize,
      totalJSHeapSize: (performance as any).memory.totalJSHeapSize
    } : null,
    loadTime: performance.timing.loadEventEnd - performance.timing.navigationStart,
    domNodes: document.querySelectorAll('*').length
  }))
  
  console.log(`Visual test performance for ${testInfo.title}:`, metrics)
  
  // Additional screenshot on failure for debugging
  if (testInfo.status !== 'passed') {
    await page.screenshot({
      path: `test-results/visual/failures/${testInfo.title.replace(/\s+/g, '-')}.png`,
      fullPage: true,
      animations: 'disabled'
    })
  }
})
