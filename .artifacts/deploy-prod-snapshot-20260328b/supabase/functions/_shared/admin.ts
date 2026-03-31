type AuthUser = {
	email?: string | null;
	app_metadata?: Record<string, unknown>;
	user_metadata?: Record<string, unknown>;
};

const DEFAULT_ADMIN_EMAILS = ["omchai.g44@gmail.com", "nxme176@gmail.com"];

const normalize = (value: unknown) => String(value || "").trim().toLowerCase();

const parseCsv = (raw: string | null | undefined) =>
	String(raw || "")
		.split(",")
		.map((item) => normalize(item))
		.filter(Boolean);

const collectRoles = (user: AuthUser) => {
	const out = new Set<string>();
	const appMeta = user?.app_metadata || {};
	const userMeta = user?.user_metadata || {};

	const roleCandidates = [appMeta.role, userMeta.role];
	for (const role of roleCandidates) {
		const normalized = normalize(role);
		if (normalized) out.add(normalized);
	}

	const roleArrays = [
		Array.isArray(appMeta.roles) ? appMeta.roles : [],
		Array.isArray(userMeta.roles) ? userMeta.roles : [],
	];
	for (const arr of roleArrays) {
		for (const role of arr) {
			const normalized = normalize(role);
			if (normalized) out.add(normalized);
		}
	}

	return out;
};

const buildAllowlist = () => {
	const envAllowlist = parseCsv(Deno.env.get("ADMIN_EMAIL_ALLOWLIST"));
	const values = [...DEFAULT_ADMIN_EMAILS, ...envAllowlist];
	const out = new Set<string>();
	for (const email of values) out.add(normalize(email));
	return out;
};

let cachedAllowlist: Set<string> | null = null;

const getAllowlist = () => {
	if (!cachedAllowlist) cachedAllowlist = buildAllowlist();
	return cachedAllowlist;
};

const isAllowlisted = (user: AuthUser) => {
	const email = normalize(user?.email);
	if (!email) return false;
	return getAllowlist().has(email);
};

export const isAdminUser = (user: AuthUser) => {
	const roles = collectRoles(user);
	return roles.has("admin") || roles.has("super_admin") || isAllowlisted(user);
};

export const canViewPiiAudit = (user: AuthUser) => {
	const roles = collectRoles(user);
	return (
		roles.has("admin") ||
		roles.has("super_admin") ||
		roles.has("pii_audit_viewer") ||
		isAllowlisted(user)
	);
};
