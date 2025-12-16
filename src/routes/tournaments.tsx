import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/tournaments")({
  component: lazyRouteComponent(() => import("@/features/tournaments/TournamentsPage")),
});

