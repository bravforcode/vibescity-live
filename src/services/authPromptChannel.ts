export type AuthPromptHandler = (source: string) => void;

class AuthPromptChannel {
	private handlers = new Set<AuthPromptHandler>();

	subscribeAuthPrompt(handler: AuthPromptHandler): () => void {
		if (typeof handler !== "function") {
			return () => {};
		}
		this.handlers.add(handler);
		return () => {
			this.handlers.delete(handler);
		};
	}

	emitAuthRequired(source = "unknown"): void {
		const safeSource = String(source || "unknown").slice(0, 80);
		const currentHandlers = [...this.handlers];
		for (const handler of currentHandlers) {
			try {
				handler(safeSource);
			} catch {
				// Fail-open: auth prompt listeners must never crash runtime flows.
			}
		}
	}
}

export const authPromptChannel = new AuthPromptChannel();
