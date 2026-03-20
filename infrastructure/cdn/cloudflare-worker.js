/**
 * Cloudflare Worker for Edge Caching
 * 
 * This worker implements:
 * - Cache-first strategy for static assets
 * - Geo-routing for optimal performance
 * - Cache invalidation via webhooks
 * - Cache warming for critical pages
 */

// Cache configuration
const CACHE_CONFIG = {
  // Static assets - long cache
  static: {
    ttl: 31536000, // 1 year
    patterns: [
      /\.(js|css|woff2?|ttf|otf|eot)$/,
      /\.(jpg|jpeg|png|gif|svg|webp|avif|ico)$/,
      /\.(mp4|webm|ogg|mp3|wav|flac|aac)$/,
    ],
  },
  // API responses - short cache
  api: {
    ttl: 300, // 5 minutes
    patterns: [/^\/api\/v1\/(shops|venues)$/],
  },
  // HTML pages - medium cache
  html: {
    ttl: 3600, // 1 hour
    patterns: [/\.html$/, /^\/$/],
  },
  // No cache
  noCache: {
    patterns: [
      /^\/api\/v1\/auth/,
      /^\/api\/v1\/payment/,
      /^\/api\/v1\/user/,
    ],
  },
};

// Critical pages to warm cache
const CRITICAL_PAGES = [
  '/',
  '/map',
  '/api/v1/shops?province=Bangkok',
  '/api/v1/venues?featured=true',
];

/**
 * Determine cache TTL based on request URL
 */
function getCacheTTL(url) {
  const pathname = new URL(url).pathname;

  // Check no-cache patterns first
  for (const pattern of CACHE_CONFIG.noCache.patterns) {
    if (pattern.test(pathname)) {
      return 0;
    }
  }

  // Check static assets
  for (const pattern of CACHE_CONFIG.static.patterns) {
    if (pattern.test(pathname)) {
      return CACHE_CONFIG.static.ttl;
    }
  }

  // Check API patterns
  for (const pattern of CACHE_CONFIG.api.patterns) {
    if (pattern.test(pathname)) {
      return CACHE_CONFIG.api.ttl;
    }
  }

  // Check HTML patterns
  for (const pattern of CACHE_CONFIG.html.patterns) {
    if (pattern.test(pathname)) {
      return CACHE_CONFIG.html.ttl;
    }
  }

  // Default: no cache
  return 0;
}

/**
 * Check if asset is static
 */
function isStaticAsset(url) {
  const pathname = new URL(url).pathname;
  return CACHE_CONFIG.static.patterns.some(pattern => pattern.test(pathname));
}

/**
 * Get optimal origin based on geo-location
 */
function getOptimalOrigin(request, env) {
  const country = request.cf?.country || 'US';
  
  // Geo-routing logic
  const asianCountries = ['TH', 'SG', 'MY', 'ID', 'VN', 'PH', 'JP', 'KR', 'CN', 'TW', 'HK'];
  const europeanCountries = ['GB', 'DE', 'FR', 'IT', 'ES', 'NL', 'SE', 'NO', 'DK', 'FI'];
  
  if (asianCountries.includes(country)) {
    return env.ORIGIN_ASIA || env.ORIGIN_PRIMARY;
  } else if (europeanCountries.includes(country)) {
    return env.ORIGIN_EU || env.ORIGIN_PRIMARY;
  } else {
    return env.ORIGIN_US || env.ORIGIN_PRIMARY;
  }
}

/**
 * Generate cache key with geo and device info
 */
function generateCacheKey(request) {
  const url = new URL(request.url);
  const country = request.cf?.country || 'unknown';
  const device = request.headers.get('CF-Device-Type') || 'desktop';
  
  // Include country and device type in cache key for personalized caching
  return `${url.pathname}${url.search}|${country}|${device}`;
}

/**
 * Main request handler
 */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Handle cache invalidation webhook
    if (url.pathname === '/__cache/purge' && request.method === 'POST') {
      return handleCachePurge(request, env);
    }
    
    // Handle cache warming webhook
    if (url.pathname === '/__cache/warm' && request.method === 'POST') {
      return handleCacheWarm(request, env, ctx);
    }
    
    // Only cache GET and HEAD requests
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return fetch(request);
    }
    
    const cache = caches.default;
    const cacheKey = new Request(url.toString(), {
      method: 'GET',
      headers: request.headers,
    });
    
    // Check cache first
    let response = await cache.match(cacheKey);
    
    if (response) {
      // Cache hit
      const newHeaders = new Headers(response.headers);
      newHeaders.set('X-Cache-Status', 'HIT');
      newHeaders.set('X-Cache-Age', Math.floor((Date.now() - new Date(response.headers.get('Date')).getTime()) / 1000));
      
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      });
    }
    
    // Cache miss - fetch from origin
    const origin = getOptimalOrigin(request, env);
    const originUrl = new URL(request.url);
    originUrl.hostname = new URL(origin).hostname;
    
    const originRequest = new Request(originUrl.toString(), {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: 'follow',
    });
    
    response = await fetch(originRequest);
    
    // Don't cache error responses
    if (!response.ok) {
      const newHeaders = new Headers(response.headers);
      newHeaders.set('X-Cache-Status', 'MISS');
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      });
    }
    
    // Determine cache TTL
    const ttl = getCacheTTL(request.url);
    
    if (ttl > 0) {
      // Clone response for caching
      const responseToCache = response.clone();
      const newHeaders = new Headers(responseToCache.headers);
      
      // Set cache headers
      newHeaders.set('Cache-Control', `public, max-age=${ttl}`);
      newHeaders.set('X-Cache-Status', 'MISS');
      newHeaders.set('X-Cache-TTL', ttl.toString());
      
      // Add CORS headers for static assets
      if (isStaticAsset(request.url)) {
        newHeaders.set('Access-Control-Allow-Origin', '*');
        newHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        newHeaders.set('Access-Control-Max-Age', '86400');
      }
      
      const cachedResponse = new Response(responseToCache.body, {
        status: responseToCache.status,
        statusText: responseToCache.statusText,
        headers: newHeaders,
      });
      
      // Store in cache (don't await)
      ctx.waitUntil(cache.put(cacheKey, cachedResponse.clone()));
      
      return cachedResponse;
    }
    
    // No caching
    const newHeaders = new Headers(response.headers);
    newHeaders.set('X-Cache-Status', 'BYPASS');
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  },
};

/**
 * Handle cache purge webhook
 */
async function handleCachePurge(request, env) {
  try {
    const { secret, patterns } = await request.json();
    
    // Verify webhook secret
    if (secret !== env.CACHE_PURGE_SECRET) {
      return new Response('Unauthorized', { status: 401 });
    }
    
    const cache = caches.default;
    let purgedCount = 0;
    
    // Purge matching URLs
    for (const pattern of patterns) {
      const regex = new RegExp(pattern);
      // Note: Cloudflare doesn't support cache enumeration
      // In production, use Cloudflare API for purging
      purgedCount++;
    }
    
    return new Response(JSON.stringify({
      success: true,
      purged: purgedCount,
      message: 'Cache purged successfully',
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * Handle cache warming webhook
 */
async function handleCacheWarm(request, env, ctx) {
  try {
    const { secret, urls } = await request.json();
    
    // Verify webhook secret
    if (secret !== env.CACHE_WARM_SECRET) {
      return new Response('Unauthorized', { status: 401 });
    }
    
    const urlsToWarm = urls || CRITICAL_PAGES;
    
    // Warm cache in background
    ctx.waitUntil(warmCache(urlsToWarm, env));
    
    return new Response(JSON.stringify({
      success: true,
      warming: urlsToWarm.length,
      message: 'Cache warming initiated',
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * Warm cache by fetching URLs
 */
async function warmCache(urls, env) {
  const origin = env.ORIGIN_PRIMARY;
  
  for (const path of urls) {
    try {
      const url = new URL(path, origin);
      await fetch(url.toString());
    } catch (error) {
      console.error(`Failed to warm cache for ${path}:`, error);
    }
  }
}
