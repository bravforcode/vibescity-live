/**
 * Health Check System - System Health Monitoring
 *
 * Features:
 * - API health checks
 * - Database connectivity
 * - Service availability
 * - Performance metrics
 * - Automatic alerts
 */

export class HealthCheckSystem {
	constructor(options = {}) {
		this.options = {
			checkInterval: 60000, // 1 minute
			timeout: 5000, // 5 seconds
			retries: 3,
			endpoints: [],
			onHealthChange: null,
			onUnhealthy: null,
			...options,
		};

		this.health = {
			status: "unknown",
			checks: {},
			lastCheck: null,
		};

		this.checkTimer = null;
		this.isRunning = false;
	}

	// Start monitoring
	start() {
		if (this.isRunning) return;
		this.isRunning = true;

		// Initial check
		this.runHealthChecks();

		// Periodic checks
		this.checkTimer = setInterval(() => {
			this.runHealthChecks();
		}, this.options.checkInterval);

		console.log("[HealthCheck] Started monitoring");
	}

	// Stop monitoring
	stop() {
		this.isRunning = false;

		if (this.checkTimer) {
			clearInterval(this.checkTimer);
			this.checkTimer = null;
		}

		console.log("[HealthCheck] Stopped monitoring");
	}

	// Run all health checks
	async runHealthChecks() {
		const checks = await Promise.all([
			this.checkAPI(),
			this.checkDatabase(),
			this.checkServices(),
			this.checkPerformance(),
			this.checkStorage(),
		]);

		const allHealthy = checks.every((check) => check.healthy);

		const previousStatus = this.health.status;
		this.health = {
			status: allHealthy ? "healthy" : "unhealthy",
			checks: {
				api: checks[0],
				database: checks[1],
				services: checks[2],
				performance: checks[3],
				storage: checks[4],
			},
			lastCheck: Date.now(),
		};

		// Status changed
		if (previousStatus !== this.health.status) {
			this.handleHealthChange(previousStatus, this.health.status);
		}

		// Unhealthy
		if (!allHealthy && this.options.onUnhealthy) {
			this.options.onUnhealthy(this.health);
		}

		return this.health;
	}

	// Check API health
	async checkAPI() {
		const endpoints =
			this.options.endpoints.length > 0
				? this.options.endpoints
				: ["/api/health", "/api/status"];

		const results = await Promise.all(
			endpoints.map((endpoint) => this.checkEndpoint(endpoint)),
		);

		const healthy = results.every((r) => r.healthy);

		return {
			healthy,
			endpoints: results,
			timestamp: Date.now(),
		};
	}

	// Check single endpoint
	async checkEndpoint(endpoint) {
		let attempt = 0;
		let lastError = null;

		while (attempt < this.options.retries) {
			try {
				const controller = new AbortController();
				const timeoutId = setTimeout(
					() => controller.abort(),
					this.options.timeout,
				);

				const startTime = performance.now();
				const response = await fetch(endpoint, {
					signal: controller.signal,
				});
				const duration = performance.now() - startTime;

				clearTimeout(timeoutId);

				return {
					endpoint,
					healthy: response.ok,
					status: response.status,
					duration,
					attempt: attempt + 1,
				};
			} catch (error) {
				lastError = error;
				attempt++;
				await new Promise((resolve) => setTimeout(resolve, 1000));
			}
		}

		return {
			endpoint,
			healthy: false,
			error: lastError?.message,
			attempt,
		};
	}

	// Check database connectivity
	async checkDatabase() {
		// ปิดการตรวจสอบ Supabase ใน dev mode เพราะจะทำให้ช้า
		if (import.meta.env.DEV) {
			return {
				healthy: true,
				skipped: true,
				reason: "Skipped in development mode",
				timestamp: Date.now(),
			};
		}

		try {
			const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
			const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
			if (!supabaseUrl || supabaseUrl.includes("your-project")) {
				return {
					healthy: true,
					skipped: true,
					reason: "Supabase not configured",
					timestamp: Date.now(),
				};
			}

			// Check if Supabase is accessible
			const startTime = performance.now();
			const response = await fetch(`${supabaseUrl}/rest/v1/`, {
				method: "HEAD",
				headers: supabaseAnonKey
					? {
							apikey: supabaseAnonKey,
							Authorization: `Bearer ${supabaseAnonKey}`,
						}
					: undefined,
				signal: AbortSignal.timeout(this.options.timeout),
			});
			const duration = performance.now() - startTime;

			return {
				healthy: response.ok,
				duration,
				timestamp: Date.now(),
			};
		} catch (error) {
			return {
				healthy: true, // ไม่ให้ fail ถ้า Supabase ไม่ได้ตั้งค่า
				skipped: true,
				error: error.message,
				timestamp: Date.now(),
			};
		}
	}

	// Check services
	async checkServices() {
		const services = {
			localStorage: this.checkLocalStorage(),
			sessionStorage: this.checkSessionStorage(),
			indexedDB: await this.checkIndexedDB(),
			serviceWorker: this.checkServiceWorker(),
		};

		const healthy = Object.values(services).every((s) => s.available);

		return {
			healthy,
			services,
			timestamp: Date.now(),
		};
	}

	// Check localStorage
	checkLocalStorage() {
		try {
			const test = "__test__";
			localStorage.setItem(test, test);
			localStorage.removeItem(test);
			return { available: true };
		} catch (error) {
			return { available: false, error: error.message };
		}
	}

	// Check sessionStorage
	checkSessionStorage() {
		try {
			const test = "__test__";
			sessionStorage.setItem(test, test);
			sessionStorage.removeItem(test);
			return { available: true };
		} catch (error) {
			return { available: false, error: error.message };
		}
	}

	// Check IndexedDB
	async checkIndexedDB() {
		try {
			if (!("indexedDB" in window)) {
				return { available: false, error: "Not supported" };
			}

			const request = indexedDB.open("__test__", 1);
			await new Promise((resolve, reject) => {
				request.onsuccess = resolve;
				request.onerror = reject;
			});

			indexedDB.deleteDatabase("__test__");
			return { available: true };
		} catch (error) {
			return { available: false, error: error.message };
		}
	}

	// Check Service Worker
	checkServiceWorker() {
		try {
			if (!("serviceWorker" in navigator)) {
				return { available: false, error: "Not supported" };
			}

			return {
				available: true,
				registered: navigator.serviceWorker.controller !== null,
			};
		} catch (error) {
			return { available: false, error: error.message };
		}
	}

	// Check performance
	async checkPerformance() {
		const metrics = {
			memory: this.checkMemory(),
			fps: this.checkFPS(),
			loadTime: this.checkLoadTime(),
		};

		// Define thresholds
		const thresholds = {
			memory: 100 * 1024 * 1024, // 100MB
			fps: 30,
			loadTime: 3000, // 3s
		};

		const healthy =
			(!metrics.memory.used || metrics.memory.used < thresholds.memory) &&
			(!metrics.fps.current || metrics.fps.current >= thresholds.fps) &&
			(!metrics.loadTime || metrics.loadTime < thresholds.loadTime);

		return {
			healthy,
			metrics,
			thresholds,
			timestamp: Date.now(),
		};
	}

	// Check memory
	checkMemory() {
		if (!performance.memory) {
			return { available: false };
		}

		return {
			available: true,
			used: performance.memory.usedJSHeapSize,
			total: performance.memory.totalJSHeapSize,
			limit: performance.memory.jsHeapSizeLimit,
		};
	}

	// Check FPS
	checkFPS() {
		// This would need to be integrated with FPS monitor
		return {
			available: false,
			current: null,
		};
	}

	// Check load time
	checkLoadTime() {
		if (!performance.timing) return null;

		return performance.timing.loadEventEnd - performance.timing.navigationStart;
	}

	// Check storage
	async checkStorage() {
		try {
			if (!navigator.storage || !navigator.storage.estimate) {
				return {
					healthy: true,
					available: false,
				};
			}

			const estimate = await navigator.storage.estimate();
			const usage = estimate.usage || 0;
			const quota = estimate.quota || 0;
			const percentUsed = quota > 0 ? (usage / quota) * 100 : 0;

			return {
				healthy: percentUsed < 80, // Alert if > 80%
				usage,
				quota,
				percentUsed,
				timestamp: Date.now(),
			};
		} catch (error) {
			return {
				healthy: false,
				error: error.message,
				timestamp: Date.now(),
			};
		}
	}

	// Handle health change
	handleHealthChange(previousStatus, currentStatus) {
		console.log(
			`[HealthCheck] Status changed: ${previousStatus} -> ${currentStatus}`,
		);

		if (this.options.onHealthChange) {
			this.options.onHealthChange(previousStatus, currentStatus, this.health);
		}
	}

	// Get current health
	getHealth() {
		return this.health;
	}

	// Is healthy
	isHealthy() {
		return this.health.status === "healthy";
	}
}

// Singleton instance
let healthCheckInstance = null;

export function useHealthCheck(options) {
	if (!healthCheckInstance) {
		healthCheckInstance = new HealthCheckSystem(options);
	}
	return healthCheckInstance;
}
