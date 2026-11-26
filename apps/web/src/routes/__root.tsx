import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";

import { RouteErrorState, RouteNotFoundState } from "@/components/layout/route-states";
import type { RouterContext } from "@/lib/router-context";

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  errorComponent: ({ error, reset }) => <RouteErrorState error={error} reset={reset} standalone />,
  notFoundComponent: () => <RouteNotFoundState standalone />,
});

function RootLayout() {
  return <Outlet />;
}
