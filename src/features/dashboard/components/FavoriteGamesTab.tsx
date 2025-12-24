import { ActionIcon, Avatar, Badge, Group, Pagination, ScrollArea, Stack, Table, Text } from "@mantine/core";
import { IconStarFilled } from "@tabler/icons-react";
import { useAtomValue } from "jotai";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AnalysisPreview } from "@/components/AnalysisPreview";
import { currentThemeIdAtom } from "@/features/themes/state/themeAtoms";
import { getAnalyzedGame } from "@/utils/analyzedGames";
import type { ChessComGame } from "@/utils/chess.com/api";
import type { GameRecord } from "@/utils/gameRecords";
import type { FavoriteGame } from "@/utils/favoriteGames";

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

interface FavoriteGamesTabProps {
  localGames: GameRecord[];
  chessComGames: ChessComGame[];
  lichessGames: LichessGame[];
  favoriteGames: FavoriteGame[];
  chessComUsernames: string[];
  lichessUsernames: string[];
  onAnalyzeLocalGame: (game: GameRecord) => void;
  onAnalyzeChessComGame: (game: ChessComGame) => void;
  onAnalyzeLichessGame: (game: LichessGame) => void;
  onToggleFavoriteLocal?: (gameId: string) => Promise<void>;
  onToggleFavoriteChessCom?: (gameId: string) => Promise<void>;
  onToggleFavoriteLichess?: (gameId: string) => Promise<void>;
}

type FavoriteGameItem =
  | { type: "local"; game: GameRecord }
  | { type: "chesscom"; game: ChessComGame }
  | { type: "lichess"; game: LichessGame };

export function FavoriteGamesTab({
  localGames,
  chessComGames,
  lichessGames,
  favoriteGames,
  onAnalyzeLocalGame,
  onAnalyzeChessComGame,
  onAnalyzeLichessGame,
  onToggleFavoriteLocal,
  onToggleFavoriteChessCom,
  onToggleFavoriteLichess,
}: FavoriteGamesTabProps) {
  const { t } = useTranslation();
  const currentThemeId = useAtomValue(currentThemeIdAtom);
  const isAcademiaMaya = currentThemeId === "academia-maya";
  const [analyzedPgns, setAnalyzedPgns] = useState<Map<string, string>>(new Map());
  const [page, setPage] = useState(1);
  const itemsPerPage = 25;

  // Combine all favorite games from all sources
  const favoriteGameItems = useMemo<FavoriteGameItem[]>(() => {
    const items: FavoriteGameItem[] = [];

    // Add local favorite games
    favoriteGames
      .filter((f) => f.source === "local")
      .forEach((favorite) => {
        const game = localGames.find((g) => g.id === favorite.gameId);
        if (game) {
          items.push({ type: "local", game });
        }
      });

    // Add Chess.com favorite games
    favoriteGames
      .filter((f) => f.source === "chesscom")
      .forEach((favorite) => {
        const game = chessComGames.find((g) => g.url === favorite.gameId);
        if (game) {
          items.push({ type: "chesscom", game });
        }
      });

    // Add Lichess favorite games
    favoriteGames
      .filter((f) => f.source === "lichess")
      .forEach((favorite) => {
        const game = lichessGames.find((g) => g.id === favorite.gameId);
        if (game) {
          items.push({ type: "lichess", game });
        }
      });

    // Sort by timestamp (most recent first)
    return items.sort((a, b) => {
      const timeA =
        a.type === "local"
          ? a.game.timestamp
          : a.type === "chesscom"
            ? a.game.end_time * 1000
            : a.game.createdAt;
      const timeB =
        b.type === "local"
          ? b.game.timestamp
          : b.type === "chesscom"
            ? b.game.end_time * 1000
            : b.game.createdAt;
      return timeB - timeA;
    });
  }, [favoriteGames, localGames, chessComGames, lichessGames]);

  // Load analyzed PGNs for preview
  useEffect(() => {
    if (favoriteGameItems.length === 0) return;

    let cancelled = false;

    const loadAnalyzedPgns = async () => {
      const pgnMap = new Map<string, string>();

      for (const item of favoriteGameItems) {
        if (cancelled) break;

        try {
          let gameId: string;
          let pgn: string | undefined;

          if (item.type === "local") {
            gameId = item.game.id;
            pgn = item.game.pgn ?? undefined;
          } else if (item.type === "chesscom") {
            gameId = item.game.url;
            pgn = item.game.pgn ?? undefined;
          } else {
            gameId = item.game.id;
            pgn = item.game.pgn ?? undefined;
          }

          const analyzedPgn = await getAnalyzedGame(gameId);
          if (analyzedPgn) {
            pgnMap.set(gameId, analyzedPgn);
          } else if (pgn) {
            pgnMap.set(gameId, pgn);
          }
        } catch {
          // Silently skip games that fail to load
        }

        if (!cancelled) {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      }

      if (!cancelled) {
        setAnalyzedPgns(pgnMap);
      }
    };

    const timeoutId = setTimeout(() => {
      if (!cancelled) {
        loadAnalyzedPgns().catch(() => {});
      }
    }, 100);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [favoriteGameItems]);

  // Paginate games
  const paginatedGames = useMemo(() => {
    const start = (page - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    return favoriteGameItems.slice(start, end);
  }, [favoriteGameItems, page]);

  const totalPages = Math.ceil(favoriteGameItems.length / itemsPerPage);

  // Reset to page 1 when games change
  useEffect(() => {
    setPage(1);
  }, [favoriteGameItems.length]);

  // Calculate current time once per render
  const now = useMemo(() => Date.now(), [paginatedGames]);

  const handleToggleFavorite = async (item: FavoriteGameItem) => {
    if (item.type === "local" && onToggleFavoriteLocal) {
      await onToggleFavoriteLocal(item.game.id);
    } else if (item.type === "chesscom" && onToggleFavoriteChessCom) {
      await onToggleFavoriteChessCom(item.game.url);
    } else if (item.type === "lichess" && onToggleFavoriteLichess) {
      await onToggleFavoriteLichess(item.game.id);
    }
  };

  const handleAnalyze = (item: FavoriteGameItem) => {
    if (item.type === "local") {
      onAnalyzeLocalGame(item.game);
    } else if (item.type === "chesscom") {
      onAnalyzeChessComGame(item.game);
    } else {
      onAnalyzeLichessGame(item.game);
    }
  };

  if (favoriteGameItems.length === 0) {
    return (
      <Stack align="center" justify="center" style={{ flex: 1, minHeight: 200 }}>
        <Text c="dimmed">{t("features.dashboard.noFavorites") || "No favorite games yet"}</Text>
      </Stack>
    );
  }

  return (
    <Stack gap="xs" style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>
      <ScrollArea style={{ flex: 1, minHeight: 0 }} type="auto">
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Source</Table.Th>
              <Table.Th>Opponent</Table.Th>
              <Table.Th>Result</Table.Th>
              <Table.Th>Date</Table.Th>
              <Table.Th>Favorite</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {paginatedGames.map((item) => {
              let opponent: string;
              let result: string;
              let timestamp: number;
              let gameId: string;
              let source: string;

              if (item.type === "local") {
                const isUserWhite = item.game.white.type === "human";
                const opp = isUserWhite ? item.game.black : item.game.white;
                opponent = opp.name ?? (opp.engine ? `${t("features.dashboard.engine")} (${opp.engine})` : "?");
                result = item.game.result;
                timestamp = item.game.timestamp;
                gameId = item.game.id;
                source = "Local";
              } else if (item.type === "chesscom") {
                opponent = item.game.black?.username ?? "?";
                result = item.game.white?.result ?? "*";
                timestamp = item.game.end_time * 1000;
                gameId = item.game.url;
                source = "Chess.com";
              } else {
                opponent = item.game.players.black?.user?.name ?? "?";
                result = item.game.winner === "white" ? "1-0" : item.game.winner === "black" ? "0-1" : "*";
                timestamp = item.game.createdAt;
                gameId = item.game.id;
                source = "Lichess";
              }

              const diffMs = now - timestamp;
              let dateStr = "";
              if (diffMs < 60 * 60 * 1000) {
                dateStr = `${Math.floor(diffMs / (60 * 1000))}m ago`;
              } else if (diffMs < 24 * 60 * 60 * 1000) {
                dateStr = `${Math.floor(diffMs / (60 * 60 * 1000))}h ago`;
              } else {
                dateStr = `${Math.floor(diffMs / (24 * 60 * 60 * 1000))}d ago`;
              }

              const pgn = analyzedPgns.get(gameId);

              return (
                <Table.Tr key={`${item.type}-${gameId}`}>
                  <Table.Td>
                    <Badge variant="light">{source}</Badge>
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      <Avatar size={24} radius="xl">
                        {opponent[0]?.toUpperCase()}
                      </Avatar>
                      <Text>{opponent}</Text>
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Badge color={result === "1-0" || result === "0-1" ? (isAcademiaMaya ? "green" : "teal") : "gray"}>
                      {result}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{dateStr}</Text>
                  </Table.Td>
                  <Table.Td>
                    <ActionIcon
                      variant="subtle"
                      color="yellow"
                      onClick={() => handleToggleFavorite(item)}
                      title={t("features.dashboard.removeFavorite") || "Remove from favorites"}
                    >
                      <IconStarFilled size={16} />
                    </ActionIcon>
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      {pgn && (
                        <AnalysisPreview pgn={pgn}>
                          <></>
                        </AnalysisPreview>
                      )}
                      <Text
                        size="sm"
                        style={{ cursor: "pointer", textDecoration: "underline" }}
                        onClick={() => handleAnalyze(item)}
                      >
                        {t("features.dashboard.analyze") || "Analyze"}
                      </Text>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </ScrollArea>
      {totalPages > 1 && (
        <Group justify="center" mt="md">
          <Pagination value={page} onChange={setPage} total={totalPages} />
        </Group>
      )}
    </Stack>
  );
}

