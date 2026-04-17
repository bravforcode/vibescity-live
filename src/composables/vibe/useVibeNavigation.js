import {
	normalizeGiantPinPayload,
	resolveCanonicalBuilding,
	resolveVenueBuildingId,
} from "../../domain/venue/giantPinContext";

const LOCALE_PATH_PATTERN = /^\/(th|en)(\/|$)/;
const VENUE_ID_PATH_PATTERN = /^\/venue\/([^/]+)\/?$/;
const VENUE_SLUG_PATH_PATTERN = /^\/v\/([^/]+)\/?$/;

export const normalizeVenueId = (value) => {
	if (value === null || value === undefined) return null;
	const str = String(value).trim();
	return str ? str : null;
};

export const normalizeVenueSlug = (value) => {
	if (value === null || value === undefined) return null;
	const str = String(value).trim().toLowerCase();
	return str ? str : null;
};

export const stripLocalePrefix = (path) =>
	String(path || "").replace(/^\/(th|en)(?=\/)/, "");

export const getLocaleFromPath = (pathname) => {
	const match = String(pathname || "").match(LOCALE_PATH_PATTERN);
	return match ? match[1] : null;
};

export const getLocalePrefix = () => {
	if (typeof window === "undefined") return "/th";
	const fromPath = getLocaleFromPath(window.location.pathname);
	const stored =
		localStorage.getItem("locale") || localStorage.getItem("vibe_locale") || "";
	const resolved = fromPath || (stored === "en" ? "en" : "th");
	return `/${resolved}`;
};

export const withLocalePrefix = (path) => {
	const safe = path.startsWith("/") ? path : `/${path}`;
	if (safe === "/") return getLocalePrefix();
	const localePrefix = getLocalePrefix();
	if (safe.startsWith("/th/") || safe.startsWith("/en/")) return safe;
	return `${localePrefix}${safe}`;
};

export const getVenueRefFromPath = (pathname) => {
	if (typeof window === "undefined") return null;
	const safePath = pathname ?? window.location.pathname;
	const path = stripLocalePrefix(String(safePath || ""));

	const idMatch = path.match(VENUE_ID_PATH_PATTERN);
	if (idMatch) {
		return { kind: "id", value: normalizeVenueId(idMatch[1]) };
	}

	const slugMatch = path.match(VENUE_SLUG_PATH_PATTERN);
	if (slugMatch) {
		return { kind: "slug", value: normalizeVenueSlug(slugMatch[1]) };
	}

	return null;
};

export function useVibeNavigation(shopStore) {
	const getPreferredVenuePath = (shopId) => {
		const normalizedId = normalizeVenueId(shopId);
		if (!normalizedId) return null;

		let shop = null;
		if (shopStore && typeof shopStore.getShopById === "function") {
			shop = shopStore.getShopById(normalizedId);
		}

		const slug = normalizeVenueSlug(shop?.slug);
		if (slug) return withLocalePrefix(`/v/${encodeURIComponent(slug)}`);
		return withLocalePrefix(`/venue/${encodeURIComponent(normalizedId)}`);
	};

	const syncVenueUrl = (shopId, { replace = true } = {}) => {
		if (typeof window === "undefined") return;
		const normalizedId = normalizeVenueId(shopId);
		if (!normalizedId) return;

		const targetPath =
			getPreferredVenuePath(normalizedId) ||
			withLocalePrefix(`/venue/${encodeURIComponent(normalizedId)}`);

		const currentPath = window.location.pathname;
		if (currentPath === targetPath) return;
		if (replace) window.history.replaceState({}, "", targetPath);
		else window.history.pushState({}, "", targetPath);
	};

	const redirectToHome = () => {
		if (typeof window === "undefined") return false;
		const targetPath = withLocalePrefix("/");
		const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
		if (currentPath === targetPath) return false;
		window.history.replaceState({}, "", targetPath);
		return true;
	};

	return {
		getLocalePrefix,
		withLocalePrefix,
		getVenueRefFromPath,
		getPreferredVenuePath,
		syncVenueUrl,
		redirectToHome,
		normalizeVenueId,
		normalizeVenueSlug,
	};
}
