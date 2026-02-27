#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const DIST_DIR = path.resolve(process.cwd(), "dist");
const SEO_EXPECT_DYNAMIC =
  process.env.SEO_EXPECT_DYNAMIC !== undefined
    ? ["1", "true", "yes", "on"].includes(
        String(process.env.SEO_EXPECT_DYNAMIC).toLowerCase(),
      )
    : Boolean(process.env.CI);

const exists = async (filePath) => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

const read = (filePath) => fs.readFile(filePath, "utf8");

const assertMatch = (html, re, code, issues) => {
  if (!re.test(html)) issues.push(code);
};

const findFirstIndexHtml = async (startDir) => {
  if (!(await exists(startDir))) return null;

  const queue = [startDir];
  while (queue.length) {
    const current = queue.shift();
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(full);
      } else if (entry.isFile() && entry.name.toLowerCase() === "index.html") {
        return full;
      }
    }
  }
  return null;
};

const validatePage = async (relativePath, checks) => {
  const filePath = path.join(DIST_DIR, relativePath);
  const issues = [];

  if (!(await exists(filePath))) {
    return { path: relativePath, issues: ["missing-file"] };
  }

  const html = await read(filePath);
  for (const check of checks) {
    assertMatch(html, check.re, check.code, issues);
  }

  return { path: relativePath, issues };
};

const baseChecks = [
  { code: "title", re: /<title>\s*[^<].*?<\/title>/is },
  {
    code: "meta-description",
    re: /<meta\s+name=["']description["'][^>]*content=["'][^"']+["'][^>]*>/i,
  },
  {
    code: "canonical",
    re: /<link\s+rel=["']canonical["'][^>]*href=["']https:\/\/vibecity\.live\/[^"']*["'][^>]*>/i,
  },
  {
    code: "hreflang-th",
    re: /<link\s+rel=["']alternate["'][^>]*hreflang=["']th["'][^>]*>/i,
  },
  {
    code: "hreflang-en",
    re: /<link\s+rel=["']alternate["'][^>]*hreflang=["']en["'][^>]*>/i,
  },
  {
    code: "hreflang-x-default",
    re: /<link\s+rel=["']alternate["'][^>]*hreflang=["']x-default["'][^>]*>/i,
  },
  {
    code: "og-locale",
    re: /<meta\s+property=["']og:locale["'][^>]*content=["'][^"']+["'][^>]*>/i,
  },
  {
    code: "og-locale-alternate",
    re: /<meta\s+property=["']og:locale:alternate["'][^>]*content=["'][^"']+["'][^>]*>/i,
  },
  {
    code: "twitter-card",
    re: /<meta\s+name=["']twitter:card["'][^>]*content=["'][^"']+["'][^>]*>/i,
  },
  {
    code: "json-ld",
    re: /<script\s+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/i,
  },
];

async function main() {
  const targets = [
    {
      path: "th/index.html",
      checks: [
        ...baseChecks,
        { code: "html-lang-th", re: /<html[^>]*\slang=["']th["'][^>]*>/i },
        { code: "og-locale-th", re: /og:locale["'][^>]*content=["']th_TH["']/i },
      ],
    },
    {
      path: "en/index.html",
      checks: [
        ...baseChecks,
        { code: "html-lang-en", re: /<html[^>]*\slang=["']en["'][^>]*>/i },
        { code: "og-locale-en", re: /og:locale["'][^>]*content=["']en_US["']/i },
      ],
    },
    {
      path: "th/privacy/index.html",
      checks: [...baseChecks, { code: "html-lang-th", re: /<html[^>]*\slang=["']th["'][^>]*>/i }],
    },
    {
      path: "en/terms/index.html",
      checks: [...baseChecks, { code: "html-lang-en", re: /<html[^>]*\slang=["']en["'][^>]*>/i }],
    },
  ];

  const legacyVenue = await findFirstIndexHtml(path.join(DIST_DIR, "th", "venue"));
  if (legacyVenue) {
    targets.push({
      path: path.relative(DIST_DIR, legacyVenue).replace(/\\/g, "/"),
      checks: [
        ...baseChecks,
        {
          code: "venue-legacy-noindex",
          re: /<meta\s+name=["']robots["'][^>]*content=["'][^"']*noindex[^"']*["'][^>]*>/i,
        },
        {
          code: "venue-legacy-canonical-slug",
          re: /<link\s+rel=["']canonical["'][^>]*href=["']https:\/\/vibecity\.live\/th\/v\/[^"']+["'][^>]*>/i,
        },
      ],
    });
  }

  const venueSlug = await findFirstIndexHtml(path.join(DIST_DIR, "th", "v"));
  const categoryPage = await findFirstIndexHtml(path.join(DIST_DIR, "th", "c"));
  if (venueSlug) {
    targets.push({
      path: path.relative(DIST_DIR, venueSlug).replace(/\\/g, "/"),
      checks: [...baseChecks],
    });
  }
  if (categoryPage) {
    targets.push({
      path: path.relative(DIST_DIR, categoryPage).replace(/\\/g, "/"),
      checks: [...baseChecks],
    });
  }

  const dynamicIssues = [];
  if (SEO_EXPECT_DYNAMIC && !venueSlug) {
    dynamicIssues.push({
      path: "th/v",
      issues: ["missing-dynamic-venue-page"],
    });
  }
  if (SEO_EXPECT_DYNAMIC && !categoryPage) {
    dynamicIssues.push({
      path: "th/c",
      issues: ["missing-dynamic-category-page"],
    });
  }

  const results = await Promise.all(
    targets.map((target) => validatePage(target.path, target.checks)),
  );

  const failures = [...results.filter((result) => result.issues.length > 0), ...dynamicIssues];
  const summary = {
    checked: results.length + dynamicIssues.length,
    failed: failures.length,
    expectDynamic: SEO_EXPECT_DYNAMIC,
    files: [
      ...results.map((result) => ({
        path: result.path,
        issues: result.issues,
      })),
      ...dynamicIssues,
    ],
  };

  console.log(JSON.stringify(summary, null, 2));

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(
        `SEO smoke failed: ${failure.path} -> ${failure.issues.join(", ")}`,
      );
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("SEO smoke execution failed:", error);
  process.exit(1);
});
