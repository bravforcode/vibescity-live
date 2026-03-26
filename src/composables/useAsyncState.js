import { computed, ref } from "vue";

/**
 * Composable for managing async operation states
 * Provides consistent loading, error, and success state handling
 *
 * @template T
 * @param {() => Promise<T>} asyncFn - Async function to execute
 * @param {Object} options - Configuration options
 * @returns {Object} State and control methods
 */
export function useAsyncState(asyncFn, options = {}) {
	const { immediate = false, onSuccess = null, onError = null } = options;

	// State
	const isLoading = ref(false);
	const isError = ref(false);
	const error = ref(null);
	const data = ref(null);

	// Computed
	const isReady = computed(() => data.value !== null);
	const isEmpty = computed(() => !isReading.value && data.value === null);
	const isReading = computed(() => isLoading.value);

	/**
	 * Execute the async function and update state
	 * @returns {Promise<any>}
	 */
	const execute = async () => {
		isLoading.value = true;
		isError.value = false;
		error.value = null;

		try {
			data.value = await asyncFn();
			if (onSuccess) onSuccess(data.value);
			return data.value;
		} catch (err) {
			isError.value = true;
			error.value = err;
			if (onError) onError(err);
			throw err;
		} finally {
			isLoading.value = false;
		}
	};

	/**
	 * Reset state to initial
	 */
	const reset = () => {
		isLoading.value = false;
		isError.value = false;
		error.value = null;
		data.value = null;
	};

	/**
	 * Retry the async operation
	 */
	const retry = () => execute();

	if (immediate) {
		execute();
	}

	return {
		// State
		isLoading,
		isError,
		error,
		data,

		// Computed
		isReady,
		isEmpty,
		isReading,

		// Methods
		execute,
		reset,
		retry,
	};
}
