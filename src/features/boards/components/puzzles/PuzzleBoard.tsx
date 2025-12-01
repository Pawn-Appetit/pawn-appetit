import { Box } from "@mantine/core";
import { useElementSize, useForceUpdate, useHotkeys } from "@mantine/hooks";
import { type Move, makeUci, type NormalMove, parseSquare } from "chessops";
import { chessgroundDests, chessgroundMove } from "chessops/compat";
import equal from "fast-deep-equal";
import { useAtomValue, useSetAtom } from "jotai";
import { useContext, useState } from "react";
import { useStore } from "zustand";
import { Chessground } from "@/components/Chessground";
import { TreeStateContext } from "@/components/TreeStateContext";
import PromotionModal from "@/features/boards/components/PromotionModal";
import { blindfoldAtom, showCoordinatesAtom } from "@/state/atoms";
import { keyMapAtom } from "@/state/keybindings";
import { blindfold, chessboard } from "@/styles/Chessboard.css";
import { uciNormalize } from "@/utils/chess";
import { positionFromFen } from "@/utils/chessops";
import { logger } from "@/utils/logger";
import { recordPuzzleSolved } from "@/utils/puzzleStreak";
import type { Completion, Puzzle } from "@/utils/puzzles";
import { PUZZLE_DEBUG_LOGS } from "@/utils/puzzles";
import { getNodeAtPath, treeIteratorMainLine } from "@/utils/treeReducer";

function PuzzleBoard({
  puzzles,
  currentPuzzle,
  changeCompletion,
  generatePuzzle,
  db,
  jumpToNext,
}: {
  puzzles: Puzzle[];
  currentPuzzle: number;
  changeCompletion: (completion: Completion) => void;
  generatePuzzle: (db: string) => void;
  db: string | null;
  jumpToNext: "off" | "success" | "success-and-failure";
}) {
  const store = useContext(TreeStateContext);
  if (!store) {
    throw new Error("PuzzleBoard must be used within a TreeStateContext provider");
  }
  const root = useStore(store, (s) => s.root);
  const position = useStore(store, (s) => s.position);
  const makeMove = useStore(store, (s) => s.makeMove);
  const makeMoves = useStore(store, (s) => s.makeMoves);
  const reset = useForceUpdate();

  const currentNode = getNodeAtPath(root, position);

  let puzzle: Puzzle | null = null;
  if (puzzles.length > 0) {
    puzzle = puzzles[currentPuzzle];
  }
  const [ended, setEnded] = useState(false);

  const [pos] = positionFromFen(currentNode.fen);
  const initialFen = puzzle?.fen || currentNode.fen;
  const [initialPos] = positionFromFen(initialFen);

  const treeIter = treeIteratorMainLine(root);
  treeIter.next();
  let currentMove = 0;
  if (puzzle && initialPos) {
    const iterPos = initialPos.clone();
    for (const { node } of treeIter) {
      if (node.move && currentMove < puzzle.moves.length) {
        const normalizedMove = uciNormalize(iterPos, node.move, false);
        const normalizedPuzzleMove = puzzle.moves[currentMove];
        if (normalizedMove === normalizedPuzzleMove) {
          iterPos.play(node.move);
          currentMove++;
        } else {
          break;
        }
      } else {
        break;
      }
    }
  }
  const turn = pos?.turn || "white";
  let orientation = initialPos?.turn || "white";
  if ((puzzle?.moves.length || 0) % 2 === 0) {
    orientation = orientation === "white" ? "black" : "white";
  }

  const [pendingMove, setPendingMove] = useState<NormalMove | null>(null);

  const dests = pos ? chessgroundDests(pos) : new Map();
  const showCoordinates = useAtomValue(showCoordinatesAtom);
  const isBlindfold = useAtomValue(blindfoldAtom);
  const setBlindfold = useSetAtom(blindfoldAtom);
  const keyMap = useAtomValue(keyMapAtom);

  useHotkeys([[keyMap.BLINDFOLD.keys, () => setBlindfold((v) => !v)]]);

  function checkMove(move: Move) {
    if (!pos) return;
    if (!puzzle) return;

    const newPos = pos.clone();
    const uci = uciNormalize(pos, move, false);
    newPos.play(move);

    const expectedMove = puzzle.moves[currentMove];

    PUZZLE_DEBUG_LOGS &&
      logger.debug("Checking move:", {
        uci,
        expectedMove,
        currentMove,
        totalMoves: puzzle.moves.length,
        isCheckmate: newPos.isCheckmate(),
        isCorrect: expectedMove === uci || newPos.isCheckmate(),
      });

    if (expectedMove === uci || newPos.isCheckmate()) {
      if (currentMove === puzzle.moves.length - 1) {
        if (puzzle.completion === "incomplete") {
          changeCompletion("correct");
          recordPuzzleSolved();
        }
        setEnded(false);

        if (db && (jumpToNext === "success" || jumpToNext === "success-and-failure")) {
          PUZZLE_DEBUG_LOGS && logger.debug("Auto-generating next puzzle (success)");
          generatePuzzle(db);
        }
      }
      const newMoves = puzzle.moves.slice(currentMove, currentMove + 2);
      makeMoves({
        payload: newMoves,
        mainline: true,
        changeHeaders: false,
      });
    } else {
      makeMove({
        payload: move,
        changePosition: false,
        changeHeaders: false,
      });
      if (!ended) {
        changeCompletion("incorrect");

        if (db && jumpToNext === "success-and-failure") {
          PUZZLE_DEBUG_LOGS && logger.debug("Auto-generating next puzzle (failure)");
          generatePuzzle(db);
        }
      }
      setEnded(true);
    }
    reset();
  }

  const { ref: parentRef, height: parentHeight } = useElementSize();

  return (
    <Box w="100%" h="100%" ref={parentRef}>
      <Box
        className={`${chessboard} ${isBlindfold ? blindfold : ""}`}
        style={{
          maxWidth: parentHeight,
        }}
      >
        <PromotionModal
          pendingMove={pendingMove}
          cancelMove={() => setPendingMove(null)}
          confirmMove={(p) => {
            if (pendingMove) {
              checkMove({ ...pendingMove, promotion: p });
              setPendingMove(null);
            }
          }}
          turn={turn}
          orientation={orientation}
        />
        <Chessground
          animation={{
            enabled: true,
          }}
          coordinates={showCoordinates !== "none"}
          coordinatesOnSquares={showCoordinates === "all"}
          orientation={orientation}
          movable={{
            free: false,
            color: puzzle && equal(position, Array(currentMove).fill(0)) ? turn : undefined,
            dests: dests,
            events: {
              after: (orig, dest) => {
                const from = parseSquare(orig);
                const to = parseSquare(dest);
                if (!from || !to) return;
                const move: NormalMove = { from, to };
                if (
                  pos &&
                  pos.board.get(from)?.role === "pawn" &&
                  ((dest[1] === "8" && turn === "white") || (dest[1] === "1" && turn === "black"))
                ) {
                  setPendingMove(move);
                } else {
                  checkMove(move);
                }
              },
            },
          }}
          lastMove={currentNode.move ? chessgroundMove(currentNode.move) : undefined}
          turnColor={turn}
          fen={currentNode.fen}
          check={pos?.isCheck()}
        />
      </Box>
    </Box>
  );
}

export default PuzzleBoard;
