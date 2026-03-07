import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const errors = [];

const assert = (condition, message) => {
  if (!condition) {
    errors.push(message);
  }
};

const readText = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

const scanFileForForbiddenPatterns = (relativePath, patterns) => {
  const content = readText(relativePath);
  for (const { regex, message } of patterns) {
    if (regex.test(content)) {
      errors.push(`${relativePath}: ${message}`);
    }
  }
};

assert(
  fs.existsSync(path.join(root, "package-lock.json")),
  "package-lock.json must be committed as the canonical lockfile.",
);

assert(
  !fs.existsSync(path.join(root, "bun.lock")) &&
    !fs.existsSync(path.join(root, "bun.lockb")),
  "bun.lock/bun.lockb must not exist. This repo is npm-only for CI/Vercel parity.",
);

const packageJson = JSON.parse(readText("package.json"));
assert(
  packageJson.packageManager === "npm@10.8.2",
  'package.json must declare "packageManager": "npm@10.8.2".',
);

const vercelConfig = JSON.parse(readText("vercel.json"));
assert(
  vercelConfig.installCommand === "npm ci",
  'vercel.json installCommand must stay "npm ci".',
);

const workflowDir = path.join(root, ".github", "workflows");
const workflowFiles = fs
  .readdirSync(workflowDir)
  .filter((file) => file.endsWith(".yml") || file.endsWith(".yaml"))
  .map((file) => path.posix.join(".github/workflows", file));

const forbiddenWorkflowPatterns = [
  {
    regex: /oven-sh\/setup-bun/i,
    message: "must not use setup-bun; use actions/setup-node with npm cache.",
  },
  {
    regex: /\bbun install\b/i,
    message: "must not run bun install; use npm ci.",
  },
  {
    regex: /\bbun run\b/i,
    message: "must not run bun commands; use npm scripts via npm run.",
  },
  {
    regex: /\bbunx\b/i,
    message: "must not run bunx; use npx.",
  },
  {
    regex: /hashFiles\(['"]bun\.lock['"]\)/i,
    message: "must not cache against bun.lock; use package-lock.json.",
  },
];

for (const workflowFile of workflowFiles) {
  scanFileForForbiddenPatterns(workflowFile, forbiddenWorkflowPatterns);
}

if (errors.length > 0) {
  console.error("Package manager policy check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("Package manager policy check passed.");
