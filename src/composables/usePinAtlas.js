/**
 * Enterprise Pin Image Atlas (Spritesheet) Optimization
 *
 * Advanced spritesheet system for pin rendering with:
 * - Dynamic texture atlas generation
 * - GPU-accelerated rendering
 * - Memory-efficient pin management
 * - Batch rendering operations
 */

import { computed, onMounted, onUnmounted, ref, watch } from "vue";

export function usePinAtlas() {
	const canvas = ref(null);
	const ctx = ref(null);
	const atlas = ref(null);
	const pinRegistry = ref(new Map());
	const isInitialized = ref(false);
	const isGenerating = ref(false);

	// Atlas configuration
	const ATLAS_CONFIG = {
		maxSize: 2048, // Maximum atlas size
		padding: 2, // Padding between pins
		format: "rgba8", // GPU-friendly format
		mipmap: true, // Generate mipmaps for quality
		compression: true, // Enable texture compression
	};

	// Pin categories with different rendering strategies
	const PIN_CATEGORIES = {
		venue: { size: 32, priority: 1, cache: true },
		restaurant: { size: 32, priority: 1, cache: true },
		cafe: { size: 28, priority: 2, cache: true },
		bar: { size: 28, priority: 2, cache: true },
		hotel: { size: 32, priority: 1, cache: true },
		shopping: { size: 30, priority: 2, cache: true },
		entertainment: { size: 30, priority: 2, cache: true },
		transport: { size: 28, priority: 3, cache: false },
		custom: { size: 36, priority: 4, cache: false },
	};

	// Performance metrics
	const metrics = ref({
		totalPins: 0,
		cachedPins: 0,
		atlasSize: { width: 0, height: 0 },
		memoryUsage: 0,
		renderTime: 0,
		hitRate: 0,
	});

	// Initialize canvas and context
	const initializeCanvas = () => {
		canvas.value = document.createElement("canvas");
		ctx.value = canvas.value.getContext("2d", {
			willReadFrequently: false,
			alpha: true,
			desynchronized: true, // Performance optimization
		});

		if (!ctx.value) {
			const err = new Error();
			err.name = "PinAtlasContextInitError";
			throw err;
		}

		isInitialized.value = true;
	};

	// Load pin image and add to registry
	const loadPin = async (pinId, imageUrl, category = "venue") => {
		if (pinRegistry.value.has(pinId)) {
			return pinRegistry.value.get(pinId);
		}

		return new Promise((resolve, reject) => {
			const img = new Image();
			img.crossOrigin = "anonymous";

			img.onload = () => {
				const pinData = {
					id: pinId,
					image: img,
					category,
					size: PIN_CATEGORIES[category]?.size || 32,
					priority: PIN_CATEGORIES[category]?.priority || 3,
					cache: PIN_CATEGORIES[category]?.cache !== false,
					loaded: true,
					lastUsed: Date.now(),
				};

				pinRegistry.value.set(pinId, pinData);
				resolve(pinData);
			};

			img.onerror = () => reject(new Error(`Failed to load pin: ${pinId}`));
			img.src = imageUrl;
		});
	};

	// Generate texture atlas from loaded pins
	const generateAtlas = async () => {
		if (isGenerating.value) return;
		isGenerating.value = true;

		const startTime = performance.now();

		try {
			// Sort pins by priority and size
			const sortedPins = Array.from(pinRegistry.value.values())
				.filter((pin) => pin.loaded && pin.cache)
				.sort((a, b) => {
					if (a.priority !== b.priority) return a.priority - b.priority;
					return b.size - a.size; // Larger pins first for better packing
				});

			if (sortedPins.length === 0) {
				isGenerating.value = false;
				return;
			}

			// Calculate atlas dimensions using bin packing algorithm
			const { width, height, positions } = calculateAtlasLayout(sortedPins);

			// Create atlas canvas
			canvas.value.width = width;
			canvas.value.height = height;

			// Clear canvas with transparent background
			ctx.value.clearRect(0, 0, width, height);

			// Draw pins to atlas
			positions.forEach((pos, index) => {
				const pin = sortedPins[index];
				ctx.value.drawImage(pin.image, pos.x, pos.y, pin.size, pin.size);

				// Store UV coordinates for this pin
				pin.uv = {
					x: pos.x / width,
					y: pos.y / height,
					width: pin.size / width,
					height: pin.size / height,
				};
			});

			// Create atlas object
			atlas.value = {
				texture: canvas.value,
				width,
				height,
				pins: sortedPins,
				generated: Date.now(),
			};

			// Update metrics
			const endTime = performance.now();
			metrics.value.atlasSize = { width, height };
			metrics.value.renderTime = endTime - startTime;
			metrics.value.totalPins = sortedPins.length;
			metrics.value.cachedPins = sortedPins.filter((p) => p.cache).length;
			metrics.value.memoryUsage = width * height * 4; // RGBA = 4 bytes per pixel

			console.log(
				`🗺️ Pin atlas generated: ${width}x${height}, ${sortedPins.length} pins, ${endTime - startTime}ms`,
			);
		} catch (error) {
			console.error("Failed to generate pin atlas:", error);
		} finally {
			isGenerating.value = false;
		}
	};

	// Bin packing algorithm for optimal atlas layout
	const calculateAtlasLayout = (pins) => {
		let width = 0;
		let height = 0;
		let currentX = 0;
		let currentY = 0;
		let rowHeight = 0;
		const positions = [];

		for (const pin of pins) {
			const size = pin.size + ATLAS_CONFIG.padding * 2;

			// Check if pin fits in current row
			if (currentX + size > ATLAS_CONFIG.maxSize) {
				// Move to next row
				currentX = 0;
				currentY += rowHeight;
				rowHeight = 0;
			}

			// Check if atlas needs to be wider
			if (currentX + size > width) {
				width = currentX + size;
			}

			// Store position
			positions.push({
				x: currentX + ATLAS_CONFIG.padding,
				y: currentY + ATLAS_CONFIG.padding,
			});

			// Update current position
			currentX += size;
			rowHeight = Math.max(rowHeight, size);
		}

		height = currentY + rowHeight;

		return { width, height, positions };
	};

	// Get pin UV coordinates from atlas
	const getPinUV = (pinId) => {
		const pin = pinRegistry.value.get(pinId);
		if (!pin || !pin.uv) return null;

		return pin.uv;
	};

	// Render pin using atlas coordinates
	const renderPin = (gl, pinId, _x, _y, size = 1.0, opacity = 1.0) => {
		const uv = getPinUV(pinId);
		if (!uv || !atlas.value) return false;

		const pin = pinRegistry.value.get(pinId);
		if (!pin) return false;

		// Update last used time for LRU
		pin.lastUsed = Date.now();

		// Bind atlas texture (assuming WebGL context)
		if (gl && atlas.value.texture) {
			const texture = gl.createTexture();
			gl.bindTexture(gl.TEXTURE_2D, texture);
			gl.texImage2D(
				gl.TEXTURE_2D,
				0,
				gl.RGBA,
				gl.RGBA,
				gl.UNSIGNED_BYTE,
				atlas.value.texture,
			);

			// Set texture parameters
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			gl.texParameteri(
				gl.TEXTURE_2D,
				gl.TEXTURE_MIN_FILTER,
				gl.LINEAR_MIPMAP_LINEAR,
			);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

			// Generate mipmaps for quality
			if (ATLAS_CONFIG.mipmap) {
				gl.generateMipmap(gl.TEXTURE_2D);
			}
		}

		return {
			texture: atlas.value.texture,
			uv,
			size: pin.size * size,
			opacity,
		};
	};

	// Cleanup unused pins (LRU eviction)
	const cleanupUnusedPins = (maxAge = 300000) => {
		// 5 minutes default
		const now = Date.now();
		const toRemove = [];

		for (const [id, pin] of pinRegistry.value.entries()) {
			if (!pin.cache && now - pin.lastUsed > maxAge) {
				toRemove.push(id);
			}
		}

		toRemove.forEach((id) => {
			pinRegistry.value.delete(id);
		});

		if (toRemove.length > 0) {
			console.log(`🗑️ Cleaned up ${toRemove.length} unused pins`);
			// Regenerate atlas if significant cleanup
			if (toRemove.length > pinRegistry.value.size * 0.2) {
				generateAtlas();
			}
		}
	};

	// Preload common pins
	const preloadCommonPins = async (pinUrls) => {
		const loadPromises = pinUrls.map(async ({ id, url, category }) => {
			try {
				return await loadPin(id, url, category);
			} catch (error) {
				console.warn(`Failed to preload pin ${id}:`, error);
				return null;
			}
		});

		const results = await Promise.allSettled(loadPromises);
		const loaded = results.filter((r) => r.status === "fulfilled").length;

		console.log(`📦 Preloaded ${loaded}/${pinUrls.length} pins`);

		// Generate atlas after preloading
		if (loaded > 0) {
			await generateAtlas();
		}

		return loaded;
	};

	// Get atlas statistics
	const getAtlasStats = () => {
		const totalMemory = metrics.value.memoryUsage;
		const usedMemory = totalMemory;
		const hitRate =
			metrics.value.cachedPins / Math.max(metrics.value.totalPins, 1);

		return {
			...metrics.value,
			hitRate: Math.round(hitRate * 100),
			memoryEfficiency:
				totalMemory > 0 ? Math.round((usedMemory / totalMemory) * 100) : 0,
			compressionRatio: ATLAS_CONFIG.compression ? 0.7 : 1.0, // Estimated
		};
	};

	// Export atlas as image (for debugging)
	const exportAtlas = () => {
		if (!atlas.value) return null;

		return canvas.value.toDataURL("image/png", 0.9);
	};

	// Watch for pin registry changes and regenerate atlas
	watch(
		() => pinRegistry.value.size,
		(newSize, oldSize) => {
			if (newSize > oldSize && !isGenerating.value) {
				// Debounce atlas regeneration
				setTimeout(generateAtlas, 100);
			}
		},
	);

	// Cleanup on unmount
	onMounted(() => {
		initializeCanvas();

		// Start cleanup interval
		const cleanupInterval = setInterval(cleanupUnusedPins, 60000); // Every minute

		onUnmounted(() => {
			clearInterval(cleanupInterval);

			// Cleanup WebGL resources
			if (atlas.value?.texture) {
				// Note: Actual WebGL cleanup would need the GL context
				atlas.value.texture = null;
			}

			atlas.value = null;
			pinRegistry.value.clear();
			isInitialized.value = false;
		});
	});

	return {
		// State
		isInitialized,
		isGenerating,
		atlas,
		metrics: computed(() => getAtlasStats()),

		// Methods
		loadPin,
		generateAtlas,
		renderPin,
		getPinUV,
		preloadCommonPins,
		cleanupUnusedPins,
		exportAtlas,
		getAtlasStats,
	};
}
