#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import * as turf from "@turf/turf";
import { createClient } from "@supabase/supabase-js";

const root = process.cwd();
for (const f of [".env.local", ".env"]) {
	const p = path.join(root, f);
	if (!fs.existsSync(p)) continue;
	for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
		if (!line || line.startsWith("#") || !line.includes("=")) continue;
		const [k, ...rest] = line.split("=");
		if (!process.env[k]) {
			process.env[k] = rest.join("=").trim().replace(/^"|"$/g, "");
		}
	}
}

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
if (!url || !key) throw new Error("Missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY");

const require = createRequire(import.meta.url);
let thaiGeoAssetsRoot;
try {
	const thaiGeoPackagePath = require.resolve("thai-geolocate/package.json");
	thaiGeoAssetsRoot = path.join(path.dirname(thaiGeoPackagePath), "assets");
} catch {
	throw new Error("Missing package 'thai-geolocate'. Run: bun add --no-save thai-geolocate");
}

const args = Object.fromEntries(
	process.argv.slice(2).map((arg) => {
		const i = arg.indexOf("=");
		return i > 0
			? [arg.slice(0, i).replace(/^--/, ""), arg.slice(i + 1)]
			: [arg.replace(/^--/, ""), "1"];
	}),
);

const mode = args.mode || "report"; // report | apply | rollback
const seedSource = args.source || "th-admin-coverage-seed";
const replacementSource = args.replacementSource || args.replacement_source || "th-real-poi-coverage";
const batch = Number(args.batch || 1000);
const chunk = Number(args.chunk || 200);
const provinceConcurrency = Math.max(1, Number(args.provinceConcurrency || args.province_concurrency || 2));
const maxSeeds = Number(args.max || 0);
const tambonAccuracy = Number(args.tambonAccuracy || args.tambon_accuracy || 2);
const overpassTimeoutSec = Math.max(45, Number(args.overpassTimeout || args.overpass_timeout || 90));
const includeNameless = String(args.includeNameless || args.include_nameless || "0") === "1";
const outFile = path.resolve(
	args.out || "scripts/reports/thailand-real-poi-replacement.json",
);
const fallbackRadii = String(args.fallbackRadii || args.fallback_radii || "3000,6000,12000")
	.split(",")
	.map((v) => Number(v.trim()))
	.filter((v) => Number.isFinite(v) && v > 0);

if (!["report", "apply", "rollback"].includes(mode)) {
	throw new Error(`Unsupported mode: ${mode}`);
}

const supabase = createClient(url, key);

const OVERPASS_ENDPOINTS = [
	"https://overpass.kumi.systems/api/interpreter",
	"https://overpass-api.de/api/interpreter",
	"https://overpass.nchc.org.tw/api/interpreter",
];

const datasetCache = new Map();
const bboxCache = new WeakMap();
const pointCache = new WeakMap();
const TAGS_AMENITY_REGEX =
	"restaurant|cafe|fast_food|marketplace|bank|atm|pharmacy|hospital|clinic|fuel|school|university|bus_station|taxi";

function writeReport(report) {
	fs.mkdirSync(path.dirname(outFile), { recursive: true });
	fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
}

function loadFeatures(filePath) {
	const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
	return Array.isArray(parsed?.features) ? parsed.features : [];
}

function loadFeaturesCached(relativePath) {
	const absolutePath = path.join(thaiGeoAssetsRoot, relativePath);
	if (datasetCache.has(absolutePath)) return datasetCache.get(absolutePath);
	if (!fs.existsSync(absolutePath)) {
		datasetCache.set(absolutePath, []);
		return [];
	}
	const features = loadFeatures(absolutePath);
	datasetCache.set(absolutePath, features);
	return features;
}

function getFeatureBbox(feature) {
	let bbox = bboxCache.get(feature);
	if (!bbox) {
		bbox = turf.bbox(feature);
		bboxCache.set(feature, bbox);
	}
	return bbox;
}

function pointWithinBBox(lng, lat, bbox) {
	const [minLng, minLat, maxLng, maxLat] = bbox;
	return lng >= minLng && lng <= maxLng && lat >= minLat && lat <= maxLat;
}

function pointForCandidate(candidate) {
	let point = pointCache.get(candidate);
	if (!point) {
		point = turf.point([candidate.longitude, candidate.latitude]);
		pointCache.set(candidate, point);
	}
	return point;
}

function featureContainsCandidate(feature, candidate) {
	const bbox = getFeatureBbox(feature);
	if (!pointWithinBBox(candidate.longitude, candidate.latitude, bbox)) return false;
	return turf.booleanPointInPolygon(pointForCandidate(candidate), feature);
}

function normalizeCoverageLevel(row) {
	const levelFromMetadata = String(row?.metadata?.coverage_level || "").toLowerCase();
	if (levelFromMetadata === "district" || levelFromMetadata === "subdistrict") {
		return levelFromMetadata;
	}
	return row?.subdistrict_code ? "subdistrict" : "district";
}

function loadAdminFeatures() {
	const provinces = new Map();
	const districts = new Map();
	const subdistricts = new Map();

	for (const feature of loadFeaturesCached("accuracy_level_1/province.json")) {
		const code = feature.properties?.ADM1_PCODE;
		if (code) provinces.set(code, feature);
	}

	const amphoeDir = path.join(thaiGeoAssetsRoot, "accuracy_level_1", "amphoe");
	for (const name of fs.readdirSync(amphoeDir)) {
		if (!name.endsWith(".json")) continue;
		for (const feature of loadFeatures(path.join(amphoeDir, name))) {
			const code = feature.properties?.ADM2_PCODE;
			if (code) districts.set(code, feature);
		}
	}

	const tambonDir = path.join(
		thaiGeoAssetsRoot,
		`accuracy_level_${tambonAccuracy}`,
		"tambon",
	);
	if (fs.existsSync(tambonDir)) {
		for (const name of fs.readdirSync(tambonDir)) {
			if (!name.endsWith(".json")) continue;
			for (const feature of loadFeatures(path.join(tambonDir, name))) {
				const code = feature.properties?.ADM3_PCODE;
				if (code) subdistricts.set(code, feature);
			}
		}
	}

	return { provinces, districts, subdistricts };
}

async function fetchActiveSeeds() {
	const rows = [];
	let lastId = null;
	let scanned = 0;

	while (true) {
		let q = supabase
			.from("venues")
			.select(
				"id,name,latitude,longitude,province,district,subdistrict,province_th,province_en,district_th,district_en,subdistrict_th,subdistrict_en,province_code,district_code,subdistrict_code,metadata,status",
			)
			.order("id", { ascending: true })
			.limit(batch)
			.eq("source", seedSource)
			.is("deleted_at", null)
			.or("is_deleted.eq.false,is_deleted.is.null");
		if (lastId) q = q.gt("id", lastId);

		const { data, error } = await q;
		if (error) throw error;
		const page = data || [];
		if (!page.length) break;

		lastId = page.at(-1).id;
		for (const row of page) {
			rows.push(row);
		}

		scanned += page.length;
		console.log(
			JSON.stringify({ phase: "scan_seed", scanned, last_id: lastId }),
		);
		if (maxSeeds > 0 && rows.length >= maxSeeds) break;
	}

	return maxSeeds > 0 ? rows.slice(0, maxSeeds) : rows;
}

function resolveSeedArea(row, expected) {
	const coverageLevel = normalizeCoverageLevel(row);

	if (coverageLevel === "subdistrict" && row.subdistrict_code) {
		const feature = expected.subdistricts.get(row.subdistrict_code);
		if (feature) {
			return {
				coverageLevel,
				feature,
				coverageCode: row.subdistrict_code,
				provinceCode: row.province_code || feature.properties?.ADM1_PCODE || null,
			};
		}
	}

	if (row.district_code) {
		const feature = expected.districts.get(row.district_code);
		if (feature) {
			return {
				coverageLevel: "district",
				feature,
				coverageCode: row.district_code,
				provinceCode: row.province_code || feature.properties?.ADM1_PCODE || null,
			};
		}
	}

	return null;
}

function buildBBoxQuery([minLng, minLat, maxLng, maxLat]) {
	const bbox = `${minLat},${minLng},${maxLat},${maxLng}`;
	return `
[out:json][timeout:${overpassTimeoutSec}];
(
  node["name"]["shop"](${bbox});
  node["name"]["amenity"~"${TAGS_AMENITY_REGEX}"](${bbox});
  node["name"]["tourism"](${bbox});
  node["name"]["leisure"](${bbox});
  way["name"]["shop"](${bbox});
  way["name"]["amenity"~"${TAGS_AMENITY_REGEX}"](${bbox});
  way["name"]["tourism"](${bbox});
  way["name"]["leisure"](${bbox});
  relation["name"]["shop"](${bbox});
  relation["name"]["amenity"~"${TAGS_AMENITY_REGEX}"](${bbox});
  relation["name"]["tourism"](${bbox});
  relation["name"]["leisure"](${bbox});
);
out center tags qt;
`.trim();
}

function buildAroundQuery(lat, lng, radiusMeters) {
	return `
[out:json][timeout:${overpassTimeoutSec}];
(
  node(around:${radiusMeters},${lat},${lng})["name"]["shop"];
  node(around:${radiusMeters},${lat},${lng})["name"]["amenity"~"${TAGS_AMENITY_REGEX}"];
  node(around:${radiusMeters},${lat},${lng})["name"]["tourism"];
  node(around:${radiusMeters},${lat},${lng})["name"]["leisure"];
  way(around:${radiusMeters},${lat},${lng})["name"]["shop"];
  way(around:${radiusMeters},${lat},${lng})["name"]["amenity"~"${TAGS_AMENITY_REGEX}"];
  way(around:${radiusMeters},${lat},${lng})["name"]["tourism"];
  way(around:${radiusMeters},${lat},${lng})["name"]["leisure"];
  relation(around:${radiusMeters},${lat},${lng})["name"]["shop"];
  relation(around:${radiusMeters},${lat},${lng})["name"]["amenity"~"${TAGS_AMENITY_REGEX}"];
  relation(around:${radiusMeters},${lat},${lng})["name"]["tourism"];
  relation(around:${radiusMeters},${lat},${lng})["name"]["leisure"];
);
out center tags qt;
`.trim();
}

async function fetchOverpassOnce(endpoint, query) {
	const res = await fetch(endpoint, {
		method: "POST",
		headers: {
			"content-type": "application/x-www-form-urlencoded;charset=UTF-8",
		},
		body: new URLSearchParams({ data: query }),
	});
	const ct = (res.headers.get("content-type") || "").toLowerCase();
	if (!res.ok || !ct.includes("application/json")) {
		const text = await res.text().catch(() => "");
		throw new Error(
			`Overpass bad response: ${res.status} ${res.statusText} ${text.slice(0, 220)}`,
		);
	}
	return res.json();
}

async function fetchOverpass(query, label) {
	let lastError = null;
	for (const endpoint of OVERPASS_ENDPOINTS) {
		for (let attempt = 1; attempt <= 3; attempt += 1) {
			try {
				const json = await fetchOverpassOnce(endpoint, query);
				return { json, endpoint, attempts: attempt };
			} catch (error) {
				lastError = error;
				const waitMs = Math.round(700 * Math.pow(1.8, attempt));
				console.warn(
					JSON.stringify({
						phase: "overpass_retry",
						label,
						endpoint,
						attempt,
						wait_ms: waitMs,
						error: error?.message || String(error),
					}),
				);
				await new Promise((resolve) => setTimeout(resolve, waitMs));
			}
		}
	}
	throw lastError || new Error(`Overpass fetch failed for ${label}`);
}

function deriveCategoryFromTags(tags) {
	if (!tags || typeof tags !== "object") return "point_of_interest";
	if (tags.shop) return String(tags.shop);
	if (tags.amenity) return String(tags.amenity);
	if (tags.tourism) return `tourism:${tags.tourism}`;
	if (tags.leisure) return `leisure:${tags.leisure}`;
	if (tags.office) return `office:${tags.office}`;
	return "point_of_interest";
}

function parseOverpassCandidates(json) {
	const out = [];
	for (const element of json?.elements || []) {
		const tags = element?.tags || {};
		const name = String(tags?.name || "").trim();
		if (!includeNameless && !name) continue;

		let lat = null;
		let lng = null;
		if (element.type === "node") {
			lat = Number(element.lat);
			lng = Number(element.lon);
		} else if (element.center) {
			lat = Number(element.center.lat);
			lng = Number(element.center.lon);
		}
		if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

		const key = `${element.type}/${element.id}`;
		out.push({
			key,
			osmType: element.type,
			osmId: String(element.id),
			osmNumericId: Number(element.id),
			name: name || `OSM ${key}`,
			latitude: lat,
			longitude: lng,
			tags,
			category: deriveCategoryFromTags(tags),
		});
	}
	return out;
}

function uniqCandidates(candidates) {
	const seen = new Set();
	const out = [];
	for (const candidate of candidates) {
		if (seen.has(candidate.key)) continue;
		seen.add(candidate.key);
		out.push(candidate);
	}
	return out;
}

async function mapLimit(items, limit, iteratee) {
	const out = new Array(items.length);
	let cursor = 0;
	const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
		while (cursor < items.length) {
			const index = cursor;
			cursor += 1;
			out[index] = await iteratee(items[index], index);
		}
	});
	await Promise.all(workers);
	return out;
}

function pickBestCandidate(seed, candidates, usedKeys) {
	let best = null;
	let bestDistanceKm = Infinity;
	const seedPoint = turf.point([Number(seed.longitude), Number(seed.latitude)]);
	for (const candidate of candidates) {
		if (usedKeys.has(candidate.key)) continue;
		if (!featureContainsCandidate(seed.areaFeature, candidate)) continue;
		const distanceKm = turf.distance(seedPoint, pointForCandidate(candidate), {
			units: "kilometers",
		});
		if (distanceKm < bestDistanceKm) {
			best = candidate;
			bestDistanceKm = distanceKm;
		}
	}
	if (!best) return null;
	return { candidate: best, distanceKm: bestDistanceKm };
}

function buildReplacementRow(seed, match, nowIso) {
	const { candidate } = match;
	const locationWkt = `SRID=4326;POINT(${candidate.longitude} ${candidate.latitude})`;
	const legacyId = Number.isFinite(candidate.osmNumericId)
		? Math.trunc(candidate.osmNumericId)
		: null;
	const seedAdminProvince = seed.province_en || seed.province_th || seed.province || null;
	const seedAdminDistrict = seed.district_en || seed.district_th || seed.district || null;
	const seedAdminSubdistrict =
		seed.subdistrict_en || seed.subdistrict_th || seed.subdistrict || null;
	const sourceHash = `real-poi:${seed.coverageLevel}:${seed.coverageCode}:${candidate.key}`;

	return {
		id: randomUUID(),
		name: candidate.name,
		category: candidate.category,
		location: locationWkt,
		latitude: candidate.latitude,
		longitude: candidate.longitude,
		province: seedAdminProvince,
		district: seedAdminDistrict,
		subdistrict: seed.coverageLevel === "subdistrict" ? seedAdminSubdistrict : null,
		status: "active",
		source: replacementSource,
		source_hash: sourceHash,
		metadata: {
			real_poi_replacement: true,
			replaces_seed_id: seed.id,
			seed_source: seedSource,
			coverage_level: seed.coverageLevel,
			coverage_code: seed.coverageCode,
			replacement_distance_km: Number(match.distanceKm.toFixed(3)),
			overpass: {
				osm_id: candidate.osmId,
				osm_type: candidate.osmType,
				tags: candidate.tags,
			},
			generated_by: "replace-thailand-seed-with-real-poi.mjs",
			generated_at: nowIso,
		},
		province_th: seed.province_th || null,
		province_en: seed.province_en || null,
		district_th: seed.district_th || null,
		district_en: seed.district_en || null,
		subdistrict_th: seed.coverageLevel === "subdistrict" ? seed.subdistrict_th || null : null,
		subdistrict_en: seed.coverageLevel === "subdistrict" ? seed.subdistrict_en || null : null,
		province_code: seed.province_code || null,
		district_code: seed.district_code || null,
		subdistrict_code: seed.coverageLevel === "subdistrict" ? seed.subdistrict_code || null : null,
		admin_source: "real-poi-replacement",
		admin_confidence: 100,
		admin_resolved_at: nowIso,
		osm_type: candidate.osmType,
		osm_id: candidate.osmId,
		legacy_shop_id: Number.isFinite(legacyId) ? legacyId : null,
		is_deleted: false,
		deleted_at: null,
		vibe_info: "Real OSM POI injected to replace synthetic admin coverage anchor",
	};
}

async function fetchProvincePools(seeds, expected) {
	const groups = new Map();
	for (const seed of seeds) {
		if (!seed.provinceCode) continue;
		if (!groups.has(seed.provinceCode)) groups.set(seed.provinceCode, []);
		groups.get(seed.provinceCode).push(seed);
	}

	const provinceCodes = [...groups.keys()];
	const results = await mapLimit(provinceCodes, provinceConcurrency, async (code) => {
		const provinceFeature = expected.provinces.get(code);
		if (!provinceFeature) {
			return { code, endpoint: null, candidates: [], error: `province feature missing: ${code}` };
		}
		const bbox = getFeatureBbox(provinceFeature);
		const query = buildBBoxQuery(bbox);
		const fetched = await fetchOverpass(query, `province:${code}`);
		const raw = parseOverpassCandidates(fetched.json);
		const insideProvince = raw.filter((candidate) =>
			featureContainsCandidate(provinceFeature, candidate),
		);
		const candidates = uniqCandidates(insideProvince);
		console.log(
			JSON.stringify({
				phase: "province_pool",
				province_code: code,
				candidates: candidates.length,
				endpoint: fetched.endpoint,
				attempts: fetched.attempts,
			}),
		);
		return { code, endpoint: fetched.endpoint, candidates, error: null };
	});

	const byProvince = new Map();
	const fetchMeta = [];
	for (const item of results) {
		byProvince.set(item.code, item.candidates || []);
		fetchMeta.push({
			province_code: item.code,
			endpoint: item.endpoint,
			candidate_count: (item.candidates || []).length,
			error: item.error,
		});
	}
	return { byProvince, fetchMeta };
}

async function resolveSeedViaAround(seed, usedKeys) {
	for (const radius of fallbackRadii) {
		const query = buildAroundQuery(seed.latitude, seed.longitude, radius);
		const fetched = await fetchOverpass(query, `around:${seed.id}:${radius}`);
		const candidates = uniqCandidates(parseOverpassCandidates(fetched.json));
		const match = pickBestCandidate(seed, candidates, usedKeys);
		console.log(
			JSON.stringify({
				phase: "seed_fallback",
				seed_id: seed.id,
				radius_m: radius,
				candidates: candidates.length,
				matched: Boolean(match),
			}),
		);
		if (match) return match;
	}
	return null;
}

async function buildPlan() {
	const expected = loadAdminFeatures();
	const rawSeeds = await fetchActiveSeeds();
	const resolvedSeeds = [];
	const skippedSeeds = [];

	for (const row of rawSeeds) {
		const area = resolveSeedArea(row, expected);
		if (!area) {
			skippedSeeds.push({
				id: row.id,
				reason: "missing_admin_feature",
				coverage_level: normalizeCoverageLevel(row),
				coverage_code: row.subdistrict_code || row.district_code || null,
			});
			continue;
		}
		resolvedSeeds.push({
			...row,
			coverageLevel: area.coverageLevel,
			coverageCode: area.coverageCode,
			provinceCode: area.provinceCode,
			areaFeature: area.feature,
		});
	}

	const districtFirstSeeds = [...resolvedSeeds].sort((a, b) => {
		if (a.coverageLevel === b.coverageLevel) return 0;
		return a.coverageLevel === "district" ? -1 : 1;
	});

	const { byProvince, fetchMeta } = await fetchProvincePools(districtFirstSeeds, expected);
	const usedKeys = new Set();
	const replacementRows = [];
	const replacementPairs = [];
	const unresolvedSeeds = [];
	const nowIso = new Date().toISOString();

	for (let index = 0; index < districtFirstSeeds.length; index += 1) {
		const seed = districtFirstSeeds[index];
		const provincePool = byProvince.get(seed.provinceCode) || [];
		let match = pickBestCandidate(seed, provincePool, usedKeys);

		if (!match && fallbackRadii.length) {
			try {
				match = await resolveSeedViaAround(seed, usedKeys);
			} catch (error) {
				unresolvedSeeds.push({
					id: seed.id,
					reason: "fallback_fetch_error",
					error: error?.message || String(error),
					coverage_level: seed.coverageLevel,
					coverage_code: seed.coverageCode,
				});
				continue;
			}
		}

		if (!match) {
			unresolvedSeeds.push({
				id: seed.id,
				reason: "no_real_poi_candidate",
				coverage_level: seed.coverageLevel,
				coverage_code: seed.coverageCode,
				province_code: seed.provinceCode || null,
			});
			continue;
		}

		usedKeys.add(match.candidate.key);
		const row = buildReplacementRow(seed, match, nowIso);
		replacementRows.push(row);
		replacementPairs.push({
			seed_id: seed.id,
			seed_coverage_level: seed.coverageLevel,
			seed_coverage_code: seed.coverageCode,
			seed_province_code: seed.provinceCode,
			replacement_id: row.id,
			replacement_source_hash: row.source_hash,
			osm_key: match.candidate.key,
			distance_km: Number(match.distanceKm.toFixed(3)),
		});

		if ((index + 1) % 100 === 0 || index + 1 === districtFirstSeeds.length) {
			console.log(
				JSON.stringify({
					phase: "match_seed",
					processed: index + 1,
					total: districtFirstSeeds.length,
					matched: replacementRows.length,
					unresolved: unresolvedSeeds.length,
				}),
			);
		}
	}

	const unresolvedByReason = unresolvedSeeds.reduce((acc, row) => {
		acc[row.reason] = (acc[row.reason] || 0) + 1;
		return acc;
	}, {});

	return {
		generated_at: nowIso,
		mode,
		seed_source: seedSource,
		replacement_source: replacementSource,
		config: {
			batch,
			chunk,
			province_concurrency: provinceConcurrency,
			fallback_radii: fallbackRadii,
			tambon_accuracy: tambonAccuracy,
			overpass_timeout_sec: overpassTimeoutSec,
			include_nameless: includeNameless,
			max_seeds: maxSeeds,
		},
		seed_counts: {
			scanned: rawSeeds.length,
			resolved_area: resolvedSeeds.length,
			skipped_area: skippedSeeds.length,
			district: resolvedSeeds.filter((s) => s.coverageLevel === "district").length,
			subdistrict: resolvedSeeds.filter((s) => s.coverageLevel === "subdistrict").length,
		},
		planned: {
			replacement_rows: replacementRows.length,
			replaced_seed_rows: replacementPairs.length,
			unresolved_seed_rows: unresolvedSeeds.length,
		},
		unresolved_by_reason: unresolvedByReason,
		fetch_meta: fetchMeta,
		skipped_seeds_sample: skippedSeeds.slice(0, 80),
		unresolved_seeds_sample: unresolvedSeeds.slice(0, 120),
		replacement_pairs_sample: replacementPairs.slice(0, 120),
		replacement_rows_sample: replacementRows.slice(0, 40),
		replacement_pairs: replacementPairs,
		replacement_rows: replacementRows,
		applied_count: 0,
		soft_deleted_seed_count: 0,
		rollback_inserted_count: 0,
		rollback_seed_restore_count: 0,
	};
}

async function applyPlan(report) {
	let applied = 0;
	for (let i = 0; i < report.replacement_rows.length; i += chunk) {
		const slice = report.replacement_rows.slice(i, i + chunk);
		const { error } = await supabase.from("venues").insert(slice);
		if (error) throw error;
		applied += slice.length;
		console.log(
			JSON.stringify({
				phase: "apply_insert",
				applied,
				total: report.replacement_rows.length,
			}),
		);
	}
	report.applied_count = applied;

	const seedIds = report.replacement_pairs.map((row) => row.seed_id);
	const nowIso = new Date().toISOString();
	let softDeleted = 0;
	for (let i = 0; i < seedIds.length; i += chunk) {
		const slice = seedIds.slice(i, i + chunk);
		if (!slice.length) continue;
		const { error } = await supabase
			.from("venues")
			.update({
				deleted_at: nowIso,
				is_deleted: true,
				status: "inactive",
			})
			.in("id", slice);
		if (error) throw error;
		softDeleted += slice.length;
		console.log(
			JSON.stringify({
				phase: "apply_seed_soft_delete",
				soft_deleted: softDeleted,
				total: seedIds.length,
			}),
		);
	}
	report.soft_deleted_seed_count = softDeleted;
	report.applied_at = nowIso;
	return report;
}

async function rollbackPlan(report) {
	const replacementIds = (report.replacement_rows || []).map((row) => row.id);
	const seedIds = (report.replacement_pairs || []).map((row) => row.seed_id);
	const nowIso = new Date().toISOString();

	let rolledBackInserted = 0;
	for (let i = 0; i < replacementIds.length; i += chunk) {
		const slice = replacementIds.slice(i, i + chunk);
		if (!slice.length) continue;
		const { error } = await supabase
			.from("venues")
			.update({
				deleted_at: nowIso,
				is_deleted: true,
				status: "inactive",
			})
			.in("id", slice);
		if (error) throw error;
		rolledBackInserted += slice.length;
	}
	report.rollback_inserted_count = rolledBackInserted;

	let restoredSeeds = 0;
	for (let i = 0; i < seedIds.length; i += chunk) {
		const slice = seedIds.slice(i, i + chunk);
		if (!slice.length) continue;
		const { error } = await supabase
			.from("venues")
			.update({
				deleted_at: null,
				is_deleted: false,
				status: "active",
			})
			.in("id", slice);
		if (error) throw error;
		restoredSeeds += slice.length;
	}
	report.rollback_seed_restore_count = restoredSeeds;
	report.rolled_back_at = nowIso;
	return report;
}

async function main() {
	if (mode === "rollback") {
		if (!fs.existsSync(outFile)) {
			throw new Error(`Rollback report not found: ${outFile}`);
		}
		const report = JSON.parse(fs.readFileSync(outFile, "utf8"));
		await rollbackPlan(report);
		writeReport(report);
		console.log(
			JSON.stringify(
				{
					out_file: outFile,
					rollback_inserted_count: report.rollback_inserted_count,
					rollback_seed_restore_count: report.rollback_seed_restore_count,
					rolled_back_at: report.rolled_back_at || null,
				},
				null,
				2,
			),
		);
		return;
	}

	const report = await buildPlan();
	writeReport(report);
	console.log(
		JSON.stringify(
			{
				out_file: outFile,
				mode: report.mode,
				seed_counts: report.seed_counts,
				planned: report.planned,
				unresolved_by_reason: report.unresolved_by_reason,
			},
			null,
			2,
		),
	);

	if (mode === "apply") {
		await applyPlan(report);
		writeReport(report);
		console.log(
			JSON.stringify(
				{
					out_file: outFile,
					applied_count: report.applied_count,
					soft_deleted_seed_count: report.soft_deleted_seed_count,
					applied_at: report.applied_at || null,
				},
				null,
				2,
			),
		);
	}
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
