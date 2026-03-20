/**
 * Security Headers Configuration
 *
 * Implements security best practices:
 * - Content Security Policy (CSP)
 * - HSTS
 * - XSS Protection
 * - Frame Options
 * - CORS
 */

export const SECURITY_HEADERS = {
	// Content Security Policy
	"Content-Security-Policy": [
		"default-src 'self'",
		"script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://unpkg.com https://www.clarity.ms https://browser.sentry-cdn.com",
		"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net",
		"font-src 'self' https://fonts.gstatic.com data:",
		"img-src 'self' data: blob: https: http:",
		"connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.mapbox.com https://events.mapbox.com https://www.clarity.ms https://sentry.io",
		"worker-src 'self' blob:",
		"frame-src 'self'",
		"object-src 'none'",
		"base-uri 'self'",
		"form-action 'self'",
		"frame-ancestors 'none'",
		"upgrade-insecure-requests",
	].join("; "),

	// HTTP Strict Transport Security
	"Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",

	// Prevent MIME type sniffing
	"X-Content-Type-Options": "nosniff",

	// XSS Protection
	"X-XSS-Protection": "1; mode=block",

	// Frame Options
	"X-Frame-Options": "DENY",

	// Referrer Policy
	"Referrer-Policy": "strict-origin-when-cross-origin",

	// Permissions Policy
	"Permissions-Policy": [
		"camera=()",
		"microphone=()",
		"geolocation=(self)",
		"payment=()",
		"usb=()",
	].join(", "),
};

// CSP Report URI (for monitoring violations)
export const CSP_REPORT_URI = "/api/csp-report";

// Nonce generator for inline scripts
export function generateNonce() {
	const array = new Uint8Array(16);
	crypto.getRandomValues(array);
	return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join(
		"",
	);
}

// Apply security headers to response
export function applySecurityHeaders(headers = {}) {
	return {
		...headers,
		...SECURITY_HEADERS,
	};
}

// Validate CSP
export function validateCSP(csp) {
	const required = [
		"default-src",
		"script-src",
		"style-src",
		"img-src",
		"connect-src",
	];

	const directives = csp.split(";").map((d) => d.trim().split(" ")[0]);

	for (const directive of required) {
		if (!directives.includes(directive)) {
			console.warn(`[Security] Missing CSP directive: ${directive}`);
			return false;
		}
	}

	return true;
}
