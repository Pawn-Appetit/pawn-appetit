import { Avatar, Badge, Button, Group, ScrollArea, Table, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import type { GameRecord } from "@/utils/gameRecords";

interface LocalGamesTabProps {
  games: GameRecord[];
  onAnalyzeGame: (game: GameRecord) => void;
}

export function LocalGamesTab({ games, onAnalyzeGame }: LocalGamesTabProps) {
  const { t } = useTranslation();

  return (
    <ScrollArea h={{ base: 200, sm: 220, md: 240, lg: 260 }} type="auto">
      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Opponent</Table.Th>
            <Table.Th>Color</Table.Th>
            <Table.Th>Result</Table.Th>
            <Table.Th>Accuracy</Table.Th>
            <Table.Th>Moves</Table.Th>
            <Table.Th>Date</Table.Th>
            <Table.Th></Table.Th>
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
                  <Text size="xs" c="dimmed">
                    -
                  </Text>
                </Table.Td>
                <Table.Td>{g.moves.length}</Table.Td>
                <Table.Td c="dimmed">{dateStr}</Table.Td>
                <Table.Td>
                  <Button size="xs" variant="light" onClick={() => onAnalyzeGame(g)}>
                    Analyze
                  </Button>
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </ScrollArea>
  );
}
