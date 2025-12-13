import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/boards")({
  component: lazyRouteComponent(() => import("@/features/boards/BoardsPage")),
  loader: ({ context: { loadDirs } }) => loadDirs(),
});
