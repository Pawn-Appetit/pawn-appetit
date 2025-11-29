import { ActionIcon, Avatar, Badge, Button, Group, ScrollArea, Table, Text } from "@mantine/core";
import { IconTrash } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { useEffect, useMemo, useState } from "react";
import type { GameRecord } from "@/utils/gameRecords";
import { calculateGameStats, type GameStats } from "@/utils/gameRecords";

interface LocalGamesTabProps {
  games: GameRecord[];
  onAnalyzeGame: (game: GameRecord) => void;
  onAnalyzeAll?: () => void;
  onDeleteGame?: (gameId: string) => void;
}

export function LocalGamesTab({ games, onAnalyzeGame, onAnalyzeAll, onDeleteGame }: LocalGamesTabProps) {
  const { t } = useTranslation();
  const [gameStats, setGameStats] = useState<Map<string, GameStats>>(new Map());

  // Calculate stats for all games (lazy, non-blocking)
  useEffect(() => {
    if (games.length === 0) return;
    
    let cancelled = false;
    
    const calculateStats = async () => {
      const statsMap = new Map<string, GameStats>();
      
      // Process games with small delays to avoid blocking the UI
      for (const game of games) {
        if (cancelled) break;
        
        try {
          const stats = await calculateGameStats(game);
          if (stats && !cancelled) {
            statsMap.set(game.id, stats);
            // Update state incrementally
            setGameStats(new Map(statsMap));
          }
        } catch {
          // Silently skip games that fail to parse
        }
        
        // Small delay to yield to the UI thread
        if (!cancelled) {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      }
      
      if (!cancelled) {
        setGameStats(statsMap);
      }
    };

    // Delay initial calculation to avoid blocking initial render
    const timeoutId = setTimeout(() => {
      if (!cancelled) {
        calculateStats().catch(() => {
          // Silently handle any errors
        });
      }
    }, 100);
    
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [games]);

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
            const isUserWhite = g.white.type === "human";
            const opponent = isUserWhite ? g.black : g.white;
            const color = isUserWhite ? t("chess.white") : t("chess.black");
            const now = Date.now();
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
                    <Text>{opponent.name ?? (opponent.engine ? `Engine (${opponent.engine})` : "?")}</Text>
                  </Group>
                </Table.Td>
                <Table.Td>
                  <Badge variant="light">{color}</Badge>
                </Table.Td>
                <Table.Td>
                  <Badge color={g.result === "1-0" ? "teal" : g.result === "0-1" ? "red" : "gray"}>
                    {g.result === "1-0" ? "Win" : g.result === "0-1" ? "Loss" : g.result}
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
                <Table.Td>{g.moves.length}</Table.Td>
                <Table.Td c="dimmed">{dateStr}</Table.Td>
                <Table.Td>
                  <Group gap="xs">
                  <Button size="xs" variant="light" onClick={() => onAnalyzeGame(g)}>
                    Analyze
                  </Button>
                    {onDeleteGame && (
                      <ActionIcon
                        size="sm"
                        variant="subtle"
                        color="red"
                        onClick={() => onDeleteGame(g.id)}
                        title="Delete game"
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
      </Table>
    </ScrollArea>
  );
}
