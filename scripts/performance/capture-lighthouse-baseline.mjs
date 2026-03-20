#!/usr/bin/env node

/**
 * Enterprise Lighthouse Baseline Capture
 *
 * Captures comprehensive performance baseline before any optimizations.
 * Generates detailed report with throttling simulation for realistic metrics.
 */

import fs from "fs/promises";
import path from "path";
import { chromium } from "playwright";

const CONFIG = {
  // URLs to test - production and local
  urls: ["https://vibecity.live", "http://localhost:5173"],

  // Throttling profiles for realistic testing
  throttling: {
    "fast-3g": {
      rttMs: 500,
      throughputKbps: 500,
      cpuSlowdownMultiplier: 4,
      requestLatencyMs: 500,
      downloadThroughputKbps: 500,
      uploadThroughputKbps: 500,
    },
    "slow-3g": {
      rttMs: 1400,
      throughputKbps: 50,
      cpuSlowdownMultiplier: 8,
      requestLatencyMs: 1400,
      downloadThroughputKbps: 50,
      uploadThroughputKbps: 50,
    },
  },

  // Lighthouse categories to audit
  categories: ["performance", "accessibility", "best-practices", "seo"],

  // Custom audits for map-specific metrics
  customAudits: {
    "map-interactive-time": {
      title: "Map Interactive Time",
      description: "Time until map becomes fully interactive",
      requiredArtifacts: ["traces"],
    },
    "pin-render-count": {
      title: "Pin Render Count",
      description: "Number of pins rendered in viewport",
      requiredArtifacts: ["dom"],
    },
    "tile-load-time": {
      title: "Map Tile Load Time",
      description: "Time to load critical map tiles",
      requiredArtifacts: ["network-requests"],
    },
  },
};

class LighthouseBaseline {
  constructor() {
    this.results = {};
    this.timestamp = new Date().toISOString();
  }

  async captureBaseline() {
    console.log("🚀 Starting Enterprise Lighthouse Baseline Capture");
    console.log(`📅 Timestamp: ${this.timestamp}`);

    // Ensure output directory exists
    await this.ensureDirectory("reports/performance/baseline");

    for (const url of CONFIG.urls) {
      console.log(`\n🌐 Testing URL: ${url}`);

      try {
        // Test with different throttling profiles
        for (const [profileName, throttling] of Object.entries(
          CONFIG.throttling,
        )) {
          console.log(`  📶 Throttling: ${profileName}`);

          const result = await this.runLighthouse(url, throttling);
          const filename = `baseline-${url.replace(/[^a-zA-Z0-9]/g, "-")}-${profileName}.json`;

          await this.saveResult(result, filename);
          this.results[`${url}-${profileName}`] = result;
        }
      } catch (error) {
        console.error(`❌ Failed to test ${url}:`, error.message);
      }
    }

    // Generate comprehensive report
    await this.generateReport();

    console.log("\n✅ Lighthouse baseline capture complete!");
    console.log(
      "📊 Report saved to: reports/performance/baseline/comprehensive-report.html",
    );
  }

  async runLighthouse(url, throttling) {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    // Wait for page to fully load
    await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });

    // Wait for map to be interactive (custom check)
    await this.waitForMapInteractive(page);

    // Run Lighthouse
    const lighthouseOptions = {
      logLevel: "info",
      output: "json",
      onlyCategories: CONFIG.categories,
      port: new URL(browser.wsEndpoint()).port,
    };

    // Use lighthouse directly with the page
    const runnerResult = await lighthouse(page.url(), lighthouseOptions);

    await browser.close();
    return runnerResult;
  }

  async waitForMapInteractive(page) {
    // Custom wait for map-specific interactive elements
    try {
      await page.waitForFunction(
        () => {
          // Check for map container and key interactive elements
          const mapContainer = document.querySelector(".maplibregl-map");
          const mapMarkers = document.querySelectorAll(
            '[data-testid="venue-marker"]',
          );
          const mapControls = document.querySelector(".maplibregl-ctrl");

          return mapContainer && mapControls && mapMarkers.length > 0;
        },
        { timeout: 30000 },
      );

      // Additional wait for map metrics if available
      await page.waitForTimeout(2000);
    } catch (error) {
      console.warn("⚠️ Map interactive check failed, proceeding anyway");
    }
  }

  async saveResult(result, filename) {
    const outputPath = path.join("reports/performance/baseline", filename);
    await fs.writeFile(outputPath, JSON.stringify(result, null, 2));
    console.log(`  💾 Saved: ${outputPath}`);
  }

  async ensureDirectory(dirPath) {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
      // Directory already exists
    }
  }

  async generateReport() {
    const reportHtml = this.createReportHTML();
    const reportPath = "reports/performance/baseline/comprehensive-report.html";

    await fs.writeFile(reportPath, reportHtml);

    // Generate summary JSON for programmatic access
    const summary = this.extractSummaryMetrics();
    const summaryPath = "reports/performance/baseline/summary-metrics.json";
    await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));
  }

  createReportHTML() {
    const { timestamp } = this;
    let html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>VibeCity Performance Baseline Report</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f8fafc; }
        .container { max-width: 1200px; margin: 0 auto; }
        .header { text-align: center; margin-bottom: 40px; }
        .metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-bottom: 40px; }
        .metric-card { background: white; padding: 24px; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .metric-value { font-size: 2.5rem; font-weight: bold; color: #1e293b; }
        .metric-label { color: #64748b; margin-top: 8px; }
        .chart-container { background: white; padding: 24px; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 20px; }
        .status-good { color: #10b981; }
        .status-warning { color: #f59e0b; }
        .status-critical { color: #ef4444; }
        .url-section { margin-bottom: 40px; }
        .url-title { font-size: 1.5rem; font-weight: bold; margin-bottom: 20px; color: #1e293b; }
        .throttling-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #e5e7eb; }
        th { background: #f9fafb; font-weight: 600; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚀 VibeCity Performance Baseline</h1>
            <p>Captured: ${timestamp}</p>
        </div>
`;

    // Add results for each URL
    for (const url of CONFIG.urls) {
      html += `<div class="url-section">`;
      html += `<div class="url-title">📍 ${url}</div>`;
      html += `<div class="throttling-grid">`;

      for (const profileName of Object.keys(CONFIG.throttling)) {
        const key = `${url}-${profileName}`;
        const result = this.results[key];

        if (result) {
          html += this.createMetricsCard(result, profileName);
        }
      }

      html += `</div></div>`;
    }

    html += `
        <div class="chart-container">
            <h2>📊 Performance Comparison</h2>
            <canvas id="performanceChart" width="400" height="200"></canvas>
        </div>

        <div class="chart-container">
            <h2>🗺️ Map-Specific Metrics</h2>
            <canvas id="mapMetricsChart" width="400" height="200"></canvas>
        </div>
    </div>

    <script>
        // Performance data
        const performanceData = ${JSON.stringify(this.extractChartData())};

        // Create performance comparison chart
        const perfCtx = document.getElementById('performanceChart').getContext('2d');
        new Chart(perfCtx, {
            type: 'bar',
            data: performanceData.performance,
            options: {
                responsive: true,
                plugins: {
                    title: { display: true, text: 'Core Web Vitals' }
                },
                scales: {
                    y: { beginAtZero: true, title: { display: true, text: 'Time (ms)' } }
                }
            }
        });

        // Create map metrics chart
        const mapCtx = document.getElementById('mapMetricsChart').getContext('2d');
        new Chart(mapCtx, {
            type: 'line',
            data: performanceData.mapMetrics,
            options: {
                responsive: true,
                plugins: {
                    title: { display: true, text: 'Map Load Performance' }
                },
                scales: {
                    y: { beginAtZero: true, title: { display: true, text: 'Count / Time (ms)' } }
                }
            }
        });
    </script>
</body>
</html>`;

    return html;
  }

  createMetricsCard(result, profileName) {
    const { url: pageUrl, categories } = result;
    const performance = categories.performance;
    const lcp = result.audits["largest-contentful-paint"];
    const fid = result.audits["first-input-delay"];
    const cls = result.audits["cumulative-layout-shift"];

    const getScoreColor = (score) => {
      if (score >= 0.9) return "status-good";
      if (score >= 0.5) return "status-warning";
      return "status-critical";
    };

    return `
      <div class="metric-card">
        <h3>${profileName.toUpperCase()}</h3>
        <div class="metric-value ${getScoreColor(performance.score)}">
          ${Math.round(performance.score * 100)}
        </div>
        <div class="metric-label">Performance Score</div>

        <table>
          <tr>
            <th>Metric</th>
            <th>Value</th>
            <th>Status</th>
          </tr>
          <tr>
            <td>LCP</td>
            <td>${Math.round(lcp.numericValue)}ms</td>
            <td class="${getScoreColor(lcp.score)}">${lcp.displayValue}</td>
          </tr>
          <tr>
            <td>FID</td>
            <td>${Math.round(fid.numericValue)}ms</td>
            <td class="${getScoreColor(fid.score)}">${fid.displayValue}</td>
          </tr>
          <tr>
            <td>CLS</td>
            <td>${cls.numericValue.toFixed(3)}</td>
            <td class="${getScoreColor(cls.score)}">${cls.displayValue}</td>
          </tr>
        </table>
      </div>
    `;
  }

  extractSummaryMetrics() {
    const summary = {
      timestamp: this.timestamp,
      urls: CONFIG.urls,
      profiles: Object.keys(CONFIG.throttling),
      metrics: {},
    };

    for (const [key, result] of Object.entries(this.results)) {
      const [url, profile] = key.split("-");

      if (!summary.metrics[url]) {
        summary.metrics[url] = {};
      }

      summary.metrics[url][profile] = {
        performanceScore: Math.round(result.categories.performance.score * 100),
        lcp: Math.round(result.audits["largest-contentful-paint"].numericValue),
        fid: Math.round(result.audits["first-input-delay"].numericValue),
        cls: result.audits["cumulative-layout-shift"].numericValue,
      };
    }

    return summary;
  }

  extractChartData() {
    const labels = CONFIG.urls.map((url) => url.replace(/https?:\/\//, ""));

    return {
      performance: {
        labels: labels,
        datasets: [
          {
            label: "Fast 3G - Performance Score",
            data: labels.map((url) => {
              const result = this.results[`${url}-fast-3g`];
              return result
                ? Math.round(result.categories.performance.score * 100)
                : 0;
            }),
            backgroundColor: "#3b82f6",
          },
          {
            label: "Slow 3G - Performance Score",
            data: labels.map((url) => {
              const result = this.results[`${url}-slow-3g`];
              return result
                ? Math.round(result.categories.performance.score * 100)
                : 0;
            }),
            backgroundColor: "#ef4444",
          },
        ],
      },
      mapMetrics: {
        labels: labels,
        datasets: [
          {
            label: "LCP (ms)",
            data: labels.map((url) => {
              const result = this.results[`${url}-fast-3g`];
              return result
                ? Math.round(
                    result.audits["largest-contentful-paint"].numericValue,
                  )
                : 0;
            }),
            borderColor: "#f59e0b",
            backgroundColor: "rgba(245, 158, 11, 0.1)",
          },
        ],
      },
    };
  }
}

// Execute baseline capture
const baseline = new LighthouseBaseline();
baseline.captureBaseline().catch(console.error);
