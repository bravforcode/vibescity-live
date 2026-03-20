/**
 * Enterprise Cluster Count Virtualization
 *
 * Advanced virtualization system for handling large numbers of map clusters:
 * - Viewport-based virtualization
 * - Dynamic level-of-detail (LOD)
 * - Memory-efficient cluster management
 * - Smooth transitions and animations
 */

import { computed, onMounted, onUnmounted, ref, watch } from "vue";

export function useClusterVirtualization() {
	const map = ref(null);
	const viewport = ref({ bounds: null, zoom: 10 });
	const clusters = ref(new Map());
	const visibleClusters = ref(new Set());
	const virtualizedClusters = ref([]);
	const isInitialized = ref(false);
	const maxVisibleClusters = ref(100);

	// Virtualization configuration
	const VIRTUALIZATION_CONFIG = {
		maxVisibleClusters: 100, // Maximum clusters to render
		bufferSize: 1.5, // Buffer around viewport
		lodLevels: 5, // Levels of detail
		updateThreshold: 0.1, // Minimum movement before update
		cullingDistance: 2000, // Distance for frustum culling (km)
		clusterMergeThreshold: 50, // Distance to merge clusters (pixels)
		animationDuration: 300, // Transition animation duration (ms)
		memoryLimit: 10000, // Maximum clusters in memory
	};

	const resolveMaxVisibleClusters = () => {
		const value = Number(maxVisibleClusters.value);
		if (Number.isFinite(value) && value > 0) return Math.round(value);
		return VIRTUALIZATION_CONFIG.maxVisibleClusters;
	};

	// Performance metrics
	const metrics = ref({
		totalClusters: 0,
		visibleClusters: 0,
		virtualizedClusters: 0,
		culledClusters: 0,
		memoryUsage: 0,
		renderTime: 0,
		lodSwitches: 0,
		frameRate: 60,
	});

	// Level of Detail definitions
	const LOD_LEVELS = [
		{ zoom: [0, 8], clusterSize: 100, detail: "minimal" },
		{ zoom: [9, 11], clusterSize: 50, detail: "low" },
		{ zoom: [12, 14], clusterSize: 25, detail: "medium" },
		{ zoom: [15, 17], clusterSize: 10, detail: "high" },
		{ zoom: [18, 20], clusterSize: 5, detail: "maximum" },
	];

	// Initialize virtualization system
	const initializeVirtualization = (mapInstance) => {
		map.value = mapInstance;

		// Setup viewport tracking
		map.value.on("moveend", handleViewportChange);
		map.value.on("zoomend", handleViewportChange);
		map.value.on("render", handleFrameRender);

		// Initial viewport setup
		updateViewport();

		isInitialized.value = true;
		console.log("🗺️ Cluster virtualization initialized");
	};

	// Handle viewport changes
	const handleViewportChange = () => {
		const bounds = map.value.getBounds();
		const zoom = map.value.getZoom();

		const newViewport = {
			bounds: {
				north: bounds.getNorth(),
				south: bounds.getSouth(),
				east: bounds.getEast(),
				west: bounds.getWest(),
			},
			zoom,
		};

		// Check if update is needed
		if (shouldUpdateViewport(viewport.value, newViewport)) {
			viewport.value = newViewport;
			updateVisibleClusters();
		}
	};

	// Determine if viewport update is needed
	const shouldUpdateViewport = (oldViewport, newViewport) => {
		if (!oldViewport.bounds || !newViewport.bounds) return true;

		const boundsChanged =
			Math.abs(oldViewport.bounds.north - newViewport.bounds.north) >
				VIRTUALIZATION_CONFIG.updateThreshold ||
			Math.abs(oldViewport.bounds.south - newViewport.bounds.south) >
				VIRTUALIZATION_CONFIG.updateThreshold ||
			Math.abs(oldViewport.bounds.east - newViewport.bounds.east) >
				VIRTUALIZATION_CONFIG.updateThreshold ||
			Math.abs(oldViewport.bounds.west - newViewport.bounds.west) >
				VIRTUALIZATION_CONFIG.updateThreshold;

		const zoomChanged = Math.abs(oldViewport.zoom - newViewport.zoom) > 0.5;

		return boundsChanged || zoomChanged;
	};

	// Update viewport bounds
	const updateViewport = () => {
		if (!map.value) return;

		const bounds = map.value.getBounds();
		const zoom = map.value.getZoom();

		viewport.value = {
			bounds: {
				north: bounds.getNorth(),
				south: bounds.getSouth(),
				east: bounds.getEast(),
				west: bounds.getWest(),
			},
			zoom,
		};
	};

	// Add cluster to virtualization system
	const addCluster = (clusterData) => {
		const cluster = {
			id: clusterData.id,
			lng: clusterData.lng,
			lat: clusterData.lat,
			count: clusterData.count,
			properties: clusterData.properties || {},
			lod: calculateLOD(clusterData, viewport.value.zoom),
			visible: false,
			lastVisible: 0,
			distance: 0,
			screenPosition: null,
			animatedPosition: null,
			targetPosition: null,
			animationProgress: 0,
		};

		clusters.value.set(cluster.id, cluster);

		// Check memory limit
		if (clusters.value.size > VIRTUALIZATION_CONFIG.memoryLimit) {
			cleanupOldClusters();
		}
	};

	// Calculate Level of Detail for cluster
	const calculateLOD = (cluster, zoom) => {
		for (const level of LOD_LEVELS) {
			if (zoom >= level.zoom[0] && zoom <= level.zoom[1]) {
				return {
					level: LOD_LEVELS.indexOf(level),
					clusterSize: level.clusterSize,
					detail: level.detail,
					shouldRender: cluster.count >= level.clusterSize,
				};
			}
		}
		return LOD_LEVELS[LOD_LEVELS.length - 1]; // Default to highest detail
	};

	// Update visible clusters based on viewport
	const updateVisibleClusters = () => {
		if (!viewport.value.bounds) return;

		const startTime = performance.now();
		const newVisibleClusters = new Set();
		let culledCount = 0;

		// Frustum culling - check which clusters are in viewport
		for (const [id, cluster] of clusters.value.entries()) {
			const inViewport = isClusterInViewport(cluster, viewport.value);
			const lod = calculateLOD(cluster, viewport.value.zoom);

			// Update LOD
			const oldLod = cluster.lod?.level || 0;
			if (oldLod !== lod.level) {
				cluster.lod = lod;
				metrics.value.lodSwitches++;
			}

			// Check if cluster should be rendered
			const shouldRender = inViewport && lod.shouldRender;

			if (shouldRender) {
				newVisibleClusters.add(id);
				cluster.visible = true;
				cluster.lastVisible = Date.now();

				// Calculate screen position for rendering
				cluster.screenPosition = projectToScreen(cluster);
				cluster.distance = calculateDistance(cluster, viewport.value);

				// Start animation if position changed significantly
				if (
					!cluster.animatedPosition ||
					Math.abs(cluster.screenPosition.x - cluster.animatedPosition.x) > 5 ||
					Math.abs(cluster.screenPosition.y - cluster.animatedPosition.y) > 5
				) {
					cluster.targetPosition = { ...cluster.screenPosition };
					cluster.animationProgress = 0;
				}
			} else {
				cluster.visible = false;
				if (inViewport) culledCount++;
			}
		}

		// Sort visible clusters by distance and priority
		const sortedVisible = Array.from(newVisibleClusters)
			.map((id) => clusters.value.get(id))
			.sort((a, b) => {
				// Sort by LOD first, then by distance
				if (a.lod.level !== b.lod.level) {
					return b.lod.level - a.lod.level; // Higher LOD first
				}
				return a.distance - b.distance; // Closer first
			})
			.slice(0, resolveMaxVisibleClusters());

		visibleClusters.value = new Set(sortedVisible.map((c) => c.id));
		virtualizedClusters.value = sortedVisible;

		// Update metrics
		const endTime = performance.now();
		metrics.value.totalClusters = clusters.value.size;
		metrics.value.visibleClusters = newVisibleClusters.size;
		metrics.value.virtualizedClusters = sortedVisible.length;
		metrics.value.culledClusters = culledCount;
		metrics.value.renderTime = endTime - startTime;
		metrics.value.memoryUsage = clusters.value.size * 200; // Estimated bytes per cluster
	};

	// Check if cluster is in viewport
	const isClusterInViewport = (cluster, viewport) => {
		const { bounds } = viewport;

		// Simple bounding box check
		return (
			cluster.lat >= bounds.south &&
			cluster.lat <= bounds.north &&
			cluster.lng >= bounds.west &&
			cluster.lng <= bounds.east
		);
	};

	// Project geographic coordinates to screen coordinates
	const projectToScreen = (cluster) => {
		if (!map.value) return { x: 0, y: 0 };

		const point = map.value.project([cluster.lng, cluster.lat]);
		return {
			x: point.x,
			y: point.y,
		};
	};

	// Calculate distance from viewport center
	const calculateDistance = (cluster, viewport) => {
		const centerLat = (viewport.bounds.north + viewport.bounds.south) / 2;
		const centerLng = (viewport.bounds.east + viewport.bounds.west) / 2;

		// Haversine formula for distance
		const R = 6371; // Earth's radius in km
		const dLat = ((cluster.lat - centerLat) * Math.PI) / 180;
		const dLng = ((cluster.lng - centerLng) * Math.PI) / 180;

		const a =
			Math.sin(dLat / 2) * Math.sin(dLat / 2) +
			Math.cos((centerLat * Math.PI) / 180) *
				Math.cos((cluster.lat * Math.PI) / 180) *
				Math.sin(dLng / 2) *
				Math.sin(dLng / 2);
		const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

		return R * c;
	};

	// Animate cluster positions
	const animateClusters = (_timestamp) => {
		for (const cluster of virtualizedClusters.value) {
			if (cluster.targetPosition && cluster.animationProgress < 1) {
				const progress = Math.min(cluster.animationProgress + 0.1, 1);
				const eased = easeInOutCubic(progress);

				if (cluster.animatedPosition) {
					cluster.animatedPosition = {
						x:
							cluster.animatedPosition.x +
							(cluster.targetPosition.x - cluster.animatedPosition.x) * eased,
						y:
							cluster.animatedPosition.y +
							(cluster.targetPosition.y - cluster.animatedPosition.y) * eased,
					};
				} else {
					cluster.animatedPosition = { ...cluster.targetPosition };
				}

				cluster.animationProgress = progress;

				if (progress >= 1) {
					cluster.animatedPosition = { ...cluster.targetPosition };
					cluster.targetPosition = null;
					cluster.animationProgress = 0;
				}
			} else if (!cluster.animatedPosition && cluster.screenPosition) {
				cluster.animatedPosition = { ...cluster.screenPosition };
			}
		}
	};

	// Easing function for smooth animations
	const easeInOutCubic = (t) => {
		return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
	};

	// Cleanup old clusters (LRU eviction)
	const cleanupOldClusters = (maxAge = 300000) => {
		// 5 minutes
		const now = Date.now();
		const toRemove = [];

		for (const [id, cluster] of clusters.value.entries()) {
			if (!cluster.visible && now - cluster.lastVisible > maxAge) {
				toRemove.push(id);
			}
		}

		toRemove.forEach((id) => {
			clusters.value.delete(id);
		});

		if (toRemove.length > 0) {
			console.log(`🗑️ Cleaned up ${toRemove.length} old clusters`);
		}
	};

	// Merge nearby clusters for performance
	const mergeNearbyClusters = () => {
		const mergeDistance = VIRTUALIZATION_CONFIG.clusterMergeThreshold;
		const merged = new Map();

		for (const cluster of clusters.value.values()) {
			if (!cluster.visible) continue;

			let mergedWith = null;

			for (const [id, existingCluster] of merged.entries()) {
				const distance = calculateDistance(cluster, {
					bounds: {
						north: existingCluster.lat,
						south: existingCluster.lat,
						east: existingCluster.lng,
						west: existingCluster.lng,
					},
				});

				// Convert distance to pixels (rough approximation)
				const pixelDistance = (distance * 100) / 2 ** viewport.value.zoom;

				if (pixelDistance < mergeDistance) {
					mergedWith = id;
					break;
				}
			}

			if (mergedWith) {
				const existingCluster = merged.get(mergedWith);
				existingCluster.count += cluster.count;
				existingCluster.properties = mergeClusterProperties(
					existingCluster.properties,
					cluster.properties,
				);
			} else {
				merged.set(cluster.id, { ...cluster });
			}
		}

		return Array.from(merged.values());
	};

	// Merge cluster properties
	const mergeClusterProperties = (props1, props2) => {
		const merged = { ...props1 };

		for (const [key, value] of Object.entries(props2)) {
			if (typeof value === "number" && typeof merged[key] === "number") {
				merged[key] = merged[key] + value;
			} else if (Array.isArray(value) && Array.isArray(merged[key])) {
				merged[key] = [...merged[key], ...value];
			} else {
				merged[key] = value;
			}
		}

		return merged;
	};

	// Handle frame rendering
	const handleFrameRender = () => {
		animateClusters(performance.now());

		// Calculate frame rate
		const now = performance.now();
		if (metrics.value.lastFrameTime) {
			const deltaTime = now - metrics.value.lastFrameTime;
			metrics.value.frameRate = Math.round(1000 / deltaTime);
		}
		metrics.value.lastFrameTime = now;
	};

	// Get virtualization statistics
	const getVirtualizationStats = () => {
		const hitRate =
			metrics.value.visibleClusters / Math.max(metrics.value.totalClusters, 1);

		return {
			...metrics.value,
			hitRate: Math.round(hitRate * 100),
			memoryEfficiency:
				metrics.value.memoryUsage > 0
					? Math.round(
							((VIRTUALIZATION_CONFIG.memoryLimit * 200) /
								metrics.value.memoryUsage) *
								100,
						)
					: 0,
			lodDistribution: calculateLODDistribution(),
		};
	};

	// Calculate LOD distribution
	const calculateLODDistribution = () => {
		const distribution = {};

		for (const cluster of clusters.value.values()) {
			const lodName = cluster.lod?.detail || "unknown";
			distribution[lodName] = (distribution[lodName] || 0) + 1;
		}

		return distribution;
	};

	// Export virtualization state
	const exportState = () => {
		return {
			config: {
				...VIRTUALIZATION_CONFIG,
				maxVisibleClusters: resolveMaxVisibleClusters(),
			},
			viewport: viewport.value,
			clusters: Array.from(clusters.value.values()),
			visibleClusters: Array.from(visibleClusters.value),
			metrics: getVirtualizationStats(),
		};
	};

	const setMaxVisibleClusters = (value) => {
		const next = Number(value);
		if (!Number.isFinite(next) || next <= 0) return;
		maxVisibleClusters.value = Math.round(next);
		if (isInitialized.value) {
			updateVisibleClusters();
		}
	};

	const replaceClusters = (clusterItems = []) => {
		clusters.value.clear();
		visibleClusters.value.clear();
		virtualizedClusters.value = [];
		if (!Array.isArray(clusterItems) || !clusterItems.length) {
			return;
		}
		for (const item of clusterItems) {
			if (!item) continue;
			const id = item.id ?? item.cluster_id ?? item.key;
			const lat = Number(item.lat);
			const lng = Number(item.lng);
			if (!id || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
			addCluster({
				id: String(id),
				lat,
				lng,
				count: Number(item.count || 1),
				properties: item.properties || {},
			});
		}
		if (isInitialized.value) {
			updateVisibleClusters();
		}
	};

	// Watch viewport changes
	watch(
		viewport,
		() => {
			updateVisibleClusters();
		},
		{ deep: true },
	);

	// Cleanup on unmount
	onUnmounted(() => {
		if (map.value) {
			map.value.off("moveend", handleViewportChange);
			map.value.off("zoomend", handleViewportChange);
			map.value.off("render", handleFrameRender);
		}

		clusters.value.clear();
		visibleClusters.value.clear();
		virtualizedClusters.value = [];
		isInitialized.value = false;
	});

	return {
		// State
		isInitialized,
		viewport,
		clusters: computed(() => Array.from(clusters.value.values())),
		visibleClusters: computed(() => Array.from(visibleClusters.value)),
		virtualizedClusters,
		metrics: computed(() => getVirtualizationStats()),

		// Methods
		initializeVirtualization,
		addCluster,
		replaceClusters,
		setMaxVisibleClusters,
		updateVisibleClusters,
		mergeNearbyClusters,
		animateClusters,
		cleanupOldClusters,
		exportState,
		getVirtualizationStats,
	};
}
