import { Avatar, Badge, Button, Group, Loader, Pagination, ScrollArea, Stack, Table, Text } from "@mantine/core";
import { IconSortAscending, IconSortDescending } from "@tabler/icons-react";
import { useAtomValue } from "jotai";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AnalysisPreview } from "@/components/AnalysisPreview";
import { currentThemeIdAtom } from "@/features/themes/state/themeAtoms";
import { getAnalyzedGame, getGameStats as getSavedGameStats } from "@/utils/analyzedGames";

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

interface GameStats {
  accuracy: number;
  acpl: number;
  estimatedElo?: number;
}

interface LichessGamesTabProps {
  games: LichessGame[];
  lichessUsernames: string[];
  selectedUser?: string | null;
  isLoading?: boolean;
  onAnalyzeGame: (game: LichessGame) => void;
  onAnalyzeAll?: () => void;
}

export function LichessGamesTab({
  games,
  lichessUsernames,
  selectedUser,
  isLoading = false,
  onAnalyzeGame,
  onAnalyzeAll,
}: LichessGamesTabProps) {
  const { t } = useTranslation();
  const currentThemeId = useAtomValue(currentThemeIdAtom);
  const isAcademiaMaya = currentThemeId === "academia-maya";
  const [gameStats, setGameStats] = useState<Map<string, GameStats>>(new Map());
  const [analyzedPgns, setAnalyzedPgns] = useState<Map<string, string>>(new Map());
  const [page, setPage] = useState(1);
  const itemsPerPage = 25;
  const [sortBy, setSortBy] = useState<"elo" | "date" | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  // Debug: log when isLoading changes
  useEffect(() => {
    // Trigger re-render when isLoading changes
  }, [isLoading]);

  // Load analyzed PGNs for preview
  useEffect(() => {
    if (games.length === 0) return;

    let cancelled = false;

    const loadAnalyzedPgns = async () => {
      const pgnMap = new Map<string, string>();

      for (const game of games) {
        if (cancelled) break;

        try {
          // Try to get analyzed PGN first (using ID as gameId for Lichess)
          const analyzedPgn = await getAnalyzedGame(game.id);
          if (analyzedPgn) {
            pgnMap.set(game.id, analyzedPgn);
          } else if (game.pgn) {
            // Fallback to original PGN if no analysis available
            pgnMap.set(game.id, game.pgn);
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
  }, [games]);

  // Load stats for games - use saved stats if available, otherwise calculate
  useEffect(() => {
    if (games.length === 0) return;

    let cancelled = false;

    const loadStats = async () => {
      const statsMap = new Map<string, GameStats>();

      for (const game of games) {
        if (cancelled) break;
        if (!game.pgn) continue;

        try {
          // Load saved stats only (no calculation)
          const savedStats = await getSavedGameStats(game.id);

          if (savedStats && savedStats.acpl > 0) {
            statsMap.set(game.id, savedStats);
          }
        } catch {
          // Silently skip games that fail to parse
        }

        if (!cancelled) {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      }

      // Only set state once at the end to avoid multiple re-renders
      if (!cancelled) {
        setGameStats(statsMap);
      }
    };

    const timeoutId = setTimeout(() => {
      if (!cancelled) {
        loadStats().catch(() => {});
      }
    }, 100);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [games]); // Games array reference change is sufficient - no need to serialize PGNs

  // Calculate move count from PGN if available
  const getMoveCount = (game: LichessGame): number => {
    if (!game.pgn) return 0;
    try {
      const moves = game.pgn.match(/\d+\.\s+\S+/g) || [];
      return moves.length;
    } catch {
      return 0;
    }
  };

  // Sort and paginate games
  const sortedAndPaginatedGames = useMemo(() => {
    const sortedGames = [...games];

    if (sortBy === "elo") {
      sortedGames.sort((a, b) => {
        const statsA = gameStats.get(a.id);
        const statsB = gameStats.get(b.id);
        const eloA = statsA?.estimatedElo || 0;
        const eloB = statsB?.estimatedElo || 0;
        return sortDirection === "asc" ? eloA - eloB : eloB - eloA;
      });
    } else if (sortBy === "date") {
      sortedGames.sort((a, b) => {
        return sortDirection === "asc" ? a.createdAt - b.createdAt : b.createdAt - a.createdAt;
      });
    }

    const start = (page - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    return sortedGames.slice(start, end);
  }, [games, page, itemsPerPage, sortBy, sortDirection, gameStats]);

  // Calculate averages for footer
  const averages = useMemo(() => {
    const gamesWithStats = games.filter((g) => {
      const stats = gameStats.get(g.id);
      return stats && stats.acpl > 0;
    });

    if (gamesWithStats.length === 0) {
      return { accuracy: 0, acpl: 0, elo: 0 };
    }

    let totalAccuracy = 0;
    let totalAcpl = 0;
    let totalElo = 0;
    let count = 0;
    let eloCount = 0;

    gamesWithStats.forEach((g) => {
      const stats = gameStats.get(g.id);
      if (stats && stats.acpl > 0) {
        totalAccuracy += stats.accuracy;
        totalAcpl += stats.acpl;
        if (stats.estimatedElo !== undefined) {
          totalElo += stats.estimatedElo;
          eloCount++;
        }
        count++;
      }
    });

    return {
      accuracy: count > 0 ? totalAccuracy / count : 0,
      acpl: count > 0 ? totalAcpl / count : 0,
      elo: eloCount > 0 ? totalElo / eloCount : 0,
    };
  }, [games, gameStats]);

  const handleSort = (field: "elo" | "date") => {
    if (sortBy === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortDirection("desc");
    }
    setPage(1); // Reset to first page when sorting changes
  };

  const totalPages = Math.ceil(games.length / itemsPerPage);

  // Reset to page 1 when games change
  useEffect(() => {
    setPage(1);
  }, [games.length]);

  if (isLoading) {
    return (
      <Stack gap="xs" align="center" justify="center" style={{ minHeight: "200px" }}>
        <Loader size="md" />
        <Text size="sm" c="dimmed">
          Loading...
        </Text>
      </Stack>
    );
  }

  return (
    <Stack gap="xs" style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>
      <ScrollArea style={{ flex: 1, minHeight: 0 }} type="auto">
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Opponent</Table.Th>
              <Table.Th>Color</Table.Th>
              <Table.Th>Result</Table.Th>
              <Table.Th>Accuracy</Table.Th>
              <Table.Th>ACPL</Table.Th>
              <Table.Th style={{ cursor: "pointer", userSelect: "none" }} onClick={() => handleSort("elo")}>
                <Group gap="xs" wrap="nowrap">
                  {t("dashboard.estimatedElo")}
                  {sortBy === "elo" &&
                    (sortDirection === "asc" ? <IconSortAscending size={16} /> : <IconSortDescending size={16} />)}
                </Group>
              </Table.Th>
              <Table.Th>Moves</Table.Th>
              <Table.Th>Account</Table.Th>
              <Table.Th style={{ cursor: "pointer", userSelect: "none" }} onClick={() => handleSort("date")}>
                <Group gap="xs" wrap="nowrap">
                  Date
                  {sortBy === "date" &&
                    (sortDirection === "asc" ? <IconSortAscending size={16} /> : <IconSortDescending size={16} />)}
                </Group>
              </Table.Th>
              <Table.Th>
                {onAnalyzeAll && (
                  <Button size="xs" variant="light" onClick={onAnalyzeAll}>
                    Analyze All
                  </Button>
                )}
              </Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {sortedAndPaginatedGames.map((g) => {
              // If a specific user is selected, use that user to determine account vs opponent
              // Otherwise, use the lichessUsernames list
              const gameWhiteName = g.players.white.user?.name || "";
              const gameBlackName = g.players.black.user?.name || "";
              const accountUsername =
                selectedUser && selectedUser !== "all"
                  ? selectedUser
                  : lichessUsernames.find(
                      (u) =>
                        u.toLowerCase() === gameWhiteName.toLowerCase() ||
                        u.toLowerCase() === gameBlackName.toLowerCase(),
                    ) || gameWhiteName;

              const isUserWhite = (gameWhiteName || "").toLowerCase() === (accountUsername || "").toLowerCase();
              const opponent = isUserWhite ? g.players.black : g.players.white;
              const userAccount = isUserWhite ? g.players.white : g.players.black;
              const color = isUserWhite ? t("chess.white") : t("chess.black");
              const stats = gameStats.get(g.id);

              // Translate status
              const getTranslatedStatus = (status: string) => {
                if (status === "white") return t("chess.white");
                if (status === "black") return t("chess.black");
                if (status === "draw") return t("chess.draw");
                return status;
              };

              // Determine if user won
              const userWon = g.winner === (isUserWhite ? "white" : "black");

              // Get color for result badge - different colors for Academia Maya
              const getResultColor = () => {
                if (isAcademiaMaya) {
                  if (userWon) return "green"; // Green for victory in Academia Maya
                  if (g.winner) return "red"; // Red for defeat
                  return "gray"; // Gray for draw
                } else {
                  // Default colors for other themes
                  if (userWon) return "teal";
                  if (g.winner) return "red";
                  return "gray";
                }
              };

              return (
                <Table.Tr key={g.id}>
                  <Table.Td>
                    <Group gap="xs">
                      <Avatar size={24} radius="xl">
                        {opponent.user?.name[0].toUpperCase()}
                      </Avatar>
                      <Text>{opponent.user?.name}</Text>
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Badge variant="light">{color}</Badge>
                  </Table.Td>
                  <Table.Td>
                    <Badge color={getResultColor()}>{getTranslatedStatus(g.status)}</Badge>
                  </Table.Td>
                  <Table.Td>
                    {stats ? (
                      <Text size="xs" fw={500}>
                        {stats.accuracy.toFixed(1)}%
                      </Text>
                    ) : (
                      <Text size="xs" c="dimmed">
                        -
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    {stats ? (
                      <Text size="xs" fw={500}>
                        {stats.acpl.toFixed(1)}
                      </Text>
                    ) : (
                      <Text size="xs" c="dimmed">
                        -
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    {stats && stats.estimatedElo !== undefined ? (
                      <Text size="xs" fw={500}>
                        {stats.estimatedElo}
                      </Text>
                    ) : (
                      <Text size="xs" c="dimmed">
                        -
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs">{getMoveCount(g)}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs">{userAccount.user?.name}</Text>
                  </Table.Td>
                  <Table.Td c="dimmed">
                    {t("formatters.dateFormat", {
                      date: new Date(g.createdAt),
                      interpolation: { escapeValue: false },
                    })}
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs" wrap="nowrap">
                      <AnalysisPreview pgn={analyzedPgns.get(g.id) || g.pgn || null}>
                        <Button size="xs" variant="light" onClick={() => onAnalyzeGame(g)} disabled={!g.pgn}>
                          Analyze
                        </Button>
                      </AnalysisPreview>
                      <Button
                        size="xs"
                        variant="light"
                        component="a"
                        href={`https://lichess.org/${g.id}`}
                        target="_blank"
                      >
                        View Online
                      </Button>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
          <Table.Tfoot>
            <Table.Tr>
              <Table.Td colSpan={3}>
                <Text size="xs" fw={600}>
                  Average
                </Text>
              </Table.Td>
              <Table.Td>
                <Text size="xs" fw={500}>
                  {averages.accuracy > 0 ? `${averages.accuracy.toFixed(1)}%` : "-"}
                </Text>
              </Table.Td>
              <Table.Td>
                <Text size="xs" fw={500}>
                  {averages.acpl > 0 ? averages.acpl.toFixed(1) : "-"}
                </Text>
              </Table.Td>
              <Table.Td>
                <Text size="xs" fw={500}>
                  {averages.elo > 0 ? Math.round(averages.elo) : "-"}
                </Text>
              </Table.Td>
              <Table.Td colSpan={5}></Table.Td>
            </Table.Tr>
          </Table.Tfoot>
        </Table>
      </ScrollArea>
      {totalPages > 1 && (
        <Group justify="center" mt="xs">
          <Pagination value={page} onChange={setPage} total={totalPages} size="sm" />
        </Group>
      )}
    </Stack>
  );
}
