import { BarChart } from "@mantine/charts";
import type { MantineColor } from "@mantine/core";
import {
  ActionIcon,
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
  Select,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import {
  IconArrowRight,
  IconBolt,
  IconBook2,
  IconBrain,
  IconChess,
  IconClock,
  IconFlame,
  IconPuzzle,
  IconRefresh,
  IconStopwatch,
  IconTrophy,
  IconUpload,
} from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { info } from "@tauri-apps/plugin-log";
import { useAtom, useAtomValue } from "jotai";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Outcome } from "@/bindings";
import { lessons } from "@/features/learn/constants/lessons";
import { practices } from "@/features/learn/constants/practices";
import { activeTabAtom, sessionsAtom, tabsAtom } from "@/state/atoms";
import { useUserStatsStore } from "@/state/userStatsStore";
import { type Achievement, getAchievements } from "@/utils/achievements";
import { type ChessComGame, fetchLastChessComGames } from "@/utils/chess.com/api";
import { type DailyGoal, getDailyGoals } from "@/utils/dailyGoals";
import { formatDateToPGN } from "@/utils/format";
import { type GameRecord, getRecentGames } from "@/utils/gameRecords";
import { fetchLastLichessGames } from "@/utils/lichess/api";
import { getPuzzleStats, getTodayPuzzleCount } from "@/utils/puzzleStreak";
import { createTab, genID, type Tab } from "@/utils/tabs";

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

export default function DashboardPage() {
  const [isFirstOpen, setIsFirstOpen] = useState(false);
  useEffect(() => {
    const key = "pawn-appetit.firstOpen";
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
  const [activeGamesTab, setActiveGamesTab] = useState<string | null>("local");

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

  let user = {
    name: mainAccountName ?? "No main account",
    handle: "",
    rating: 0,
  };
  let ratingHistory: { classical?: number; rapid?: number; blitz?: number; bullet?: number } = {};
  if (mainSession?.lichess?.account) {
    const acc = mainSession.lichess.account;
    user = {
      name: acc.username,
      handle: `@${acc.username}`,
      rating: acc.perfs?.classical?.rating ?? acc.perfs?.rapid?.rating ?? acc.perfs?.blitz?.rating ?? 0,
    };
    const classical = acc.perfs?.classical?.rating;
    const rapid = acc.perfs?.rapid?.rating;
    const blitz = acc.perfs?.blitz?.rating;
    const bullet = acc.perfs?.bullet?.rating;
    ratingHistory = { classical, rapid, blitz, bullet };
  } else if (mainSession?.chessCom?.stats) {
    const stats = mainSession.chessCom.stats;
    user = {
      name: mainSession.chessCom.username,
      handle: `@${mainSession.chessCom.username}`,
      rating: stats.chess_rapid?.last?.rating ?? stats.chess_blitz?.last?.rating ?? 0,
    };
    const rapid = stats.chess_rapid?.last?.rating;
    const blitz = stats.chess_blitz?.last?.rating;
    const bullet = stats.chess_bullet?.last?.rating;
    ratingHistory = { rapid, blitz, bullet };
  }

  const lichessUsernames = [...new Set(sessions.map((s) => s.lichess?.username).filter(Boolean) as string[])];
  const chessComUsernames = [...new Set(sessions.map((s) => s.chessCom?.username).filter(Boolean) as string[])];

  const [selectedLichessUser, setSelectedLichessUser] = useState<string | null>("all");
  const [selectedChessComUser, setSelectedChessComUser] = useState<string | null>("all");

  const [recentGames, setRecentGames] = useState<GameRecord[]>([]);
  useEffect(() => {
    getRecentGames(50).then(setRecentGames);
  }, []);

  const [lastLichessUpdate, setLastLichessUpdate] = useState(Date.now());
  const [lichessGames, setLichessGames] = useState<any[]>([]);
  useEffect(() => {
    const fetchGames = async () => {
      const usersToFetch =
        selectedLichessUser === "all" ? lichessUsernames : selectedLichessUser ? [selectedLichessUser] : [];
      if (usersToFetch.length > 0) {
        const allGamesPromises = usersToFetch.map((username) => fetchLastLichessGames(username, 50));
        const gamesArrays = await Promise.all(allGamesPromises);
        const combinedGames = gamesArrays.flat();
        combinedGames.sort((a, b) => b.createdAt - a.createdAt);
        setLichessGames(combinedGames.slice(0, 50));
      } else {
        setLichessGames([]);
      }
    };
    fetchGames();
  }, [sessions, lastLichessUpdate, selectedLichessUser]);

  const [lastChessComUpdate, setLastChessComUpdate] = useState(Date.now());
  const [chessComGames, setChessComGames] = useState<ChessComGame[]>([]);
  useEffect(() => {
    const fetchGames = async () => {
      const usersToFetch =
        selectedChessComUser === "all" ? chessComUsernames : selectedChessComUser ? [selectedChessComUser] : [];
      if (usersToFetch.length > 0) {
        info(`Fetching Chess.com games for: ${JSON.stringify(usersToFetch)}`);
        const allGamesPromises = usersToFetch.map((username) => fetchLastChessComGames(username));
        const gamesArrays = await Promise.all(allGamesPromises);

        const combinedGames = gamesArrays.flat();
        combinedGames.sort((a, b) => b.end_time - a.end_time);
        setChessComGames(combinedGames.slice(0, 50));
      } else {
        setChessComGames([]);
      }
    };
    fetchGames();
  }, [sessions, lastChessComUpdate, selectedChessComUser]);

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
              const headersForAnalysis = {
                id: 0,
                event: "Local Game",
                site: "Pawn Appetit",
                date: formatDateToPGN(last.timestamp),
                white: last.white.name ?? (last.white.engine ? `Engine (${last.white.engine})` : "White"),
                black: last.black.name ?? (last.black.engine ? `Engine (${last.black.engine})` : "Black"),
                result: last.result as Outcome,
                fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
                time_control: last.timeControl,
                variant: last.variant,
              };

              let pgn = "";
              if (last.moves && last.moves.length > 0) {
                const movesPairs = [];
                for (let i = 0; i < last.moves.length; i += 2) {
                  const moveNumber = Math.floor(i / 2) + 1;
                  const whiteMove = last.moves[i];
                  const blackMove = last.moves[i + 1];

                  if (blackMove) {
                    movesPairs.push(`${moveNumber}. ${whiteMove} ${blackMove}`);
                  } else {
                    movesPairs.push(`${moveNumber}. ${whiteMove}`);
                  }
                }
                pgn = movesPairs.join(" ") + " " + last.result;
              } else {
                pgn = last.result;
              }

              createTab({
                tab: {
                  name: `${headersForAnalysis.white} - ${headersForAnalysis.black}`,
                  type: "analysis",
                },
                setTabs,
                setActiveTab,
                pgn,
                headers: headersForAnalysis,
              });
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
    title: t("features.dashboard.cards.playChess.title"),
    description: t("features.dashboard.cards.playChess.desc"),
    label: t("features.dashboard.cards.playChess.button"),
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
              {t(isFirstOpen ? "features.dashboard.welcome.firstOpen" : "features.dashboard.welcome.back")}
            </Title>
            <Text size="sm" c="dimmed">
              {t("features.dashboard.welcome.desc")}
            </Text>
            <Group gap="xs" mt="xs">
              <Button radius="md" onClick={PLAY_CHESS.onClick} leftSection={<IconChess size={18} />}>
                {PLAY_CHESS.label}
              </Button>
              <Button
                variant="light"
                radius="md"
                onClick={() => {
                  navigate({ to: "/boards" });
                  modals.openContextModal({
                    modal: "importModal",
                    innerProps: {},
                  });
                }}
                leftSection={<IconUpload size={18} />}
              >
                {t("features.tabs.importGame.button")}
              </Button>
            </Group>
          </Stack>
          <Box flex={4}>
            <Image src="/chess-play.jpg" alt="Chess play" radius="lg" />
          </Box>
        </Group>
      </Card>

      <Grid>
        <Grid.Col span={{ base: 12, sm: 12, md: 4, lg: 3, xl: 3 }}>
          <Card withBorder p="lg" radius="md" h="100%">
            <Box>
              <Group gap={6} justify="space-between">
                <Text fw={700}>{user.name}</Text>
                <Badge color="yellow" variant="light">
                  {getChessTitle(user.rating)}
                </Badge>
              </Group>
              <Text size="sm" c="dimmed">
                {user.handle}
              </Text>
            </Box>
            <Divider my="md" />
            <Group justify="space-between" align="stretch">
              {ratingHistory.classical && (
                <Stack gap={2} p={{ base: "xs", sm: "md" }} style={{ flex: 1 }}>
                  <Text size="xs" c="teal.6">
                    Classical
                  </Text>
                  <Text fw={700} fz={{ base: "lg", sm: "xl" }}>
                    {ratingHistory.classical}
                  </Text>
                </Stack>
              )}
              {ratingHistory.rapid && (
                <Stack gap={2} p={{ base: "xs", sm: "md" }} style={{ flex: 1 }}>
                  <Text size="xs" c="teal.6">
                    Rapid
                  </Text>
                  <Text fw={700} fz={{ base: "lg", sm: "xl" }}>
                    {ratingHistory.rapid}
                  </Text>
                </Stack>
              )}
              {ratingHistory.blitz && (
                <Stack gap={2} p={{ base: "xs", sm: "md" }} style={{ flex: 1 }}>
                  <Text size="xs" c="yellow.6">
                    Blitz
                  </Text>
                  <Text fw={700} fz={{ base: "lg", sm: "xl" }}>
                    {ratingHistory.blitz}
                  </Text>
                </Stack>
              )}
              {ratingHistory.bullet && (
                <Stack gap={2} p={{ base: "xs", sm: "md" }} style={{ flex: 1 }}>
                  <Text size="xs" c="blue.6">
                    Bullet
                  </Text>
                  <Text fw={700} fz={{ base: "lg", sm: "xl" }}>
                    {ratingHistory.bullet}
                  </Text>
                </Stack>
              )}
            </Group>
          </Card>
        </Grid.Col>

        <Grid.Col span={{ base: 12, sm: 12, md: 8, lg: 9, xl: 9 }}>
          <Card withBorder p="lg" radius="md" h="100%">
            <SimpleGrid cols={{ base: 1, xs: 2, sm: 2, md: 2, lg: 4, xl: 4 }}>
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
        <Grid.Col span={{ base: 12, sm: 12, md: 7, lg: 7, xl: 7 }}>
          <Card withBorder p="lg" radius="md" h="100%">
            <Tabs value={activeGamesTab} onChange={setActiveGamesTab}>
              <Group justify="space-between" align="center">
                <Tabs.List>
                  <Tabs.Tab value="local">Local</Tabs.Tab>
                  <Tabs.Tab value="chesscom">Chess.com</Tabs.Tab>
                  <Tabs.Tab value="lichess">Lichess</Tabs.Tab>
                </Tabs.List>
                {activeGamesTab === "chesscom" && (
                  <Group justify="space-between">
                    <Select
                      placeholder="Filter by account"
                      value={selectedChessComUser}
                      onChange={setSelectedChessComUser}
                      data={[
                        { value: "all", label: "All Accounts" },
                        ...chessComUsernames.map((name) => ({ value: name, label: name })),
                      ]}
                      disabled={chessComUsernames.length <= 1}
                    />
                    <ActionIcon variant="subtle" onClick={() => setLastChessComUpdate(Date.now())}>
                      <IconRefresh size="1rem" />
                    </ActionIcon>
                  </Group>
                )}
                {activeGamesTab === "lichess" && (
                  <Group justify="space-between">
                    <Select
                      placeholder="Filter by account"
                      value={selectedLichessUser}
                      onChange={setSelectedLichessUser}
                      data={[
                        { value: "all", label: "All Accounts" },
                        ...lichessUsernames.map((name) => ({ value: name, label: name })),
                      ]}
                      disabled={lichessUsernames.length <= 1}
                    />
                    <ActionIcon variant="subtle" onClick={() => setLastLichessUpdate(Date.now())}>
                      <IconRefresh size="1rem" />
                    </ActionIcon>
                  </Group>
                )}
              </Group>

              <Tabs.Panel value="local" pt="xs">
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
                      {recentGames.map((g) => {
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
                                  {" "}
                                  {(opponent.name ?? "?")[0]?.toUpperCase()}{" "}
                                </Avatar>
                                <Text>{opponent.name ?? (opponent.engine ? `Engine (${opponent.engine})` : "?")}</Text>
                              </Group>
                            </Table.Td>
                            <Table.Td>
                              <Badge variant="light">{color}</Badge>
                            </Table.Td>
                            <Table.Td>
                              <Badge color={g.result === "1-0" ? "teal" : g.result === "0-1" ? "red" : "gray"}>
                                {" "}
                                {g.result === "1-0" ? "Win" : g.result === "0-1" ? "Loss" : g.result}{" "}
                              </Badge>
                            </Table.Td>
                            <Table.Td>
                              <Text size="xs" c="dimmed">
                                {" "}
                                -{" "}
                              </Text>
                            </Table.Td>
                            <Table.Td>{g.moves.length}</Table.Td>
                            <Table.Td c="dimmed">{dateStr}</Table.Td>
                            <Table.Td>
                              <Button
                                size="xs"
                                variant="light"
                                onClick={() => {
                                  const headersForAnalysis = {
                                    id: 0,
                                    event: "Local Game",
                                    site: "Pawn Appetit",
                                    date: formatDateToPGN(g.timestamp),
                                    white: g.white.name ?? (g.white.engine ? `Engine (${g.white.engine})` : "White"),
                                    black: g.black.name ?? (g.black.engine ? `Engine (${g.black.engine})` : "Black"),
                                    result: g.result as Outcome,
                                    fen: g.fen,
                                    time_control: g.timeControl,
                                    variant: g.variant,
                                  };

                                  let pgn = "";
                                  if (g.moves && g.moves.length > 0) {
                                    const movesPairs = [];
                                    for (let i = 0; i < g.moves.length; i += 2) {
                                      const moveNumber = Math.floor(i / 2) + 1;
                                      const whiteMove = g.moves[i];
                                      const blackMove = g.moves[i + 1];

                                      if (blackMove) {
                                        movesPairs.push(`${moveNumber}. ${whiteMove} ${blackMove}`);
                                      } else {
                                        movesPairs.push(`${moveNumber}. ${whiteMove}`);
                                      }
                                    }
                                    pgn = movesPairs.join(" ") + " " + g.result;
                                  } else {
                                    pgn = g.result;
                                  }

                                  createTab({
                                    tab: {
                                      name: `${headersForAnalysis.white} - ${headersForAnalysis.black}`,
                                      type: "analysis",
                                    },
                                    setTabs,
                                    setActiveTab,
                                    pgn,
                                    headers: headersForAnalysis,
                                  });
                                  navigate({ to: "/boards" });
                                }}
                              >
                                {" "}
                                Analyze{" "}
                              </Button>
                            </Table.Td>
                          </Table.Tr>
                        );
                      })}
                    </Table.Tbody>
                  </Table>
                </ScrollArea>
              </Tabs.Panel>

              <Tabs.Panel value="chesscom" pt="xs">
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
                      {chessComGames.map((g) => {
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
                                  {" "}
                                  {opponent.username[0].toUpperCase()}{" "}
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
                                  result === "win"
                                    ? "teal"
                                    : result === "checkmated" || result === "resigned"
                                      ? "red"
                                      : "gray"
                                }
                              >
                                {" "}
                                {result}{" "}
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
                                <Button
                                  size="xs"
                                  variant="light"
                                  onClick={() => {
                                    if (g.pgn) {
                                      const headersForAnalysis = {
                                        id: 0,
                                        event: "Online Game",
                                        site: "Chess.com",
                                        date: formatDateToPGN(g.end_time * 1000),
                                        white: g.white.username,
                                        black: g.black.username,
                                        result: (g.white.result === "win"
                                          ? "1-0"
                                          : g.black.result === "win"
                                            ? "0-1"
                                            : "1/2-1/2") as Outcome,
                                        fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
                                      };
                                      createTab({
                                        tab: {
                                          name: `${g.white.username} - ${g.black.username}`,
                                          type: "analysis",
                                        },
                                        setTabs,
                                        setActiveTab,
                                        pgn: g.pgn,
                                        headers: headersForAnalysis,
                                      });
                                      navigate({ to: "/boards" });
                                    }
                                  }}
                                >
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
              </Tabs.Panel>

              <Tabs.Panel value="lichess" pt="xs">
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
                      {lichessGames.map((g) => {
                        const isUserWhite = lichessUsernames.includes(g.players.white.user?.name);
                        const opponent = isUserWhite ? g.players.black : g.players.white;
                        const userAccount = isUserWhite ? g.players.white : g.players.black;
                        const color = isUserWhite ? t("chess.white") : t("chess.black");
                        return (
                          <Table.Tr key={g.id}>
                            <Table.Td>
                              <Group gap="xs">
                                <Avatar size={24} radius="xl">
                                  {" "}
                                  {opponent.user?.name[0].toUpperCase()}{" "}
                                </Avatar>
                                <Text>{opponent.user?.name}</Text>
                              </Group>
                            </Table.Td>
                            <Table.Td>
                              <Badge variant="light">{color}</Badge>
                            </Table.Td>
                            <Table.Td>
                              <Badge color={g.winner === color.toLowerCase() ? "teal" : g.winner ? "red" : "gray"}>
                                {" "}
                                {g.status}{" "}
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
                                <Button
                                  size="xs"
                                  variant="light"
                                  onClick={() => {
                                    if (g.pgn) {
                                      const headersForAnalysis = {
                                        id: 0,
                                        event: `Rated ${g.speed} game`,
                                        site: "Lichess.org",
                                        date: formatDateToPGN(g.createdAt),
                                        white: g.players.white.user?.name || "Unknown",
                                        black: g.players.black.user?.name || "Unknown",
                                        result: (g.winner === "white"
                                          ? "1-0"
                                          : g.winner === "black"
                                            ? "0-1"
                                            : "1/2-1/2") as Outcome,
                                        fen: g.lastFen,
                                      };

                                      createTab({
                                        tab: {
                                          name: `${headersForAnalysis.white} - ${headersForAnalysis.black}`,
                                          type: "analysis",
                                        },
                                        setTabs,
                                        setActiveTab,
                                        pgn: g.pgn,
                                        headers: headersForAnalysis,
                                      });
                                      navigate({ to: "/boards" });
                                    }
                                  }}
                                  disabled={!g.pgn}
                                >
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
              </Tabs.Panel>
            </Tabs>
          </Card>
        </Grid.Col>

        <Grid.Col span={{ base: 12, sm: 12, md: 5, lg: 5, xl: 5 }}>
          <Card withBorder p="lg" radius="md" h="100%">
            <Group justify="space-between" mb="sm">
              <Text fw={700}>{t("features.tabs.puzzle.title")}</Text>
              <Button
                size="xs"
                variant="light"
                onClick={() => {
                  createTab({
                    tab: { name: t("features.tabs.puzzle.title"), type: "puzzles" },
                    setTabs,
                    setActiveTab,
                  });
                  navigate({ to: "/boards" });
                }}
                leftSection={<IconPuzzle size={16} />}
              >
                {t("features.tabs.puzzle.button")}
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
        <Grid.Col span={{ base: 12, sm: 12, md: 7, lg: 7, xl: 7 }}>
          <Card withBorder p="lg" radius="md" h="100%">
            <Group justify="space-between" mb="sm">
              <Text fw={700}>Suggested for you</Text>
              <Group gap="xs">
                <Badge variant="light" color="grape">
                  Lessons
                </Badge>
                <Badge variant="light" color="blue">
                  Openings
                </Badge>
              </Group>
            </Group>
            <Stack>
              {suggestions.map((s) => (
                <Group key={s.id} justify="space-between" align="center">
                  <Group>
                    <ThemeIcon
                      variant="light"
                      color={s.tag === "Openings" ? "blue" : s.tag === "Endgames" ? "grape" : "teal"}
                    >
                      {s.tag === "Openings" ? (
                        <IconBook2 size={16} />
                      ) : s.tag === "Endgames" ? (
                        <IconBrain size={16} />
                      ) : (
                        <IconTrophy size={16} />
                      )}
                    </ThemeIcon>
                    <Stack gap={0}>
                      <Text fw={600}>{s.title}</Text>
                      <Group gap={6}>
                        <Badge variant="light">{s.tag}</Badge>
                        <Badge variant="dot" color="gray">
                          {s.difficulty}
                        </Badge>
                      </Group>
                    </Stack>
                  </Group>
                  <Button
                    variant="light"
                    onClick={() => {
                      if (s.onClick) s.onClick();
                      else if (s.to) navigate({ to: s.to });
                      else navigate({ to: "/learn" });
                    }}
                    rightSection={<IconArrowRight size={16} />}
                  >
                    Start
                  </Button>
                </Group>
              ))}
            </Stack>
          </Card>
        </Grid.Col>

        <Grid.Col span={{ base: 12, sm: 12, md: 5, lg: 5, xl: 5 }}>
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
