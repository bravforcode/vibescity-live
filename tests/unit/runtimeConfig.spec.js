import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/i18n.js", () => ({
	default: { global: { t: (key) => key } },
}));

import {
	isLocalBrowserHostname,
	isPublicBrowserHostname,
	shouldAvoidCrossOriginApiOnPublicHost,
	shouldAvoidWebSocketOnPublicHost,
} from "../../src/lib/runtimeConfig";

describe("runtimeConfig local host detection", () => {
	it("treats loopback, LAN, and local hostnames as local browser hosts", () => {
		expect(isLocalBrowserHostname("localhost")).toBe(true);
		expect(isLocalBrowserHostname("127.0.0.1")).toBe(true);
		expect(isLocalBrowserHostname("::1")).toBe(true);
		expect(isLocalBrowserHostname("10.0.0.24")).toBe(true);
		expect(isLocalBrowserHostname("172.27.16.1")).toBe(true);
		expect(isLocalBrowserHostname("192.168.1.15")).toBe(true);
		expect(isLocalBrowserHostname("preview.local")).toBe(true);
	});

	it("keeps public and out-of-range hosts out of the local bucket", () => {
		expect(isLocalBrowserHostname("172.15.0.1")).toBe(false);
		expect(isLocalBrowserHostname("172.32.0.1")).toBe(false);
		expect(isLocalBrowserHostname("8.8.8.8")).toBe(false);
		expect(isLocalBrowserHostname("vibecity.live")).toBe(false);
	});

	it("treats non-local hostnames as public browser hosts", () => {
		expect(isPublicBrowserHostname("vibecity.live")).toBe(true);
		expect(isPublicBrowserHostname("preview.vercel.app")).toBe(true);
		expect(isPublicBrowserHostname("8.8.8.8")).toBe(true);
		expect(isPublicBrowserHostname("localhost")).toBe(false);
		expect(isPublicBrowserHostname("192.168.1.15")).toBe(false);
	});

	it("avoids cross-origin API lanes on public production hosts", () => {
		expect(
			shouldAvoidCrossOriginApiOnPublicHost({
				baseUrl: "https://vibecity-api.fly.dev/api/v1",
				currentOrigin: "https://www.vibescity.live",
				currentHostname: "www.vibescity.live",
				isProd: true,
			}),
		).toBe(true);

		expect(
			shouldAvoidCrossOriginApiOnPublicHost({
				baseUrl: "https://www.vibescity.live/api/v1",
				currentOrigin: "https://www.vibescity.live",
				currentHostname: "www.vibescity.live",
				isProd: true,
			}),
		).toBe(false);

		expect(
			shouldAvoidCrossOriginApiOnPublicHost({
				baseUrl: "https://vibecity-api.fly.dev/api/v1",
				currentOrigin: "http://localhost:5173",
				currentHostname: "localhost",
				isProd: false,
			}),
		).toBe(false);
	});

	it("keeps public production websocket auto-connect opt-in for cross-origin backends", () => {
		expect(
			shouldAvoidWebSocketOnPublicHost({
				wsUrl: "wss://vibecity-api.fly.dev/api/v1/vibes/vibe-stream",
				currentOrigin: "https://vibescity.live",
				currentHostname: "vibescity.live",
				isProd: true,
			}),
		).toBe(true);

		expect(
			shouldAvoidWebSocketOnPublicHost({
				wsUrl: "wss://vibecity-api.fly.dev/api/v1/vibes/vibe-stream",
				currentOrigin: "https://vibescity.live",
				currentHostname: "vibescity.live",
				isProd: true,
				publicAutoconnect: true,
			}),
		).toBe(false);

		expect(
			shouldAvoidWebSocketOnPublicHost({
				wsUrl: "wss://vibescity.live/api/v1/vibes/vibe-stream",
				currentOrigin: "https://vibescity.live",
				currentHostname: "vibescity.live",
				isProd: true,
			}),
		).toBe(false);

		expect(
			shouldAvoidWebSocketOnPublicHost({
				wsUrl: "wss://vibecity-api.fly.dev/api/v1/vibes/vibe-stream",
				currentOrigin: "http://localhost:5173",
				currentHostname: "localhost",
				isProd: false,
			}),
		).toBe(false);
	});
});
