import { ActionIcon, Box, Collapse, Group, Paper, Stack, Text } from "@mantine/core";
import { useToggle } from "@mantine/hooks";
import { IconChevronDown, IconChevronUp } from "@tabler/icons-react";
import type { Piece } from "chessground/types";
import { memo, Suspense, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import GameNotation from "@/components/GameNotation";
import AnalysisPanel from "@/components/panels/analysis/AnalysisPanel";
import { ResponsiveLoadingWrapper } from "@/components/ResponsiveLoadingWrapper";
import { ResponsiveSkeleton } from "@/components/ResponsiveSkeleton";
import Board from "./Board";

interface MobileBoardLayoutProps {
  // Board props
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

  // Analysis props
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
  selectedPiece?: Piece | null;
  setSelectedPiece?: (piece: Piece | null) => void;

  // Start Game props
  startGame?: () => void;
  gameState?: "settingUp" | "playing" | "gameOver";
  startGameDisabled?: boolean;
}

function MobileBoardLayout({
  // Board props
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

  // Analysis props
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
  selectedPiece,
  setSelectedPiece,

  // Start Game props
  startGame,
  gameState,
  startGameDisabled,
}: MobileBoardLayoutProps) {
  const { t } = useTranslation();
  const [isInitializing, setIsInitializing] = useState(true);
  const [initializationError, setInitializationError] = useState<Error | null>(null);
  const [isCollapsed, toggleCollapsed] = useToggle([false, true]);

  // Mobile layout pattern is now passed as a prop from ResponsiveBoard

  // Handle initialization
  useEffect(() => {
    const initializeLayout = async () => {
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

    initializeLayout();
  }, []);

  // Error handling
  const handleRetry = useCallback(() => {
    setInitializationError(null);
    setIsInitializing(true);
    onRetry?.();
  }, [onRetry]);

  // Show loading state
  if (isLoading || isInitializing) {
    return (
      <ResponsiveLoadingWrapper isLoading={true}>
        <ResponsiveSkeleton type="board" />
      </ResponsiveLoadingWrapper>
    );
  }

  // Show error state
  if (error || initializationError) {
    return (
      <Stack align="center" gap="md">
        <div>Failed to load mobile board layout</div>
        <button type="button" onClick={handleRetry}>
          Retry
        </button>
      </Stack>
    );
  }
  return (
    <Stack h="100%" gap="xs" justify="space-between" align="stretch">
      <Paper withBorder p="xs">
        <Group justify="space-between" align="center">
          <Text fw={700}>{t("features.board.tabs.analysis")}</Text>
          <ActionIcon variant="subtle" onClick={() => toggleCollapsed()}>
            {isCollapsed ? <IconChevronDown size="1rem" /> : <IconChevronUp size="1rem" />}
          </ActionIcon>
        </Group>
        <Collapse in={!isCollapsed} transitionDuration={200} transitionTimingFunction="linear">
          <Box mt="xs">
            <Suspense fallback={<ResponsiveSkeleton type="default" />}>
              <AnalysisPanel />
            </Suspense>
          </Box>
        </Collapse>
      </Paper>

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
        selectedPiece={selectedPiece}
        setSelectedPiece={setSelectedPiece}
        // Start Game props
        startGame={startGame}
        gameState={gameState}
        startGameDisabled={startGameDisabled}
      />

      {editingMode && editingCard ? editingCard : <GameNotation topBar={topBar} />}
    </Stack>
  );
}

export default memo(MobileBoardLayout);
