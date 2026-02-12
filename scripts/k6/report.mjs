import fs from "fs/promises";
import path from "path";
import { buildHtmlReport } from "../../k6-tests/lib/summary-report.js";

const args = new Set(process.argv.slice(2));
const reportsDir = path.join("reports", "k6");
const summaryPath = path.join(reportsDir, "summary.json");
const htmlPath = path.join(reportsDir, "report.html");

await fs.mkdir(reportsDir, { recursive: true });

if (args.has("--prepare") && args.size === 1) {
  process.exit(0);
}

try {
  const raw = await fs.readFile(summaryPath, "utf-8");
  const data = JSON.parse(raw);
  const html = buildHtmlReport(data);
  await fs.writeFile(htmlPath, html, "utf-8");
  console.log(`k6 report generated: ${htmlPath}`);
} catch (error) {
  if (args.has("--build")) {
    console.error("k6 report generation failed:", error.message);
    process.exit(1);
  }
}
