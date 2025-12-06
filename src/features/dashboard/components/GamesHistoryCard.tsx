import { ActionIcon, Card, Group, Select, Tabs } from "@mantine/core";
import { IconRefresh } from "@tabler/icons-react";
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
  onRefreshChessCom: () => void;
  onRefreshLichess: () => void;
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
  onRefreshChessCom,
  onRefreshLichess,
  onAnalyzeLocalGame,
  onAnalyzeChessComGame,
  onAnalyzeLichessGame,
  onAnalyzeAllLocal,
  onAnalyzeAllChessCom,
  onAnalyzeAllLichess,
  onDeleteLocalGame,
}: GamesHistoryCardProps) {
  return (
    <Card withBorder p="lg" radius="md" h="100%">
      <Tabs value={activeTab} onChange={onTabChange}>
        <Group justify="space-between" align="center">
          <Tabs.List>
            <Tabs.Tab value="local">Local</Tabs.Tab>
            <Tabs.Tab value="chesscom">Chess.com</Tabs.Tab>
            <Tabs.Tab value="lichess">Lichess</Tabs.Tab>
          </Tabs.List>
          {activeTab === "chesscom" && (
            <Group justify="space-between">
              <Select
                placeholder="Filter by account"
                value={selectedChessComUser}
                onChange={onChessComUserChange}
                data={[
                  { value: "all", label: "All Accounts" },
                  ...chessComUsernames.map((name) => ({ value: name, label: name })),
                ]}
                disabled={chessComUsernames.length <= 1}
              />
              <ActionIcon variant="subtle" onClick={onRefreshChessCom}>
                <IconRefresh size="1rem" />
              </ActionIcon>
            </Group>
          )}
          {activeTab === "lichess" && (
            <Group justify="space-between">
              <Select
                placeholder="Filter by account"
                value={selectedLichessUser}
                onChange={onLichessUserChange}
                data={[
                  { value: "all", label: "All Accounts" },
                  ...lichessUsernames.map((name) => ({ value: name, label: name })),
                ]}
                disabled={lichessUsernames.length <= 1}
              />
              <ActionIcon variant="subtle" onClick={onRefreshLichess}>
                <IconRefresh size="1rem" />
              </ActionIcon>
            </Group>
          )}
        </Group>

        <Tabs.Panel value="local" pt="xs">
          <LocalGamesTab
            games={localGames}
            onAnalyzeGame={onAnalyzeLocalGame}
            onAnalyzeAll={onAnalyzeAllLocal}
            onDeleteGame={onDeleteLocalGame}
          />
        </Tabs.Panel>

        <Tabs.Panel value="chesscom" pt="xs">
          <ChessComGamesTab
            games={chessComGames}
            chessComUsernames={chessComUsernames}
            selectedUser={selectedChessComUser}
            isLoading={isLoadingChessComGames}
            onAnalyzeGame={onAnalyzeChessComGame}
            onAnalyzeAll={onAnalyzeAllChessCom}
          />
        </Tabs.Panel>

        <Tabs.Panel value="lichess" pt="xs">
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
    </Card>
  );
}
