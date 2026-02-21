const DEFAULT_ALLOWED_ORIGINS = ["https://vibecity.live"];

const parseAllowedOrigins = (): string[] => {
  const raw = (Deno.env.get("CORS_ALLOWED_ORIGINS") || "").trim();
  if (!raw) return DEFAULT_ALLOWED_ORIGINS;
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
};

const allowedOrigins = parseAllowedOrigins();

export const isOriginAllowed = (origin: string | null): boolean => {
  if (!origin) return true; // Server-to-server requests usually have no Origin
  if (allowedOrigins.includes("*")) return true;
  return allowedOrigins.includes(origin);
};

export const resolveAllowedOrigin = (origin: string | null): string => {
  if (!origin) {
    return allowedOrigins.includes("*")
      ? "*"
      : allowedOrigins[0] || DEFAULT_ALLOWED_ORIGINS[0];
  }
  if (allowedOrigins.includes("*")) return "*";
  if (allowedOrigins.includes(origin)) return origin;
  return allowedOrigins[0] || DEFAULT_ALLOWED_ORIGINS[0];
};

export const buildCorsHeaders = (
  origin: string | null,
  methods = "POST, OPTIONS",
) => ({
  "Access-Control-Allow-Origin": resolveAllowedOrigin(origin),
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-vibe-visitor-id",
  "Access-Control-Allow-Methods": methods,
  Vary: "Origin",
});

