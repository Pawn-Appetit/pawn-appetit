import { Avatar, Badge, Button, Group, Loader, Pagination, ScrollArea, Stack, Table, Text } from "@mantine/core";
import { IconSortAscending, IconSortDescending } from "@tabler/icons-react";
import { useAtomValue } from "jotai";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { currentThemeIdAtom } from "@/features/themes/state/themeAtoms";
import { AnalysisPreview } from "@/components/AnalysisPreview";
import { getAnalyzedGame, getGameStats as getSavedGameStats } from "@/utils/analyzedGames";
import type { ChessComGame } from "@/utils/chess.com/api";

interface GameStats {
  accuracy: number;
  acpl: number;
  estimatedElo?: number;
}

interface ChessComGamesTabProps {
  games: ChessComGame[];
  chessComUsernames: string[];
  selectedUser?: string | null;
  isLoading?: boolean;
  onAnalyzeGame: (game: ChessComGame) => void;
  onAnalyzeAll?: () => void;
}

export function ChessComGamesTab({ games, chessComUsernames, selectedUser, isLoading = false, onAnalyzeGame, onAnalyzeAll }: ChessComGamesTabProps) {
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
          // Try to get analyzed PGN first (using URL as gameId for Chess.com)
          const analyzedPgn = await getAnalyzedGame(game.url);
          if (analyzedPgn) {
            pgnMap.set(game.url, analyzedPgn);
          } else if (game.pgn) {
            // Fallback to original PGN if no analysis available
            pgnMap.set(game.url, game.pgn);
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
          const savedStats = await getSavedGameStats(game.url);
          
          if (savedStats && savedStats.acpl > 0) {
            statsMap.set(game.url, savedStats);
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
  const getMoveCount = (game: ChessComGame): number => {
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
    let sortedGames = [...games];
    
    if (sortBy === "elo") {
      sortedGames.sort((a, b) => {
        const statsA = gameStats.get(a.url);
        const statsB = gameStats.get(b.url);
        const eloA = statsA?.estimatedElo || 0;
        const eloB = statsB?.estimatedElo || 0;
        return sortDirection === "asc" ? eloA - eloB : eloB - eloA;
      });
    } else if (sortBy === "date") {
      sortedGames.sort((a, b) => {
        return sortDirection === "asc" ? a.end_time - b.end_time : b.end_time - a.end_time;
      });
    }
    
    const start = (page - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    return sortedGames.slice(start, end);
  }, [games, page, itemsPerPage, sortBy, sortDirection, gameStats]);

  // Calculate averages for footer
  const averages = useMemo(() => {
    const gamesWithStats = games.filter(g => {
      const stats = gameStats.get(g.url);
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
    
    gamesWithStats.forEach(g => {
      const stats = gameStats.get(g.url);
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
              <Table.Th 
                style={{ cursor: "pointer", userSelect: "none" }}
                onClick={() => handleSort("elo")}
              >
                <Group gap="xs" wrap="nowrap">
                  {t("dashboard.estimatedElo")}
                  {sortBy === "elo" && (
                    sortDirection === "asc" ? <IconSortAscending size={16} /> : <IconSortDescending size={16} />
                  )}
                </Group>
              </Table.Th>
              <Table.Th>Moves</Table.Th>
              <Table.Th>Account</Table.Th>
              <Table.Th 
                style={{ cursor: "pointer", userSelect: "none" }}
                onClick={() => handleSort("date")}
              >
                <Group gap="xs" wrap="nowrap">
                  Date
                  {sortBy === "date" && (
                    sortDirection === "asc" ? <IconSortAscending size={16} /> : <IconSortDescending size={16} />
                  )}
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
            // Otherwise, use the chessComUsernames list
            const accountUsername = selectedUser && selectedUser !== "all" 
              ? selectedUser 
              : chessComUsernames.find(u => 
                  u.toLowerCase() === g.white.username.toLowerCase() || 
                  u.toLowerCase() === g.black.username.toLowerCase()
                ) || g.white.username;
            
            const isUserWhite = (g.white.username || "").toLowerCase() === (accountUsername || "").toLowerCase();
            const opponent = isUserWhite ? g.black : g.white;
            const userAccount = isUserWhite ? g.white : g.black;
            const color = isUserWhite ? t("chess.white") : t("chess.black");
            const result = isUserWhite ? g.white.result : g.black.result;
            const stats = gameStats.get(g.url);
            
            // Translate result
            const getTranslatedResult = (result: string) => {
              if (result === "win") return t("features.dashboard.win");
              if (result === "checkmated" || result === "resigned" || result === "timeout" || result === "abandoned") return t("features.dashboard.loss");
              if (result === "stalemate" || result === "insufficient" || result === "repetition" || result === "agreed") return t("chess.draw");
              return result;
            };
            
            // Get color for result badge - different colors for Academia Maya
            const getResultColor = (result: string, isUserWin: boolean) => {
              if (isAcademiaMaya) {
                if (isUserWin) return "green"; // Green for victory in Academia Maya
                if (result === "checkmated" || result === "resigned" || result === "timeout" || result === "abandoned") return "red"; // Red for defeat
                return "gray"; // Gray for draw
              } else {
                // Default colors for other themes
                if (result === "win") return "teal";
                if (result === "checkmated" || result === "resigned") return "red";
                return "gray";
              }
            };

            return (
              <Table.Tr key={g.url}>
                <Table.Td>
                  <Group gap="xs">
                    <Avatar size={24} radius="xl">
                      {opponent.username[0].toUpperCase()}
                    </Avatar>
                    <Text>{opponent.username}</Text>
                  </Group>
                </Table.Td>
                <Table.Td>
                  <Badge variant="light">{color}</Badge>
                </Table.Td>
                <Table.Td>
                  <Badge
                    color={getResultColor(result, result === "win")}
                  >
                    {getTranslatedResult(result)}
                  </Badge>
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
                  <Text size="xs">{userAccount.username}</Text>
                </Table.Td>
                <Table.Td c="dimmed">
                  {t("formatters.dateFormat", {
                    date: new Date(g.end_time * 1000),
                    interpolation: { escapeValue: false },
                  })}
                </Table.Td>
                <Table.Td>
                  <Group gap="xs" wrap="nowrap">
                    <AnalysisPreview pgn={analyzedPgns.get(g.url) || g.pgn || null}>
                      <Button size="xs" variant="light" onClick={() => onAnalyzeGame(g)}>
                        Analyze
                      </Button>
                    </AnalysisPreview>
                    <Button size="xs" variant="light" component="a" href={g.url} target="_blank">
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
                <Text size="xs" fw={600}>Average</Text>
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
