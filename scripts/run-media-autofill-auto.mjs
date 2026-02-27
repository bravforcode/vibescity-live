#!/usr/bin/env node

import { spawn } from "node:child_process";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const arg = (name, fallback = "") => {
	const hit = process.argv.find((x) => x.startsWith(`${name}=`));
	return hit ? hit.slice(name.length + 1) : fallback;
};
const toNum = (value, fallback) => {
	const n = Number(value);
	return Number.isFinite(n) ? n : fallback;
};

const cfg = {
	batchLimit: Math.max(toNum(arg("--batch-limit", "1000"), 1000), 1),
	batchConcurrency: Math.max(toNum(arg("--batch-concurrency", "20"), 20), 1),
	maxRounds: Math.max(toNum(arg("--max-rounds", "0"), 0), 0),
	sleepMs: Math.max(toNum(arg("--sleep-ms", "2000"), 2000), 0),
	targetMissing: Math.max(toNum(arg("--target-missing", "0"), 0), 0),
	useWiki: process.argv.includes("--use-wiki"),
	dryRun: process.argv.includes("--dry-run"),
};

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey =
	process.env.SUPABASE_SERVICE_ROLE_KEY ||
	process.env.SUPABASE_ANON_KEY ||
	process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
	console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
	process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
	auth: { persistSession: false, autoRefreshToken: false },
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getMissingCount = async () => {
	const res = await supabase
		.from("venues")
		.select("id", { count: "planned", head: true })
		.or('and(image_urls.eq.{},\"Image_URL1\".is.null),\"Video_URL\".is.null');
	if (res.error) throw new Error(res.error.message);
	return Number(res.count || 0);
};

const runBatch = async () => {
	const args = [
		"scripts/auto-upload-venue-media.mjs",
		"--autofill",
		"--json-line",
		`--limit=${cfg.batchLimit}`,
		`--concurrency=${cfg.batchConcurrency}`,
	];
	if (cfg.useWiki) args.push("--use-wiki");
	if (cfg.dryRun) args.push("--dry-run");

	let summary = null;
	let outBuf = "";
	let errBuf = "";
	const flushJsonLines = (buf, isErr = false) => {
		const lines = buf.split(/\r?\n/);
		const remain = lines.pop() || "";
		for (const line of lines) {
			const text = line.trim();
			if (!text) continue;
			if (!isErr) process.stdout.write(`${line}\n`);
			else process.stderr.write(`${line}\n`);
			if (text.startsWith("{") && text.includes("venues_updated")) {
				try {
					summary = JSON.parse(text);
				} catch {}
			}
		}
		return remain;
	};

	await new Promise((resolve, reject) => {
		const child = spawn(process.execPath, args, {
			stdio: ["ignore", "pipe", "pipe"],
			shell: false,
		});
		child.stdout.on("data", (chunk) => {
			outBuf += String(chunk);
			outBuf = flushJsonLines(outBuf, false);
		});
		child.stderr.on("data", (chunk) => {
			errBuf += String(chunk);
			errBuf = flushJsonLines(errBuf, true);
		});
		child.on("error", reject);
		child.on("exit", (code) => {
			if (outBuf.trim()) {
				try {
					process.stdout.write(`${outBuf}\n`);
					if (outBuf.trim().startsWith("{") && outBuf.includes("venues_updated")) {
						summary = JSON.parse(outBuf.trim());
					}
				} catch {}
			}
			if (code === 0) resolve();
			else reject(new Error(`batch exit code ${code}`));
		});
	});
	return summary;
};

const main = async () => {
	console.log(
		JSON.stringify({
			mode: "media-autofill-auto",
			...cfg,
		}),
	);

	let round = 0;
	while (true) {
		round += 1;
		let before = null;
		try {
			before = await getMissingCount();
		} catch {}
		console.log(`round=${round} missing_before=${before ?? "unknown"}`);

		if (before !== null && before <= cfg.targetMissing) {
			console.log(`done: missing ${before} <= target ${cfg.targetMissing}`);
			break;
		}
		if (cfg.maxRounds > 0 && round > cfg.maxRounds) {
			console.log(`stop: reached maxRounds=${cfg.maxRounds}`);
			break;
		}

		let batchSummary = null;
		try {
			batchSummary = await runBatch();
		} catch (err) {
			console.error(`round=${round} failed: ${err.message}`);
		}

		let after = null;
		try {
			after = await getMissingCount();
		} catch {}
		const updated = Number(batchSummary?.venues_updated || 0);
		console.log(
			`round=${round} missing_after=${after ?? "unknown"} updated=${updated}`,
		);
		if (after !== null && after <= cfg.targetMissing) {
			console.log(`done: missing ${after} <= target ${cfg.targetMissing}`);
			break;
		}
		if (updated <= 0) {
			console.log("stop: no updates in this round");
			break;
		}
		if (cfg.maxRounds > 0 && round >= cfg.maxRounds) {
			console.log(`stop: reached maxRounds=${cfg.maxRounds}`);
			break;
		}
		if (cfg.sleepMs > 0) await sleep(cfg.sleepMs);
	}
};

main().catch((err) => {
	console.error(err?.stack || err?.message || err);
	process.exit(1);
});
