import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isAdminUser } from "../_shared/admin.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};

const asBool = (value: string | null) => {
  if (!value) return false;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const asNumber = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const buildLocationPoint = (lat: unknown, lng: unknown) => {
  const latNum = asNumber(lat);
  const lngNum = asNumber(lng);
  if (latNum === null || lngNum === null) return null;
  if (latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
    throw new Error("Invalid coordinates");
  }
  return `POINT(${lngNum} ${latNum})`;
};

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const payload = error as Record<string, unknown>;
    const candidates = [
      payload.message,
      payload.error,
      payload.details,
      payload.hint,
    ];
    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate.trim();
      }
    }
  }
  return String(error);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseAnonKey =
    Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_KEY") || "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!isAdminUser(user)) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const url = new URL(req.url);
    const id = url.searchParams.get("id");

    if (req.method === "GET") {
      const includeMetrics = asBool(url.searchParams.get("include_metrics"));
      const periodDays = clamp(
        Number(url.searchParams.get("period_days")) || 30,
        1,
        365,
      );

      if (id) {
        const { data, error } = await adminClient
          .from("local_ads")
          .select("*")
          .eq("id", id)
          .single();
        if (error) throw error;
        return new Response(JSON.stringify({ success: true, data }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: ads, error: adsError } = await adminClient
        .from("local_ads")
        .select("*")
        .order("created_at", { ascending: false });

      if (adsError) throw adsError;
      const rows = (ads || []) as Array<Record<string, unknown>>;

      if (!includeMetrics || !rows.length) {
        return new Response(JSON.stringify({ success: true, data: rows }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const adIds = rows.map((row) => String(row.id));
      const sinceIso = new Date(
        Date.now() - periodDays * 24 * 60 * 60 * 1000,
      ).toISOString();

      const [{ data: impressions }, { data: clicks }] = await Promise.all([
        adminClient
          .from("ad_impressions")
          .select("ad_id")
          .in("ad_id", adIds)
          .gte("created_at", sinceIso),
        adminClient
          .from("ad_clicks")
          .select("ad_id")
          .in("ad_id", adIds)
          .gte("created_at", sinceIso),
      ]);

      const impressionMap = new Map<string, number>();
      const clickMap = new Map<string, number>();

      for (const row of impressions || []) {
        const adId = String(row.ad_id || "");
        if (!adId) continue;
        impressionMap.set(adId, (impressionMap.get(adId) || 0) + 1);
      }
      for (const row of clicks || []) {
        const adId = String(row.ad_id || "");
        if (!adId) continue;
        clickMap.set(adId, (clickMap.get(adId) || 0) + 1);
      }

      const withMetrics = rows.map((row) => {
        const adId = String(row.id || "");
        const impressionCount = impressionMap.get(adId) || 0;
        const clickCount = clickMap.get(adId) || 0;
        return {
          ...row,
          metrics: {
            impressions: impressionCount,
            clicks: clickCount,
            ctr: impressionCount > 0 ? clickCount / impressionCount : 0,
            period_days: periodDays,
          },
        };
      });

      return new Response(JSON.stringify({ success: true, data: withMetrics }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const title = String(body.title || "").trim();
      if (!title) throw new Error("Missing title");

      const location = buildLocationPoint(body.lat, body.lng);
      if (!location) throw new Error("Missing lat/lng");

      const record = {
        title,
        description: String(body.description || "").trim(),
        image_url: String(body.image_url || "").trim(),
        link_url: String(body.link_url || "").trim(),
        location,
        radius_km: Math.max(Number(body.radius_km) || 5, 0.1),
        status: ["active", "paused", "expired"].includes(
            String(body.status || "active").toLowerCase(),
          )
          ? String(body.status || "active").toLowerCase()
          : "active",
        starts_at: body.starts_at || null,
        ends_at: body.ends_at || null,
        venue_id: body.venue_id || null,
        metadata: typeof body.metadata === "object" && body.metadata
          ? body.metadata
          : {},
        created_by: user.id,
      };

      const { data, error } = await adminClient
        .from("local_ads")
        .insert(record)
        .select()
        .single();
      if (error) throw error;

      return new Response(JSON.stringify({ success: true, data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (req.method === "PATCH") {
      const body = await req.json().catch(() => ({}));
      const targetId = id || String(body.id || "").trim();
      if (!targetId) throw new Error("Missing id");

      const updates: Record<string, unknown> = {};
      const fields = [
        "title",
        "description",
        "image_url",
        "link_url",
        "status",
        "starts_at",
        "ends_at",
        "venue_id",
        "metadata",
      ];

      for (const field of fields) {
        if (Object.prototype.hasOwnProperty.call(body, field)) {
          updates[field] = body[field];
        }
      }
      if (Object.prototype.hasOwnProperty.call(body, "radius_km")) {
        updates.radius_km = Math.max(Number(body.radius_km) || 5, 0.1);
      }

      if (
        Object.prototype.hasOwnProperty.call(body, "lat") &&
        Object.prototype.hasOwnProperty.call(body, "lng")
      ) {
        updates.location = buildLocationPoint(body.lat, body.lng);
      }

      const { data, error } = await adminClient
        .from("local_ads")
        .update(updates)
        .eq("id", targetId)
        .select()
        .single();
      if (error) throw error;

      return new Response(JSON.stringify({ success: true, data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (req.method === "DELETE") {
      const body = await req.json().catch(() => ({}));
      const targetId = id || String(body.id || "").trim();
      if (!targetId) throw new Error("Missing id");

      const { error } = await adminClient.from("local_ads").delete().eq("id", targetId);
      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = getErrorMessage(error);
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
