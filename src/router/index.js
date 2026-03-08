import { createRouter, createWebHistory } from "vue-router";
import { setClientCookie } from "../lib/cookies";

// Lazy load views for performance
const HomeView = () => import("../views/HomeView.vue");
const PrivacyView = () => import("../views/PrivacyView.vue");
const TermsView = () => import("../views/TermsView.vue");
// Use the polished OwnerDashboard component as the view
const MerchantDashboard = () =>
	import("../components/dashboard/OwnerDashboard.vue");
const PartnerDashboard = () => import("../views/PartnerDashboard.vue");

const routes = [
	// Locale-aware public routes
	{
		path: "/:locale(th|en)",
		name: "HomeLocale",
		component: HomeView,
		meta: { title: "VibeCity - Thailand Entertainment" },
	},
	{
		path: "/:locale(th|en)/venue/:id",
		name: "VenueLocale",
		component: HomeView,
		meta: { title: "VibeCity - Venue" },
	},
	{
		path: "/:locale(th|en)/v/:slug",
		name: "VenueSlugLocale",
		component: HomeView,
		meta: { title: "VibeCity - Venue" },
	},
	{
		path: "/:locale(th|en)/c/:category",
		name: "CategoryLocale",
		component: HomeView,
		meta: { title: "VibeCity - Category" },
	},
	{
		path: "/:locale(th|en)/privacy",
		name: "PrivacyLocale",
		component: PrivacyView,
		meta: { title: "Privacy Policy - VibeCity" },
	},
	{
		path: "/:locale(th|en)/terms",
		name: "TermsLocale",
		component: TermsView,
		meta: { title: "Terms of Service - VibeCity" },
	},
	{
		path: "/:locale(th|en)/partner",
		name: "PartnerLocale",
		component: PartnerDashboard,
		meta: { title: "Partner Dashboard - VibeCity", requiredRole: "partner" },
	},
	{
		path: "/:locale(th|en)/merchant",
		name: "MerchantLocale",
		component: MerchantDashboard,
		meta: { title: "Merchant Portal - VibeCity", requiredRole: "owner" },
	},

	// Legacy (non-locale) public routes for dev fallback
	{
		path: "/",
		name: "Home",
		component: HomeView,
		meta: { title: "VibeCity - Thailand Entertainment", legacyLocale: true },
	},
	{
		path: "/venue/:id",
		name: "Venue",
		component: HomeView,
		meta: { title: "VibeCity - Venue", legacyLocale: true },
	},
	{
		path: "/v/:slug",
		name: "VenueSlug",
		component: HomeView,
		meta: { title: "VibeCity - Venue", legacyLocale: true },
	},
	{
		path: "/c/:category",
		name: "Category",
		component: HomeView,
		meta: { title: "VibeCity - Category", legacyLocale: true },
	},
	{
		path: "/privacy",
		name: "Privacy",
		component: PrivacyView,
		meta: { title: "Privacy Policy - VibeCity", legacyLocale: true },
	},
	{
		path: "/terms",
		name: "Terms",
		component: TermsView,
		meta: { title: "Terms of Service - VibeCity", legacyLocale: true },
	},
	{
		path: "/partner",
		name: "PartnerDashboard",
		component: PartnerDashboard,
		meta: {
			title: "Partner Dashboard - VibeCity",
			legacyLocale: true,
			requiredRole: "partner",
		},
	},

	// Legacy shop route redirect
	{
		path: "/shop/:id",
		redirect: (to) => `/venue/${to.params.id}`,
	},
	{
		path: "/merchant",
		name: "MerchantDashboard",
		component: MerchantDashboard,
		meta: {
			title: "Merchant Portal - VibeCity",
			requiredRole: "owner",
		},
	},
	{
		path: "/admin",
		name: "AdminDashboard",
		component: () => import("../views/AdminView.vue"),
		meta: {
			title: "Admin - VibeCity",
			requiresAuth: true,
			requiresAdmin: true,
		},
	},
	{
		path: "/admin-signin",
		name: "AdminSignIn",
		component: () => import("../views/AdminView.vue"),
		meta: {
			title: "Admin Sign In - VibeCity",
		},
	},

	// 404 Fallback
	{
		path: "/:pathMatch(.*)*",
		redirect: "/",
	},
];

const router = createRouter({
	history: createWebHistory(),
	routes,
	scrollBehavior(_to, _from, savedPosition) {
		if (savedPosition) return savedPosition;
		return { top: 0 };
	},
});

const LOCALE_COOKIE = "vibe_locale";
const SUPPORTED_LOCALES = new Set(["th", "en"]);

const readCookie = (name) => {
	if (typeof document === "undefined") return "";
	const target = `${name}=`;
	return document.cookie
		.split(";")
		.map((c) => c.trim())
		.filter((c) => c.startsWith(target))
		.map((c) => c.slice(target.length))[0];
};

const setLocaleCookie = (locale) => {
	setClientCookie(LOCALE_COOKIE, locale, {
		maxAgeSeconds: 60 * 60 * 24 * 365,
	});
};

const getPreferredLocale = () => {
	if (typeof window !== "undefined") {
		const stored = localStorage.getItem("locale") || readCookie(LOCALE_COOKIE);
		if (SUPPORTED_LOCALES.has(stored)) return stored;
	}
	return "en";
};

const localeFromPath = (path) => {
	const match = String(path || "").match(/^\/(th|en)(\/|$)/);
	return match ? match[1] : null;
};

const isMerchantPath = (path) =>
	path.startsWith("/merchant") || /^\/(th|en)\/merchant(\/|$)/.test(path);

const isPublicPath = (path) =>
	path === "/" ||
	path.startsWith("/v/") ||
	path.startsWith("/venue/") ||
	path.startsWith("/c/") ||
	path === "/privacy" ||
	path === "/terms";

const setLocale = async (locale) => {
	if (!SUPPORTED_LOCALES.has(locale)) return;
	const { default: i18n } = await import("../i18n.js");
	try {
		if (i18n?.global?.locale && typeof i18n.global.locale === "object") {
			i18n.global.locale.value = locale;
		} else if (i18n?.global) {
			i18n.global.locale = locale;
		}
	} catch {
		if (i18n?.global) {
			i18n.global.locale = locale;
		}
	}
	if (typeof window !== "undefined") {
		localStorage.setItem("locale", locale);
	}
	setLocaleCookie(locale);
};

// ✅ Global Security Guards
router.beforeEach(async (to, _from, next) => {
	// 1. Set Title
	document.title = to.meta.title || "VibeCity";

	// Canonical route sync: resolve /venue/:id -> /v/:slug when slug is known.
	if (to.name === "Venue" || to.name === "VenueLocale") {
		const rawId =
			to.params?.id === undefined || to.params?.id === null
				? ""
				: String(to.params.id).trim();
		if (rawId) {
			try {
				const { useShopStore } = await import("../store/shopStore");
				const shopStore = useShopStore();
				const hit = shopStore.getShopById?.(rawId);
				const slug =
					hit?.slug === undefined || hit?.slug === null
						? ""
						: String(hit.slug).trim().toLowerCase();
				if (slug) {
					const locale =
						typeof to.params?.locale === "string"
							? to.params.locale
							: getPreferredLocale();
					return next(`/${locale}/v/${encodeURIComponent(slug)}`);
				}
			} catch {
				// fail-open; useAppLogic performs canonical replace once data resolves.
			}
		}
	}

	// 2. Check Visitor Identity (Device Auth)
	const visitorId = localStorage.getItem("vibe_visitor_id");

	// Locale sync: if path includes locale, persist it.
	const pathLocale = localeFromPath(to.path);
	if (pathLocale) {
		await setLocale(pathLocale);
	} else if (to.meta?.legacyLocale || isPublicPath(to.path)) {
		// Legacy public paths in dev should redirect to locale path.
		const preferred = getPreferredLocale();
		const suffix = to.path === "/" ? "" : to.path;
		return next(`/${preferred}${suffix}`);
	}

	// 3. Merchant Route Protection
	if (isMerchantPath(to.path)) {
		try {
			const { getOrCreateVisitorId, bootstrapVisitor } = await import(
				"../services/visitorIdentity"
			);
			getOrCreateVisitorId();
			void bootstrapVisitor().catch(() => {});
		} catch {
			// fail open: dashboard still handles missing visitor state
		}
	}

	// 4. Admin Route Protection
	if (to.meta.requiresAdmin) {
		// Dynamic Import to avoid circular dependency
		const { useUserStore } = await import("../store/userStore");
		const userStore = useUserStore();

		// Ensure auth state is loaded (initAuth is idempotent).
		try {
			await userStore.initAuth?.();
		} catch {
			// fail closed below
		}

		// Non-admin users must never stay on /admin.
		if (!userStore.isAuthenticated || !userStore.isAdmin) {
			console.warn("Unauthorized Admin Access Attempt");
			return next("/");
		}
	}

	// 5. Role guard for owner/partner dashboards (legacy-compatible).
	if (to.meta.requiredRole) {
		const { useUserStore } = await import("../store/userStore");
		const userStore = useUserStore();
		try {
			await userStore.initAuth?.();
		} catch {
			// fallback below
		}
		const requiredRole = String(to.meta.requiredRole || "")
			.trim()
			.toLowerCase();
		const hasRole =
			typeof userStore.hasRole === "function"
				? userStore.hasRole(requiredRole)
				: false;
		const visitorId = localStorage.getItem("vibe_visitor_id");
		const allowLegacyOwnerFallback =
			requiredRole === "owner" && Boolean(visitorId);
		const allowLegacyPartnerFallback =
			requiredRole === "partner" &&
			featureFlagFallbackEnabled("enable_partner_program");

		if (!userStore.isAdmin && !hasRole) {
			if (allowLegacyOwnerFallback || allowLegacyPartnerFallback) {
				return next();
			}
			const preferred = getPreferredLocale();
			return next(`/${preferred}`);
		}
	}

	next();
});

const featureFlagFallbackEnabled = (flag) => {
	try {
		const storeState = JSON.parse(
			localStorage.getItem("pinia-feature-flags") || "{}",
		);
		const flags = storeState?.flags || {};
		return Boolean(flags?.[flag]);
	} catch {
		return false;
	}
};

const focusRouteLandmark = () => {
	if (typeof window === "undefined" || typeof document === "undefined") return;

	window.requestAnimationFrame(() => {
		const h1 = document.querySelector("#main-content h1, main h1");
		const mainContent = document.getElementById("main-content");
		const target = h1 || mainContent;
		if (!(target instanceof HTMLElement)) return;

		const hadTabIndex = target.hasAttribute("tabindex");
		if (!hadTabIndex) {
			target.setAttribute("tabindex", "-1");
		}

		target.focus({ preventScroll: true });
		if (!hadTabIndex) {
			target.removeAttribute("tabindex");
		}
	});
};

router.afterEach(() => {
	focusRouteLandmark();
});

// ✅ Auto-reload on ChunkLoadError
router.onError((error, to) => {
	if (
		error.message.includes("Failed to fetch dynamically imported module") ||
		error.name === "ChunkLoadError"
	) {
		if (to?.fullPath) {
			window.location.href = to.fullPath;
		} else {
			window.location.reload();
		}
	} else {
		console.error("[Vue Router Error]:", error);
	}
});

export default router;
