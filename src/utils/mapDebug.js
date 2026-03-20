import {
	isDebugFlagEnabled,
	MAP_DEBUG_STORAGE_KEY,
	MAP_DEBUG_WINDOW_FLAG,
} from "./debugFlags";

export { MAP_DEBUG_STORAGE_KEY, MAP_DEBUG_WINDOW_FLAG } from "./debugFlags";

export const isMapDebugLoggingEnabled = () =>
	isDebugFlagEnabled(MAP_DEBUG_WINDOW_FLAG, MAP_DEBUG_STORAGE_KEY);

export const mapDebugLog = (...args) => {
	if (isMapDebugLoggingEnabled()) {
		console.log(...args);
	}
};

export const mapDebugWarn = (...args) => {
	if (isMapDebugLoggingEnabled()) {
		console.warn(...args);
	}
};
