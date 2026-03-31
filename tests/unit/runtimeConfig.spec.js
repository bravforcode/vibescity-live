import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/i18n.js", () => ({
	default: { global: { t: (key) => key } },
}));

import { isLocalBrowserHostname } from "../../src/lib/runtimeConfig";

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
});
