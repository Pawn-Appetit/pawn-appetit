import { Paper } from "@mantine/core";
import { Chessground } from "@/components/Chessground";
import { TreeStateProvider } from "@/components/TreeStateContext";
import { calculateValidMoves } from "@/utils/chess-engine";
import { positionFromFen } from "@/utils/chessops";

interface LessonBoardProps {
  fen: string;
  onMove?: (orig: string, dest: string) => void;
  readOnly?: boolean;
}

export function LessonBoard({ fen, onMove, readOnly = false }: LessonBoardProps) {
  const [pos] = positionFromFen(fen);
  const turn = pos?.turn || "white";

  const dests = calculateValidMoves(fen);

  return (
    <Paper p="md" withBorder>
      <Chessground
        fen={fen}
        orientation="white"
        turnColor={turn}
        movable={{
          free: !readOnly,
          color: !readOnly ? turn : undefined,
          showDests: true,
          dests,
          events: {
            after: onMove,
          },
        }}
        animation={{ enabled: true }}
        coordinates={true}
      />
    </Paper>
  );
}

export default function LessonBoardWithProvider(props: LessonBoardProps) {
  return (
    <TreeStateProvider>
      <LessonBoard {...props} />
    </TreeStateProvider>
  );
}
