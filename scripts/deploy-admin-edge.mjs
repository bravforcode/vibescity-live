#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import dotenv from "dotenv";

const REQUIRED_SECRETS = [
	"SUPABASE_SERVICE_ROLE_KEY",
	"GOOGLE_SHEET_ID",
	"GOOGLE_SERVICE_ACCOUNT",
	"SHEET_SYNC_SECRET",
	"ADMIN_EMAIL_ALLOWLIST",
	"PII_AUDIT_ADMIN_PIN",
];

const ADMIN_FUNCTIONS = [
	"admin-local-ads",
	"admin-sheet-sync",
	"admin-slip-dashboard",
	"admin-slip-export",
	"admin-analytics-dashboard",
	"admin-analytics-export",
	"admin-pii-audit-dashboard",
	"admin-pii-audit-export",
	"admin-pii-audit-access-export",
];

const cwd = process.cwd();

const parseArgs = (argv) => {
	const options = {
		projectRef: "",
		envFile: path.join(cwd, ".env"),
		checkOnly: false,
		skipDeploy: false,
		skipSecretsSet: false,
	};

	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg === "--project-ref" || arg === "-p") {
			options.projectRef = String(argv[i + 1] || "").trim();
			i += 1;
		} else if (arg === "--env-file" || arg === "-e") {
			options.envFile = path.resolve(cwd, String(argv[i + 1] || ".env"));
			i += 1;
		} else if (arg === "--check-secrets") {
			options.checkOnly = true;
		} else if (arg === "--skip-deploy") {
			options.skipDeploy = true;
		} else if (arg === "--skip-secrets-set") {
			options.skipSecretsSet = true;
		}
	}

	return options;
};

const readTextIfExists = (filePath) => {
	try {
		if (!fs.existsSync(filePath)) return "";
		return fs.readFileSync(filePath, "utf8");
	} catch {
		return "";
	}
};

const resolveProjectRef = (explicitRef) => {
	if (explicitRef) return explicitRef;
	if (process.env.SUPABASE_PROJECT_REF) {
		return String(process.env.SUPABASE_PROJECT_REF).trim();
	}

	const projectRefPath = path.join(cwd, "supabase", ".temp", "project-ref");
	const projectRefText = readTextIfExists(projectRefPath).trim();
	if (projectRefText) return projectRefText;

	const tomlPath = path.join(cwd, "supabase", "config.toml");
	const tomlText = readTextIfExists(tomlPath);
	const match = tomlText.match(/^\s*project_id\s*=\s*"([^"]+)"/m);
	return match?.[1]?.trim() || "";
};

const resolveSupabaseCli = () => {
	try {
		execSync("supabase --version", { stdio: "pipe", encoding: "utf8" });
		return { baseCommand: "supabase" };
	} catch {
		return { baseCommand: "npx supabase" };
	}
};

const quoteArg = (value) => {
	const text = String(value ?? "");
	if (!text) return '""';
	if (!/[^\w\-./:=]/.test(text)) return text;
	if (process.platform === "win32") {
		return `"${text.replace(/"/g, '\\"')}"`;
	}
	return `'${text.replace(/'/g, `'\\''`)}'`;
};

const runCli = (cli, args, options = {}) => {
	const { capture = false } = options;
	const command = `${cli.baseCommand} ${args.map((arg) => quoteArg(arg)).join(" ")}`;
	try {
		const stdout = execSync(command, {
			encoding: "utf8",
			stdio: capture ? "pipe" : "inherit",
		});
		return { stdout: capture ? String(stdout || "") : "", stderr: "" };
	} catch (error) {
		const stdout = String(error?.stdout || "").trim();
		const stderr = String(error?.stderr || "").trim();
		const output = stderr || stdout;
		throw new Error(output || `Command failed: ${command}`);
	}
};

const listRemoteSecretNames = (cli, projectRef) => {
	const res = runCli(
		cli,
		["secrets", "list", "--project-ref", projectRef],
		{ capture: true },
	);
	const names = new Set();
	for (const line of res.stdout.split(/\r?\n/)) {
		const match = line.match(/^\s*([A-Z0-9_]+)\s+\|/);
		if (match?.[1]) names.add(match[1]);
	}
	return names;
};

const loadEnvSources = (envFile) => {
	const parsed = fs.existsSync(envFile)
		? dotenv.parse(fs.readFileSync(envFile, "utf8"))
		: {};
	return { ...parsed, ...process.env };
};

const resolveSecretValue = (secretsSource, key) => {
	let value = secretsSource[key];
	if ((!value || !String(value).trim()) && key === "ADMIN_EMAIL_ALLOWLIST") {
		value = "omchai.g44@gmail.com,nxme176@gmail.com";
	}
	if (!value || !String(value).trim()) return "";

	const text = String(value).trim();
	if (
		key === "GOOGLE_SERVICE_ACCOUNT" &&
		fs.existsSync(text) &&
		fs.statSync(text).isFile()
	) {
		return fs.readFileSync(text, "utf8").trim();
	}
	return text;
};

const setMissingSecrets = (cli, projectRef, missingSecrets, envFile) => {
	if (!missingSecrets.length) return [];
	const source = loadEnvSources(envFile);
	const lines = [];

	for (const key of missingSecrets) {
		const value = resolveSecretValue(source, key);
		if (!value) {
			throw new Error(
				`Missing local value for secret "${key}" (checked process.env and ${envFile})`,
			);
		}
		const normalizedValue = String(value).replace(/\r?\n/g, "\\n");
		lines.push(`${key}=${normalizedValue}`);
	}

	const tmpFile = path.join(
		os.tmpdir(),
		`vibecity-admin-secrets-${Date.now()}.env`,
	);
	try {
		fs.writeFileSync(tmpFile, `${lines.join("\n")}\n`, "utf8");
		runCli(cli, [
			"secrets",
			"set",
			"--project-ref",
			projectRef,
			"--env-file",
			tmpFile,
		]);
	} finally {
		if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
	}
	return missingSecrets;
};

const deployFunctions = (cli, projectRef, functionsList) => {
	for (const fnName of functionsList) {
		runCli(cli, [
			"functions",
			"deploy",
			fnName,
			"--project-ref",
			projectRef,
			"--no-verify-jwt",
		]);
	}
};

const main = () => {
	const options = parseArgs(process.argv.slice(2));
	const projectRef = resolveProjectRef(options.projectRef);
	if (!projectRef) {
		throw new Error(
			"Cannot resolve project ref. Pass --project-ref <ref> or ensure supabase/.temp/project-ref exists.",
		);
	}

	const cli = resolveSupabaseCli();

	console.log(`[admin-edge] project-ref: ${projectRef}`);
	const existingSecrets = listRemoteSecretNames(cli, projectRef);
	const missing = REQUIRED_SECRETS.filter((name) => !existingSecrets.has(name));
	console.log(
		`[admin-edge] required secrets: ${REQUIRED_SECRETS.length}, missing: ${missing.length}`,
	);
	if (missing.length) {
		console.log(`[admin-edge] missing -> ${missing.join(", ")}`);
	}

	if (options.checkOnly) {
		if (missing.length) process.exitCode = 2;
		return;
	}

	if (missing.length && !options.skipSecretsSet) {
		const updated = setMissingSecrets(
			cli,
			projectRef,
			missing,
			path.resolve(options.envFile),
		);
		console.log(`[admin-edge] secrets set -> ${updated.join(", ")}`);
	}

	if (!options.skipDeploy) {
		deployFunctions(cli, projectRef, ADMIN_FUNCTIONS);
		console.log(`[admin-edge] deployed ${ADMIN_FUNCTIONS.length} functions`);
	}

	const finalSecrets = listRemoteSecretNames(cli, projectRef);
	const finalMissing = REQUIRED_SECRETS.filter(
		(name) => !finalSecrets.has(name),
	);
	if (finalMissing.length) {
		console.log(`[admin-edge] still missing -> ${finalMissing.join(", ")}`);
		process.exitCode = 3;
		return;
	}

	console.log("[admin-edge] done");
};

try {
	main();
} catch (error) {
	console.error(`[admin-edge] failed: ${error?.message || String(error)}`);
	process.exit(1);
}
