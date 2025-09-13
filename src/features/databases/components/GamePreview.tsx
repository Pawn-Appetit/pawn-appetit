import { Box, Group, Stack } from "@mantine/core";
import { useElementSize } from "@mantine/hooks";
import { useContext } from "react";
import useSWRImmutable from "swr/immutable";
import { useStore } from "zustand";
import { Chessground } from "@/common/components/Chessground";
import GameNotation from "@/common/components/GameNotation";
import MoveControls from "@/common/components/MoveControls";
import OpeningName from "@/common/components/OpeningName";
import { TreeStateContext, TreeStateProvider } from "@/common/components/TreeStateContext";
import { useResponsiveLayout } from "@/common/hooks/useResponsiveLayout";
import { parsePGN } from "@/utils/chess";
import { type GameHeaders, getNodeAtPath, type TreeState } from "@/utils/treeReducer";

function GamePreviewWrapper({
  pgn,
  headers,
  hideControls,
  showOpening,
}: {
  pgn: string;
  headers?: GameHeaders;
  hideControls?: boolean;
  showOpening?: boolean;
}) {
  const { data: parsedGame } = useSWRImmutable([pgn, headers?.fen], async ([pgn, fen]) => {
    return await parsePGN(pgn, fen);
  });

  return (
    <>
      {parsedGame && <GamePreview key={pgn} game={parsedGame} hideControls={hideControls} showOpening={showOpening} />}
    </>
  );
}

function GamePreview({
  game,
  hideControls,
  showOpening,
}: {
  game: TreeState;
  hideControls?: boolean;
  showOpening?: boolean;
}) {
  const { ref: boardRef, height } = useElementSize();
  const { layout } = useResponsiveLayout();

  // Calculate board dimensions based on layout flags
  const boardStyle = {
    width: layout.gameNotationUnderBoard ? "100%" : "400px",
    minWidth: "200px",
    maxWidth: "600px",
    aspectRatio: layout.chessBoard.maintainAspectRatio ? "1:1" : undefined,
    touchAction: layout.chessBoard.touchOptimized ? "manipulation" : "auto",
  };

  return (
    <TreeStateProvider initial={game}>
      {showOpening && <OpeningName />}
      {!layout.gameNotationUnderBoard ? (
        <Group align="start" grow style={{ overflow: "hidden", height: "100%" }}>
          <Stack ref={boardRef} style={boardStyle} gap="xs">
            <PreviewBoard />
            <MoveControls readOnly />
          </Stack>
          {!hideControls && (
            <Stack style={{ height }} gap="xs">
              <GameNotation />
            </Stack>
          )}
        </Group>
      ) : (
        <Stack style={{ overflow: "hidden", height: "100%" }}>
          <Stack ref={boardRef} style={boardStyle} gap="xs">
            <PreviewBoard />
            <MoveControls readOnly />
          </Stack>
          {!hideControls && (
            <Stack gap="xs">
              <GameNotation />
            </Stack>
          )}
        </Stack>
      )}
    </TreeStateProvider>
  );
}

function PreviewBoardContent({ store }: { store: any }) {
  const { layout } = useResponsiveLayout();

  const goToNext = useStore(store, (s: any) => s.goToNext);
  const goToPrevious = useStore(store, (s: any) => s.goToPrevious);
  const root = useStore(store, (s: any) => s.root);
  const position = useStore(store, (s: any) => s.position);
  const headers = useStore(store, (s: any) => s.headers);

  if (!root) return null;

  const node = getNodeAtPath(root, position);
  const fen = node.fen;

  // Enhanced touch interaction for mobile
  const handleWheel = (e: React.WheelEvent) => {
    if (e.deltaY > 0) {
      goToNext();
    } else {
      goToPrevious();
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (layout.chessBoard.touchOptimized) {
      // Prevent default touch behavior for better chess piece interaction
      e.preventDefault();
    }
  };

  return (
    <Box
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      style={{
        touchAction: layout.chessBoard.touchOptimized ? "manipulation" : "auto",
        userSelect: "none", // Prevent text selection on touch devices
      }}
    >
      <Chessground
        coordinates={false}
        viewOnly={true}
        fen={fen}
        orientation={headers.orientation || "white"}
        // Enhanced touch interaction for mobile
        selectable={{
          enabled: layout.chessBoard.touchOptimized,
        }}
      />
    </Box>
  );
}

function PreviewBoard() {
  const store = useContext(TreeStateContext);

  if (!store) return null;

  return <PreviewBoardContent store={store} />;
}

export default GamePreviewWrapper;
