import type { MantineColor } from "@mantine/core";
import { Grid, Stack } from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { IconBolt, IconChess, IconClock, IconStopwatch } from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { appDataDir, resolve } from "@tauri-apps/api/path";
import { mkdir, writeTextFile } from "@tauri-apps/plugin-fs";
import { info } from "@tauri-apps/plugin-log";
import { useAtom, useAtomValue } from "jotai";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { commands, type GoMode } from "@/bindings";
import { lessons } from "@/features/learn/constants/lessons";
import { practices } from "@/features/learn/constants/practices";
import { activeTabAtom, enginesAtom, sessionsAtom, tabsAtom } from "@/state/atoms";
import { useUserStatsStore } from "@/state/userStatsStore";
import { type Achievement, getAchievements } from "@/utils/achievements";
import { type ChessComGame, fetchLastChessComGames } from "@/utils/chess.com/api";
import { parsePGN, getPGN, getMainLine } from "@/utils/chess";
import { type TreeState } from "@/utils/treeReducer";
import { type DailyGoal, getDailyGoals } from "@/utils/dailyGoals";
import { type GameRecord, getRecentGames, updateGameRecord, deleteGameRecord } from "@/utils/gameRecords";
import { saveAnalyzedGame, getAllAnalyzedGames } from "@/utils/analyzedGames";
import { createFile } from "@/utils/files";
import { fetchLastLichessGames } from "@/utils/lichess/api";
import { getPuzzleStats, getTodayPuzzleCount } from "@/utils/puzzleStreak";
import { createTab, genID, type Tab } from "@/utils/tabs";
import { unwrap } from "@/utils/unwrap";
import type { LocalEngine } from "@/utils/engines";
import { AnalyzeAllModal, type AnalyzeAllConfig } from "./components/AnalyzeAllModal";
import { DailyGoalsCard } from "./components/DailyGoalsCard";
import { GamesHistoryCard } from "./components/GamesHistoryCard";
import { PuzzleStatsCard } from "./components/PuzzleStatsCard";
import { QuickActionsGrid } from "./components/QuickActionsGrid";
import { type Suggestion, SuggestionsCard } from "./components/SuggestionsCard";
import { UserProfileCard } from "./components/UserProfileCard";
import { WelcomeCard } from "./components/WelcomeCard";
import { getChessTitle } from "./utils/chessTitle";
import {
  createChessComGameHeaders,
  createLichessGameHeaders,
  createLocalGameHeaders,
  createPGNFromMoves,
} from "./utils/gameHelpers";

export default function DashboardPage() {
  const [isFirstOpen, setIsFirstOpen] = useState(false);
  useEffect(() => {
    const key = "pawn-appetit.firstOpen";
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, "true");
      setIsFirstOpen(true);
    } else {
      setIsFirstOpen(false);
    }
  }, []);
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [_tabs, setTabs] = useAtom(tabsAtom);
  const [_activeTab, setActiveTab] = useAtom(activeTabAtom);

  const sessions = useAtomValue(sessionsAtom);
  const engines = useAtomValue(enginesAtom);
  const localEngines = engines.filter((e): e is LocalEngine => e.type === "local");
  const defaultEngine = localEngines.length > 0 ? localEngines[0] : null;

  const [mainAccountName, setMainAccountName] = useState<string | null>(null);
  const [activeGamesTab, setActiveGamesTab] = useState<string | null>("local");
  const [analyzeAllModalOpened, setAnalyzeAllModalOpened] = useState(false);
  const [analyzeAllGameType, setAnalyzeAllGameType] = useState<"local" | "chesscom" | "lichess" | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("mainAccount");
    setMainAccountName(stored);
  }, []);

  const mainSession = sessions.find(
    (s) =>
      s.player === mainAccountName ||
      s.lichess?.username === mainAccountName ||
      s.chessCom?.username === mainAccountName,
  );

  let user = {
    name: mainAccountName ?? t("dashboard.noMainAccount"),
    handle: "",
    rating: 0,
  };
  let ratingHistory: { classical?: number; rapid?: number; blitz?: number; bullet?: number } = {};
  if (mainSession?.lichess?.account) {
    const acc = mainSession.lichess.account;
    user = {
      name: acc.username,
      handle: `@${acc.username}`,
      rating: acc.perfs?.classical?.rating ?? acc.perfs?.rapid?.rating ?? acc.perfs?.blitz?.rating ?? 0,
    };
    const classical = acc.perfs?.classical?.rating;
    const rapid = acc.perfs?.rapid?.rating;
    const blitz = acc.perfs?.blitz?.rating;
    const bullet = acc.perfs?.bullet?.rating;
    ratingHistory = { classical, rapid, blitz, bullet };
  } else if (mainSession?.chessCom?.stats) {
    const stats = mainSession.chessCom.stats;
    user = {
      name: mainSession.chessCom.username,
      handle: `@${mainSession.chessCom.username}`,
      rating: stats.chess_rapid?.last?.rating ?? stats.chess_blitz?.last?.rating ?? 0,
    };
    const rapid = stats.chess_rapid?.last?.rating;
    const blitz = stats.chess_blitz?.last?.rating;
    const bullet = stats.chess_bullet?.last?.rating;
    ratingHistory = { rapid, blitz, bullet };
  }

  const lichessUsernames = useMemo(
    () => [...new Set(sessions.map((s) => s.lichess?.username).filter(Boolean) as string[])],
    [sessions],
  );
  const chessComUsernames = useMemo(
    () => [...new Set(sessions.map((s) => s.chessCom?.username).filter(Boolean) as string[])],
    [sessions],
  );

  const [selectedLichessUser, setSelectedLichessUser] = useState<string | null>("all");
  const [selectedChessComUser, setSelectedChessComUser] = useState<string | null>("all");

  const [recentGames, setRecentGames] = useState<GameRecord[]>([]);
  useEffect(() => {
    const loadGames = async () => {
      const games = await getRecentGames(50);
      setRecentGames(games);
    };
    loadGames();
    
    // Listen for games:updated event to refresh local games after analysis
    const handleGamesUpdated = () => {
      loadGames();
    };
    window.addEventListener("games:updated", handleGamesUpdated);
    
    return () => {
      window.removeEventListener("games:updated", handleGamesUpdated);
    };
  }, []);

  const [lastLichessUpdate, setLastLichessUpdate] = useState(Date.now());
  const [lichessGames, setLichessGames] = useState<
    Array<{
      id: string;
      players: {
        white: { user?: { name: string } };
        black: { user?: { name: string } };
      };
      speed: string;
      createdAt: number;
      winner?: string;
      status: string;
      pgn?: string;
      lastFen: string;
    }>
  >([]);
  useEffect(() => {
    const fetchGames = async () => {
      const usersToFetch =
        selectedLichessUser === "all" ? lichessUsernames : selectedLichessUser ? [selectedLichessUser] : [];
      if (usersToFetch.length > 0) {
        const allGamesPromises = usersToFetch.map((username) => fetchLastLichessGames(username, 50));
        const gamesArrays = await Promise.all(allGamesPromises);
        const combinedGames = gamesArrays.flat();
        combinedGames.sort((a, b) => b.createdAt - a.createdAt);
        const games = combinedGames.slice(0, 50);
        
        // Load analyzed PGNs from storage
        const analyzedGames = await getAllAnalyzedGames();
        // Create a new array to ensure React detects the change
        const gamesWithAnalysis = games.map(game => {
          if (analyzedGames[game.id]) {
            return { ...game, pgn: analyzedGames[game.id] };
          }
          return game;
        });
        
        setLichessGames(gamesWithAnalysis);
      } else {
        setLichessGames([]);
      }
    };
    fetchGames();
    
    // Listen for lichess:games:updated event to refresh Lichess games after analysis
    const handleLichessGamesUpdated = () => {
      fetchGames();
    };
    window.addEventListener("lichess:games:updated", handleLichessGamesUpdated);
    
    return () => {
      window.removeEventListener("lichess:games:updated", handleLichessGamesUpdated);
    };
  }, [lichessUsernames, selectedLichessUser, lastLichessUpdate]);

  const [lastChessComUpdate, setLastChessComUpdate] = useState(Date.now());
  const [chessComGames, setChessComGames] = useState<ChessComGame[]>([]);
  useEffect(() => {
    const fetchGames = async () => {
      const usersToFetch =
        selectedChessComUser === "all" ? chessComUsernames : selectedChessComUser ? [selectedChessComUser] : [];
      if (usersToFetch.length > 0) {
        info(`Fetching Chess.com games for: ${JSON.stringify(usersToFetch)}`);
        const allGamesPromises = usersToFetch.map((username) => fetchLastChessComGames(username));
        const gamesArrays = await Promise.all(allGamesPromises);

        const combinedGames = gamesArrays.flat();
        combinedGames.sort((a, b) => b.end_time - a.end_time);
        const games = combinedGames.slice(0, 50);
        
        // Load analyzed PGNs from storage
        const analyzedGames = await getAllAnalyzedGames();
        // Create a new array to ensure React detects the change
        const gamesWithAnalysis = games.map(game => {
          if (analyzedGames[game.url]) {
            return { ...game, pgn: analyzedGames[game.url] };
          }
          return game;
        });
        
        setChessComGames(gamesWithAnalysis);
      } else {
        setChessComGames([]);
      }
    };
    fetchGames();
    
    // Listen for chesscom:games:updated event to refresh Chess.com games after analysis
    const handleChessComGamesUpdated = () => {
      fetchGames();
    };
    window.addEventListener("chesscom:games:updated", handleChessComGamesUpdated);
    
    return () => {
      window.removeEventListener("chesscom:games:updated", handleChessComGamesUpdated);
    };
  }, [chessComUsernames, selectedChessComUser, lastChessComUpdate]);

  const [puzzleStats, setPuzzleStats] = useState(() => getPuzzleStats());
  useEffect(() => {
    const update = () => setPuzzleStats(getPuzzleStats());
    const onVisibility = () => {
      if (!document.hidden) update();
    };
    window.addEventListener("storage", update);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("storage", update);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const userStats = useUserStatsStore((s) => s.userStats);

  const suggestions: Suggestion[] = (() => {
    const picked: Suggestion[] = [];

    try {
      const nextLesson = lessons.find((l) => {
        const done = userStats.completedExercises?.[l.id]?.length ?? 0;
        return (l.exercises?.length ?? 0) > 0 && done < (l.exercises?.length ?? 0);
      });
      if (nextLesson) {
        picked.push({
          id: `lesson:${nextLesson.id}`,
          title: `Continue: ${nextLesson.title.default}`,
          tag: "Lessons",
          difficulty: nextLesson.difficulty?.toString?.().replace(/^./, (c) => c.toUpperCase()) ?? "All",
          to: "/learn/lessons",
        });
      }
    } catch {}

    try {
      const withExercises = practices.filter((c) => (c.exercises?.length ?? 0) > 0);
      const scored = withExercises
        .map((c) => {
          const done = userStats.completedPractice?.[c.id]?.length ?? 0;
          const total = c.exercises?.length ?? 0;
          return { c, ratio: total ? done / total : 1, total, done };
        })
        .sort((a, b) => a.ratio - b.ratio || a.total - b.total);
      const target = scored[0]?.c;
      if (target) {
        const group = target.group ?? "";
        const tag: Suggestion["tag"] = /Endgames/i.test(group)
          ? "Endgames"
          : /Checkmates|Tactics/i.test(group)
            ? "Tactics"
            : "Lessons";
        picked.push({
          id: `practice:${target.id}`,
          title: `Practice: ${target.title}`,
          tag,
          difficulty: "All",
          to: "/learn/practice",
        });
      }
    } catch {}

    try {
      const today = getTodayPuzzleCount();
      if (today < 5) {
        picked.push({
          id: `puzzles:streak`,
          title: today === 0 ? "Start today’s puzzle streak" : "Keep the streak: solve more puzzles",
          tag: "Tactics",
          difficulty: "All",
          to: "/learn/practice",
        });
      }
    } catch {}

    try {
      const last: GameRecord | undefined = recentGames?.[0];
      if (last) {
        const isUserWhite = last.white.type === "human";
        const userLost = (isUserWhite && last.result === "0-1") || (!isUserWhite && last.result === "1-0");
        if (userLost) {
          picked.push({
            id: `analyze:${last.id}`,
            title: t("dashboard.suggestions.analyzeLastGame"),
            tag: "Lessons",
            difficulty: "All",
            onClick: () => {
              const headers = createLocalGameHeaders(last);
              // Use saved PGN if available, otherwise reconstruct from moves with initial FEN
              const pgn = last.pgn || createPGNFromMoves(last.moves, last.result, last.initialFen);

              createTab({
                tab: {
                  name: `${headers.white} - ${headers.black}`,
                  type: "analysis",
                },
                setTabs,
                setActiveTab,
                pgn,
                headers,
              });
              navigate({ to: "/boards" });
            },
          });
        }
      }
    } catch {}

    while (picked.length < 3) {
      const fallbackId = `fallback:${picked.length}`;
      picked.push({
        id: fallbackId,
        title: t("dashboard.suggestions.exploreOpenings"),
        tag: "Openings",
        difficulty: "All",
        to: "/learn/practice",
      });
    }

    return picked.slice(0, 3);
  })();
  const [goals, setGoals] = useState<DailyGoal[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const g = await getDailyGoals();
      const a = await getAchievements();
      if (mounted) {
        setGoals(g);
        setAchievements(a);
      }
    };
    load();
    const update = () => load();
    window.addEventListener("storage", update);
    window.addEventListener("focus", update);
    window.addEventListener("puzzles:updated", update);
    window.addEventListener("games:updated", update);
    const unsubscribe = useUserStatsStore.subscribe(() => update());
    return () => {
      mounted = false;
      window.removeEventListener("storage", update);
      window.removeEventListener("focus", update);
      window.removeEventListener("puzzles:updated", update);
      window.removeEventListener("games:updated", update);
      unsubscribe();
    };
  }, []);

  const PLAY_CHESS = {
    icon: <IconChess size={50} />,
    title: t("features.dashboard.cards.playChess.title"),
    description: t("features.dashboard.cards.playChess.desc"),
    label: t("features.dashboard.cards.playChess.button"),
    onClick: () => {
      const uuid = genID();
      setTabs((prev: Tab[]) => {
        return [
          ...prev,
          {
            value: uuid,
            name: "New Game",
            type: "play",
          },
        ];
      });
      setActiveTab(uuid);
      navigate({ to: "/boards" });
    },
  };

  const quickActions: {
    icon: React.ReactNode;
    title: string;
    description: string;
    onClick: () => void;
    color: MantineColor;
  }[] = [
    {
      icon: <IconClock />,
      title: t("chess.timeControl.classical"),
      description: t("dashboard.timeControlCards.classicalDesc"),
      onClick: () => {
        const uuid = genID();
        setTabs((prev: Tab[]) => {
          return [
            ...prev,
            {
              value: uuid,
              name: t("chess.timeControl.classical"),
              type: "play",
              meta: {
                timeControl: {
                  seconds: 30 * 60 * 1000,
                  increment: 0,
                },
              },
            },
          ];
        });
        setActiveTab(uuid);
        navigate({ to: "/boards" });
      },
      color: "blue.6",
    },
    {
      icon: <IconStopwatch />,
      title: t("chess.timeControl.rapid"),
      description: t("dashboard.timeControlCards.rapidDesc"),
      onClick: () => {
        const uuid = genID();
        setTabs((prev: Tab[]) => {
          return [
            ...prev,
            {
              value: uuid,
              name: t("chess.timeControl.rapid"),
              type: "play",
              meta: {
                timeControl: {
                  seconds: 10 * 60 * 1000,
                  increment: 0,
                },
              },
            },
          ];
        });
        setActiveTab(uuid);
        navigate({ to: "/boards" });
      },
      color: "teal.6",
    },
    {
      icon: <IconBolt />,
      title: t("chess.timeControl.blitz"),
      description: t("dashboard.timeControlCards.blitzDesc"),
      onClick: () => {
        const uuid = genID();
        setTabs((prev: Tab[]) => {
          return [
            ...prev,
            {
              value: uuid,
              name: t("chess.timeControl.blitz"),
              type: "play",
              meta: {
                timeControl: {
                  seconds: 3 * 60 * 1000,
                  increment: 0,
                },
              },
            },
          ];
        });
        setActiveTab(uuid);
        navigate({ to: "/boards" });
      },
      color: "yellow.6",
    },
    {
      icon: <IconBolt />,
      title: t("chess.timeControl.bullet"),
      description: t("dashboard.timeControlCards.bulletDesc"),
      onClick: () => {
        const uuid = genID();
        setTabs((prev: Tab[]) => {
          return [
            ...prev,
            {
              value: uuid,
              name: t("chess.timeControl.bullet"),
              type: "play",
              meta: {
                timeControl: {
                  seconds: 1 * 60 * 1000,
                  increment: 0,
                },
              },
            },
          ];
        });
        setActiveTab(uuid);
        navigate({ to: "/boards" });
      },
      color: "blue.6",
    },
  ];

  return (
    <Stack p="md" gap="md">
      <WelcomeCard
        isFirstOpen={isFirstOpen}
        onPlayChess={PLAY_CHESS.onClick}
        onImportGame={() => {
          navigate({ to: "/boards" });
          modals.openContextModal({
            modal: "importModal",
            innerProps: {},
          });
        }}
      />

      <Grid>
        <Grid.Col span={{ base: 12, sm: 12, md: 4, lg: 3, xl: 3 }}>
          <UserProfileCard
            name={user.name}
            handle={user.handle}
            title={getChessTitle(user.rating)}
            ratingHistory={ratingHistory}
          />
        </Grid.Col>

        <Grid.Col span={{ base: 12, sm: 12, md: 8, lg: 9, xl: 9 }}>
          <QuickActionsGrid actions={quickActions} />
        </Grid.Col>
      </Grid>

      <Grid>
        <Grid.Col span={{ base: 12, sm: 12, md: 7, lg: 7, xl: 7 }}>
          <GamesHistoryCard
            activeTab={activeGamesTab}
            onTabChange={setActiveGamesTab}
            localGames={recentGames}
            onDeleteLocalGame={async (gameId: string) => {
              await deleteGameRecord(gameId);
              const updatedGames = await getRecentGames(50);
              setRecentGames(updatedGames);
            }}
            chessComGames={chessComGames}
            lichessGames={lichessGames}
            chessComUsernames={chessComUsernames}
            lichessUsernames={lichessUsernames}
            selectedChessComUser={selectedChessComUser}
            selectedLichessUser={selectedLichessUser}
            onChessComUserChange={setSelectedChessComUser}
            onLichessUserChange={setSelectedLichessUser}
            onRefreshChessCom={() => setLastChessComUpdate(Date.now())}
            onRefreshLichess={() => setLastLichessUpdate(Date.now())}
            onAnalyzeLocalGame={(game) => {
              const headers = createLocalGameHeaders(game);
              // Use saved PGN if available, otherwise reconstruct from moves with initial FEN
              const pgn = game.pgn || createPGNFromMoves(game.moves, game.result, game.initialFen);
              createTab({
                tab: {
                  name: `${headers.white} - ${headers.black}`,
                  type: "analysis",
                },
                setTabs,
                setActiveTab,
                pgn,
                headers,
              }).then((tabId) => {
                // Store the gameId in sessionStorage so we can update it when analysis completes
                if (tabId && typeof window !== "undefined") {
                  sessionStorage.setItem(`${tabId}_localGameId`, game.id);
                }
              });
              navigate({ to: "/boards" });
            }}
            onAnalyzeChessComGame={(game) => {
              if (game.pgn) {
                const headers = createChessComGameHeaders(game);
                createTab({
                  tab: {
                    name: `${game.white.username} - ${game.black.username}`,
                    type: "analysis",
                  },
                  setTabs,
                  setActiveTab,
                  pgn: game.pgn,
                  headers,
                }).then((tabId) => {
                  // Store the game URL in sessionStorage so we can save the analyzed PGN when analysis completes
                  if (tabId && typeof window !== "undefined") {
                    sessionStorage.setItem(`${tabId}_chessComGameUrl`, game.url);
                  }
                });
                navigate({ to: "/boards" });
              }
            }}
            onAnalyzeLichessGame={(game) => {
              if (game.pgn) {
                const headers = createLichessGameHeaders(game);
                createTab({
                  tab: {
                    name: `${headers.white} - ${headers.black}`,
                    type: "analysis",
                  },
                  setTabs,
                  setActiveTab,
                  pgn: game.pgn,
                  headers,
                }).then((tabId) => {
                  // Store the game ID in sessionStorage so we can save the analyzed PGN when analysis completes
                  if (tabId && typeof window !== "undefined") {
                    sessionStorage.setItem(`${tabId}_lichessGameId`, game.id);
                  }
                });
                navigate({ to: "/boards" });
              }
            }}
            onAnalyzeAllLocal={() => {
              setAnalyzeAllGameType("local");
              setAnalyzeAllModalOpened(true);
            }}
            onAnalyzeAllChessCom={() => {
              setAnalyzeAllGameType("chesscom");
              setAnalyzeAllModalOpened(true);
            }}
            onAnalyzeAllLichess={() => {
              setAnalyzeAllGameType("lichess");
              setAnalyzeAllModalOpened(true);
            }}
          />
        </Grid.Col>

        <Grid.Col span={{ base: 12, sm: 12, md: 5, lg: 5, xl: 5 }}>
          <PuzzleStatsCard
            stats={puzzleStats}
            onStartPuzzles={() => {
              createTab({
                tab: { name: t("features.tabs.puzzle.title"), type: "puzzles" },
                setTabs,
                setActiveTab,
              });
              navigate({ to: "/boards" });
            }}
          />
        </Grid.Col>
      </Grid>

      <Grid>
        <Grid.Col span={{ base: 12, sm: 12, md: 7, lg: 7, xl: 7 }}>
          <SuggestionsCard
            suggestions={suggestions}
            onSuggestionClick={(s) => {
              if (s.onClick) s.onClick();
              else if (s.to) navigate({ to: s.to });
              else navigate({ to: "/learn" });
            }}
          />
        </Grid.Col>

        <Grid.Col span={{ base: 12, sm: 12, md: 5, lg: 5, xl: 5 }}>
          <DailyGoalsCard goals={goals} achievements={achievements} currentStreak={puzzleStats.currentStreak} />
        </Grid.Col>
      </Grid>

      <AnalyzeAllModal
        opened={analyzeAllModalOpened}
        onClose={() => {
          setAnalyzeAllModalOpened(false);
          setAnalyzeAllGameType(null);
        }}
        onAnalyze={async (config, onProgress, isCancelled) => {
          if (!defaultEngine) {
            notifications.show({
              title: "No Engine Available",
              message: "Please install an engine first in the Engines page.",
              color: "red",
            });
            return;
          }

          const gamesToAnalyze =
            analyzeAllGameType === "local"
              ? recentGames.filter((g) => g.pgn || g.moves.length > 0)
              : analyzeAllGameType === "chesscom"
                ? chessComGames.filter((g) => g.pgn)
                : analyzeAllGameType === "lichess"
                  ? lichessGames.filter((g) => g.pgn)
                  : [];

          if (gamesToAnalyze.length === 0) {
            notifications.show({
              title: "No Games to Analyze",
              message: "No games with PGN data available to analyze.",
              color: "orange",
            });
            return;
          }

          const goMode: GoMode = { t: "Depth", c: config.depth };
          const engineSettings = (defaultEngine.settings ?? []).map((s) => ({
            ...s,
            value: s.value?.toString() ?? "",
          }));
          
          // Force Threads to 1 for batch analysis, regardless of engine configuration
          const threadsSetting = engineSettings.find((s) => s.name.toLowerCase() === "threads");
          if (threadsSetting) {
            threadsSetting.value = "1";
          } else {
            // Add Threads setting if it doesn't exist
            engineSettings.push({ name: "Threads", value: "1" });
          }

          // Create directory for analyzed games
          const baseDir = await appDataDir();
          const analyzedDir = await resolve(baseDir, "analyzed-games");
          await mkdir(analyzedDir, { recursive: true });

          const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
          const folderName = `${analyzedDir}/${analyzeAllGameType}-analyzed-${timestamp}`;
          await mkdir(folderName, { recursive: true });

          notifications.show({
            title: "Analysis Started",
            message: `Analyzing ${gamesToAnalyze.length} games...`,
            color: "blue",
          });

          let successCount = 0;
          let failCount = 0;
          let currentAnalysisId: string | null = null;

          for (let i = 0; i < gamesToAnalyze.length; i++) {
            // Check if analysis was cancelled
            if (isCancelled()) {
              // Stop the current engine if it's running
              if (currentAnalysisId && defaultEngine) {
                try {
                  await commands.stopEngine(defaultEngine.path, currentAnalysisId);
                } catch {
                  // Ignore errors when stopping
                }
              }
              notifications.show({
                title: "Analysis Cancelled",
                message: `Analysis stopped. ${successCount} games analyzed successfully.`,
                color: "yellow",
              });
              break;
            }
            onProgress(i, gamesToAnalyze.length);
            const game = gamesToAnalyze[i];
            try {
              let tree: TreeState;
              let moves: string[];
              let initialFen: string;
              let gameHeaders: ReturnType<typeof createLocalGameHeaders | typeof createChessComGameHeaders | typeof createLichessGameHeaders>;

              if (analyzeAllGameType === "local") {
                // For local games, use PGN if available, otherwise reconstruct from moves
                const gameRecord = game as GameRecord;
                const pgn = gameRecord.pgn || createPGNFromMoves(gameRecord.moves, gameRecord.result, gameRecord.initialFen);
                tree = await parsePGN(pgn, gameRecord.initialFen);
                moves = gameRecord.moves;
                initialFen = gameRecord.initialFen || "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
                gameHeaders = createLocalGameHeaders(gameRecord);
              } else {
                // For Chess.com and Lichess games, parse PGN
                const pgn = (game as ChessComGame | typeof lichessGames[0]).pgn!;
                tree = await parsePGN(pgn);
                // Extract UCI moves from the main line using getMainLine
                const is960 = tree.headers?.variant === "Chess960";
                moves = getMainLine(tree.root, is960);
                initialFen = tree.headers?.fen || "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
                gameHeaders =
                  analyzeAllGameType === "chesscom"
                    ? createChessComGameHeaders(game as ChessComGame)
                    : createLichessGameHeaders(game as typeof lichessGames[0]);
              }

              // Analyze the game
              currentAnalysisId = `analyze_all_${analyzeAllGameType}_${i}_${Date.now()}`;
              const analysisResult = await commands.analyzeGame(
                currentAnalysisId,
                defaultEngine.path,
                goMode,
                {
                  annotateNovelties: false,
                  fen: initialFen,
                  referenceDb: null,
                  reversed: false,
                  moves,
                },
                engineSettings,
              );

              // Check again if cancelled after analysis
              if (isCancelled()) {
                if (currentAnalysisId && defaultEngine) {
                  try {
                    await commands.stopEngine(defaultEngine.path, currentAnalysisId);
                  } catch {
                    // Ignore errors when stopping
                  }
                }
                break;
              }

              const analysis = unwrap(analysisResult);

              // Use the same addAnalysis function from the store to ensure consistency
              // This ensures the same logic is used for both individual and batch analysis
              const { addAnalysis } = await import("@/state/store/tree");
              
              // Apply analysis using the same function used in individual analysis
              // This ensures consistency and prevents PGN damage
              addAnalysis(tree, analysis);

              // Check if cancelled before saving
              if (isCancelled()) {
                if (currentAnalysisId && defaultEngine) {
                  try {
                    await commands.stopEngine(defaultEngine.path, currentAnalysisId);
                  } catch {
                    // Ignore errors when stopping
                  }
                }
                notifications.show({
                  title: "Analysis Cancelled",
                  message: `Analysis stopped after ${successCount} games (${failCount} failed).`,
                  color: "yellow",
                });
                break;
              }

              // Generate PGN with analysis
              let analyzedPgn = getPGN(tree.root, {
                headers: tree.headers,
                comments: true,
                extraMarkups: true,
                glyphs: true,
                variations: true,
              });

              // Validate and fix PGN before saving
              if (!analyzedPgn || analyzedPgn.trim().length === 0) {
                info(`Generated PGN is empty for game ${i + 1}, skipping save`);
                failCount++;
                continue;
              }

              // Ensure PGN has a result (required for valid PGN)
              const hasResult = /\[Result\s+"[^"]+"\]/.test(analyzedPgn) || /\s+(1-0|0-1|1\/2-1\/2|\*)\s*$/.test(analyzedPgn);
              if (!hasResult && tree.headers?.result) {
                // If result is missing but we have it in headers, append it
                analyzedPgn = analyzedPgn.trim() + ` ${tree.headers.result}`;
              } else if (!hasResult) {
                // If no result at all, use "*" (game in progress)
                analyzedPgn = analyzedPgn.trim() + ` *`;
              }

              // Only save if analysis was not cancelled
              if (!isCancelled()) {
                // Save analyzed PGN to file
                const fileName = `${gameHeaders.white}-${gameHeaders.black}-${i + 1}`.replace(/[<>:"/\\|?*]/g, "_");
                const filePath = await resolve(folderName, `${fileName}.pgn`);

                await writeTextFile(filePath, analyzedPgn);

                // Update the game object with the analyzed PGN so stats can be recalculated
                if (analyzeAllGameType === "local") {
                  const gameRecord = game as GameRecord;
                  // Update the game record with analyzed PGN
                  await updateGameRecord(gameRecord.id, { pgn: analyzedPgn });
                } else if (analyzeAllGameType === "chesscom") {
                  const chessComGame = game as ChessComGame;
                  chessComGame.pgn = analyzedPgn;
                  // Persist the analyzed PGN
                  await saveAnalyzedGame(chessComGame.url, analyzedPgn);
                  // Update the games array to trigger re-render and stats recalculation
                  setChessComGames((prev) => {
                    const updated = [...prev];
                    const index = updated.findIndex((g) => g.url === chessComGame.url);
                    if (index >= 0) {
                      updated[index] = { ...chessComGame };
                    }
                    return updated;
                  });
                } else if (analyzeAllGameType === "lichess") {
                  const lichessGame = game as typeof lichessGames[0];
                  lichessGame.pgn = analyzedPgn;
                  // Persist the analyzed PGN
                  await saveAnalyzedGame(lichessGame.id, analyzedPgn);
                  // Update the games array to trigger re-render and stats recalculation
                  setLichessGames((prev) => {
                    const updated = [...prev];
                    const index = updated.findIndex((g) => g.id === lichessGame.id);
                    if (index >= 0) {
                      updated[index] = { ...lichessGame };
                    }
                    return updated;
                  });
                }

                successCount++;
              }
            } catch (error) {
              info(`Failed to analyze game ${i + 1}: ${error}`);
              failCount++;
            }

            // Check if cancelled before updating progress
            if (isCancelled()) {
              if (currentAnalysisId && defaultEngine) {
                try {
                  await commands.stopEngine(defaultEngine.path, currentAnalysisId);
                } catch {
                  // Ignore errors when stopping
                }
              }
              notifications.show({
                title: "Analysis Cancelled",
                message: `Analysis stopped after ${successCount} games (${failCount} failed).`,
                color: "yellow",
              });
              break;
            }
            
            // Update progress in modal
            onProgress(i + 1, gamesToAnalyze.length);
            
            // Update notifications less frequently
            if ((i + 1) % 10 === 0 || i === gamesToAnalyze.length - 1) {
              notifications.show({
                title: "Analysis Progress",
                message: `Analyzed ${i + 1}/${gamesToAnalyze.length} games (${successCount} success, ${failCount} failed)`,
                color: "blue",
              });
            }
          }

          // Final progress update
          onProgress(gamesToAnalyze.length, gamesToAnalyze.length);

          // Refresh games to update stats
          if (analyzeAllGameType === "local") {
            const updatedGames = await getRecentGames(50);
            setRecentGames(updatedGames);
          }

          notifications.show({
            title: "Analysis Complete",
            message: `Analyzed ${successCount} games successfully. Files saved to: ${folderName}`,
            color: "green",
          });
        }}
        gameCount={
          analyzeAllGameType === "local"
            ? recentGames.filter((g) => g.pgn || g.moves.length > 0).length
            : analyzeAllGameType === "chesscom"
              ? chessComGames.filter((g) => g.pgn).length
              : analyzeAllGameType === "lichess"
                ? lichessGames.filter((g) => g.pgn).length
                : 0
        }
      />
    </Stack>
  );
}
