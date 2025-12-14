import { createFileRoute, lazyRouteComponent, redirect } from "@tanstack/react-router";
import { getDefaultStore } from "jotai";
import { hideDashboardOnStartupAtom } from "@/state/atoms";

export const Route = createFileRoute("/")({
  component: lazyRouteComponent(() => import("@/features/dashboard/DashboardPage")),
  loader: ({ context: { loadDirs } }) => loadDirs(),
  beforeLoad: () => {
    const store = getDefaultStore();
    const hide = store.get(hideDashboardOnStartupAtom);
    if (hide) {
      throw redirect({ to: "/boards" });
    }
    return null;
  },
});
