import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  // One client per request: a module-level QueryClient leaks cached data between SSR requests.
  const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, gcTime: 10 * 60_000, refetchOnWindowFocus: true } } });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    // Lets Query own freshness; set caching defaults on the QueryClient, not the router.
    defaultPreloadStaleTime: 0,
  });

  return router;
};
