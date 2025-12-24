import { ActionIcon, Avatar, Badge, Button, Group, Pagination, ScrollArea, Stack, Table, Text } from "@mantine/core";
import { IconSortAscending, IconSortDescending, IconStar, IconStarFilled, IconTrash } from "@tabler/icons-react";
import { useAtomValue } from "jotai";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AnalysisPreview } from "@/components/AnalysisPreview";
import { currentThemeIdAtom } from "@/features/themes/state/themeAtoms";
import { getAnalyzedGame } from "@/utils/analyzedGames";
import type { GameRecord } from "@/utils/gameRecords";
import { calculateGameStats, type GameStats } from "@/utils/gameRecords";
import type { FavoriteGame } from "@/utils/favoriteGames";

interface LocalGamesTabProps {
  games: GameRecord[];
  onAnalyzeGame: (game: GameRecord) => void;
  onAnalyzeAll?: () => void;
  onDeleteGame?: (gameId: string) => void;
  onToggleFavorite?: (gameId: string) => Promise<void>;
  favoriteGames?: FavoriteGame[];
}

export function LocalGamesTab({ games, onAnalyzeGame, onAnalyzeAll, onDeleteGame, onToggleFavorite, favoriteGames = [] }: LocalGamesTabProps) {
  const { t } = useTranslation();
  const currentThemeId = useAtomValue(currentThemeIdAtom);
  const isAcademiaMaya = currentThemeId === "academia-maya";
  const [gameStats, setGameStats] = useState<Map<string, GameStats>>(new Map());
  const [analyzedPgns, setAnalyzedPgns] = useState<Map<string, string>>(new Map());
  const [page, setPage] = useState(1);
  const itemsPerPage = 25;
  const [sortBy, setSortBy] = useState<"elo" | "date" | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  // Load analyzed PGNs for preview
  useEffect(() => {
    if (games.length === 0) return;

    let cancelled = false;

    const loadAnalyzedPgns = async () => {
      const pgnMap = new Map<string, string>();

      for (const game of games) {
        if (cancelled) break;

        try {
          // Try to get analyzed PGN first
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

  // Load stats for all games - use saved stats if available, otherwise calculate
  useEffect(() => {
    if (games.length === 0) return;

    let cancelled = false;

    const loadStats = async () => {
      const statsMap = new Map<string, GameStats>();

      // Process games with small delays to avoid blocking the UI
      for (const game of games) {
        if (cancelled) break;

        try {
          // First, check if stats are already saved in the game record
          if (game.stats && game.stats.acpl > 0) {
            // Use saved stats directly
            statsMap.set(game.id, game.stats);
          }
        } catch (error) {
          // Silently skip games that fail to parse
        }

        // Small delay to yield to the UI thread
        if (!cancelled) {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      }

      // Only set state once at the end to avoid multiple re-renders
      if (!cancelled) {
        setGameStats(statsMap);
      }
    };

    // Delay initial calculation to avoid blocking initial render
    const timeoutId = setTimeout(() => {
      if (!cancelled) {
        loadStats().catch(() => {
          // Silently handle any errors
        });
      }
    }, 100);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [games]);

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
        return sortDirection === "asc" ? a.timestamp - b.timestamp : b.timestamp - a.timestamp;
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

  // Calculate current time once per render instead of once per game
  const now = useMemo(() => Date.now(), [sortedAndPaginatedGames]);

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
              <Table.Th style={{ cursor: "pointer", userSelect: "none" }} onClick={() => handleSort("date")}>
                <Group gap="xs" wrap="nowrap">
                  Date
                  {sortBy === "date" &&
                    (sortDirection === "asc" ? <IconSortAscending size={16} /> : <IconSortDescending size={16} />)}
                </Group>
              </Table.Th>
              <Table.Th>Favorite</Table.Th>
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
              const isUserWhite = g.white.type === "human";
              const opponent = isUserWhite ? g.black : g.white;
              const color = isUserWhite ? t("chess.white") : t("chess.black");

              // Determine if user won
              const userWon = (isUserWhite && g.result === "1-0") || (!isUserWhite && g.result === "0-1");

              // Get color for result badge - different colors for Academia Maya
              const getResultColor = () => {
                if (isAcademiaMaya) {
                  if (userWon) return "green"; // Green for victory in Academia Maya
                  if (g.result === "1-0" || g.result === "0-1") return "red"; // Red for defeat (when the user lost)
                  return "gray"; // Gray for draw
                } else {
                  // Default colors for other themes
                  if (userWon) return "teal";
                  if (g.result === "1-0" || g.result === "0-1") return "red";
                  return "gray";
                }
              };
              const diffMs = now - g.timestamp;
              let dateStr = "";
              if (diffMs < 60 * 60 * 1000) {
                dateStr = `${Math.floor(diffMs / (60 * 1000))}m ago`;
              } else if (diffMs < 24 * 60 * 60 * 1000) {
                dateStr = `${Math.floor(diffMs / (60 * 60 * 1000))}h ago`;
              } else {
                dateStr = `${Math.floor(diffMs / (24 * 60 * 60 * 1000))}d ago`;
              }

              const stats = gameStats.get(g.id);

              return (
                <Table.Tr key={g.id}>
                  <Table.Td>
                    <Group gap="xs">
                      <Avatar size={24} radius="xl">
                        {(opponent.name ?? "?")[0]?.toUpperCase()}
                      </Avatar>
                      <Text>
                        {opponent.name ??
                          (opponent.engine ? `${t("features.dashboard.engine")} (${opponent.engine})` : "?")}
                      </Text>
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Badge variant="light">{color}</Badge>
                  </Table.Td>
                  <Table.Td>
                    <Badge color={getResultColor()}>
                      {g.result === "1-0"
                        ? t("features.dashboard.win")
                        : g.result === "0-1"
                          ? t("features.dashboard.loss")
                          : g.result}
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
                  <Table.Td>{g.moves.length}</Table.Td>
                  <Table.Td c="dimmed">{dateStr}</Table.Td>
                  <Table.Td>
                    {onToggleFavorite && (
                      <ActionIcon
                        size="sm"
                        variant="subtle"
                        color={favoriteGames.some((f) => f.gameId === g.id && f.source === "local") ? "yellow" : "gray"}
                        onClick={() => onToggleFavorite(g.id)}
                        title="Toggle favorite"
                      >
                        {favoriteGames.some((f) => f.gameId === g.id && f.source === "local") ? (
                          <IconStarFilled size={16} />
                        ) : (
                          <IconStar size={16} />
                        )}
                      </ActionIcon>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      <AnalysisPreview pgn={analyzedPgns.get(g.id) || g.pgn || null}>
                        <Button size="xs" variant="light" onClick={() => onAnalyzeGame(g)}>
                          Analyze
                        </Button>
                      </AnalysisPreview>
                      {onDeleteGame && (
                        <ActionIcon
                          size="sm"
                          variant="subtle"
                          color="red"
                          onClick={() => onDeleteGame(g.id)}
                          title={t("features.dashboard.deleteGame")}
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      )}
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
