#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const DIST_INDEX = path.resolve(process.cwd(), "dist/index.html");

const run = async () => {
  try {
    await fs.access(DIST_INDEX);
  } catch {
    console.error(
      "Missing dist/index.html. Run `bun run build` once before refreshing SEO stale snapshot.",
    );
    process.exit(1);
  }

  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/prerender-venues.mjs"], {
      stdio: "inherit",
      env: {
        ...process.env,
        PRERENDER_REQUIRED: "true",
        PRERENDER_ALLOW_SERVICE_ROLE:
          process.env.PRERENDER_ALLOW_SERVICE_ROLE || "true",
      },
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`refresh-seo-stale failed with exit code ${code}`));
    });
  });
};

run().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
