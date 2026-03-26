/**
 * 📁 src/store/shopStore.js
 * ✅ Main Shop/Venue Store - Enterprise Grade
 * Features: Caching, Pagination, Search, Real-time updates
 */
import { defineStore } from "pinia";
import { computed, ref, shallowRef } from "vue";
import { normalizeId, normalizeSlug } from "../domain/venue/normalize";
import {
	normalizeVenueCollection,
	normalizeVenueViewModel,
} from "../domain/venue/viewModel";
import { isSupabaseSchemaCacheError, supabase } from "../lib/supabase";
import { apiFetch, parseApiError } from "../services/apiClient";
import { useFeatureFlagStore } from "./featureFlagStore";
import { useLocationStore } from "./locationStore";

// ═══════════════════════════════════════════
// 🛠️ Utilities
// ═══════════════════════════════════════════
const parseWkbPointHex = (value) => {
	if (!value || typeof value !== "string") return null;
	const hex = value.trim().replace(/^\\x/i, "");
	if (!/^[0-9a-f]+$/i.test(hex) || hex.length < 42 || hex.length % 2 !== 0) {
		return null;
	}
	try {
		const bytes = new Uint8Array(hex.length / 2);
		for (let i = 0; i < hex.length; i += 2) {
			bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
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
		return { lat, lng };
	} catch {
		return null;
	}
};

const parseWktPoint = (value) => {
	if (!value || typeof value !== "string") return null;
	const text = value.trim().replace(/^SRID=\d+;/i, "");
	const match = text.match(
		/POINT\s*\(\s*([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)\s+([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)\s*\)/i,
	);
	if (!match) return null;
	const lng = Number(match[1]);
	const lat = Number(match[2]);
	if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
	return { lat, lng };
};

const parseGeoJsonPoint = (value) => {
	if (!value || typeof value !== "object") return null;
	if (Array.isArray(value.coordinates) && value.coordinates.length >= 2) {
		const lng = Number(value.coordinates[0]);
		const lat = Number(value.coordinates[1]);
		if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
	}
	const lat = Number(value.lat ?? value.latitude);
	const lng = Number(value.lng ?? value.lon ?? value.longitude);
	if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
	return null;
};

const parseLocationPoint = (value) => {
	if (!value) return null;
	if (typeof value === "object") return parseGeoJsonPoint(value);
	if (typeof value !== "string") return null;
	const text = value.trim();
	if (!text) return null;
	if (text.startsWith("{") || text.startsWith("[")) {
		try {
			return parseLocationPoint(JSON.parse(text));
		} catch {
			// fall through
		}
	}
	return parseWktPoint(text) || parseWkbPointHex(text);
};

const normalizeCoords = (shop) => {
	let lat = shop.lat ?? shop.latitude ?? shop.Latitude;
	let lng = shop.lng ?? shop.longitude ?? shop.Longitude ?? shop.lon;

	if ((lat === undefined || lng === undefined) && shop.location) {
		const parsed = parseLocationPoint(shop.location);
		if (parsed) {
			lat = parsed.lat;
			lng = parsed.lng;
		}
	}

	const latNum = Number(lat),
		lngNum = Number(lng);
	if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) return null;
	return { lat: latNum, lng: lngNum };
};

const normalizeStatusForUi = (status) => {
	const normalized = String(status || "active")
		.trim()
		.toLowerCase();
	if (["live", "active", "open"].includes(normalized)) return "LIVE";
	if (["off", "inactive", "disabled", "deleted", "closed"].includes(normalized))
		return "OFF";
	return normalized.toUpperCase() || "OFF";
};

const calculateDistance = (lat1, lng1, lat2, lng2) => {
	const R = 6371,
		dLat = ((lat2 - lat1) * Math.PI) / 180,
		dLng = ((lng2 - lng1) * Math.PI) / 180;
	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos((lat1 * Math.PI) / 180) *
			Math.cos((lat2 * Math.PI) / 180) *
			Math.sin(dLng / 2) ** 2;
	return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// Stable int hash for UUID/string ids (used for deterministic rotation ordering)
const hashStringToInt = (value) => {
	const str = normalizeId(value);
	let hash = 5381;
	for (let i = 0; i < str.length; i++) {
		hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
	}
	return Math.abs(hash) >>> 0;
};

const idToSeed = (id) => {
	const n = Number(id);
	if (Number.isFinite(n)) return n;
	return hashStringToInt(id);
};

const unavailableRpcNames = new Set();
const isRpcMissingError = (error) => {
	const code = String(error?.code || "").toUpperCase();
	const message = String(error?.message || "").toLowerCase();
	return (
		code === "PGRST202" ||
		code === "42883" ||
		message.includes("could not find the function")
	);
};

const buildE2eShops = () => {
	const now = new Date().toISOString();
	return [
		{
			id: 101,
			name: "Vibe Cafe",
			category: "Cafe",
			description: "E2E mock cafe for reliable search results.",
			lat: 18.7883,
			lng: 98.9853,
			status: "LIVE",
			is_glowing: true,
			rating: 4.7,
			total_views: 120,
			created_at: now,
		},
		{
			id: 102,
			name: "Cafe Noir",
			category: "Cafe",
			description: "E2E mock cafe near center.",
			lat: 18.7892,
			lng: 98.9861,
			status: "LIVE",
			rating: 4.4,
			total_views: 90,
			created_at: now,
		},
		{
			id: 103,
			name: "Vibe Bar",
			category: "Nightlife",
			description: "E2E mock nightlife spot.",
			lat: 18.7901,
			lng: 98.9844,
			status: "LIVE",
			rating: 4.5,
			total_views: 150,
			created_at: now,
		},
	];
};

// Schema-safe minimal baseline first, then optional enrichment query.
const BASE_VENUE_COLUMNS =
	'id,slug,short_code,name,category,status,created_at,total_views,view_count,rating,location,latitude,longitude,image_urls,video_url,"Video_URL",pin_type,pin_metadata,is_verified';
const OPTIONAL_VENUE_COLUMNS =
	"id,description,province,district,phone,building:building_id,floor,video_url,open_time:opening_hours";
const V2_FEED_COOLDOWN_MS = 3 * 60 * 1000;
const SCHEMA_CACHE_FETCH_COOLDOWN_MS = 15_000;

// ═══════════════════════════════════════════
// 🏪 Store Definition
// ═══════════════════════════════════════════
export const useShopStore = defineStore(
	"shop",
	() => {
		const locationStore = useLocationStore();
		const featureFlagStore = useFeatureFlagStore();

		// ═══════════════════════════════════════════
		// 📦 State
		// ═══════════════════════════════════════════
		const rawShops = shallowRef([]); // shallowRef for performance
		const shopMap = shallowRef(new Map()); // shallowRef: no proxy traversal
		const slugMap = shallowRef(new Map()); // shallowRef: no proxy traversal
		const reviews = ref({});
		const reviewsUnavailable = ref(false);
		const reviewsApiDisabled = ref(false);
		const collectedCoins = shallowRef(new Set());
		const currentTime = ref(new Date()); // ✅ Current time for status calculations

		// UI State
		const activeShopId = ref(null);
		const activeCategories = ref([]);
		const activeStatus = ref("ALL");
		const searchQuery = ref("");
		const sortBy = ref("distance"); // distance | rating | popular | newest

		// Loading & Error States
		const isLoading = ref(true);
		const error = shallowRef(null);
		const lastFetchTime = ref(null);
		const v2FeedCircuitUntil = ref(0);
		const schemaCacheRetryAfter = ref(0);

		// Rotation for randomization
		const rotationSeed = ref(Math.floor(Date.now() / 1800000));
		let rotationInterval = null;

		const getUserLocationForNormalize = () =>
			locationStore.userLocation || [18.7883, 98.9853];

		const normalizeVenueRows = (rows) =>
			normalizeVenueCollection(rows, {
				userLocation: getUserLocationForNormalize(),
				collectedCoinIds: collectedCoins.value,
			});

		const applyVenueRows = (rows) => {
			const normalized = normalizeVenueRows(rows || []);
			// Requirement: remove venues without photos or videos from website
			// Temporarily disabled for debugging single-card issue
			const filtered = normalized; /*.filter((shop) => {
				const hasImage = shop.images?.some((img) => img && img.trim() !== "");
				const hasVideo = !!shop.videoUrl?.trim();
				return hasImage || hasVideo;
			});*/

			rawShops.value = filtered;
			shopMap.value = new Map(
				filtered.map((shop) => [normalizeId(shop.id), shop]),
			);
			slugMap.value = new Map(
				filtered
					.map((shop) => [normalizeSlug(shop.slug), shop])
					.filter(([slug]) => !!slug),
			);
		};

		// ═══════════════════════════════════════════
		// 📊 Computed Properties
		// ═══════════════════════════════════════════
		const shops = computed(() => rawShops.value);
		const shopCount = computed(() => rawShops.value.length);
		const activeShop = computed(
			() => shopMap.value.get(normalizeId(activeShopId.value)) || null,
		);

		const processedShops = computed(() => {
			const userLoc = locationStore.userLocation || [18.7883, 98.9853];
			const seen = new Set();

			return rawShops.value
				.map((shop) => {
					if (seen.has(shop.id)) return null;
					seen.add(shop.id);

					const normalizedShop = normalizeVenueViewModel(shop, {
						userLocation: userLoc,
						collectedCoinIds: collectedCoins.value,
					});
					const coords = normalizeCoords(normalizedShop);
					const normalizedStatus = normalizeStatusForUi(
						normalizedShop.status || normalizedShop.Status,
					);
					const hasCoords = Boolean(coords);
					const lat = hasCoords ? coords.lat : null;
					const lng = hasCoords ? coords.lng : null;

					return {
						...normalizedShop,
						statusRaw:
							normalizedShop.statusRaw ||
							normalizedShop.status ||
							normalizedShop.Status ||
							"",
						status: normalizedStatus,
						lat,
						lng,
						hasValidCoords: hasCoords,
						distance: hasCoords
							? calculateDistance(
									userLoc[0],
									userLoc[1],
									coords.lat,
									coords.lng,
								)
							: Number.POSITIVE_INFINITY,
						randomKey:
							(idToSeed(normalizedShop.id) + rotationSeed.value * 1103515245) %
							12345,
					};
				})
				.filter(Boolean);
		});

		const filteredShops = computed(() => {
			let result = processedShops.value;

			// Category filter
			if (activeCategories.value.length > 0) {
				result = result.filter((s) =>
					activeCategories.value.includes(s.category),
				);
			}

			// Status filter
			if (activeStatus.value !== "ALL") {
				result = result.filter((s) => s.status === activeStatus.value);
			}

			// Search filter
			if (searchQuery.value.trim()) {
				const q = searchQuery.value.toLowerCase();
				result = result.filter(
					(s) =>
						s.name?.toLowerCase().includes(q) ||
						s.description?.toLowerCase().includes(q) ||
						s.category?.toLowerCase().includes(q),
				);
			}

			return result;
		});

		const visibleShops = computed(() => {
			const shops = [...filteredShops.value];
			const feedVirtualizationEnabled = featureFlagStore.isEnabled(
				"enable_feed_virtualization_v2",
			);
			// Carousel shows 30 nearby shops (rotated every 30 min via rotationSeed)
			const defaultViewLimit = 30;
			const filteredViewLimit = feedVirtualizationEnabled ? 100 : 60;
			const isDefaultView =
				activeCategories.value.length === 0 &&
				activeStatus.value === "ALL" &&
				!searchQuery.value;

			// Sorting
			switch (sortBy.value) {
				case "rating":
					shops.sort((a, b) => (b.rating || 0) - (a.rating || 0));
					break;
				case "popular":
					shops.sort((a, b) => (b.total_views || 0) - (a.total_views || 0));
					break;
				case "newest":
					shops.sort(
						(a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0),
					);
					break;
				default:
					shops.sort((a, b) => a.distance - b.distance);
			}

			// Default view: prioritize LIVE shops + random rotation
			if (isDefaultView) {
				const live = shops.filter((s) => s.status === "LIVE" || s.is_glowing);
				const normal = shops.filter(
					(s) => s.status !== "LIVE" && !s.is_glowing,
				);
				const top50 = normal
					.slice(0, 50)
					.sort((a, b) => a.randomKey - b.randomKey);
				return [...live, ...top50].slice(0, defaultViewLimit);
			}

			return shops.slice(0, filteredViewLimit); // Limit for performance
		});

		const categories = computed(() => {
			const cats = new Map();
			rawShops.value.forEach((s) => {
				if (s.category) cats.set(s.category, (cats.get(s.category) || 0) + 1);
			});
			return Array.from(cats.entries())
				.map(([name, count]) => ({ name, count }))
				.sort((a, b) => b.count - a.count);
		});

		const nearbyShops = computed(() =>
			processedShops.value
				.filter((s) => Number.isFinite(s.distance) && s.distance < 5)
				.slice(0, 20),
		);
		const liveShops = computed(() =>
			processedShops.value.filter((s) => s.status === "LIVE"),
		);

		// ═══════════════════════════════════════════
		// 🔄 Actions
		// ═══════════════════════════════════════════
		const venueDetailInFlight = new Map();
		const venueDetailLoaded = new Set();
		const isV2CircuitError = (err) => {
			if (isSupabaseSchemaCacheError(err)) return true;
			const code = String(err?.code || "").toLowerCase();
			const status = Number(err?.status || err?.statusCode || 0);
			const message = String(err?.message || "").toLowerCase();
			return (
				status >= 500 ||
				code === "57014" ||
				message.includes("statement timeout") ||
				message.includes("internal server error") ||
				message.includes("timeout")
			);
		};
		const enrichVenueRows = async (rows) => {
			if (!Array.isArray(rows) || rows.length === 0) return rows || [];
			const ids = rows
				.map((row) => row?.id)
				.filter((id) => id !== null && id !== undefined)
				.slice(0, 200);
			if (ids.length === 0) return rows;

			try {
				const { data, error: enrichErr } = await supabase
					.from("venues_public")
					.select(OPTIONAL_VENUE_COLUMNS)
					.in("id", ids);
				if (enrichErr || !Array.isArray(data) || data.length === 0) {
					if (import.meta.env.DEV && enrichErr) {
						console.warn(
							"🏪 Optional venue enrichment skipped:",
							enrichErr?.message || enrichErr,
						);
					}
					return rows;
				}
				const mapById = new Map(data.map((row) => [String(row.id), row]));
				return rows.map((row) => ({
					...row,
					...(mapById.get(String(row?.id)) || {}),
				}));
			} catch {
				return rows;
			}
		};

		const fetchShops = async (force = false) => {
			if (import.meta.env.VITE_E2E === "true") {
				const data = buildE2eShops();
				applyVenueRows(data);
				lastFetchTime.value = Date.now();
				isLoading.value = false;
				error.value = null;
				return;
			}

			const now = Date.now();
			if (!force && now < schemaCacheRetryAfter.value) {
				if (import.meta.env.DEV) {
					console.warn("🏪 Skipping venue fetch during schema-cache cooldown");
				}
				return;
			}

			// Cache check: refetch only if >5 min old
			if (!force && lastFetchTime.value && now - lastFetchTime.value < 300000) {
				if (import.meta.env.DEV) console.log("🏪 Using cached shops");
				return;
			}

			isLoading.value = true;
			error.value = null;

			try {
				await featureFlagStore.refreshFlags();
				if (
					featureFlagStore.isEnabled("use_v2_feed") &&
					now >= v2FeedCircuitUntil.value
				) {
					try {
						await fetchShopsV2(force);
						return;
					} catch (v2Err) {
						if (isV2CircuitError(v2Err)) {
							v2FeedCircuitUntil.value = Date.now() + V2_FEED_COOLDOWN_MS;
							if (import.meta.env.DEV) {
								console.warn(
									"🏪 V2 feed circuit opened. Cooling down before retry.",
								);
							}
						}
						// V2 feed RPC may not exist yet – fall through to standard query
						if (import.meta.env.DEV) {
							console.warn(
								"🏪 V2 feed failed, falling back to standard query:",
								v2Err?.message || v2Err,
							);
						}
					}
				}

				const fetchWithSelect = async (select) =>
					supabase.from("venues").select(select).order("created_at", {
						ascending: false,
					});

				let data = null;
				let err = null;

				({ data, error: err } = await fetchWithSelect(BASE_VENUE_COLUMNS));
				if (err) {
					if (import.meta.env.DEV) {
						console.warn(
							"🏪 Base venues select failed; falling back to select('*'):",
							err?.message || err,
						);
					}
					({ data, error: err } = await fetchWithSelect("*"));
				}

				if (err) throw err;
				data = await enrichVenueRows(data || []);

				applyVenueRows(data || []);
				lastFetchTime.value = Date.now();

				if (import.meta.env.DEV)
					console.log(`🏪 Fetched ${data?.length || 0} venues`);
			} catch (e) {
				if (isSupabaseSchemaCacheError(e)) {
					schemaCacheRetryAfter.value =
						Date.now() + SCHEMA_CACHE_FETCH_COOLDOWN_MS;
					if (import.meta.env.DEV) {
						console.warn(
							"🏪 Supabase schema cache unavailable; keeping current venues.",
						);
					}
					if (rawShops.value.length > 0) {
						error.value = null;
						return;
					}
				}
				if (import.meta.env.DEV) console.error("❌ Failed to fetch shops:", e);
				error.value = { message: e.message, code: e.code };
			} finally {
				isLoading.value = false;
			}
		};

		const fetchShopsV2 = async (force = false) => {
			if (
				!force &&
				lastFetchTime.value &&
				Date.now() - lastFetchTime.value < 300000
			) {
				return;
			}

			const userLoc = locationStore.userLocation || [18.7883, 98.9853];
			const { data, error: err } = await supabase.rpc("get_feed_cards", {
				p_lat: userLoc[0],
				p_lng: userLoc[1],
			});
			if (err) throw err;

			const mapped = (data || []).map((s) => ({
				id: s.id,
				name: s.name,
				slug: s.slug,
				category: s.category,
				status: s.status,
				rating: Number(s.rating || 0),
				total_views: Number(s.view_count || s.total_views || 0),
				image_urls: s.image_url ? [s.image_url] : s.image_urls || [],
				Image_URL1: s.image_url || s.image_url1 || "",
				video_url: s.video_url || s.Video_URL || "",
				Video_URL: s.video_url || s.Video_URL || "",
				lat: s.latitude ?? s.lat,
				lng: s.longitude ?? s.lng,
				distance_meters:
					s.distance_meters != null
						? s.distance_meters
						: s.distance_km != null
							? s.distance_km * 1000
							: null,
				pin_type: s.pin_type || "normal",
				pin_metadata: s.pin_metadata || {},
				verifiedActive: Boolean(s.verified_active),
				glowActive: Boolean(s.glow_active),
				boostActive: Boolean(s.boost_active),
				giantActive: Boolean(s.giant_active),
				is_giant_active: Boolean(s.giant_active),
				isGiantPin: Boolean(s.giant_active),
				visibilityScore: Number(s.visibility_score || 0),
				isPromoted: Boolean(s.is_promoted),
			}));

			applyVenueRows(mapped);
			lastFetchTime.value = Date.now();
		};

		const searchV2 = async (query, { limit = 30, offset = 0 } = {}) => {
			const q = String(query || "").trim();
			if (!q) {
				clearFilters();
				return fetchShops(true);
			}

			await featureFlagStore.refreshFlags();
			if (!featureFlagStore.isEnabled("use_v2_search")) {
				searchQuery.value = q;
				return;
			}

			isLoading.value = true;
			error.value = null;
			const userLoc = locationStore.userLocation || [18.7883, 98.9853];

			try {
				const { data, error: err } = await supabase.rpc("search_venues_v2", {
					p_query: q,
					p_lat: userLoc[0],
					p_lng: userLoc[1],
					p_limit: limit,
					p_offset: offset,
				});
				if (err) throw err;

				const mapped = (data || []).map((s) => ({
					id: s.id,
					name: s.name,
					slug: s.slug,
					category: s.category,
					status: s.status,
					rating: Number(s.rating || 0),
					total_views: Number(s.view_count || 0),
					image_urls: s.image_url ? [s.image_url] : [],
					Image_URL1: s.image_url || "",
					floor: s.floor || null,
					Zone: s.zone || null,
					highlight_snippet: s.highlight_snippet || "",
					distance_meters: s.distance_meters,
					lat: s.lat,
					lng: s.lng,
					pin_type: s.pin_type || "normal",
					giantActive: Boolean(s.giant_active),
					is_giant_active: Boolean(s.giant_active),
					isGiantPin: Boolean(s.giant_active),
				}));

				applyVenueRows(mapped);
			} catch (e) {
				error.value = { message: e.message, code: e.code };
			} finally {
				isLoading.value = false;
			}
		};

		/**
		 * Fetch full details for a single venue without reloading the whole list.
		 * Used for lazy hydration when opening detail views.
		 */
		const fetchVenueDetail = async (id) => {
			const key = normalizeId(id);
			if (!key) return null;

			const existing = shopMap.value.get(key) || null;
			if (existing && Date.now() < schemaCacheRetryAfter.value) {
				return existing;
			}
			if (existing && venueDetailLoaded.has(key)) return existing;

			if (venueDetailInFlight.has(key)) {
				return venueDetailInFlight.get(key);
			}

			const promise = (async () => {
				try {
					const { data, error: err } = await supabase
						.from("venues")
						.select("*")
						.eq("id", key)
						.maybeSingle();

					if (err) throw err;
					if (!data) return null;

					const merged = normalizeVenueViewModel(
						{ ...(existing || {}), ...data },
						{
							userLocation: getUserLocationForNormalize(),
							collectedCoinIds: collectedCoins.value,
						},
					);
					venueDetailLoaded.add(key);

					// Update maps
					shopMap.value = new Map(shopMap.value);
					shopMap.value.set(key, merged);

					const slugKey = normalizeSlug(merged.slug);
					if (slugKey) {
						slugMap.value = new Map(slugMap.value);
						slugMap.value.set(slugKey, merged);
					}

					// Update list (preserve ordering)
					const next = Array.isArray(rawShops.value) ? [...rawShops.value] : [];
					const idx = next.findIndex((s) => normalizeId(s?.id) === key);
					if (idx >= 0) next[idx] = merged;
					else next.unshift(merged);
					rawShops.value = next;

					return merged;
				} catch (e) {
					if (isSupabaseSchemaCacheError(e)) {
						schemaCacheRetryAfter.value =
							Date.now() + SCHEMA_CACHE_FETCH_COOLDOWN_MS;
						return existing;
					}
					if (import.meta.env.DEV) {
						console.warn("🏪 fetchVenueDetail failed:", e?.message || e);
					}
					return null;
				}
			})();

			venueDetailInFlight.set(key, promise);
			try {
				return await promise;
			} finally {
				venueDetailInFlight.delete(key);
			}
		};

		const getShopById = (id) => {
			const key = normalizeId(id);
			if (!key) return null;
			const fromMap = shopMap.value.get(key);
			if (fromMap) return fromMap;

			const numeric = Number(id);
			if (Number.isFinite(numeric)) {
				const numericKey = normalizeId(numeric);
				const numericHit = shopMap.value.get(numericKey);
				if (numericHit) return numericHit;
			}

			return (
				processedShops.value.find((s) => normalizeId(s.id) === key) || null
			);
		};

		const getShopBySlug = (slug) => {
			const key = normalizeSlug(slug);
			if (!key) return null;
			const fromMap = slugMap.value.get(key);
			if (fromMap) return fromMap;
			return (
				processedShops.value.find((s) => normalizeSlug(s.slug) === key) || null
			);
		};

		const setActiveShop = (id) => {
			activeShopId.value = normalizeId(id) || null;
		};
		const setCategories = (cats) => {
			activeCategories.value = cats;
		};
		const setStatus = (status) => {
			activeStatus.value = status;
		};
		const setSearch = (query) => {
			searchQuery.value = query;
		};
		const setSortBy = (sort) => {
			sortBy.value = sort;
		};
		const clearFilters = () => {
			activeCategories.value = [];
			activeStatus.value = "ALL";
			searchQuery.value = "";
		};

		// ═══════════════════════════════════════════
		// 📝 Reviews
		// ═══════════════════════════════════════════
		const getShopReviews = (shopId) => reviews.value[String(shopId)] || [];
		const parseReviewListResponse = async (response) => {
			const payload = await response.json().catch(() => []);
			return Array.isArray(payload) ? payload : [];
		};
		const parseReviewCreateResponse = async (response) => {
			const payload = await response.json().catch(() => null);
			return payload && typeof payload === "object" ? payload : null;
		};
		const shouldFallbackReviewsApi = (status) =>
			[404, 405, 422].includes(Number(status));
		const isReviewAccessError = (err) => {
			const status = Number(err?.status || err?.statusCode || 0);
			const code = String(err?.code || "").toUpperCase();
			const message = String(err?.message || "").toLowerCase();
			return (
				status === 401 ||
				status === 403 ||
				code === "PGRST301" ||
				code === "42501" ||
				message.includes("unauthorized") ||
				message.includes("permission denied")
			);
		};

		const fetchShopReviews = async (shopId) => {
			if (reviewsUnavailable.value) {
				reviews.value[String(shopId)] = [];
				return;
			}
			const key = String(shopId);

			if (!reviewsApiDisabled.value) {
				try {
					const response = await apiFetch(
						`/shops/${encodeURIComponent(shopId)}/reviews?limit=50`,
						{
							method: "GET",
							includeVisitor: true,
							refreshVisitorTokenIfNeeded: true,
						},
					);

					if (response.ok) {
						reviews.value[key] = await parseReviewListResponse(response);
						return;
					}

					if (shouldFallbackReviewsApi(response.status)) {
						// Older/strict backend contract - fall back to direct Supabase query.
						reviewsApiDisabled.value = true;
					} else if (response.status === 401 || response.status === 403) {
						reviewsUnavailable.value = true;
						reviews.value[key] = [];
						return;
					} else if (import.meta.env.DEV) {
						const detail = await parseApiError(
							response,
							"reviews_api_unavailable",
						);
						console.warn("🏪 Reviews API warning:", detail);
					}
				} catch (apiError) {
					if (import.meta.env.DEV) {
						console.warn("🏪 Reviews API fetch failed:", apiError);
					}
				}
			}

			try {
				const { data, error: err } = await supabase
					.from("reviews")
					.select("*")
					.eq("venue_id", shopId)
					.order("created_at", { ascending: false })
					.limit(50);

				if (err) throw err;
				reviews.value[key] = data || [];
			} catch (e) {
				if (isReviewAccessError(e)) {
					reviewsUnavailable.value = true;
					reviews.value[key] = [];
					return;
				}
				if (import.meta.env.DEV) {
					console.error("❌ Failed to fetch reviews:", e);
				}
			}
		};

		const addReview = async (shopId, review) => {
			if (reviewsUnavailable.value) {
				return {
					success: false,
					error: "reviews_unavailable",
				};
			}

			if (!reviewsApiDisabled.value) {
				try {
					const response = await apiFetch(
						`/shops/${encodeURIComponent(shopId)}/reviews`,
						{
							method: "POST",
							includeVisitor: true,
							refreshVisitorTokenIfNeeded: true,
							body: {
								rating: review?.rating ?? null,
								comment: String(review?.comment || ""),
								userName: String(review?.userName || "Vibe Explorer"),
							},
						},
					);

					if (response.ok) {
						const data = await parseReviewCreateResponse(response);
						if (!reviews.value[String(shopId)])
							reviews.value[String(shopId)] = [];
						if (data) reviews.value[String(shopId)].unshift(data);
						return { success: true, data };
					}

					if (shouldFallbackReviewsApi(response.status)) {
						reviewsApiDisabled.value = true;
					} else if (response.status === 401 || response.status === 403) {
						reviewsUnavailable.value = true;
						return { success: false, error: "reviews_unavailable" };
					}
				} catch (apiError) {
					if (import.meta.env.DEV) {
						console.warn("🏪 Reviews API insert failed:", apiError);
					}
				}
			}

			try {
				const { data, error: err } = await supabase
					.from("reviews")
					.insert({
						venue_id: shopId,
						rating: review?.rating ?? null,
						comment: String(review?.comment || ""),
						user_name: String(review?.userName || "Vibe Explorer"),
					})
					.select()
					.single();

				if (err) throw err;
				if (!reviews.value[String(shopId)]) reviews.value[String(shopId)] = [];
				reviews.value[String(shopId)].unshift(data);
				return { success: true, data };
			} catch (e) {
				if (isReviewAccessError(e)) {
					reviewsUnavailable.value = true;
					return { success: false, error: "reviews_unavailable" };
				}
				return { success: false, error: e.message };
			}
		};

		// ═══════════════════════════════════════════
		// 📈 Analytics
		// ═══════════════════════════════════════════
		const trackView = async (shopId) => {
			if (!shopId) return;
			const shop = shopMap.value.get(shopId);
			if (shop) shop.total_views = (shop.total_views || 0) + 1;
			if (unavailableRpcNames.has("increment_venue_views")) return;

			// Fire and forget with proper error handling
			try {
				const { error: rpcError } = await supabase.rpc(
					"increment_venue_views",
					{
						venue_id: shopId,
					},
				);
				if (rpcError) {
					if (isRpcMissingError(rpcError)) {
						unavailableRpcNames.add("increment_venue_views");
						return;
					}
					throw rpcError;
				}
			} catch (e) {
				// Silently ignore - analytics failure shouldn't break the app
				if (import.meta.env.DEV)
					console.debug("Analytics trackView failed:", e);
			}
		};

		const trackClick = async (shopId) => {
			const shop = shopMap.value.get(shopId);
			if (shop) shop.pin_clicks = (shop.pin_clicks || 0) + 1;
		};

		// ═══════════════════════════════════════════
		// 🔄 Rotation Timer
		// ═══════════════════════════════════════════
		const startRotationTimer = () => {
			if (rotationInterval) return;
			rotationInterval = setInterval(() => {
				const newSeed = Math.floor(Date.now() / 1800000);
				if (newSeed !== rotationSeed.value) {
					rotationSeed.value = newSeed;
					if (import.meta.env.DEV) console.log("🔄 Rotation updated");
				}
			}, 60000);
		};

		const stopRotationTimer = () => {
			if (rotationInterval) {
				clearInterval(rotationInterval);
				rotationInterval = null;
			}
		};

		// Auto-start rotation
		startRotationTimer();

		// ═══════════════════════════════════════════
		// 🔌 Real-time Subscriptions
		// ═══════════════════════════════════════════
		let subscription = null;

		const subscribeToChanges = () => {
			subscription = supabase
				.channel("venues-changes")
				.on(
					"postgres_changes",
					{ event: "*", schema: "public", table: "venues" },
					(payload) => {
						const next = Array.isArray(rawShops.value)
							? [...rawShops.value]
							: [];
						if (payload.eventType === "INSERT") {
							next.unshift(payload.new);
						} else if (payload.eventType === "UPDATE") {
							const idx = next.findIndex((s) => s.id === payload.new.id);
							if (idx >= 0) {
								next[idx] = { ...next[idx], ...payload.new };
							}
						} else if (payload.eventType === "DELETE") {
							const deletedId = payload?.old?.id;
							applyVenueRows(next.filter((s) => s.id !== deletedId));
							return;
						}
						applyVenueRows(next);
					},
				)
				.subscribe();
		};

		const unsubscribe = () => subscription?.unsubscribe();

		const normalizeCoinCollection = (value) => {
			if (value instanceof Set) return new Set(value);
			if (Array.isArray(value)) return new Set(value);
			if (value && typeof value[Symbol.iterator] === "function") {
				try {
					return new Set(value);
				} catch {
					return new Set();
				}
			}
			return new Set();
		};

		const addCoin = (shopId) => {
			if (shopId === undefined || shopId === null) return;
			const next = normalizeCoinCollection(collectedCoins.value);
			next.add(shopId);
			collectedCoins.value = next;
		};

		return {
			// State
			rawShops,
			reviews,
			collectedCoins,
			currentTime,
			activeShopId,
			activeCategories,
			activeStatus,
			searchQuery,
			sortBy,
			isLoading,
			error,
			lastFetchTime,
			rotationSeed,
			// Computed
			shops,
			shopCount,
			activeShop,
			processedShops,
			filteredShops,
			visibleShops,
			categories,
			nearbyShops,
			liveShops,
			// Actions
			fetchShops,
			searchV2,
			fetchVenueDetail,
			getShopById,
			getShopBySlug,
			setActiveShop,
			setCategories,
			setStatus,
			setSearch,
			setSortBy,
			clearFilters,
			// Reviews
			getShopReviews,
			fetchShopReviews,
			addReview,
			// Analytics
			trackView,
			trackClick,
			incrementView: trackView, // ✅ Alias for backward compatibility
			// Coins
			addCoin,
			// Subscriptions
			subscribeToChanges,
			unsubscribe,
			// Compat aliases
			setShops: (s) => {
				applyVenueRows(Array.isArray(s) ? s : []);
			},
			setLoading: (v) => {
				isLoading.value = v;
			},
			setUserLocation: (l) => locationStore.setUserLocation(l),
			userLocation: computed(() => locationStore.userLocation),
		};
	},
	{
		persist: { paths: ["reviews"], key: "vibe-shops" },
	},
);
