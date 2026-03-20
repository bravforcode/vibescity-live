import type { Page, Route } from "@playwright/test";

const toApiEnvelope = (data: unknown) => ({
	data,
	meta: {
		version: "v1",
		requestId: "translation-review",
		timestamp: "2026-03-08T00:00:00.000Z",
		deprecatedAt: null,
		sunsetAt: null,
	},
	errors: [],
});

const fulfillJson = async (route: Route, data: unknown, status = 200) => {
	await route.fulfill({
		status,
		contentType: "application/json",
		body: JSON.stringify(toApiEnvelope(data)),
	});
};

const base64UrlEncode = (value: string) =>
	Buffer.from(value, "utf8")
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/g, "");

const createVisitorToken = (visitorId: string) => {
	const now = Math.floor(Date.now() / 1000);
	const payload = {
		vid: visitorId,
		iat: now,
		exp: now + 60 * 60 * 24,
		v: 1,
	};
	return `${base64UrlEncode(JSON.stringify(payload))}.signature`;
};

const svgDataUrl = (
	label: string,
	background = "#0f172a",
	foreground = "#f8fafc",
	width = 240,
	height = 160,
) =>
	`data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
		`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
			<rect width="${width}" height="${height}" rx="24" fill="${background}" />
			<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Arial, sans-serif" font-size="20" font-weight="700" fill="${foreground}">
				${label}
			</text>
		</svg>`,
	)}`;

const ownerVisitorId = "0f3fa0b0-10af-46f3-a261-c2792b8f4491";
const partnerVisitorId = "9b071d24-a218-4aa5-8d8c-bdef58ece2f8";

export const seedLocaleVisitor = async (
	page: Page,
	{
		locale,
		visitorId = ownerVisitorId,
	}: { locale: "th" | "en"; visitorId?: string },
) => {
	const visitorToken = createVisitorToken(visitorId);
	await page.addInitScript(
		({ nextLocale, nextVisitorId, nextVisitorToken }) => {
			localStorage.setItem("locale", nextLocale);
			localStorage.setItem("vibe_visitor_id", nextVisitorId);
			localStorage.setItem("vibe_visitor_token", nextVisitorToken);
			document.cookie = `vibe_locale=${nextLocale}; path=/; max-age=${60 * 60 * 24 * 365}`;
		},
		{
			nextLocale: locale,
			nextVisitorId: visitorId,
			nextVisitorToken: visitorToken,
		},
	);
};

export const seedPartnerSession = async (
	page: Page,
	locale: "th" | "en",
) => {
	const visitorToken = createVisitorToken(partnerVisitorId);
	await page.addInitScript(
		({ nextLocale, nextVisitorId, nextVisitorToken }) => {
			const encode = (value: Record<string, unknown>) =>
				btoa(JSON.stringify(value))
					.replace(/\+/g, "-")
					.replace(/\//g, "_")
					.replace(/=+$/g, "");
			const now = Math.floor(Date.now() / 1000);
			const accessToken = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
				aud: "authenticated",
				exp: now + 60 * 60 * 24,
				sub: "translation-review-partner",
				email: "translation-review-partner@vibecity.live",
				role: "authenticated",
			})}.signature`;
			const session = {
				access_token: accessToken,
				refresh_token: "translation-review-refresh-token",
				token_type: "bearer",
				expires_in: 60 * 60 * 24,
				expires_at: now + 60 * 60 * 24,
				user: {
					id: "translation-review-partner",
					email: "translation-review-partner@vibecity.live",
					app_metadata: {
						role: "partner",
						roles: ["partner"],
						permissions: ["view:kpi", "view:financial", "edit:bank"],
					},
					user_metadata: {
						role: "partner",
						roles: ["partner"],
					},
				},
			};
			localStorage.setItem("locale", nextLocale);
			localStorage.setItem("vibe_visitor_id", nextVisitorId);
			localStorage.setItem("vibe_visitor_token", nextVisitorToken);
			document.cookie = `vibe_locale=${nextLocale}; path=/; max-age=${60 * 60 * 24 * 365}`;
			for (const key of [
				"sb-rukyitpjfmzhqjlfmbie-auth-token",
				"sb-nluuvnttweesnkrmgzsm-auth-token",
			]) {
				localStorage.setItem(key, JSON.stringify(session));
			}
			localStorage.setItem(
				"pinia-feature-flags",
				JSON.stringify({
					flags: {
						enable_partner_program: true,
						ff_partner_dashboard_v2: true,
						ff_sensitive_reveal: true,
					},
				}),
			);
		},
		{
			nextLocale: locale,
			nextVisitorId: partnerVisitorId,
			nextVisitorToken: visitorToken,
		},
	);
};

export const stubOwnerReviewApis = async (page: Page) => {
	const coverImage = svgDataUrl("Owner Cover", "#1e293b", "#fbbf24", 640, 360);
	const logoImage = svgDataUrl("NP", "#164e63", "#ecfeff", 160, 160);
	await page.route("**/api/v1/owner/**", async (route) => {
		const url = new URL(route.request().url());
		if (url.pathname.endsWith("/owner/portfolio")) {
			return fulfillJson(route, {
				visitor_id: ownerVisitorId,
				kpis: {
					venues_total: 2,
					venues_live: 1,
					total_views: 1700,
					avg_rating: 4.45,
					promoted: 1,
				},
				expiring_7d: {
					verified_until: 1,
					glow_until: 0,
					boost_until: 1,
					giant_until: 0,
				},
				updated_at: "2026-03-08T00:00:00.000Z",
			});
		}
		if (url.pathname.endsWith("/owner/venues")) {
			return fulfillJson(route, {
				total: 2,
				venues: [
					{
						id: "owner-v1",
						name: "Neon Pulse Club",
						category: "Nightlife",
						status: "live",
						rating: 4.7,
						total_views: 1280,
						image: coverImage,
						is_live: true,
						is_promoted: true,
						completeness: { score: 92, missing: [] },
						verified_until: "2026-03-24T10:00:00Z",
						glow_until: "2026-03-20T10:00:00Z",
						boost_until: "2026-03-18T10:00:00Z",
						giant_until: null,
					},
					{
						id: "owner-v2",
						name: "Skyline Jazz Room",
						category: "Jazz Bar",
						status: "draft",
						rating: 4.2,
						total_views: 420,
						image: svgDataUrl("Jazz", "#312e81", "#e0e7ff", 640, 360),
						is_live: false,
						is_promoted: false,
						completeness: { score: 68, missing: ["social"] },
						verified_until: null,
						glow_until: null,
						boost_until: null,
						giant_until: null,
					},
				],
			});
		}
		if (url.pathname.endsWith("/owner/insights")) {
			return fulfillJson(route, {
				days: 30,
				summary: {
					events_total: 96,
					unique_visitors_total: 41,
					active_venues_total: 2,
				},
				trend: [
					{ date: "2026-03-01", events: 8, active_venues: 1, unique_visitors: 4 },
					{ date: "2026-03-02", events: 11, active_venues: 2, unique_visitors: 6 },
					{ date: "2026-03-03", events: 9, active_venues: 2, unique_visitors: 5 },
					{ date: "2026-03-04", events: 14, active_venues: 2, unique_visitors: 8 },
					{ date: "2026-03-05", events: 12, active_venues: 2, unique_visitors: 7 },
					{ date: "2026-03-06", events: 16, active_venues: 2, unique_visitors: 9 },
					{ date: "2026-03-07", events: 18, active_venues: 2, unique_visitors: 11 },
				],
				actions: [],
				expiring: [
					{
						venue_id: "owner-v1",
						feature: "boost_until",
						at: "2026-03-18T10:00:00Z",
					},
				],
			});
		}
		if (/\/owner\/shops\/[^/]+\/promotion-status$/.test(url.pathname)) {
			return fulfillJson(route, {
				shop_id: "owner-v1",
				eligible: true,
				current_entitlements: {
					verified: true,
					glow: true,
					boost: true,
					giant: false,
				},
				branding: {
					logo_url: logoImage,
					cover_url: coverImage,
				},
				slot: {
					lat: 13.7563,
					lng: 100.5018,
					placement: "top",
					source: "owner_review_stub",
				},
				sign: {
					mode: "metadata",
					asset_url: null,
					status: "ready",
					template: "default-neon-v1",
				},
				last_published_at: "2026-03-07T21:30:00Z",
				warnings: [],
			});
		}
		return fulfillJson(route, { detail: "Not Found" }, 404);
	});
};

export const stubPartnerReviewApis = async (page: Page) => {
	await page.route("**/rest/v1/feature_flags_public*", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify([
				{
					key: "enable_partner_program",
					enabled: true,
					rollout_percent: 100,
					kill_switch: false,
					config: {},
				},
				{
					key: "ff_sensitive_reveal",
					enabled: true,
					rollout_percent: 100,
					kill_switch: false,
					config: {},
				},
			]),
		});
	});
	await page.route("**/api/v1/partner/**", async (route) => {
		const url = new URL(route.request().url());
		if (url.pathname.endsWith("/partner/status")) {
			return fulfillJson(route, {
				has_access: true,
				status: "active",
				current_period_end: "2026-03-24T00:00:00Z",
			});
		}
		if (url.pathname.endsWith("/partner/dashboard")) {
			return fulfillJson(route, {
				status: {
					has_access: true,
					status: "active",
					current_period_end: "2026-03-24T00:00:00Z",
				},
				summary: {
					total_orders: 9,
					verified_orders: 7,
					total_paid_thb: 12900,
				},
				profile: {
					id: "translation-review-partner",
					name: "Visual Partner",
					referral_code: "VISUALPARTNER",
					status: "active",
					metadata: {
						bank: {
							bank_code: "KBANK",
							bank_country: "TH",
							currency: "THB",
							account_name: "Visual Partner",
							account_number: "0113222743",
							promptpay_id: "0113222743",
						},
					},
				},
				orders: [
					{
						id: "order-1",
						sku: "partner_program",
						amount: 899,
						status: "paid",
						created_at: "2026-03-01T12:00:00Z",
					},
				],
			});
		}
		if (url.pathname.endsWith("/partner/csrf-token")) {
			return fulfillJson(route, { token: "translation-review-csrf" });
		}
		return fulfillJson(route, { detail: "Not Found" }, 404);
	});
};
