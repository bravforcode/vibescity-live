import { computed, onUnmounted, ref, watch } from "vue";
import { useLocationStore } from "../../store/locationStore";

// Inline Worker for Fuzzy Search and Distance Calculation
const searchWorkerCode = `
  const emojiAliasMap = {
    "☕": "cafe coffee",
    "🍽️": "restaurant dining",
    "🍜": "food noodle",
    "🍺": "bar beer",
    "🍷": "wine cocktail",
    "💃": "club nightlife dance",
    "🎵": "live music",
    "🎨": "art gallery",
    "🛍️": "fashion shopping",
    "🏢": "mall shopping center",
    "🏨": "hotel accommodation",
    "🛏️": "hostel accommodation",
    "🕌": "temple",
  };

  const expandEmojiAliases = (value) => {
    let next = String(value || "");
    for (const [emoji, alias] of Object.entries(emojiAliasMap)) {
      if (next.includes(emoji)) {
        next = next.split(emoji).join(\` \${alias} \`);
      }
    }
    return next;
  };

  const normalizeSearchText = (value) =>
    String(value || "")
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[\\u200B-\\u200D\\uFEFF]/g, "")
      .replace(/[^a-z0-9\\u0E00-\\u0E7F\\s]/gi, " ")
      .replace(/\\s+/g, " ")
      .trim();

  const tokenizeSearchText = (value) => normalizeSearchText(value).split(" ").filter(Boolean);

  const editDistanceWithin = (a, b, maxDistance = 2) => {
    const left = String(a || "");
    const right = String(b || "");
    if (!left || !right) return Number.POSITIVE_INFINITY;
    if (Math.abs(left.length - right.length) > maxDistance) return Number.POSITIVE_INFINITY;

    const rows = left.length + 1;
    const cols = right.length + 1;
    const dp = Array.from({ length: rows }, () => Array(cols).fill(0));
    for (let i = 0; i < rows; i += 1) dp[i][0] = i;
    for (let j = 0; j < cols; j += 1) dp[0][j] = j;

    for (let i = 1; i < rows; i += 1) {
      let rowMin = Number.POSITIVE_INFINITY;
      for (let j = 1; j < cols; j += 1) {
        const cost = left[i - 1] === right[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
        rowMin = Math.min(rowMin, dp[i][j]);
      }
      if (rowMin > maxDistance) return Number.POSITIVE_INFINITY;
    }
    return dp[rows - 1][cols - 1];
  };

  const tokenMatchesWord = (token, word) => {
    if (!token || !word) return false;
    if (word.startsWith(token) || word.includes(token)) return true;
    if (token.length < 4) return false;
    const maxDistance = token.length >= 7 ? 2 : 1;
    return editDistanceWithin(token, word, maxDistance) <= maxDistance;
  };

  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const scoreSearchMatch = (shop, normalizedQuery, queryTokens) => {
    const name = normalizeSearchText(shop?.name || "");
    const category = normalizeSearchText(shop?.category || "");
    const description = normalizeSearchText(shop?.description || shop?.vibeTag || shop?.crowdInfo || "");
    const locationMeta = normalizeSearchText(
      [shop?.zone || shop?.Zone, shop?.district || shop?.District, shop?.province || shop?.Province, shop?.building || shop?.Building, shop?.floor || shop?.Floor, shop?.slug]
        .filter(Boolean).join(" ")
    );
    const corpus = normalizeSearchText([name, category, description, locationMeta].filter(Boolean).join(" "));
    if (!corpus) return null;

    let score = 0;
    let matchedTokens = 0;
    let unmatchedTokens = 0;
    const corpusWords = corpus.split(" ").filter(Boolean);

    if (name.includes(normalizedQuery)) score += 220;
    else if (corpus.includes(normalizedQuery)) score += 120;

    for (const token of queryTokens) {
      if (!token) continue;
      let matched = false;
      if (name.includes(token)) {
        score += name.startsWith(token) ? 100 : 88;
        matched = true;
      } else if (category.includes(token)) {
        score += 70;
        matched = true;
      } else if (description.includes(token)) {
        score += 48;
        matched = true;
      } else if (locationMeta.includes(token)) {
        score += 52;
        matched = true;
      } else if (corpusWords.some((word) => tokenMatchesWord(token, word))) {
        score += 30;
        matched = true;
      }

      if (matched) matchedTokens += 1;
      else if (token.length > 1) unmatchedTokens += 1;
    }

    const mismatchThreshold = Math.ceil(queryTokens.length * 0.5);
    if (matchedTokens === 0 || unmatchedTokens > mismatchThreshold) return null;
    if (String(shop?.status || "").toUpperCase() === "LIVE") score += 12;
    if (shop?.is_verified || shop?.verifiedActive) score += 8;

    return { score, matchedTokens };
  };

  self.onmessage = function (e) {
    const { query, shops, userLat, userLng } = e.data;
    performance.mark('vc:search_latency_start');

    const expandedQuery = expandEmojiAliases(query);
    const normalizedQuery = normalizeSearchText(expandedQuery);
    
    if (!normalizedQuery) {
      self.postMessage({ results: [] });
      return;
    }

    const queryTokens = tokenizeSearchText(normalizedQuery);
    if (!queryTokens.length) {
      self.postMessage({ results: [] });
      return;
    }

    const hasUserLocation = userLat !== null && userLng !== null;

    const scored = shops.map((shop) => {
      const match = scoreSearchMatch(shop, normalizedQuery, queryTokens);
      if (!match) return null;

      let distance = Number.POSITIVE_INFINITY;
      if (hasUserLocation && Number.isFinite(Number(shop?.lat)) && Number.isFinite(Number(shop?.lng))) {
        distance = calculateDistance(userLat, userLng, Number(shop.lat), Number(shop.lng));
      }
      const proximityBoost = Number.isFinite(distance) ? Math.max(0, 24 - Math.min(distance, 24)) : 0;

      return {
        ...shop,
        distance,
        searchScore: match.score + proximityBoost,
        searchMatchedTokens: match.matchedTokens,
      };
    }).filter(Boolean);

    const results = scored.sort((a, b) => {
      if (b.searchScore !== a.searchScore) return b.searchScore - a.searchScore;
      if (a.distance !== b.distance) return a.distance - b.distance;
      return (a.name || "").localeCompare(b.name || "");
    }).slice(0, 30);

    performance.mark('vc:search_latency_end');
    performance.measure('vc:search_latency', 'vc:search_latency_start', 'vc:search_latency_end');
    
    self.postMessage({ results });
  };
`;

let workerInstance = null;

const createWorker = () => {
	if (typeof window === "undefined" || workerInstance) return workerInstance;
	try {
		const blob = new Blob([searchWorkerCode], {
			type: "application/javascript",
		});
		const workerUrl = URL.createObjectURL(blob);
		workerInstance = new Worker(workerUrl);
	} catch (err) {
		console.warn("Could not inline Web Worker for search, falling back.", err);
	}
	return workerInstance;
};

export function useVibeSearch(shopsRef) {
	const globalSearchQuery = ref("");
	const globalSearchResults = ref([]);
	const isSearching = ref(false);
	const locationStore = useLocationStore();

	let debounceTimeout = null;

	const performSearch = (query) => {
		if (!query.trim()) {
			globalSearchResults.value = [];
			isSearching.value = false;
			return;
		}

		isSearching.value = true;

		let userLat = null;
		let userLng = null;

		if (
			Array.isArray(locationStore.userLocation) &&
			Number.isFinite(Number(locationStore.userLocation[0])) &&
			Number.isFinite(Number(locationStore.userLocation[1]))
		) {
			userLat = Number(locationStore.userLocation[0]);
			userLng = Number(locationStore.userLocation[1]);
		}

		const worker = createWorker();

		if (worker) {
			worker.onmessage = (e) => {
				globalSearchResults.value = e.data.results || [];
				isSearching.value = false;
			};

			// Passing raw array to worker requires serialization, so we only pass needed data
			// Cloning limits main thread impact
			const lightweightShops = shopsRef.value.map((s) => ({
				id: s.id,
				name: s.name,
				category: s.category,
				description: s.description,
				vibeTag: s.vibeTag,
				crowdInfo: s.crowdInfo,
				zone: s.zone,
				Zone: s.Zone,
				district: s.district,
				District: s.District,
				province: s.province,
				Province: s.Province,
				building: s.building,
				Building: s.Building,
				floor: s.floor,
				Floor: s.Floor,
				slug: s.slug,
				lat: s.lat,
				lng: s.lng,
				status: s.status,
				is_verified: s.is_verified,
				verifiedActive: s.verifiedActive,
			}));

			worker.postMessage({
				query,
				shops: lightweightShops,
				userLat,
				userLng,
			});
		} else {
			// Fallback if worker fails (can be implemented later or ignored if stable)
			isSearching.value = false;
		}
	};

	watch(
		[globalSearchQuery, shopsRef],
		([newQuery]) => {
			if (debounceTimeout) clearTimeout(debounceTimeout);
			debounceTimeout = setTimeout(() => {
				performSearch(newQuery);
			}, 150);
		},
		{ immediate: true },
	);

	onUnmounted(() => {
		if (debounceTimeout) clearTimeout(debounceTimeout);
	});

	return {
		globalSearchQuery,
		globalSearchResults,
		isSearching,
	};
}
