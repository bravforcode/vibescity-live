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
		meta: { title: "VibeCity - Chiang Mai Entertainment" },
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
		meta: { title: "Partner Dashboard - VibeCity", requiresAuth: true },
	},

	// Legacy (non-locale) public routes for dev fallback
	{
		path: "/",
		name: "Home",
		component: HomeView,
		meta: { title: "VibeCity - Chiang Mai Entertainment", legacyLocale: true },
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
			requiresAuth: true,
			legacyLocale: true,
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
			requiresAuth: true,
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
	return "th";
};

const localeFromPath = (path) => {
	const match = String(path || "").match(/^\/(th|en)(\/|$)/);
	return match ? match[1] : null;
};

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
	if (to.path.startsWith("/merchant")) {
		if (!visitorId) {
			// If no visitor ID, they definitely don't own any shops yet
			// Redirect them home to explore/create first
			const { useNotifications } = await import(
				"@/composables/useNotifications"
			);
			useNotifications().notifyError(
				"Access Denied: Please create a shop first to access the dashboard.",
			);
			return next("/");
		}
		// Ideally we check if they actually own anything here, but for MVP checking presence of ID is step 1.
		// The dashboard itself handles "No Venues" state gracefully.
	}

	// Partner route requires authenticated user session.
	if (to.name === "PartnerDashboard" || to.name === "PartnerLocale") {
		const { useUserStore } = await import("../store/userStore");
		const userStore = useUserStore();
		try {
			await userStore.initAuth?.();
		} catch {
			// fail closed below
		}
		if (!userStore.isAuthenticated) {
			const { useNotifications } = await import(
				"@/composables/useNotifications"
			);
			useNotifications().notifyError(
				"Please sign in before opening Partner Dashboard.",
			);
			return next("/");
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

		if (!userStore.isAdmin) {
			console.warn("Unauthorized Admin Access Attempt");
			return next("/");
		}
	}

	next();
});

export default router;
