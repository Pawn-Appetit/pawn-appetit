import { createFileRoute, redirect } from "@tanstack/react-router";
import { getDefaultStore } from "jotai";
import DashboardPage from "@/features/dashboard/DashboardPage";
import { showDashboardOnStartupAtom } from "@/state/atoms";

export const Route = createFileRoute("/")({
  component: DashboardPage,
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
