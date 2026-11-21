import { QueryClient } from "@tanstack/react-query";
import { CatalogError } from "./catalog";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 60_000,
      // Retry transient failures, never 4xx (not found / not authorized).
      retry: (count, err) => {
        if (err instanceof CatalogError && err.status >= 400 && err.status < 500 && err.status !== 429) return false;
        return count < 2;
      },
      retryDelay: (n, err) => (err instanceof CatalogError && err.retryAfter ? Math.min(err.retryAfter, 10) * 1000 : 800 * (n + 1)),
    },
    mutations: { retry: false },
  },
});
