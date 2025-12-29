import { Divider, Paper, Portal, ScrollArea, Stack } from "@mantine/core";
import { useNavigate } from "@tanstack/react-router";
import { useAtom } from "jotai";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";
import ChallengeHistory from "@/components/ChallengeHistory";
import GameNotation from "@/components/GameNotation";
import MoveControls from "@/components/MoveControls";
import { TreeStateContext } from "@/components/TreeStateContext";
import { usePuzzleDatabase, usePuzzleSession } from "@/features/boards/hooks";
import {
  hidePuzzleRatingAtom,
  inOrderPuzzlesAtom,
  jumpToNextPuzzleAtom,
  progressivePuzzlesAtom,
  puzzlePlayerRatingAtom,
} from "@/state/atoms";
import { commands } from "@/bindings";
import { positionFromFen } from "@/utils/chessops";
import { logger } from "@/utils/logger";
import { navigateToDatabasesWithModal } from "@/utils/navigation";
import { getAdaptivePuzzleRange, PUZZLE_DEBUG_LOGS } from "@/utils/puzzles";
import { unwrap } from "@/utils/unwrap";
import PuzzleBoard from "./PuzzleBoard";
import { PuzzleControls } from "./PuzzleControls";
import { PuzzleSettings } from "./PuzzleSettings";
import { PuzzleStatistics } from "./PuzzleStatistics";

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

  const [showingSolution, setShowingSolution] = useState(false);
  const isShowingSolutionRef = useRef<boolean>(false);

  // Filter states
  const [hasThemes, setHasThemes] = useState(false);
  const [hasOpeningTags, setHasOpeningTags] = useState(false);
  const [themes, setThemes] = useState<string[]>([]);
  const [openingTags, setOpeningTags] = useState<string[]>([]);
  const [themesOptions, setThemesOptions] = useState<Array<{ group: string; items: Array<{ value: string; label: string }> }>>([]);
  const [openingTagsOptions, setOpeningTagsOptions] = useState<Array<{ value: string; label: string }>>([]);

  const updateShowingSolution = (isShowing: boolean) => {
    setShowingSolution(isShowing);
    isShowingSolutionRef.current = isShowing;
  };

  // Computed values
  const currentPuzzleData = puzzles?.[currentPuzzle];
  const turnToMove = useMemo(() => {
    if (!currentPuzzleData?.fen) return null;
    return positionFromFen(currentPuzzleData.fen)[0]?.turn ?? null;
  }, [currentPuzzleData?.fen]);

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
      const puzzle = await generatePuzzleFromDb(
        selectedDb,
        range,
        inOrder,
        themes.length > 0 ? themes : undefined,
        openingTags.length > 0 ? openingTags : undefined,
      );
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

  const handleSelectPuzzle = (index: number) => {
    updateShowingSolution(false);
    selectPuzzle(index);
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
      // Reset filters when database changes
      setThemes([]);
      setOpeningTags([]);
    }
  };

  // Load database column info and distinct values when database changes
  useEffect(() => {
    if (!selectedDb || !selectedDb.endsWith(".db3")) {
      setHasThemes(false);
      setHasOpeningTags(false);
      setThemesOptions([]);
      setOpeningTagsOptions([]);
      return;
    }

    // Use a flag to prevent multiple simultaneous loads
    let cancelled = false;

    const loadDatabaseInfo = async () => {
      try {
        PUZZLE_DEBUG_LOGS && logger.debug("Loading database info for:", selectedDb);
        
        // First verify the file exists before attempting to load info
        const { exists } = await import("@tauri-apps/plugin-fs");
        const { appDataDir, resolve } = await import("@tauri-apps/api/path");
        const appDataDirPath = await appDataDir();
        const dbPath = await resolve(appDataDirPath, "puzzles", selectedDb);
        
        const fileExists = await exists(dbPath);
        if (!fileExists) {
          PUZZLE_DEBUG_LOGS && logger.debug("Database file does not exist yet:", dbPath);
          setHasThemes(false);
          setHasOpeningTags(false);
          setThemesOptions([]);
          setOpeningTagsOptions([]);
          return;
        }
        
        // Load column check and themes/opening_tags in parallel for better performance
        const [columnsResult, themesResult, tagsResult] = await Promise.all([
          commands.checkPuzzleDbColumns(selectedDb).catch((err) => {
            // Silently handle "file not found" or "file is empty" errors
            const errorMsg = err instanceof Error ? err.message : String(err);
            if (errorMsg.includes("does not exist") || errorMsg.includes("is empty")) {
              return { status: "error" as const, error: errorMsg };
            }
            throw err;
          }),
          // Start loading themes immediately (will be filtered by column check)
          commands.getPuzzleThemes(selectedDb).catch((err) => {
            const errorMsg = err instanceof Error ? err.message : String(err);
            if (errorMsg.includes("does not exist") || errorMsg.includes("is empty")) {
              return { status: "error" as const, error: errorMsg };
            }
            return { status: "error" as const, error: "" };
          }),
          // Start loading opening_tags immediately
          commands.getPuzzleOpeningTags(selectedDb).catch((err) => {
            const errorMsg = err instanceof Error ? err.message : String(err);
            if (errorMsg.includes("does not exist") || errorMsg.includes("is empty")) {
              return { status: "error" as const, error: errorMsg };
            }
            return { status: "error" as const, error: "" };
          }),
        ]);

        if (cancelled) return;

        PUZZLE_DEBUG_LOGS && logger.debug("Columns result:", columnsResult);
        if (columnsResult.status === "ok") {
          const [hasThemesCol, hasOpeningTagsCol] = columnsResult.data;
          PUZZLE_DEBUG_LOGS && logger.debug("Has themes:", hasThemesCol, "Has opening tags:", hasOpeningTagsCol);
          setHasThemes(hasThemesCol);
          setHasOpeningTags(hasOpeningTagsCol);

          // Use the pre-loaded results
          if (hasThemesCol && themesResult.status === "ok") {
            PUZZLE_DEBUG_LOGS && logger.debug("Themes groups count:", themesResult.data.length);
            // Backend returns ThemeGroup[] with group and items, convert to format for MultiSelect
            const themesData = themesResult.data as unknown as Array<{ group: string; items: Array<{ value: string; label: string }> }>;
            setThemesOptions(themesData.map(group => ({
              group: group.group,
              items: group.items.map(opt => ({
                value: opt.value,
                label: opt.label,
              })),
            })));
          } else {
            setThemesOptions([]);
          }

          if (hasOpeningTagsCol && tagsResult.status === "ok") {
            PUZZLE_DEBUG_LOGS && logger.debug("Opening tags options count:", tagsResult.data.length);
            // Backend returns OpeningTagOption[] with value and label, convert to format for MultiSelect
            const tagsData = tagsResult.data as unknown as Array<{ value: string; label: string }>;
            setOpeningTagsOptions(tagsData.map(opt => ({
              value: opt.value,
              label: opt.label,
            })));
          } else {
            setOpeningTagsOptions([]);
          }
        } else {
          // Database doesn't exist or is empty - silently handle this
          PUZZLE_DEBUG_LOGS && logger.debug("Columns check failed (database may not be installed):", columnsResult.error);
          setHasThemes(false);
          setHasOpeningTags(false);
          setThemesOptions([]);
          setOpeningTagsOptions([]);
        }
      } catch (error) {
        if (!cancelled) {
          // Only log non-expected errors (file not found/empty are expected if DB not installed)
          const errorMsg = error instanceof Error ? error.message : String(error);
          if (!errorMsg.includes("does not exist") && !errorMsg.includes("is empty")) {
            logger.error("Failed to load database column info:", error);
          }
          setHasThemes(false);
          setHasOpeningTags(false);
          setThemesOptions([]);
          setOpeningTagsOptions([]);
        }
      }
    };

    loadDatabaseInfo();

    return () => {
      cancelled = true;
    };
  }, [selectedDb]);

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
            hasThemes={hasThemes}
            themes={themes}
            themesOptions={themesOptions}
            onThemesChange={setThemes}
            hasOpeningTags={hasOpeningTags}
            openingTags={openingTags}
            openingTagsOptions={openingTagsOptions}
            onOpeningTagsChange={setOpeningTags}
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
            showingSolution={showingSolution}
            updateShowingSolution={updateShowingSolution}
            isShowingSolutionRef={isShowingSolutionRef}
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
                select={handleSelectPuzzle}
              />
            </ScrollArea>
          </Paper>
          <Stack flex={1} gap="xs">
            <GameNotation initialVariationState="variations" />
            <MoveControls readOnly />
          </Stack>
        </Stack>
      </Portal>
    </>
  );
}

export default Puzzles;
