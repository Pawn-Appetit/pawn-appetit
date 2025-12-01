import { Avatar, Badge, Button, Group, ScrollArea, Table, Text } from "@mantine/core";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getGameStats, parsePGN } from "@/utils/chess";

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
}

interface LichessGamesTabProps {
  games: LichessGame[];
  lichessUsernames: string[];
  onAnalyzeGame: (game: LichessGame) => void;
  onAnalyzeAll?: () => void;
}

export function LichessGamesTab({ games, lichessUsernames, onAnalyzeGame, onAnalyzeAll }: LichessGamesTabProps) {
  const { t } = useTranslation();
  const [gameStats, setGameStats] = useState<Map<string, GameStats>>(new Map());

  // Calculate stats for games with PGN
  useEffect(() => {
    if (games.length === 0) return;

    let cancelled = false;

    const calculateStats = async () => {
      const statsMap = new Map<string, GameStats>();

      for (const game of games) {
        if (cancelled) break;
        if (!game.pgn) continue;

        try {
          const tree = await parsePGN(game.pgn);
          const stats = getGameStats(tree.root);

          const isUserWhite = lichessUsernames.includes(game.players.white.user?.name || "");
          const userColor = isUserWhite ? "white" : "black";

          const accuracy = userColor === "white" ? stats.whiteAccuracy : stats.blackAccuracy;
          const acpl = userColor === "white" ? stats.whiteCPL : stats.blackCPL;

          if (accuracy > 0 || acpl > 0) {
            statsMap.set(game.id, { accuracy, acpl });
            setGameStats(new Map(statsMap));
          }
        } catch {
          // Silently skip games that fail to parse
        }

        if (!cancelled) {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      }

      if (!cancelled) {
        setGameStats(statsMap);
      }
    };

    const timeoutId = setTimeout(() => {
      if (!cancelled) {
        calculateStats().catch(() => {});
      }
    }, 100);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [games, lichessUsernames, games.map((g) => g.pgn).join("|")]); // Also depend on PGNs to recalculate when PGNs are updated

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

  return (
    <ScrollArea h={{ base: 200, sm: 220, md: 240, lg: 260 }} type="auto">
      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Opponent</Table.Th>
            <Table.Th>Color</Table.Th>
            <Table.Th>Result</Table.Th>
            <Table.Th>Accuracy</Table.Th>
            <Table.Th>ACPL</Table.Th>
            <Table.Th>Moves</Table.Th>
            <Table.Th>Account</Table.Th>
            <Table.Th>Date</Table.Th>
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
          {games.map((g) => {
            const isUserWhite = lichessUsernames.includes(g.players.white.user?.name || "");
            const opponent = isUserWhite ? g.players.black : g.players.white;
            const userAccount = isUserWhite ? g.players.white : g.players.black;
            const color = isUserWhite ? t("chess.white") : t("chess.black");
            const stats = gameStats.get(g.id);

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
                  <Badge color={g.winner === color.toLowerCase() ? "teal" : g.winner ? "red" : "gray"}>
                    {g.status}
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
                    <Button size="xs" variant="light" onClick={() => onAnalyzeGame(g)} disabled={!g.pgn}>
                      Analyze
                    </Button>
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
      </Table>
    </ScrollArea>
  );
}
