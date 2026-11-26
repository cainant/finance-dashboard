import { createFileRoute } from "@tanstack/react-router";

import { MoreScreen } from "@/components/more/more-screen";

export const Route = createFileRoute("/_app/more")({
  staticData: { title: "Mais" },
  component: MoreScreen,
});
