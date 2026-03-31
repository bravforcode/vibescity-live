import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const SEED_PATH = path.join(ROOT, "scripts", "seed-thailand-master.sql");
const NATIONWIDE_SEED_PATH = path.join(
	ROOT,
	"scripts",
	"seed-thailand-77-provinces.sql",
);
const PUBLIC_DATA_DIR = path.join(ROOT, "public", "data");
const CURATED_BUILDINGS_PATH = path.join(
	PUBLIC_DATA_DIR,
	"buildings-curated.json",
);
const BUILDINGS_OUTPUT_PATH = path.join(PUBLIC_DATA_DIR, "buildings.json");
const EVENTS_OUTPUT_PATH = path.join(PUBLIC_DATA_DIR, "events.json");
const EMERGENCY_OUTPUT_PATH = path.join(
	PUBLIC_DATA_DIR,
	"emergency-locations.json",
);

const readJsonFile = async (filePath, fallbackValue) => {
	try {
		const raw = await readFile(filePath, "utf8");
		return JSON.parse(raw);
	} catch {
		return fallbackValue;
	}
};

const normalizeWhitespace = (value) =>
	String(value || "")
		.replace(/\s+/g, " ")
		.trim();

const hasMeaningfulText = (value) => {
	const text = normalizeWhitespace(value).replaceAll("�", "");
	return /[A-Za-z\u0E00-\u0E7F]/.test(text);
};

const toFiniteNumber = (value) => {
	const num = Number(value);
	return Number.isFinite(num) ? num : null;
};

const parseSqlScalar = (rawValue) => {
	const value = String(rawValue || "").trim();
	if (!value) return null;
	if (/^null$/i.test(value)) return null;
	if (/^(true|false)$/i.test(value)) return /^true$/i.test(value);
	if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
	if (value.startsWith("'") && value.endsWith("'")) {
		return value.slice(1, -1).replaceAll("''", "'");
	}
	return value;
};

const parseInsertRows = (valuesRaw) => {
	const rows = [];
	let index = 0;

	const skipOutsideNoise = () => {
		while (index < valuesRaw.length) {
			const current = valuesRaw[index];
			const next = valuesRaw[index + 1];
			if (current === "-" && next === "-") {
				index += 2;
				while (index < valuesRaw.length && valuesRaw[index] !== "\n") {
					index += 1;
				}
				continue;
			}
			if (/\s|,/.test(current)) {
				index += 1;
				continue;
			}
			break;
		}
	};

	while (index < valuesRaw.length) {
		skipOutsideNoise();
		if (valuesRaw[index] !== "(") {
			index += 1;
			continue;
		}

		index += 1;
		const fields = [];
		let buffer = "";
		let inString = false;

		while (index < valuesRaw.length) {
			const current = valuesRaw[index];
			const next = valuesRaw[index + 1];

			if (inString) {
				if (current === "'" && next === "'") {
					buffer += "''";
					index += 2;
					continue;
				}
				if (current === "'") {
					inString = false;
					buffer += current;
					index += 1;
					continue;
				}
				buffer += current;
				index += 1;
				continue;
			}

			if (current === "'") {
				inString = true;
				buffer += current;
				index += 1;
				continue;
			}

			if (current === ",") {
				fields.push(parseSqlScalar(buffer));
				buffer = "";
				index += 1;
				continue;
			}

			if (current === ")") {
				fields.push(parseSqlScalar(buffer));
				buffer = "";
				index += 1;
				break;
			}

			buffer += current;
			index += 1;
		}

		rows.push(fields);
	}

	return rows;
};

const extractInsertBlocks = (sql, tableName) => {
	const blocks = [];
	const pattern = new RegExp(
		`INSERT INTO\\s+${tableName}\\s*\\(([^)]+)\\)\\s*VALUES\\s*([\\s\\S]*?)(?=\\nON CONFLICT|;)`,
		"gi",
	);

	for (const match of sql.matchAll(pattern)) {
		const columns = match[1]
			.split(",")
			.map((column) => normalizeWhitespace(column));
		const rows = parseInsertRows(match[2]);
		blocks.push({ columns, rows });
	}

	return blocks;
};

const mapRowsToObjects = (blocks) =>
	blocks.flatMap(({ columns, rows }) =>
		rows.map((row) =>
			Object.fromEntries(
				columns.map((column, idx) => [column, row[idx] ?? null]),
			),
		),
	);

const safeJsonParse = (value, fallbackValue = {}) => {
	if (typeof value !== "string") return fallbackValue;
	try {
		return JSON.parse(value);
	} catch {
		return fallbackValue;
	}
};

const slugify = (value) => {
	const base = normalizeWhitespace(value)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return base || "";
};

const toTitleCase = (value) =>
	normalizeWhitespace(value)
		.toLowerCase()
		.replace(/\b\w/g, (match) => match.toUpperCase());

const buildEventId = (eventRow, index) => {
	const idCandidate = slugify(
		[
			eventRow.name,
			eventRow.province,
			eventRow.venue,
			eventRow.start_date,
			eventRow.start_time,
		]
			.filter(Boolean)
			.join("-"),
	);
	return idCandidate || `event-${index + 1}`;
};

const combineDateAndTime = (dateValue, timeValue, fallbackHour) => {
	const datePart = normalizeWhitespace(dateValue);
	if (!datePart) return null;
	const timePart = normalizeWhitespace(timeValue) || fallbackHour;
	if (!timePart) return null;
	return `${datePart}T${timePart}:00`;
};

const normalizeEventWindow = (startTime, endTime, startDate, endDate) => {
	if (!startTime) {
		return { startTime: null, endTime: null };
	}
	if (!endTime) {
		return { startTime, endTime: null };
	}

	const start = new Date(startTime);
	const end = new Date(endTime);
	if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
		return { startTime, endTime };
	}

	const startDatePart = normalizeWhitespace(startDate);
	const endDatePart = normalizeWhitespace(endDate || startDate);
	if (end > start || startDatePart !== endDatePart) {
		return { startTime, endTime };
	}

	const normalizedEnd = new Date(end.getTime());
	normalizedEnd.setDate(normalizedEnd.getDate() + 1);
	return {
		startTime,
		endTime: normalizedEnd.toISOString().slice(0, 19),
	};
};

const transformBuildings = (rows) => {
	const result = {};

	for (const row of rows) {
		const id = normalizeWhitespace(row.id);
		if (!id) continue;
		const payload = safeJsonParse(row.data, {});
		const latitude = toFiniteNumber(row.latitude);
		const longitude = toFiniteNumber(row.longitude);
		result[id] = {
			...payload,
			id,
			name: normalizeWhitespace(row.name) || id,
			shortName:
				normalizeWhitespace(row.short_name) ||
				normalizeWhitespace(payload.shortName) ||
				normalizeWhitespace(row.name) ||
				id,
			lat: latitude,
			lng: longitude,
			latitude,
			longitude,
			province: normalizeWhitespace(row.province) || null,
			isGiantActive: Boolean(row.is_giant_active),
			is_giant_active: Boolean(row.is_giant_active),
			icon: normalizeWhitespace(row.icon) || payload.icon || "🏢",
			source: "seed-thailand-master",
		};
	}

	return result;
};

const mergeBuildingMaps = (nationwideBuildings, curatedBuildings) => {
	const merged = { ...nationwideBuildings };

	for (const [id, curatedValue] of Object.entries(curatedBuildings || {})) {
		const base = merged[id] || {};
		merged[id] = {
			...base,
			...curatedValue,
			id: normalizeWhitespace(curatedValue?.id) || base.id || id,
			name:
				normalizeWhitespace(curatedValue?.name) ||
				normalizeWhitespace(base.name) ||
				id,
			shortName:
				normalizeWhitespace(curatedValue?.shortName) ||
				normalizeWhitespace(base.shortName) ||
				normalizeWhitespace(curatedValue?.name) ||
				id,
			lat:
				toFiniteNumber(curatedValue?.lat) ??
				toFiniteNumber(curatedValue?.latitude) ??
				toFiniteNumber(base.lat) ??
				toFiniteNumber(base.latitude),
			lng:
				toFiniteNumber(curatedValue?.lng) ??
				toFiniteNumber(curatedValue?.longitude) ??
				toFiniteNumber(base.lng) ??
				toFiniteNumber(base.longitude),
			latitude:
				toFiniteNumber(curatedValue?.latitude) ??
				toFiniteNumber(curatedValue?.lat) ??
				toFiniteNumber(base.latitude) ??
				toFiniteNumber(base.lat),
			longitude:
				toFiniteNumber(curatedValue?.longitude) ??
				toFiniteNumber(curatedValue?.lng) ??
				toFiniteNumber(base.longitude) ??
				toFiniteNumber(base.lng),
			province:
				normalizeWhitespace(curatedValue?.province) ||
				normalizeWhitespace(base.province) ||
				null,
			source:
				normalizeWhitespace(curatedValue?.source) ||
				normalizeWhitespace(base.source) ||
				"curated",
		};
	}

	return Object.fromEntries(
		Object.entries(merged).sort(([left], [right]) => left.localeCompare(right)),
	);
};

const transformEvents = (rows) =>
	rows
		.map((row, index) => {
			const startTimeRaw =
				combineDateAndTime(row.start_date, row.start_time, "18:00") ||
				combineDateAndTime(row.start_date, null, "18:00");
			const endTimeRaw =
				combineDateAndTime(
					row.end_date || row.start_date,
					row.end_time,
					"23:00",
				) || combineDateAndTime(row.end_date || row.start_date, null, "23:00");
			const { startTime, endTime } = normalizeEventWindow(
				startTimeRaw,
				endTimeRaw,
				row.start_date,
				row.end_date,
			);
			const venue = hasMeaningfulText(row.venue)
				? normalizeWhitespace(row.venue)
				: "";
			const zone = hasMeaningfulText(row.zone)
				? normalizeWhitespace(row.zone)
				: "";
			const province = hasMeaningfulText(row.province)
				? normalizeWhitespace(row.province)
				: "";
			const category = normalizeWhitespace(row.category) || "Event";
			const rawName = hasMeaningfulText(row.name)
				? normalizeWhitespace(row.name)
				: "";
			const fallbackName =
				venue || province
					? `${toTitleCase(category)} at ${venue || province}`
					: "";
			const location = [venue, zone, province].filter(Boolean).join(", ");

			return {
				id: buildEventId(row, index),
				name: rawName || fallbackName,
				location: location || province || "Thailand",
				date: startTime,
				startTime,
				endTime,
				category,
				description: hasMeaningfulText(row.description)
					? normalizeWhitespace(row.description)
					: "",
				isLive: false,
				lat: toFiniteNumber(row.latitude),
				lng: toFiniteNumber(row.longitude),
				province: province || null,
				zone: zone || null,
				venue: venue || null,
				isRecurring: Boolean(row.is_recurring),
				recurrenceType: normalizeWhitespace(row.recurrence_type) || null,
				icon: normalizeWhitespace(row.icon) || null,
				color: normalizeWhitespace(row.color) || null,
				ticketUrl: normalizeWhitespace(row.ticket_url) || null,
				source: "seed-thailand-master",
			};
		})
		.filter((event) => event.name && event.startTime)
		.sort((left, right) => left.startTime.localeCompare(right.startTime));

const transformEmergencyLocations = (rows) =>
	rows
		.map((row, index) => ({
			id: `emergency-${normalizeWhitespace(row.type) || "unknown"}-${index + 1}`,
			name: normalizeWhitespace(row.name) || `Emergency ${index + 1}`,
			type: normalizeWhitespace(row.type) || "unknown",
			lat: toFiniteNumber(row.latitude),
			lng: toFiniteNumber(row.longitude),
			phone: normalizeWhitespace(row.phone) || null,
			province: normalizeWhitespace(row.province) || null,
			address: normalizeWhitespace(row.address) || null,
			is24h: Boolean(row.is_24h),
			source: "seed-thailand-master",
		}))
		.filter(
			(item) =>
				item.name && item.type && item.lat !== null && item.lng !== null,
		)
		.sort((left, right) => {
			const typeCompare = left.type.localeCompare(right.type);
			if (typeCompare !== 0) return typeCompare;
			const provinceCompare = String(left.province || "").localeCompare(
				String(right.province || ""),
			);
			if (provinceCompare !== 0) return provinceCompare;
			return left.name.localeCompare(right.name);
		});

const writeJson = async (filePath, payload) => {
	await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
};

const main = async () => {
	await mkdir(PUBLIC_DATA_DIR, { recursive: true });

	const [seedSql, nationwideSeedSql, curatedBuildings] = await Promise.all([
		readFile(SEED_PATH, "utf8"),
		readFile(NATIONWIDE_SEED_PATH, "utf8"),
		readJsonFile(CURATED_BUILDINGS_PATH, {}),
	]);

	const buildingRows = mapRowsToObjects(
		extractInsertBlocks(nationwideSeedSql, "buildings"),
	);
	const eventRows = mapRowsToObjects(extractInsertBlocks(seedSql, "events"));
	const emergencyRows = mapRowsToObjects(
		extractInsertBlocks(nationwideSeedSql, "emergency_locations"),
	);

	const mergedBuildings = mergeBuildingMaps(
		transformBuildings(buildingRows),
		curatedBuildings,
	);
	const nationwideEvents = transformEvents(eventRows);
	const emergencyLocations = transformEmergencyLocations(emergencyRows);

	await Promise.all([
		writeJson(BUILDINGS_OUTPUT_PATH, mergedBuildings),
		writeJson(EVENTS_OUTPUT_PATH, nationwideEvents),
		writeJson(EMERGENCY_OUTPUT_PATH, emergencyLocations),
	]);

	console.log(
		`[nationwide-data] Synced ${Object.keys(mergedBuildings).length} buildings, ${nationwideEvents.length} events, ${emergencyLocations.length} emergency POIs`,
	);
};

await main();
