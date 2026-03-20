import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ref } from 'vue';
import { useMapPerformance } from '@/composables/map/useMapPerformance';

describe('useMapPerformance', () => {
	let map;
	let mockPerformance;

	beforeEach(() => {
		map = ref({
			style: {
				sourceCaches: {
					cache1: {
						_tiles: Array(150).fill({ tileID: 'tile' }),
						_removeTile: vi.fn(),
					},
				},
			},
			painter: {
				context: {
					gl: {
						hint: vi.fn(),
						GENERATE_MIPMAP_HINT: 1,
						NICEST: 2,
						FASTEST: 3,
					},
				},
			},
		});

		mockPerformance = {
			now: vi.fn(() => Date.now()),
			memory: {
				usedJSHeapSize: 50000000,
				jsHeapSizeLimit: 100000000,
			},
		};

		global.performance = mockPerformance;
		global.requestAnimationFrame = vi.fn((cb) => setTimeout(cb, 16));
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it('should initialize with high performance mode', () => {
		const { performanceMode, currentFPS } = useMapPerformance(map);

		expect(performanceMode.value).toBe('high');
		expect(currentFPS.value).toBe(60);
	});

	it('should provide LOD config based on performance mode', () => {
		const { lodConfig, performanceMode } = useMapPerformance(map);

		expect(lodConfig.value.maxMarkers).toBe(1000);
		expect(lodConfig.value.enableAnimations).toBe(true);

		performanceMode.value = 'low';
		expect(lodConfig.value.maxMarkers).toBe(250);
		expect(lodConfig.value.enableAnimations).toBe(false);
	});

	it('should monitor memory pressure', () => {
		const { memoryPressure } = useMapPerformance(map);

		expect(memoryPressure.value).toBeGreaterThanOrEqual(0);
		expect(memoryPressure.value).toBeLessThanOrEqual(1);
	});

	it('should trigger memory optimization on high pressure', () => {
		const { triggerMemoryOptimization } = useMapPerformance(map);

		triggerMemoryOptimization();

		expect(map.value.style.sourceCaches.cache1._removeTile).toHaveBeenCalled();
	});

	it('should provide optimal tile size based on zoom', () => {
		const { getOptimalTileSize } = useMapPerformance(map);

		expect(getOptimalTileSize(8)).toBe(256);
		expect(getOptimalTileSize(12)).toBe(512);
		expect(getOptimalTileSize(16)).toBe(512);
	});

	it('should throttle map updates', async () => {
		const { throttledMapUpdate } = useMapPerformance(map);
		const callback = vi.fn();

		throttledMapUpdate(callback, 50);
		throttledMapUpdate(callback, 50); // Should be ignored

		await new Promise((resolve) => setTimeout(resolve, 100));
		expect(callback).toHaveBeenCalledTimes(1);
	});
});
