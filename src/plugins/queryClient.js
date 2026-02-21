import { QueryClient } from "@tanstack/vue-query";

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 1000 * 60 * 5, // 5 minutes
			gcTime: 1000 * 60 * 10, // 10 minutes
			refetchOnWindowFocus: true,
			retry: 1,
		},
	},
});

export const vueQueryOptions = {
	queryClient,
};
