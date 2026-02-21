#!/usr/bin/env node
/**
 * Build-time prerender for SEO.
 *
 * Generates static HTML shells for:
 * - /v/:slug
 * - /venue/:id
 *
 * Each page is a copy of dist/index.html with server-visible meta tags + JSON-LD.
 *
 * Safety:
 * - Uses anon key only (public data via RLS). Never use service_role here.
 * - Idempotent: re-running overwrites the same output files.
 */
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const argv = process.argv.slice(2);
const readArgValue = (key) => {
  const idx = argv.findIndex((a) => a === key);
  if (idx !== -1) return argv[idx + 1] ?? null;
  const eq = argv.find((a) => a.startsWith(`${key}=`));
  if (eq) return eq.slice(key.length + 1) || null;
  return null;
};

// E2E builds should never depend on DB schema/network. Skip prerender entirely.
const envMode = readArgValue("--env-mode");
const isE2E =
  process.env.VITE_E2E === "true" ||
  process.env.PLAYWRIGHT === "true" ||
  envMode === "e2e";
if (isE2E) {
  process.stdout.write("Prerender skipped (E2E build).\n");
  process.exit(0);
}

const PRERENDER_ENABLED = (() => {
  const raw = String(process.env.PRERENDER_ENABLED ?? "true").trim().toLowerCase();
  return raw !== "false" && raw !== "0" && raw !== "off";
})();

const PRERENDER_REQUIRED = (() => {
  const raw = String(process.env.PRERENDER_REQUIRED ?? "").trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
})();

if (!PRERENDER_ENABLED) {
  process.stdout.write("Prerender disabled (PRERENDER_ENABLED=false). Skipping.\n");
  process.exit(0);
}

const trimTrailingSlash = (value) => String(value || "").replace(/\/+$/, "");
const DIST_DIR = process.env.PRERENDER_DIST_DIR || "dist";
const SITE_ORIGIN = trimTrailingSlash(
	process.env.SITE_URL || process.env.SITE_ORIGIN || "https://vibecity.live",
);
const LOCALES = ["th", "en"];

const buildLocalePath = (basePath, locale) => {
	const safe = basePath === "/" ? "" : basePath;
	return `/${locale}${safe}`;
};

const slugifyCategory = (value) =>
	String(value || "")
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.SUPABASE_KEY ||
  "";

const PAGE_SIZE = Math.min(
  Math.max(Number(process.env.PRERENDER_PAGE_SIZE || "1000") || 1000, 50),
  5000,
);
const MAX_VENUES = Math.min(
  Math.max(Number(process.env.PRERENDER_MAX_VENUES || "5000") || 5000, 10),
  50000,
);

const normalizeSlug = (value) => {
  const s = String(value || "").trim().toLowerCase();
  return s ? s : null;
};

const normalizeShortCode = (value) => {
  const s = String(value || "").trim().toUpperCase();
  if (!s) return null;
  // Base32 (RFC4648) 7 chars. Keep strict to avoid SEO path collisions.
  if (!/^[A-Z2-7]{7}$/.test(s)) return null;
  return s;
};

const normalizeId = (value) => {
  const s = String(value || "").trim();
  return s ? s : null;
};

const escapeHtml = (value) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const clampText = (value, maxLen) => {
  const s = String(value || "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  if (s.length <= maxLen) return s;
  return `${s.slice(0, Math.max(0, maxLen - 1)).trim()}…`;
};

const setOrInsertMeta = (html, predicateRegex, metaHtml) => {
  if (predicateRegex.test(html)) {
    return html.replace(predicateRegex, metaHtml);
  }
  // Insert before </head>
  return html.replace(/<\/head>/i, `${metaHtml}\n  </head>`);
};

const replaceTitle = (html, title) => {
  const safe = escapeHtml(title);
  if (/<title>[\s\S]*<\/title>/i.test(html)) {
    return html.replace(/<title>[\s\S]*<\/title>/i, `<title>${safe}</title>`);
  }
  return html.replace(/<\/head>/i, `  <title>${safe}</title>\n  </head>`);
};

const setCanonical = (html, canonicalUrl) => {
  const tag = `<link rel="canonical" href="${escapeHtml(canonicalUrl)}" />`;
  return setOrInsertMeta(html, /<link[^>]+rel=["']canonical["'][^>]*>/i, tag);
};

const setMetaName = (html, name, content) => {
  const tag = `<meta name="${escapeHtml(name)}" content="${escapeHtml(content)}" />`;
  const re = new RegExp(
    `<meta\\s+name=["']${name.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}["'][^>]*>`,
    "i",
  );
  return setOrInsertMeta(html, re, tag);
};

const setMetaProperty = (html, prop, content) => {
	const tag = `<meta property="${escapeHtml(prop)}" content="${escapeHtml(content)}" />`;
	const re = new RegExp(
		`<meta\\s+property=["']${prop.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}["'][^>]*>`,
		"i",
	);
	return setOrInsertMeta(html, re, tag);
};

const setHreflangLinks = (html, basePath) => {
	const links = LOCALES.map(
		(locale) =>
			`<link rel="alternate" hreflang="${locale}" href="${escapeHtml(
				`${SITE_ORIGIN}${buildLocalePath(basePath, locale)}`,
			)}" />`,
	);
	links.push(
		`<link rel="alternate" hreflang="x-default" href="${escapeHtml(
			`${SITE_ORIGIN}${buildLocalePath(basePath, "th")}`,
		)}" />`,
	);
	const block = links.join("\n  ");
	return html.replace(/<\/head>/i, `  ${block}\n  </head>`);
};

const setJsonLd = (html, jsonLd) => {
	// JSON-LD must be valid JSON, not HTML-escaped. Prevent `</script>` injection by
	// escaping `<` (common practice for safe embedding).
	const json = JSON.stringify(jsonLd).replace(/</g, "\\u003c");
	const scriptTag = `<script type="application/ld+json" data-vibecity="venue-jsonld">${json}</script>`;

  const cleaned = html.replace(
    /<script[^>]+data-vibecity=["']venue-jsonld["'][^>]*>[\s\S]*?<\/script>\s*/gi,
    "",
  );
  return cleaned.replace(/<\/head>/i, `  ${scriptTag}\n  </head>`);
};

const buildBreadcrumbJsonLd = ({ name, url, category, locale }) => {
	const safeLocale = LOCALES.includes(locale) ? locale : "th";
	const items = [
		{
			"@type": "ListItem",
			position: 1,
			name: "VibeCity",
			item: `${SITE_ORIGIN}${buildLocalePath("/", safeLocale)}`,
		},
	];
	if (category) {
		const slug = slugifyCategory(category);
		if (slug) {
			items.push({
				"@type": "ListItem",
				position: items.length + 1,
				name: category,
				item: `${SITE_ORIGIN}${buildLocalePath(
					`/c/${encodeURIComponent(slug)}`,
					safeLocale,
				)}`,
			});
		}
	}
	if (name && url) {
		items.push({
			"@type": "ListItem",
			position: items.length + 1,
			name,
			item: url,
		});
	}
	return {
		"@type": "BreadcrumbList",
		itemListElement: items,
	};
};

const venueToJsonLd = (v, canonicalUrl, locale) => {
	const images = Array.isArray(v.image_urls)
		? v.image_urls
		: [
				v.Image_URL1,
				v.Image_URL2,
        v.Image_URL3,
      ].filter((x) => typeof x === "string" && x.trim());

  const ratingValue = Number(v.rating || 0);
  const reviewCount = Number(v.review_count || v.reviewCount || 0);

	const category = v.category || v.type;
	const categoryLower = String(category || "").toLowerCase();
	const isEvent = categoryLower === "event" || categoryLower.includes("event");
	const isRestaurant =
		categoryLower === "restaurant" || categoryLower.includes("restaurant");

	const address = {
		"@type": "PostalAddress",
		addressLocality: v.district || undefined,
		addressRegion: v.province || undefined,
		addressCountry: "TH",
	};

	const graph = [
		{
			"@type": "LocalBusiness",
			name: v.name || "VibeCity Venue",
			description: v.description || undefined,
			url: canonicalUrl,
			image: images.filter(Boolean).slice(0, 5),
			telephone: v.phone || undefined,
			address,
			aggregateRating:
				ratingValue > 0 && reviewCount > 0
					? {
							"@type": "AggregateRating",
							ratingValue,
							reviewCount,
						}
					: undefined,
		},
		{
			"@type": "Place",
			name: v.name || "VibeCity Venue",
			url: canonicalUrl,
			address,
		},
		buildBreadcrumbJsonLd({
			name: v.name,
			url: canonicalUrl,
			category: v.category,
			locale,
		}),
	];

	if (isRestaurant) {
		graph.push({
			"@type": "Restaurant",
			name: v.name || "VibeCity Venue",
			url: canonicalUrl,
			address,
			telephone: v.phone || undefined,
		});
	}

	if (isEvent) {
		const startDate = v.start_date || v.startDate || undefined;
		const endDate = v.end_date || v.endDate || undefined;
		graph.push({
			"@type": "Event",
			name: v.name || "VibeCity Venue",
			startDate,
			endDate,
			location: {
				"@type": "Place",
				name: v.name || "VibeCity Venue",
				address,
			},
		});
	}

	return JSON.parse(JSON.stringify({ "@context": "https://schema.org", "@graph": graph }));
};

const categoryToJsonLd = (name, canonicalUrl, locale) => {
	const graph = [
		{
			"@type": "CollectionPage",
			name,
			url: canonicalUrl,
		},
		buildBreadcrumbJsonLd({ name, url: canonicalUrl, locale }),
	];
	return { "@context": "https://schema.org", "@graph": graph };
};

const injectVenueSeo = (
	templateHtml,
	v,
	{ pageUrl, canonicalUrl, basePath, locale },
) => {
	const name = v.name || "VibeCity";
	const category = v.category || "venue";
	const province = v.province || "Chiang Mai";
  const description = clampText(
    v.description || `${name} (${category}) in ${province}.`,
    155,
  );

  const ogImage =
    v.slug
      ? `${SITE_ORIGIN}/api/v1/seo/og/venue/${encodeURIComponent(v.slug)}.png`
      : `${SITE_ORIGIN}/api/v1/seo/og/site.png`;

  let html = templateHtml;
  html = replaceTitle(html, `${name} | VibeCity`);
	html = setCanonical(html, canonicalUrl);
	html = setHreflangLinks(html, basePath);

  html = setMetaName(html, "description", description);
  html = setMetaProperty(html, "og:title", `${name} | VibeCity`);
  html = setMetaProperty(html, "og:description", description);
  html = setMetaProperty(html, "og:url", canonicalUrl);
  html = setMetaProperty(html, "og:type", "place");
  html = setMetaProperty(html, "og:site_name", "VibeCity");
  html = setMetaProperty(html, "og:image", ogImage);

  html = setMetaName(html, "twitter:card", "summary_large_image");
  html = setMetaName(html, "twitter:title", `${name} | VibeCity`);
  html = setMetaName(html, "twitter:description", description);
  html = setMetaName(html, "twitter:image", ogImage);

	const jsonLd = venueToJsonLd(v, canonicalUrl, locale);
	html = setJsonLd(html, jsonLd);

  // Ensure the SPA can still hydrate normally.
	return html;
};

const injectCategorySeo = (
	templateHtml,
	{ name, canonicalUrl, basePath, locale },
) => {
	const title = `${name} | VibeCity`;
	const description = clampText(
		`Explore ${name} venues in Chiang Mai on VibeCity.`,
		155,
	);

	let html = templateHtml;
	html = replaceTitle(html, title);
	html = setCanonical(html, canonicalUrl);
	html = setHreflangLinks(html, basePath);

	html = setMetaName(html, "description", description);
	html = setMetaProperty(html, "og:title", title);
	html = setMetaProperty(html, "og:description", description);
	html = setMetaProperty(html, "og:url", canonicalUrl);
	html = setMetaProperty(html, "og:type", "website");
	html = setMetaProperty(html, "og:site_name", "VibeCity");
	html = setMetaProperty(
		html,
		"og:image",
		`${SITE_ORIGIN}/api/v1/seo/og/site.png`,
	);

	html = setMetaName(html, "twitter:card", "summary_large_image");
	html = setMetaName(html, "twitter:title", title);
	html = setMetaName(html, "twitter:description", description);
	html = setMetaName(
		html,
		"twitter:image",
		`${SITE_ORIGIN}/api/v1/seo/og/site.png`,
	);

	const jsonLd = categoryToJsonLd(name, canonicalUrl, locale);
	html = setJsonLd(html, jsonLd);
	return html;
};

const injectRobotsNoindex = (html, content) =>
  setMetaName(html, "robots", content || "noindex,follow");

const writeIndexHtml = async (relDir, html) => {
  const outDir = path.join(DIST_DIR, relDir);
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, "index.html"), html, "utf8");
};

const fetchVenues = async () => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    process.stderr.write(
      "Prerender: missing SUPABASE env vars; skipping venue prerender. " +
        "Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (or SUPABASE_URL/SUPABASE_KEY) to enable.\n",
    );
    return [];
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const fieldsPublicBase =
    "id,name,description,category,province,district,address,phone,image_urls,rating,review_count";
  const fieldsPublicWithSlug = `slug,short_code,${fieldsPublicBase}`;
  const fieldsPublicWithSlugOnly = `slug,${fieldsPublicBase}`;

  const fieldsVenuesBase =
    "id,name,description,category,province,district,address,phone,image_urls,Image_URL1,Image_URL2,Image_URL3,rating,review_count";
  const fieldsVenuesWithSlug = `slug,short_code,${fieldsVenuesBase}`;
  const fieldsVenuesWithSlugOnly = `slug,${fieldsVenuesBase}`;

  const isMissingColumn = (error, columnName) => {
    const code = String(error?.code || "");
    const msg = String(error?.message || "").toLowerCase();
    return (
      (code === "42703" && msg.includes(columnName)) ||
      (msg.includes("column") && msg.includes(columnName) && msg.includes("does not exist"))
    );
  };

  const isMissingSlugColumn = (error) => isMissingColumn(error, "slug");
  const isMissingShortCodeColumn = (error) => isMissingColumn(error, "short_code");

  const tryFetchPaged = async (tableName, fields) => {
    let offset = 0;
    const out = [];

    for (;;) {
      const { data, error } = await supabase
        .from(tableName)
        .select(fields)
        .range(offset, offset + PAGE_SIZE - 1);

      if (error) return { ok: false, error };

      const rows = Array.isArray(data) ? data : [];
      out.push(...rows);
      if (!rows.length || rows.length < PAGE_SIZE || out.length >= MAX_VENUES) break;
      offset += PAGE_SIZE;
    }

    return { ok: true, data: out };
  };

  // Prefer venues_public view when available.
  {
    const attempt = await tryFetchPaged("venues_public", fieldsPublicWithSlug);
    if (attempt.ok && attempt.data.length) return attempt.data;

    if (!attempt.ok && isMissingShortCodeColumn(attempt.error)) {
      const retry = await tryFetchPaged("venues_public", fieldsPublicWithSlugOnly);
      if (retry.ok && retry.data.length) return retry.data;
      // If still failing or empty, fall through to table fallback.
    }

    if (!attempt.ok && isMissingSlugColumn(attempt.error)) {
      const retry = await tryFetchPaged("venues_public", fieldsPublicBase);
      if (retry.ok && retry.data.length) return retry.data;
      // If still failing or empty, fall through to table fallback.
    }
  }

  // Fallback: direct venues table (RLS applies).
  {
    const attempt = await tryFetchPaged("venues", fieldsVenuesWithSlug);
    if (attempt.ok) return attempt.data;

    if (isMissingShortCodeColumn(attempt.error)) {
      const retry = await tryFetchPaged("venues", fieldsVenuesWithSlugOnly);
      if (retry.ok) return retry.data;
    }

    if (isMissingSlugColumn(attempt.error)) {
      const retry = await tryFetchPaged("venues", fieldsVenuesBase);
      if (retry.ok) return retry.data;
    }

    throw attempt.error;
  }
};

const main = async () => {
  const templatePath = path.join(DIST_DIR, "index.html");
  const templateHtml = await fs.readFile(templatePath, "utf8");

  const venuesRaw = await fetchVenues();
  if (!venuesRaw.length) {
    process.stdout.write("Prerender: no venues fetched. Skipping.\n");
    return;
  }
  const venues = venuesRaw
    .map((v) => ({
      ...v,
      id: normalizeId(v.id),
      slug: normalizeSlug(v.slug),
      short_code: normalizeShortCode(v.short_code),
    }))
    .filter((v) => !!v.id);

  const categories = new Map();
  let rendered = 0;
  for (const v of venues) {
    if (v.category) {
      const slug = slugifyCategory(v.category);
      if (slug) categories.set(slug, v.category);
    }
  }

  for (const v of venues) {
    const id = v.id;
    const slug = v.slug;

    const baseCanonicalPath = slug
      ? `/v/${encodeURIComponent(slug)}`
      : `/venue/${encodeURIComponent(id)}`;

    for (const locale of LOCALES) {
      const pagePath = buildLocalePath(baseCanonicalPath, locale);
      const canonicalUrl = `${SITE_ORIGIN}${pagePath}`;

      // /:locale/v/:slug (canonical when slug exists)
      if (slug) {
        const pageUrl = canonicalUrl;
        const html = injectVenueSeo(templateHtml, v, {
          pageUrl,
          canonicalUrl,
          basePath: baseCanonicalPath,
          locale,
        });
        await writeIndexHtml(path.join(locale, "v", slug), html);
        rendered += 1;
      }

      // /:locale/venue/:id (legacy + deep links)
      {
        const legacyPath = buildLocalePath(`/venue/${encodeURIComponent(id)}`, locale);
        const legacyUrl = `${SITE_ORIGIN}${legacyPath}`;
        const canonicalLegacyUrl = slug
          ? `${SITE_ORIGIN}${buildLocalePath(`/v/${encodeURIComponent(slug)}`, locale)}`
          : legacyUrl;
        let html = injectVenueSeo(templateHtml, v, {
          pageUrl: legacyUrl,
          canonicalUrl: canonicalLegacyUrl,
          basePath: baseCanonicalPath,
          locale,
        });
        html = injectRobotsNoindex(html, "noindex,follow");
        await writeIndexHtml(path.join(locale, "venue", id), html);
        rendered += 1;
      }
    }
  }

  for (const [slug, name] of categories.entries()) {
    const basePath = `/c/${encodeURIComponent(slug)}`;
    for (const locale of LOCALES) {
      const pagePath = buildLocalePath(basePath, locale);
      const canonicalUrl = `${SITE_ORIGIN}${pagePath}`;
      const html = injectCategorySeo(templateHtml, {
        name,
        canonicalUrl,
        basePath,
        locale,
      });
      await writeIndexHtml(path.join(locale, "c", slug), html);
      rendered += 1;
    }
  }

  process.stdout.write(
    `Prerender complete: ${rendered} pages for ${venues.length} venues and ${categories.size} categories (dist: ${DIST_DIR}).\n`,
  );
};

main().catch((err) => {
  console.error("Prerender failed:", err?.message || err);
  if (PRERENDER_REQUIRED) {
    process.exitCode = 1;
  } else {
    process.stderr.write(
      "Prerender: continuing without prerendered venue pages. " +
        "Set PRERENDER_REQUIRED=true to fail the build on prerender errors.\n",
    );
    process.exitCode = 0;
  }
});
