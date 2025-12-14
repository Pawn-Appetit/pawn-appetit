import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/accounts")({
  component: lazyRouteComponent(() => import("@/features/accounts/AccountsPage")),
});
