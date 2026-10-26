import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    // Cross-fades between routes via the native View Transitions API instead
    // of an abrupt DOM swap — no extra JS, and browsers without support
    // (Firefox <129, Safari <18) just fall back to the old instant swap.
    defaultViewTransition: true,
  });

  return router;
};
