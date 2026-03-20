/**
 * Performance Monitor - Real-time Performance Tracking
 *
 * Features:
 * - FPS monitoring
 * - Memory tracking
 * - Network performance
 * - Core Web Vitals (LCP, FID, CLS)
 * - Custom metrics
 * - Performance budgets
 * - Automatic alerts
 */

class PerformanceMonitor {
	constructor(options = {}) {
		this.options = {
			enableFPS: false, // ปิดเพื่อลดภาระ
			enableMemory: false, // ปิดเพื่อลดภาระ
			enableNetwork: false, // ปิดเพื่อลดภาระ
			enableWebVitals: true, // เปิดเฉพาะ Web Vitals
			sampleRate: 0.1, // ลดเหลือ 10% sampling
			reportInterval: 60000, // เพิ่มเป็น 60 วินาที
			budgets: {
				fps: { min: 30, target: 60 },
				memory: { max: 4 * 1024 * 1024 * 1024 }, // เพิ่มเป็น 4GB
				lcp: { max: 2500 }, // 2.5s
				fid: { max: 100 }, // 100ms
				cls: { max: 0.1 },
			},
			onMetric: null,
			onBudgetExceeded: null,
			...options,
		};

		this.metrics = {
			fps: [],
			memory: [],
			network: [],
			webVitals: {},
			custom: {},
		};

		this.observers = [];
		this.isMonitoring = false;
		this.reportTimer = null;
	}

	// Start monitoring
	start() {
		if (this.isMonitoring) return;
		this.isMonitoring = true;

		if (this.options.enableFPS) {
			this.startFPSMonitoring();
		}

		if (this.options.enableMemory) {
			this.startMemoryMonitoring();
		}

		if (this.options.enableNetwork) {
			this.startNetworkMonitoring();
		}

		if (this.options.enableWebVitals) {
			this.startWebVitalsMonitoring();
		}

		// Start periodic reporting
		this.reportTimer = setInterval(() => {
			this.report();
		}, this.options.reportInterval);

		console.log("[PerformanceMonitor] Started monitoring");
	}

	// Stop monitoring
	stop() {
		this.isMonitoring = false;

		// Clear observers
		for (const observer of this.observers) {
			observer.disconnect();
		}
		this.observers = [];

		// Clear timers
		if (this.reportTimer) {
			clearInterval(this.reportTimer);
			this.reportTimer = null;
		}

		console.log("[PerformanceMonitor] Stopped monitoring");
	}

	// FPS Monitoring
	startFPSMonitoring() {
		let lastTime = performance.now();
		let frames = 0;

		const measureFPS = () => {
			if (!this.isMonitoring) return;

			frames++;
			const currentTime = performance.now();
			const elapsed = currentTime - lastTime;

			if (elapsed >= 1000) {
				const fps = Math.round((frames * 1000) / elapsed);
				this.recordMetric("fps", fps);

				// Check budget
				if (fps < this.options.budgets.fps.min) {
					this.handleBudgetExceeded("fps", fps, this.options.budgets.fps.min);
				}

				frames = 0;
				lastTime = currentTime;
			}

			requestAnimationFrame(measureFPS);
		};

		requestAnimationFrame(measureFPS);
	}

	// Memory Monitoring
	startMemoryMonitoring() {
		if (!performance.memory) {
			console.warn("[PerformanceMonitor] Memory API not available");
			return;
		}

		const measureMemory = () => {
			if (!this.isMonitoring) return;

			const memory = {
				used: performance.memory.usedJSHeapSize,
				total: performance.memory.totalJSHeapSize,
				limit: performance.memory.jsHeapSizeLimit,
				timestamp: Date.now(),
			};

			this.recordMetric("memory", memory);

			// Check budget - แต่ไม่แจ้งเตือนถ้าเกินเล็กน้อย
			const threshold = this.options.budgets.memory.max * 1.5; // ให้เผื่อ 50%
			if (memory.used > threshold) {
				this.handleBudgetExceeded(
					"memory",
					memory.used,
					this.options.budgets.memory.max,
				);
			}

			setTimeout(measureMemory, 30000); // ลดเหลือทุก 30 วินาที
		};

		measureMemory();
	}

	// Network Monitoring
	startNetworkMonitoring() {
		if (!("PerformanceObserver" in window)) return;

		const observer = new PerformanceObserver((list) => {
			for (const entry of list.getEntries()) {
				if (entry.entryType === "resource") {
					this.recordMetric("network", {
						name: entry.name,
						duration: entry.duration,
						size: entry.transferSize,
						type: entry.initiatorType,
						timestamp: entry.startTime,
					});
				}
			}
		});

		observer.observe({ entryTypes: ["resource"] });
		this.observers.push(observer);
	}

	// Web Vitals Monitoring
	startWebVitalsMonitoring() {
		// LCP - Largest Contentful Paint
		this.observeWebVital("largest-contentful-paint", (entry) => {
			const lcp = entry.renderTime || entry.loadTime;
			this.metrics.webVitals.lcp = lcp;
			this.recordMetric("webVitals", { metric: "lcp", value: lcp });

			if (lcp > this.options.budgets.lcp.max) {
				this.handleBudgetExceeded("lcp", lcp, this.options.budgets.lcp.max);
			}
		});

		// FID - First Input Delay
		this.observeWebVital("first-input", (entry) => {
			const fid = entry.processingStart - entry.startTime;
			this.metrics.webVitals.fid = fid;
			this.recordMetric("webVitals", { metric: "fid", value: fid });

			if (fid > this.options.budgets.fid.max) {
				this.handleBudgetExceeded("fid", fid, this.options.budgets.fid.max);
			}
		});

		// CLS - Cumulative Layout Shift
		let clsValue = 0;
		this.observeWebVital("layout-shift", (entry) => {
			if (!entry.hadRecentInput) {
				clsValue += entry.value;
				this.metrics.webVitals.cls = clsValue;
				this.recordMetric("webVitals", { metric: "cls", value: clsValue });

				if (clsValue > this.options.budgets.cls.max) {
					this.handleBudgetExceeded(
						"cls",
						clsValue,
						this.options.budgets.cls.max,
					);
				}
			}
		});

		// TTFB - Time to First Byte
		if (performance.timing) {
			const ttfb =
				performance.timing.responseStart - performance.timing.requestStart;
			this.metrics.webVitals.ttfb = ttfb;
			this.recordMetric("webVitals", { metric: "ttfb", value: ttfb });
		}
	}

	// Observe Web Vital
	observeWebVital(type, callback) {
		if (!("PerformanceObserver" in window)) return;

		try {
			const observer = new PerformanceObserver((list) => {
				for (const entry of list.getEntries()) {
					callback(entry);
				}
			});

			observer.observe({ type, buffered: true });
			this.observers.push(observer);
		} catch (e) {
			console.warn(`[PerformanceMonitor] Could not observe ${type}:`, e);
		}
	}

	// Record metric
	recordMetric(category, value) {
		if (Math.random() > this.options.sampleRate) return;

		const metric = {
			value,
			timestamp: Date.now(),
		};

		if (Array.isArray(this.metrics[category])) {
			this.metrics[category].push(metric);

			// Keep only last 100 entries
			if (this.metrics[category].length > 100) {
				this.metrics[category].shift();
			}
		} else {
			this.metrics[category] = metric;
		}

		// Callback
		if (this.options.onMetric) {
			this.options.onMetric(category, metric);
		}
	}

	// Handle budget exceeded
	handleBudgetExceeded(metric, actual, budget) {
		// ไม่ log ถ้าเป็น memory เพราะจะทำให้ช้า
		if (metric !== "memory") {
			console.warn(`[Performance] Budget exceeded: ${metric}`, {
				actual,
				budget,
			});
		}

		if (this.options.onBudgetExceeded) {
			this.options.onBudgetExceeded(metric, actual, budget);
		}
	}

	// Custom metric
	recordCustomMetric(name, value, metadata = {}) {
		this.metrics.custom[name] = {
			value,
			metadata,
			timestamp: Date.now(),
		};

		this.recordMetric("custom", { name, value, metadata });
	}

	// Mark timing
	mark(name) {
		performance.mark(name);
	}

	// Measure between marks
	measure(name, startMark, endMark) {
		try {
			performance.measure(name, startMark, endMark);
			const measure = performance.getEntriesByName(name)[0];
			this.recordCustomMetric(name, measure.duration);
			return measure.duration;
		} catch (e) {
			console.error("[PerformanceMonitor] Measure error:", e);
			return null;
		}
	}

	// Get current metrics
	getMetrics() {
		return {
			fps: this.getAverageFPS(),
			memory: this.getCurrentMemory(),
			webVitals: this.metrics.webVitals,
			custom: this.metrics.custom,
		};
	}

	// Get average FPS
	getAverageFPS() {
		if (this.metrics.fps.length === 0) return null;

		const sum = this.metrics.fps.reduce((acc, m) => acc + m.value, 0);
		return Math.round(sum / this.metrics.fps.length);
	}

	// Get current memory
	getCurrentMemory() {
		if (this.metrics.memory.length === 0) return null;
		return this.metrics.memory[this.metrics.memory.length - 1].value;
	}

	// Generate report
	report() {
		const report = {
			timestamp: Date.now(),
			metrics: this.getMetrics(),
			budgets: this.checkBudgets(),
		};

		console.log("[PerformanceMonitor] Report:", report);
		return report;
	}

	// Check all budgets
	checkBudgets() {
		const results = {};
		const metrics = this.getMetrics();

		// FPS
		if (metrics.fps !== null) {
			results.fps = {
				value: metrics.fps,
				budget: this.options.budgets.fps.target,
				passed: metrics.fps >= this.options.budgets.fps.min,
			};
		}

		// Memory
		if (metrics.memory !== null) {
			results.memory = {
				value: metrics.memory.used,
				budget: this.options.budgets.memory.max,
				passed: metrics.memory.used <= this.options.budgets.memory.max,
			};
		}

		// Web Vitals
		if (metrics.webVitals.lcp) {
			results.lcp = {
				value: metrics.webVitals.lcp,
				budget: this.options.budgets.lcp.max,
				passed: metrics.webVitals.lcp <= this.options.budgets.lcp.max,
			};
		}

		if (metrics.webVitals.fid) {
			results.fid = {
				value: metrics.webVitals.fid,
				budget: this.options.budgets.fid.max,
				passed: metrics.webVitals.fid <= this.options.budgets.fid.max,
			};
		}

		if (metrics.webVitals.cls) {
			results.cls = {
				value: metrics.webVitals.cls,
				budget: this.options.budgets.cls.max,
				passed: metrics.webVitals.cls <= this.options.budgets.cls.max,
			};
		}

		return results;
	}
}

// Singleton instance
let monitorInstance = null;

export function usePerformanceMonitor(options) {
	if (!monitorInstance) {
		monitorInstance = new PerformanceMonitor(options);
	}
	return monitorInstance;
}

export { PerformanceMonitor };
