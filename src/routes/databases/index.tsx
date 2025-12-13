import { createFileRoute, lazyRouteComponent, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { activeDatabaseViewStore } from "@/state/store/database";

const searchSchema = z.object({
  value: z.enum(["add"]).optional(),
  tab: z.enum(["puzzles", "games"]).optional(),
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/databases/")({
  component: lazyRouteComponent(() => import("@/features/databases/DatabasesPage")),
  validateSearch: searchSchema,
  beforeLoad: async ({ search }) => {
    const { database } = activeDatabaseViewStore.getState();
    // Don't redirect if there's a tab parameter (puzzles or games)
    // This allows direct navigation to the puzzles tab
    if (database && !search.value && !search.tab) {
      throw redirect({
        to: "/databases/$databaseId",
        params: { databaseId: database.title },
      });
    }
    return null;
  },
});
