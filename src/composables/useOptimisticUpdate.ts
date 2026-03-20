type NotifyFn = (payload: {
	type: "error" | "success";
	message: string;
}) => void;
type ReportFn = (error: unknown, context?: Record<string, unknown>) => void;

type MutationErrorMessage = string | ((error: unknown) => string);

type MutationResult<TData> =
	| { success: true; data: TData }
	| { success: false; error: string; cause: unknown };

const toErrorMessage = (
	error: unknown,
	fallback: MutationErrorMessage = "บันทึกไม่สำเร็จ กรุณาลองใหม่",
) => {
	if (typeof fallback === "function") {
		return fallback(error);
	}
	const direct = String(
		(error as { message?: string } | null)?.message || "",
	).trim();
	return direct || fallback;
};

export const cloneOptimisticValue = <T>(value: T): T => {
	if (value === null || value === undefined) return value;
	if (typeof value !== "object") return value;

	if (typeof structuredClone === "function") {
		try {
			return structuredClone(value);
		} catch {
			// fall through
		}
	}

	if (Array.isArray(value)) {
		return [...value] as T;
	}
	if (value instanceof Set) {
		return new Set(value) as T;
	}
	if (value instanceof Map) {
		return new Map(value) as T;
	}

	try {
		return JSON.parse(JSON.stringify(value)) as T;
	} catch {
		return { ...(value as Record<string, unknown>) } as T;
	}
};

export const runOptimisticMutation = async <TSnapshot, TData>({
	capture,
	applyOptimistic,
	rollback,
	commit,
	onSuccess,
	onError,
	notify,
	reportError,
	errorMessage,
}: {
	capture?: () => TSnapshot;
	applyOptimistic?: (snapshot: TSnapshot | undefined) => void;
	rollback?: (snapshot: TSnapshot | undefined, error: unknown) => void;
	commit: () => Promise<TData>;
	onSuccess?: (
		data: TData,
		snapshot: TSnapshot | undefined,
	) => void | Promise<void>;
	onError?: (
		error: unknown,
		snapshot: TSnapshot | undefined,
	) => void | Promise<void>;
	notify?: NotifyFn;
	reportError?: ReportFn;
	errorMessage?: MutationErrorMessage;
}): Promise<MutationResult<TData>> => {
	const snapshot = capture?.();
	applyOptimistic?.(snapshot);

	try {
		const data = await commit();
		await onSuccess?.(data, snapshot);
		return { success: true, data };
	} catch (error) {
		rollback?.(snapshot, error);
		await onError?.(error, snapshot);
		const message = toErrorMessage(error, errorMessage);
		notify?.({ type: "error", message });
		reportError?.(error, { message });
		return { success: false, error: message, cause: error };
	}
};

export const runCommitMutation = async <TData>({
	commit,
	onSuccess,
	onError,
	notify,
	reportError,
	errorMessage,
}: {
	commit: () => Promise<TData>;
	onSuccess?: (data: TData) => void | Promise<void>;
	onError?: (error: unknown) => void | Promise<void>;
	notify?: NotifyFn;
	reportError?: ReportFn;
	errorMessage?: MutationErrorMessage;
}): Promise<MutationResult<TData>> =>
	runOptimisticMutation({
		commit,
		onSuccess: (data) => onSuccess?.(data),
		onError: (error) => onError?.(error),
		notify,
		reportError,
		errorMessage,
	});

export function useOptimisticUpdate({
	notify,
	reportError,
}: {
	notify?: NotifyFn;
	reportError?: ReportFn;
} = {}) {
	const optimisticMutate = async <TStore extends Record<string, unknown>>(
		store: TStore,
		key: keyof TStore,
		newValue: TStore[keyof TStore],
		apiCall: () => Promise<unknown>,
	) =>
		runOptimisticMutation({
			capture: () => cloneOptimisticValue(store[key]),
			applyOptimistic: () => {
				store[key] = newValue;
			},
			rollback: (snapshot) => {
				store[key] = snapshot as TStore[keyof TStore];
			},
			commit: apiCall,
			notify,
			reportError,
			errorMessage: "บันทึกไม่สำเร็จ กรุณาลองใหม่",
		});

	return { optimisticMutate };
}
