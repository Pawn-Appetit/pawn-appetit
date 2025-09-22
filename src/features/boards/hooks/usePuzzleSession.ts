import { useSessionStorage } from "@mantine/hooks";
import { parseUci } from "chessops";
import { useAtom } from "jotai";
import { useContext } from "react";
import { useStore } from "zustand";
import { TreeStateContext } from "@/components/TreeStateContext";
import { currentPuzzleAtom, puzzlePlayerRatingAtom } from "@/state/atoms";
import { logger } from "@/utils/logger";
import type { Completion, Puzzle } from "@/utils/puzzles";
import { PUZZLE_DEBUG_LOGS, updateElo } from "@/utils/puzzles";

export const usePuzzleSession = (id: string) => {
  const store = useContext(TreeStateContext)!;
  const setFen = useStore(store, (s) => s.setFen);
  const makeMove = useStore(store, (s) => s.makeMove);

  const [puzzles, setPuzzles] = useSessionStorage<Puzzle[]>({
    key: `${id}-puzzles`,
    defaultValue: [],
  });
  const [currentPuzzle, setCurrentPuzzle] = useAtom(currentPuzzleAtom);
  const [playerRating, setPlayerRating] = useAtom(puzzlePlayerRatingAtom);

  const setPuzzle = (puzzle: { fen: string; moves: string[] }) => {
    setFen(puzzle.fen);
    if (puzzle.moves.length % 2 === 0) {
      PUZZLE_DEBUG_LOGS && logger.debug("Setting puzzle. Puzzle has even moves. Player must play second");
      makeMove({ payload: parseUci(puzzle.moves[0])! });
    }
  };

  const changeCompletion = (completion: Completion) => {
    setPuzzles((puzzles) => {
      const puzzle = puzzles[currentPuzzle];
      puzzle.completion = completion;

      // Update player rating using Elo system
      if (puzzle.rating) {
        const oldRating = playerRating;
        const newRating = updateElo(playerRating, puzzle.rating, completion === "correct");
        PUZZLE_DEBUG_LOGS &&
          logger.debug("Rating update:", {
            completion,
            puzzleRating: puzzle.rating,
            oldPlayerRating: Math.round(oldRating),
            newPlayerRating: Math.round(newRating),
            change: Math.round(newRating - oldRating),
          });
        setPlayerRating(newRating);
      }

      return [...puzzles];
    });
  };

  const addPuzzle = (puzzle: Puzzle) => {
    PUZZLE_DEBUG_LOGS &&
      logger.debug("Adding puzzle to session:", {
        fen: puzzle.fen,
        rating: puzzle.rating,
        moves: puzzle.moves.length,
        sessionSize: puzzles.length + 1,
      });
    setPuzzles((puzzles) => {
      return [...puzzles, puzzle];
    });
    setCurrentPuzzle(puzzles.length);
    setPuzzle(puzzle);
  };

  const clearSession = () => {
    PUZZLE_DEBUG_LOGS && logger.debug("Clearing puzzle session");
    setPuzzles([]);
  };

  const selectPuzzle = (index: number) => {
    PUZZLE_DEBUG_LOGS && logger.debug("Selecting puzzle:", { index, totalPuzzles: puzzles.length });
    setCurrentPuzzle(index);
    setPuzzle(puzzles[index]);
  };

  return {
    puzzles,
    currentPuzzle,
    setCurrentPuzzle,
    setPuzzle,
    changeCompletion,
    addPuzzle,
    clearSession,
    selectPuzzle,
  };
};
