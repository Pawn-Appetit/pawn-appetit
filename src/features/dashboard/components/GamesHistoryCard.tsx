import { Card, Group, Select, Tabs } from "@mantine/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ChessComGame } from "@/utils/chess.com/api";
import type { GameRecord } from "@/utils/gameRecords";
import { ChessComGamesTab } from "./ChessComGamesTab";
import { LichessGamesTab } from "./LichessGamesTab";
import { LocalGamesTab } from "./LocalGamesTab";

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
}: GamesHistoryCardProps) {
  const { t } = useTranslation();

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
          </Tabs.List>
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
