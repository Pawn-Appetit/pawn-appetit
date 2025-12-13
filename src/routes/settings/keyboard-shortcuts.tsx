import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/settings/keyboard-shortcuts")({
  component: lazyRouteComponent(() => import("@/features/settings/KeyboardShortcutsPage")),
});
