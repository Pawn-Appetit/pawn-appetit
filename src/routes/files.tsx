import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/files")({
  component: lazyRouteComponent(() => import("@/features/files/FilesPage")),
  loader: ({ context: { loadDirs } }) => loadDirs(),
});
