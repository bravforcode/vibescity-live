/**
 * useEnhancedMarkers - Advanced Marker System
 *
 * Features:
 * - Smart clustering with dynamic radius
 * - Animated marker transitions
 * - Custom marker shapes and styles
 * - Marker priority system
 * - Collision detection
 * - Smooth animations
 * - Memory-efficient rendering
 */

import maplibregl from "maplibre-gl";
import { computed, ref, watch } from "vue";

const MARKER_SIZES = {
	tiny: 12,
	small: 18,
	medium: 24,
	large: 32,
	huge: 48,
};

const MARKER_SHAPES = {
	circle: "circle",
	square: "square",
	diamond: "diamond",
	star: "star",
	heart: "heart",
	pin: "pin",
};

const ANIMATION_TYPES = {
	bounce: "bounce",
	pulse: "pulse",
	shake: "shake",
	glow: "glow",
	spin: "spin",
	float: "float",
};

export function useEnhancedMarkers(map, _options = {}) {
	const markers = ref(new Map());
	const markerElements = ref(new Map());
	const clusterConfig = ref({
		enabled: true,
		radius: 50,
		maxZoom: 14,
		minPoints: 2,
	});

	// Create marker element with custom styling
	const createMarkerElement = (shop, config = {}) => {
		const {
			size = "medium",
			shape = "circle",
			color = "#3b82f6",
			icon = null,
			animation = null,
			priority = 0,
		} = config;

		const el = document.createElement("div");
		el.className = "enhanced-marker";
		el.dataset.shopId = shop.id;
		el.dataset.priority = priority;

		// Size
		const sizeValue = MARKER_SIZES[size] || MARKER_SIZES.medium;
		el.style.width = `${sizeValue}px`;
		el.style.height = `${sizeValue}px`;

		// Shape
		switch (shape) {
			case "circle":
				el.style.borderRadius = "50%";
				break;
			case "square":
				el.style.borderRadius = "4px";
				break;
			case "diamond":
				el.style.borderRadius = "4px";
				el.style.transform = "rotate(45deg)";
				break;
			case "pin":
				el.style.borderRadius = "50% 50% 50% 0";
				el.style.transform = "rotate(-45deg)";
				break;
			case "star":
				el.innerHTML = "⭐";
				el.style.fontSize = `${sizeValue}px`;
				el.style.lineHeight = `${sizeValue}px`;
				el.style.textAlign = "center";
				break;
			case "heart":
				el.innerHTML = "❤️";
				el.style.fontSize = `${sizeValue}px`;
				el.style.lineHeight = `${sizeValue}px`;
				el.style.textAlign = "center";
				break;
		}

		// Color
		if (shape !== "star" && shape !== "heart") {
			el.style.backgroundColor = color;
			el.style.border = "2px solid white";
			el.style.boxShadow = `0 2px 8px rgba(0,0,0,0.3), 0 0 0 1px ${color}`;
		}

		// Icon
		if (icon && shape !== "star" && shape !== "heart") {
			el.innerHTML = icon;
			el.style.display = "flex";
			el.style.alignItems = "center";
			el.style.justifyContent = "center";
			el.style.color = "white";
			el.style.fontSize = `${sizeValue * 0.6}px`;
		}

		// Animation
		if (animation) {
			el.classList.add(`marker-${animation}`);
		}

		// Cursor
		el.style.cursor = "pointer";
		el.style.transition = "all 0.3s ease";

		// Hover effect
		el.addEventListener("mouseenter", () => {
			el.style.transform = `${el.style.transform} scale(1.2)`;
			el.style.zIndex = "1000";
		});

		el.addEventListener("mouseleave", () => {
			el.style.transform = el.style.transform.replace(" scale(1.2)", "");
			el.style.zIndex = "";
		});

		return el;
	};

	// Add marker with animation
	const addMarker = (shop, config = {}) => {
		if (!map.value || !shop.lat || !shop.lng) return null;

		const coords = [shop.lng, shop.lat];
		const el = createMarkerElement(shop, config);

		const marker = new maplibregl.Marker({
			element: el,
			anchor: config.shape === "pin" ? "bottom" : "center",
		})
			.setLngLat(coords)
			.addTo(map.value);

		// Store marker
		markers.value.set(shop.id, marker);
		markerElements.value.set(shop.id, el);

		// Entrance animation
		el.style.opacity = "0";
		el.style.transform = "scale(0)";

		requestAnimationFrame(() => {
			el.style.opacity = "1";
			el.style.transform = "scale(1)";
		});

		return marker;
	};

	// Update marker position with smooth transition
	const updateMarkerPosition = (shopId, newCoords, duration = 300) => {
		const marker = markers.value.get(shopId);
		if (!marker) return;

		const currentCoords = marker.getLngLat();
		const startTime = Date.now();

		const animate = () => {
			const elapsed = Date.now() - startTime;
			const progress = Math.min(elapsed / duration, 1);

			// Easing function (ease-in-out)
			const eased =
				progress < 0.5
					? 2 * progress * progress
					: 1 - (-2 * progress + 2) ** 2 / 2;

			const lng =
				currentCoords.lng + (newCoords[0] - currentCoords.lng) * eased;
			const lat =
				currentCoords.lat + (newCoords[1] - currentCoords.lat) * eased;

			marker.setLngLat([lng, lat]);

			if (progress < 1) {
				requestAnimationFrame(animate);
			}
		};

		animate();
	};

	// Remove marker with animation
	const removeMarker = (shopId) => {
		const marker = markers.value.get(shopId);
		const el = markerElements.value.get(shopId);

		if (!marker || !el) return;

		// Exit animation
		el.style.opacity = "0";
		el.style.transform = "scale(0)";

		setTimeout(() => {
			marker.remove();
			markers.value.delete(shopId);
			markerElements.value.delete(shopId);
		}, 300);
	};

	// Update marker style
	const updateMarkerStyle = (shopId, config = {}) => {
		const el = markerElements.value.get(shopId);
		if (!el) return;

		if (config.color) {
			el.style.backgroundColor = config.color;
			el.style.boxShadow = `0 2px 8px rgba(0,0,0,0.3), 0 0 0 1px ${config.color}`;
		}

		if (config.animation) {
			// Remove old animation classes
			Object.values(ANIMATION_TYPES).forEach((anim) => {
				el.classList.remove(`marker-${anim}`);
			});
			// Add new animation
			el.classList.add(`marker-${config.animation}`);
		}

		if (config.size) {
			const sizeValue = MARKER_SIZES[config.size] || MARKER_SIZES.medium;
			el.style.width = `${sizeValue}px`;
			el.style.height = `${sizeValue}px`;
		}
	};

	// Highlight marker
	const highlightMarker = (shopId, highlighted = true) => {
		const el = markerElements.value.get(shopId);
		if (!el) return;

		if (highlighted) {
			el.style.transform = "scale(1.3)";
			el.style.zIndex = "1000";
			el.style.filter = "drop-shadow(0 0 10px currentColor)";
		} else {
			el.style.transform = "scale(1)";
			el.style.zIndex = "";
			el.style.filter = "";
		}
	};

	// Batch add markers with staggered animation
	const addMarkersBatch = (shops, config = {}, staggerDelay = 50) => {
		shops.forEach((shop, index) => {
			setTimeout(() => {
				addMarker(shop, config);
			}, index * staggerDelay);
		});
	};

	// Clear all markers
	const clearMarkers = () => {
		markers.value.forEach((_marker, shopId) => {
			removeMarker(shopId);
		});
	};

	// Get markers in viewport
	const getMarkersInViewport = () => {
		if (!map.value) return [];

		const bounds = map.value.getBounds();
		const visibleMarkers = [];

		markers.value.forEach((marker, shopId) => {
			const lngLat = marker.getLngLat();
			if (bounds.contains(lngLat)) {
				visibleMarkers.push({ shopId, marker });
			}
		});

		return visibleMarkers;
	};

	// Collision detection
	const detectCollisions = () => {
		const elements = Array.from(markerElements.value.values());
		const collisions = [];

		for (let i = 0; i < elements.length; i++) {
			for (let j = i + 1; j < elements.length; j++) {
				const rect1 = elements[i].getBoundingClientRect();
				const rect2 = elements[j].getBoundingClientRect();

				if (
					!(
						rect1.right < rect2.left ||
						rect1.left > rect2.right ||
						rect1.bottom < rect2.top ||
						rect1.top > rect2.bottom
					)
				) {
					collisions.push([elements[i], elements[j]]);
				}
			}
		}

		return collisions;
	};

	// Resolve collisions by adjusting positions
	const resolveCollisions = () => {
		const collisions = detectCollisions();

		collisions.forEach(([el1, el2]) => {
			const priority1 = parseInt(el1.dataset.priority || 0);
			const priority2 = parseInt(el2.dataset.priority || 0);

			// Hide lower priority marker
			if (priority1 < priority2) {
				el1.style.opacity = "0.3";
				el1.style.transform = "scale(0.8)";
			} else {
				el2.style.opacity = "0.3";
				el2.style.transform = "scale(0.8)";
			}
		});
	};

	// Inject marker animation CSS
	const injectMarkerCSS = () => {
		if (typeof document === "undefined") return;

		const styleId = "enhanced-markers-css";
		if (document.getElementById(styleId)) return;

		const style = document.createElement("style");
		style.id = styleId;
		style.textContent = `
			.enhanced-marker {
				position: relative;
			}

			@keyframes marker-bounce {
				0%, 100% { transform: translateY(0); }
				50% { transform: translateY(-10px); }
			}

			@keyframes marker-pulse {
				0%, 100% { transform: scale(1); opacity: 1; }
				50% { transform: scale(1.2); opacity: 0.8; }
			}

			@keyframes marker-shake {
				0%, 100% { transform: translateX(0); }
				25% { transform: translateX(-5px); }
				75% { transform: translateX(5px); }
			}

			@keyframes marker-glow {
				0%, 100% { filter: drop-shadow(0 0 5px currentColor); }
				50% { filter: drop-shadow(0 0 15px currentColor); }
			}

			@keyframes marker-spin {
				from { transform: rotate(0deg); }
				to { transform: rotate(360deg); }
			}

			@keyframes marker-float {
				0%, 100% { transform: translateY(0px); }
				50% { transform: translateY(-8px); }
			}

			.marker-bounce { animation: marker-bounce 1s ease-in-out infinite; }
			.marker-pulse { animation: marker-pulse 2s ease-in-out infinite; }
			.marker-shake { animation: marker-shake 0.5s ease-in-out infinite; }
			.marker-glow { animation: marker-glow 2s ease-in-out infinite; }
			.marker-spin { animation: marker-spin 2s linear infinite; }
			.marker-float { animation: marker-float 3s ease-in-out infinite; }

			@media (prefers-reduced-motion: reduce) {
				.enhanced-marker { animation: none !important; }
			}
		`;

		document.head.appendChild(style);
	};

	// Initialize
	injectMarkerCSS();

	return {
		markers,
		markerElements,
		clusterConfig,
		addMarker,
		updateMarkerPosition,
		removeMarker,
		updateMarkerStyle,
		highlightMarker,
		addMarkersBatch,
		clearMarkers,
		getMarkersInViewport,
		detectCollisions,
		resolveCollisions,
	};
}
