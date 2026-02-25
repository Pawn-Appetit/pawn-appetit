import { Box } from "@mantine/core";
import PracticeBoardWithProvider from "./practice/PracticeBoard";

interface PracticeExercise {
  id: string;
  stepsCount?: number;
}

interface PracticeBoardProps {
  selectedExercise: PracticeExercise | null;
  currentFen: string;
  resetCounter: number;
  onMove: (orig: string, dest: string) => void;
}

export function PracticeBoard({
  selectedExercise,
  currentFen,
  resetCounter,
  onMove,
}: PracticeBoardProps) {
  return (
    <Box>
      <PracticeBoardWithProvider
        key={`${selectedExercise?.id}-${resetCounter}`}
        fen={selectedExercise ? currentFen : "8/8/8/8/8/8/8/8 w - - 0 1"}
        orientation="white"
        engineColor="black"
        onMove={(move) => console.log("Move made:", move)}
        onPositionChange={(fen) => console.log("Position changed:", fen)}
        onChessMove={onMove}
      />
    </Box>
  );
}
