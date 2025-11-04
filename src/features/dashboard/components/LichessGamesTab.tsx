import { Avatar, Badge, Button, Group, ScrollArea, Table, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";

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

interface LichessGamesTabProps {
  games: LichessGame[];
  lichessUsernames: string[];
  onAnalyzeGame: (game: LichessGame) => void;
}

export function LichessGamesTab({ games, lichessUsernames, onAnalyzeGame }: LichessGamesTabProps) {
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
            const isUserWhite = lichessUsernames.includes(g.players.white.user?.name || "");
            const opponent = isUserWhite ? g.players.black : g.players.white;
            const userAccount = isUserWhite ? g.players.white : g.players.black;
            const color = isUserWhite ? t("chess.white") : t("chess.black");
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
                      Analyse
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
