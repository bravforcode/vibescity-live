/**
 * Input Sanitizer - XSS Prevention
 *
 * Features:
 * - HTML sanitization
 * - SQL injection prevention
 * - Path traversal prevention
 * - Command injection prevention
 * - URL validation
 */

import DOMPurify from "dompurify";

// HTML Sanitization
export function sanitizeHTML(dirty, options = {}) {
	const config = {
		ALLOWED_TAGS: ["b", "i", "em", "strong", "a", "p", "br", "ul", "ol", "li"],
		ALLOWED_ATTR: ["href", "title", "target"],
		ALLOW_DATA_ATTR: false,
		...options,
	};

	return DOMPurify.sanitize(dirty, config);
}

// Strict HTML sanitization (no tags allowed)
export function sanitizeText(dirty) {
	return DOMPurify.sanitize(dirty, {
		ALLOWED_TAGS: [],
		ALLOWED_ATTR: [],
	});
}

// SQL Injection Prevention
export function sanitizeSQL(input) {
	if (typeof input !== "string") return input;

	// Remove SQL keywords and special characters
	const dangerous = [
		"--",
		";",
		"/*",
		"*/",
		"@@",
		"@",
		"char",
		"nchar",
		"varchar",
		"nvarchar",
		"alter",
		"begin",
		"cast",
		"create",
		"cursor",
		"declare",
		"delete",
		"drop",
		"end",
		"exec",
		"execute",
		"fetch",
		"insert",
		"kill",
		"select",
		"sys",
		"sysobjects",
		"syscolumns",
		"table",
		"update",
	];

	let sanitized = input;
	for (const keyword of dangerous) {
		const regex = new RegExp(keyword, "gi");
		sanitized = sanitized.replace(regex, "");
	}

	return sanitized.trim();
}

// Path Traversal Prevention
export function sanitizePath(path) {
	if (typeof path !== "string") return "";

	// Remove path traversal attempts
	return path
		.replace(/\.\./g, "")
		.replace(/[/\\]/g, "")
		.replace(/^\.+/, "")
		.trim();
}

// Command Injection Prevention
export function sanitizeCommand(input) {
	if (typeof input !== "string") return "";

	// Remove shell metacharacters
	const dangerous = [
		"|",
		"&",
		";",
		"$",
		"`",
		"\n",
		"\r",
		"(",
		")",
		"<",
		">",
		"\\",
	];

	let sanitized = input;
	for (const char of dangerous) {
		sanitized = sanitized.replace(new RegExp(`\\${char}`, "g"), "");
	}

	return sanitized.trim();
}

// URL Validation
export function isValidURL(url) {
	try {
		const parsed = new URL(url);
		// Only allow http and https
		return ["http:", "https:"].includes(parsed.protocol);
	} catch {
		return false;
	}
}

// Email Validation
export function isValidEmail(email) {
	const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	return regex.test(email);
}

// Phone Number Validation (Thai format)
export function isValidThaiPhone(phone) {
	const regex = /^(\+66|0)[0-9]{9}$/;
	return regex.test(phone.replace(/[-\s]/g, ""));
}

// Sanitize Object (recursive)
export function sanitizeObject(obj, options = {}) {
	if (obj === null || obj === undefined) return obj;

	if (typeof obj === "string") {
		return options.strict ? sanitizeText(obj) : sanitizeHTML(obj, options);
	}

	if (Array.isArray(obj)) {
		return obj.map((item) => sanitizeObject(item, options));
	}

	if (typeof obj === "object") {
		const sanitized = {};
		for (const [key, value] of Object.entries(obj)) {
			sanitized[key] = sanitizeObject(value, options);
		}
		return sanitized;
	}

	return obj;
}

// Rate Limiting Token Bucket
export class RateLimiter {
	constructor(maxTokens = 100, refillRate = 10) {
		this.maxTokens = maxTokens;
		this.tokens = maxTokens;
		this.refillRate = refillRate; // tokens per second
		this.lastRefill = Date.now();
	}

	// Try to consume tokens
	tryConsume(tokens = 1) {
		this.refill();

		if (this.tokens >= tokens) {
			this.tokens -= tokens;
			return true;
		}

		return false;
	}

	// Refill tokens
	refill() {
		const now = Date.now();
		const elapsed = (now - this.lastRefill) / 1000;
		const tokensToAdd = elapsed * this.refillRate;

		this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
		this.lastRefill = now;
	}

	// Get remaining tokens
	getRemaining() {
		this.refill();
		return Math.floor(this.tokens);
	}
}

// CSRF Token Generator
export function generateCSRFToken() {
	const array = new Uint8Array(32);
	crypto.getRandomValues(array);
	return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join(
		"",
	);
}

// Validate CSRF Token
export function validateCSRFToken(token, storedToken) {
	if (!token || !storedToken) return false;
	return token === storedToken;
}
