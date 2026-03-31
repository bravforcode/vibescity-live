export const PROD_MAP_STYLE_MODE = "prod";
export const QUIET_MAP_STYLE_MODE = "quiet";

export const normalizeMapStyleMode = (value) =>
	String(value || PROD_MAP_STYLE_MODE)
		.trim()
		.toLowerCase() === QUIET_MAP_STYLE_MODE
		? QUIET_MAP_STYLE_MODE
		: PROD_MAP_STYLE_MODE;

export const resolveRuntimeMapStyleMode = ({
	isLocalhostBrowser = false,
	requestedMode,
} = {}) =>
	isLocalhostBrowser
		? normalizeMapStyleMode(requestedMode)
		: PROD_MAP_STYLE_MODE;

export const resolveMapStyleUrlForMode = ({
	styleMode = PROD_MAP_STYLE_MODE,
	prodStyleUrl = "",
	quietStyleUrl = "",
	isStrictMapE2E = false,
	strictE2EStyleUrl = "",
} = {}) => {
	if (isStrictMapE2E && strictE2EStyleUrl) {
		return strictE2EStyleUrl;
	}
	return normalizeMapStyleMode(styleMode) === QUIET_MAP_STYLE_MODE
		? quietStyleUrl
		: prodStyleUrl;
};

export const shouldEnableMapTextLabels = (styleMode) =>
	normalizeMapStyleMode(styleMode) !== QUIET_MAP_STYLE_MODE;
