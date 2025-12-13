/**
 * PlayVsEngineBoard - Specialized component for playing against an engine.
 *
 * Layout: GAME mode
 * - Board centered
 * - Left panel: game headers/info
 * - Right panel: clocks + controls + opening + PGN
 */
import { Box, Button, Divider, Group, Paper, ScrollArea, Stack, Text } from "@mantine/core";
import { IconArrowsExchange, IconPlayerStop, IconPlus, IconZoomCheck } from "@tabler/icons-react";
import { useAtom, useAtomValue } from "jotai";
import { useContext, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Mosaic } from "react-mosaic-component";
import { useStore } from "zustand";
import { TreeStateContext } from "@/components/TreeStateContext";
import GameInfo from "@/components/GameInfo";
import Clock from "@/components/Clock";
import { activeTabAtom, currentGameStateAtom, currentPlayersAtom, tabsAtom } from "@/state/atoms";
import { positionFromFen } from "@/utils/chessops";
import { getPGN } from "@/utils/chess";
import { treeIteratorMainLine } from "@/utils/treeReducer";
import { useEngineMoves } from "./hooks/useEngineMoves";
import { GameTimeProvider, useGameTime } from "./GameTimeContext";
import ResponsiveBoard from "./ResponsiveBoard";
import BoardGame from "./BoardGame";
import { createFullLayout, DEFAULT_MOSAIC_LAYOUT } from "../constants";

function PlayVsEngineBoardContent() {
  const { t } = useTranslation();
  const activeTab = useAtomValue(activeTabAtom);
  const [gameState, setGameState] = useAtom(currentGameStateAtom);
  const [players] = useAtom(currentPlayersAtom);
  const [, setTabs] = useAtom(tabsAtom);
  const boardRef = useRef<HTMLDivElement | null>(null);

  const store = useContext(TreeStateContext)!;
  const root = useStore(store, (s) => s.root);
  const headers = useStore(store, (s) => s.headers);
  const setHeaders = useStore(store, (s) => s.setHeaders);

  const { whiteTime, blackTime } = useGameTime();

  const mainLine = useMemo(() => Array.from(treeIteratorMainLine(root)), [root]);
  const lastNode = useMemo(() => mainLine[mainLine.length - 1].node, [mainLine]);
  const [pos] = useMemo(() => positionFromFen(lastNode.fen), [lastNode.fen]);

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

  const openingLabel = useMemo(() => {
    const h = headers as any;
    return (
      h.opening ??
      h.Opening ??
      h.opening_name ??
      h.openingName ??
      h.eco ??
      h.ECO ??
      null
    ) as string | null;
  }, [headers]);

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

  const handleNewGame = () => setGameState("settingUp");

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

  const resign = () => {
    if (gameState !== "playing") return;

    const humanColor =
      players.white.type === "human"
        ? "white"
        : players.black.type === "human"
          ? "black"
          : (pos?.turn ?? "white");

    const result = humanColor === "white" ? "0-1" : "1-0";

    // Set result en headers para que useEngineMoves deje de pedir jugadas
    setHeaders({
      ...headers,
      fen: root.fen, // conservar posición actual
      result,
    });

    setGameState("gameOver");
  };

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
            <Text fw={700}>Game info</Text>
            <Divider />
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

            {(whiteTime !== null || blackTime !== null) && (
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
              </>
            )}

            <Divider />

            <Text fw={600} size="sm">
              Controls
            </Text>

            {(gameState === "playing" || gameState === "gameOver") && (
              <Stack gap="xs">
                <Group grow>
                  <Button onClick={handleNewGame} leftSection={<IconPlus size={16} />}>
                    {t("keybindings.newGame")}
                  </Button>
                  <Button variant="default" onClick={changeToAnalysisMode} leftSection={<IconZoomCheck size={16} />}>
                    {t("keybindings.analyzePosition")}
                  </Button>
                </Group>

                <Group grow>
                  <Button variant="default" onClick={flipBoard} leftSection={<IconArrowsExchange size={16} />}>
                    Flip
                  </Button>
                  <Button color="red" onClick={resign} disabled={gameState !== "playing"} leftSection={<IconPlayerStop size={16} />}>
                    Resign
                  </Button>
                </Group>
              </Stack>
            )}

            <Divider />

            <Text fw={600} size="sm">
              Opening
            </Text>
            <Text size="sm" c="dimmed">
              {openingLabel ?? "-"}
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
