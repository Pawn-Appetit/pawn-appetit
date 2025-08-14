import { ActionIcon, Button, Card, Group, Loader, ScrollArea, Stack, Table, Text, Tooltip } from "@mantine/core";
import { IconRefresh } from "@tabler/icons-react";
import { useAtomValue, useSetAtom } from "jotai";
import { useState, useCallback } from "react";
import { sessionsAtom, tabsAtom, activeTabAtom } from "@/state/atoms";
import { useNavigate } from "@tanstack/react-router";
import { createTab } from "@/utils/tabs";

type GenericGame = {
  id: string;
  opponent: string;
  opponentRating?: number;
  result: 'Won' | 'Lost' | 'Draw';
  movesCount?: number;
  date: string;
  pgn: string;
  userColor: 'white' | 'black';
};

type RecentOnlineGamesProps = {
    platform: 'lichess' | 'chess.com';
    title: string;
    fetchGamesFn: (username: string) => Promise<any[]>;
    gameAdapter: (game: any, username: string) => GenericGame;
};

export default function RecentOnlineGames({ platform, title, fetchGamesFn, gameAdapter }: RecentOnlineGamesProps) {
    const [games, setGames] = useState<GenericGame[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fetchAttempted, setFetchAttempted] = useState(false);
    const sessions = useAtomValue(sessionsAtom);
    const session = sessions.find(s => (s.lichess && platform === 'lichess') || (s.chessCom && platform === 'chess.com'));
    const navigate = useNavigate();
    const setTabs = useSetAtom(tabsAtom);
    const setActiveTab = useSetAtom(activeTabAtom);

    const username = platform === 'lichess' ? session?.lichess?.username : session?.chessCom?.username;

    const fetchGames = useCallback(async () => {
        if (username) {
            setLoading(true);
            setError(null);
            setFetchAttempted(true);
            try {
                const fetchedGames = await fetchGamesFn(username);
                const adaptedGames = fetchedGames
                    .slice(0, 5)
                    .map(game => gameAdapter(game, username));
                setGames(adaptedGames);
            } catch (err) {
                console.error("Failed to fetch recent games:", err);
                setError("Could not load recent games.");
            } finally {
                setLoading(false);
            }
        }
    }, [username, fetchGamesFn, gameAdapter]);

    const handleAnalyse = (game: GenericGame) => {
        if (!game.pgn) return;
        const whiteUsername = game.userColor === 'white' ? username : game.opponent;
        const blackUsername = game.userColor === 'black' ? username : game.opponent;
        createTab({
            tab: {
                name: `${whiteUsername} vs ${blackUsername}`,
                type: "analysis",
            },
            setTabs,
            setActiveTab,
            pgn: game.pgn,
        });
        navigate({ to: "/boards" });
    };

    if (!session) {
        return null;
    }

    return (
        <Card withBorder p="lg" radius="md" h="100%">
            <Stack h="100%">
                <Group justify="space-between">
                    <Text fw={700}>{title}</Text>
                    <Tooltip label="Refresh">
                        <ActionIcon variant="default" size="sm" onClick={fetchGames} disabled={loading}>
                           {loading ? <Loader size="xs" /> : <IconRefresh size="0.8rem" />}
                        </ActionIcon>
                    </Tooltip>
                </Group>
                <ScrollArea h="100%" type="auto">
                    <Table striped highlightOnHover>
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th>Opponent</Table.Th>
                                <Table.Th>Result</Table.Th>
                                <Table.Th>Moves</Table.Th>
                                <Table.Th>Date</Table.Th>
                                <Table.Th></Table.Th>
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {games.map(g => (
                                <Table.Tr key={g.id}>
                                    <Table.Td>{g.opponent} {g.opponentRating && `(${g.opponentRating})`}</Table.Td>
                                    <Table.Td>{g.result}</Table.Td>
                                    <Table.Td>{g.movesCount ?? '-'}</Table.Td>
                                    <Table.Td>{g.date}</Table.Td>
                                    <Table.Td>
                                        <Button size="xs" variant="light" onClick={() => handleAnalyse(g)}>Analyse</Button>
                                    </Table.Td>
                                </Table.Tr>
                            ))}
                        </Table.Tbody>
                    </Table>
                    {loading && (
                        <Group justify="center" mt="md">
                            <Loader size="sm" />
                        </Group>
                    )}
                    {error && <Text c="red" size="sm" ta="center" mt="md">{error}</Text>}
                    {fetchAttempted && !loading && !error && games.length === 0 && (
                        <Text c="dimmed" size="sm" ta="center" mt="md">
                            No recent games found.
                        </Text>
                    )}
                </ScrollArea>
            </Stack>
        </Card>
    );
}
