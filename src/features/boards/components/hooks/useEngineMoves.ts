import { parseUci } from "chessops";
import { useAtomValue } from "jotai";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";
import { commands, events } from "@/bindings";
import { notifications } from "@mantine/notifications";
import { activeTabAtom, currentGameStateAtom, currentPlayersAtom } from "@/state/atoms";
import { TreeStateContext } from "@/components/TreeStateContext";
import { useContext } from "react";
import { getMainLine } from "@/utils/chess";
import { positionFromFen } from "@/utils/chessops";
import type { TreeNode } from "@/utils/treeReducer";
import { treeIteratorMainLine } from "@/utils/treeReducer";

/**
 * useEngineMoves - Hook for engine move requests and responses in play vs engine mode.
 * 
 * This hook is ONLY used by PlayVsEngineBoard component, not by BoardGame or BoardAnalysis.
 * 
 * Responsibilities:
 * - Requests engine moves when it's the engine's turn
 * - Listens for bestMovesPayload events and applies engine moves
 * - Manages engine request state (prevents duplicate requests)
 * - Handles engine errors and timeouts
 * - Verifies move legality before applying
 * 
 * This hook is separate from analysis engine evaluation (handled by EvalListener in BoardAnalysis).
 */
export function useEngineMoves(
  root: TreeNode,
  headers: { variant?: string; result?: string },
  pos: ReturnType<typeof positionFromFen>[0],
  whiteTime: number | null,
  blackTime: number | null,
) {
  const { t } = useTranslation();
  const activeTab = useAtomValue(activeTabAtom);
  const gameState = useAtomValue(currentGameStateAtom);
  const players = useAtomValue(currentPlayersAtom);
  const store = useContext(TreeStateContext)!;
  const appendMove = useStore(store, (s) => s.appendMove);

  const engineRequestRef = useRef<string | null>(null);
  const engineRequestDetailsRef = useRef<{
    tab: string;
    engineTurn: "white" | "black";
    fen: string;
    moves: string[];
  } | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Force re-request after error by incrementing this counter
  const [retryCounter, setRetryCounter] = useState(0);

  const moves = useMemo(() => getMainLine(root, headers.variant === "Chess960"), [root, headers.variant]);
  const mainLine = useMemo(() => Array.from(treeIteratorMainLine(root)), [root]);
  const lastNode = useMemo(() => mainLine[mainLine.length - 1].node, [mainLine]);

  // Request engine moves when it's the engine's turn
  useEffect(() => {
    // Early return if game is not playing - don't make any requests
    if (gameState !== "playing" || headers.result !== "*") {
      if (engineRequestRef.current) {
        engineRequestRef.current = null;
        engineRequestDetailsRef.current = null;
      }
      // Clear any pending timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      return;
    }

    // Only proceed if we have a valid position
    if (!pos) {
      return;
    }

    // Only request engine moves when game is actively playing
    if (pos && gameState === "playing" && headers.result === "*") {
      const currentTurn = pos.turn;
      const player = currentTurn === "white" ? players.white : players.black;

      if (player.type === "engine" && player.engine) {
        const engine = player.engine;
        const tabKey = activeTab + currentTurn;

        // Create a unique key for this request to prevent duplicate calls
        // Include engine path to ensure uniqueness per engine instance
        const requestKey = `${tabKey}-${engine.path}-${root.fen}-${moves.join(",")}`;

        // Skip if we're already processing this exact request
        if (engineRequestRef.current === requestKey) {
          return;
        }

        // Mark this request as in progress BEFORE making the call
        // This prevents multiple calls from creating duplicate engines
        engineRequestRef.current = requestKey;
        engineRequestDetailsRef.current = {
          tab: tabKey,
          engineTurn: currentTurn,
          fen: root.fen,
          moves: moves,
        };

        // Calculate time for engine - use actual remaining time or fallback to timeControl seconds
        const engineTime = currentTurn === "white" 
          ? (whiteTime ?? (player.timeControl?.seconds ?? 0))
          : (blackTime ?? (player.timeControl?.seconds ?? 0));
        const opponentTime = currentTurn === "white"
          ? (blackTime ?? (players.black?.timeControl?.seconds ?? 0))
          : (whiteTime ?? (players.white?.timeControl?.seconds ?? 0));
        
        // Only use PlayersTime if we have valid time values and timeControl is set
        // Otherwise use the engine's default go mode
        const goMode = player.timeControl && engineTime > 0 && opponentTime >= 0
          ? {
              t: "PlayersTime" as const,
              c: {
                white: currentTurn === "white" ? engineTime : opponentTime,
                black: currentTurn === "white" ? opponentTime : engineTime,
                winc: player.timeControl.increment ?? 0,
                binc: player.timeControl.increment ?? 0,
              },
            }
          : player.go;

        const requestPromise = commands
          .getBestMoves(
            currentTurn,
            engine.path,
            tabKey,
            goMode,
            {
              fen: root.fen,
              moves: moves,
              extraOptions: (engine.settings || [])
                .filter((s) => s.name !== "MultiPV")
                .map((s) => ({ ...s, value: s.value?.toString() ?? "" })),
            },
          );
        
        // Handle the promise directly - tauri-specta commands should resolve
        // Add a timeout check separately
        timeoutRef.current = setTimeout(() => {
          if (engineRequestRef.current === requestKey) {
            engineRequestRef.current = null;
            engineRequestDetailsRef.current = null;
          }
          timeoutRef.current = null;
        }, 5000);
        
        requestPromise
          .then((res: any) => {
            // Clear timeout if promise resolves
            if (timeoutRef.current) {
              clearTimeout(timeoutRef.current);
              timeoutRef.current = null;
            }
            
            // Check if game is still playing before processing response
            if (gameState !== "playing" || headers.result !== "*") {
              return;
            }
            
            // Check if this request is still active (not superseded by another request)
            if (engineRequestRef.current !== requestKey) {
              return;
            }
            
            // IMPORTANT: tauri-specta commands resolve to Result; errors do NOT necessarily throw.
            // If we don't handle the error branch here, `engineRequestRef` can get stuck and the engine will never move.
            if (res.status === "error") {
              engineRequestRef.current = null;
              engineRequestDetailsRef.current = null;
              notifications.show({
                title: t("common.error", "Error"),
                message: typeof res.error === "string" ? res.error : t("common.unknownError", "Unknown error"),
                color: "red",
              });
              return;
            }

            // Fallback: if backend returns a final result immediately (e.g. cached) apply it without waiting for the event.
            if (res.data && res.data[0] === 100 && !pos.isEnd() && gameState === "playing") {
              const [, bestLines] = res.data;
              const bestUci = bestLines?.[0]?.uciMoves?.[0];
              if (bestUci) {
                engineRequestRef.current = null;
                engineRequestDetailsRef.current = null;
                appendMove({
                  payload: parseUci(bestUci)!,
                  clock: (pos.turn === "white" ? whiteTime : blackTime) ?? undefined,
                });
              }
            }
          })
          .catch((e) => {
            // Clear timeout if promise rejects
            if (timeoutRef.current) {
              clearTimeout(timeoutRef.current);
              timeoutRef.current = null;
            }
            
            // Only show error if request is still active and game is still playing
            if (engineRequestRef.current === requestKey && gameState === "playing" && headers.result === "*") {
              engineRequestRef.current = null;
              engineRequestDetailsRef.current = null;
              notifications.show({
                title: t("common.error", "Error"),
                message: e instanceof Error ? e.message : t("common.unknownError", "Unknown error"),
                color: "red",
              });
            }
          });
        
        // Return cleanup function to cancel timeout if effect re-runs or component unmounts
        return () => {
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
          }
          // Only clear refs if this specific request is still active
          if (engineRequestRef.current === requestKey) {
            engineRequestRef.current = null;
            engineRequestDetailsRef.current = null;
          }
        };
      } else {
        // Clear ref if it's not an engine turn
        engineRequestRef.current = null;
        engineRequestDetailsRef.current = null;
      }
    }
    
    // Always return cleanup function to cancel any pending timeouts
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [gameState, pos, players, headers.result, activeTab, root.fen, moves, whiteTime, blackTime, appendMove, t, retryCounter]);

  // Listen for engine move responses
  // Throttle best-moves event processing to avoid stutter while dragging/moving pieces.
  // We only need the latest payload at ~10fps (~100ms intervals).
  useEffect(() => {
    const throttleMs = 100;
    let pending: (typeof events.bestMovesPayload extends any ? any : any) | null = null;
    let timer: number | null = null;

    const flush = () => {
      if (!pending) return;
      const payload = pending;
      pending = null;

      // Only process moves when game is actively playing
      if (gameState !== "playing" || !activeTab || !pos) {
        return;
      }

      const expectedTab = activeTab + pos.turn;
      const currentPlayer = players[pos.turn];
      const isEngineTurn = currentPlayer?.type === "engine";

      // More flexible tab matching: check if payload.tab ends with current turn
      // This handles cases where the tab ID might have changed but the game is still active
      const tabEndsWithTurn = payload.tab.endsWith(pos.turn);
      const tabMatchesExactly = payload.tab === expectedTab;
      const tabMatches = tabMatchesExactly || tabEndsWithTurn;

      const shouldApplyMove =
        payload.progress === 100 &&
        tabMatches &&
        payload.engine === pos.turn &&
        isEngineTurn &&
        !pos.isEnd();

      if (shouldApplyMove) {
        const bestUci = payload.bestLines?.[0]?.uciMoves?.[0];
        if (!bestUci) {
          // Clear refs on error to allow retry
          engineRequestRef.current = null;
          engineRequestDetailsRef.current = null;
          // Force re-request by incrementing retry counter
          setRetryCounter((prev) => prev + 1);
          return;
        }
        const parsed = parseUci(bestUci);
        if (!parsed) {
          // Clear refs on error to allow retry
          engineRequestRef.current = null;
          engineRequestDetailsRef.current = null;
          // Force re-request by incrementing retry counter
          setRetryCounter((prev) => prev + 1);
          return;
        }

        // Verify move is legal in current position (safety check)
        const dests = pos.allDests();
        const legalDestinations = "from" in parsed ? dests.get(parsed.from) : null;
        const isLegal = "from" in parsed && legalDestinations?.has(parsed.to);
        if (!isLegal) {
          // Clear refs on error to allow retry
          engineRequestRef.current = null;
          engineRequestDetailsRef.current = null;
          // Force re-request by incrementing retry counter
          setRetryCounter((prev) => prev + 1);
          return;
        }

        // Clear refs BEFORE applying move to prevent race conditions
        engineRequestRef.current = null;
        engineRequestDetailsRef.current = null;
        
        try {
          appendMove({
            payload: parsed,
            clock: (pos.turn === "white" ? whiteTime : blackTime) ?? undefined,
          });
        } catch (error) {
          // Clear refs on error to allow retry
          engineRequestRef.current = null;
          engineRequestDetailsRef.current = null;
          // Force re-request by incrementing retry counter
          setRetryCounter((prev) => prev + 1);
        }
      } else if (payload.progress === 100 && tabEndsWithTurn) {
        // Clear the engine request ref when we receive a final response for this turn
        // This allows new requests even if the payload doesn't match exactly (e.g. stale response or tab changed)
        engineRequestRef.current = null;
        engineRequestDetailsRef.current = null;
      }
    };

    const unlisten = events.bestMovesPayload.listen(({ payload }) => {
      // Always throttle to avoid stutter - even progress 100 events can arrive in bursts
      // We only need the latest payload, so accumulate and flush at ~10fps
      pending = payload;
      if (timer == null) {
        timer = window.setTimeout(() => {
          timer = null;
          flush();
        }, throttleMs);
      }
    });
    return () => {
      pending = null;
      if (timer != null) {
        window.clearTimeout(timer);
        timer = null;
      }
      // Use a small delay before unlistening to avoid Tauri callback errors
      // This gives Rust time to finish sending any pending events
      setTimeout(() => {
        unlisten.then((f) => f()).catch(() => {});
      }, 100);
    };
  }, [gameState, activeTab, appendMove, pos, players, whiteTime, blackTime, t]);
}

