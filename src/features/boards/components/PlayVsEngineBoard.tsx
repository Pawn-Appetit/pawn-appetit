/**
 * PlayVsEngineBoard - Specialized component for playing against an engine.
 *
 * Layout: GAME mode
 * - Board centered
 * - Left panel: game headers/info
 * - Right panel: clocks + controls + opening + PGN
 */
import { Box, Button, Divider, Group, Paper, ScrollArea, Stack, Text } from "@mantine/core";
import {
  IconArrowLeft,
  IconArrowsExchange,
  IconEraser,
  IconFlag,
  IconPlus,
  IconRepeat,
  IconZoomCheck,
} from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { INITIAL_FEN } from "chessops/fen";
import { useAtom, useAtomValue } from "jotai";
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Mosaic } from "react-mosaic-component";
import { useStore } from "zustand";
import { commands } from "@/bindings";
import Clock from "@/components/Clock";
import GameInfo from "@/components/GameInfo";
import { TreeStateContext } from "@/components/TreeStateContext";
import { activeTabAtom, currentGameStateAtom, currentPlayersAtom, tabsAtom } from "@/state/atoms";
import { getMainLine, getOpening, getPGN } from "@/utils/chess";
import { positionFromFen } from "@/utils/chessops";
import { type GameRecord, saveGameRecord } from "@/utils/gameRecords";
import { treeIteratorMainLine } from "@/utils/treeReducer";
import { createFullLayout, DEFAULT_MOSAIC_LAYOUT } from "../constants";
import BoardGame, { useClockTimer } from "./BoardGame";
import { GameTimeProvider, useGameTime } from "./GameTimeContext";
import { useEngineMoves } from "./hooks/useEngineMoves";
import ResponsiveBoard from "./ResponsiveBoard";

function PlayVsEngineBoardContent() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const activeTab = useAtomValue(activeTabAtom);
  const [, setActiveTab] = useAtom(activeTabAtom);
  const [gameState, setGameState] = useAtom(currentGameStateAtom);
  const [players] = useAtom(currentPlayersAtom);
  const [tabs, setTabs] = useAtom(tabsAtom);
  const boardRef = useRef<HTMLDivElement | null>(null);

  const store = useContext(TreeStateContext)!;
  const root = useStore(store, (s) => s.root);
  const position = useStore(store, (s) => s.position);
  const headers = useStore(store, (s) => s.headers);
  const setHeaders = useStore(store, (s) => s.setHeaders);
  const setFen = useStore(store, (s) => s.setFen);
  const setResult = useStore(store, (s) => s.setResult);
  const clearShapes = useStore(store, (s) => s.clearShapes);

  const { whiteTime, blackTime, setWhiteTime, setBlackTime } = useGameTime();

  // Initialize times from players when game starts playing
  useEffect(() => {
    if (gameState === "playing" && whiteTime === null && blackTime === null) {
      if (players.white.timeControl) {
        setWhiteTime(players.white.timeControl.seconds);
      }
      if (players.black.timeControl) {
        setBlackTime(players.black.timeControl.seconds);
      }
    }
  }, [
    gameState,
    players.white.timeControl,
    players.black.timeControl,
    whiteTime,
    blackTime,
    setWhiteTime,
    setBlackTime,
  ]);

  const mainLine = useMemo(() => Array.from(treeIteratorMainLine(root)), [root]);
  const lastNode = useMemo(() => mainLine[mainLine.length - 1].node, [mainLine]);
  const [pos] = useMemo(() => positionFromFen(lastNode.fen), [lastNode.fen]);

  // Use clock timer to update times when game is playing
  useClockTimer(gameState, pos, whiteTime, blackTime, setWhiteTime, setBlackTime, players, setGameState, setResult);

  // PGN + opening (panel derecho)
  const pgn = useMemo(() => {
    try {
      return getPGN(root, {
        headers,
        comments: true,
        extraMarkups: true,
        glyphs: true,
        variations: true,
      });
    } catch {
      return "";
    }
  }, [root, headers]);

  // Calculate opening dynamically based on current position
  const [openingLabel, setOpeningLabel] = useState<string>("");

  useEffect(() => {
    getOpening(root, position).then((v) => {
      // If we found an opening, update it
      if (v && v !== "") {
        setOpeningLabel(v);
      }
      // If no opening found, keep the last one we found (don't clear it)
      // This ensures the opening label persists even when moving to positions
      // that don't have a named opening in the database
    });
  }, [root, position]);

  // Engine logic
  useEngineMoves(
    root,
    { variant: headers.variant ?? undefined, result: headers.result ?? undefined },
    pos,
    whiteTime,
    blackTime,
  );

  const movable = useMemo(() => {
    if (players.white.type === "human" && players.black.type === "human") return "turn";
    if (players.white.type === "human") return "white";
    if (players.black.type === "human") return "black";
    return "turn";
  }, [players]);

  // Track if game has been saved to avoid duplicate saves
  const gameSavedRef = useRef<string | null>(null);

  // Function to save the current game to local games
  const saveGame = useCallback(
    async (result: string) => {
      // Only save if there are moves in the game
      if (root.children.length === 0) {
        return;
      }

      // Create a unique key for this game to avoid duplicate saves
      const gameKey = `${root.fen}-${result}-${root.children.length}`;
      if (gameSavedRef.current === gameKey) {
        // Already saved this game
        return;
      }

      try {
        // Get the initial FEN from headers (set when game started)
        const initialFen = headers.fen || INITIAL_FEN;

        // Get the last node for final FEN
        const mainLineArray = Array.from(treeIteratorMainLine(root));
        const lastNode = mainLineArray[mainLineArray.length - 1].node;

        // Get UCI moves for the moves array
        const uciMoves = getMainLine(root, headers.variant === "Chess960");

        // Get PGN
        const gamePgn = getPGN(root, {
          headers,
          comments: true,
          extraMarkups: true,
          glyphs: true,
          variations: true,
        });

        // Build time control string
        let timeControlStr: string | undefined;
        if (headers.time_control) {
          timeControlStr = headers.time_control;
        } else if (headers.white_time_control || headers.black_time_control) {
          timeControlStr = `${headers.white_time_control || ""},${headers.black_time_control || ""}`;
        }

        // Create game record
        const record: GameRecord = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          white: {
            type: players.white.type,
            name: players.white.type === "human" ? players.white.name : players.white.engine?.name,
            engine: players.white.type === "engine" ? players.white.engine?.path : undefined,
          },
          black: {
            type: players.black.type,
            name: players.black.type === "human" ? players.black.name : players.black.engine?.name,
            engine: players.black.type === "engine" ? players.black.engine?.path : undefined,
          },
          result: result,
          timeControl: timeControlStr,
          timestamp: Date.now(),
          moves: uciMoves,
          variant: headers.variant ?? undefined,
          fen: lastNode.fen, // Final FEN position
          initialFen: initialFen !== INITIAL_FEN ? initialFen : undefined, // Initial FEN if different from standard
          pgn: gamePgn, // Full PGN
        };

        // Save the game record
        await saveGameRecord(record);

        // Mark as saved
        gameSavedRef.current = gameKey;
      } catch (error) {
        console.error("[PlayVsEngineBoard] Error saving game:", error);
      }
    },
    [root, headers, players],
  );

  // Reset saved game ref when a new game starts
  useEffect(() => {
    if (gameState === "settingUp" || (gameState === "playing" && root.children.length === 0)) {
      gameSavedRef.current = null;
    }
  }, [gameState, root.children.length]);

  // Save game when it ends (by time, checkmate, stalemate, etc.)
  useEffect(() => {
    // Only save if game is over and has a result (not "*")
    if (gameState === "gameOver" && headers.result && headers.result !== "*" && root.children.length > 0) {
      // Save the game with the current result
      saveGame(headers.result).catch((error) => {
        console.error("[PlayVsEngineBoard] Error saving game on gameOver:", error);
      });
    }
  }, [gameState, headers.result, root.children.length, saveGame]);

  const handleNewGame = async () => {
    console.log("[PlayVsEngineBoard] handleNewGame called, current gameState:", gameState);

    // Save the current game before going to setup (if there are moves and game is playing)
    if (root.children.length > 0 && (gameState === "playing" || gameState === "gameOver")) {
      // Determine result: loss for the player whose turn it is (or was playing)
      const currentTurn = pos?.turn ?? "white";
      const result = currentTurn === "white" ? "0-1" : "1-0";

      // Set result temporarily for saving
      const previousResult = headers.result;
      setHeaders({
        ...headers,
        result,
      });

      // Save the game
      await saveGame(result);

      // Restore previous result (or "*") for cleanup
      setHeaders({
        ...headers,
        result: "*",
      });
    }

    // Clear times
    setWhiteTime(null);
    setBlackTime(null);
    // Clear any pending engine requests by resetting headers result
    setHeaders({
      ...headers,
      result: "*",
    });
    // Reset game state to settingUp - this should trigger the BoardGame component to show
    setGameState("settingUp");
    console.log("[PlayVsEngineBoard] handleNewGame - set gameState to settingUp");
  };

  const handleAgain = async () => {
    // Save the current game before restarting (if there are moves)
    if (root.children.length > 0 && gameState === "playing") {
      // Determine result: loss for the player whose turn it is
      const currentTurn = pos?.turn ?? "white";
      const result = currentTurn === "white" ? "0-1" : "1-0";

      // Set result temporarily for saving
      const previousResult = headers.result;
      setHeaders({
        ...headers,
        result,
      });

      // Save the game
      await saveGame(result);

      // Restore previous result (or "*") for the new game
      setHeaders({
        ...headers,
        result: "*",
      });
    }

    // Get the initial FEN from headers.fen (this should be the starting position)
    // If headers.fen is not set or is the same as current position, use INITIAL_FEN
    // When a game starts, headers.fen is set to the starting FEN
    const initialFen = headers.fen || INITIAL_FEN;

    // Reset board to initial position
    setFen(initialFen);

    // Reset times with the same time controls
    if (players.white.timeControl) {
      setWhiteTime(players.white.timeControl.seconds);
    } else {
      setWhiteTime(null);
    }

    if (players.black.timeControl) {
      setBlackTime(players.black.timeControl.seconds);
    } else {
      setBlackTime(null);
    }

    // Clear result and update headers with initial FEN
    setHeaders({
      ...headers,
      fen: initialFen,
      result: "*",
    });

    // Set game state to playing to start the new game
    setGameState("playing");
  };

  const changeToAnalysisMode = () => {
    setTabs((prev) => prev.map((tab) => (tab.value === activeTab ? { ...tab, type: "analysis" } : tab)));
  };

  const flipBoard = () => {
    const current = (headers.orientation ?? "white") as "white" | "black";
    setHeaders({
      ...headers,
      fen: root.fen, // conservar posición actual
      orientation: current === "black" ? "white" : "black",
    });
  };

  const resign = async () => {
    if (gameState !== "playing") return;

    const humanColor =
      players.white.type === "human" ? "white" : players.black.type === "human" ? "black" : (pos?.turn ?? "white");

    const result = humanColor === "white" ? "0-1" : "1-0";

    // Set result en headers para que useEngineMoves deje de pedir jugadas
    setHeaders({
      ...headers,
      fen: root.fen, // conservar posición actual
      result,
    });

    setGameState("gameOver");

    // Save the game with resignation result
    await saveGame(result);
  };

  const handleBack = useCallback(async () => {
    // 1. Resign if game is playing
    if (gameState === "playing" && root.children.length > 0) {
      await resign();
    } else if (gameState === "gameOver" && root.children.length > 0 && headers.result && headers.result !== "*") {
      // If game is already over but not saved, save it
      await saveGame(headers.result);
    } else if (root.children.length > 0 && (gameState === "playing" || gameState === "gameOver")) {
      // Fallback: save with loss for current player
      const currentTurn = pos?.turn ?? "white";
      const result = currentTurn === "white" ? "0-1" : "1-0";
      await saveGame(result);
    }

    // 2. Close the tab
    if (activeTab) {
      // Kill engines for this tab
      try {
        await commands.killEngines(activeTab);
      } catch (error) {
        console.error(`Failed to kill engines for tab: ${activeTab}`, error);
      }

      // Remove the tab and update active tab
      const index = tabs.findIndex((tab) => tab.value === activeTab);
      if (index !== -1) {
        const newTabs = tabs.filter((tab) => tab.value !== activeTab);
        setTabs(newTabs);

        // Set active tab to another tab if available
        if (newTabs.length > 0) {
          if (index === tabs.length - 1) {
            // If we closed the last tab, select the previous one
            setActiveTab(newTabs[index - 1]?.value || newTabs[0].value);
          } else {
            // Otherwise, select the next tab (or same index if available)
            setActiveTab(newTabs[index]?.value || newTabs[0].value);
          }
        } else {
          // No tabs left, set active tab to null
          setActiveTab(null);
        }
      }
    }

    // 3. Navigate to dashboard
    navigate({ to: "/" });
  }, [
    gameState,
    root.children.length,
    headers.result,
    pos?.turn,
    activeTab,
    tabs,
    setTabs,
    setActiveTab,
    navigate,
    resign,
    saveGame,
  ]);

  if (gameState === "settingUp") {
    const fullLayout = createFullLayout();
    return (
      <Box style={{ width: "100%", height: "100%", minHeight: 0, minWidth: 0, position: "relative" }}>
        <Mosaic<"left" | "topRight" | "bottomRight">
          renderTile={(id) => fullLayout[id]}
          value={DEFAULT_MOSAIC_LAYOUT}
          onChange={() => {}}
        />
        <BoardGame />
      </Box>
    );
  }

  const SIDE_W = 340;

  // Fallback: si mainLine está vacío, mostrar un mensaje
  if (mainLine.length === 0) {
    return (
      <Box style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Text>Loading game...</Text>
      </Box>
    );
  }

  return (
    <Box style={{ width: "100%", height: "100%", minHeight: 0, minWidth: 0, display: "flex", flexDirection: "column" }}>
      <Box
        style={{
          flex: 1,
          minHeight: 0,
          padding: "1rem",
          boxSizing: "border-box",
          display: "grid",
          gridTemplateColumns: `${SIDE_W}px minmax(0, 1fr) ${SIDE_W}px`,
          gridTemplateRows: "1fr",
          gap: "1rem",
          overflow: "hidden",
        }}
      >
        {/* Left panel */}
        <Paper withBorder shadow="sm" p="md" style={{ minHeight: 0, overflow: "hidden" }}>
          <Stack gap="sm" style={{ height: "100%", minHeight: 0 }}>
            <Group justify="space-between" align="center">
              <Text fw={700}>Game info</Text>
              <Button variant="subtle" size="sm" onClick={handleBack} leftSection={<IconArrowLeft size={16} />}>
                Back
              </Button>
            </Group>

            {/* Clocks - Always show when game is playing or gameOver */}
            {(gameState === "playing" || gameState === "gameOver") && (
              <>
                <Text fw={600} size="sm">
                  Clocks
                </Text>
                <Stack gap="xs">
                  <Clock
                    color="white"
                    turn={pos?.turn ?? "white"}
                    whiteTime={whiteTime ?? undefined}
                    blackTime={blackTime ?? undefined}
                  />
                  <Clock
                    color="black"
                    turn={pos?.turn ?? "black"}
                    whiteTime={whiteTime ?? undefined}
                    blackTime={blackTime ?? undefined}
                  />
                </Stack>
                <Divider />
              </>
            )}

            <ScrollArea style={{ flex: 1 }} type="auto">
              <GameInfo headers={headers} />
            </ScrollArea>
          </Stack>
        </Paper>

        {/* Center board */}
        <Box
          style={{
            minWidth: 0,
            minHeight: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            padding: "0.5rem",
            width: "100%",
            height: "100%",
          }}
        >
          <Box
            style={{
              height: "100%",
              width: "auto",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              maxHeight: "100%",
              aspectRatio: "1",
            }}
          >
            <ResponsiveBoard
              dirty={false}
              editingMode={false}
              toggleEditingMode={() => undefined}
              viewOnly={gameState !== "playing"}
              disableVariations
              boardRef={boardRef}
              canTakeBack={false}
              movable={movable}
              whiteTime={undefined}
              blackTime={undefined}
              topBar={false}
              currentTabType="play"
              gameState={gameState}
              // opcional: permite hotkey/orientación desde Board internamente
              toggleOrientation={flipBoard}
              hideClockSpaces={true}
              hideEvalBar={true}
              hideFooterControls={true}
            />
          </Box>
        </Box>

        {/* Right panel */}
        <Paper withBorder shadow="sm" p="md" style={{ minHeight: 0, overflow: "hidden" }}>
          <Stack gap="sm" style={{ height: "100%", minHeight: 0 }}>
            <Text fw={700}>Game panel</Text>

            <Text fw={600} size="sm">
              Controls
            </Text>

            {(gameState === "playing" || gameState === "gameOver") && (
              <Stack gap="xs">
                <Group grow>
                  <Button onClick={handleNewGame} leftSection={<IconPlus size={16} />}>
                    {t("keybindings.newGame")}
                  </Button>
                  <Button variant="default" onClick={handleAgain} leftSection={<IconRepeat size={16} />}>
                    Again
                  </Button>
                </Group>

                <Group grow>
                  <Button variant="default" onClick={changeToAnalysisMode} leftSection={<IconZoomCheck size={16} />}>
                    Analyze
                  </Button>
                  <Button variant="default" onClick={flipBoard} leftSection={<IconArrowsExchange size={16} />}>
                    Flip
                  </Button>
                </Group>

                <Group grow>
                  <Button
                    color="red"
                    onClick={resign}
                    disabled={gameState !== "playing"}
                    leftSection={<IconFlag size={16} />}
                  >
                    Resign
                  </Button>
                  <Button variant="default" onClick={clearShapes} leftSection={<IconEraser size={16} />}>
                    {t("keybindings.clearShapes")}
                  </Button>
                </Group>
              </Stack>
            )}

            <Divider />

            <Text fw={600} size="sm">
              Opening
            </Text>
            <Text size="sm" c="dimmed">
              {openingLabel === "Empty Board"
                ? t("chess.opening.emptyBoard")
                : openingLabel === "Starting Position"
                  ? t("chess.opening.startingPosition")
                  : openingLabel || "-"}
            </Text>

            <Divider />

            <Text fw={600} size="sm">
              PGN
            </Text>

            <ScrollArea style={{ flex: 1 }} type="auto">
              <Box
                component="pre"
                style={{
                  margin: 0,
                  fontFamily:
                    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
                  fontSize: "0.8rem",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {pgn}
              </Box>
            </ScrollArea>
          </Stack>
        </Paper>
      </Box>
    </Box>
  );
}

export default function PlayVsEngineBoard() {
  return (
    <GameTimeProvider>
      <PlayVsEngineBoardContent />
    </GameTimeProvider>
  );
}
