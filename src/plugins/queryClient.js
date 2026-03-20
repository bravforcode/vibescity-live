import { QueryClient } from "@tanstack/vue-query";
import { isRetriableApiError } from "@/services/apiClient";

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 1000 * 60 * 5, // 5 minutes
			gcTime: 1000 * 60 * 10, // 10 minutes
			refetchOnWindowFocus: true,
			retry: (failureCount, error) => {
				if (failureCount >= 3) return false;
				return isRetriableApiError(error);
			},
		},
	},
});

export const vueQueryOptions = {
	queryClient,
};
