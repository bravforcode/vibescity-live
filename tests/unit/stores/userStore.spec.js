import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/lib/supabase", () => ({
	supabase: {
		auth: {
			getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
			onAuthStateChange: vi.fn(() => ({
				data: { subscription: { unsubscribe: vi.fn() } },
			})),
		},
		from: vi.fn(() => ({
			select: vi.fn(() => ({
				eq: vi.fn(() => ({
					single: vi.fn(async () => ({ data: null, error: null })),
				})),
			})),
		})),
	},
	isSupabaseSchemaCacheError: vi.fn(() => false),
}));

vi.mock("../../../src/i18n.js", () => ({
	default: { global: { locale: { value: "en" } } },
}));

import { useUserStore } from "../../../src/store/userStore";

describe("userStore", () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	// isAuthenticated
	describe("isAuthenticated", () => {
		it("returns false when no session exists", () => {
			const store = useUserStore();
			expect(store.isAuthenticated).toBe(false);
		});

		it("returns true when session and user are set", () => {
			const store = useUserStore();
			store.$patch({
				authSession: { access_token: "token-abc" },
				authUser: { id: "user-1", email: "test@test.com" },
			});
			expect(store.isAuthenticated).toBe(true);
		});

		it("returns false when session exists but user is null", () => {
			const store = useUserStore();
			store.$patch({
				authSession: { access_token: "token-abc" },
				authUser: null,
			});
			expect(store.isAuthenticated).toBe(false);
		});
	});

	// isAdmin
	describe("isAdmin", () => {
		it("returns false for unauthenticated user", () => {
			const store = useUserStore();
			expect(store.isAdmin).toBe(false);
		});

		it("returns true when app_metadata.role is admin", () => {
			const store = useUserStore();
			store.$patch({
				authUser: {
					id: "admin-1",
					email: "admin@vibecity.live",
					app_metadata: { role: "admin" },
					user_metadata: {},
				},
			});
			expect(store.isAdmin).toBe(true);
		});

		it("returns true when user_metadata.roles includes super_admin", () => {
			const store = useUserStore();
			store.$patch({
				authUser: {
					id: "admin-2",
					email: "superadmin@vibecity.live",
					app_metadata: {},
					user_metadata: { roles: ["super_admin"] },
				},
			});
			expect(store.isAdmin).toBe(true);
		});

		it("returns false for authenticated non-admin user", () => {
			const store = useUserStore();
			store.$patch({
				authSession: { access_token: "token-abc" },
				authUser: {
					id: "user-2",
					email: "user@vibecity.live",
					app_metadata: { role: "authenticated" },
					user_metadata: {},
				},
			});
			expect(store.isAdmin).toBe(false);
		});

		it("role matching is case-insensitive", () => {
			const store = useUserStore();
			store.$patch({
				authUser: {
					id: "admin-3",
					email: "admin3@vibecity.live",
					app_metadata: { role: "ADMIN" },
					user_metadata: {},
				},
			});
			expect(store.isAdmin).toBe(true);
		});
	});

	// userId / userEmail
	describe("userId and userEmail", () => {
		it("returns null when no user", () => {
			const store = useUserStore();
			expect(store.userId).toBeNull();
			expect(store.userEmail).toBe("");
		});

		it("returns correct userId and normalized email", () => {
			const store = useUserStore();
			store.$patch({
				authUser: { id: "user-xyz", email: " Test@Example.COM " },
			});
			expect(store.userId).toBe("user-xyz");
			expect(store.userEmail).toBe("test@example.com");
		});
	});

	// currentLevel
	describe("currentLevel", () => {
		it("returns level 1 at 0 XP", () => {
			const store = useUserStore();
			store.$patch({ profile: { xp: 0 } });
			expect(store.currentLevel).toBe(1);
		});

		it("returns level 2 at 100 XP", () => {
			const store = useUserStore();
			store.$patch({ profile: { xp: 100 } });
			expect(store.currentLevel).toBe(2);
		});

		it("returns level 4 at 600 XP", () => {
			const store = useUserStore();
			store.$patch({ profile: { xp: 600 } });
			expect(store.currentLevel).toBe(4);
		});
	});
});
