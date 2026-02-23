/**
 * 📁 src/store/shopStore.js
 * ✅ Main Shop/Venue Store - Enterprise Grade
 * Features: Caching, Pagination, Search, Real-time updates
 */
import { defineStore } from "pinia";
import { computed, onUnmounted, ref, shallowRef } from "vue";
import { normalizeId, normalizeSlug } from "../domain/venue/normalize";
import { supabase } from "../lib/supabase";
import { useFeatureFlagStore } from "./featureFlagStore";
import { useLocationStore } from "./locationStore";

// ═══════════════════════════════════════════
// 🛠️ Utilities
// ═══════════════════════════════════════════
const parsePostGISPoint = (hex) => {
	if (!hex || typeof hex !== "string" || hex.length < 50) return null;
	try {
		const readDouble = (start) => {
			const buf = new Uint8Array(
				hex
					.substring(start, start + 16)
					.match(/[\da-f]{2}/gi)
					.map((h) => parseInt(h, 16)),
			);
			return new DataView(buf.buffer).getFloat64(0, true);
		};
		return { lat: readDouble(34), lng: readDouble(18) };
	} catch {
		return null;
	}
};

const normalizeCoords = (shop) => {
	let lat = shop.lat ?? shop.latitude ?? shop.Latitude;
	let lng = shop.lng ?? shop.longitude ?? shop.Longitude ?? shop.lon;

	if ((lat === undefined || lng === undefined) && shop.location) {
		const parsed = parsePostGISPoint(shop.location);
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

// Keep initial payload lean; fall back to `*` if the schema drifts.
// Note: include `location` for robust lat/lng extraction (PostGIS).
const LITE_VENUE_COLUMNS =
	"id,slug,short_code,name,category,province,building,floor,phone,open_time,close_time,status,created_at,total_views,rating,review_count,location,latitude,longitude,image_urls,images,video_url,social_links,pin_type,pin_metadata,is_verified,verified_until,glow_until,boost_until,giant_until,visibility_score";

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
		const shopMap = ref(new Map()); // Quick lookup by ID
		const slugMap = ref(new Map()); // Quick lookup by slug (lowercased)
		const reviews = ref({});
		const collectedCoins = ref(new Set());
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

		// Rotation for randomization
		const rotationSeed = ref(Math.floor(Date.now() / 1800000));
		let rotationInterval = null;

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

					const coords = normalizeCoords(shop);
					if (!coords) return null;

					return {
						...shop,
						lat: coords.lat,
						lng: coords.lng,
						distance: calculateDistance(
							userLoc[0],
							userLoc[1],
							coords.lat,
							coords.lng,
						),
						randomKey:
							(idToSeed(shop.id) + rotationSeed.value * 1103515245) % 12345,
						Image_URL1:
							shop.Image_URL1 ||
							shop.image_urls?.[0] ||
							`https://placehold.co/600x400/1a1a2e/6366f1?text=${encodeURIComponent(shop.name || "Venue")}`,
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
				return [...live, ...top50].slice(0, 50);
			}

			return shops.slice(0, 100); // Limit for performance
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
			processedShops.value.filter((s) => s.distance < 5).slice(0, 20),
		);
		const liveShops = computed(() =>
			processedShops.value.filter((s) => s.status === "LIVE"),
		);

		// ═══════════════════════════════════════════
		// 🔄 Actions
		// ═══════════════════════════════════════════
		const venueDetailInFlight = new Map();
		const venueDetailLoaded = new Set();

		const fetchShops = async (force = false) => {
			if (import.meta.env.VITE_E2E === "true") {
				const data = buildE2eShops();
				rawShops.value = data;
				shopMap.value = new Map(data.map((s) => [normalizeId(s.id), s]));
				slugMap.value = new Map(
					data
						.map((s) => [normalizeSlug(s.slug), s])
						.filter(([slug]) => !!slug),
				);
				lastFetchTime.value = Date.now();
				isLoading.value = false;
				error.value = null;
				return;
			}

			// Cache check: refetch only if >5 min old
			if (
				!force &&
				lastFetchTime.value &&
				Date.now() - lastFetchTime.value < 300000
			) {
				if (import.meta.env.DEV) console.log("🏪 Using cached shops");
				return;
			}

			isLoading.value = true;
			error.value = null;

			try {
				await featureFlagStore.refreshFlags();
				if (featureFlagStore.isEnabled("use_v2_feed")) {
					try {
						await fetchShopsV2(force);
						return;
					} catch (v2Err) {
						// V2 feed RPC may not exist yet – fall through to standard query
						if (import.meta.env.DEV) {
							console.warn("🏪 V2 feed failed, falling back to standard query:", v2Err?.message || v2Err);
						}
					}
				}

				const fetchWithSelect = async (select) =>
					supabase.from("venues").select(select).order("created_at", {
						ascending: false,
					});

				let data = null;
				let err = null;

				({ data, error: err } = await fetchWithSelect(LITE_VENUE_COLUMNS));
				if (err) {
					if (import.meta.env.DEV) {
						console.warn(
							"🏪 Lite venues select failed; falling back to select('*'):",
							err?.message || err,
						);
					}
					({ data, error: err } = await fetchWithSelect("*"));
				}

				if (err) throw err;

				rawShops.value = data || [];
				shopMap.value = new Map(
					(data || []).map((s) => [normalizeId(s.id), s]),
				);
				slugMap.value = new Map(
					(data || [])
						.map((s) => [normalizeSlug(s.slug), s])
						.filter(([slug]) => !!slug),
				);
				lastFetchTime.value = Date.now();

				if (import.meta.env.DEV)
					console.log(`🏪 Fetched ${data?.length || 0} venues`);
			} catch (e) {
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
			const { data, error: err } = await supabase.rpc("get_feed_cards_v2", {
				p_lat: userLoc[0],
				p_lng: userLoc[1],
				p_limit: 50,
				p_offset: 0,
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
				distance_meters: s.distance_meters,
			}));

			rawShops.value = mapped;
			shopMap.value = new Map(mapped.map((s) => [normalizeId(s.id), s]));
			slugMap.value = new Map(
				mapped
					.map((s) => [normalizeSlug(s.slug), s])
					.filter(([slug]) => !!slug),
			);
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
				}));

				rawShops.value = mapped;
				shopMap.value = new Map(mapped.map((s) => [normalizeId(s.id), s]));
				slugMap.value = new Map(
					mapped
						.map((s) => [normalizeSlug(s.slug), s])
						.filter(([slug]) => !!slug),
				);
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

					const merged = { ...(existing || {}), ...data };
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

		const fetchShopReviews = async (shopId) => {
			try {
				const { data, error: err } = await supabase
					.from("reviews")
					.select("*")
					.eq("venue_id", shopId)
					.order("created_at", { ascending: false })
					.limit(50);

				if (err) throw err;
				reviews.value[String(shopId)] = data || [];
			} catch (e) {
				if (import.meta.env.DEV)
					console.error("❌ Failed to fetch reviews:", e);
			}
		};

		const addReview = async (shopId, review) => {
			try {
				const { data, error: err } = await supabase
					.from("reviews")
					.insert({ venue_id: shopId, ...review })
					.select()
					.single();

				if (err) throw err;
				if (!reviews.value[String(shopId)]) reviews.value[String(shopId)] = [];
				reviews.value[String(shopId)].unshift(data);
				return { success: true, data };
			} catch (e) {
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

			// Fire and forget with proper error handling
			try {
				await supabase.rpc("increment_venue_views", { venue_id: shopId });
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
		onUnmounted(stopRotationTimer);

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
						if (payload.eventType === "INSERT") {
							rawShops.value = [payload.new, ...rawShops.value];
						} else if (payload.eventType === "UPDATE") {
							const idx = rawShops.value.findIndex(
								(s) => s.id === payload.new.id,
							);
							if (idx >= 0)
								rawShops.value[idx] = {
									...rawShops.value[idx],
									...payload.new,
								};
						} else if (payload.eventType === "DELETE") {
							rawShops.value = rawShops.value.filter(
								(s) => s.id !== payload.old.id,
							);
						}
						shopMap.value = new Map(
							rawShops.value.map((s) => [normalizeId(s.id), s]),
						);
						slugMap.value = new Map(
							rawShops.value
								.map((s) => [normalizeSlug(s.slug), s])
								.filter(([slug]) => !!slug),
						);
					},
				)
				.subscribe();
		};

		const unsubscribe = () => subscription?.unsubscribe();

		const addCoin = (shopId) => {
			if (shopId === undefined || shopId === null) return;
			const next = new Set(collectedCoins.value);
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
				rawShops.value = s;
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
