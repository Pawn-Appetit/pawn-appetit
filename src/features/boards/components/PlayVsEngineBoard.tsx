/**
 * PlayVsEngineBoard - Specialized component for playing against an engine.
 * 
 * This component implements ALL engine-specific functionality for playing vs engine mode:
 * - Engine move requests (via useEngineMoves hook)
 * - Engine move response handling (listening to bestMovesPayload events)
 * - Engine state management (request tracking, error handling)
 * - Time synchronization with BoardGame (via GameTimeContext)
 * 
 * Responsibilities:
 * - Detects when it's the engine's turn and requests moves
 * - Listens for engine responses and applies moves automatically
 * - Handles engine errors and timeouts
 * - Manages engine request state to prevent duplicates
 * 
 * It wraps BoardGame (which handles UI, game state, clocks) and adds engine logic on top.
 * BoardGame itself does NOT know about engines - this separation keeps it clean for other use cases.
 */
import { useContext, useEffect, useMemo } from "react";
import { useStore } from "zustand";
import { TreeStateContext } from "@/components/TreeStateContext";
import { getMainLine } from "@/utils/chess";
import { positionFromFen } from "@/utils/chessops";
import { treeIteratorMainLine } from "@/utils/treeReducer";
import { useEngineMoves } from "./hooks/useEngineMoves";
import { GameTimeProvider, useGameTime } from "./GameTimeContext";
import BoardGame from "./BoardGame";

function PlayVsEngineBoardContent() {
  useEffect(() => {
    console.log("[PlayVsEngineBoard] Component mounted - implementing engine vs human gameplay");
    return () => {
      console.log("[PlayVsEngineBoard] Component unmounting");
    };
  }, []);

  // Get game state from store
  const store = useContext(TreeStateContext)!;
  const root = useStore(store, (s) => s.root);
  const headers = useStore(store, (s) => s.headers);

  // Get time from context (shared with BoardGame)
  const { whiteTime, blackTime } = useGameTime();

  // Calculate position and moves
  const mainLine = useMemo(() => Array.from(treeIteratorMainLine(root)), [root]);
  const lastNode = useMemo(() => mainLine[mainLine.length - 1].node, [mainLine]);
  const [pos] = useMemo(() => positionFromFen(lastNode.fen), [lastNode.fen]);

  // Use the engine moves hook to handle all engine logic
  // This is the core functionality of PlayVsEngineBoard
  useEngineMoves(
    root,
    { variant: headers.variant ?? undefined, result: headers.result ?? undefined },
    pos,
    whiteTime,
    blackTime,
  );

  // Render the base BoardGame component (without engine logic)
  return <BoardGame />;
}

export default function PlayVsEngineBoard() {
  return (
    <GameTimeProvider>
      <PlayVsEngineBoardContent />
    </GameTimeProvider>
  );
}

