import type { MantineColor } from "@mantine/core";
import { Grid, Stack } from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { IconBolt, IconChess, IconClock, IconStopwatch } from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { appDataDir, resolve } from "@tauri-apps/api/path";
import { mkdir, writeTextFile } from "@tauri-apps/plugin-fs";
import { loadFideProfile, saveFideProfile, deleteFideProfile, type FideProfile } from "@/utils/fideProfile";
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
import { getAllAnalyzedGames, saveAnalyzedGame, saveGameStats } from "@/utils/analyzedGames";
import { getGameStats, getMainLine, getPGN, parsePGN } from "@/utils/chess";
import { type ChessComGame } from "@/utils/chess.com/api";
import { type DailyGoal, getDailyGoals } from "@/utils/dailyGoals";
import { calculateEstimatedElo } from "@/utils/eloEstimation";
import type { LocalEngine } from "@/utils/engines";
import { createFile } from "@/utils/files";
import { deleteGameRecord, type GameRecord, type GameStats, getRecentGames, updateGameRecord } from "@/utils/gameRecords";
import { getDatabases, query_games } from "@/utils/db";
import { getPuzzleStats, getTodayPuzzleCount } from "@/utils/puzzleStreak";
import { createTab, genID, type Tab } from "@/utils/tabs";
import type { TreeState } from "@/utils/treeReducer";
import { unwrap } from "@/utils/unwrap";
import { type AnalyzeAllConfig, AnalyzeAllModal } from "./components/AnalyzeAllModal";
import { DailyGoalsCard } from "./components/DailyGoalsCard";
import { GamesHistoryCard } from "./components/GamesHistoryCard";
import { PuzzleStatsCard } from "./components/PuzzleStatsCard";
import { QuickActionsGrid } from "./components/QuickActionsGrid";
import { type Suggestion, SuggestionsCard } from "./components/SuggestionsCard";
import { UserProfileCard } from "./components/UserProfileCard";
import { WelcomeCard } from "./components/WelcomeCard";
import { getChessTitle } from "./utils/chessTitle";
import {
  convertNormalizedToChessComGame,
  convertNormalizedToLichessGame,
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
  const [unanalyzedGameCount, setUnanalyzedGameCount] = useState<number | null>(null);
  
  // FIDE player information
  const [fideId, setFideId] = useState<string | null>(null);
  const [fidePlayer, setFidePlayer] = useState<{ 
    name: string; 
    firstName: string; 
    gender: "male" | "female";
    title?: string;
    standardRating?: number;
    rapidRating?: number;
    blitzRating?: number;
    worldRank?: number;
    nationalRank?: number;
    photo?: string;
    age?: number;
    birthYear?: number;
  } | null>(null);
  
  // Display name - independent of FIDE ID
  const [displayName, setDisplayName] = useState<string>("");

  useEffect(() => {
    // Load display name from localStorage
    const storedDisplayName = localStorage.getItem("pawn-appetit.displayName");
    if (storedDisplayName !== null) {
      setDisplayName(storedDisplayName);
    }
    
    // Load FIDE profile
    loadFideProfile().then((profile) => {
      if (profile) {
        setFideId(profile.fideId);
                const playerData = {
          name: profile.name,
          firstName: profile.firstName,
          gender: profile.gender,
          title: profile.title,
          standardRating: profile.standardRating,
          rapidRating: profile.rapidRating,
          blitzRating: profile.blitzRating,
          worldRank: profile.worldRank,
          nationalRank: profile.nationalRank,
          photo: profile.photo,
          age: profile.age,
          birthYear: profile.birthYear,
        };
        setFidePlayer(playerData);
        
        // If there's no saved displayName but there's a firstName from FIDE, use it as fallback
        if (storedDisplayName === null && profile.firstName) {
          setDisplayName(profile.firstName);
          localStorage.setItem("pawn-appetit.displayName", profile.firstName);
        }
      }
    });
  }, []);

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
  const [isLoadingLichessGames, setIsLoadingLichessGames] = useState(false);
  useEffect(() => {
    const loadGamesFromDatabase = async () => {
      const usersToFetch =
        selectedLichessUser === "all" ? lichessUsernames : selectedLichessUser ? [selectedLichessUser] : [];
      
      // Clear games and set loading immediately when filter changes
      setLichessGames([]);
      setIsLoadingLichessGames(true);
      
      if (usersToFetch.length > 0) {
        // Small delay to ensure React renders the loader
        await new Promise((resolve) => setTimeout(resolve, 50));
        try {
          // Get all databases
          const databases = await getDatabases();
          
          // Find databases for the selected users
          const allGames: Array<{
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
          }> = [];

          for (const username of usersToFetch) {
            // Find database for this user (format: {username}_lichess.db3)
            const dbInfo = databases.find(
              (db) => db.type === "success" && 
              (db.filename === `${username}_lichess.db3` || 
               db.filename.toLowerCase() === `${username}_lichess.db3`.toLowerCase())
            );

            if (dbInfo && dbInfo.type === "success") {
              try {
                // Query games from database, sorted by date descending, limit 50
                const queryResult = await query_games(dbInfo.file, {
                  options: {
                    page: 1,
                    pageSize: 50,
                    sort: "date",
                    direction: "desc",
                    skipCount: true,
                  },
                });

                if (queryResult.data) {
                  // Convert NormalizedGame to LichessGame format
                  const convertedGames = queryResult.data.map(convertNormalizedToLichessGame);
                  
                  // Filter games to only include those that belong to the selected user
                  const filteredGames = convertedGames.filter((game) => {
                    if (selectedLichessUser === "all") return true;
                    const gameWhiteName = (game.players.white.user?.name || "").toLowerCase();
                    const gameBlackName = (game.players.black.user?.name || "").toLowerCase();
                    const selectedUserLower = (selectedLichessUser || "").toLowerCase();
                    return gameWhiteName === selectedUserLower || gameBlackName === selectedUserLower;
                  });

                  allGames.push(...filteredGames);
                }
              } catch (error) {
                console.error(`Error loading games from database for ${username}:`, error);
              }
            }
          }

          // Sort all games by createdAt descending and limit to 50
          allGames.sort((a, b) => b.createdAt - a.createdAt);
          const games = allGames.slice(0, 50);

          // Load analyzed PGNs from storage
          const analyzedGames = await getAllAnalyzedGames();
          // Create a new array to ensure React detects the change
          const gamesWithAnalysis = games.map((game) => {
            if (analyzedGames[game.id]) {
              return { ...game, pgn: analyzedGames[game.id] };
            }
            return game;
          });

          setLichessGames(gamesWithAnalysis);
        } catch (error) {
          console.error("Error loading Lichess games from database:", error);
        } finally {
          setIsLoadingLichessGames(false);
        }
      } else {
        setIsLoadingLichessGames(false);
      }
    };
    loadGamesFromDatabase();

    // Listen for lichess:games:updated event to refresh Lichess games after analysis
    const handleLichessGamesUpdated = async () => {
      setIsLoadingLichessGames(true);
      await new Promise((resolve) => setTimeout(resolve, 50));
      await loadGamesFromDatabase();
    };
    window.addEventListener("lichess:games:updated", handleLichessGamesUpdated);

    return () => {
      window.removeEventListener("lichess:games:updated", handleLichessGamesUpdated);
    };
  }, [lichessUsernames, selectedLichessUser]);

  const [chessComGames, setChessComGames] = useState<ChessComGame[]>([]);
  const [isLoadingChessComGames, setIsLoadingChessComGames] = useState(false);
  useEffect(() => {
    const loadGamesFromDatabase = async () => {
      const usersToFetch =
        selectedChessComUser === "all" ? chessComUsernames : selectedChessComUser ? [selectedChessComUser] : [];
      
      // Clear games and set loading immediately when filter changes
      setChessComGames([]);
      setIsLoadingChessComGames(true);
      
      if (usersToFetch.length > 0) {
        // Small delay to ensure React renders the loader
        await new Promise((resolve) => setTimeout(resolve, 50));
        try {
          // Get all databases
          const databases = await getDatabases();
          
          // Find databases for the selected users
          const allGames: ChessComGame[] = [];

          for (const username of usersToFetch) {
            // Find database for this user (format: {username}_chesscom.db3)
            const dbInfo = databases.find(
              (db) => db.type === "success" && 
              (db.filename === `${username}_chesscom.db3` || 
               db.filename.toLowerCase() === `${username}_chesscom.db3`.toLowerCase())
            );

            if (dbInfo && dbInfo.type === "success") {
              try {
                // Query games from database, sorted by date descending, limit 100
                const queryResult = await query_games(dbInfo.file, {
                  options: {
                    page: 1,
                    pageSize: 100,
                    sort: "date",
                    direction: "desc",
                    skipCount: true,
                  },
                });

                if (queryResult.data) {
                  // Convert NormalizedGame to ChessComGame format
                  const convertedGames = queryResult.data.map(convertNormalizedToChessComGame);
                  
                  // Filter games to only include those that belong to the selected user
                  const filteredGames = convertedGames.filter((game) => {
                    if (selectedChessComUser === "all") return true;
                    const gameWhiteName = (game.white.username || "").toLowerCase();
                    const gameBlackName = (game.black.username || "").toLowerCase();
                    const selectedUserLower = (selectedChessComUser || "").toLowerCase();
                    return gameWhiteName === selectedUserLower || gameBlackName === selectedUserLower;
                  });

                  allGames.push(...filteredGames);
                }
              } catch (error) {
                console.error(`Error loading games from database for ${username}:`, error);
              }
            }
          }

          // Sort all games by end_time descending and limit to 100
          allGames.sort((a, b) => b.end_time - a.end_time);
          const games = allGames.slice(0, 100);

          // Load analyzed PGNs from storage
          const analyzedGames = await getAllAnalyzedGames();
          // Create a new array to ensure React detects the change
          const gamesWithAnalysis = games.map((game) => {
            if (analyzedGames[game.url]) {
              return { ...game, pgn: analyzedGames[game.url] };
            }
            return game;
          });

          setChessComGames(gamesWithAnalysis);
        } catch (error) {
          console.error("Error loading Chess.com games from database:", error);
        } finally {
          setIsLoadingChessComGames(false);
        }
      } else {
        setIsLoadingChessComGames(false);
      }
    };
    loadGamesFromDatabase();

    // Listen for chesscom:games:updated event to refresh Chess.com games after analysis
    const handleChessComGamesUpdated = async () => {
      setIsLoadingChessComGames(true);
      await new Promise((resolve) => setTimeout(resolve, 50));
      await loadGamesFromDatabase();
    };
    window.addEventListener("chesscom:games:updated", handleChessComGamesUpdated);

    return () => {
      window.removeEventListener("chesscom:games:updated", handleChessComGamesUpdated);
    };
  }, [chessComUsernames, selectedChessComUser]);

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
          title: `${t("common.continue")}: ${nextLesson.title.default}`,
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
          title: today === 0 ? t("features.dashboard.startPuzzleStreak") : t("features.dashboard.keepStreak"),
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
            name: t("features.dashboard.newGame"),
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
        playerFirstName={displayName || fidePlayer?.firstName || undefined}
        playerGender={fidePlayer?.gender}
        fideInfo={fidePlayer ? {
          title: fidePlayer.title,
          standardRating: fidePlayer.standardRating,
          rapidRating: fidePlayer.rapidRating,
          blitzRating: fidePlayer.blitzRating,
          worldRank: fidePlayer.worldRank,
          nationalRank: fidePlayer.nationalRank,
          photo: fidePlayer.photo,
          age: fidePlayer.age,
        } : undefined}
      />

      <Grid>
        <Grid.Col span={{ base: 12, sm: 12, md: 4, lg: 3, xl: 3 }}>
          <UserProfileCard
            name={user.name}
            handle={user.handle}
            title={getChessTitle(user.rating)}
            ratingHistory={ratingHistory}
            customName={displayName}
            onFideUpdate={async (newFideId, newFidePlayer, newDisplayName) => {
              setFideId(newFideId);
              
              // Save display name if provided (can be empty string)
              if (newDisplayName !== undefined) {
                setDisplayName(newDisplayName);
                localStorage.setItem("pawn-appetit.displayName", newDisplayName);
              }
              
              if (newFidePlayer) {
                // Save to JSON file first
                const profileToSave = {
                  fideId: newFideId,
                  name: newFidePlayer.name,
                  firstName: newFidePlayer.firstName,
                  lastName: "", // Will be filled if available
                  gender: newFidePlayer.gender,
                  title: newFidePlayer.title,
                  standardRating: newFidePlayer.standardRating,
                  rapidRating: newFidePlayer.rapidRating,
                  blitzRating: newFidePlayer.blitzRating,
                  worldRank: newFidePlayer.worldRank,
                  nationalRank: newFidePlayer.nationalRank,
                  photo: newFidePlayer.photo,
                  age: newFidePlayer.age,
                  birthYear: newFidePlayer.birthYear,
                };
                await saveFideProfile(profileToSave);
                // Update state after saving - this triggers re-render
                setFidePlayer(newFidePlayer);
              } else {
                setFidePlayer(null);
                await deleteFideProfile();
              }
            }}
            fidePlayer={fidePlayer}
            currentFideId={fideId || undefined}
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
                  // Store the game URL and username in sessionStorage so we can save the analyzed PGN when analysis completes
                  if (tabId && typeof window !== "undefined") {
                    sessionStorage.setItem(`${tabId}_chessComGameUrl`, game.url);
                    // Determine which username is the user's account
                    const accountUsername = selectedChessComUser && selectedChessComUser !== "all" 
                      ? selectedChessComUser 
                      : chessComUsernames.find(u => 
                          u.toLowerCase() === game.white.username.toLowerCase() || 
                          u.toLowerCase() === game.black.username.toLowerCase()
                        ) || game.white.username;
                    sessionStorage.setItem(`${tabId}_chessComUsername`, accountUsername);
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
                  // Store the game ID and username in sessionStorage so we can save the analyzed PGN when analysis completes
                  if (tabId && typeof window !== "undefined") {
                    sessionStorage.setItem(`${tabId}_lichessGameId`, game.id);
                    // Determine which username is the user's account
                    const gameWhiteName = game.players.white.user?.name || "";
                    const gameBlackName = game.players.black.user?.name || "";
                    const accountUsername = selectedLichessUser && selectedLichessUser !== "all" 
                      ? selectedLichessUser 
                      : lichessUsernames.find(u => 
                          u.toLowerCase() === gameWhiteName.toLowerCase() || 
                          u.toLowerCase() === gameBlackName.toLowerCase()
                        ) || gameWhiteName;
                    sessionStorage.setItem(`${tabId}_lichessUsername`, accountUsername);
                  }
                });
                navigate({ to: "/boards" });
              }
            }}
            onAnalyzeAllLocal={async () => {
              setAnalyzeAllGameType("local");
              // Calculate unanalyzed games count
              const analyzedGames = await getAllAnalyzedGames();
              const allGames = recentGames.filter((g) => g.pgn || g.moves.length > 0);
              const unanalyzed = allGames.filter((game) => {
                const gameRecord = game as GameRecord;
                if (!gameRecord.pgn) return true;
                const hasAnalysis = /\[%eval|\[%clk|\$[0-9]|!!|!\?|\?!/i.test(gameRecord.pgn);
                return !hasAnalysis;
              });
              setUnanalyzedGameCount(unanalyzed.length);
              setAnalyzeAllModalOpened(true);
            }}
            onAnalyzeAllChessCom={async () => {
              setAnalyzeAllGameType("chesscom");
              // Calculate unanalyzed games count
              const analyzedGames = await getAllAnalyzedGames();
              const allGames = chessComGames.filter((g) => g.pgn);
              const unanalyzed = allGames.filter((game) => {
                const chessComGame = game as ChessComGame;
                return !analyzedGames[chessComGame.url];
              });
              setUnanalyzedGameCount(unanalyzed.length);
              setAnalyzeAllModalOpened(true);
            }}
            onAnalyzeAllLichess={async () => {
              setAnalyzeAllGameType("lichess");
              // Calculate unanalyzed games count
              const analyzedGames = await getAllAnalyzedGames();
              const allGames = lichessGames.filter((g) => g.pgn);
              const unanalyzed = allGames.filter((game) => {
                const lichessGame = game as (typeof lichessGames)[0];
                return !analyzedGames[lichessGame.id];
              });
              setUnanalyzedGameCount(unanalyzed.length);
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
          setUnanalyzedGameCount(null);
        }}
        onAnalyze={async (config, onProgress, isCancelled) => {
          if (!defaultEngine) {
            notifications.show({
              title: t("features.dashboard.noEngineAvailable"),
              message: t("features.dashboard.noEngineAvailableMessage"),
              color: "red",
            });
            return;
          }

          // Get all analyzed games to filter out already analyzed ones if needed
          const analyzedGames = await getAllAnalyzedGames();
          
          let allGames =
            analyzeAllGameType === "local"
              ? recentGames.filter((g) => g.pgn || g.moves.length > 0)
              : analyzeAllGameType === "chesscom"
                ? chessComGames.filter((g) => g.pgn)
                : analyzeAllGameType === "lichess"
                  ? lichessGames.filter((g) => g.pgn)
                  : [];

          // Filter to only unanalyzed games if requested
          const gamesToAnalyze =
            config.analyzeMode === "unanalyzed"
              ? allGames.filter((game) => {
                  if (analyzeAllGameType === "local") {
                    const gameRecord = game as GameRecord;
                    // For local games, check if PGN exists and has analysis annotations
                    // If PGN exists but doesn't have analysis markers, consider it unanalyzed
                    if (!gameRecord.pgn) return true;
                    // Check if PGN has analysis annotations (evaluation comments, NAGs, etc.)
                    const hasAnalysis = /\[%eval|\[%clk|\$[0-9]|!!|!\?|\?!/i.test(gameRecord.pgn);
                    return !hasAnalysis;
                  } else if (analyzeAllGameType === "chesscom") {
                    const chessComGame = game as ChessComGame;
                    // Check if this game has been analyzed
                    return !analyzedGames[chessComGame.url];
                  } else {
                    // Lichess
                    const lichessGame = game as (typeof lichessGames)[0];
                    // Check if this game has been analyzed
                    return !analyzedGames[lichessGame.id];
                  }
                })
              : allGames;

          if (gamesToAnalyze.length === 0) {
            notifications.show({
              title: "No Games to Analyze",
              message:
                config.analyzeMode === "unanalyzed"
                  ? "No unanalyzed games available to analyze."
                  : "No games with PGN data available to analyze.",
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
            title: t("features.dashboard.analysisStarted"),
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
                title: t("features.dashboard.analysisCancelled"),
                message: `Analysis stopped. ${successCount} games analyzed successfully.`,
                color: "yellow",
              });
              break;
            }
            onProgress(i, gamesToAnalyze.length);
            const game = gamesToAnalyze[i];
            let analysisCancelled = false;
            let cancellationCheckInterval: NodeJS.Timeout | null = null;
            
            try {
              let tree: TreeState;
              let moves: string[];
              let initialFen: string;
              let gameHeaders: ReturnType<
                typeof createLocalGameHeaders | typeof createChessComGameHeaders | typeof createLichessGameHeaders
              >;

              if (analyzeAllGameType === "local") {
                // For local games, use PGN if available, otherwise reconstruct from moves
                const gameRecord = game as GameRecord;
                const pgn =
                  gameRecord.pgn || createPGNFromMoves(gameRecord.moves, gameRecord.result, gameRecord.initialFen);
                tree = await parsePGN(pgn, gameRecord.initialFen);
                moves = gameRecord.moves;
                initialFen = gameRecord.initialFen || "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
                gameHeaders = createLocalGameHeaders(gameRecord);
              } else {
                // For Chess.com and Lichess games, parse PGN
                const pgn = (game as ChessComGame | (typeof lichessGames)[0]).pgn!;
                tree = await parsePGN(pgn);
                // Extract UCI moves from the main line using getMainLine
                const is960 = tree.headers?.variant === "Chess960";
                moves = getMainLine(tree.root, is960);
                initialFen = tree.headers?.fen || "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
                gameHeaders =
                  analyzeAllGameType === "chesscom"
                    ? createChessComGameHeaders(game as ChessComGame)
                    : createLichessGameHeaders(game as (typeof lichessGames)[0]);
              }

              // Check if cancelled before starting analysis
              if (isCancelled()) {
                if (currentAnalysisId && defaultEngine) {
                  try {
                    await commands.stopEngine(defaultEngine.path, currentAnalysisId);
                  } catch {
                    // Ignore errors when stopping
                  }
                }
                notifications.show({
                  title: t("features.dashboard.analysisCancelled"),
                  message: `Analysis stopped. ${successCount} games analyzed successfully.`,
                  color: "yellow",
                });
                break;
              }

              // Analyze the game
              currentAnalysisId = `analyze_all_${analyzeAllGameType}_${i}_${Date.now()}`;
              
              // Start analysis and check for cancellation periodically
              
              const analysisPromise = commands.analyzeGame(
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

              // Check for cancellation while analysis is running
              cancellationCheckInterval = setInterval(() => {
                if (isCancelled()) {
                  analysisCancelled = true;
                  if (currentAnalysisId && defaultEngine) {
                    commands.stopEngine(defaultEngine.path, currentAnalysisId).catch(() => {
                      // Ignore errors when stopping
                    });
                  }
                  if (cancellationCheckInterval) {
                    clearInterval(cancellationCheckInterval);
                    cancellationCheckInterval = null;
                  }
                }
              }, 100); // Check every 100ms

              let analysisResult;
              try {
                analysisResult = await analysisPromise;
              } catch (error) {
                if (cancellationCheckInterval) {
                  clearInterval(cancellationCheckInterval);
                  cancellationCheckInterval = null;
                }
                if (analysisCancelled || isCancelled()) {
                  notifications.show({
                    title: t("features.dashboard.analysisCancelled"),
                    message: `Analysis stopped. ${successCount} games analyzed successfully.`,
                    color: "yellow",
                  });
                  break;
                }
                throw error;
              }
              
              if (cancellationCheckInterval) {
                clearInterval(cancellationCheckInterval);
                cancellationCheckInterval = null;
              }

              // Check again if cancelled after analysis - if cancelled, don't process the result
              if (isCancelled() || analysisCancelled) {
                if (currentAnalysisId && defaultEngine) {
                  try {
                    await commands.stopEngine(defaultEngine.path, currentAnalysisId);
                  } catch {
                    // Ignore errors when stopping
                  }
                }
                notifications.show({
                  title: t("features.dashboard.analysisCancelled"),
                  message: `Analysis stopped. ${successCount} games analyzed successfully.`,
                  color: "yellow",
                });
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
                  title: t("features.dashboard.analysisCancelled"),
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
              const hasResult =
                /\[Result\s+"[^"]+"\]/.test(analyzedPgn) || /\s+(1-0|0-1|1\/2-1\/2|\*)\s*$/.test(analyzedPgn);
              if (!hasResult && tree.headers?.result) {
                // If result is missing but we have it in headers, append it
                analyzedPgn = analyzedPgn.trim() + ` ${tree.headers.result}`;
              } else if (!hasResult) {
                // If no result at all, use "*" (game in progress)
                analyzedPgn = analyzedPgn.trim() + ` *`;
              }

              // Only save if analysis was not cancelled - double check before saving
              if (!isCancelled() && !analysisCancelled) {
                // Save analyzed PGN to file
                const fileName = `${gameHeaders.white}-${gameHeaders.black}-${i + 1}`.replace(/[<>:"/\\|?*]/g, "_");
                const filePath = await resolve(folderName, `${fileName}.pgn`);

                await writeTextFile(filePath, analyzedPgn);

                // Calculate stats from the analyzed game
                const reportStats = getGameStats(tree.root);

                // Update the game object with the analyzed PGN and stats
                if (analyzeAllGameType === "local") {
                  const gameRecord = game as GameRecord;
                  
                  // Determine which color the user played
                  const isUserWhite = gameRecord.white.type === "human";
                  const userColor = isUserWhite ? "white" : "black";
                  
                  // Get stats for the user's color from the report
                  const accuracy = userColor === "white" ? reportStats.whiteAccuracy : reportStats.blackAccuracy;
                  const acpl = userColor === "white" ? reportStats.whiteCPL : reportStats.blackCPL;
                  
                  // Calculate estimated Elo
                  let calculatedStats: GameStats | null = null;
                  if (accuracy > 0 || acpl > 0) {
                    calculatedStats = {
                      accuracy,
                      acpl,
                      estimatedElo: acpl > 0 ? calculateEstimatedElo(acpl) : undefined,
                    };
                  }
                  
                  // Update the game record with analyzed PGN and stats
                  if (calculatedStats) {
                    await updateGameRecord(gameRecord.id, { pgn: analyzedPgn, stats: calculatedStats });
                  } else {
                    await updateGameRecord(gameRecord.id, { pgn: analyzedPgn });
                  }
                } else if (analyzeAllGameType === "chesscom") {
                  const chessComGame = game as ChessComGame;
                  chessComGame.pgn = analyzedPgn;
                  // Persist the analyzed PGN
                  await saveAnalyzedGame(chessComGame.url, analyzedPgn);
                  
                  // Calculate and save stats
                  const whiteUsername = chessComGame.white.username.toLowerCase();
                  const blackUsername = chessComGame.black.username.toLowerCase();
                  const accountUsername = selectedChessComUser && selectedChessComUser !== "all" 
                    ? selectedChessComUser.toLowerCase()
                    : chessComUsernames.find(u => 
                        u.toLowerCase() === whiteUsername || 
                        u.toLowerCase() === blackUsername
                      )?.toLowerCase() || whiteUsername;
                  
                  const isUserWhite = whiteUsername === accountUsername;
                  const userColor = isUserWhite ? "white" : "black";
                  
                  const accuracy = userColor === "white" ? reportStats.whiteAccuracy : reportStats.blackAccuracy;
                  const acpl = userColor === "white" ? reportStats.whiteCPL : reportStats.blackCPL;
                  
                  if (accuracy > 0 || acpl > 0) {
                    const stats: GameStats = {
                      accuracy,
                      acpl,
                      estimatedElo: acpl > 0 ? calculateEstimatedElo(acpl) : undefined,
                    };
                    await saveGameStats(chessComGame.url, stats);
                  }
                  
                  // Update the games array to trigger re-render and stats recalculation
                  // Only update if the game belongs to the selected user
                  setChessComGames((prev) => {
                    const updated = [...prev];
                    const index = updated.findIndex((g) => g.url === chessComGame.url);
                    if (index >= 0) {
                      // Verify the game belongs to the selected user before updating (case-insensitive)
                      const gameWhiteName = (chessComGame.white.username || "").toLowerCase();
                      const gameBlackName = (chessComGame.black.username || "").toLowerCase();
                      const selectedUserLower = (selectedChessComUser || "").toLowerCase();
                      const belongsToSelectedUser =
                        selectedChessComUser === "all" ||
                        !selectedChessComUser ||
                        gameWhiteName === selectedUserLower ||
                        gameBlackName === selectedUserLower;
                      if (belongsToSelectedUser) {
                        updated[index] = { ...chessComGame };
                      } else {
                        // If game doesn't belong to selected user, remove it from the list
                        updated.splice(index, 1);
                      }
                    }
                    return updated;
                  });
                } else if (analyzeAllGameType === "lichess") {
                  const lichessGame = game as (typeof lichessGames)[0];
                  lichessGame.pgn = analyzedPgn;
                  // Persist the analyzed PGN
                  await saveAnalyzedGame(lichessGame.id, analyzedPgn);
                  
                  // Calculate and save stats
                  const whiteUsername = (lichessGame.players.white.user?.name || "").toLowerCase();
                  const blackUsername = (lichessGame.players.black.user?.name || "").toLowerCase();
                  const accountUsername = selectedLichessUser && selectedLichessUser !== "all" 
                    ? selectedLichessUser.toLowerCase()
                    : lichessUsernames.find(u => 
                        u.toLowerCase() === whiteUsername || 
                        u.toLowerCase() === blackUsername
                      )?.toLowerCase() || whiteUsername;
                  
                  const isUserWhite = whiteUsername === accountUsername;
                  const userColor = isUserWhite ? "white" : "black";
                  
                  const accuracy = userColor === "white" ? reportStats.whiteAccuracy : reportStats.blackAccuracy;
                  const acpl = userColor === "white" ? reportStats.whiteCPL : reportStats.blackCPL;
                  
                  if (accuracy > 0 || acpl > 0) {
                    const stats: GameStats = {
                      accuracy,
                      acpl,
                      estimatedElo: acpl > 0 ? calculateEstimatedElo(acpl) : undefined,
                    };
                    await saveGameStats(lichessGame.id, stats);
                  }
                  
                  // Update the games array to trigger re-render and stats recalculation
                  // Only update if the game belongs to the selected user
                  setLichessGames((prev) => {
                    const updated = [...prev];
                    const index = updated.findIndex((g) => g.id === lichessGame.id);
                    if (index >= 0) {
                      // Verify the game belongs to the selected user before updating (case-insensitive)
                      const gameWhiteName = (lichessGame.players.white.user?.name || "").toLowerCase();
                      const gameBlackName = (lichessGame.players.black.user?.name || "").toLowerCase();
                      const selectedUserLower = (selectedLichessUser || "").toLowerCase();
                      const belongsToSelectedUser =
                        selectedLichessUser === "all" ||
                        !selectedLichessUser ||
                        gameWhiteName === selectedUserLower ||
                        gameBlackName === selectedUserLower;
                      if (belongsToSelectedUser) {
                        updated[index] = { ...lichessGame };
                      } else {
                        // If game doesn't belong to selected user, remove it from the list
                        updated.splice(index, 1);
                      }
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
                title: t("features.dashboard.analysisCancelled"),
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
                title: t("features.dashboard.analysisProgress"),
                message: `Analyzed ${i + 1}/${gamesToAnalyze.length} games (${successCount} success, ${failCount} failed)`,
                color: "blue",
              });
            }
          }

          // Only show completion message if not cancelled
          if (!isCancelled()) {
            // Final progress update
            onProgress(gamesToAnalyze.length, gamesToAnalyze.length);

            // Refresh games to update stats
            if (analyzeAllGameType === "local") {
              const updatedGames = await getRecentGames(50);
              setRecentGames(updatedGames);
            }

            notifications.show({
              title: t("features.dashboard.analysisComplete"),
              message: `Analyzed ${successCount} games successfully. Files saved to: ${folderName}`,
              color: "green",
            });
          } else {
            // If cancelled, make sure engine is stopped
            if (currentAnalysisId && defaultEngine) {
              try {
                await commands.stopEngine(defaultEngine.path, currentAnalysisId);
              } catch {
                // Ignore errors when stopping
              }
            }
          }
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
        unanalyzedGameCount={unanalyzedGameCount ?? undefined}
      />
    </Stack>
  );
}
