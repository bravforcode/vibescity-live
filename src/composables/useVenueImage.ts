/**
 * useVenueImage — Returns the best available image URL for a venue/shop.
 * Priority: shop.Image_URL1 > category gradient placeholder
 */

const CATEGORY_GRADIENTS: Record<string, string> = {
	// Food & Drink
	restaurant: "linear-gradient(135deg,#f97316,#ea580c)",
	cafe: "linear-gradient(135deg,#a16207,#78350f)",
	bar: "linear-gradient(135deg,#7c3aed,#4c1d95)",
	bakery: "linear-gradient(135deg,#f59e0b,#92400e)",
	coffee: "linear-gradient(135deg,#78350f,#451a03)",

	// Entertainment
	club: "linear-gradient(135deg,#e11d48,#831843)",
	nightclub: "linear-gradient(135deg,#9333ea,#581c87)",
	cinema: "linear-gradient(135deg,#1d4ed8,#1e3a8a)",
	karaoke: "linear-gradient(135deg,#ec4899,#9d174d)",

	// Retail
	shop: "linear-gradient(135deg,#0891b2,#164e63)",
	market: "linear-gradient(135deg,#16a34a,#14532d)",
	mall: "linear-gradient(135deg,#6366f1,#312e81)",
	boutique: "linear-gradient(135deg,#db2777,#831843)",
	clothing: "linear-gradient(135deg,#0e7490,#164e63)",

	// Health & Beauty
	spa: "linear-gradient(135deg,#0d9488,#134e4a)",
	salon: "linear-gradient(135deg,#c026d3,#701a75)",
	gym: "linear-gradient(135deg,#dc2626,#7f1d1d)",
	wellness: "linear-gradient(135deg,#059669,#064e3b)",

	// Services
	hotel: "linear-gradient(135deg,#b45309,#451a03)",
	hostel: "linear-gradient(135deg,#f59e0b,#78350f)",

	// Default
	default: "linear-gradient(135deg,#6366f1,#8b5cf6)",
};

const CATEGORY_ICONS: Record<string, string> = {
	restaurant: "🍽️",
	cafe: "☕",
	bar: "🍸",
	bakery: "🥐",
	coffee: "☕",
	club: "🎵",
	nightclub: "🎉",
	cinema: "🎬",
	karaoke: "🎤",
	shop: "🛍️",
	market: "🛒",
	mall: "🏬",
	boutique: "👗",
	clothing: "👔",
	spa: "💆",
	salon: "💇",
	gym: "💪",
	wellness: "🌿",
	hotel: "🏨",
	hostel: "🛏️",
	default: "📍",
};

function normalizeCategory(category: string | null | undefined): string {
	if (!category) return "default";
	const lower = category.toLowerCase().trim();
	for (const key of Object.keys(CATEGORY_GRADIENTS)) {
		if (key !== "default" && lower.includes(key)) return key;
	}
	return "default";
}

export interface VenueImageResult {
	hasRealImage: boolean;
	imageUrl: string | null;
	placeholderGradient: string;
	placeholderIcon: string;
}

export function useVenueImage(shop: {
	Image_URL1?: string | null;
	category?: string | null;
}): VenueImageResult {
	const hasRealImage = Boolean(shop?.Image_URL1);
	const cat = normalizeCategory(shop?.category);
	return {
		hasRealImage,
		imageUrl: shop?.Image_URL1 ?? null,
		placeholderGradient: CATEGORY_GRADIENTS[cat],
		placeholderIcon: CATEGORY_ICONS[cat],
	};
}
