export const FLAG_GOVERNANCE = Object.freeze({
	enable_partner_program: {
		key: "enable_partner_program",
		sunsetAfter: null,
		dependsOn: [],
		owner: "frontend-oncall",
	},
	ff_owner_dashboard_v2: {
		key: "ff_owner_dashboard_v2",
		sunsetAfter: "2026-Q4",
		dependsOn: [],
		owner: "frontend-oncall",
	},
	ff_partner_dashboard_v2: {
		key: "ff_partner_dashboard_v2",
		sunsetAfter: "2026-Q4",
		dependsOn: [],
		owner: "frontend-oncall",
	},
	ff_sensitive_reveal: {
		key: "ff_sensitive_reveal",
		sunsetAfter: null,
		dependsOn: ["ff_partner_dashboard_v2"],
		owner: "security-oncall",
	},
});

export const validateFlagDependencies = (key, isEnabled) => {
	const config = FLAG_GOVERNANCE[key];
	if (!config) return true;
	const deps = Array.isArray(config.dependsOn) ? config.dependsOn : [];
	return deps.every((dep) => Boolean(isEnabled(dep)));
};

const QUARTER_PATTERN = /^(\d{4})-Q([1-4])$/;

const quarterToDate = (quarterText) => {
	const text = String(quarterText || "")
		.trim()
		.toUpperCase();
	const match = text.match(QUARTER_PATTERN);
	if (!match) return null;
	const year = Number(match[1]);
	const quarter = Number(match[2]);
	const month = quarter * 3;
	return new Date(Date.UTC(year, month, 1, 0, 0, 0));
};

export const isGovernanceSunsetExceeded = (sunsetAfter, now = new Date()) => {
	if (!sunsetAfter) return false;
	const sunsetDate = quarterToDate(sunsetAfter);
	if (!sunsetDate) return false;
	return now.getTime() >= sunsetDate.getTime();
};

export const getFlagGovernanceViolations = ({
	flags = {},
	now = new Date(),
} = {}) => {
	const violations = [];
	for (const [key, config] of Object.entries(FLAG_GOVERNANCE)) {
		if (!config?.sunsetAfter) continue;
		const enabled = Boolean(flags?.[key]);
		if (!enabled) continue;
		if (isGovernanceSunsetExceeded(config.sunsetAfter, now)) {
			violations.push({
				key,
				type: "sunset_expired",
				sunsetAfter: config.sunsetAfter,
				owner: config.owner || "unknown",
			});
		}
	}
	return violations;
};
