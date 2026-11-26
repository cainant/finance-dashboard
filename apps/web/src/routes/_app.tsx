import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/layout/app-shell";
import { RouteErrorState, RouteNotFoundState } from "@/components/layout/route-states";
import { requireSession } from "@/lib/auth";
import { periodSearchSchema } from "@/lib/period";

export const Route = createFileRoute("/_app")({
  validateSearch: (search) => periodSearchSchema.parse(search),
  beforeLoad: async ({ context, location }) => requireSession({ context, location }),
  component: AppShell,
  errorComponent: ({ error, reset }) => <RouteErrorState error={error} reset={reset} />,
  notFoundComponent: () => <RouteNotFoundState />,
});
