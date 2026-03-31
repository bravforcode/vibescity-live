import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const BATCH_SIZE = 8;

interface Venue {
  id: string;
  name: string;
  category: string | null;
  latitude: number | null;
  longitude: number | null;
  Image_URL1: string | null;
}

// ─────────────────────────────────────────────────────────────
// GOOGLE PLACES: Find placeId by name + location
// ─────────────────────────────────────────────────────────────
async function findPlaceId(
  name: string,
  lat: number | null,
  lng: number | null,
  apiKey: string,
): Promise<string | null> {
  const query = encodeURIComponent(name);
  let url = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${query}&inputtype=textquery&fields=place_id&key=${apiKey}`;
  if (lat && lng) url += `&locationbias=circle:300@${lat},${lng}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return data?.candidates?.[0]?.place_id ?? null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// GOOGLE PLACES: Get photo reference from placeId
// ─────────────────────────────────────────────────────────────
async function getPhotoReference(
  placeId: string,
  apiKey: string,
): Promise<{ photoRef: string; attribution: string } | null> {
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=photos&key=${apiKey}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const photo = data?.result?.photos?.[0];
    if (!photo?.photo_reference) return null;
    return {
      photoRef: photo.photo_reference,
      attribution: (photo.html_attributions?.[0] ?? "").replace(/<[^>]+>/g, ""),
    };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// GOOGLE PLACES: Resolve photo URL (follow the redirect to get
// a permanent googleusercontent.com URL)
// ─────────────────────────────────────────────────────────────
async function resolvePhotoUrl(
  photoRef: string,
  apiKey: string,
): Promise<string | null> {
  const url = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=1200&photo_reference=${photoRef}&key=${apiKey}`;
  try {
    // The Google Places Photo API returns a 302 redirect to the actual image URL.
    // We follow manually to capture the final "googleusercontent.com" URL which is persistent.
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) return null;
    // The response URL after following redirects is the persistent image URL
    return res.url || null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// PEXELS: Get a real MP4 video that matches the venue category
// (Returns a direct video URL compatible with HTML5 <video>)
// ─────────────────────────────────────────────────────────────
const CATEGORY_PEXELS_QUERIES: Record<string, string> = {
  restaurant: "restaurant dining interior",
  cafe: "cafe coffee shop interior",
  bar: "cocktail bar interior nightlife",
  bakery: "bakery pastry shop",
  coffee: "coffee shop cafe barista",
  club: "nightclub dance floor",
  nightclub: "nightclub party neon",
  cinema: "movie cinema theater",
  karaoke: "karaoke music singing",
  shop: "retail shop boutique",
  market: "market shopping",
  mall: "shopping mall interior",
  spa: "spa massage wellness",
  salon: "hair salon beauty",
  gym: "gym fitness workout",
  hotel: "hotel lobby luxury",
  hostel: "hostel travel accommodation",
  default: "chiang mai downtown street thailand",
};

function getPexelsQuery(category: string | null): string {
  if (!category) return CATEGORY_PEXELS_QUERIES.default;
  const lower = category.toLowerCase().trim();
  for (const [key, query] of Object.entries(CATEGORY_PEXELS_QUERIES)) {
    if (key !== "default" && lower.includes(key)) return query;
  }
  return CATEGORY_PEXELS_QUERIES.default;
}

async function fetchPexelsVideo(
  category: string | null,
  pexelsKey: string,
): Promise<string | null> {
  const query = encodeURIComponent(getPexelsQuery(category));
  const url = `https://api.pexels.com/videos/search?query=${query}&per_page=5&size=medium&orientation=portrait`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: pexelsKey },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const videos = data?.videos ?? [];
    if (!videos.length) return null;

    // Pick a video randomly from the top 5 results to add variety
    const video =
      videos[Math.floor(Math.random() * Math.min(videos.length, 5))];
    const files: Array<{
      file_type: string;
      quality: string;
      link: string;
      width: number;
    }> = video?.video_files ?? [];

    // Prefer SD MP4 (smaller file, mobile-friendly)
    const sdFile = files.find(
      (f) =>
        f.file_type === "video/mp4" && f.quality === "sd" && f.width <= 720,
    );
    const hdFile = files.find((f) => f.file_type === "video/mp4");
    return sdFile?.link ?? hdFile?.link ?? null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// MAIN: Edge Function handler
// ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const googleApiKey = Deno.env.get("GOOGLE_MAPS_API_KEY") ?? "";
  const pexelsKey = Deno.env.get("PEXELS_API_KEY") ?? "";

  const missingKeys: string[] = [];
  if (!googleApiKey) missingKeys.push("GOOGLE_MAPS_API_KEY");
  if (!pexelsKey) missingKeys.push("PEXELS_API_KEY");
  if (missingKeys.length) {
    return new Response(
      JSON.stringify({ error: `Missing secrets: ${missingKeys.join(", ")}` }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const admin = createClient(supabaseUrl, serviceKey);

  // Parse optional `limit` from query string or body
  let limit = BATCH_SIZE;
  try {
    const body = await req.json().catch(() => ({}));
    if (body.limit) limit = Math.min(Number(body.limit) || BATCH_SIZE, 50);
  } catch {
    /* ignore */
  }

  // Fetch venues missing an image (safe — Image_URL1 always exists)
  const { data: venues, error: fetchError } = await admin
    .from("venues")
    .select("id, name, category, latitude, longitude, Image_URL1")
    .or("Image_URL1.is.null,Image_URL1.eq.")
    .limit(limit);

  if (fetchError) {
    return new Response(JSON.stringify({ error: fetchError.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const results: Array<{
    id: string;
    name: string;
    photo: string;
    video: string;
    imageUrl?: string;
    videoUrl?: string;
  }> = [];

  for (const venue of (venues ?? []) as Venue[]) {
    const result: (typeof results)[number] = {
      id: venue.id,
      name: venue.name,
      photo: "skipped",
      video: "skipped",
    };

    const updates: Record<string, string> = {};

    // ── Step 1: Fetch real photo if missing ───────────────────
    const needsPhoto = !venue.Image_URL1;
    if (needsPhoto) {
      try {
        const placeId = await findPlaceId(
          venue.name,
          venue.latitude,
          venue.longitude,
          googleApiKey,
        );
        if (placeId) {
          const photoData = await getPhotoReference(placeId, googleApiKey);
          if (photoData) {
            const photoUrl = await resolvePhotoUrl(
              photoData.photoRef,
              googleApiKey,
            );
            if (photoUrl) {
              updates["Image_URL1"] = photoUrl;
              result.photo = "updated";
              result.imageUrl = photoUrl;
            } else {
              result.photo = "no_photo_url";
            }
          } else {
            result.photo = "no_photo_ref";
          }
        } else {
          result.photo = "no_place_id";
        }
      } catch {
        result.photo = "error";
      }
    }

    // ── Step 2: Fetch real video if missing ───────────────────
    const needsVideo = !venue.Video_URL;
    if (needsVideo) {
      try {
        const videoUrl = await fetchPexelsVideo(venue.category, pexelsKey);
        if (videoUrl) {
          updates["Video_URL"] = videoUrl;
          result.video = "updated";
          result.videoUrl = videoUrl;
        } else {
          result.video = "no_video_found";
        }
      } catch {
        result.video = "error";
      }
    }

    // ── Step 3: Save to DB ────────────────────────────────────
    if (Object.keys(updates).length > 0) {
      await admin.from("venues").update(updates).eq("id", venue.id);
    }

    results.push(result);
  }

  const photosUpdated = results.filter((r) => r.photo === "updated").length;
  const videosUpdated = results.filter((r) => r.video === "updated").length;

  return new Response(
    JSON.stringify({
      ok: true,
      processed: results.length,
      photos_updated: photosUpdated,
      videos_updated: videosUpdated,
      results,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
