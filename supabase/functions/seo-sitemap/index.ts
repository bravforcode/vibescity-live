import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
};

const escapeXml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const normalizeOrigin = (raw: string) => raw.trim().replace(/\/+$/, "");
const slugifyCategory = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const isMissingColumn = (error: { code?: string; message?: string }, column: string) => {
  const code = String(error?.code || "");
  const msg = String(error?.message || "").toLowerCase();
  return (
    (code === "42703" && msg.includes(column)) ||
    (msg.includes("column") && msg.includes(column) && msg.includes("does not exist"))
  );
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey =
      Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_KEY") || "";
    const siteOrigin = normalizeOrigin(
      Deno.env.get("SITE_ORIGIN") || "https://vibecity.live",
    );
    const maxUrlsRaw = Number(Deno.env.get("SITEMAP_MAX_URLS") || "5000") || 5000;
    const maxUrls = Math.min(Math.max(maxUrlsRaw, 10), 50000);

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // Prefer venues_public view when available.
    let venues: Array<{
      id: string;
      slug?: string;
      category?: string;
      updated_at?: string;
      created_at?: string;
    }> = [];

    const venuesPublicFields = "id,slug,category,updated_at,created_at";
    const venuesPublicFallback = "id,slug,category";
    const venuesPublicBase = "id,slug";

    const venuesPublicResult = await supabase
      .from("venues_public")
      .select(venuesPublicFields)
      .limit(maxUrls);

    if (!venuesPublicResult.error && Array.isArray(venuesPublicResult.data)) {
      venues = venuesPublicResult.data
        .map((row: Record<string, unknown>) => ({
          id: String(row.id || "").trim(),
          slug: String(row.slug || "").trim() || undefined,
          category: String(row.category || "").trim() || undefined,
          updated_at: row.updated_at ? String(row.updated_at) : undefined,
          created_at: row.created_at ? String(row.created_at) : undefined,
        }))
        .filter((v) => !!v.id);
    } else if (
      venuesPublicResult.error &&
      (isMissingColumn(venuesPublicResult.error, "updated_at") ||
        isMissingColumn(venuesPublicResult.error, "created_at"))
    ) {
      const retry = await supabase
        .from("venues_public")
        .select(venuesPublicFallback)
        .limit(maxUrls);
      if (!retry.error && Array.isArray(retry.data)) {
        venues = retry.data
          .map((row: Record<string, unknown>) => ({
            id: String(row.id || "").trim(),
            slug: String(row.slug || "").trim() || undefined,
            category: String(row.category || "").trim() || undefined,
          }))
          .filter((v) => !!v.id);
      }
    } else if (venuesPublicResult.error && isMissingColumn(venuesPublicResult.error, "category")) {
      const retry = await supabase
        .from("venues_public")
        .select(venuesPublicBase)
        .limit(maxUrls);
      if (!retry.error && Array.isArray(retry.data)) {
        venues = retry.data
          .map((row: Record<string, unknown>) => ({
            id: String(row.id || "").trim(),
            slug: String(row.slug || "").trim() || undefined,
          }))
          .filter((v) => !!v.id);
      }
    } else {
      // Fallback: query venues table with public-ish statuses (RLS applies).
      const { data: venuesRaw, error } = await supabase
        .from("venues")
        .select("id,slug,category,updated_at,created_at,status")
        .or("status.is.null,status.in.(active,approved,LIVE)")
        .limit(maxUrls);
      if (error) throw error;
      venues = (venuesRaw || [])
        .map((row: Record<string, unknown>) => ({
          id: String(row.id || "").trim(),
          slug: String(row.slug || "").trim() || undefined,
          category: String(row.category || "").trim() || undefined,
          updated_at: row.updated_at ? String(row.updated_at) : undefined,
          created_at: row.created_at ? String(row.created_at) : undefined,
        }))
        .filter((v) => !!v.id);
    }

    const categories = new Map<string, string>();
    venues.forEach((v) => {
      if (!v.category) return;
      const slug = slugifyCategory(v.category);
      if (slug) categories.set(slug, v.category);
    });

    const baseUrls: Array<{ path: string; lastmod?: string }> = [
      { path: "/" },
      { path: "/privacy" },
      { path: "/terms" },
    ];

    venues.forEach((v) => {
      const path = v.slug
        ? `/v/${encodeURIComponent(v.slug)}`
        : `/venue/${encodeURIComponent(v.id)}`;
      const lastmod = v.updated_at || v.created_at || undefined;
      baseUrls.push({ path, lastmod });
    });

    categories.forEach((_name, slug) => {
      baseUrls.push({ path: `/c/${encodeURIComponent(slug)}` });
    });

    const locales = ["th", "en"];
    const urls: string[] = [];
    for (const entry of baseUrls) {
      const alternates = locales.map((locale) => ({
        locale,
        loc: `${siteOrigin}/${locale}${entry.path === "/" ? "" : entry.path}`,
      }));

      for (const alt of alternates) {
        const lastmod =
          entry.lastmod && !Number.isNaN(Date.parse(entry.lastmod))
            ? new Date(entry.lastmod).toISOString()
            : null;
        const alternatesXml = alternates
          .map(
            (a) =>
              `    <xhtml:link rel="alternate" hreflang="${a.locale}" href="${escapeXml(
                a.loc,
              )}" />`,
          )
          .join("\n");
        const xDefault = `    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(
          `${siteOrigin}/th${entry.path === "/" ? "" : entry.path}`,
        )}" />`;

        urls.push(
          [
            "  <url>",
            `    <loc>${escapeXml(alt.loc)}</loc>`,
            lastmod ? `    <lastmod>${escapeXml(lastmod)}</lastmod>` : "",
            alternatesXml,
            xDefault,
            "  </url>",
          ]
            .filter(Boolean)
            .join("\n"),
        );
      }
    }

    const xml =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n` +
      urls.join("\n") +
      `\n</urlset>\n`;

    return new Response(req.method === "HEAD" ? null : xml, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
