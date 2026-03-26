import { shallowRef } from "vue";

const failedMediaUrls = new Set();

export const mediaFailureVersion = shallowRef(0);

const cleanString = (value) => {
	if (value === null || value === undefined) return "";
	return String(value).trim();
};

export const normalizeMediaUrl = (value) => {
	const raw = cleanString(value);
	if (!raw) return "";
	if (raw.startsWith("data:")) return raw;

	try {
		const base =
			typeof window !== "undefined" && window.location?.origin
				? window.location.origin
				: "https://www.vibescity.live";
		const parsed = new URL(raw, base);
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
		parsed.hash = "";
		return parsed.toString();
	} catch {
		return "";
	}
};

export const isMediaUrlFailed = (value) => {
	const normalized = normalizeMediaUrl(value);
	return normalized ? failedMediaUrls.has(normalized) : false;
};

export const getUsableMediaUrl = (value) => {
	const normalized = normalizeMediaUrl(value);
	if (!normalized || failedMediaUrls.has(normalized)) return "";
	return normalized;
};

export const markMediaUrlFailed = (value) => {
	const normalized = normalizeMediaUrl(value);
	if (!normalized || failedMediaUrls.has(normalized)) return false;
	failedMediaUrls.add(normalized);
	mediaFailureVersion.value += 1;
	return true;
};

export const resetFailedMediaUrls = () => {
	if (!failedMediaUrls.size) return;
	failedMediaUrls.clear();
	mediaFailureVersion.value += 1;
};

export const markMediaElementFailed = (event, value) => {
	const errorCode = Number(event?.target?.error?.code || 0);
	if (errorCode === 1) return false;
	return markMediaUrlFailed(value);
};
