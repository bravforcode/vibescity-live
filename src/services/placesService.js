/**
 * VibeCity Places Service
 * ดึงข้อมูลสถานที่แบบ Real-time จาก OpenStreetMap และ Google Places
 */

const CACHE_DURATION = 60 * 60 * 1000; // 1 hour
const placesCache = new Map();

// Province center coordinates for search
const PROVINCE_CENTERS = {
	// Northern
	เชียงใหม่: { lat: 18.7883, lng: 98.9853, name_en: "Chiang Mai" },
	เชียงราย: { lat: 19.9105, lng: 99.8406, name_en: "Chiang Rai" },
	ลำปาง: { lat: 18.2888, lng: 99.4908, name_en: "Lampang" },
	ลำพูน: { lat: 18.5748, lng: 99.0087, name_en: "Lamphun" },
	แม่ฮ่องสอน: { lat: 19.302, lng: 97.9654, name_en: "Mae Hong Son" },
	น่าน: { lat: 18.7756, lng: 100.773, name_en: "Nan" },
	พะเยา: { lat: 19.1662, lng: 99.9022, name_en: "Phayao" },
	แพร่: { lat: 18.1446, lng: 100.1403, name_en: "Phrae" },
	อุตรดิตถ์: { lat: 17.6201, lng: 100.0993, name_en: "Uttaradit" },

	// Northeastern (Isan)
	อำนาจเจริญ: { lat: 15.8617, lng: 104.6225, name_en: "Amnat Charoen" },
	บึงกาฬ: { lat: 18.3619, lng: 103.6464, name_en: "Bueng Kan" },
	บุรีรัมย์: { lat: 14.993, lng: 103.1029, name_en: "Buriram" },
	ชัยภูมิ: { lat: 15.8105, lng: 102.0289, name_en: "Chaiyaphum" },
	กาฬสินธุ์: { lat: 16.4293, lng: 103.5065, name_en: "Kalasin" },
	ขอนแก่น: { lat: 16.4322, lng: 102.8236, name_en: "Khon Kaen" },
	เลย: { lat: 17.486, lng: 101.7223, name_en: "Loei" },
	มหาสารคาม: { lat: 16.185, lng: 103.3006, name_en: "Maha Sarakham" },
	มุกดาหาร: { lat: 16.5436, lng: 104.7046, name_en: "Mukdahan" },
	นครพนม: { lat: 17.4069, lng: 104.7818, name_en: "Nakhon Phanom" },
	นครราชสีมา: { lat: 14.9799, lng: 102.0978, name_en: "Nakhon Ratchasima" },
	หนองบัวลำภู: { lat: 17.2029, lng: 102.434, name_en: "Nong Bua Lamphu" },
	หนองคาย: { lat: 17.8785, lng: 102.742, name_en: "Nong Khai" },
	ร้อยเอ็ด: { lat: 16.0537, lng: 103.652, name_en: "Roi Et" },
	สกลนคร: { lat: 17.1546, lng: 104.1487, name_en: "Sakon Nakhon" },
	ศรีสะเกษ: { lat: 15.1186, lng: 104.322, name_en: "Sisaket" },
	สุรินทร์: { lat: 14.8818, lng: 103.4936, name_en: "Surin" },
	อุบลราชธานี: { lat: 15.2448, lng: 104.8473, name_en: "Ubon Ratchathani" },
	อุดรธานี: { lat: 17.4156, lng: 102.7872, name_en: "Udon Thani" },
	ยโสธร: { lat: 15.7924, lng: 104.145, name_en: "Yasothon" },

	// Central
	อ่างทอง: { lat: 14.5896, lng: 100.4551, name_en: "Ang Thong" },
	พระนครศรีอยุธยา: { lat: 14.3532, lng: 100.5684, name_en: "Ayutthaya" },
	กรุงเทพฯ: { lat: 13.7563, lng: 100.5018, name_en: "Bangkok" },
	ชัยนาท: { lat: 15.1848, lng: 100.1253, name_en: "Chai Nat" },
	กำแพงเพชร: { lat: 16.4828, lng: 99.5227, name_en: "Kamphaeng Phet" },
	ลพบุรี: { lat: 14.7995, lng: 100.6533, name_en: "Lopburi" },
	นครนายก: { lat: 14.2069, lng: 101.2131, name_en: "Nakhon Nayok" },
	นครปฐม: { lat: 13.8198, lng: 100.0602, name_en: "Nakhon Pathom" },
	นครสวรรค์: { lat: 15.7042, lng: 100.1372, name_en: "Nakhon Sawan" },
	นนทบุรี: { lat: 13.8621, lng: 100.514, name_en: "Nonthaburi" },
	ปทุมธานี: { lat: 14.0208, lng: 100.525, name_en: "Pathum Thani" },
	เพชรบูรณ์: { lat: 16.419, lng: 101.1567, name_en: "Phetchabun" },
	พิจิตร: { lat: 16.4419, lng: 100.3488, name_en: "Phichit" },
	พิษณุโลก: { lat: 16.8211, lng: 100.2659, name_en: "Phitsanulok" },
	สมุทรปราการ: { lat: 13.5991, lng: 100.5968, name_en: "Samut Prakan" },
	สมุทรสาคร: { lat: 13.5475, lng: 100.2836, name_en: "Samut Sakhon" },
	สมุทรสงคราม: { lat: 13.4098, lng: 100.0023, name_en: "Samut Songkhram" },
	สระบุรี: { lat: 14.5289, lng: 100.9108, name_en: "Saraburi" },
	สิงห์บุรี: { lat: 14.891, lng: 100.3957, name_en: "Sing Buri" },
	สุโขทัย: { lat: 17.0044, lng: 99.8264, name_en: "Sukhothai" },
	สุพรรณบุรี: { lat: 14.4745, lng: 100.1177, name_en: "Suphan Buri" },
	อุทัยธานี: { lat: 15.3831, lng: 100.0247, name_en: "Uthai Thani" },

	// Eastern
	ฉะเชิงเทรา: { lat: 13.6961, lng: 101.0743, name_en: "Chachoengsao" },
	จันทบุรี: { lat: 12.6114, lng: 102.1039, name_en: "Chanthaburi" },
	ชลบุรี: { lat: 13.3611, lng: 100.9847, name_en: "Chonburi" },
	พัทยา: { lat: 12.9236, lng: 100.8825, name_en: "Pattaya" }, // Special administrative city
	ปราจีนบุรี: { lat: 14.0509, lng: 101.3716, name_en: "Prachinburi" },
	ระยอง: { lat: 12.6815, lng: 101.2816, name_en: "Rayong" },
	สระแก้ว: { lat: 13.805, lng: 102.0543, name_en: "Sa Kaeo" },
	ตราด: { lat: 12.2378, lng: 102.5171, name_en: "Trat" },

	// Western
	กาญจนบุรี: { lat: 14.0226, lng: 99.5327, name_en: "Kanchanaburi" },
	เพชรบุรี: { lat: 13.109, lng: 99.9398, name_en: "Phetchaburi" },
	ประจวบคีรีขันธ์: {
		lat: 11.8253,
		lng: 99.7899,
		name_en: "Prachuap Khiri Khan",
	},
	หัวหิน: { lat: 12.5684, lng: 99.9577, name_en: "Hua Hin" }, // Important district
	ราชบุรี: { lat: 13.5358, lng: 99.8164, name_en: "Ratchaburi" },
	ตาก: { lat: 16.8901, lng: 99.117, name_en: "Tak" },

	// Southern
	ชุมพร: { lat: 10.493, lng: 99.1717, name_en: "Chumphon" },
	กระบี่: { lat: 8.0863, lng: 98.9063, name_en: "Krabi" },
	นครศรีธรรมราช: { lat: 8.431, lng: 99.9631, name_en: "Nakhon Si Thammarat" },
	นราธิวาส: { lat: 6.4255, lng: 101.8253, name_en: "Narathiwat" },
	ปัตตานี: { lat: 6.8696, lng: 101.2501, name_en: "Pattani" },
	พังงา: { lat: 8.4506, lng: 98.5267, name_en: "Phang Nga" },
	พัทลุง: { lat: 7.6166, lng: 100.074, name_en: "Phatthalung" },
	ภูเก็ต: { lat: 7.8804, lng: 98.3923, name_en: "Phuket" },
	ระนอง: { lat: 9.9658, lng: 98.6348, name_en: "Ranong" },
	สตูล: { lat: 6.611, lng: 100.0674, name_en: "Satun" },
	สงขลา: { lat: 7.1756, lng: 100.6142, name_en: "Songkhla" },
	สุราษฎร์ธานี: { lat: 9.1382, lng: 99.3217, name_en: "Surat Thani" },
	ตรัง: { lat: 7.5574, lng: 99.6106, name_en: "Trang" },
	ยะลา: { lat: 6.5401, lng: 101.2804, name_en: "Yala" },
};

// Category mapping for OSM tags
const OSM_CATEGORY_MAP = {
	"amenity=bar": { category: "Bar", color: "#9B59B6" },
	"amenity=pub": { category: "Bar", color: "#9B59B6" },
	"amenity=nightclub": { category: "Nightclub", color: "#9B59B6" },
	"amenity=cafe": { category: "Cafe", color: "#8B4513" },
	"amenity=restaurant": { category: "Restaurant", color: "#E74C3C" },
	"amenity=fast_food": { category: "Restaurant", color: "#E74C3C" },
	"tourism=attraction": { category: "Attraction", color: "#F39C12" },
	"tourism=museum": { category: "Attraction", color: "#F39C12" },
	"tourism=viewpoint": { category: "Viewpoint", color: "#27AE60" },
	"shop=mall": { category: "Shopping Mall", color: "#3498DB" },
	"shop=department_store": { category: "Shopping Mall", color: "#3498DB" },
	"amenity=marketplace": { category: "Market", color: "#F39C12" },
	"natural=beach": { category: "Beach", color: "#2ECC71" },
	"amenity=place_of_worship": { category: "Temple", color: "#F39C12" },
	"leisure=park": { category: "Park", color: "#27AE60" },
	"leisure=water_park": { category: "Attraction", color: "#27AE60" },
};

/**
 * Fetch places from OpenStreetMap Overpass API
 * Free and comprehensive data source
 */
export async function fetchFromOpenStreetMap(province, radius = 10000) {
	const center = PROVINCE_CENTERS[province];
	if (!center) {
		console.log(`[PlacesService] No center coordinates for ${province}`);
		return [];
	}

	const cacheKey = `osm-${province}`;
	const cached = placesCache.get(cacheKey);
	if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
		return cached.data;
	}

	try {
		const query = `
      [out:json][timeout:25];
      (
        node["amenity"~"bar|pub|nightclub|cafe|restaurant"](around:${radius},${center.lat},${center.lng});
        node["tourism"~"attraction|museum|viewpoint"](around:${radius},${center.lat},${center.lng});
        node["shop"~"mall|department_store"](around:${radius},${center.lat},${center.lng});
        node["amenity"="marketplace"](around:${radius},${center.lat},${center.lng});
        node["natural"="beach"](around:${radius},${center.lat},${center.lng});
        node["amenity"="place_of_worship"]["religion"="buddhist"](around:${radius},${center.lat},${center.lng});
      );
      out body;
    `;

		const response = await fetch("https://overpass-api.de/api/interpreter", {
			method: "POST",
			body: `data=${encodeURIComponent(query)}`,
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
			},
		});

		const data = await response.json();
		const places = data.elements
			.map(transformOSMPlace)
			.filter((p) => p !== null);

		placesCache.set(cacheKey, { data: places, timestamp: Date.now() });

		return places;
	} catch (error) {
		console.error("[PlacesService] OSM fetch error:", error);
		return [];
	}
}

/**
 * Transform OSM place to VibeCity format
 */
function transformOSMPlace(osmPlace) {
	const { id, lat, lon, tags = {} } = osmPlace;

	// Find matching category
	let categoryInfo = { category: "Other", color: "#95A5A6" };
	for (const [osmTag, info] of Object.entries(OSM_CATEGORY_MAP)) {
		const [key, value] = osmTag.split("=");
		if (tags[key] === value) {
			categoryInfo = info;
			break;
		}
	}

	const name = tags.name || tags["name:th"] || tags["name:en"];
	if (!name) return null;

	return {
		id: `osm-${id}`,
		name: name,
		name_en: tags["name:en"] || name,
		category: categoryInfo.category,
		category_color: categoryInfo.color,
		latitude: lat,
		longitude: lon,
		open_time: tags.opening_hours?.split("-")[0] || null,
		close_time: tags.opening_hours?.split("-")[1] || null,
		phone: tags.phone || tags["contact:phone"] || null,
		website: tags.website || tags["contact:website"] || null,
		address:
			tags["addr:full"] ||
			`${tags["addr:street"] || ""} ${tags["addr:city"] || ""}`.trim() ||
			null,
		source: "openstreetmap",
		fetched_at: new Date().toISOString(),
	};
}

/**
 * Fetch places from Google Places API (requires API key)
 */
export async function fetchFromGooglePlaces(
	province,
	apiKey,
	types = ["restaurant", "bar", "cafe", "tourist_attraction"],
) {
	if (!apiKey) {
		console.log("[PlacesService] No Google API key provided");
		return [];
	}

	const center = PROVINCE_CENTERS[province];
	if (!center) return [];

	const cacheKey = `google-${province}`;
	const cached = placesCache.get(cacheKey);
	if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
		return cached.data;
	}

	try {
		const allPlaces = [];

		for (const type of types) {
			const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${center.lat},${center.lng}&radius=10000&type=${type}&language=th&key=${apiKey}`;

			const response = await fetch(url);
			const data = await response.json();

			if (data.results) {
				const places = data.results.map(transformGooglePlace);
				allPlaces.push(...places);
			}

			// Respect rate limits
			await new Promise((r) => setTimeout(r, 200));
		}

		placesCache.set(cacheKey, { data: allPlaces, timestamp: Date.now() });

		return allPlaces;
	} catch (error) {
		console.error("[PlacesService] Google Places fetch error:", error);
		return [];
	}
}

/**
 * Transform Google Place to VibeCity format
 */
function transformGooglePlace(googlePlace) {
	const categoryMap = {
		bar: { category: "Bar", color: "#9B59B6" },
		night_club: { category: "Nightclub", color: "#9B59B6" },
		cafe: { category: "Cafe", color: "#8B4513" },
		restaurant: { category: "Restaurant", color: "#E74C3C" },
		tourist_attraction: { category: "Attraction", color: "#F39C12" },
		shopping_mall: { category: "Shopping Mall", color: "#3498DB" },
		park: { category: "Park", color: "#27AE60" },
	};

	const type = googlePlace.types?.find((t) => categoryMap[t]);
	const categoryInfo = type
		? categoryMap[type]
		: { category: "Other", color: "#95A5A6" };

	return {
		id: `google-${googlePlace.place_id}`,
		name: googlePlace.name,
		category: categoryInfo.category,
		category_color: categoryInfo.color,
		latitude: googlePlace.geometry.location.lat,
		longitude: googlePlace.geometry.location.lng,
		rating: googlePlace.rating,
		user_ratings_total: googlePlace.user_ratings_total,
		price_level: googlePlace.price_level,
		open_now: googlePlace.opening_hours?.open_now,
		photo_reference: googlePlace.photos?.[0]?.photo_reference,
		vicinity: googlePlace.vicinity,
		source: "google_places",
		fetched_at: new Date().toISOString(),
	};
}

/**
 * Get popular places for a province (combines sources)
 */
export async function getPopularPlaces(province, options = {}) {
	const { googleApiKey = null, limit = 50, category = null } = options;

	// Fetch from available sources
	const [osmPlaces, googlePlaces] = await Promise.all([
		fetchFromOpenStreetMap(province),
		googleApiKey
			? fetchFromGooglePlaces(province, googleApiKey)
			: Promise.resolve([]),
	]);

	// Combine and deduplicate (by proximity)
	let allPlaces = [...osmPlaces, ...googlePlaces];

	// Filter by category if specified
	if (category) {
		allPlaces = allPlaces.filter((p) => p.category === category);
	}

	// Sort by rating if available
	allPlaces.sort((a, b) => (b.rating || 0) - (a.rating || 0));

	return allPlaces.slice(0, limit);
}

/**
 * Search places by name
 */
export async function searchPlaces(query, province = null) {
	const searchResults = [];

	// If province specified, search in that province
	// Otherwise search all cached data

	if (province) {
		const places = await getPopularPlaces(province);
		const queryLower = query.toLowerCase();

		return places.filter(
			(p) =>
				p.name.toLowerCase().includes(queryLower) ||
				p.category.toLowerCase().includes(queryLower),
		);
	}

	// Search all cached
	for (const [key, value] of placesCache.entries()) {
		if (value.data) {
			const queryLower = query.toLowerCase();
			const matches = value.data.filter((p) =>
				p.name.toLowerCase().includes(queryLower),
			);
			searchResults.push(...matches);
		}
	}

	return searchResults;
}

/**
 * Clear places cache
 */
export function clearPlacesCache() {
	placesCache.clear();
	console.log("[PlacesService] Cache cleared");
}

/**
 * Get cache stats
 */
export function getCacheStats() {
	const stats = {};
	for (const [key, value] of placesCache.entries()) {
		stats[key] = {
			count: value.data?.length || 0,
			age: Date.now() - value.timestamp,
			ageMinutes: Math.round((Date.now() - value.timestamp) / 60000),
		};
	}
	return stats;
}

export { OSM_CATEGORY_MAP, PROVINCE_CENTERS };
