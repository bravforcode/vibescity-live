#!/usr/bin/env node

/**
 * Production Performance Baseline Runner
 * 
 * Runs comprehensive performance tests on production environment
 * and generates detailed reports for monitoring.
 */

import { chromium } from 'playwright';
import lighthouse from 'lighthouse';
import fs from 'fs/promises';

const PRODUCTION_URL = 'https://vibecity.live';

async function runProductionBaseline() {
  console.log('🚀 Running Production Performance Baseline');
  
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    // Test production site
    await page.goto(PRODUCTION_URL, { waitUntil: 'networkidle' });
    
    // Wait for map to load
    await page.waitForSelector('.maplibregl-map', { timeout: 30000 });
    await page.waitForTimeout(5000);
    
    // Run Lighthouse
    const startTime = Date.now();
    const result = await lighthouse(PRODUCTION_URL, {
      port: new URL(browser.wsEndpoint()).port,
      output: 'json',
      logLevel: 'info',
      onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo']
    });
    
    const endTime = Date.now();
    
    // Save results
    const reportData = {
      timestamp: new Date().toISOString(),
      url: PRODUCTION_URL,
      testDuration: endTime - startTime,
      lighthouse: result.lhr,
      metrics: {
        performanceScore: Math.round(result.lhr.categories.performance.score * 100),
        lcp: result.lhr.audits['largest-contentful-paint'].numericValue,
        fid: result.lhr.audits['first-input-delay'].numericValue,
        cls: result.lhr.audits['cumulative-layout-shift'].numericValue,
        ttfb: result.lhr.audits['time-to-first-byte'].numericValue
      }
    };
    
    // Save to reports
    await fs.mkdir('reports/production', { recursive: true });
    await fs.writeFile(
      `reports/production/baseline-${new Date().toISOString().split('T')[0]}.json`,
      JSON.stringify(reportData, null, 2)
    );
    
    console.log('✅ Production baseline complete');
    console.log(`📊 Performance Score: ${reportData.metrics.performanceScore}`);
    console.log(`⚡ LCP: ${Math.round(reportData.metrics.lcp)}ms`);
    console.log(`🎯 FID: ${Math.round(reportData.metrics.fid)}ms`);
    console.log(`📐 CLS: ${reportData.metrics.cls.toFixed(3)}`);
    
  } catch (error) {
    console.error('❌ Production baseline failed:', error);
  } finally {
    await browser.close();
  }
}

runProductionBaseline().catch(console.error);
