import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const BATCH_SIZE = 10;

// PEXELS API (Fallback for generic videos if no social media is available)
const CATEGORY_PEXELS_QUERIES: Record<string, string> = {
  restaurant: "restaurant dining interior",
  cafe: "cafe coffee shop interior",
  bar: "cocktail bar interior nightlife",
  bakery: "bakery pastry shop",
  coffee: "coffee shop cafe barista",
  club: "nightclub dance floor",
  nightclub: "nightclub party neon",
  shop: "retail shop boutique",
  market: "market shopping",
  spa: "spa massage wellness",
  salon: "hair salon beauty",
  gym: "gym fitness workout",
  hotel: "hotel lobby luxury",
  default: "city street aesthetic vertical",
};

function getPexelsQuery(category: string | null): string {
  if (!category) return CATEGORY_PEXELS_QUERIES.default;
  const lower = category.toLowerCase().trim();
  for (const [key, query] of Object.entries(CATEGORY_PEXELS_QUERIES)) {
    if (key !== "default" && lower.includes(key)) return query;
  }
  return CATEGORY_PEXELS_QUERIES.default;
}

// ─────────────────────────────────────────────────────────────
// APIfy TikTok/Instagram Scraper Logic (Placeholder for future APIfy Token)
// ─────────────────────────────────────────────────────────────
async function scrapeSocialMediaVideo(
  apifyToken: string,
  socialUrl: string,
): Promise<string | null> {
  // If no apify token is provided in ENV, we return null and fallback to Pexels
  if (!apifyToken || !socialUrl) return null;
  // TODO: Implement direct APIFY actor call here. Currently returns null to fallback.
  try {
    console.log("Scraping social URL:", socialUrl);
    return null;
  } catch (e) {
    console.error("Scraper failed:", e);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// PEXELS: Get a real MP4 video that matches the venue category
// ─────────────────────────────────────────────────────────────
async function fetchPexelsVideo(
  category: string | null,
  pexelsKey: string,
): Promise<string | null> {
  if (!pexelsKey) return null;
  const query = encodeURIComponent(getPexelsQuery(category));
  const url = `https://api.pexels.com/videos/search?query=${query}&per_page=10&size=medium&orientation=portrait`;
  try {
    const res = await fetch(url, { headers: { Authorization: pexelsKey } });
    if (!res.ok) return null;
    const data = await res.json();
    const videos = data?.videos ?? [];
    if (!videos.length) return null;

    // Pick a video randomly from the top results to add variety
    const video =
      videos[Math.floor(Math.random() * Math.min(videos.length, 5))];
    const files = video?.video_files ?? [];

    const sdFile = files.find(
      (f: any) =>
        f.file_type === "video/mp4" && f.quality === "sd" && f.width <= 720,
    );
    const hdFile = files.find((f: any) => f.file_type === "video/mp4");
    return sdFile?.link ?? hdFile?.link ?? null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// GOOGLE PLACES: Find placeId by name + location & get Photo
// ─────────────────────────────────────────────────────────────
async function fetchGooglePhoto(
  name: string,
  lat: number | null,
  lng: number | null,
  apiKey: string,
): Promise<string | null> {
  if (!apiKey) return null;
  try {
    const query = encodeURIComponent(name);
    let url = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${query}&inputtype=textquery&fields=place_id&key=${apiKey}`;
    if (lat && lng) url += `&locationbias=circle:300@${lat},${lng}`;

    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const placeId = data?.candidates?.[0]?.place_id;

    if (!placeId) return null;

    const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=photos&key=${apiKey}`;
    const detailsRes = await fetch(detailsUrl);
    const detailsData = await detailsRes.json();
    const photoRef = detailsData?.result?.photos?.[0]?.photo_reference;

    if (!photoRef) return null;

    const photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=1200&photo_reference=${photoRef}&key=${apiKey}`;
    const finalRes = await fetch(photoUrl, { redirect: "follow" });
    return finalRes.url || null;
  } catch (e) {
    console.error("Google Fetch Error", e);
    return null; // fallback gracefully
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const googleApiKey = Deno.env.get("GOOGLE_MAPS_API_KEY") ?? "";
  const pexelsKey = Deno.env.get("PEXELS_API_KEY") ?? "";
  const apifyToken = Deno.env.get("APIFY_TOKEN") ?? ""; // Optional: Add later in Supabase Vault

  const admin = createClient(supabaseUrl, serviceKey);

  // Parse payload
  let limit = BATCH_SIZE;
  let forceShopId = null;
  try {
    const body = await req.json().catch(() => ({}));
    if (body.limit) limit = Math.min(Number(body.limit) || BATCH_SIZE, 50);
    if (body.shop_id) forceShopId = body.shop_id; // Manual trigger for 1 shop
  } catch {}

  // Build Query: Find venues lacking videos (or photos)
  let query = admin
    .from("venues")
    .select(
      "id, name, category, latitude, longitude, Image_URL1, video_url, Video_URL, tiktok_url, ig_url, fb_url, social_links, rating, review_count",
    );

  if (forceShopId) {
    query = query.eq("id", forceShopId).limit(1);
  } else {
    // Fetch venues that lack both video and photo (or just video)
    // Prioritize places with good ratings and high review counts to get media first!
    query = query
      .or("Video_URL.is.null,Video_URL.eq.,video_url.is.null,video_url.eq.")
      .order("rating", { ascending: false, nullsFirst: false })
      .order("review_count", { ascending: false, nullsFirst: false })
      .limit(limit);
  }

  const { data: venues, error: fetchError } = await query;
  if (fetchError || !venues) {
    return new Response(
      JSON.stringify({ error: fetchError?.message || "No data" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const results = [];

  for (const venue of venues) {
    const result: any = {
      id: venue.id,
      name: venue.name,
      photo: "skipped",
      video: "skipped",
    };
    const updates: Record<string, any> = {};

    const socialLinks = venue.social_links || {};
    const tiktok = venue.tiktok_url || socialLinks.tiktok;
    const ig = venue.ig_url || socialLinks.instagram;
    const fb = venue.fb_url || socialLinks.facebook;
    const bestSocialMatch = tiktok || ig || fb;

    // ── 1. Fetch Video ───────────────────
    if (!venue.Video_URL && !venue.video_url) {
      // A. Try Social Media Scraper first!
      let videoUrl = await scrapeSocialMediaVideo(apifyToken, bestSocialMatch);

      // B. Fallback to Pexels if no social video could be fetched
      if (!videoUrl)
        videoUrl = await fetchPexelsVideo(venue.category, pexelsKey);

      if (videoUrl) {
        updates["video_url"] = videoUrl; // Using standard lowercase naming
        updates["Video_URL"] = videoUrl; // Keep legacy synchronized
        result.video = "updated";
        result.videoUrl = videoUrl;
      } else {
        result.video = "no_video_found";
      }
    }

    // ── 2. Fetch Photo ───────────────────
    if (!venue.Image_URL1 && !venue.image_urls) {
      const photoUrl = await fetchGooglePhoto(
        venue.name,
        venue.latitude,
        venue.longitude,
        googleApiKey,
      );
      if (photoUrl) {
        updates["Image_URL1"] = photoUrl;
        updates["image_urls"] = [photoUrl];
        result.photo = "updated";
        result.imageUrl = photoUrl;
      } else {
        result.photo = "no_photo_found";
      }
    }

    // ── 3. Save to DB ───────────────────
    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await admin
        .from("venues")
        .update(updates)
        .eq("id", venue.id);
      if (updateError) result.updateError = updateError.message;
    }

    results.push(result);
  }

  return new Response(
    JSON.stringify({
      ok: true,
      processed: results.length,
      results,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
