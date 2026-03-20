const sanitizeBuildValue = (value: unknown): string => {
	const raw = String(value || "").trim();
	return raw.slice(0, 120);
};

const fromBuildVersion = sanitizeBuildValue(import.meta.env.VITE_BUILD_VERSION);
const fromCommitSha = sanitizeBuildValue(import.meta.env.VITE_COMMIT_SHA).slice(
	0,
	7,
);
const fromAppVersion = sanitizeBuildValue(import.meta.env.VITE_APP_VERSION);
const localFallback = `dev-${new Date().toISOString().slice(0, 10)}`;

export const BUILD_VERSION =
	fromBuildVersion || fromCommitSha || fromAppVersion || localFallback;
