const hasWindow = () => typeof window !== "undefined";

const hasStorage = (storageName) => {
	if (!hasWindow()) return false;
	try {
		return Boolean(window[storageName]);
	} catch {
		return false;
	}
};

const readStorageFlag = (storageName, key) => {
	if (!hasStorage(storageName)) return false;
	try {
		return window[storageName].getItem(key) === "true";
	} catch {
		return false;
	}
};

export const MAP_DEBUG_STORAGE_KEY = "vibecity.debug.map";
export const PWA_DEBUG_STORAGE_KEY = "vibecity.debug.pwa";
export const APP_DEBUG_STORAGE_KEY = "vibecity.debug.app";
export const MAP_DEBUG_WINDOW_FLAG = "__VIBECITY_MAP_DEBUG";
export const PWA_DEBUG_WINDOW_FLAG = "__VIBECITY_PWA_DEBUG";
export const APP_DEBUG_WINDOW_FLAG = "__VIBECITY_APP_DEBUG";

export const isDebugFlagEnabled = (windowFlagName, storageKey) =>
	import.meta.env.DEV &&
	hasWindow() &&
	(window[windowFlagName] === true ||
		readStorageFlag("sessionStorage", storageKey) ||
		readStorageFlag("localStorage", storageKey));

export const isAppDebugLoggingEnabled = () =>
	isDebugFlagEnabled(APP_DEBUG_WINDOW_FLAG, APP_DEBUG_STORAGE_KEY);
