import type { DrawShape } from "@lichess-org/chessground/draw";
import { Box, Paper } from "@mantine/core";
import { makeSquare, type NormalMove, parseSquare, parseUci } from "chessops";
import { chessgroundDests } from "chessops/compat";
import { makeFen } from "chessops/fen";
import equal from "fast-deep-equal";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EngineOptions, GoMode } from "@/bindings";
import { commands, events } from "@/bindings";
import { Chessground } from "@/components/Chessground";
import { TreeStateProvider } from "@/components/TreeStateContext";
import { enginesAtom } from "@/state/atoms";
import { positionFromFen } from "@/utils/chessops";
import type { LocalEngine } from "@/utils/engines";
import { notifications } from "@mantine/notifications";

interface PracticeBoardProps {
  fen: string;
  orientation?: "white" | "black";
  viewOnly?: boolean;
  editingMode?: boolean;
  engineColor?: "white" | "black" | undefined;
  onMove?: (move: NormalMove) => void;
  onPositionChange?: (fen: string) => void;
  onChessMove?: (orig: string, dest: string) => void;
}

function PracticeBoard({
  fen,
  orientation = "white",
  viewOnly = false,
  editingMode = false,
  engineColor,
  onMove,
  onPositionChange,
  onChessMove,
}: PracticeBoardProps) {
  const engines = useAtomValue(enginesAtom)
    .filter((e): e is LocalEngine => e.type === "local")
    .sort((a, b) => (b?.elo ?? 0) - (a?.elo ?? 0));
  const engine = engines?.[0] || null;

  const [currentFen, setCurrentFen] = useState(fen);
  const [pendingMove, setPendingMove] = useState<{ move: NormalMove; squares: { orig: string; dest: string } } | null>(
    null,
  );
  const [shapes, setShapes] = useState<DrawShape[]>([]);
  const [showCoordinates] = useState(true);
  const [showDests] = useState(true);
  const [autoPromote] = useState(true);
  const engineTabRef = useRef<string>("practice-board");
  const engineThinkingRef = useRef<boolean>(false);

  useEffect(() => {
    setCurrentFen(fen);
  }, [fen]);

  const [pos] = positionFromFen(currentFen);
  const dests = pos ? chessgroundDests(pos) : new Map();
  const turn = pos?.turn || "white";

  const isEngineTurn = engineColor && turn === engineColor && !editingMode && !viewOnly && engine;

  const movableColor: "white" | "black" | "both" | undefined = useMemo(() => {
    if (viewOnly) return undefined;
    if (editingMode) return "both";
    if (isEngineTurn) return undefined;
    return turn;
  }, [viewOnly, editingMode, turn, isEngineTurn]);

  const makeMove = useCallback(
    (move: NormalMove) => {
      if (!pos) return;

      const newPos = pos.clone();
      newPos.play(move);
      const newSetup = newPos.toSetup();
      const newFenString = makeFen(newSetup);

      setCurrentFen(newFenString);
      onMove?.(move);
      onPositionChange?.(newFenString);
    },
    [pos, onMove, onPositionChange],
  );

  const requestEngineMove = useCallback(() => {
    if (!pos || !engineColor || engineThinkingRef.current || !engine) return;

    engineThinkingRef.current = true;

    try {
      const goMode: GoMode = { t: "Time", c: 1_000 };
      const options: EngineOptions = {
        fen: currentFen,
        moves: [],
        extraOptions: [
          { name: "MultiPV", value: "1" },
          ...(engine.settings || [])
            .filter((s) => s.name !== "MultiPV")
            .map((s) => ({
              ...s,
              value: s.value?.toString() ?? "",
            })),
        ],
      };

      commands
        .getBestMoves(engine.name, engine.path, engineTabRef.current, goMode, options)
        .then((res) => {
          if (res.status === "error") {
            engineThinkingRef.current = false;
            notifications.show({
              title: "Engine error",
              message: typeof res.error === "string" ? res.error : "Unknown error",
              color: "red",
            });
          }
        })
        .catch((error) => {
          console.error("Engine move failed:", error);
          engineThinkingRef.current = false;
        });
    } catch (error) {
      console.error("Engine move failed:", error);
      engineThinkingRef.current = false;
    }
  }, [pos, engineColor, currentFen, engine]);

  useEffect(() => {
    const unlisten = events.bestMovesPayload.listen(({ payload }) => {
      const ev = payload.bestLines;
      if (
        payload.progress === 100 &&
        payload.tab === engineTabRef.current &&
        payload.fen === currentFen &&
        equal(payload.moves, []) &&
        !pos?.isEnd()
      ) {
        if (ev && ev.length > 0 && ev[0].uciMoves.length > 0) {
          const bestUciMove = ev[0].uciMoves[0];

          const uciMove = parseUci(bestUciMove);
          if (uciMove && pos && "from" in uciMove && "to" in uciMove) {
            const dests = pos.allDests();
            const legalDestinations = dests.get(uciMove.from);
            const isLegal = legalDestinations?.has(uciMove.to) ?? false;

            if (isLegal) {
              makeMove(uciMove as NormalMove);
              const fromSquare = makeSquare(uciMove.from);
              const toSquare = makeSquare(uciMove.to);
              if (fromSquare && toSquare) {
                onChessMove?.(fromSquare, toSquare);
              }
            } else {
              console.error("Engine suggested illegal move:", bestUciMove);
            }
          }
        } else {
          console.log("No moves received from engine");
        }

        engineThinkingRef.current = false;
      }
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, [currentFen, pos, makeMove, onChessMove]);

  useEffect(() => {
    if (isEngineTurn && !engineThinkingRef.current && engine) {
      const timeout = setTimeout(() => {
        requestEngineMove();
      }, 100);
      return () => clearTimeout(timeout);
    }
  }, [isEngineTurn, requestEngineMove, engine]);

  useEffect(() => {
    return () => {
      if (engineColor && engine) {
        commands.stopEngine(engine.path, engineTabRef.current).catch(console.error);
      }
    };
  }, [engineColor, engine]);

  const setBoardFen = useCallback(
    (fen: string) => {
      if (!fen || !editingMode) return;
      const newFen = `${fen} ${currentFen.split(" ").slice(1).join(" ")}`;

      if (newFen !== currentFen) {
        setCurrentFen(newFen);
        onPositionChange?.(newFen);
      }
    },
    [editingMode, onPositionChange, currentFen],
  );

  const lastMove = useMemo(() => {
    return undefined;
  }, []);

  return (
    <Paper p="md" withBorder>
      <Chessground
        setBoardFen={setBoardFen}
        orientation={orientation}
        fen={currentFen}
        animation={{ enabled: !editingMode }}
        coordinates={showCoordinates}
        movable={{
          free: editingMode,
          color: movableColor,
          dests: editingMode || viewOnly ? undefined : dests,
          showDests,
          events: {
            after(orig, dest, metadata) {
              if (!editingMode && !viewOnly) {
                const from = parseSquare(orig);
                const to = parseSquare(dest);

                if (pos && from !== undefined && to !== undefined) {
                  if (
                    pos.board.get(from)?.role === "pawn" &&
                    ((dest[1] === "8" && turn === "white") || (dest[1] === "1" && turn === "black"))
                  ) {
                    if (autoPromote && !metadata.ctrlKey) {
                      makeMove({
                        from,
                        to,
                        promotion: "queen",
                      });
                      onChessMove?.(orig, dest);
                    } else {
                      setPendingMove({
                        move: { from, to },
                        squares: { orig, dest },
                      });
                    }
                  } else {
                    makeMove({
                      from,
                      to,
                    });
                    onChessMove?.(orig, dest);
                  }
                }
              }
            },
          },
        }}
        turnColor={turn}
        check={pos?.isCheck()}
        lastMove={editingMode ? undefined : lastMove}
        premovable={{
          enabled: false,
        }}
        draggable={{
          enabled: true,
          deleteOnDropOff: editingMode,
        }}
        drawable={{
          enabled: true,
          visible: true,
          defaultSnapToValidMove: true,
          autoShapes: shapes,
          onChange: (newShapes) => {
            setShapes(newShapes);
          },
        }}
      />

      {pendingMove && (
        <Box
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            background: "white",
            padding: "1rem",
            border: "1px solid #ccc",
            borderRadius: "4px",
            zIndex: 1000,
          }}
        >
          <div>Choose promotion piece:</div>
          {(["queen", "rook", "bishop", "knight"] as const).map((piece) => (
            <button
              key={piece}
              type="button"
              onClick={() => {
                if (pendingMove) {
                  makeMove({
                    from: pendingMove.move.from,
                    to: pendingMove.move.to,
                    promotion: piece,
                  });
                  onChessMove?.(pendingMove.squares.orig, pendingMove.squares.dest);
                  setPendingMove(null);
                }
              }}
              style={{ margin: "0.25rem", padding: "0.5rem" }}
            >
              {piece}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPendingMove(null)}
            style={{ margin: "0.25rem", padding: "0.5rem", background: "#f00", color: "white" }}
          >
            Cancel
          </button>
        </Box>
      )}
    </Paper>
  );
}

export default function PracticeBoardWithProvider(props: PracticeBoardProps) {
  return (
    <TreeStateProvider>
      <PracticeBoard {...props} />
    </TreeStateProvider>
  );
}
