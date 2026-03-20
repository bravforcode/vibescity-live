#!/usr/bin/env node
/**
 * Setup pre-commit hook for i18n hardcoded string detection
 *
 * Usage:
 *   node scripts/setup-i18n-hook.mjs [--uninstall]
 *
 * This installs a git pre-commit hook that automatically runs
 * the i18n hardcoded string detector before committing changes.
 */

import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const HOOK_DIR = path.join(ROOT, ".git", "hooks");
const PRE_COMMIT_HOOK = path.join(HOOK_DIR, "pre-commit");
const UNINSTALL = process.argv.includes("--uninstall");

const HOOK_CONTENT = `#!/bin/bash
# VibeCity i18n hardcoded string detector (pre-commit)
# Prevents committing hardcoded user-facing strings

RED='\\033[0;31m'
YELLOW='\\033[1;33m'
GREEN='\\033[0;32m'
NC='\\033[0m'

echo "\${YELLOW}[i18n-check] Scanning staged files for hardcoded strings...\${NC}"

# Run the i18n check
node scripts/ci/check-source-i18n-hardcoded.mjs

EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
  echo ""
  echo "\${RED}❌ Pre-commit check failed: hardcoded strings detected\${NC}"
  echo "   Please wrap user-facing text with: t('namespace.key')"
  echo ""
  echo "   To see detailed violations:"
  echo "   I18N_JSON_OUTPUT=violations.json I18N_VERBOSE=true node scripts/ci/check-source-i18n-hardcoded.mjs"
  echo ""
  exit 1
fi

echo "\${GREEN}✅ No hardcoded strings found\${NC}"
exit 0
`;

const main = async () => {
	try {
		const gitDir = path.join(ROOT, ".git");
		const gitExists = await fs
			.stat(gitDir)
			.then(() => true)
			.catch(() => false);

		if (!gitExists) {
			console.error("❌ Not a git repository. Run this from the root directory.");
			process.exit(1);
		}

		await fs.mkdir(HOOK_DIR, { recursive: true });

		if (UNINSTALL) {
			try {
				await fs.unlink(PRE_COMMIT_HOOK);
				console.log("✅ Pre-commit hook removed");
			} catch (err) {
				if (err.code !== "ENOENT") {
					throw err;
				}
				console.log("ℹ️  Pre-commit hook not installed");
			}
		} else {
			await fs.writeFile(PRE_COMMIT_HOOK, HOOK_CONTENT);

			if (process.platform !== "win32") {
				await fs.chmod(PRE_COMMIT_HOOK, 0o755);
			}

			console.log("✅ Pre-commit hook installed");
			console.log(`   Location: ${PRE_COMMIT_HOOK}`);
			console.log("");
			console.log("📌 Hook will run on every commit and fail if hardcoded strings are detected.");
			console.log("");
			console.log("To bypass (not recommended):");
			console.log("   git commit --no-verify");
			console.log("");
			console.log("To remove:");
			console.log("   node scripts/setup-i18n-hook.mjs --uninstall");
		}
	} catch (err) {
		console.error("❌ Setup failed:", err.message);
		process.exit(1);
	}
};

main();
