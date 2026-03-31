import { onMounted, watchEffect } from "vue";
import { useRoute, useRouter } from "vue-router";
import { getOrCreateVisitorId } from "@/services/visitorIdentity";
import { useUserStore } from "@/store/userStore";

type GuardOptions = {
	strictAuth?: boolean;
	allowVisitorFallback?: boolean;
	deniedPath?: string;
};

export function useDashboardGuard(
	requiredRole: string,
	options: GuardOptions = {},
) {
	const router = useRouter();
	const route = useRoute();
	const userStore = useUserStore();

	const routeLocale = String(route.params?.locale || "")
		.trim()
		.toLowerCase();
	const deniedPath =
		options.deniedPath ||
		(routeLocale === "th" || routeLocale === "en" ? `/${routeLocale}` : "/en");
	const strictAuth = options.strictAuth === true;
	const allowVisitorFallback = options.allowVisitorFallback !== false;

	const runGuard = async () => {
		await userStore.initAuth();

		const required = String(requiredRole || "")
			.trim()
			.toLowerCase();
		const isAuthenticated = Boolean(userStore.isAuthenticated);
		const hasRole = required ? (userStore as any).hasRole?.(required) : true;

		if (!required) return true;
		if (userStore.isAdmin || hasRole) return true;

		if (!isAuthenticated && allowVisitorFallback) {
			const visitorId =
				typeof localStorage !== "undefined"
					? localStorage.getItem("vibe_visitor_id") || getOrCreateVisitorId()
					: null;
			if (visitorId) return true;
		}

		if (strictAuth && !isAuthenticated) {
			await router.replace(
				`${deniedPath}?redirect=${encodeURIComponent(route.fullPath)}`,
			);
			return false;
		}

		await router.replace(deniedPath);
		return false;
	};

	onMounted(() => {
		void runGuard();
	});

	watchEffect(() => {
		void runGuard();
	});
}
