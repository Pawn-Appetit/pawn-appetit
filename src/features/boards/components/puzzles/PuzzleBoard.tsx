import { Box } from "@mantine/core";
import { useElementSize, useForceUpdate, useHotkeys } from "@mantine/hooks";
import { type Move, makeUci, type NormalMove, parseSquare } from "chessops";
import { chessgroundDests, chessgroundMove } from "chessops/compat";
import equal from "fast-deep-equal";
import { useAtomValue, useSetAtom } from "jotai";
import { useContext, useMemo, useState } from "react";
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

  const currentNode = useMemo(() => getNodeAtPath(root, position), [root, position]);

  const puzzle = puzzles[currentPuzzle] ?? null;
  const [ended, setEnded] = useState(false);

  const [pos] = useMemo(() => positionFromFen(currentNode.fen), [currentNode.fen]);

  const initialFen = puzzle?.fen || currentNode.fen;
  const [initialPos] = useMemo(() => positionFromFen(initialFen), [initialFen]);

  const currentMove = useMemo(() => {
    if (!puzzle || !initialPos) return 0;

    const treeIter = treeIteratorMainLine(root);
    treeIter.next();
    let moveIndex = 0;
    const iterPos = initialPos.clone();
    for (const { node } of treeIter) {
      if (!node.move || moveIndex >= puzzle.moves.length) break;
      const normalizedMove = uciNormalize(iterPos, node.move, false);
      const normalizedPuzzleMove = puzzle.moves[moveIndex];
      if (normalizedMove !== normalizedPuzzleMove) break;
      iterPos.play(node.move);
      moveIndex++;
    }
    return moveIndex;
  }, [initialPos, puzzle, root]);

  const expectedMainlinePath = useMemo(() => Array(currentMove).fill(0), [currentMove]);
  const turn = pos?.turn || "white";
  const orientation = useMemo(() => {
    let nextOrientation = initialPos?.turn || "white";
    if ((puzzle?.moves.length || 0) % 2 === 0) {
      nextOrientation = nextOrientation === "white" ? "black" : "white";
    }
    return nextOrientation;
  }, [initialPos?.turn, puzzle?.moves.length]);

  const [pendingMove, setPendingMove] = useState<NormalMove | null>(null);

  const dests = useMemo(() => (pos ? chessgroundDests(pos) : new Map()), [pos]);
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
            color: puzzle && equal(position, expectedMainlinePath) ? turn : undefined,
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
