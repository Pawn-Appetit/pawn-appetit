import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/learn/")({
  component: lazyRouteComponent(() => import("@/features/learn/LearnPage")),
});
