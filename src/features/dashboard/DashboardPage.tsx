import { BarChart } from "@mantine/charts";
import type { MantineColor } from "@mantine/core";
import {
  Avatar,
  Badge,
  Box,
  Button,
  Card,
  Divider,
  Grid,
  Group,
  Image,
  Progress,
  RingProgress,
  ScrollArea,
  SimpleGrid,
  Stack,
  Table,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";
import {
  IconArrowRight,
  IconBolt,
  IconBook2,
  IconBrain,
  IconChess,
  IconClock,
  IconFlame,
  IconPuzzle,
  IconStopwatch,
  IconTrophy,
  IconUpload,
} from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { useAtom, useAtomValue } from "jotai";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { lessons } from "@/features/learn/constants/lessons";
import { practices } from "@/features/learn/constants/practices";
import { activeTabAtom, sessionsAtom, tabsAtom } from "@/state/atoms";
import { useUserStatsStore } from "@/state/userStatsStore";
import { type Achievement, getAchievements } from "@/utils/achievements";
import { type DailyGoal, getDailyGoals } from "@/utils/dailyGoals";
import { type GameRecord, getRecentGames } from "@/utils/gameRecords";
import { getPuzzleStats, getTodayPuzzleCount } from "@/utils/puzzleStreak";
import { genID, type Tab } from "@/utils/tabs";

import RecentOnlineGames from "./components/RecentOnlineGames";
import { type ChessComGame, fetchLastChessComGames } from "@/utils/chess.com/api";
import { fetchLastLichessGames } from "@/utils/lichess/api";


function getChessTitle(rating: number): string {
  if (rating >= 2500) return "Grandmaster";
  if (rating >= 2200) return "International Master";
  if (rating >= 2000) return "Expert";
  if (rating >= 1800) return "Class A";
  if (rating >= 1600) return "Class B";
  if (rating >= 1400) return "Class C";
  if (rating >= 1200) return "Class D";
  if (rating >= 1000) return "Class E";
  if (rating >= 800) return "Class F";
  if (rating >= 600) return "Class G";
  if (rating >= 400) return "Class H";
  if (rating >= 200) return "Class I";
  if (rating >= 100) return "Class J";
  return "Class K";
}

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

const lichessGameAdapter = (game: any, username: string): GenericGame => {
    const userIsWhite = game.players.white.user.name.toLowerCase() === username.toLowerCase();
    const opponent = userIsWhite ? game.players.black : game.players.white;
    const result = game.winner ? (game.winner === (userIsWhite ? 'white' : 'black') ? 'Won' : 'Lost') : 'Draw';
    return {
        id: game.id,
        opponent: opponent.user.name,
        opponentRating: opponent.rating,
        result,
        movesCount: game.moves.split(' ').length,
        date: new Date(game.createdAt).toLocaleDateString(),
        pgn: game.pgn,
        userColor: userIsWhite ? 'white' : 'black',
    };
};

const chessComGameAdapter = (game: ChessComGame, username: string): GenericGame => {
    const userIsWhite = game.white.username.toLowerCase() === username.toLowerCase();
    const opponent = userIsWhite ? game.black : game.white;
    const userResult = userIsWhite ? game.white.result : game.black.result;
    const resultText = userResult === 'win' ? 'Won' : (game.black.result === game.white.result ? 'Draw' : 'Lost');
    return {
        id: game.url,
        opponent: opponent.username,
        opponentRating: opponent.rating,
        result: resultText,
        movesCount: game.pgn?.split(' ').filter(s => s.match(/^\d+\./)).length,
        date: new Date(game.end_time * 1000).toLocaleDateString(),
        pgn: game.pgn || '',
        userColor: userIsWhite ? 'white' : 'black',
    };
};


export default function DashboardPage() {
  const [isFirstOpen, setIsFirstOpen] = useState(false);
  useEffect(() => {
    const key = "chessifier.firstOpen";
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, "true");
      setIsFirstOpen(true);
    } else {
      setIsFirstOpen(false);
    }
  }, []);
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [_tabs, setTabs] = useAtom(tabsAtom);
  const [_activeTab, setActiveTab] = useAtom(activeTabAtom);

  const sessions = useAtomValue(sessionsAtom);
  const [mainAccountName, setMainAccountName] = useState<string | null>(null);
  useEffect(() => {
    const stored = localStorage.getItem("mainAccount");
    setMainAccountName(stored);
  }, []);

  const mainSession = sessions.find(
    (s) =>
      s.player === mainAccountName ||
      s.lichess?.username === mainAccountName ||
      s.chessCom?.username === mainAccountName,
  );

  const hasLichessAccount = sessions.some(s => s.lichess);
  const hasChessComAccount = sessions.some(s => s.chessCom);

  let user = {
    name: mainAccountName ?? "No main account",
    handle: "",
    rating: 0,
  };
  let ratingHistory: { blitz?: number; rapid?: number; bullet?: number } = {};
  if (mainSession?.lichess?.account) {
    const acc = mainSession.lichess.account;
    user = {
      name: acc.username,
      handle: `@${acc.username}`,
      rating: acc.perfs?.blitz?.rating ?? acc.perfs?.rapid?.rating ?? 0,
    };
    const blitz = acc.perfs?.blitz?.rating;
    const rapid = acc.perfs?.rapid?.rating;
    const bullet = acc.perfs?.bullet?.rating;
    ratingHistory = { blitz, rapid, bullet };
  } else if (mainSession?.chessCom?.stats) {
    const stats = mainSession.chessCom.stats;
    user = {
      name: mainSession.chessCom.username,
      handle: `@${mainSession.chessCom.username}`,
      rating: stats.chess_blitz?.last?.rating ?? stats.chess_rapid?.last?.rating ?? 0,
    };
    const blitz = stats.chess_blitz?.last?.rating;
    const rapid = stats.chess_rapid?.last?.rating;
    const bullet = stats.chess_bullet?.last?.rating;
    ratingHistory = { blitz, rapid, bullet };
  }

  const [recentGames, setRecentGames] = useState<GameRecord[]>([]);
  useEffect(() => {
    getRecentGames(10).then(setRecentGames);
  }, []);

  const [puzzleStats, setPuzzleStats] = useState(() => getPuzzleStats());
  useEffect(() => {
    const update = () => setPuzzleStats(getPuzzleStats());
    const onVisibility = () => {
      if (!document.hidden) update();
    };
    window.addEventListener("storage", update);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("storage", update);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const userStats = useUserStatsStore((s) => s.userStats);

  type Suggestion = {
    id: string;
    title: string;
    tag: "Lessons" | "Openings" | "Endgames" | "Tactics";
    difficulty: string;
    to?: string;
    onClick?: () => void;
  };

  const suggestions: Suggestion[] = (() => {
    const picked: Suggestion[] = [];

    try {
      const nextLesson = lessons.find((l) => {
        const done = userStats.completedExercises?.[l.id]?.length ?? 0;
        return (l.exercises?.length ?? 0) > 0 && done < (l.exercises?.length ?? 0);
      });
      if (nextLesson) {
        picked.push({
          id: `lesson:${nextLesson.id}`,
          title: `Continue: ${nextLesson.title.default}`,
          tag: "Lessons",
          difficulty: nextLesson.difficulty?.toString?.().replace(/^./, (c) => c.toUpperCase()) ?? "All",
          to: "/learn/lessons",
        });
      }
    } catch {}

    try {
      const withExercises = practices.filter((c) => (c.exercises?.length ?? 0) > 0);
      const scored = withExercises
        .map((c) => {
          const done = userStats.completedPractice?.[c.id]?.length ?? 0;
          const total = c.exercises?.length ?? 0;
          return { c, ratio: total ? done / total : 1, total, done };
        })
        .sort((a, b) => a.ratio - b.ratio || a.total - b.total);
      const target = scored[0]?.c;
      if (target) {
        const group = target.group ?? "";
        const tag: Suggestion["tag"] = /Endgames/i.test(group)
          ? "Endgames"
          : /Checkmates|Tactics/i.test(group)
            ? "Tactics"
            : "Lessons";
        picked.push({
          id: `practice:${target.id}`,
          title: `Practice: ${target.title}`,
          tag,
          difficulty: "All",
          to: "/learn/practice",
        });
      }
    } catch {}

    try {
      const today = getTodayPuzzleCount();
      if (today < 5) {
        picked.push({
          id: `puzzles:streak`,
          title: today === 0 ? "Start today’s puzzle streak" : "Keep the streak: solve more puzzles",
          tag: "Tactics",
          difficulty: "All",
          to: "/learn/practice",
        });
      }
    } catch {}

    try {
      const last: GameRecord | undefined = recentGames?.[0];
      if (last) {
        const isUserWhite = last.white.type === "human";
        const userLost = (isUserWhite && last.result === "0-1") || (!isUserWhite && last.result === "1-0");
        if (userLost) {
          picked.push({
            id: `analyze:${last.id}`,
            title: "Analyze your last game",
            tag: "Lessons",
            difficulty: "All",
            onClick: () => {
              const uuid = genID();
              setTabs((prev: Tab[]) => [...prev, { value: uuid, name: "Analyze", type: "analysis" }]);
              setActiveTab(uuid);
              navigate({ to: "/boards" });
            },
          });
        }
      }
    } catch {}

    while (picked.length < 3) {
      const fallbackId = `fallback:${picked.length}`;
      picked.push({
        id: fallbackId,
        title: "Explore popular openings",
        tag: "Openings",
        difficulty: "All",
        to: "/learn/practice",
      });
    }

    return picked.slice(0, 3);
  })();
  const [goals, setGoals] = useState<DailyGoal[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const g = await getDailyGoals();
      const a = await getAchievements();
      if (mounted) {
        setGoals(g);
        setAchievements(a);
      }
    };
    load();
    const update = () => load();
    window.addEventListener("storage", update);
    window.addEventListener("focus", update);
    window.addEventListener("puzzles:updated", update);
    window.addEventListener("games:updated", update);
    const unsubscribe = useUserStatsStore.subscribe(() => update());
    return () => {
      mounted = false;
      window.removeEventListener("storage", update);
      window.removeEventListener("focus", update);
      window.removeEventListener("puzzles:updated", update);
      window.removeEventListener("games:updated", update);
      unsubscribe();
    };
  }, []);

  const PLAY_CHESS = {
    icon: <IconChess size={50} />,
    title: t("Dashboard.Card.PlayChess.Title"),
    description: t("Dashboard.Card.PlayChess.Desc"),
    label: t("Dashboard.Card.PlayChess.Button"),
    onClick: () => {
      const uuid = genID();
      setTabs((prev: Tab[]) => {
        return [
          ...prev,
          {
            value: uuid,
            name: "New Game",
            type: "play",
          },
        ];
      });
      setActiveTab(uuid);
      navigate({ to: "/boards" });
    },
  };

  const quickActions: {
    icon: React.ReactNode;
    title: string;
    description: string;
    onClick: () => void;
    color: MantineColor;
  }[] = [
    {
      icon: <IconClock />,
      title: "Classical",
      description: "Play classical chess games",
      onClick: () => {
        const uuid = genID();
        setTabs((prev: Tab[]) => {
          return [
            ...prev,
            {
              value: uuid,
              name: "Classical",
              type: "play",
              meta: {
                timeControl: {
                  seconds: 30 * 60 * 1000,
                  increment: 0,
                },
              },
            },
          ];
        });
        setActiveTab(uuid);
        navigate({ to: "/boards" });
      },
      color: "blue.6",
    },
    {
      icon: <IconStopwatch />,
      title: "Rapid",
      description: "Play quick-paced rapid games",
      onClick: () => {
        const uuid = genID();
        setTabs((prev: Tab[]) => {
          return [
            ...prev,
            {
              value: uuid,
              name: "Rapid",
              type: "play",
              meta: {
                timeControl: {
                  seconds: 10 * 60 * 1000,
                  increment: 0,
                },
              },
            },
          ];
        });
        setActiveTab(uuid);
        navigate({ to: "/boards" });
      },
      color: "teal.6",
    },
    {
      icon: <IconBolt />,
      title: "Blitz",
      description: "Play fast-paced blitz games",
      onClick: () => {
        const uuid = genID();
        setTabs((prev: Tab[]) => {
          return [
            ...prev,
            {
              value: uuid,
              name: "Blitz",
              type: "play",
              meta: {
                timeControl: {
                  seconds: 3 * 60 * 1000,
                  increment: 0,
                },
              },
            },
          ];
        });
        setActiveTab(uuid);
        navigate({ to: "/boards" });
      },
      color: "yellow.6",
    },
    {
      icon: <IconBolt />,
      title: "Bullet",
      description: "Play ultra-fast bullet games",
      onClick: () => {
        const uuid = genID();
        setTabs((prev: Tab[]) => {
          return [
            ...prev,
            {
              value: uuid,
              name: "Bullet",
              type: "play",
              meta: {
                timeControl: {
                  seconds: 1 * 60 * 1000,
                  increment: 0,
                },
              },
            },
          ];
        });
        setActiveTab(uuid);
        navigate({ to: "/boards" });
      },
      color: "blue.6",
    },
  ];

  return (
    <Stack p="md" gap="md">
      <Card shadow="sm" p="lg" radius="md" withBorder>
        <Group align="center" justify="space-between" wrap="nowrap">
          <Stack gap={6} flex={6}>
            <Title order={1} fw={800}>
              {isFirstOpen ? "Welcome to Chessifier!" : " Welcome back"}
            </Title>
            <Text size="sm" c="dimmed">
              Ready to make your next best move?
            </Text>
            <Group gap="xs" mt="xs">
              <Button radius="md" onClick={PLAY_CHESS.onClick} leftSection={<IconChess size={18} />}>
                Play a game
              </Button>
              <Button
                variant="light"
                radius="md"
                onClick={() => navigate({ to: "/boards" })}
                leftSection={<IconUpload size={18} />}
              >
                Upload PGN
              </Button>
            </Group>
          </Stack>
          <Box flex={4}>
            <Image src="/chess-play.jpg" alt="Chess play" radius="lg" />
          </Box>
        </Group>
      </Card>

      <Grid>
        <Grid.Col span={{ base: 12, md: 3 }}>
          <Card withBorder p="lg" radius="md" h="100%">
            <Group>
              <Avatar size={40} radius="xl" src={undefined}>
                {user.name[0]}
              </Avatar>
              <Box>
                <Group gap={6}>
                  <Text fw={700}>{user.name}</Text>
                  <Badge color="yellow" variant="light">
                    {getChessTitle(user.rating)}
                  </Badge>
                </Group>
                <Text size="sm" c="dimmed">
                  {user.handle}
                </Text>
              </Box>
            </Group>
            <Divider my="md" />
            <Group justify="space-between">
              {ratingHistory.blitz && (
                <Stack gap={2} p="md" align="center">
                  <Text size="xs" c="yellow.6">
                    Blitz
                  </Text>
                  <Text fw={700} fz="xl">
                    {ratingHistory.blitz}
                  </Text>
                </Stack>
              )}
              {ratingHistory.rapid && (
                <Stack gap={2} p="md" align="center">
                  <Text size="xs" c="teal.6">
                    Rapid
                  </Text>
                  <Text fw={700} fz="xl">
                    {ratingHistory.rapid}
                  </Text>
                </Stack>
              )}
              {ratingHistory.bullet && (
                <Stack gap={2} p="md" align="center">
                  <Text size="xs" c="blue.6">
                    Bullet
                  </Text>
                  <Text fw={700} fz="xl">
                    {ratingHistory.bullet}
                  </Text>
                </Stack>
              )}
            </Group>
          </Card>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 9 }}>
          <Card withBorder p="lg" radius="md" h="100%">
            <SimpleGrid cols={{ base: 4, sm: 4, lg: 4 }}>
              {quickActions.map((qa) => (
                <Card key={qa.title} withBorder radius="md" p="md">
                  <Stack gap={8} align="flex-start">
                    <Group>
                      <ThemeIcon variant="light" color={qa.color} size={42} radius="md">
                        {qa.icon}
                      </ThemeIcon>
                      <Text fw={600}>{qa.title}</Text>
                    </Group>
                    <Text size="sm" c="dimmed">
                      {qa.description}
                    </Text>
                    <Button variant="light" rightSection={<IconArrowRight size={16} />} onClick={qa.onClick}>
                      Open
                    </Button>
                  </Stack>
                </Card>
              ))}
            </SimpleGrid>
          </Card>
        </Grid.Col>
      </Grid>

      <Grid>
        <Grid.Col span={{ base: 12, md: 7 }}>
            <SimpleGrid cols={1} spacing="md">
                    <RecentOnlineGames
                        platform="lichess"
                        title="Recent Lichess Games"
                        fetchGamesFn={(username) => fetchLastLichessGames(username, 5)}
                        gameAdapter={lichessGameAdapter}
                    />
                    <RecentOnlineGames
                        platform="chess.com"
                        title="Recent Chess.com Games"
                        fetchGamesFn={fetchLastChessComGames}
                        gameAdapter={chessComGameAdapter}
                    />
            </SimpleGrid>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 5 }}>
          <Card withBorder p="lg" radius="md" h="100%">
            <Group justify="space-between" mb="sm">
              <Text fw={700}>Puzzles</Text>
              <Button
                size="xs"
                variant="light"
                onClick={() => navigate({ to: "/boards" })}
                leftSection={<IconPuzzle size={16} />}
              >
                Solve now
              </Button>
            </Group>
            <Group align="center" gap="lg">
              <RingProgress
                size={180}
                thickness={12}
                sections={[{ value: (puzzleStats.currentStreak / puzzleStats.target) * 100, color: "yellow" }]}
                label={
                  <Stack gap={0} align="center">
                    <ThemeIcon color="yellow" variant="light">
                      <IconFlame size={18} />
                    </ThemeIcon>
                    <Text fw={700}>{puzzleStats.currentStreak}</Text>
                    <Text size="xs" c="dimmed">
                      day streak
                    </Text>
                  </Stack>
                }
              />
              <Box style={{ flex: 1 }}>
                <Text size="sm" c="dimmed" mb={6}>
                  This week
                </Text>
                <BarChart
                  h={120}
                  data={puzzleStats.history}
                  dataKey="day"
                  series={[{ name: "solved", color: "yellow.6" }]}
                  withLegend={false}
                  gridAxis="none"
                  xAxisProps={{ hide: true }}
                  yAxisProps={{ hide: true }}
                  barProps={{ radius: 4 }}
                />
              </Box>
            </Group>
          </Card>
        </Grid.Col>
      </Grid>

      <Grid>
        <Grid.Col span={{ base: 12, md: 7 }}>
          <Card withBorder p="lg" radius="md" h="100%">
            <Group justify="space-between" mb="sm">
              <Text fw={700}>Recent Local Games</Text>
            </Group>
            <ScrollArea h={240} type="auto">
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
                  {recentGames.map((g) => {
                    const isUserWhite = g.white.type === "human";
                    const opponent = isUserWhite ? g.black : g.white;
                    const color = isUserWhite ? "White" : "Black";
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
                          <Button
                            size="xs"
                            variant="light"
                            onClick={() => {
                              const uuid = genID();
                              setTabs((prev: Tab[]) => [...prev, { value: uuid, name: "Analyze", type: "analysis" }]);
                              setActiveTab(uuid);
                              navigate({ to: "/boards" });
                            }}
                          >
                            Analyze
                          </Button>
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 5 }}>
          <Card withBorder p="lg" radius="md" h="100%">
            <Group justify="space-between" mb="sm">
              <Text fw={700}>Daily goals</Text>
              <ThemeIcon variant="light" color="teal">
                <IconTrophy size={16} />
              </ThemeIcon>
            </Group>
            <Stack>
              {goals.map((g) => {
                const value = Math.round((g.current / g.total) * 100);
                return (
                  <Box key={g.id}>
                    <Group justify="space-between" mb={4}>
                      <Text size="sm">{g.label}</Text>
                      <Text size="xs" c="dimmed">
                        {g.current}/{g.total}
                      </Text>
                    </Group>
                    <Progress value={value} color={value >= 100 ? "teal" : value > 60 ? "yellow" : "green"} />
                  </Box>
                );
              })}
            </Stack>
            <Divider my="md" />
            <Group>
              <Badge color="yellow" variant="light" leftSection={<IconFlame size={14} />}>
                Streak {puzzleStats.currentStreak}
              </Badge>
              {achievements.map((a) => (
                <Badge key={a.id} color="teal" variant="light" leftSection={<IconTrophy size={14} />}>
                  Achievement: {a.label}
                </Badge>
              ))}
            </Group>
          </Card>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
