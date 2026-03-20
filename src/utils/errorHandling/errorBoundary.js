/**
 * Error Boundary - Global Error Handling
 *
 * Features:
 * - Catch and handle errors
 * - Error reporting
 * - Fallback UI
 * - Error recovery
 * - Error categorization
 */

import { h } from "vue";

export class ErrorBoundary {
	constructor(options = {}) {
		this.options = {
			onError: null,
			fallback: null,
			enableRecovery: true,
			maxRetries: 3,
			retryDelay: 1000,
			...options,
		};

		this.errors = [];
		this.retryCount = new Map();
	}

	// Handle error
	handleError(error, instance, info) {
		const errorData = {
			error,
			instance,
			info,
			timestamp: Date.now(),
			url: window.location.href,
			userAgent: navigator.userAgent,
		};

		this.errors.push(errorData);

		// Log error
		console.error("[ErrorBoundary]", error, info);

		// Report error
		if (this.options.onError) {
			this.options.onError(errorData);
		}

		// Send to Sentry
		if (window.Sentry) {
			window.Sentry.captureException(error, {
				extra: { info, instance },
			});
		}

		// Attempt recovery
		if (this.options.enableRecovery) {
			this.attemptRecovery(error, instance);
		}
	}

	// Attempt recovery
	async attemptRecovery(error, instance) {
		const key = error.message;
		const retries = this.retryCount.get(key) || 0;

		if (retries >= this.options.maxRetries) {
			console.error("[ErrorBoundary] Max retries reached for:", key);
			return false;
		}

		this.retryCount.set(key, retries + 1);

		// Wait before retry
		await new Promise((resolve) =>
			setTimeout(resolve, this.options.retryDelay),
		);

		// Attempt to recover
		try {
			if (instance?.$forceUpdate) {
				instance.$forceUpdate();
				console.log("[ErrorBoundary] Recovery successful");
				return true;
			}
		} catch (recoveryError) {
			console.error("[ErrorBoundary] Recovery failed:", recoveryError);
		}

		return false;
	}

	// Get errors
	getErrors() {
		return this.errors;
	}

	// Clear errors
	clearErrors() {
		this.errors = [];
		this.retryCount.clear();
	}
}

// Vue Error Boundary Component
export const VueErrorBoundary = {
	name: "ErrorBoundary",
	props: {
		fallback: {
			type: [Object, Function],
			default: null,
		},
		onError: {
			type: Function,
			default: null,
		},
	},
	data() {
		return {
			error: null,
			errorInfo: null,
		};
	},
	errorCaptured(error, instance, info) {
		this.error = error;
		this.errorInfo = info;

		// Call error handler
		if (this.onError) {
			this.onError(error, instance, info);
		}

		// Prevent error from propagating
		return false;
	},
	render() {
		if (this.error) {
			// Render fallback
			if (this.fallback) {
				if (typeof this.fallback === "function") {
					return this.fallback(this.error, this.errorInfo);
				}
				return h(this.fallback, {
					error: this.error,
					errorInfo: this.errorInfo,
				});
			}

			// Default fallback
			return h("div", { class: "error-boundary" }, [
				h("h2", "เกิดข้อผิดพลาด"),
				h("p", this.error.message),
				h(
					"button",
					{
						onClick: () => {
							this.error = null;
							this.errorInfo = null;
						},
					},
					"ลองอีกครั้ง",
				),
			]);
		}

		// Render children
		return this.$slots.default?.();
	},
};

// Global error handler
export function setupGlobalErrorHandler(app, options = {}) {
	const boundary = new ErrorBoundary(options);

	// Vue error handler
	app.config.errorHandler = (error, instance, info) => {
		boundary.handleError(error, instance, info);
	};

	// Window error handler
	window.addEventListener("error", (event) => {
		boundary.handleError(event.error, null, "window.error");
	});

	// Unhandled promise rejection
	window.addEventListener("unhandledrejection", (event) => {
		boundary.handleError(event.reason, null, "unhandledrejection");
	});

	return boundary;
}

// Error categorization
export function categorizeError(error) {
	const message = error.message?.toLowerCase() || "";

	if (message.includes("network") || message.includes("fetch")) {
		return "network";
	}

	if (message.includes("timeout")) {
		return "timeout";
	}

	if (message.includes("permission") || message.includes("denied")) {
		return "permission";
	}

	if (message.includes("not found") || message.includes("404")) {
		return "not_found";
	}

	if (message.includes("unauthorized") || message.includes("401")) {
		return "unauthorized";
	}

	if (message.includes("syntax") || message.includes("parse")) {
		return "syntax";
	}

	return "unknown";
}

// Error recovery strategies
export const RecoveryStrategies = {
	network: async () => {
		// Wait and retry
		await new Promise((resolve) => setTimeout(resolve, 2000));
		return true;
	},

	timeout: async () => {
		// Increase timeout and retry
		await new Promise((resolve) => setTimeout(resolve, 5000));
		return true;
	},

	permission: async () => {
		// Request permission again
		return false; // Cannot auto-recover
	},

	not_found: async () => {
		// Redirect to home
		window.location.href = "/";
		return true;
	},

	unauthorized: async () => {
		// Redirect to login
		window.location.href = "/login";
		return true;
	},

	syntax: async () => {
		// Cannot auto-recover
		return false;
	},

	unknown: async () => {
		// Reload page
		window.location.reload();
		return true;
	},
};
