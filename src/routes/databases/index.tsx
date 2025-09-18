import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import DatabasesPage from "@/features/databases/DatabasesPage";
import { activeDatabaseViewStore } from "@/state/store/database";

const searchSchema = z.object({
  value: z.enum(["add"]).optional(),
  tab: z.enum(["puzzles", "games"]).optional(),
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/databases/")({
  component: DatabasesPage,
  validateSearch: searchSchema,
  beforeLoad: async ({ search }) => {
    const { database } = activeDatabaseViewStore.getState();
    if (database && !search.value) {
      throw redirect({
        to: "/databases/$databaseId",
        params: { databaseId: database.title },
      });
    }
    return null;
  },
});
