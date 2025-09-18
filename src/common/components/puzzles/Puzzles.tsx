import { Divider, Paper, Portal, ScrollArea, Stack } from "@mantine/core";
import { useNavigate } from "@tanstack/react-router";
import { useAtom } from "jotai";
import { useContext } from "react";
import { useStore } from "zustand";
import ChallengeHistory from "@/common/components/ChallengeHistory";
import GameNotation from "@/common/components/GameNotation";
import MoveControls from "@/common/components/MoveControls";
import { TreeStateContext } from "@/common/components/TreeStateContext";
import {
  hidePuzzleRatingAtom,
  inOrderPuzzlesAtom,
  jumpToNextPuzzleAtom,
  progressivePuzzlesAtom,
  puzzlePlayerRatingAtom,
} from "@/state/atoms";
import { positionFromFen } from "@/utils/chessops";
import { logger } from "@/utils/logger";
import { navigateToDatabasesWithModal } from "@/utils/navigation";
import { getAdaptivePuzzleRange, PUZZLE_DEBUG_LOGS } from "@/utils/puzzles";
import { PuzzleControls, PuzzleSettings, PuzzleStatistics } from "./components";
import { usePuzzleDatabase, usePuzzleSession } from "./hooks";
import PuzzleBoard from "./PuzzleBoard";

function Puzzles({ id }: { id: string }) {
  const navigate = useNavigate();
  const store = useContext(TreeStateContext);
  if (!store) throw new Error("TreeStateContext not found");
  const reset = useStore(store, (s) => s.reset);

  // Custom hooks for state management
  const {
    puzzleDbs,
    selectedDb,
    setSelectedDb,
    ratingRange,
    setRatingRange,
    dbRatingRange,
    minRating,
    maxRating,
    generatePuzzle: generatePuzzleFromDb,
    clearPuzzleCache,
  } = usePuzzleDatabase();

  const { puzzles, currentPuzzle, changeCompletion, addPuzzle, clearSession, selectPuzzle } = usePuzzleSession(id);

  // Local state
  const [progressive, setProgressive] = useAtom(progressivePuzzlesAtom);
  const [hideRating, setHideRating] = useAtom(hidePuzzleRatingAtom);
  const [inOrder, setInOrder] = useAtom(inOrderPuzzlesAtom);
  const [jumpToNext, setJumpToNext] = useAtom(jumpToNextPuzzleAtom);
  const [playerRating] = useAtom(puzzlePlayerRatingAtom);

  // Computed values
  const currentPuzzleData = puzzles?.[currentPuzzle];
  const turnToMove = currentPuzzleData ? (positionFromFen(currentPuzzleData?.fen)[0]?.turn ?? null) : null;

  // Event handlers
  const handleGeneratePuzzle = async () => {
    if (!selectedDb) return;

    let range = ratingRange;
    if (progressive && minRating !== maxRating) {
      range = calculateProgressiveRange();
    }

    PUZZLE_DEBUG_LOGS &&
      logger.debug("Generating puzzle:", {
        db: selectedDb,
        range,
        progressive,
        inOrder,
        playerRating,
      });

    try {
      const puzzle = await generatePuzzleFromDb(selectedDb, range, inOrder);
      PUZZLE_DEBUG_LOGS &&
        logger.debug("Generated puzzle:", {
          fen: puzzle.fen,
          rating: puzzle.rating,
          moves: puzzle.moves,
        });
      addPuzzle(puzzle);
    } catch (error) {
      logger.error("Failed to generate puzzle:", error);
    }
  };

  const calculateProgressiveRange = (): [number, number] => {
    const completedResults = puzzles
      .filter((puzzle) => puzzle.completion !== "incomplete")
      .map((puzzle) => puzzle.completion)
      .slice(-10);

    const range = getAdaptivePuzzleRange(playerRating, completedResults);

    // Clamp to database bounds
    let [min, max] = range;
    min = Math.max(minRating, Math.min(min, maxRating));
    max = Math.max(minRating, Math.min(max, maxRating));

    PUZZLE_DEBUG_LOGS &&
      logger.debug("Adaptive range calculation:", {
        playerRating,
        recentResults: completedResults,
        originalRange: range,
        clampedRange: [min, max],
        dbBounds: [minRating, maxRating],
      });

    setRatingRange([min, max]);
    return [min, max];
  };

  const handleClearSession = () => {
    PUZZLE_DEBUG_LOGS && logger.debug("Clearing puzzle session");
    clearSession();
    if (selectedDb) {
      clearPuzzleCache(selectedDb);
    }
    reset();
  };

  const handleDatabaseChange = (value: string | null) => {
    PUZZLE_DEBUG_LOGS && logger.debug("Database changed:", value);

    if (value === "add") {
      navigateToDatabasesWithModal(navigate, {
        tab: "puzzles",
        redirectTo: "/boards",
      });
    } else {
      setSelectedDb(value);
    }
  };

  return (
    <>
      <Portal target="#left" style={{ height: "100%" }}>
        <PuzzleBoard
          key={currentPuzzle}
          puzzles={puzzles}
          currentPuzzle={currentPuzzle}
          changeCompletion={changeCompletion}
          generatePuzzle={handleGeneratePuzzle}
          db={selectedDb}
          jumpToNext={jumpToNext}
        />
      </Portal>

      <Portal target="#topRight" style={{ height: "100%" }}>
        <Paper h="100%" withBorder p="md">
          <PuzzleSettings
            puzzleDbs={puzzleDbs}
            selectedDb={selectedDb}
            onDatabaseChange={handleDatabaseChange}
            ratingRange={ratingRange}
            onRatingRangeChange={setRatingRange}
            minRating={minRating}
            maxRating={maxRating}
            dbRatingRange={dbRatingRange}
            progressive={progressive}
            onProgressiveChange={setProgressive}
            hideRating={hideRating}
            onHideRatingChange={setHideRating}
            inOrder={inOrder}
            onInOrderChange={setInOrder}
          />
          <Divider my="sm" />

          <PuzzleControls
            selectedDb={selectedDb}
            onGeneratePuzzle={handleGeneratePuzzle}
            onClearSession={handleClearSession}
            changeCompletion={changeCompletion}
            currentPuzzle={currentPuzzleData}
            puzzles={puzzles}
            jumpToNext={jumpToNext}
            onJumpToNextChange={setJumpToNext}
            turnToMove={turnToMove}
          />
          <Divider my="sm" />

          <PuzzleStatistics currentPuzzle={currentPuzzleData} />
        </Paper>
      </Portal>

      <Portal target="#bottomRight" style={{ height: "100%" }}>
        <Stack h="100%" gap="xs">
          <Paper withBorder p="md" mih="5rem">
            <ScrollArea h="100%" offsetScrollbars>
              <ChallengeHistory
                challenges={puzzles.map((p) => ({
                  ...p,
                  label: p.rating.toString(),
                }))}
                current={currentPuzzle}
                select={selectPuzzle}
              />
            </ScrollArea>
          </Paper>
          <Stack flex={1} gap="xs">
            <GameNotation />
            <MoveControls readOnly />
          </Stack>
        </Stack>
      </Portal>
    </>
  );
}

export default Puzzles;
