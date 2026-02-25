import { useCallback, useState } from "react";
import { evaluateCheckmateMoves, type MoveEvaluation } from "@/utils/checkmateDetection";

interface ExerciseBase {
  id: string;
  title: string | { default: string };
  description: string | { default: string };
  fen?: string;
  stepsCount?: number;
}

interface CategoryBase {
  id: string;
  exercises: readonly ExerciseBase[];
}

interface UseExerciseStateOptions {
  initialFen?: string;
  onExerciseComplete?: (categoryId: string, exerciseId: string, evaluation: MoveEvaluation) => void;
  completeOnCorrectMove?: boolean;
}

/**
 * Gets the active player from a FEN string
 * @param fen The FEN string
 * @returns "white" or "black" for the active player
 */
function getActivePlayerFromFen(fen: string): "white" | "black" {
  const fenParts = fen.split(" ");
  const turn = fenParts[1];
  return turn === "w" ? "white" : "black";
}

/**
 * Determines if the current player made the move based on FEN before the move
 * @param startingFen The FEN before any moves
 * @param moveIndex The index of the move (0-based)
 * @returns true if the active player made this move
 */
function isActivePlayerMove(startingFen: string, moveIndex: number): boolean {
  const initialActivePlayer = getActivePlayerFromFen(startingFen);
  const isEvenIndex = moveIndex % 2 === 0;

  if (initialActivePlayer === "white") {
    return isEvenIndex;
  } else {
    return !isEvenIndex;
  }
}

export function useExerciseState<T extends ExerciseBase, C extends CategoryBase>(
  options: UseExerciseStateOptions = {},
) {
  const {
    initialFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    onExerciseComplete,
    completeOnCorrectMove = true,
  } = options;

  const [selectedCategory, setSelectedCategory] = useState<C | null>(null);
  const [selectedExercise, setSelectedExercise] = useState<T | null>(null);
  const [currentFen, setCurrentFen] = useState<string>(initialFen);
  const [message, setMessage] = useState<string>("");
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [playerMoveHistory, setPlayerMoveHistory] = useState<string[]>([]);
  const [startingFen, setStartingFen] = useState<string>(initialFen);
  const [resetCounter, setResetCounter] = useState<number>(0);

  const resetState = useCallback(() => {
    setMessage("");
    setMoveHistory([]);
    setPlayerMoveHistory([]);
  }, []);

  const handleCategorySelect = useCallback(
    (category: C | null) => {
      setSelectedCategory(category);
      setSelectedExercise(null);
      const newFen = category?.exercises[0]?.fen || initialFen;
      setCurrentFen(newFen);
      setStartingFen(newFen);
      resetState();
    },
    [initialFen, resetState],
  );

  const handleExerciseSelect = useCallback(
    (exercise: T) => {
      setSelectedExercise(exercise);
      const newFen = exercise?.fen || initialFen;
      setCurrentFen(newFen);
      setStartingFen(newFen);
      resetState();
    },
    [initialFen, resetState],
  );

  const handleMove = useCallback(
    (orig: string, dest: string, correctMoves: readonly string[], onCorrectMove?: () => void) => {
      if (!selectedExercise || !selectedCategory) return;

      const move = `${orig}${dest}`;
      const newMoveHistory = [...moveHistory, move];
      setMoveHistory(newMoveHistory);

      const isPlayerMove = isActivePlayerMove(startingFen, newMoveHistory.length - 1);

      let newPlayerMoveHistory = playerMoveHistory;
      if (isPlayerMove) {
        newPlayerMoveHistory = [...playerMoveHistory, move];
        setPlayerMoveHistory(newPlayerMoveHistory);
      }

      if (selectedExercise.stepsCount) {
        const evaluation = evaluateCheckmateMoves(startingFen, newMoveHistory, selectedExercise.stepsCount);
        setMessage(evaluation.message);

        if (evaluation.type !== "incorrect" && evaluation.isCheckmate) {
          if (onCorrectMove) {
            onCorrectMove();
          }

          if (completeOnCorrectMove && onExerciseComplete) {
            const playerMoveCount = newPlayerMoveHistory.length;
            const adjustedEvaluation: MoveEvaluation = {
              ...evaluation,
              moveCount: playerMoveCount,
              message: evaluation.message.replace(/\d+/g, playerMoveCount.toString()),
            };
            onExerciseComplete(selectedCategory.id, selectedExercise.id, adjustedEvaluation);
          }
        }
      } else {
        if (isPlayerMove) {
          const isCorrect = correctMoves.includes(move);

          if (isCorrect) {
            setMessage("Correct!");

            if (onCorrectMove) {
              onCorrectMove();
            }

            if (completeOnCorrectMove && onExerciseComplete) {
              const evaluation: MoveEvaluation = {
                type: "optimal",
                moveCount: newPlayerMoveHistory.length,
                isCheckmate: false,
                message: "Correct!",
              };
              onExerciseComplete(selectedCategory.id, selectedExercise.id, evaluation);
            }
          } else {
            setMessage("That's not the best move. Try again!");
          }
        }
      }
    },
    [
      selectedCategory,
      selectedExercise,
      onExerciseComplete,
      completeOnCorrectMove,
      moveHistory,
      playerMoveHistory,
      startingFen,
    ],
  );

  const resetExercise = useCallback(() => {
    if (startingFen) {
      setCurrentFen(startingFen);
    }
    setResetCounter((prev) => prev + 1);
    resetState();
  }, [startingFen, resetState]);

  const updateExerciseFen = useCallback((fen: string | undefined) => {
    if (fen) {
      setCurrentFen(fen);
      setStartingFen(fen);
    }
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedCategory(null);
    setSelectedExercise(null);
    setCurrentFen(initialFen);
    setStartingFen(initialFen);
    resetState();
  }, [initialFen, resetState]);

  return {
    selectedCategory,
    selectedExercise,
    currentFen,
    message,
    moveHistory,
    playerMoveHistory,
    playerMoveCount: playerMoveHistory.length,
    resetCounter,

    setCurrentFen,
    updateExerciseFen,
    handleCategorySelect,
    handleExerciseSelect,
    handleMove,
    clearSelection,
    resetState,
    resetExercise,
  };
}
