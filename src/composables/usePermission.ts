import { computed } from "vue";
import { useUserStore } from "@/store/userStore";

const PERMISSIONS_BY_ROLE: Record<string, string[]> = {
	admin: ["*"],
	super_admin: ["*"],
	owner: ["view:kpi", "view:venue", "view:financial", "export:data"],
	partner: [
		"view:kpi",
		"view:financial",
		"edit:bank",
		"create:payout",
		"manage:subscription",
	],
};

const collectPermissions = (user: Record<string, any> | null): Set<string> => {
	if (!user || typeof user !== "object") return new Set();
	const out = new Set<string>();
	const appMeta = user.app_metadata || {};
	const userMeta = user.user_metadata || {};
	const explicitPerms = [
		...(Array.isArray(appMeta.permissions) ? appMeta.permissions : []),
		...(Array.isArray(userMeta.permissions) ? userMeta.permissions : []),
	];

	for (const perm of explicitPerms) {
		const text = String(perm || "")
			.trim()
			.toLowerCase();
		if (text) out.add(text);
	}

	const roleCandidates = [
		appMeta.role,
		userMeta.role,
		...(Array.isArray(appMeta.roles) ? appMeta.roles : []),
		...(Array.isArray(userMeta.roles) ? userMeta.roles : []),
	];
	for (const roleRaw of roleCandidates) {
		const role = String(roleRaw || "")
			.trim()
			.toLowerCase();
		if (!role) continue;
		const rolePerms = PERMISSIONS_BY_ROLE[role] || [];
		for (const perm of rolePerms) out.add(String(perm).toLowerCase());
	}

	return out;
};

export function usePermission(permission: string) {
	const userStore = useUserStore();
	const normalized = String(permission || "")
		.trim()
		.toLowerCase();

	const permissions = computed(() => collectPermissions(userStore.authUser));
	const hasPermission = computed(() => {
		if (!normalized) return false;
		if (userStore.isAdmin) return true;
		const set = permissions.value;
		return set.has("*") || set.has(normalized);
	});

	return { hasPermission, permissions };
}
