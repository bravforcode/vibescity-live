const toErrorString = (value) =>
	typeof value === "string" ? value : String(value ?? "");

export const getRuntimeErrorMessage = (error) =>
	toErrorString(error?.message || error?.reason || error);

export const getRuntimeErrorStack = (error) =>
	toErrorString(error?.stack || error?.reason?.stack || "");

export const isAsyncChunkLoadError = (error) => {
	const message = getRuntimeErrorMessage(error).toLowerCase();
	const stack = getRuntimeErrorStack(error).toLowerCase();

	return (
		message.includes("chunkloaderror") ||
		message.includes("loading chunk") ||
		message.includes("failed to fetch dynamically imported module") ||
		message.includes("importing a module script failed") ||
		stack.includes("lazy-compilation-proxy") ||
		stack.includes("__webpack_require__.f.j")
	);
};

export const isMapLibreFailedFetchError = (error) => {
	const message = getRuntimeErrorMessage(error).toLowerCase();
	if (
		!message.includes("failed to fetch") &&
		!message.includes("networkerror") &&
		!message.includes("load failed")
	) {
		return false;
	}

	const stack = getRuntimeErrorStack(error).toLowerCase();
	const url = toErrorString(error?.url).toLowerCase();

	return (
		stack.includes("maplibre") ||
		url.includes("openfreemap.org") ||
		url.includes("openmaptiles.org") ||
		url.includes("demotiles.maplibre.org")
	);
};

export const shouldSuppressUnhandledRuntimeRejection = (error) =>
	isAsyncChunkLoadError(error) || isMapLibreFailedFetchError(error);
