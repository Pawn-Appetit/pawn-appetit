import {
  ActionIcon,
  Alert,
  Box,
  Button,
  Center,
  Checkbox,
  Divider,
  Group,
  InputWrapper,
  Paper,
  Portal,
  ScrollArea,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
} from "@mantine/core";
import { IconAlertCircle, IconArrowsExchange, IconCpu, IconPlus, IconUser, IconZoomCheck } from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { parseUci } from "chessops";
import { INITIAL_FEN } from "chessops/fen";
import equal from "fast-deep-equal";
import { useAtom, useAtomValue } from "jotai";
import { Suspense, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { match } from "ts-pattern";
import { useStore } from "zustand";
import { commands, events, type GoMode } from "@/bindings";
import GameInfo from "@/components/GameInfo";
import TimeInput from "@/components/TimeInput";
import { TreeStateContext } from "@/components/TreeStateContext";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import { activeTabAtom, currentGameStateAtom, currentPlayersAtom, enginesAtom, tabsAtom } from "@/state/atoms";
import { getMainLine } from "@/utils/chess";
import { positionFromFen } from "@/utils/chessops";
import type { TimeControlField } from "@/utils/clock";
import type { LocalEngine } from "@/utils/engines";
import { saveGameRecord } from "@/utils/gameRecords";
import { type GameHeaders, treeIteratorMainLine } from "@/utils/treeReducer";
import EngineSettingsForm from "../panels/analysis/EngineSettingsForm";
import ResponsiveBoard from "./ResponsiveBoard";
import ResponsiveGameAnalysis from "./ResponsiveGameAnalysis";

function EnginesSelect({
  engine,
  setEngine,
}: {
  engine: LocalEngine | null;
  setEngine: (engine: LocalEngine | null) => void;
}) {
  const navigate = useNavigate();
  const engines = useAtomValue(enginesAtom).filter((e): e is LocalEngine => e.type === "local");

  useEffect(() => {
    if (engines.length > 0 && engine === null) {
      setEngine(engines[0]);
    }
  }, [engine, engines[0], setEngine]);

  if (engines.length === 0) {
    return (
      <Stack gap="md">
        <Alert icon={<IconAlertCircle size={16} />} title="No Chess Engines Available" color="orange" variant="light">
          <Text size="sm">
            No chess engines are currently installed or detected on your system. To play against an engine, you'll need
            to install one first.
          </Text>
        </Alert>
        <Button variant="outline" size="sm" onClick={() => navigate({ to: "/engines" })}>
          Install Engine
        </Button>
      </Stack>
    );
  }

  return (
    <Suspense>
      <Select
        allowDeselect={false}
        data={engines?.map((engine) => ({
          label: engine.name,
          value: engine.path,
        }))}
        value={engine?.path ?? ""}
        onChange={(e) => {
          setEngine(engines.find((engine) => engine.path === e) ?? null);
        }}
        placeholder="Select engine"
      />
    </Suspense>
  );
}

export type OpponentSettings =
  | {
      type: "human";
      timeControl?: TimeControlField;
      name?: string;
    }
  | {
      type: "engine";
      timeControl?: TimeControlField;
      engine: LocalEngine | null;
      go: GoMode;
    };

function OpponentForm({
  sameTimeControl,
  opponent,
  setOpponent,
  setOtherOpponent,
}: {
  sameTimeControl: boolean;
  opponent: OpponentSettings;
  setOpponent: React.Dispatch<React.SetStateAction<OpponentSettings>>;
  setOtherOpponent: React.Dispatch<React.SetStateAction<OpponentSettings>>;
}) {
  const engines = useAtomValue(enginesAtom).filter((e): e is LocalEngine => e.type === "local");

  function updateType(type: "engine" | "human") {
    if (type === "human") {
      setOpponent((prev) => ({
        ...prev,
        type: "human",
        name: "Player",
      }));
    } else {
      setOpponent((prev) => ({
        ...prev,
        type: "engine",
        engine: null,
        go: {
          t: "Depth",
          c: 1,
        },
      }));
    }
  }

  return (
    <Stack flex={1}>
      <SegmentedControl
        data={[
          {
            value: "human",
            label: (
              <Center style={{ gap: 10 }}>
                <IconUser size={16} />
                <span>Human</span>
              </Center>
            ),
          },
          {
            value: "engine",
            label: (
              <Center style={{ gap: 10 }}>
                <IconCpu size={16} />
                <span>Engine</span>
                {engines.length === 0 && (
                  <ThemeIcon size="xs" color="orange" variant="light">
                    <IconAlertCircle size={10} />
                  </ThemeIcon>
                )}
              </Center>
            ),
          },
        ]}
        value={opponent.type}
        onChange={(v) => updateType(v as "human" | "engine")}
      />

      {opponent.type === "human" && (
        <TextInput
          placeholder="Name"
          value={opponent.name ?? ""}
          onChange={(e) => setOpponent((prev) => ({ ...prev, name: e.target.value }))}
        />
      )}

      {opponent.type === "engine" && (
        <EnginesSelect
          engine={opponent.engine}
          setEngine={(engine) =>
            setOpponent((prev) => ({
              ...prev,
              ...(engine?.go ? { go: engine.go } : {}),
              engine,
            }))
          }
        />
      )}

      <Divider variant="dashed" label="Time Settings" />
      <SegmentedControl
        data={["Time", "Unlimited"]}
        value={opponent.timeControl ? "Time" : "Unlimited"}
        onChange={(v) => {
          setOpponent((prev) => ({
            ...prev,
            timeControl: v === "Time" ? DEFAULT_TIME_CONTROL : undefined,
          }));
          if (sameTimeControl) {
            setOtherOpponent((prev) => ({
              ...prev,
              timeControl: v === "Time" ? DEFAULT_TIME_CONTROL : undefined,
            }));
          }
        }}
      />
      <Group grow wrap="nowrap">
        {opponent.timeControl && (
          <>
            <InputWrapper label="Time">
              <TimeInput
                defaultType="m"
                value={opponent.timeControl.seconds}
                setValue={(v) => {
                  setOpponent((prev) => ({
                    ...prev,
                    timeControl: {
                      seconds: v.t === "Time" ? v.c : 0,
                      increment: prev.timeControl?.increment ?? 0,
                    },
                  }));
                  if (sameTimeControl) {
                    setOtherOpponent((prev) => ({
                      ...prev,
                      timeControl: {
                        seconds: v.t === "Time" ? v.c : 0,
                        increment: prev.timeControl?.increment ?? 0,
                      },
                    }));
                  }
                }}
              />
            </InputWrapper>
            <InputWrapper label="Increment">
              <TimeInput
                defaultType="s"
                value={opponent.timeControl.increment ?? 0}
                setValue={(v) => {
                  setOpponent((prev) => ({
                    ...prev,
                    timeControl: {
                      seconds: prev.timeControl?.seconds ?? 0,
                      increment: v.t === "Time" ? v.c : 0,
                    },
                  }));
                  if (sameTimeControl) {
                    setOtherOpponent((prev) => ({
                      ...prev,
                      timeControl: {
                        seconds: prev.timeControl?.seconds ?? 0,
                        increment: v.t === "Time" ? v.c : 0,
                      },
                    }));
                  }
                }}
              />
            </InputWrapper>
          </>
        )}
      </Group>

      {opponent.type === "engine" && (
        <Stack>
          {opponent.engine && !opponent.timeControl && (
            <EngineSettingsForm
              engine={opponent.engine}
              remote={false}
              gameMode
              settings={{
                go: opponent.go,
                settings: opponent.engine.settings || [],
                enabled: true,
                synced: false,
              }}
              setSettings={(fn) =>
                setOpponent((prev) => {
                  if (prev.type === "human") {
                    return prev;
                  }
                  const newSettings = fn({
                    go: prev.go,
                    settings: prev.engine?.settings || [],
                    enabled: true,
                    synced: false,
                  });
                  return { ...prev, ...newSettings };
                })
              }
              minimal={true}
            />
          )}
        </Stack>
      )}
    </Stack>
  );
}

const DEFAULT_TIME_CONTROL: TimeControlField = {
  seconds: 180_000,
  increment: 2_000,
};

function BoardGame() {
  const activeTab = useAtomValue(activeTabAtom);
  const { t } = useTranslation();

  const [inputColor, setInputColor] = useState<"white" | "random" | "black">("white");

  function cycleColor() {
    setInputColor((prev) =>
      match(prev)
        .with("white", () => "black" as const)
        .with("black", () => "random" as const)
        .with("random", () => "white" as const)
        .exhaustive(),
    );
  }

  const [player1Settings, setPlayer1Settings] = useState<OpponentSettings>({
    type: "human",
    name: "Player",
    timeControl: DEFAULT_TIME_CONTROL,
  });
  const [player2Settings, setPlayer2Settings] = useState<OpponentSettings>({
    type: "human",
    name: "Player",
    timeControl: DEFAULT_TIME_CONTROL,
  });

  function getPlayers() {
    let white = inputColor === "white" ? player1Settings : player2Settings;
    let black = inputColor === "black" ? player1Settings : player2Settings;
    if (inputColor === "random") {
      white = Math.random() > 0.5 ? player1Settings : player2Settings;
      black = white === player1Settings ? player2Settings : player1Settings;
    }
    return { white, black };
  }

  const store = useContext(TreeStateContext)!;
  const root = useStore(store, (s) => s.root);
  const headers = useStore(store, (s) => s.headers);
  const setFen = useStore(store, (s) => s.setFen);
  const setHeaders = useStore(store, (s) => s.setHeaders);
  const setResult = useStore(store, (s) => s.setResult);
  const appendMove = useStore(store, (s) => s.appendMove);

  const [tabs, setTabs] = useAtom(tabsAtom);

  const boardRef = useRef(null);
  const [gameState, setGameState] = useAtom(currentGameStateAtom);
  const engines = useAtomValue(enginesAtom).filter((e): e is LocalEngine => e.type === "local");

  function changeToAnalysisMode() {
    setTabs((prev) => prev.map((tab) => (tab.value === activeTab ? { ...tab, type: "analysis" } : tab)));
  }
  const mainLine = Array.from(treeIteratorMainLine(root));
  const lastNode = mainLine[mainLine.length - 1].node;
  const moves = useMemo(() => getMainLine(root, headers.variant === "Chess960"), [root, headers]);

  const [pos, error] = useMemo(() => {
    return positionFromFen(lastNode.fen);
  }, [lastNode.fen]);

  const activeTabData = tabs?.find((tab) => tab.value === activeTab);

  useEffect(() => {
    if (activeTabData?.meta?.timeControl) {
      const { timeControl } = activeTabData.meta;
      setPlayer1Settings((prev) => ({
        ...prev,
        timeControl,
      }));
      setPlayer2Settings((prev) => ({
        ...prev,
        timeControl,
      }));
    }
  }, [activeTabData]);

  useEffect(() => {
    if (pos?.isEnd()) {
      setGameState("gameOver");
    }
  }, [pos, setGameState]);

  const [players, setPlayers] = useAtom(currentPlayersAtom);

  useEffect(() => {
    if (pos && gameState === "playing") {
      if (headers.result !== "*") {
        setGameState("gameOver");
        return;
      }
      const currentTurn = pos.turn;
      const player = currentTurn === "white" ? players.white : players.black;

      if (player.type === "engine" && player.engine) {
        commands.getBestMoves(
          currentTurn,
          player.engine.path,
          activeTab + currentTurn,
          player.timeControl
            ? {
                t: "PlayersTime",
                c: {
                  white: whiteTime ?? 0,
                  black: blackTime ?? 0,
                  winc: player.timeControl.increment ?? 0,
                  binc: player.timeControl.increment ?? 0,
                },
              }
            : player.go,
          {
            fen: root.fen,
            moves: moves,
            extraOptions: (player.engine.settings || [])
              .filter((s) => s.name !== "MultiPV")
              .map((s) => ({
                ...s,
                value: s.value?.toString() ?? "",
              })),
          },
        );
      }
    }
  }, [gameState, pos, players, headers.result, setGameState, activeTab, root.fen, moves]);

  const [whiteTime, setWhiteTime] = useState<number | null>(null);
  const [blackTime, setBlackTime] = useState<number | null>(null);

  useEffect(() => {
    const unlisten = events.bestMovesPayload.listen(({ payload }) => {
      const ev = payload.bestLines;
      if (
        payload.progress === 100 &&
        payload.engine === pos?.turn &&
        payload.tab === activeTab + pos.turn &&
        payload.fen === root.fen &&
        equal(payload.moves, moves) &&
        !pos?.isEnd()
      ) {
        appendMove({
          payload: parseUci(ev[0].uciMoves[0])!,
          clock: (pos.turn === "white" ? whiteTime : blackTime) ?? undefined,
        });
      }
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, [activeTab, appendMove, pos, root.fen, moves, whiteTime, blackTime]);

  const movable = useMemo(() => {
    if (players.white.type === "human" && players.black.type === "human") {
      return "turn";
    }
    if (players.white.type === "human") {
      return "white";
    }
    if (players.black.type === "human") {
      return "black";
    }
    return "none";
  }, [players]);

  const [sameTimeControl, setSameTimeControl] = useState(true);

  const [intervalId, setIntervalId] = useState<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (intervalId) {
      clearInterval(intervalId);
      setIntervalId(null);
    }
  }, [pos?.turn]);

  useEffect(() => {
    if (gameState === "playing" && whiteTime !== null && whiteTime <= 0) {
      setGameState("gameOver");
      setResult("0-1");
    }
  }, [gameState, whiteTime, setGameState, setResult]);

  useEffect(() => {
    if (gameState !== "playing") {
      if (intervalId) {
        clearInterval(intervalId);
        setIntervalId(null);
      }
    }
  }, [gameState, intervalId]);

  useEffect(() => {
    if (gameState === "playing" && blackTime !== null && blackTime <= 0) {
      setGameState("gameOver");
      setResult("1-0");
    }
  }, [gameState, blackTime, setGameState, setResult]);

  useEffect(() => {
    if (gameState === "gameOver" && headers.result && headers.result !== "*") {
      const record = {
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
        result: headers.result,
        timeControl: headers.time_control || `${headers.white_time_control || ""},${headers.black_time_control || ""}`,
        timestamp: Date.now(),
        moves: getMainLine(root, headers.variant === "Chess960"),
        variant: headers.variant ?? undefined,
        fen: lastNode.fen,
      };
      saveGameRecord(record);
    }
  }, [gameState, headers.result, players, root, headers, saveGameRecord]);

  function decrementTime() {
    if (gameState === "playing") {
      if (pos?.turn === "white" && whiteTime !== null) {
        setWhiteTime((prev) => prev! - 100);
      } else if (pos?.turn === "black" && blackTime !== null) {
        setBlackTime((prev) => prev! - 100);
      }
    }
  }

  function startGame() {
    setGameState("playing");

    const players = getPlayers();

    if (players.white.timeControl) {
      setWhiteTime(players.white.timeControl.seconds);
    }

    if (players.black.timeControl) {
      setBlackTime(players.black.timeControl.seconds);
    }

    setPlayers(players);

    const newHeaders: Partial<GameHeaders> = {
      white: (players.white.type === "human" ? players.white.name : players.white.engine?.name) ?? "?",
      black: (players.black.type === "human" ? players.black.name : players.black.engine?.name) ?? "?",
      time_control: undefined,
      orientation:
        players.white.type === "human" && players.black.type === "engine"
          ? "white"
          : players.white.type === "engine" && players.black.type === "human"
            ? "black"
            : headers.orientation,
    };

    if (players.white.timeControl || players.black.timeControl) {
      if (sameTimeControl && players.white.timeControl) {
        newHeaders.time_control = `${players.white.timeControl.seconds / 1000}`;
        if (players.white.timeControl.increment) {
          newHeaders.time_control += `+${players.white.timeControl.increment / 1000}`;
        }
      } else {
        if (players.white.timeControl) {
          newHeaders.white_time_control = `${players.white.timeControl.seconds / 1000}`;
          if (players.white.timeControl.increment) {
            newHeaders.white_time_control += `+${players.white.timeControl.increment / 1000}`;
          }
        }
        if (players.black.timeControl) {
          newHeaders.black_time_control = `${players.black.timeControl.seconds / 1000}`;
          if (players.black.timeControl.increment) {
            newHeaders.black_time_control += `+${players.black.timeControl.increment / 1000}`;
          }
        }
      }
    }

    setHeaders({
      ...headers,
      ...newHeaders,
      fen: root.fen,
    });

    setTabs((prev) =>
      prev.map((tab) => {
        const whiteName = players.white.type === "human" ? players.white.name : (players.white.engine?.name ?? "?");

        const blackName = players.black.type === "human" ? players.black.name : (players.black.engine?.name ?? "?");

        return tab.value === activeTab
          ? {
              ...tab,
              name: `${whiteName} vs. ${blackName}`,
            }
          : tab;
      }),
    );
  }

  useEffect(() => {
    if (gameState === "playing" && !intervalId) {
      const intervalId = setInterval(decrementTime, 100);
      if (pos?.turn === "black" && whiteTime !== null) {
        setWhiteTime((prev) => prev! + (players.white.timeControl?.increment ?? 0));
      }
      if (pos?.turn === "white" && blackTime !== null) {
        setBlackTime((prev) => {
          if (pos?.fullmoves === 1) {
            return prev!;
          }

          return prev! + (players.black.timeControl?.increment ?? 0);
        });
      }
      setIntervalId(intervalId);
    }
  }, [gameState, intervalId, pos?.turn]);

  const onePlayerIsEngine =
    (players.white.type === "engine" || players.black.type === "engine") && players.white.type !== players.black.type;

  const { layout } = useResponsiveLayout();
  const isMobileLayout = layout.chessBoard.layoutType === "mobile";

  return (
    <>
      {isMobileLayout ? (
        // Mobile layout: ResponsiveBoard handles everything, no Portal needed
        <Box style={{ width: "100%", flex: 1, overflow: "hidden" }}>
          <ResponsiveBoard
            dirty={false}
            editingMode={false}
            toggleEditingMode={() => undefined}
            viewOnly={gameState !== "playing"}
            disableVariations
            boardRef={boardRef}
            canTakeBack={onePlayerIsEngine}
            movable={movable}
            whiteTime={gameState === "playing" ? (whiteTime ?? undefined) : undefined}
            blackTime={gameState === "playing" ? (blackTime ?? undefined) : undefined}
            topBar={false}
            // Board controls props
            changeTabType={changeToAnalysisMode}
            currentTabType="play"
            // Start Game props
            startGame={startGame}
            gameState={gameState}
            startGameDisabled={error !== null}
          />
        </Box>
      ) : (
        // Desktop layout: Use Portal system with Mosaic layout
        <>
          <Portal target="#left" style={{ height: "100%" }}>
            <ResponsiveBoard
              dirty={false}
              editingMode={false}
              toggleEditingMode={() => undefined}
              viewOnly={gameState !== "playing"}
              disableVariations
              boardRef={boardRef}
              canTakeBack={onePlayerIsEngine}
              movable={movable}
              whiteTime={gameState === "playing" ? (whiteTime ?? undefined) : undefined}
              blackTime={gameState === "playing" ? (blackTime ?? undefined) : undefined}
              topBar={false}
              // Board controls props
              changeTabType={changeToAnalysisMode}
              currentTabType="play"
              // Start Game props
              startGame={startGame}
              gameState={gameState}
              startGameDisabled={error !== null}
            />
          </Portal>
          <Portal target="#topRight" style={{ height: "100%", overflow: "hidden" }}>
            <Paper withBorder shadow="sm" p="md" h="100%">
              {gameState === "settingUp" && (
                <ScrollArea h="100%" offsetScrollbars>
                  <Stack>
                    <Group>
                      <Text flex={1} ta="center" fz="lg" fw="bold">
                        {match(inputColor)
                          .with("white", () => t("chess.white"))
                          .with("random", () => t("chess.random"))
                          .with("black", () => t("chess.black"))
                          .exhaustive()}
                      </Text>
                      <ActionIcon onClick={cycleColor}>
                        <IconArrowsExchange />
                      </ActionIcon>
                      <Text flex={1} ta="center" fz="lg" fw="bold">
                        {match(inputColor)
                          .with("white", () => t("chess.black"))
                          .with("random", () => t("chess.random"))
                          .with("black", () => t("chess.white"))
                          .exhaustive()}
                      </Text>
                    </Group>
                    <Box flex={1}>
                      <Group style={{ alignItems: "start" }}>
                        <OpponentForm
                          sameTimeControl={sameTimeControl}
                          opponent={player1Settings}
                          setOpponent={setPlayer1Settings}
                          setOtherOpponent={setPlayer2Settings}
                        />
                        <Divider orientation="vertical" />
                        <OpponentForm
                          sameTimeControl={sameTimeControl}
                          opponent={player2Settings}
                          setOpponent={setPlayer2Settings}
                          setOtherOpponent={setPlayer1Settings}
                        />
                      </Group>
                    </Box>

                    <Group justify="flex-start">
                      <Checkbox
                        label="Same time control"
                        checked={sameTimeControl}
                        onChange={(e) => setSameTimeControl(e.target.checked)}
                      />
                    </Group>
                  </Stack>
                </ScrollArea>
              )}
              {(gameState === "playing" || gameState === "gameOver") && (
                <Stack h="100%">
                  <Box flex={1}>
                    <GameInfo headers={headers} />
                  </Box>
                  <Group grow>
                    <Button
                      onClick={() => {
                        setGameState("settingUp");
                        setWhiteTime(null);
                        setBlackTime(null);
                        setFen(INITIAL_FEN);
                        setHeaders({
                          ...headers,
                          result: "*",
                        });
                      }}
                      leftSection={<IconPlus />}
                    >
                      New Game
                    </Button>
                    <Button variant="default" onClick={() => changeToAnalysisMode()} leftSection={<IconZoomCheck />}>
                      Analyze
                    </Button>
                  </Group>
                </Stack>
              )}
            </Paper>
          </Portal>
        </>
      )}
      <ResponsiveGameAnalysis topBar />
    </>
  );
}

export default BoardGame;
