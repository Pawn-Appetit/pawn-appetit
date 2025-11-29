import { Avatar, Badge, Button, Group, ScrollArea, Table, Text } from "@mantine/core";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { parsePGN, getGameStats } from "@/utils/chess";
import type { ChessComGame } from "@/utils/chess.com/api";

interface GameStats {
  accuracy: number;
  acpl: number;
}

interface ChessComGamesTabProps {
  games: ChessComGame[];
  chessComUsernames: string[];
  onAnalyzeGame: (game: ChessComGame) => void;
  onAnalyzeAll?: () => void;
}

export function ChessComGamesTab({ games, chessComUsernames, onAnalyzeGame, onAnalyzeAll }: ChessComGamesTabProps) {
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

          const isUserWhite = chessComUsernames.includes(game.white.username);
          const userColor = isUserWhite ? "white" : "black";

          const accuracy = userColor === "white" ? stats.whiteAccuracy : stats.blackAccuracy;
          const acpl = userColor === "white" ? stats.whiteCPL : stats.blackCPL;

          if (accuracy > 0 || acpl > 0) {
            statsMap.set(game.url, { accuracy, acpl });
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
  }, [games, chessComUsernames, games.map(g => g.pgn).join('|')]); // Also depend on PGNs to recalculate when PGNs are updated

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
            const isUserWhite = chessComUsernames.includes(g.white.username);
            const opponent = isUserWhite ? g.black : g.white;
            const userAccount = isUserWhite ? g.white : g.black;
            const color = isUserWhite ? t("chess.white") : t("chess.black");
            const result = isUserWhite ? g.white.result : g.black.result;
            const stats = gameStats.get(g.url);

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
                    color={
                      result === "win" ? "teal" : result === "checkmated" || result === "resigned" ? "red" : "gray"
                    }
                  >
                    {result}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  {stats ? (
                    <Text size="xs" fw={500}>
                      {stats.accuracy.toFixed(1)}%
                    </Text>
                  ) : (
                    <Text size="xs" c="dimmed">-</Text>
                  )}
                </Table.Td>
                <Table.Td>
                  {stats ? (
                    <Text size="xs" fw={500}>
                      {stats.acpl.toFixed(1)}
                    </Text>
                  ) : (
                    <Text size="xs" c="dimmed">-</Text>
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
                    <Button size="xs" variant="light" onClick={() => onAnalyzeGame(g)}>
                      Analyze
                    </Button>
                    <Button size="xs" variant="light" component="a" href={g.url} target="_blank">
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
