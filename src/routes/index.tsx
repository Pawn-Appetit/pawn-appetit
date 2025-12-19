import { createFileRoute, lazyRouteComponent, redirect } from "@tanstack/react-router";
import { getDefaultStore } from "jotai";
import { showDashboardOnStartupAtom } from "@/state/atoms";

export const Route = createFileRoute("/")({
  component: lazyRouteComponent(() => import("@/features/dashboard/DashboardPage")),
  loader: ({ context: { loadDirs } }) => loadDirs(),
  beforeLoad: () => {
    const store = getDefaultStore();
    const show = store.get(showDashboardOnStartupAtom);
    if (!show) {
      throw redirect({ to: "/boards" });
    }
    return null;
  },
});
