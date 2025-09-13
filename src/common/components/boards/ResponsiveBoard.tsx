import { Box, Stack, Group, ActionIcon, Tooltip } from "@mantine/core";
import { useElementSize } from "@mantine/hooks";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { IconChess, IconChessKnight, IconChessQueen, IconChessRook } from "@tabler/icons-react";
import { useResponsiveLayout } from "@/common/hooks/useResponsiveLayout";
import { ResponsiveLoadingWrapper } from "@/common/components/ResponsiveLoadingWrapper";
import { ResponsiveSkeleton } from "@/common/components/ResponsiveSkeleton";
import Board from "./Board";
import MobileBoardLayout from "./MobileBoardLayout";

interface ResponsiveBoardProps {
  dirty: boolean;
  editingMode: boolean;
  toggleEditingMode: () => void;
  viewOnly?: boolean;
  disableVariations?: boolean;
  movable?: "both" | "white" | "black" | "turn" | "none";
  boardRef: React.MutableRefObject<HTMLDivElement | null>;
  saveFile?: () => void;
  reload?: () => void;
  addGame?: () => void;
  canTakeBack?: boolean;
  whiteTime?: number;
  blackTime?: number;
  practicing?: boolean;
  // Analysis props for mobile layout
  topBar?: boolean;
  editingCard?: React.ReactNode;
  isLoading?: boolean;
  error?: Error | null;
  onRetry?: () => void;
  // Board controls props
  viewPawnStructure?: boolean;
  setViewPawnStructure?: (value: boolean) => void;
  takeSnapshot?: () => void;
  deleteMove?: () => void;
  changeTabType?: () => void;
  currentTabType?: "analysis" | "play";
  eraseDrawablesOnClick?: boolean;
  clearShapes?: () => void;
  toggleOrientation?: () => void;
  currentTabSourceType?: string;
}

function ResponsiveBoard({
  dirty,
  editingMode,
  toggleEditingMode,
  viewOnly,
  disableVariations,
  movable = "turn",
  boardRef,
  saveFile,
  reload,
  addGame,
  canTakeBack,
  whiteTime,
  blackTime,
  practicing,
  // Analysis props for mobile layout
  topBar = false,
  editingCard,
  isLoading = false,
  error = null,
  onRetry,
  // Board controls props
  viewPawnStructure,
  setViewPawnStructure,
  takeSnapshot,
  deleteMove,
  changeTabType,
  currentTabType,
  eraseDrawablesOnClick,
  clearShapes,
  toggleOrientation,
  currentTabSourceType,
}: ResponsiveBoardProps) {
  const { layout } = useResponsiveLayout();
  const { ref: containerRef } = useElementSize();
  const [isInitializing, setIsInitializing] = useState(true);
  const [initializationError, setInitializationError] = useState<Error | null>(null);

  // Get responsive layout properties
  const boardDimensions = useMemo(
    () => ({
      isMobileLayout: layout.chessBoard.layoutType === "mobile",
      maintainAspectRatio: layout.chessBoard.maintainAspectRatio,
    }),
    [layout.chessBoard.layoutType, layout.chessBoard.maintainAspectRatio],
  );

  // Handle board initialization
  useEffect(() => {
    const initializeBoard = async () => {
      try {
        setIsInitializing(true);
        setInitializationError(null);

        // Simulate initialization time for smooth UX
        await new Promise((resolve) => setTimeout(resolve, 50));

        setIsInitializing(false);
      } catch (error) {
        setInitializationError(error as Error);
        setIsInitializing(false);
      }
    };

    initializeBoard();
  }, []);

  // Error handling for board initialization
  const handleRetry = useCallback(() => {
    setInitializationError(null);
    setIsInitializing(true);
  }, []);

  // Board container styles - let the Board component handle its own sizing
  const boardContainerStyle = useMemo(
    () => ({
      width: "100%",
      height: "100%",
      display: "flex",
      flexDirection: "column" as const,
      touchAction: boardDimensions.isMobileLayout ? "manipulation" : "auto",
      userSelect: "none" as const,
    }),
    [boardDimensions.isMobileLayout],
  );

  // Loading state
  if (isInitializing) {
    return (
      <Box
        ref={containerRef}
        style={{ width: "100%", height: "100%", display: "flex", justifyContent: "center", alignItems: "center" }}
      >
        <ResponsiveLoadingWrapper isLoading={true}>
          <ResponsiveSkeleton type="board" />
        </ResponsiveLoadingWrapper>
      </Box>
    );
  }

  // Error state
  if (initializationError) {
    return (
      <Box
        ref={containerRef}
        style={{ width: "100%", height: "100%", display: "flex", justifyContent: "center", alignItems: "center" }}
      >
        <Stack align="center" gap="md">
          <div>Failed to initialize chess board</div>
          <button type="button" onClick={handleRetry}>
            Retry
          </button>
        </Stack>
      </Box>
    );
  }

  // Use mobile layout patterns when layout type is mobile
  if (boardDimensions.isMobileLayout) {
    return (
      <Box
        ref={containerRef}
        style={{ width: "100%", height: "100%", overflow: "hidden", display: "flex", flexDirection: "column" }}
      >
        <ResponsiveLoadingWrapper isLoading={false}>
          <Stack h="100%" gap="xs">
            <Box flex={1}>
              <MobileBoardLayout
                dirty={dirty}
                editingMode={editingMode}
                toggleEditingMode={toggleEditingMode}
                viewOnly={viewOnly}
                disableVariations={disableVariations}
                movable={movable}
                boardRef={boardRef}
                saveFile={saveFile}
                reload={reload}
                addGame={addGame}
                canTakeBack={canTakeBack}
                whiteTime={whiteTime}
                blackTime={blackTime}
                practicing={practicing}
                topBar={topBar}
                editingCard={editingCard}
                isLoading={isLoading}
                error={error}
                onRetry={onRetry}
              />
            </Box>
          </Stack>
        </ResponsiveLoadingWrapper>
      </Box>
    );
  }

  // Desktop layout - use original Board component
  return (
    <Box
      ref={containerRef}
      style={{ width: "100%", height: "100%", display: "flex", justifyContent: "center", alignItems: "center" }}
    >
      <ResponsiveLoadingWrapper isLoading={false}>
        <Box style={boardContainerStyle}>
          <Board
            dirty={dirty}
            editingMode={editingMode}
            toggleEditingMode={toggleEditingMode}
            viewOnly={viewOnly}
            disableVariations={disableVariations}
            movable={movable}
            boardRef={boardRef}
            saveFile={saveFile}
            reload={reload}
            addGame={addGame}
            canTakeBack={canTakeBack}
            whiteTime={whiteTime}
            blackTime={blackTime}
            practicing={practicing}
            // Board controls props
            viewPawnStructure={viewPawnStructure}
            setViewPawnStructure={setViewPawnStructure}
            takeSnapshot={takeSnapshot}
            deleteMove={deleteMove}
            changeTabType={changeTabType}
            currentTabType={currentTabType}
            eraseDrawablesOnClick={eraseDrawablesOnClick}
            clearShapes={clearShapes}
            toggleOrientation={toggleOrientation}
            currentTabSourceType={currentTabSourceType}
          />
        </Box>
      </ResponsiveLoadingWrapper>
    </Box>
  );
}

export default memo(ResponsiveBoard);
