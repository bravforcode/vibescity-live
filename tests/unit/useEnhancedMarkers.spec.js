/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref } from 'vue';
import { useEnhancedMarkers } from '@/composables/map/useEnhancedMarkers';

// Mock maplibre-gl
vi.mock('maplibre-gl', () => {
	const MockMarker = vi.fn(function(options) {
		this.options = options;
		this.lngLat = null;
		this.map = null;
		
		this.setLngLat = vi.fn(function(coords) {
			this.lngLat = { lng: coords[0], lat: coords[1] };
			return this;
		});
		
		this.addTo = vi.fn(function(map) {
			this.map = map;
			return this;
		});
		
		this.remove = vi.fn();
		
		this.getLngLat = vi.fn(function() {
			return this.lngLat || { lng: 98.968, lat: 18.7985 };
		});
		
		this.getElement = vi.fn(() => {
			return this.options?.element || document.createElement('div');
		});
	});

	return {
		default: {
			Marker: MockMarker,
		},
	};
});

describe('useEnhancedMarkers', () => {
	let map;

	beforeEach(() => {
		map = ref({
			getBounds: vi.fn(() => ({
				contains: vi.fn(() => true),
			})),
		});

		if (typeof document !== 'undefined') {
			document.head.innerHTML = '';
			document.body.innerHTML = '';
		}
	});

	it('should initialize with empty markers', () => {
		const { markers, markerElements } = useEnhancedMarkers(map);

		expect(markers.value.size).toBe(0);
		expect(markerElements.value.size).toBe(0);
	});

	it('should add marker with custom config', () => {
		const { addMarker, markers } = useEnhancedMarkers(map);

		const shop = {
			id: 'shop1',
			lat: 18.7985,
			lng: 98.968,
			name: 'Test Shop',
		};

		addMarker(shop, {
			size: 'medium',
			shape: 'circle',
			color: '#3b82f6',
			animation: 'pulse',
		});

		expect(markers.value.size).toBe(1);
		expect(markers.value.has('shop1')).toBe(true);
	});

	it('should remove marker with animation', async () => {
		const { addMarker, removeMarker, markers } = useEnhancedMarkers(map);

		const shop = {
			id: 'shop2',
			lat: 18.7985,
			lng: 98.968,
		};

		addMarker(shop);
		expect(markers.value.size).toBe(1);

		removeMarker('shop2');

		await new Promise((resolve) => setTimeout(resolve, 350));
		expect(markers.value.size).toBe(0);
	});

	it('should update marker style', () => {
		const { addMarker, updateMarkerStyle, markerElements } = useEnhancedMarkers(map);

		const shop = {
			id: 'shop3',
			lat: 18.7985,
			lng: 98.968,
		};

		addMarker(shop);
		updateMarkerStyle('shop3', {
			color: '#10b981',
			animation: 'bounce',
		});

		const el = markerElements.value.get('shop3');
		expect(el.style.backgroundColor).toBe('rgb(16, 185, 129)');
		expect(el.classList.contains('marker-bounce')).toBe(true);
	});

	it('should highlight marker', () => {
		const { addMarker, highlightMarker, markerElements } = useEnhancedMarkers(map);

		const shop = {
			id: 'shop4',
			lat: 18.7985,
			lng: 98.968,
		};

		addMarker(shop);
		highlightMarker('shop4', true);

		const el = markerElements.value.get('shop4');
		expect(el.style.transform).toContain('scale(1.3)');
		expect(el.style.zIndex).toBe('1000');
	});

	it('should add markers in batch with stagger', async () => {
		const { addMarkersBatch, markers } = useEnhancedMarkers(map);

		const shops = [
			{ id: 'shop5', lat: 18.7985, lng: 98.968 },
			{ id: 'shop6', lat: 18.7990, lng: 98.969 },
			{ id: 'shop7', lat: 18.7995, lng: 98.970 },
		];

		addMarkersBatch(shops, {}, 10);

		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(markers.value.size).toBe(3);
	});

	it('should clear all markers', () => {
		const { addMarker, clearMarkers, markers } = useEnhancedMarkers(map);

		addMarker({ id: 'shop8', lat: 18.7985, lng: 98.968 });
		addMarker({ id: 'shop9', lat: 18.7990, lng: 98.969 });

		expect(markers.value.size).toBe(2);

		clearMarkers();

		// Markers are removed with animation, so check after delay
		setTimeout(() => {
			expect(markers.value.size).toBe(0);
		}, 350);
	});

	it('should get markers in viewport', () => {
		const { addMarker, getMarkersInViewport } = useEnhancedMarkers(map);

		addMarker({ id: 'shop10', lat: 18.7985, lng: 98.968 });
		addMarker({ id: 'shop11', lat: 18.7990, lng: 98.969 });

		const visible = getMarkersInViewport();
		expect(visible.length).toBe(2);
	});
});
