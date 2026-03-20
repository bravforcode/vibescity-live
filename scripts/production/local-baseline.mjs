#!/usr/bin/env node

/**
 * Local Performance Baseline Runner
 *
 * Runs comprehensive performance tests on local environment
 * and generates detailed reports for monitoring.
 */

import fs from "fs/promises";
import lighthouse from "lighthouse";
import { chromium } from "playwright";

const LOCAL_URL = "http://localhost:5175";

async function runLocalBaseline() {
  console.log("🚀 Running Local Performance Baseline");

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    // Test local site
    await page.goto(LOCAL_URL, { waitUntil: "networkidle" });

    // Wait for map to load
    await page.waitForSelector(".maplibregl-map", { timeout: 30000 });
    await page.waitForTimeout(5000);

    // Run Lighthouse
    const startTime = Date.now();
    const result = await lighthouse(LOCAL_URL, {
      port: 9222,
      output: "json",
      logLevel: "info",
      onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
    });

    const endTime = Date.now();

    // Save results
    const reportData = {
      timestamp: new Date().toISOString(),
      url: LOCAL_URL,
      testDuration: endTime - startTime,
      lighthouse: result.lhr,
      metrics: {
        performanceScore: Math.round(
          result.lhr.categories.performance.score * 100,
        ),
        lcp: result.lhr.audits["largest-contentful-paint"].numericValue,
        fid: result.lhr.audits["first-input-delay"].numericValue,
        cls: result.lhr.audits["cumulative-layout-shift"].numericValue,
        ttfb: result.lhr.audits["time-to-first-byte"].numericValue,
      },
    };

    // Save to reports
    await fs.mkdir("reports/local", { recursive: true });
    await fs.writeFile(
      `reports/local/baseline-${new Date().toISOString().split("T")[0]}.json`,
      JSON.stringify(reportData, null, 2),
    );

    console.log("✅ Local baseline complete");
    console.log(`📊 Performance Score: ${reportData.metrics.performanceScore}`);
    console.log(`⚡ LCP: ${Math.round(reportData.metrics.lcp)}ms`);
    console.log(`🎯 FID: ${Math.round(reportData.metrics.fid)}ms`);
    console.log(`📐 CLS: ${reportData.metrics.cls.toFixed(3)}`);
  } catch (error) {
    console.error("❌ Local baseline failed:", error);
  } finally {
    await browser.close();
  }
}

runLocalBaseline().catch(console.error);
