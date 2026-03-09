#!/usr/bin/env node
/**
 * Venue Data Validator
 * bun run venue:validate
 *
 * Checks venue data quality from Supabase:
 * - Coordinates within Thailand bounds
 * - Hours in HH:MM format
 * - Category matches taxonomy
 * - Phone in Thai format
 * - Required fields present
 * - Stale venues (>90 days without update) — warning only
 *
 * Requires: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 */

import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = process.cwd();
const REPORT_PATH = path.join(ROOT, "reports/ci/venue-validation.json");

const TH_BOUNDS = { minLat: 5.5, maxLat: 20.5, minLng: 97.3, maxLng: 105.7 };
const THAI_PHONE_RE = /^(\+66|0)[0-9]{8,9}$/;
const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const VALID_CATEGORIES = new Set([
	"cafe",
	"bar",
	"restaurant",
	"nightlife",
	"shop",
	"hotel",
	"spa",
	"market",
	"cowork",
	"gallery",
	"gym",
	"massage",
	"fashion",
	"event",
	"beach",
	"temple",
	"museum",
	"park",
	"convenience",
	"entertainment",
	"fitness",
	"hostel",
	"rooftop",
]);
const STALE_DAYS = 90;
const PAGE_LIMIT = 100;
const MAX_PAGES = 50; // safety cap: 5000 venues max

const checks = [];
const add = (ok, name, detail = "") => checks.push({ ok, name, detail });

const printChecks = () => {
	for (const row of checks) {
		console.log(
			`${row.ok ? "PASS" : "FAIL"} ${row.name}${row.detail ? ` :: ${row.detail}` : ""}`,
		);
	}
};

const writeReport = async (data) => {
	await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
	await fs.writeFile(
		REPORT_PATH,
		JSON.stringify({ timestamp: new Date().toISOString(), ...data }, null, 2),
	);
	console.log(`\nReport: reports/ci/venue-validation.json`);
};

const main = async () => {
	const supabaseUrl =
		process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
	const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

	if (!supabaseUrl || !supabaseKey) {
		console.warn(
			"WARN: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — skipping live data checks",
		);
		add(
			true,
			"venue.env.configured",
			"Skipped — set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY",
		);
		await writeReport({ checks, venues_checked: 0, skipped: true });
		printChecks();
		return;
	}

	const client = createClient(supabaseUrl, supabaseKey);

	// Cursor-paginated fetch
	const venues = [];
	let cursor = null;
	let page = 0;

	console.log("Fetching venues from Supabase...");
	while (true) {
		let query = client
			.from("shops")
			.select(
				"id, name, latitude, longitude, category, phone, open_time, close_time, updated_at",
			)
			.order("id")
			.limit(PAGE_LIMIT);

		if (cursor) query = query.gt("id", cursor);

		const { data, error } = await query;
		if (error) {
			add(false, "venue.fetch", `Supabase error: ${error.message}`);
			break;
		}
		if (!data || data.length === 0) break;

		venues.push(...data);
		cursor = data[data.length - 1].id;
		if (data.length < PAGE_LIMIT) break;
		if (++page >= MAX_PAGES) {
			console.warn(`WARN: Reached page cap (${MAX_PAGES * PAGE_LIMIT} venues)`);
			break;
		}
	}

	add(venues.length > 0, "venue.fetch", `Fetched ${venues.length} venues`);

	const staleCutoff = new Date(
		Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000,
	);
	const issues = {
		bounds: [],
		hours: [],
		category: [],
		phone: [],
		required: [],
		stale: [],
	};

	for (const v of venues) {
		const id = v.id;
		const requiredMissing = ["name", "latitude", "longitude", "category"].filter(
			(f) => !v[f],
		);
		if (requiredMissing.length) {
			issues.required.push({ id, name: v.name, missing: requiredMissing });
		}

		if (v.latitude != null && v.longitude != null) {
			const lat = parseFloat(v.latitude);
			const lng = parseFloat(v.longitude);
			if (
				lat < TH_BOUNDS.minLat ||
				lat > TH_BOUNDS.maxLat ||
				lng < TH_BOUNDS.minLng ||
				lng > TH_BOUNDS.maxLng
			) {
				issues.bounds.push({ id, name: v.name, lat, lng });
			}
		}

		if (v.open_time && !TIME_RE.test(v.open_time))
			issues.hours.push({ id, name: v.name, field: "open_time", value: v.open_time });
		if (v.close_time && !TIME_RE.test(v.close_time))
			issues.hours.push({ id, name: v.name, field: "close_time", value: v.close_time });

		if (v.category && !VALID_CATEGORIES.has(v.category.toLowerCase())) {
			issues.category.push({ id, name: v.name, category: v.category });
		}

		if (v.phone) {
			const normalized = v.phone.replace(/[\s\-().]/g, "");
			if (!THAI_PHONE_RE.test(normalized)) {
				issues.phone.push({ id, name: v.name, phone: v.phone });
			}
		}

		if (v.updated_at && new Date(v.updated_at) < staleCutoff) {
			issues.stale.push({ id, name: v.name, updated_at: v.updated_at });
		}
	}

	add(
		issues.required.length === 0,
		"venue.required-fields",
		`${issues.required.length} venues missing required fields`,
	);
	add(
		issues.bounds.length === 0,
		"venue.th-bounds",
		`${issues.bounds.length} venues outside Thailand bounds`,
	);
	add(
		issues.hours.length === 0,
		"venue.hours-format",
		`${issues.hours.length} venues with invalid HH:MM time`,
	);
	add(
		issues.category.length === 0,
		"venue.category-taxonomy",
		`${issues.category.length} venues with unknown category`,
	);
	add(
		issues.phone.length === 0,
		"venue.phone-format",
		`${issues.phone.length} venues with non-Thai phone format`,
	);

	if (issues.stale.length > 0) {
		console.warn(
			`\nWARN: ${issues.stale.length} venues not updated in ${STALE_DAYS}+ days`,
		);
	}

	console.log(
		`\nVenues checked: ${venues.length} | Issues: required=${issues.required.length} bounds=${issues.bounds.length} hours=${issues.hours.length} category=${issues.category.length} phone=${issues.phone.length} stale(warn)=${issues.stale.length}\n`,
	);

	await writeReport({ checks, venues_checked: venues.length, issues });
	printChecks();

	const failed = checks.filter((r) => !r.ok);
	if (failed.length) process.exit(1);
};

main().catch((err) => {
	console.error("[validate-venue-data] Failed:", err?.message || err);
	process.exit(1);
});
