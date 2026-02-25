import { createFileRoute } from "@tanstack/react-router";
import PracticePage from "@/features/train/PracticePage";

export const Route = createFileRoute("/train/practice")({
  component: PracticePage,
});
