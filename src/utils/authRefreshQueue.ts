export type AuthRefreshFn = () => Promise<unknown>;

class AuthRefreshQueue {
	private refreshPromise: Promise<unknown> | null = null;

	async ensureFreshToken(refreshFn: AuthRefreshFn): Promise<unknown> {
		if (this.refreshPromise) {
			return this.refreshPromise;
		}
		this.refreshPromise = Promise.resolve()
			.then(() => refreshFn())
			.finally(() => {
				this.refreshPromise = null;
			});
		return this.refreshPromise;
	}
}

export const authRefreshQueue = new AuthRefreshQueue();
