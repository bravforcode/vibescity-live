#!/usr/bin/env node

/**
 * Simple Performance Baseline Runner
 *
 * Runs basic performance tests without Lighthouse dependency
 */

import fs from "fs/promises";
import { chromium } from "playwright";

const LOCAL_URL = "http://localhost:5175";

async function runSimpleBaseline() {
  console.log("🚀 Running Simple Performance Baseline");

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    // Start performance monitoring
    const navigationStart = Date.now();

    // Test local site
    await page.goto(LOCAL_URL, { waitUntil: "domcontentloaded" });

    // Wait for map to load
    await page.waitForSelector(".maplibregl-map", { timeout: 30000 });
    await page.waitForTimeout(5000);

    const navigationEnd = Date.now();

    // Collect performance metrics
    const metrics = await page.evaluate(() => {
      const navigation = performance.getEntriesByType("navigation")[0];
      const paint = performance.getEntriesByType("paint");

      return {
        loadTime: navigation.loadEventEnd - navigation.loadEventStart,
        domContentLoaded:
          navigation.domContentLoadedEventEnd -
          navigation.domContentLoadedEventStart,
        firstPaint: paint.find((p) => p.name === "first-paint")?.startTime || 0,
        firstContentfulPaint:
          paint.find((p) => p.name === "first-contentful-paint")?.startTime ||
          0,
        resources: performance.getEntriesByType("resource").length,
      };
    });

    // Save results
    const reportData = {
      timestamp: new Date().toISOString(),
      url: LOCAL_URL,
      navigationTime: navigationEnd - navigationStart,
      metrics,
      status: "success",
    };

    // Save to reports
    await fs.mkdir("reports/simple", { recursive: true });
    await fs.writeFile(
      `reports/simple/baseline-${new Date().toISOString().split("T")[0]}.json`,
      JSON.stringify(reportData, null, 2),
    );

    console.log("✅ Simple baseline complete");
    console.log(`📊 Navigation Time: ${reportData.navigationTime}ms`);
    console.log(`⚡ Load Time: ${metrics.loadTime}ms`);
    console.log(`🎯 DOM Content Loaded: ${metrics.domContentLoaded}ms`);
    console.log(
      `📐 First Contentful Paint: ${Math.round(metrics.firstContentfulPaint)}ms`,
    );
    console.log(`📦 Resources Loaded: ${metrics.resources}`);
  } catch (error) {
    console.error("❌ Simple baseline failed:", error);
  } finally {
    await browser.close();
  }
}

runSimpleBaseline().catch(console.error);
