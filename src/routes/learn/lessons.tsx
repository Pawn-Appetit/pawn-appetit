import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/learn/lessons")({
  component: lazyRouteComponent(() => import("@/features/learn/LessonsPage")),
});
