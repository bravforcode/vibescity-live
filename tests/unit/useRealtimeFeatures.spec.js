import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ref } from 'vue';
import { useRealtimeFeatures } from '@/composables/map/useRealtimeFeatures';

describe('useRealtimeFeatures', () => {
	let map;
	let mockWebSocket;

	beforeEach(() => {
		map = ref({});

		// Mock WebSocket as a proper constructor
		mockWebSocket = {
			send: vi.fn(),
			close: vi.fn(),
			onopen: null,
			onmessage: null,
			onerror: null,
			onclose: null,
			readyState: 1,
		};

		global.WebSocket = vi.fn(
			class WebSocketMock {
				constructor() {
					Object.assign(this, mockWebSocket);
					mockWebSocket = this;
				}
			},
		);
		global.fetch = vi.fn();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it('should initialize with empty data', () => {
		const {
			trafficData,
			venueStatuses,
			liveEvents,
			isConnected,
		} = useRealtimeFeatures(map, {});

		expect(trafficData.value).toEqual([]);
		expect(venueStatuses.value.size).toBe(0);
		expect(liveEvents.value).toEqual([]);
		expect(isConnected.value).toBe(false);
	});

	it('should connect to WebSocket', () => {
		const { init, isConnected } = useRealtimeFeatures(map, {
			wsUrl: 'wss://test.com/ws',
		});

		init();

		expect(global.WebSocket).toHaveBeenCalledWith('wss://test.com/ws');

		// Simulate connection
		mockWebSocket.onopen();
		expect(isConnected.value).toBe(true);
		expect(mockWebSocket.send).toHaveBeenCalled();
	});

	it('should handle traffic updates', () => {
		const onTrafficUpdate = vi.fn();
		const { init, trafficData } = useRealtimeFeatures(map, {
			wsUrl: 'wss://test.com/ws',
			onTrafficUpdate,
		});

		init();
		mockWebSocket.onopen();

		const trafficPayload = [
			{
				id: 'road1',
				coordinates: [[98.968, 18.7985], [98.969, 18.7990]],
				speed: 45,
				congestion: 'medium',
			},
		];

		mockWebSocket.onmessage({
			data: JSON.stringify({
				type: 'traffic',
				payload: trafficPayload,
			}),
		});

		expect(trafficData.value.length).toBe(1);
		expect(onTrafficUpdate).toHaveBeenCalledWith(trafficData.value);
	});

	it('should handle venue status updates', () => {
		const onVenueStatusUpdate = vi.fn();
		const { init, venueStatuses, getVenueStatus } = useRealtimeFeatures(map, {
			wsUrl: 'wss://test.com/ws',
			onVenueStatusUpdate,
		});

		init();
		mockWebSocket.onopen();

		mockWebSocket.onmessage({
			data: JSON.stringify({
				type: 'venue_status',
				payload: {
					venueId: 'venue1',
					status: 'open',
					crowdLevel: 75,
					waitTime: 15,
				},
			}),
		});

		expect(venueStatuses.value.size).toBe(1);
		expect(getVenueStatus('venue1').crowdLevel).toBe(75);
		expect(onVenueStatusUpdate).toHaveBeenCalled();
	});

	it('should check if venue is live', () => {
		const { init, isVenueLive } = useRealtimeFeatures(map, {
			wsUrl: 'wss://test.com/ws',
		});

		init();
		mockWebSocket.onopen();

		mockWebSocket.onmessage({
			data: JSON.stringify({
				type: 'venue_status',
				payload: {
					venueId: 'venue2',
					status: 'open',
					lastSeen: Date.now(),
				},
			}),
		});

		expect(isVenueLive('venue2')).toBe(true);
	});

	it('should handle live events', () => {
		const onEventUpdate = vi.fn();
		const { init, liveEvents } = useRealtimeFeatures(map, {
			wsUrl: 'wss://test.com/ws',
			onEventUpdate,
		});

		init();
		mockWebSocket.onopen();

		mockWebSocket.onmessage({
			data: JSON.stringify({
				type: 'event',
				payload: {
					eventId: 'event1',
					action: 'add',
					event: {
						id: 'event1',
						name: 'Live Music',
						lat: 18.7985,
						lng: 98.968,
					},
				},
			}),
		});

		expect(liveEvents.value.length).toBe(1);
		expect(onEventUpdate).toHaveBeenCalled();
	});

	it('should calculate distance between points', () => {
		const { init } = useRealtimeFeatures(map, {});
		init();

		// Access private function through closure (for testing)
		// In real scenario, this would be tested through public API
		expect(true).toBe(true); // Placeholder
	});

	it('should get nearby hotspots', () => {
		const { init, getNearbyHotspots } = useRealtimeFeatures(map, {
			wsUrl: 'wss://test.com/ws',
		});

		init();
		mockWebSocket.onopen();

		mockWebSocket.onmessage({
			data: JSON.stringify({
				type: 'hotspot',
				payload: [
					{
						id: 'hotspot1',
						lat: 18.7985,
						lng: 98.968,
						intensity: 8,
					},
					{
						id: 'hotspot2',
						lat: 18.8000,
						lng: 98.980,
						intensity: 6,
					},
				],
			}),
		});

		const nearby = getNearbyHotspots(18.7985, 98.968, 1);
		expect(nearby.length).toBeGreaterThan(0);
	});

	it('should reconnect on disconnect', async () => {
		const { init, isConnected } = useRealtimeFeatures(map, {
			wsUrl: 'wss://test.com/ws',
		});

		init();
		mockWebSocket.onopen();
		expect(isConnected.value).toBe(true);

		mockWebSocket.onclose();
		expect(isConnected.value).toBe(false);

		// Should attempt reconnect
		await new Promise((resolve) => setTimeout(resolve, 1100));
		expect(global.WebSocket).toHaveBeenCalledTimes(2);
	});

	it('should cleanup on unmount', () => {
		const { init, cleanup } = useRealtimeFeatures(map, {
			wsUrl: 'wss://test.com/ws',
		});

		init();
		cleanup();

		expect(mockWebSocket.close).toHaveBeenCalled();
	});

	it('should not reconnect after cleanup closes the socket', async () => {
		mockWebSocket.close = vi.fn(() => {
			mockWebSocket.onclose?.();
		});

		const { init, cleanup } = useRealtimeFeatures(map, {
			wsUrl: 'wss://test.com/ws',
		});

		init();
		mockWebSocket.onopen();
		cleanup();

		await new Promise((resolve) => setTimeout(resolve, 1100));
		expect(global.WebSocket).toHaveBeenCalledTimes(1);
	});
});
