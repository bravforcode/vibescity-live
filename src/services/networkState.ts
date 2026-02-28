type NetworkListener = (isOnline: boolean) => void;

let networkOnlineState =
	typeof navigator === "undefined" ? true : Boolean(navigator.onLine);

const listeners = new Set<NetworkListener>();

export const getNetworkOnlineState = (): boolean => networkOnlineState;

export const setNetworkOnlineState = (isOnline: boolean): void => {
	networkOnlineState = Boolean(isOnline);
	for (const listener of listeners) {
		listener(networkOnlineState);
	}
};

export const subscribeNetworkState = (
	listener: NetworkListener,
): (() => void) => {
	listeners.add(listener);
	listener(networkOnlineState);
	return () => {
		listeners.delete(listener);
	};
};
