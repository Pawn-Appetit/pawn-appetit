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
import type { Piece } from "chessground/types";
import { parseUci } from "chessops";
import { INITIAL_FEN } from "chessops/fen";
import equal from "fast-deep-equal";
import { useAtom, useAtomValue } from "jotai";
import {
  type ChangeEvent,
  type Dispatch,
  type SetStateAction,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { match } from "ts-pattern";
import { useStore } from "zustand";
import { commands, events, type GoMode, type Outcome } from "@/bindings";
import GameInfo from "@/components/GameInfo";
import MoveControls from "@/components/MoveControls";
import EngineSettingsForm from "@/components/panels/analysis/EngineSettingsForm";
import TimeInput from "@/components/TimeInput";
import { TreeStateContext } from "@/components/TreeStateContext";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import {
  activeTabAtom,
  currentGameStateAtom,
  currentPlayersAtom,
  enginesAtom,
  type GameState,
  tabsAtom,
} from "@/state/atoms";
import { getMainLine } from "@/utils/chess";
import { positionFromFen } from "@/utils/chessops";
import type { TimeControlField } from "@/utils/clock";
import type { LocalEngine } from "@/utils/engines";
import { saveGameRecord } from "@/utils/gameRecords";
import { type GameHeaders, treeIteratorMainLine } from "@/utils/treeReducer";
import GameNotationWrapper from "./GameNotationWrapper";
import ResponsiveBoard from "./ResponsiveBoard";

const DEFAULT_TIME_CONTROL: TimeControlField = {
  seconds: 180_000,
  increment: 2_000,
};

const CLOCK_UPDATE_INTERVAL = 100; // ms

type ColorChoice = "white" | "random" | "black";

interface EnginesSelectProps {
  engine: LocalEngine | null;
  setEngine: (engine: LocalEngine | null) => void;
}

function EnginesSelect({ engine, setEngine }: EnginesSelectProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const engines = useAtomValue(enginesAtom).filter((e): e is LocalEngine => e.type === "local");

  useEffect(() => {
    if (engines.length > 0 && engine === null) {
      setEngine(engines[0]);
    }
  }, [engine, engines, setEngine]);

  if (engines.length === 0) {
    return (
      <Stack gap="md">
        <Alert icon={<IconAlertCircle size={16} />} title={t("game.noEnginesAvailable")} color="orange" variant="light">
          <Text size="sm">{t("game.noEnginesAvailableDesc")}</Text>
        </Alert>
        <Button variant="outline" size="sm" onClick={() => navigate({ to: "/engines" })}>
          {t("game.installEngine")}
        </Button>
      </Stack>
    );
  }

  const engineOptions = useMemo(() => engines.map((engine) => ({ label: engine.name, value: engine.path })), [engines]);

  const handleEngineChange = useCallback(
    (path: string | null) => {
      setEngine(engines.find((engine) => engine.path === path) ?? null);
    },
    [engines, setEngine],
  );

  return (
    <Suspense>
      <Select
        allowDeselect={false}
        data={engineOptions}
        value={engine?.path ?? ""}
        onChange={handleEngineChange}
        placeholder={t("game.selectEngine")}
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

interface OpponentFormProps {
  sameTimeControl: boolean;
  opponent: OpponentSettings;
  setOpponent: Dispatch<SetStateAction<OpponentSettings>>;
  setOtherOpponent: Dispatch<SetStateAction<OpponentSettings>>;
}

function OpponentForm({ sameTimeControl, opponent, setOpponent, setOtherOpponent }: OpponentFormProps) {
  const { t } = useTranslation();
  const engines = useAtomValue(enginesAtom).filter((e): e is LocalEngine => e.type === "local");

  const updateType = useCallback(
    (type: "engine" | "human") => {
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
          go: { t: "Depth", c: 1 },
        }));
      }
    },
    [setOpponent],
  );

  const updateTimeControl = useCallback(
    (timeControl: TimeControlField | undefined) => {
      setOpponent((prev) => ({ ...prev, timeControl }));
      if (sameTimeControl) {
        setOtherOpponent((prev) => ({ ...prev, timeControl }));
      }
    },
    [sameTimeControl, setOpponent, setOtherOpponent],
  );

  const handleTimeControlToggle = useCallback(
    (v: string) => {
      updateTimeControl(v === "Time" ? DEFAULT_TIME_CONTROL : undefined);
    },
    [updateTimeControl],
  );

  const handleTimeChange = useCallback(
    (value: GoMode) => {
      const seconds = value.t === "Time" ? value.c : 0;
      setOpponent((prev) => ({
        ...prev,
        timeControl: {
          seconds,
          increment: prev.timeControl?.increment ?? 0,
        },
      }));
      if (sameTimeControl) {
        setOtherOpponent((prev) => ({
          ...prev,
          timeControl: {
            seconds,
            increment: prev.timeControl?.increment ?? 0,
          },
        }));
      }
    },
    [sameTimeControl, setOpponent, setOtherOpponent],
  );

  const handleIncrementChange = useCallback(
    (value: GoMode) => {
      const increment = value.t === "Time" ? value.c : 0;
      setOpponent((prev) => ({
        ...prev,
        timeControl: {
          seconds: prev.timeControl?.seconds ?? 0,
          increment,
        },
      }));
      if (sameTimeControl) {
        setOtherOpponent((prev) => ({
          ...prev,
          timeControl: {
            seconds: prev.timeControl?.seconds ?? 0,
            increment,
          },
        }));
      }
    },
    [sameTimeControl, setOpponent, setOtherOpponent],
  );

  return (
    <Stack flex={1}>
      <SegmentedControl
        data={[
          {
            value: "human",
            label: (
              <Center style={{ gap: 10 }}>
                <IconUser size={16} />
                <span>{t("board.human")}</span>
              </Center>
            ),
          },
          {
            value: "engine",
            label: (
              <Center style={{ gap: 10 }}>
                <IconCpu size={16} />
                <span>{t("common.engine")}</span>
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
          placeholder={t("common.namePlaceholder")}
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

      <Divider variant="dashed" label={t("game.timeSettings")} />
      <SegmentedControl
        data={[t("game.timeControl"), t("game.unlimited")]}
        value={opponent.timeControl ? t("game.timeControl") : t("game.unlimited")}
        onChange={handleTimeControlToggle}
      />
      <Group grow wrap="nowrap">
        {opponent.timeControl && (
          <>
            <InputWrapper label={t("game.time")}>
              <TimeInput defaultType="m" value={opponent.timeControl.seconds} setValue={handleTimeChange} />
            </InputWrapper>
            <InputWrapper label={t("game.increment")}>
              <TimeInput defaultType="s" value={opponent.timeControl.increment ?? 0} setValue={handleIncrementChange} />
            </InputWrapper>
          </>
        )}
      </Group>

      {opponent.type === "engine" && opponent.engine && !opponent.timeControl && (
        <Stack>
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
                if (prev.type === "human") return prev;
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
        </Stack>
      )}
    </Stack>
  );
}

function useClockTimer(
  gameState: string,
  pos: any,
  whiteTime: number | null,
  blackTime: number | null,
  setWhiteTime: Dispatch<SetStateAction<number | null>>,
  setBlackTime: Dispatch<SetStateAction<number | null>>,
  players: any,
  setGameState: (state: GameState) => void,
  setResult: (result: Outcome) => void,
) {
  const [intervalId, setIntervalId] = useState<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (intervalId) {
      clearInterval(intervalId);
      setIntervalId(null);
    }
  }, [pos?.turn]);

  useEffect(() => {
    if (gameState === "playing") {
      if (whiteTime !== null && whiteTime <= 0) {
        setGameState("gameOver");
        setResult("0-1");
      } else if (blackTime !== null && blackTime <= 0) {
        setGameState("gameOver");
        setResult("1-0");
      }
    }
  }, [gameState, whiteTime, blackTime, setGameState, setResult]);

  useEffect(() => {
    if (gameState !== "playing" && intervalId) {
      clearInterval(intervalId);
      setIntervalId(null);
    }
  }, [gameState, intervalId]);

  useEffect(() => {
    if (gameState === "playing" && !intervalId) {
      const decrementTime = () => {
        if (pos?.turn === "white" && whiteTime !== null) {
          setWhiteTime((prev) => prev! - CLOCK_UPDATE_INTERVAL);
        } else if (pos?.turn === "black" && blackTime !== null) {
          setBlackTime((prev) => prev! - CLOCK_UPDATE_INTERVAL);
        }
      };

      if (pos?.turn === "black" && whiteTime !== null) {
        setWhiteTime((prev) => prev! + (players.white.timeControl?.increment ?? 0));
      }
      if (pos?.turn === "white" && blackTime !== null && pos?.fullmoves !== 1) {
        setBlackTime((prev) => prev! + (players.black.timeControl?.increment ?? 0));
      }

      const id = setInterval(decrementTime, CLOCK_UPDATE_INTERVAL);
      setIntervalId(id);
    }
  }, [gameState, intervalId, pos?.turn, pos?.fullmoves, whiteTime, blackTime, players, setWhiteTime, setBlackTime]);
}

function BoardGame() {
  const activeTab = useAtomValue(activeTabAtom);
  const { t } = useTranslation();

  const [inputColor, setInputColor] = useState<ColorChoice>("white");
  const [viewPawnStructure, setViewPawnStructure] = useState(false);
  const [selectedPiece, setSelectedPiece] = useState<Piece | null>(null);
  const [sameTimeControl, setSameTimeControl] = useState(true);

  const cycleColor = useCallback(() => {
    setInputColor((prev) =>
      match(prev)
        .with("white", () => "black" as const)
        .with("black", () => "random" as const)
        .with("random", () => "white" as const)
        .exhaustive(),
    );
  }, []);

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

  const getPlayers = useCallback(() => {
    let white = inputColor === "white" ? player1Settings : player2Settings;
    let black = inputColor === "black" ? player1Settings : player2Settings;
    if (inputColor === "random") {
      white = Math.random() > 0.5 ? player1Settings : player2Settings;
      black = white === player1Settings ? player2Settings : player1Settings;
    }
    return { white, black };
  }, [inputColor, player1Settings, player2Settings]);

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
  const [players, setPlayers] = useAtom(currentPlayersAtom);
  const engines = useAtomValue(enginesAtom).filter((e): e is LocalEngine => e.type === "local");

  const [whiteTime, setWhiteTime] = useState<number | null>(null);
  const [blackTime, setBlackTime] = useState<number | null>(null);

  const changeToAnalysisMode = useCallback(() => {
    setTabs((prev) => prev.map((tab) => (tab.value === activeTab ? { ...tab, type: "analysis" } : tab)));
  }, [activeTab, setTabs]);

  const mainLine = Array.from(treeIteratorMainLine(root));
  const lastNode = mainLine[mainLine.length - 1].node;
  const moves = useMemo(() => getMainLine(root, headers.variant === "Chess960"), [root, headers.variant]);

  const [pos, error] = useMemo(() => positionFromFen(lastNode.fen), [lastNode.fen]);

  const activeTabData = tabs?.find((tab) => tab.value === activeTab);

  useEffect(() => {
    if (activeTabData?.meta?.timeControl) {
      const { timeControl } = activeTabData.meta;
      setPlayer1Settings((prev) => ({ ...prev, timeControl }));
      setPlayer2Settings((prev) => ({ ...prev, timeControl }));
    }
  }, [activeTabData]);

  useEffect(() => {
    if (pos?.isEnd()) {
      setGameState("gameOver");
    }
  }, [pos, setGameState]);

  useEffect(() => {
    if (pos && gameState === "playing" && headers.result === "*") {
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
              .map((s) => ({ ...s, value: s.value?.toString() ?? "" })),
          },
        );
      }
    }
  }, [gameState, pos, players, headers.result, activeTab, root.fen, moves, whiteTime, blackTime]);

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
    if (players.white.type === "human" && players.black.type === "human") return "turn";
    if (players.white.type === "human") return "white";
    if (players.black.type === "human") return "black";
    return "none";
  }, [players]);

  useClockTimer(gameState, pos, whiteTime, blackTime, setWhiteTime, setBlackTime, players, setGameState, setResult);

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
  }, [gameState, headers, players, root, lastNode.fen]);

  const startGame = useCallback(() => {
    setGameState("playing");

    const newPlayers = getPlayers();

    if (newPlayers.white.timeControl) {
      setWhiteTime(newPlayers.white.timeControl.seconds);
    }

    if (newPlayers.black.timeControl) {
      setBlackTime(newPlayers.black.timeControl.seconds);
    }

    setPlayers(newPlayers);

    const newHeaders: Partial<GameHeaders> = {
      white: (newPlayers.white.type === "human" ? newPlayers.white.name : newPlayers.white.engine?.name) ?? "?",
      black: (newPlayers.black.type === "human" ? newPlayers.black.name : newPlayers.black.engine?.name) ?? "?",
      time_control: undefined,
      orientation:
        newPlayers.white.type === "human" && newPlayers.black.type === "engine"
          ? "white"
          : newPlayers.white.type === "engine" && newPlayers.black.type === "human"
            ? "black"
            : headers.orientation,
    };

    if (newPlayers.white.timeControl || newPlayers.black.timeControl) {
      if (sameTimeControl && newPlayers.white.timeControl) {
        newHeaders.time_control = `${newPlayers.white.timeControl.seconds / 1000}`;
        if (newPlayers.white.timeControl.increment) {
          newHeaders.time_control += `+${newPlayers.white.timeControl.increment / 1000}`;
        }
      } else {
        if (newPlayers.white.timeControl) {
          newHeaders.white_time_control = `${newPlayers.white.timeControl.seconds / 1000}`;
          if (newPlayers.white.timeControl.increment) {
            newHeaders.white_time_control += `+${newPlayers.white.timeControl.increment / 1000}`;
          }
        }
        if (newPlayers.black.timeControl) {
          newHeaders.black_time_control = `${newPlayers.black.timeControl.seconds / 1000}`;
          if (newPlayers.black.timeControl.increment) {
            newHeaders.black_time_control += `+${newPlayers.black.timeControl.increment / 1000}`;
          }
        }
      }
    }

    setHeaders({ ...headers, ...newHeaders, fen: root.fen });

    setTabs((prev) =>
      prev.map((tab) => {
        const whiteName =
          newPlayers.white.type === "human" ? newPlayers.white.name : (newPlayers.white.engine?.name ?? "?");
        const blackName =
          newPlayers.black.type === "human" ? newPlayers.black.name : (newPlayers.black.engine?.name ?? "?");
        return tab.value === activeTab ? { ...tab, name: `${whiteName} vs. ${blackName}` } : tab;
      }),
    );
  }, [activeTab, getPlayers, headers, root.fen, sameTimeControl, setGameState, setHeaders, setPlayers, setTabs]);

  const handleNewGame = useCallback(() => {
    setGameState("settingUp");
    setWhiteTime(null);
    setBlackTime(null);
    setFen(INITIAL_FEN);
    setHeaders({ ...headers, result: "*" });
  }, [headers, setFen, setGameState, setHeaders]);

  const handleSameTimeControlChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const isChecked = e.target.checked;
      setSameTimeControl(isChecked);

      if (isChecked) {
        setPlayer2Settings((prev) => ({
          ...prev,
          timeControl: player1Settings.timeControl,
        }));
      }
    },
    [player1Settings.timeControl],
  );

  const onePlayerIsEngine =
    (players.white.type === "engine" || players.black.type === "engine") && players.white.type !== players.black.type;

  const { layout } = useResponsiveLayout();
  const isMobileLayout = layout.chessBoard.layoutType === "mobile";

  const startGameDisabled =
    ((player1Settings.type === "engine" || player2Settings.type === "engine") && engines.length === 0) ||
    error !== null ||
    gameState !== "settingUp";

  return (
    <>
      {isMobileLayout ? (
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
            viewPawnStructure={viewPawnStructure}
            setViewPawnStructure={setViewPawnStructure}
            selectedPiece={selectedPiece}
            setSelectedPiece={setSelectedPiece}
            changeTabType={changeToAnalysisMode}
            currentTabType="play"
            startGame={startGame}
            gameState={gameState}
            startGameDisabled={error !== null}
          />
        </Box>
      ) : (
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
              viewPawnStructure={viewPawnStructure}
              setViewPawnStructure={setViewPawnStructure}
              selectedPiece={selectedPiece}
              setSelectedPiece={setSelectedPiece}
              changeTabType={changeToAnalysisMode}
              currentTabType="play"
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
                        label={t("game.sameTimeControl")}
                        checked={sameTimeControl}
                        onChange={handleSameTimeControlChange}
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
                    <Button onClick={handleNewGame} leftSection={<IconPlus />}>
                      New Game
                    </Button>
                    <Button variant="default" onClick={changeToAnalysisMode} leftSection={<IconZoomCheck />}>
                      Analyze
                    </Button>
                  </Group>
                </Stack>
              )}
            </Paper>
          </Portal>
        </>
      )}
      <GameNotationWrapper topBar>
        <MoveControls
          readOnly
          currentTabType="play"
          startGame={startGame}
          gameState={gameState}
          startGameDisabled={startGameDisabled}
        />
      </GameNotationWrapper>
    </>
  );
}

export default BoardGame;
