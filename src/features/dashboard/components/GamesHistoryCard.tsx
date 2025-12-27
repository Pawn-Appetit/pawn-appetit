import { Button, Card, Group, Select, Tabs } from "@mantine/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { IconChartBar } from "@tabler/icons-react";
import type { ChessComGame } from "@/utils/chess.com/api";
import type { GameRecord } from "@/utils/gameRecords";
import type { FavoriteGame } from "@/utils/favoriteGames";
import { getAllAnalyzedGames, getAnalyzedGame } from "@/utils/analyzedGames";
import { ChessComGamesTab } from "./ChessComGamesTab";
import { LichessGamesTab } from "./LichessGamesTab";
import { LocalGamesTab } from "./LocalGamesTab";
import { FavoriteGamesTab } from "./FavoriteGamesTab";

interface LichessGame {
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
}

interface GamesHistoryCardProps {
  activeTab: string | null;
  onTabChange: (tab: string | null) => void;
  localGames: GameRecord[];
  chessComGames: ChessComGame[];
  lichessGames: LichessGame[];
  chessComUsernames: string[];
  lichessUsernames: string[];
  selectedChessComUser: string | null;
  selectedLichessUser: string | null;
  isLoadingChessComGames?: boolean;
  isLoadingLichessGames?: boolean;
  onChessComUserChange: (user: string | null) => void;
  onLichessUserChange: (user: string | null) => void;
  onAnalyzeLocalGame: (game: GameRecord) => void;
  onAnalyzeChessComGame: (game: ChessComGame) => void;
  onAnalyzeLichessGame: (game: LichessGame) => void;
  onAnalyzeAllLocal?: () => void;
  onAnalyzeAllChessCom?: () => void;
  onAnalyzeAllLichess?: () => void;
  onDeleteLocalGame?: (gameId: string) => void;
  onToggleFavoriteLocal?: (gameId: string) => Promise<void>;
  onToggleFavoriteChessCom?: (gameId: string) => Promise<void>;
  onToggleFavoriteLichess?: (gameId: string) => Promise<void>;
  favoriteGames?: FavoriteGame[];
  onGenerateStats?: (playerName: string, gameType: "local" | "chesscom" | "lichess") => Promise<void>;
  selectedPlayerName?: string | null;
  gameHistoryLimit: number;
  onGameHistoryLimitChange: (limit: number) => void;
}

export function GamesHistoryCard({
  activeTab,
  onTabChange,
  localGames,
  chessComGames,
  lichessGames,
  chessComUsernames,
  lichessUsernames,
  selectedChessComUser,
  selectedLichessUser,
  isLoadingChessComGames = false,
  isLoadingLichessGames = false,
  onChessComUserChange,
  onLichessUserChange,
  onAnalyzeLocalGame,
  onAnalyzeChessComGame,
  onAnalyzeLichessGame,
  onAnalyzeAllLocal,
  onAnalyzeAllChessCom,
  onAnalyzeAllLichess,
  onDeleteLocalGame,
  onToggleFavoriteLocal,
  onToggleFavoriteChessCom,
  onToggleFavoriteLichess,
  favoriteGames = [],
  onGenerateStats,
  selectedPlayerName,
  gameHistoryLimit,
  onGameHistoryLimitChange,
}: GamesHistoryCardProps) {
  const { t } = useTranslation();

  const [analyzedCount, setAnalyzedCount] = useState(0);

  // Count analyzed games for the selected player
  useEffect(() => {
    // For Chess.com, we need selectedChessComUser to be set and not "all"
    if (activeTab === "chesscom") {
      if (!selectedChessComUser || selectedChessComUser === "all" || !onGenerateStats) {
        setAnalyzedCount(0);
        return;
      }
    } else if (activeTab === "local") {
      if (!selectedPlayerName || !onGenerateStats) {
        setAnalyzedCount(0);
        return;
      }
    } else if (activeTab === "lichess") {
      if (!selectedLichessUser || selectedLichessUser === "all" || !onGenerateStats) {
        setAnalyzedCount(0);
        return;
      }
    } else {
      setAnalyzedCount(0);
      return;
    }

    let cancelled = false;

    const countGames = async () => {
      try {
        const analyzedGames = await getAllAnalyzedGames();
        let count = 0;

        if (activeTab === "local") {
          // Count analyzed local games for the player
          for (const game of localGames) {
            if (cancelled) break;
            const analyzedPgn = await getAnalyzedGame(game.id);
            if (analyzedPgn) {
              // Check if player name matches
              const playerNameLower = selectedPlayerName!.toLowerCase();
              const whiteMatch = game.white.name?.toLowerCase().includes(playerNameLower) || 
                               playerNameLower.includes(game.white.name?.toLowerCase() || "");
              const blackMatch = game.black.name?.toLowerCase().includes(playerNameLower) || 
                               playerNameLower.includes(game.black.name?.toLowerCase() || "");
              if (whiteMatch || blackMatch) {
                count++;
              }
            }
          }
        } else if (activeTab === "chesscom" && selectedChessComUser && selectedChessComUser !== "all") {
          // Count analyzed Chess.com games for the selected user
          for (const game of chessComGames) {
            if (cancelled) break;
            if (analyzedGames[game.url]) {
              const whiteMatch = game.white.username?.toLowerCase().includes(selectedChessComUser.toLowerCase()) || 
                               selectedChessComUser.toLowerCase().includes(game.white.username?.toLowerCase() || "");
              const blackMatch = game.black.username?.toLowerCase().includes(selectedChessComUser.toLowerCase()) || 
                               selectedChessComUser.toLowerCase().includes(game.black.username?.toLowerCase() || "");
              if (whiteMatch || blackMatch) {
                count++;
              }
            }
          }
        } else if (activeTab === "lichess" && selectedLichessUser && selectedLichessUser !== "all") {
          // Count analyzed Lichess games for the selected user
          for (const game of lichessGames) {
            if (cancelled) break;
            if (analyzedGames[game.id]) {
              const whiteMatch = game.players.white.user?.name?.toLowerCase().includes(selectedLichessUser.toLowerCase()) || 
                               selectedLichessUser.toLowerCase().includes(game.players.white.user?.name?.toLowerCase() || "");
              const blackMatch = game.players.black.user?.name?.toLowerCase().includes(selectedLichessUser.toLowerCase()) || 
                               selectedLichessUser.toLowerCase().includes(game.players.black.user?.name?.toLowerCase() || "");
              if (whiteMatch || blackMatch) {
                count++;
              }
            }
          }
        }

        if (!cancelled) {
          setAnalyzedCount(count);
          console.log(`[GenerateStats] Counted ${count} analyzed games for ${activeTab === "local" ? selectedPlayerName : activeTab === "chesscom" ? selectedChessComUser : selectedLichessUser}`);
        }
      } catch (error) {
        console.error("[GenerateStats] Error counting games:", error);
        if (!cancelled) {
          setAnalyzedCount(0);
        }
      }
    };

    countGames();

    return () => {
      cancelled = true;
    };
  }, [activeTab, selectedPlayerName, selectedChessComUser, localGames, chessComGames, onGenerateStats]);

  // Default height in pixels
  const DEFAULT_HEIGHT = 400;
  const MIN_HEIGHT = 200;
  const MAX_HEIGHT = 800;

  // Load saved height from localStorage
  const [height, setHeight] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("gamesHistoryCardHeight");
      return saved ? parseInt(saved, 10) : DEFAULT_HEIGHT;
    }
    return DEFAULT_HEIGHT;
  });

  const [isResizing, setIsResizing] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const resizeStartY = useRef<number>(0);
  const resizeStartHeight = useRef<number>(0);

  // Save height to localStorage whenever it changes
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("gamesHistoryCardHeight", height.toString());
    }
  }, [height]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    resizeStartY.current = e.clientY;
    if (cardRef.current) {
      resizeStartHeight.current = cardRef.current.offsetHeight;
    }
  }, []);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isResizing) return;

      const deltaY = e.clientY - resizeStartY.current;
      const newHeight = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, resizeStartHeight.current + deltaY));
      setHeight(newHeight);
    },
    [isResizing],
  );

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "row-resize";
      document.body.style.userSelect = "none";

      return () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };
    }
  }, [isResizing, handleMouseMove, handleMouseUp]);

  return (
    <Card
      ref={cardRef}
      withBorder
      p="lg"
      radius="md"
      style={{
        height: `${height}px`,
        position: "relative",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Resize handle at the top */}
      <div
        onMouseDown={handleMouseDown}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "8px",
          cursor: "row-resize",
          zIndex: 10,
          backgroundColor: "transparent",
        }}
        title="Drag to resize"
      />
      <Tabs
        value={activeTab}
        onChange={onTabChange}
        style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}
      >
        <Group justify="space-between" align="center" style={{ marginTop: "4px" }}>
          <Tabs.List>
            <Tabs.Tab value="local">Local</Tabs.Tab>
            <Tabs.Tab value="chesscom">Chess.com</Tabs.Tab>
            <Tabs.Tab value="lichess">Lichess</Tabs.Tab>
            <Tabs.Tab value="favorites">Favorites</Tabs.Tab>
          </Tabs.List>
          <Group gap="xs">
            <Select
              placeholder={t("features.dashboard.maxGames", "Max games")}
              value={String(gameHistoryLimit)}
              onChange={(value) => {
                if (!value) return;
                const parsed = Number(value);
                if (!Number.isNaN(parsed)) onGameHistoryLimitChange(parsed);
              }}
              data={[
                { value: "100", label: "100" },
                { value: "200", label: "200" },
                { value: "300", label: "300" },
                { value: "500", label: "500" },
                { value: "1000", label: "1000" },
              ]}
            />
          {activeTab === "chesscom" && (
            <Select
              placeholder="Filter by account"
              value={selectedChessComUser}
              onChange={onChessComUserChange}
              data={[
                { value: "all", label: t("features.dashboard.allAccounts") },
                ...chessComUsernames.map((name) => ({ value: name, label: name })),
              ]}
              disabled={chessComUsernames.length <= 1}
            />
          )}
          {activeTab === "lichess" && (
            <Select
              placeholder="Filter by account"
              value={selectedLichessUser}
              onChange={onLichessUserChange}
              data={[
                { value: "all", label: t("features.dashboard.allAccounts") },
                ...lichessUsernames.map((name) => ({ value: name, label: name })),
              ]}
              disabled={lichessUsernames.length <= 1}
            />
          )}
            {onGenerateStats &&
              ((activeTab === "local" && selectedPlayerName) || 
               (activeTab === "chesscom" && selectedChessComUser && selectedChessComUser !== "all") ||
               (activeTab === "lichess" && selectedLichessUser && selectedLichessUser !== "all")) && (
                <Button
                  leftSection={<IconChartBar size={16} />}
                  onClick={() => {
                    const gameType = activeTab === "local" ? "local" : activeTab === "chesscom" ? "chesscom" : "lichess";
                    const playerName = activeTab === "local" 
                      ? selectedPlayerName 
                      : activeTab === "chesscom"
                      ? (selectedChessComUser && selectedChessComUser !== "all" ? selectedChessComUser : selectedPlayerName)
                      : (selectedLichessUser && selectedLichessUser !== "all" ? selectedLichessUser : selectedPlayerName);
                    if (playerName) {
                      onGenerateStats(playerName, gameType);
                    }
                  }}
                  variant="light"
                  size="sm"
                >
                  {t("features.dashboard.generateStats", "Generate Stats")} ({analyzedCount})
                </Button>
              )}
          </Group>
        </Group>

        <Tabs.Panel
          value="local"
          pt="xs"
          style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}
        >
          <LocalGamesTab
            games={localGames}
            onAnalyzeGame={onAnalyzeLocalGame}
            onAnalyzeAll={onAnalyzeAllLocal}
            onDeleteGame={onDeleteLocalGame}
            onToggleFavorite={onToggleFavoriteLocal}
            favoriteGames={favoriteGames}
          />
        </Tabs.Panel>

        <Tabs.Panel
          value="chesscom"
          pt="xs"
          style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}
        >
          <ChessComGamesTab
            games={chessComGames}
            chessComUsernames={chessComUsernames}
            selectedUser={selectedChessComUser}
            isLoading={isLoadingChessComGames}
            onAnalyzeGame={onAnalyzeChessComGame}
            onAnalyzeAll={onAnalyzeAllChessCom}
            onToggleFavorite={onToggleFavoriteChessCom}
            favoriteGames={favoriteGames}
          />
        </Tabs.Panel>

        <Tabs.Panel
          value="lichess"
          pt="xs"
          style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}
        >
          <LichessGamesTab
            games={lichessGames}
            lichessUsernames={lichessUsernames}
            selectedUser={selectedLichessUser}
            isLoading={isLoadingLichessGames}
            onAnalyzeGame={onAnalyzeLichessGame}
            onAnalyzeAll={onAnalyzeAllLichess}
            onToggleFavorite={onToggleFavoriteLichess}
            favoriteGames={favoriteGames}
          />
        </Tabs.Panel>

        <Tabs.Panel
          value="favorites"
          pt="xs"
          style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}
        >
          <FavoriteGamesTab
            localGames={localGames}
            chessComGames={chessComGames}
            lichessGames={lichessGames}
            favoriteGames={favoriteGames}
            chessComUsernames={chessComUsernames}
            lichessUsernames={lichessUsernames}
            onAnalyzeLocalGame={onAnalyzeLocalGame}
            onAnalyzeChessComGame={onAnalyzeChessComGame}
            onAnalyzeLichessGame={onAnalyzeLichessGame}
            onToggleFavoriteLocal={onToggleFavoriteLocal}
            onToggleFavoriteChessCom={onToggleFavoriteChessCom}
            onToggleFavoriteLichess={onToggleFavoriteLichess}
          />
        </Tabs.Panel>
      </Tabs>

      {/* Resize handle at the bottom */}
      <div
        onMouseDown={handleMouseDown}
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: "8px",
          cursor: "row-resize",
          zIndex: 10,
          backgroundColor: "transparent",
        }}
        title="Drag to resize"
      />
    </Card>
  );
}
