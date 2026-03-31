#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const SOURCE_PATH = path.join(
	REPO_ROOT,
	"scripts/prerender-data/venues-public-stale.json",
);
const OUTPUT_PATH = path.join(
	REPO_ROOT,
	"public/data/venues-localhost-snapshot.json",
);
const THAILAND_BOUNDS = Object.freeze({
	minLat: 5.5,
	maxLat: 20.9,
	minLng: 97.2,
	maxLng: 105.8,
});
const LOCALHOST_DEV_REFERENCE_POINT = Object.freeze({
	lat: 15.87,
	lng: 100.9925,
});
const NON_THAI_PROVINCE_ALIASES = new Set([
	"can tho",
	"cần thơ",
	"hanoi",
	"kien giang",
	"long an",
	"nghệ an",
	"ninh bình",
	"sóc trăng",
	"tây ninh",
	"thanh hoá",
	"tỉnh trà vinh",
	"vt",
]);
const NON_THAI_NAME_PATTERNS = [
	/[À-ỹ]/u,
	/[ກ-໿]/u,
	/\b(?:intira|khoum|koung|noudsavanh|manamone)\b/i,
];
const SNAPSHOT_LIMIT = 100;
const GRID_STEP_DEGREES = 1;

const normalizeText = (value) => {
	if (value === null || value === undefined) return "";
	return String(value).trim();
};

const normalizeMaybeText = (value) => {
	const normalized = normalizeText(value);
	return normalized || null;
};

const normalizeProvinceKey = (value) =>
	normalizeText(value).toLocaleLowerCase();

const shouldExcludeByName = (value) => {
	const normalized = normalizeText(value);
	if (!normalized) return false;
	return NON_THAI_NAME_PATTERNS.some((pattern) => pattern.test(normalized));
};

const toFiniteNumber = (value, fallback = 0) => {
	const numeric = Number(value);
	return Number.isFinite(numeric) ? numeric : fallback;
};

const calculateDistanceKm = (lat1, lng1, lat2, lng2) => {
	const earthRadiusKm = 6371;
	const deltaLat = ((lat2 - lat1) * Math.PI) / 180;
	const deltaLng = ((lng2 - lng1) * Math.PI) / 180;
	const a =
		Math.sin(deltaLat / 2) ** 2 +
		Math.cos((lat1 * Math.PI) / 180) *
			Math.cos((lat2 * Math.PI) / 180) *
			Math.sin(deltaLng / 2) ** 2;
	return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const parseWkbPointHex = (value) => {
	const hex = normalizeText(value).replace(/^\\x/i, "");
	if (!hex || !/^[0-9a-f]+$/i.test(hex) || hex.length < 42 || hex.length % 2) {
		return null;
	}

	const bytes = new Uint8Array(hex.length / 2);
	for (let index = 0; index < hex.length; index += 2) {
		bytes[index / 2] = parseInt(hex.slice(index, index + 2), 16);
	}

	const view = new DataView(bytes.buffer);
	const littleEndian = view.getUint8(0) === 1;
	let offset = 1;
	let geomType = view.getUint32(offset, littleEndian);
	offset += 4;

	const hasSrid = (geomType & 0x20000000) !== 0;
	geomType &= 0x0fffffff;
	if (hasSrid) offset += 4;
	if (geomType !== 1 || offset + 16 > view.byteLength) return null;

	const lng = view.getFloat64(offset, littleEndian);
	const lat = view.getFloat64(offset + 8, littleEndian);
	if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

	return {
		lat: Number(lat.toFixed(6)),
		lng: Number(lng.toFixed(6)),
	};
};

const toSnapshotRow = (row) => {
	const coords = parseWkbPointHex(row?.location);
	if (!coords) return null;

	return {
		id: normalizeText(row.id),
		slug: normalizeMaybeText(row.slug),
		short_code: normalizeMaybeText(row.short_code),
		name: normalizeText(row.name) || "Unknown venue",
		description: normalizeText(row.description),
		category: normalizeText(row.category) || "General",
		province: normalizeMaybeText(row.province),
		district: normalizeMaybeText(row.district),
		address: normalizeMaybeText(row.address),
		phone: normalizeMaybeText(row.phone),
		image_urls: Array.isArray(row.image_urls)
			? row.image_urls
					.map((item) => normalizeText(item))
					.filter(Boolean)
					.slice(0, 2)
			: [],
		rating: toFiniteNumber(row.rating, 0),
		review_count: toFiniteNumber(row.review_count, 0),
		lat: coords.lat,
		lng: coords.lng,
		created_at: normalizeMaybeText(row.created_at),
		status: "active",
	};
};

const getApproxThailandMaxLng = (lat) => {
	if (lat >= 19.5) return 104.7;
	if (lat >= 15) return 105.3;
	if (lat >= 12) return 103.8;
	if (lat >= 9) return 101.9;
	return 100.8;
};

const isWithinThailandBounds = (row) => {
	if (
		row.lat < THAILAND_BOUNDS.minLat ||
		row.lat > THAILAND_BOUNDS.maxLat ||
		row.lng < THAILAND_BOUNDS.minLng
	) {
		return false;
	}

	const provinceKey = normalizeProvinceKey(row.province);
	if (provinceKey && NON_THAI_PROVINCE_ALIASES.has(provinceKey)) {
		return false;
	}
	if (shouldExcludeByName(row.name)) {
		return false;
	}

	return row.lng <= getApproxThailandMaxLng(row.lat);
};

const buildGridBucketKey = (row) => {
	const latIndex = Math.floor(
		(row.lat - THAILAND_BOUNDS.minLat) / GRID_STEP_DEGREES,
	);
	const lngIndex = Math.floor(
		(row.lng - THAILAND_BOUNDS.minLng) / GRID_STEP_DEGREES,
	);
	return `${latIndex}:${lngIndex}`;
};

const compareRowsStable = (left, right) => {
	if (right.lat !== left.lat) return right.lat - left.lat;
	if (left.lng !== right.lng) return left.lng - right.lng;
	return `${left.name}:${left.id}`.localeCompare(`${right.name}:${right.id}`);
};

const compareBucketKeys = (leftKey, rightKey) => {
	const [leftLatIndex, leftLngIndex] = leftKey.split(":").map(Number);
	const [rightLatIndex, rightLngIndex] = rightKey.split(":").map(Number);
	if (leftLatIndex !== rightLatIndex) return rightLatIndex - leftLatIndex;
	return leftLngIndex - rightLngIndex;
};

const selectNationwideRows = (rows) => {
	const nationwidePool = rows.filter(isWithinThailandBounds);
	const pool =
		nationwidePool.length >= SNAPSHOT_LIMIT ? nationwidePool : [...rows];
	const bucketMap = new Map();

	for (const row of pool) {
		const bucketKey = buildGridBucketKey(row);
		const bucket = bucketMap.get(bucketKey) || [];
		bucket.push(row);
		bucketMap.set(bucketKey, bucket);
	}

	const buckets = [...bucketMap.entries()]
		.sort(([leftKey], [rightKey]) => compareBucketKeys(leftKey, rightKey))
		.map(([bucketKey, bucketRows]) => ({
			bucketKey,
			rows: bucketRows.sort(compareRowsStable),
		}));

	const selectedRows = [];
	for (
		let roundIndex = 0;
		selectedRows.length < SNAPSHOT_LIMIT;
		roundIndex += 1
	) {
		let addedThisRound = false;
		for (const bucket of buckets) {
			const row = bucket.rows[roundIndex];
			if (!row) continue;
			selectedRows.push(row);
			addedThisRound = true;
			if (selectedRows.length >= SNAPSHOT_LIMIT) break;
		}
		if (!addedThisRound) break;
	}

	return {
		poolSize: pool.length,
		nationwidePoolSize: nationwidePool.length,
		bucketCount: buckets.length,
		rows: selectedRows
			.slice(0, SNAPSHOT_LIMIT)
			.sort(
				(left, right) =>
					calculateDistanceKm(
						LOCALHOST_DEV_REFERENCE_POINT.lat,
						LOCALHOST_DEV_REFERENCE_POINT.lng,
						left.lat,
						left.lng,
					) -
					calculateDistanceKm(
						LOCALHOST_DEV_REFERENCE_POINT.lat,
						LOCALHOST_DEV_REFERENCE_POINT.lng,
						right.lat,
						right.lng,
					),
			),
	};
};

const main = async () => {
	const raw = await fs.readFile(SOURCE_PATH, "utf8");
	const payload = JSON.parse(raw);
	const sourceRows = Array.isArray(payload?.rows) ? payload.rows : [];

	const normalizedRows = sourceRows.map(toSnapshotRow).filter(Boolean);
	const selection = selectNationwideRows(normalizedRows);
	const selectedRows = selection.rows;

	const output = {
		generated_at: new Date().toISOString(),
		source_path: "scripts/prerender-data/venues-public-stale.json",
		selection_strategy: "thailand_grid_round_robin",
		thailand_bounds: THAILAND_BOUNDS,
		localhost_dev_reference_point: LOCALHOST_DEV_REFERENCE_POINT,
		grid_step_degrees: GRID_STEP_DEGREES,
		source_row_count: normalizedRows.length,
		nationwide_pool_count: selection.nationwidePoolSize,
		selected_bucket_count: selection.bucketCount,
		limit: SNAPSHOT_LIMIT,
		rows: selectedRows,
	};

	await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
	await fs.writeFile(
		OUTPUT_PATH,
		`${JSON.stringify(output, null, "\t")}\n`,
		"utf8",
	);

	process.stdout.write(
		`Generated localhost venue snapshot: ${selectedRows.length} rows -> ${OUTPUT_PATH}\n`,
	);
};

main().catch((error) => {
	console.error(
		"Failed to generate localhost venue snapshot:",
		error?.message || error,
	);
	process.exitCode = 1;
});
