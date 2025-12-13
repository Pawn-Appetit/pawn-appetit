import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/learn/practice")({
  component: lazyRouteComponent(() => import("@/features/learn/PracticePage")),
});
