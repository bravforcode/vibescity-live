#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const DIST_DIR = path.resolve(process.cwd(), "dist");
const SAMPLE_LIMIT = Math.max(Number(process.env.SEO_LINT_SAMPLE || 200), 1);

const mustMatch = [
  { id: "title", re: /<title>\s*[^<].*?<\/title>/is },
  { id: "meta-description", re: /<meta\s+name=["']description["'][^>]*content=["'][^"']+["'][^>]*>/i },
  { id: "canonical", re: /<link\s+rel=["']canonical["'][^>]*href=["'][^"']+["'][^>]*>/i },
  { id: "og-title", re: /<meta\s+property=["']og:title["'][^>]*content=["'][^"']+["'][^>]*>/i },
  { id: "og-description", re: /<meta\s+property=["']og:description["'][^>]*content=["'][^"']+["'][^>]*>/i },
  { id: "twitter-card", re: /<meta\s+name=["']twitter:card["'][^>]*content=["'][^"']+["'][^>]*>/i },
  { id: "json-ld", re: /<script\s+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/i },
];

async function listHtmlFiles(dir) {
  const out = [];
  const queue = [dir];
  while (queue.length > 0) {
    const current = queue.pop();
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(full);
      } else if (entry.isFile() && entry.name.toLowerCase() === "index.html") {
        out.push(full);
      }
    }
  }
  return out.sort();
}

async function read(file) {
  return fs.readFile(file, "utf8");
}

function sampleFiles(files) {
  if (files.length <= SAMPLE_LIMIT) return files;
  const sampled = [];
  const step = files.length / SAMPLE_LIMIT;
  for (let i = 0; i < SAMPLE_LIMIT; i += 1) {
    sampled.push(files[Math.floor(i * step)]);
  }
  return sampled;
}

function lintHtml(file, html) {
  const issues = [];
  for (const rule of mustMatch) {
    if (!rule.re.test(html)) {
      issues.push(rule.id);
    }
  }
  return issues.length > 0 ? { file, issues } : null;
}

async function main() {
  const rootIndex = path.join(DIST_DIR, "index.html");
  await fs.access(rootIndex);

  const files = await listHtmlFiles(DIST_DIR);
  const sampled = sampleFiles(files);
  const results = await Promise.all(
    sampled.map(async (file) => lintHtml(file, await read(file))),
  );

  const failures = results.filter(Boolean);
  const summary = {
    scanned: sampled.length,
    totalHtml: files.length,
    failures: failures.length,
    sampleLimit: SAMPLE_LIMIT,
  };

  console.log(JSON.stringify(summary, null, 2));
  if (failures.length > 0) {
    for (const failure of failures.slice(0, 100)) {
      console.error(`SEO lint failed: ${path.relative(process.cwd(), failure.file)} -> ${failure.issues.join(", ")}`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("SEO lint execution failed:", error);
  process.exit(1);
});

