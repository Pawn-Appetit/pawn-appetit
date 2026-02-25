import { createFileRoute } from "@tanstack/react-router";
import TrainPage from "@/features/train/TrainPage";

export const Route = createFileRoute("/train/")({
  component: TrainPage,
});
