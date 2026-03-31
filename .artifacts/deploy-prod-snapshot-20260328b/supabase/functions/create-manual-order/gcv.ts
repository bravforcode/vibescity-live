const GCV_SCOPE = "https://www.googleapis.com/auth/cloud-vision";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const VISION_ENDPOINT = "https://vision.googleapis.com/v1/images:annotate";

const base64UrlEncode = (input: Uint8Array) => {
  let binary = "";
  input.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const pemToArrayBuffer = (pem: string) => {
  const base64 = pem.replace(/-----\w+ PRIVATE KEY-----/g, "").replace(/\s+/g, "");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
};

const decodeServiceAccount = () => {
  const raw = Deno.env.get("GCV_SERVICE_ACCOUNT_JSON") || "";
  if (!raw) return null;

  let jsonText = raw.trim();
  if (!jsonText.startsWith("{")) {
    try {
      jsonText = atob(jsonText);
    } catch {
      // Keep original; will fail JSON parse below.
    }
  }

  try {
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
};

const getAccessToken = async () => {
  const serviceAccount = decodeServiceAccount();
  if (!serviceAccount?.client_email || !serviceAccount?.private_key) {
    throw new Error("Missing or invalid GCV_SERVICE_ACCOUNT_JSON");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: serviceAccount.client_email,
    scope: GCV_SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };

  const encoder = new TextEncoder();
  const headerEncoded = base64UrlEncode(encoder.encode(JSON.stringify(header)));
  const payloadEncoded = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const signingInput = `${headerEncoded}.${payloadEncoded}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(serviceAccount.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    encoder.encode(signingInput),
  );

  const jwt = `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;

  const tokenResp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!tokenResp.ok) {
    throw new Error(`Failed to fetch GCV token: ${tokenResp.status}`);
  }

  const tokenBody = await tokenResp.json();
  return tokenBody.access_token as string;
};

export const sha256Hex = async (data: Uint8Array) => {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

export const sha256HexString = async (text: string) => {
  return sha256Hex(new TextEncoder().encode(text));
};

export const fetchSlipBytes = async (url: string, maxBytes: number) => {
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Failed to fetch slip image: ${resp.status}`);
  }

  const contentLength = resp.headers.get("content-length");
  if (contentLength && Number(contentLength) > maxBytes) {
    throw new Error("Slip image exceeds size limit");
  }

  const buffer = new Uint8Array(await resp.arrayBuffer());
  if (buffer.length > maxBytes) {
    throw new Error("Slip image exceeds size limit");
  }

  return buffer;
};

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary);
};

export const detectTextFromImage = async (imageBytes: Uint8Array) => {
  const token = await getAccessToken();
  const requestBody = {
    requests: [
      {
        image: { content: bytesToBase64(imageBytes) },
        features: [{ type: "TEXT_DETECTION" }],
      },
    ],
  };

  const resp = await fetch(VISION_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!resp.ok) {
    throw new Error(`Vision API error: ${resp.status}`);
  }

  const body = await resp.json();
  const annotations = body?.responses?.[0] || {};
  const text =
    annotations?.fullTextAnnotation?.text ||
    annotations?.textAnnotations?.[0]?.description ||
    "";

  return { text, raw: annotations };
};
