import { Avatar, Badge, Button, Group, ScrollArea, Table, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import type { ChessComGame } from "@/utils/chess.com/api";

interface ChessComGamesTabProps {
  games: ChessComGame[];
  chessComUsernames: string[];
  onAnalyzeGame: (game: ChessComGame) => void;
}

export function ChessComGamesTab({ games, chessComUsernames, onAnalyzeGame }: ChessComGamesTabProps) {
  const { t } = useTranslation();

  return (
    <ScrollArea h={{ base: 200, sm: 220, md: 240, lg: 260 }} type="auto">
      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Opponent</Table.Th>
            <Table.Th>Color</Table.Th>
            <Table.Th>Result</Table.Th>
            <Table.Th>Account</Table.Th>
            <Table.Th>Date</Table.Th>
            <Table.Th></Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {games.map((g) => {
            const isUserWhite = chessComUsernames.includes(g.white.username);
            const opponent = isUserWhite ? g.black : g.white;
            const userAccount = isUserWhite ? g.white : g.black;
            const color = isUserWhite ? t("chess.white") : t("chess.black");
            const result = isUserWhite ? g.white.result : g.black.result;
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
                      Analyse
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
