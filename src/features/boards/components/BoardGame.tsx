import type { Piece } from "@lichess-org/chessground/types";
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
import { notifications } from "@mantine/notifications";
import {
  IconAlertCircle,
  IconArrowsExchange,
  IconCheck,
  IconCpu,
  IconPlus,
  IconPuzzle,
  IconUser,
  IconZoomCheck,
} from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { save } from "@tauri-apps/plugin-dialog";
import { INITIAL_FEN } from "chessops/fen";
import { makeSan } from "chessops/san";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
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
import { commands, type GoMode, type Outcome } from "@/bindings";
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
  type GameState,
  loadableEnginesAtom,
  tabsAtom,
} from "@/state/atoms";
import { getMainLine, getMoveText, getPGN } from "@/utils/chess";
import { positionFromFen } from "@/utils/chessops";
import type { TimeControlField } from "@/utils/clock";
import { getDocumentDir } from "@/utils/documentDir";
import type { LocalEngine } from "@/utils/engines";
import { createFile } from "@/utils/files";
import { formatDateToPGN } from "@/utils/format";
import { type GameRecord, saveGameRecord } from "@/utils/gameRecords";
import { createTab } from "@/utils/tabs";
import { type GameHeaders, type TreeNode, treeIteratorMainLine } from "@/utils/treeReducer";
import GameNotationWrapper from "./GameNotationWrapper";
import { useGameTime } from "./GameTimeContext";
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
  engines: LocalEngine[];
  enginesState: string;
}

function EnginesSelect({ engine, setEngine, engines = [], enginesState }: EnginesSelectProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const engineOptions = useMemo(
    () => engines?.map((engine) => ({ label: engine.name, value: engine.path })),
    [engines],
  );

  const handleEngineChange = useCallback(
    (path: string | null) => {
      setEngine(engines?.find((engine) => engine.path === path) ?? null);
    },
    [engines, setEngine],
  );

  useEffect(() => {
    if (engines.length > 0 && engine === null) {
      setEngine(engines[0]);
    }
  }, [engine, engines, setEngine]);

  if (enginesState !== "loading" && engines.length === 0) {
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
  engines: LocalEngine[];
  enginesState: string;
}

function OpponentForm({
  sameTimeControl,
  opponent,
  setOpponent,
  setOtherOpponent,
  engines = [],
  enginesState,
}: OpponentFormProps) {
  const { t } = useTranslation();

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
                {enginesState !== "loading" && engines.length === 0 && (
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
          engines={engines}
          enginesState={enginesState}
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

  // Track previous turn to detect turn changes
  const prevTurnRef = useRef<"white" | "black" | null>(null);
  const incrementAppliedRef = useRef<string>("");
  const whiteTimeRef = useRef(whiteTime);
  const blackTimeRef = useRef(blackTime);

  // Keep refs in sync with state
  useEffect(() => {
    whiteTimeRef.current = whiteTime;
    blackTimeRef.current = blackTime;
  }, [whiteTime, blackTime]);

  // Clear interval and apply increment when turn changes
  useEffect(() => {
    if (gameState === "playing" && pos?.turn) {
      const currentTurn = pos.turn;
      const prevTurn = prevTurnRef.current;
      const turnKey = `${prevTurn}-${currentTurn}-${pos.fullmoves}`;

      // If turn changed, clear interval and apply increment
      if (prevTurn !== null && prevTurn !== currentTurn && incrementAppliedRef.current !== turnKey) {
        // Clear existing interval
        if (intervalId) {
          clearInterval(intervalId);
          setIntervalId(null);
        }

        // Apply increment to the player who just moved (previous turn)
        // Use refs to avoid dependency on whiteTime/blackTime
        if (prevTurn === "white" && whiteTimeRef.current !== null && pos.fullmoves > 1) {
          setWhiteTime((prev) => (prev ?? 0) + (players.white.timeControl?.increment ?? 0));
        } else if (prevTurn === "black" && blackTimeRef.current !== null) {
          setBlackTime((prev) => (prev ?? 0) + (players.black.timeControl?.increment ?? 0));
        }

        incrementAppliedRef.current = turnKey;
      }

      // Update previous turn
      prevTurnRef.current = currentTurn;
    }
  }, [gameState, pos?.turn, pos?.fullmoves, intervalId, players, setWhiteTime, setBlackTime]);

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

  // Start timer for current turn
  useEffect(() => {
    if (gameState === "playing" && pos && !intervalId) {
      const decrementTime = () => {
        if (pos.turn === "white" && whiteTime !== null) {
          setWhiteTime((prev) => {
            const current = prev ?? 0;
            return current > 0 ? current - CLOCK_UPDATE_INTERVAL : 0;
          });
        } else if (pos.turn === "black" && blackTime !== null) {
          setBlackTime((prev) => {
            const current = prev ?? 0;
            return current > 0 ? current - CLOCK_UPDATE_INTERVAL : 0;
          });
        }
      };

      const id = setInterval(decrementTime, CLOCK_UPDATE_INTERVAL);
      setIntervalId(id);
    }
  }, [gameState, intervalId, pos?.turn, setWhiteTime, setBlackTime, pos]);
}

function BoardGame() {
  const activeTab = useAtomValue(activeTabAtom);
  const { t } = useTranslation();

  // Load saved game settings from localStorage
  const loadGameSettings = useCallback(() => {
    try {
      const saved = localStorage.getItem("boardGameSettings");
      if (saved) {
        const settings = JSON.parse(saved);
        return {
          inputColor: settings.inputColor || "white",
          sameTimeControl: settings.sameTimeControl ?? true,
          customFen: settings.customFen || "",
          player1Settings: settings.player1Settings || {
            type: "human",
            name: "Player",
            timeControl: DEFAULT_TIME_CONTROL,
          },
          player2Settings: settings.player2Settings || {
            type: "human",
            name: "Player",
            timeControl: DEFAULT_TIME_CONTROL,
          },
        };
      }
    } catch (e) {
      // Failed to load game settings
    }
    return {
      inputColor: "white" as ColorChoice,
      sameTimeControl: true,
      customFen: "",
      player1Settings: {
        type: "human" as const,
        name: "Player",
        timeControl: DEFAULT_TIME_CONTROL,
      },
      player2Settings: {
        type: "human" as const,
        name: "Player",
        timeControl: DEFAULT_TIME_CONTROL,
      },
    };
  }, []);

  // Save game settings to localStorage
  const saveGameSettings = useCallback(
    (settings: {
      inputColor: ColorChoice;
      sameTimeControl: boolean;
      customFen: string;
      player1Settings: OpponentSettings;
      player2Settings: OpponentSettings;
    }) => {
      try {
        localStorage.setItem("boardGameSettings", JSON.stringify(settings));
      } catch (e) {
        // Failed to save game settings
      }
    },
    [],
  );

  const savedSettings = loadGameSettings();
  const [inputColor, setInputColor] = useState<ColorChoice>(savedSettings.inputColor);
  const [viewPawnStructure, setViewPawnStructure] = useState(false);
  const [selectedPiece, setSelectedPiece] = useState<Piece | null>(null);
  const [sameTimeControl, setSameTimeControl] = useState(savedSettings.sameTimeControl);
  const [customFen, setCustomFen] = useState<string>(savedSettings.customFen);
  const [fenError, setFenError] = useState<string | null>(null);
  const [isApplyingFen, setIsApplyingFen] = useState(false);
  const fenInputRef = useRef<HTMLInputElement>(null);

  const cycleColor = useCallback(() => {
    setInputColor((prev) =>
      match(prev)
        .with("white", () => "black" as const)
        .with("black", () => "random" as const)
        .with("random", () => "white" as const)
        .exhaustive(),
    );
  }, []);

  const validateFen = useCallback(
    (fen: string) => {
      if (!fen.trim()) {
        setFenError(null);
        return true;
      }
      const [pos, err] = positionFromFen(fen);
      if (err || !pos) {
        setFenError(t("game.invalidFen") || "Invalid FEN position");
        return false;
      }
      setFenError(null);
      return true;
    },
    [t],
  );

  const [player1Settings, setPlayer1Settings] = useState<OpponentSettings>(savedSettings.player1Settings);
  const [player2Settings, setPlayer2Settings] = useState<OpponentSettings>(savedSettings.player2Settings);

  // Save settings with debounce (excluding when manually applying FEN)
  const saveTimeoutRef = useRef<any | null>(null);

  useEffect(() => {
    // Skip auto-save when manually applying FEN to avoid conflicts
    if (isApplyingFen) {
      return;
    }

    // Clear any pending save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      saveGameSettings({
        inputColor,
        sameTimeControl,
        customFen,
        player1Settings,
        player2Settings,
      });
      saveTimeoutRef.current = null;
    }, 300);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    };
  }, [inputColor, sameTimeControl, customFen, player1Settings, player2Settings, saveGameSettings, isApplyingFen]);

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
  const setActiveTab = useSetAtom(activeTabAtom);
  const boardRef = useRef(null);
  const [gameState, setGameState] = useAtom(currentGameStateAtom);
  const [players, setPlayers] = useAtom(currentPlayersAtom);

  const loadableEngines = useAtomValue(loadableEnginesAtom);
  const enginesState = loadableEngines.state;

  const engines = useMemo(() => {
    return enginesState === "hasData" ? loadableEngines.data.filter((e): e is LocalEngine => e.type === "local") : [];
  }, [loadableEngines, enginesState]);

  // Use GameTimeContext if available (from PlayVsEngineBoard), otherwise use local state
  const [localWhiteTime, setLocalWhiteTime] = useState<number | null>(null);
  const [localBlackTime, setLocalBlackTime] = useState<number | null>(null);

  // Try to use context, fallback to local state
  let whiteTime: number | null = localWhiteTime;
  let setWhiteTime: Dispatch<SetStateAction<number | null>> = setLocalWhiteTime;
  let blackTime: number | null = localBlackTime;
  let setBlackTime: Dispatch<SetStateAction<number | null>> = setLocalBlackTime;

  const gameTime = useGameTime();

  if (gameTime) {
    whiteTime = gameTime.whiteTime;
    setWhiteTime = gameTime.setWhiteTime;
    blackTime = gameTime.blackTime;
    setBlackTime = gameTime.setBlackTime;
  }

  const changeToAnalysisMode = useCallback(() => {
    setTabs((prev) => prev.map((tab) => (tab.value === activeTab ? { ...tab, type: "analysis" } : tab)));
  }, [activeTab, setTabs]);

  const mainLine = useMemo(() => Array.from(treeIteratorMainLine(root)), [root]);
  const lastNode = useMemo(() => mainLine[mainLine.length - 1].node, [mainLine]);
  const moves = useMemo(() => getMainLine(root, headers.variant === "Chess960"), [root, headers.variant]);

  // Use root and position to ensure pos updates when moves are made
  const position = useStore(store, (s) => s.position);
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

        // Let the Rust code handle engine reuse/creation
        // The Rust manager checks if an engine exists and reuses it if options match
        // If options don't match, it stops and reconfigures the existing engine
        commands
          .getBestMoves(
            currentTurn,
            engine.path,
            tabKey,
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
              extraOptions: (engine.settings || [])
                .filter((s) => s.name !== "MultiPV")
                .map((s) => ({ ...s, value: s.value?.toString() ?? "" })),
            },
          )
          .catch(() => {
            // Clear the ref on error so we can retry
            engineRequestRef.current = null;
          });
      } else {
        // Clear ref if it's not an engine turn
        engineRequestRef.current = null;
      }
    } else if (gameState !== "playing" && activeTab) {
      // Kill engines when game is not playing to prevent multiple instances
      // But only if we're not transitioning to playing (handled by startGame)
      engineRequestRef.current = null;
    }
  }, [gameState, pos, players, headers.result, activeTab, root.fen, moves, whiteTime, blackTime]);

  // Store current moves and root.fen in refs to avoid recreating listener
  const movesRef = useRef<string[]>(moves);
  const rootFenRef = useRef<string>(root.fen);
  useEffect(() => {
    movesRef.current = moves;
    rootFenRef.current = root.fen;
  }, [moves, root.fen]);

  useEffect(() => {
    const unlisten = events.bestMovesPayload.listen(({ payload }) => {
      // Only process moves when game is actively playing
      if (gameState !== "playing" || !activeTab || !pos) {
        return;
      }

      // Clear the engine request ref when we receive any response for this tab/turn
      // This allows new requests even if the payload doesn't match exactly
      if (payload.tab === activeTab + pos.turn) {
        engineRequestRef.current = null;
      }

      const ev = payload.bestLines;
      // CRITICAL: The payload.fen is the INITIAL FEN (root.fen) that was sent to getBestMoves
      // The backend sends proc.options.fen which is root.fen, not the final FEN after moves
      // So we must compare with root.fen, not lastNode.fen
      // The moves array in the payload should match the current moves array
      // Using refs to avoid recreating the listener on every change
      if (
        payload.progress === 100 &&
        payload.engine === pos.turn &&
        payload.tab === activeTab + pos.turn &&
        payload.fen === rootFenRef.current && // Backend sends root.fen in payload, not final FEN
        equal(payload.moves, movesRef.current) && // Use ref to avoid listener recreation
        !pos.isEnd()
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
  }, [gameState, activeTab, appendMove, pos, whiteTime, blackTime]);

  const movable = useMemo(() => {
    if (players.white.type === "human" && players.black.type === "human") return "turn";
    if (players.white.type === "human") return "white";
    if (players.black.type === "human") return "black";
    return "none";
  }, [players]);

  useClockTimer(gameState, pos, whiteTime, blackTime, setWhiteTime, setBlackTime, players, setGameState, setResult);

  useEffect(() => {
    if (gameState === "gameOver" && headers.result && headers.result !== "*") {
      saveGameSettings({
        inputColor,
        sameTimeControl,
        customFen,
        player1Settings,
        player2Settings,
      });
    }
  }, [gameState, headers, inputColor, sameTimeControl, customFen, player1Settings, player2Settings, saveGameSettings]);

  /**
   * Applies a specific FEN (string) to the tree, updates headers and saves settings.
   * Returns true if applied, false if the FEN was invalid.
   */
  const applyFenString = useCallback(
    (fenRaw: string): boolean => {
      const fenToUse = fenRaw.trim() || INITIAL_FEN;
      if (!validateFen(fenToUse)) {
        return false;
      }

      // Mark that we're manually applying FEN to skip auto-save
      setIsApplyingFen(true);

      // Save settings FIRST with the new FEN to prevent conflicts
      saveGameSettings({
        inputColor,
        sameTimeControl,
        customFen: fenToUse,
        player1Settings,
        player2Settings,
      });

      // Update input state
      setCustomFen(fenToUse);

      // Update board immediately - setFen updates the root tree directly
      // This triggers the board to re-render with the new position
      // NOTE: setFen will reset the tree, so only call it when we want to start fresh
      setFen(fenToUse);

      // Update headers - but DON'T pass fen here as setFen already updated the root
      // Passing fen here could cause setHeaders to reset the tree again if the logic changes
      // We update fen in headers separately to track the initial FEN
      setHeaders({ ...headers, fen: fenToUse, result: "*" });

      // Reset the flag after a short delay to allow the state to settle
      setTimeout(() => {
        setIsApplyingFen(false);
      }, 100);

      return true;
    },
    [
      headers,
      inputColor,
      sameTimeControl,
      player1Settings,
      player2Settings,
      setFen,
      setHeaders,
      validateFen,
      saveGameSettings,
    ],
  );

  const applyFen = useCallback(() => {
    // Read value directly from input to handle paste events correctly
    const inputValue = fenInputRef.current?.value || customFen;
    applyFenString(inputValue);
  }, [applyFenString, customFen]);

  const startGame = useCallback(() => {
    // Clear any pending engine requests first
    engineRequestRef.current = null;

    // Kill any existing engines to start fresh (but don't wait)
    if (activeTab) {
      // Kill engines asynchronously without blocking
      Promise.all([
        commands.killEngines(activeTab + "white").catch(() => {}),
        commands.killEngines(activeTab + "black").catch(() => {}),
        commands.killEngines(activeTab).catch(() => {}),
      ]).catch(() => {});
    }

    // Set game state to playing immediately
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

    const fenToUse = customFen.trim() || INITIAL_FEN;
    if (!applyFenString(fenToUse)) {
      return; // no empezar partida si FEN inválido
    }

    // IMPORTANT: Only update headers metadata, NOT the fen field
    // The tree and headers.fen were already updated by applyFenString
    // Passing fen here could cause setHeaders to reset the tree if there's a race condition
    // We update all other headers but preserve the fen that was set by applyFenString
    setHeaders({ ...headers, ...newHeaders });

    setTabs((prev) =>
      prev.map((tab) => {
        const whiteName =
          newPlayers.white.type === "human" ? newPlayers.white.name : (newPlayers.white.engine?.name ?? "?");
        const blackName =
          newPlayers.black.type === "human" ? newPlayers.black.name : (newPlayers.black.engine?.name ?? "?");
        return tab.value === activeTab ? { ...tab, name: `${whiteName} vs. ${blackName}` } : tab;
      }),
    );
  }, [
    activeTab,
    customFen,
    getPlayers,
    headers,
    applyFenString,
    sameTimeControl,
    setGameState,
    setHeaders,
    setPlayers,
    setTabs,
  ]);

  const handleNewGame = useCallback(() => {
    // Cancel any pending debounced save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    // Save current settings immediately before resetting
    saveGameSettings({
      inputColor,
      sameTimeControl,
      customFen,
      player1Settings,
      player2Settings,
    });

    setGameState("settingUp");
    setWhiteTime(null);
    setBlackTime(null);
    setFenError(null);

    // Load saved settings after a brief delay to ensure save completed
    setTimeout(() => {
      const saved = loadGameSettings();

      setInputColor(saved.inputColor);
      setSameTimeControl(saved.sameTimeControl);
      setCustomFen(saved.customFen);
      setPlayer1Settings(saved.player1Settings);
      setPlayer2Settings(saved.player2Settings);

      const fenToUse = saved.customFen.trim() || INITIAL_FEN;
      const [p, err] = positionFromFen(fenToUse);

      if (!err && p) {
        setFen(fenToUse);
        setHeaders({ ...headers, fen: fenToUse, result: "*" });
      } else {
        setFen(INITIAL_FEN);
        setHeaders({ ...headers, fen: INITIAL_FEN, result: "*" });
        if (saved.customFen.trim()) {
          setFenError(t("game.invalidFen") || "Invalid FEN position");
        }
      }
    }, 50);
  }, [
    headers,
    inputColor,
    loadGameSettings,
    player1Settings,
    player2Settings,
    sameTimeControl,
    customFen,
    saveGameSettings,
    setFen,
    setGameState,
    setHeaders,
    setWhiteTime,
    t,
  ]);

  const endGame = useCallback(async () => {
    // First, change game state to stop any ongoing engine requests
    setGameState("settingUp");

    // Stop all engines immediately - kill ALL instances comprehensively
    if (activeTab) {
      try {
        // Strategy 1: Kill all engines that start with the activeTab (Rust uses starts_with)
        // This should catch most instances
        await commands.killEngines(activeTab);

        // Strategy 2: Explicitly kill engines for known tab variants
        await Promise.all([
          commands.killEngines(activeTab + "white").catch(() => {}),
          commands.killEngines(activeTab + "black").catch(() => {}),
        ]);

        // Strategy 3: Kill engines individually by path for each known engine
        // This ensures we kill specific engine instances that might not match the pattern
        if (engines.length > 0) {
          const killPromises = engines.flatMap((engine) => [
            commands.killEngine(engine.path, activeTab + "white").catch(() => {}),
            commands.killEngine(engine.path, activeTab + "black").catch(() => {}),
            commands.killEngine(engine.path, activeTab).catch(() => {}),
          ]);
          await Promise.all(killPromises);
        }

        // Strategy 4: Also kill engines for players that might be engines
        const currentPlayers = getPlayers();
        if (currentPlayers.white.type === "engine" && currentPlayers.white.engine) {
          await Promise.all([
            commands.killEngine(currentPlayers.white.engine.path, activeTab + "white").catch(() => {}),
            commands.killEngine(currentPlayers.white.engine.path, activeTab).catch(() => {}),
          ]);
        }
        if (currentPlayers.black.type === "engine" && currentPlayers.black.engine) {
          await Promise.all([
            commands.killEngine(currentPlayers.black.engine.path, activeTab + "black").catch(() => {}),
            commands.killEngine(currentPlayers.black.engine.path, activeTab).catch(() => {}),
          ]);
        }
      } catch (e) {
        // Failed to kill engines
      }
    }

    // Save the game record before resetting
    // Only save if there are moves in the game
    let savedPgn = ""; // Store PGN for use in creating analysis tab

    // CRITICAL: Check if we actually have moves to save
    const hasMoves = root.children.length > 0;

    if (hasMoves) {
      // Get the initial FEN from headers (set when game started)
      // This is more reliable than root.fen which may change if user navigates back
      const initialFen = headers.fen || root.fen;

      // CRITICAL: We need to traverse from the actual root, not from current position
      // The root should have the initial FEN, and all moves should be in root.children[0] chain

      // Extract all SAN moves from the main line by traversing root.children[0] recursively
      const sanMoves: string[] = [];
      let currentNode = root;
      let moveCount = 0;
      const MAX_MOVES = 500; // Safety limit to prevent infinite loops

      // Iterate through the main line manually to ensure we get all moves
      while (currentNode.children.length > 0 && moveCount < MAX_MOVES) {
        const child = currentNode.children[0]; // Always take the first child (main line)

        // Each node in the main line should have a SAN move
        if (child.san) {
          sanMoves.push(child.san);
          moveCount++;
        } else if (child.move) {
          // If a node doesn't have SAN, try to generate it from the move
          const [pos, posError] = positionFromFen(currentNode.fen);
          if (pos && !posError) {
            try {
              const san = makeSan(pos, child.move);
              if (san && san !== "--") {
                sanMoves.push(san);
                moveCount++;
              } else {
                // Don't break - continue to next move
                moveCount++;
              }
            } catch (e) {
              // Don't break - continue to next move
              moveCount++;
            }
          } else {
            // Don't break - continue to next move
            moveCount++;
          }
        } else {
          // If node has neither SAN nor move, we've reached the end
          break;
        }

        currentNode = child;
      }

      // Get the last node for final FEN
      const mainLine = Array.from(treeIteratorMainLine(root));
      const lastNode = mainLine[mainLine.length - 1].node;

      // Use current result or "*" if game was stopped early
      const gameResult = headers.result && headers.result !== "*" ? headers.result : "*";

      // Build PGN headers
      let pgn = `[Event "${headers.event || "Local Game"}"]\n`;
      pgn += `[Site "${headers.site || "Pawn Appetit"}"]\n`;
      pgn += `[Date "${headers.date || new Date().toISOString().split("T")[0].replace(/-/g, ".")}"]\n`;
      pgn += `[Round "${headers.round || "?"}"]\n`;
      pgn += `[White "${headers.white || "?"}"]\n`;
      pgn += `[Black "${headers.black || "?"}"]\n`;
      pgn += `[Result "${gameResult}"]\n`;
      if (headers.time_control) {
        pgn += `[TimeControl "${headers.time_control}"]\n`;
      }
      if (headers.variant) {
        pgn += `[Variant "${headers.variant}"]\n`;
      }
      // Always include initial FEN if it's different from standard starting position
      // Use headers.fen which was set when the game started
      if (initialFen !== INITIAL_FEN) {
        pgn += `[SetUp "1"]\n`;
        pgn += `[FEN "${initialFen}"]\n`;
      }
      pgn += "\n";

      // Format moves in PGN format (pair white and black moves)
      if (sanMoves.length > 0) {
        const movePairs: string[] = [];
        for (let i = 0; i < sanMoves.length; i += 2) {
          const moveNumber = Math.floor(i / 2) + 1;
          const whiteMove = sanMoves[i];
          const blackMove = sanMoves[i + 1];

          if (blackMove) {
            movePairs.push(`${moveNumber}. ${whiteMove} ${blackMove}`);
          } else {
            movePairs.push(`${moveNumber}. ${whiteMove}`);
          }
        }
        pgn += movePairs.join(" ") + " " + gameResult;
      } else {
        pgn += gameResult;
      }

      // Ensure PGN is not empty and has moves
      if (!pgn || pgn.trim().length === 0) {
        // PGN is empty, skipping save
      } else if (sanMoves.length === 0) {
        // PGN has no moves - still save the PGN even without moves
      } else {
        // Store PGN for use in creating analysis tab
        savedPgn = pgn.trim();
      }
    }

    // Create new tab with the game (without focusing it)
    // Use the manually constructed PGN we already built above to ensure consistency
    if (savedPgn && root.children.length > 0) {
      const currentActiveTab = activeTab;

      // Create the tab first
      const newTabId = await createTab({
        tab: {
          name: `${headers.white || "?"} vs ${headers.black || "?"}`,
          type: "analysis",
        },
        setTabs,
        setActiveTab,
        pgn: savedPgn,
        headers,
      });

      // Restore focus to current tab
      setActiveTab(currentActiveTab);

      // Get the PGN and FEN initial from the newly created tab
      // The tab stores its state in sessionStorage with the tab ID
      try {
        const tabStateJson = sessionStorage.getItem(newTabId);
        if (tabStateJson) {
          const tabState = JSON.parse(tabStateJson);
          if (tabState?.state) {
            const treeState = tabState.state;

            // Get PGN from the tree state using getPGN
            const tabPgn = getPGN(treeState.root, {
              headers: treeState.headers,
              comments: true,
              extraMarkups: true,
              glyphs: true,
              variations: true,
            });

            // Get initial FEN from the tree state root
            const tabInitialFen = treeState.root?.fen || treeState.headers?.fen;

            // Get the last node for final FEN
            const mainLine = Array.from(treeIteratorMainLine(treeState.root));
            const lastNode = mainLine[mainLine.length - 1].node;

            // Get UCI moves for the moves array (for backward compatibility)
            const uciMoves = getMainLine(treeState.root, treeState.headers?.variant === "Chess960");

            // Use current result or "*" if game was stopped early
            const gameResult =
              treeState.headers?.result && treeState.headers.result !== "*" ? treeState.headers.result : "*";

            // Save the game record with PGN and initial FEN from the tab
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
              result: gameResult,
              timeControl:
                treeState.headers?.time_control ||
                `${treeState.headers?.white_time_control || ""},${treeState.headers?.black_time_control || ""}`,
              timestamp: Date.now(),
              moves: uciMoves, // UCI moves for backward compatibility
              variant: treeState.headers?.variant ?? undefined,
              fen: lastNode.fen, // Final FEN position
              initialFen: tabInitialFen !== INITIAL_FEN ? tabInitialFen : undefined, // Initial FEN from tab
              pgn: tabPgn, // Full PGN from tab
            };

            // Save the game record
            await saveGameRecord(record);
          }
        }
      } catch (e) {
        // Failed to get data from tab, skip saving
      }
    }

    // Reset to new game
    handleNewGame();
  }, [activeTab, root, headers, players, setTabs, setActiveTab, setGameState, handleNewGame, engines, getPlayers]);

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

  // Check if we're coming from a variants file
  const isFromVariants = activeTabData?.source?.type === "file" && activeTabData?.source?.metadata?.type === "variants";

  // Get board orientation (default to white if not set)
  const boardOrientation = headers.orientation || "white";

  // Generate puzzles from variants
  const generatePuzzles = useCallback(async () => {
    try {
      // Get document directory
      const documentDir = await getDocumentDir();

      // Open save dialog
      const filePath = await save({
        defaultPath: `${documentDir}/puzzles-${formatDateToPGN(new Date())}.pgn`,
        filters: [
          {
            name: "PGN",
            extensions: ["pgn"],
          },
        ],
      });

      if (!filePath) return;

      // Get filename without extension
      const fileName =
        filePath
          .replace(/\.pgn$/, "")
          .split(/[/\\]/)
          .pop() || `puzzles-${formatDateToPGN(new Date())}`;

      // Generate puzzles from the current tree
      // Each puzzle is based on a position where there are multiple variations (next moves)
      const puzzles: string[] = [];

      // Function to recursively find positions with variations
      const findPuzzlePositions = (node: TreeNode, depth = 0): void => {
        // Only consider positions where it's the turn of the puzzle color
        const [pos] = positionFromFen(node.fen);
        if (!pos) return;

        const currentTurn = pos.turn;
        const puzzleColor = boardOrientation === "white" ? "white" : "black";

        // If this position has multiple children (variations) and it's the puzzle color's turn
        if (node.children.length > 1 && currentTurn === puzzleColor) {
          // Create a puzzle from this position
          // Take the first variation as the solution (or any variation)
          const solutionVariation = node.children[0];

          // Get the solution moves (just the next move, or up to 2 moves if needed)
          let solutionMoves = "";
          if (solutionVariation.san) {
            solutionMoves = getMoveText(solutionVariation, {
              glyphs: false,
              comments: false,
              extraMarkups: false,
              isFirst: false,
            }).trim();

            // If there's a continuation, add it
            if (solutionVariation.children.length > 0 && solutionVariation.children[0].san) {
              const nextMove = getMoveText(solutionVariation.children[0], {
                glyphs: false,
                comments: false,
                extraMarkups: false,
                isFirst: false,
              }).trim();
              solutionMoves += " " + nextMove;
            }
          }

          // Create puzzle PGN
          let puzzlePGN = `[FEN "${node.fen}"]\n`;
          puzzlePGN += `[Solution "${solutionMoves}"]\n`;
          puzzlePGN += `\n${solutionMoves}\n\n`;

          puzzles.push(puzzlePGN);
        }

        // Recursively check children (limit depth to avoid too many puzzles)
        if (depth < 10) {
          for (const child of node.children) {
            findPuzzlePositions(child, depth + 1);
          }
        }
      };

      // Start from root
      findPuzzlePositions(root);

      // If no puzzles found from variations, create puzzles from positions with at least one move
      if (puzzles.length === 0) {
        // Create puzzles from all positions where it's the puzzle color's turn
        const createPuzzlesFromPositions = (node: TreeNode, depth = 0): void => {
          const [pos] = positionFromFen(node.fen);
          if (!pos) return;

          const currentTurn = pos.turn;
          const puzzleColor = boardOrientation === "white" ? "white" : "black";

          // If it's the puzzle color's turn and there's at least one move
          if (currentTurn === puzzleColor && node.children.length > 0) {
            const solutionVariation = node.children[0];

            if (solutionVariation.san) {
              const solutionMoves = getMoveText(solutionVariation, {
                glyphs: false,
                comments: false,
                extraMarkups: false,
                isFirst: false,
              }).trim();

              let puzzlePGN = `[FEN "${node.fen}"]\n`;
              puzzlePGN += `[Solution "${solutionMoves}"]\n`;
              puzzlePGN += `\n${solutionMoves}\n\n`;

              puzzles.push(puzzlePGN);
            }
          }

          // Recursively check children
          if (depth < 10) {
            for (const child of node.children) {
              createPuzzlesFromPositions(child, depth + 1);
            }
          }
        };

        createPuzzlesFromPositions(root);
      }

      // Combine all puzzles into a single PGN string
      const puzzlesPGN = puzzles.join("");

      // Create the file with puzzle type
      await createFile({
        filename: fileName,
        filetype: "puzzle",
        pgn: puzzlesPGN,
        dir: documentDir,
      });

      notifications.show({
        title: t("common.save"),
        message: t("common.puzzlesGeneratedSuccessfully"),
        color: "green",
      });
    } catch (error) {
      notifications.show({
        title: t("common.error"),
        message: t("common.failedToGeneratePuzzles"),
        color: "red",
      });
    }
  }, [root, boardOrientation, t]);

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
                          engines={engines}
                          enginesState={enginesState}
                        />
                        <Divider orientation="vertical" />
                        <OpponentForm
                          sameTimeControl={sameTimeControl}
                          opponent={player2Settings}
                          setOpponent={setPlayer2Settings}
                          setOtherOpponent={setPlayer1Settings}
                          engines={engines}
                          enginesState={enginesState}
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
                    <Divider label={t("game.startingPosition")} />
                    <Stack gap="md">
                      <InputWrapper
                        label={t("game.fen")}
                        error={fenError}
                        description={t("game.fenDescription")}
                        styles={{
                          label: {
                            marginBottom: "0.25rem",
                          },
                          description: {
                            marginTop: "0.25rem",
                            marginBottom: "0.5rem",
                          },
                        }}
                      >
                        <Group gap="xs" wrap="nowrap" align="flex-end">
                          <TextInput
                            ref={fenInputRef}
                            style={{ flex: 1 }}
                            placeholder={INITIAL_FEN}
                            value={customFen}
                            radius="md"
                            size="sm"
                            variant="filled"
                            onChange={(e) => {
                              const newFen = e.target.value;
                              setCustomFen(newFen);
                              if (newFen.trim()) {
                                validateFen(newFen);
                              } else {
                                setFenError(null);
                              }
                            }}
                            onPaste={(e) => {
                              // Ensure state is updated immediately on paste
                              const pastedValue = e.clipboardData.getData("text");
                              setTimeout(() => {
                                setCustomFen(pastedValue);
                                if (pastedValue.trim()) {
                                  validateFen(pastedValue);
                                } else {
                                  setFenError(null);
                                }
                              }, 0);
                            }}
                            error={!!fenError}
                            styles={{
                              input: {
                                fontFamily: "monospace",
                                fontSize: "0.85rem",
                                whiteSpace: "nowrap",
                                overflowX: "auto",
                              },
                            }}
                          />
                          <ActionIcon
                            variant="light"
                            color="blue"
                            onClick={applyFen}
                            disabled={!!fenError || (!customFen.trim() && root.fen === INITIAL_FEN)}
                            title={t("game.applyFen")}
                            size="lg"
                          >
                            <IconCheck size={18} />
                          </ActionIcon>
                        </Group>
                      </InputWrapper>
                    </Stack>
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
                      {t("keybindings.newGame")}
                    </Button>
                    <Button variant="default" onClick={changeToAnalysisMode} leftSection={<IconZoomCheck />}>
                      {t("keybindings.analyzePosition")}
                    </Button>
                  </Group>
                </Stack>
              )}
            </Paper>
          </Portal>
        </>
      )}
      <GameNotationWrapper topBar>
        <Stack gap="xs">
          <MoveControls
            readOnly
            currentTabType="play"
            startGame={startGame}
            endGame={endGame}
            gameState={gameState}
            startGameDisabled={startGameDisabled}
          />
          {isFromVariants && (
            <Button leftSection={<IconPuzzle size={18} />} onClick={generatePuzzles} variant="light" fullWidth>
              {t("common.generatePuzzles")}
            </Button>
          )}
        </Stack>
      </GameNotationWrapper>
    </>
  );
}

export default BoardGame;
