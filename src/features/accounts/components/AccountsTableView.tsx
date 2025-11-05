import {
  ActionIcon,
  Badge,
  Group,
  Image,
  Paper,
  ScrollArea,
  Stack,
  Table,
  Text,
  Tooltip,
} from "@mantine/core";
import {
  IconCheck,
  IconCircle,
  IconCircleCheck,
  IconDownload,
  IconEdit,
  IconRefresh,
  IconX,
} from "@tabler/icons-react";
import { useAtom, useAtomValue } from "jotai";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { DatabaseInfo } from "@/bindings";
import { sessionsAtom } from "@/state/atoms";
import { getChessComAccount, getStats } from "@/utils/chess.com/api";
import { capitalize, parseDate } from "@/utils/format";
import { getLichessAccount } from "@/utils/lichess/api";
import type { Session } from "@/utils/session";
import LichessLogo from "./LichessLogo";

interface AccountsTableViewProps {
  databases: DatabaseInfo[];
  setDatabases: React.Dispatch<React.SetStateAction<DatabaseInfo[]>>;
  query?: string;
  sortBy?: "name" | "elo";
}

function AccountsTableView({ databases, query = "", sortBy = "name" }: AccountsTableViewProps) {
  const { t } = useTranslation();
  const sessions = useAtomValue(sessionsAtom);
  const [, setSessions] = useAtom(sessionsAtom);

  const [mainAccount, setMainAccount] = useState<string | null>(null);
  const [editingAccount, setEditingAccount] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  useEffect(() => {
    const stored = localStorage.getItem("mainAccount");
    setMainAccount(stored);
  }, []);

  useEffect(() => {
    if (mainAccount) {
      localStorage.setItem("mainAccount", mainAccount);
    }
  }, [mainAccount]);

  function bestRatingForSession(s: Session): number {
    if (s.lichess?.account?.perfs) {
      const p = s.lichess.account.perfs;
      const ratings = [p.bullet?.rating, p.blitz?.rating, p.rapid?.rating, p.classical?.rating].filter(
        (x): x is number => typeof x === "number",
      );
      if (ratings.length) return Math.max(...ratings);
    }
    if (s.chessCom?.stats) {
      const arr = getStats(s.chessCom.stats);
      if (arr.length) return Math.max(...arr.map((a) => a.value));
    }
    return -1;
  }

  const playerNames = Array.from(
    new Set(
      sessions
        .map((s) => s.player ?? s.lichess?.username ?? s.chessCom?.username)
        .filter((n): n is string => typeof n === "string" && n.length > 0),
    ),
  );

  const playerSessions = playerNames.map((name) => ({
    name,
    sessions: sessions.filter(
      (s) => s.player === name || s.lichess?.username === name || s.chessCom?.username === name,
    ),
  }));

  const q = query.trim().toLowerCase();
  const filteredAndSorted = playerSessions
    .filter(({ name, sessions }) => {
      if (!q) return true;
      const usernames = sessions
        .map((s) => s.lichess?.username || s.chessCom?.username || "")
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return name.toLowerCase().includes(q) || usernames.includes(q);
    })
    .sort((a, b) => {
      if (sortBy === "name") return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      const ra = a.sessions.map(bestRatingForSession).reduce((max, v) => (v > max ? v : max), -1);
      const rb = b.sessions.map(bestRatingForSession).reduce((max, v) => (v > max ? v : max), -1);
      return rb - ra;
    });

  const rows = filteredAndSorted.flatMap(({ name, sessions: playerSessions }) =>
    playerSessions.map((session) => {
      const type = session.lichess ? "lichess" : "chesscom";
      const username = session.lichess?.username ?? session.chessCom?.username ?? "";
      const database = databases.find((db) => db.filename === `${username}_${type}.db3`) ?? null;
      const downloadedGames = database?.type === "success" ? database.game_count : 0;
      
      let totalGames = 0;
      const stats = [];

      if (session.lichess?.account) {
        const account = session.lichess.account;
        totalGames = account.count?.all ?? 0;
        const speeds = ["bullet", "blitz", "rapid", "classical"] as const;
        if (account.perfs) {
          for (const speed of speeds) {
            const perf = account.perfs[speed];
            if (perf) {
              stats.push({
                value: perf.rating,
                label: speed,
                diff: perf.prog,
              });
            }
          }
        }
      } else if (session.chessCom?.stats) {
        for (const stat of Object.values(session.chessCom.stats)) {
          if (stat.record) {
            totalGames += stat.record.win + stat.record.loss + stat.record.draw;
          }
        }
        if (database && database.type === "success") {
          totalGames = Math.max(totalGames, database.game_count ?? 0);
        }
        stats.push(...getStats(session.chessCom.stats));
      }

      const percentage = totalGames === 0 || downloadedGames === 0 ? 0 : (downloadedGames / totalGames) * 100;

      return {
        key: session.lichess?.account.id ?? `${type}:${username}`,
        name,
        username,
        type: type as "lichess" | "chesscom",
        stats,
        totalGames,
        downloadedGames,
        percentage,
        updatedAt: session.updatedAt,
        session,
        database,
      };
    }),
  );

  async function handleReload(session: Session) {
    if (session.lichess) {
      const account = await getLichessAccount({
        token: session.lichess.accessToken,
        username: session.lichess.username,
      });
      if (!account) return;
      const lichessUsername = session.lichess.username;
      const lichessAccessToken = session.lichess.accessToken;
      setSessions((sessions) =>
        sessions.map((s) =>
          s.lichess?.account.id === account.id
            ? {
                ...s,
                lichess: {
                  account: account,
                  username: lichessUsername,
                  accessToken: lichessAccessToken,
                },
                updatedAt: Date.now(),
              }
            : s,
        ),
      );
    } else if (session.chessCom) {
      const stats = await getChessComAccount(session.chessCom.username);
      if (!stats) return;
      const chessComUsername = session.chessCom.username;
      setSessions((sessions) =>
        sessions.map((s) =>
          s.chessCom?.username === chessComUsername
            ? {
                ...s,
                chessCom: {
                  username: chessComUsername,
                  stats,
                },
                updatedAt: Date.now(),
              }
            : s,
        ),
      );
    }
  }

  function handleRemove(session: Session) {
    if (session.lichess) {
      setSessions((sessions) => sessions.filter((s) => s.lichess?.account.id !== session.lichess?.account.id));
    } else if (session.chessCom) {
      setSessions((sessions) => sessions.filter((s) => s.chessCom?.username !== session.chessCom?.username));
    }
  }

  function handleSaveEdit(username: string, type: "lichess" | "chesscom") {
    setSessions((prev) =>
      prev.map((s) => {
        if (type === "lichess" && s.lichess?.username === username) {
          return { ...s, player: editValue };
        } else if (type === "chesscom" && s.chessCom?.username === username) {
          return { ...s, player: editValue };
        }
        return s;
      }),
    );
    setEditingAccount(null);
  }

  return (
    <Paper withBorder>
      <ScrollArea>
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Main</Table.Th>
              <Table.Th>Player</Table.Th>
              <Table.Th>Platform</Table.Th>
              <Table.Th>Username</Table.Th>
              <Table.Th>Ratings</Table.Th>
              <Table.Th>Games</Table.Th>
              <Table.Th>Downloaded</Table.Th>
              <Table.Th>Last Updated</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((row) => (
              <Table.Tr key={row.key}>
                <Table.Td>
                  <Tooltip
                    label={
                      mainAccount === row.name
                        ? t("accounts.accountCard.mainAccount")
                        : t("accounts.accountCard.setAsMainAccount")
                    }
                  >
                    <ActionIcon
                      size="sm"
                      variant="subtle"
                      onClick={() => setMainAccount(row.name)}
                      aria-label={
                        mainAccount === row.name
                          ? t("accounts.accountCard.mainAccount")
                          : t("accounts.accountCard.setAsMainAccount")
                      }
                    >
                      {mainAccount === row.name ? <IconCircleCheck /> : <IconCircle />}
                    </ActionIcon>
                  </Tooltip>
                </Table.Td>
                <Table.Td>
                  {editingAccount === `${row.type}_${row.username}` ? (
                    <Group gap="xs">
                      <input
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        style={{ padding: "0.25rem", fontSize: "0.875rem" }}
                      />
                      <ActionIcon
                        size="xs"
                        variant="subtle"
                        color="green"
                        onClick={() => handleSaveEdit(row.username, row.type)}
                      >
                        <IconCheck size="1rem" />
                      </ActionIcon>
                      <ActionIcon
                        size="xs"
                        variant="subtle"
                        color="red"
                        onClick={() => setEditingAccount(null)}
                      >
                        <IconX size="1rem" />
                      </ActionIcon>
                    </Group>
                  ) : (
                    <Group gap="xs">
                      <Text size="sm" fw={500}>
                        {row.name}
                      </Text>
                      <ActionIcon
                        size="xs"
                        variant="subtle"
                        onClick={() => {
                          setEditingAccount(`${row.type}_${row.username}`);
                          setEditValue(row.name);
                        }}
                      >
                        <IconEdit size="1rem" />
                      </ActionIcon>
                    </Group>
                  )}
                </Table.Td>
                <Table.Td>
                  <Group gap="xs">
                    {row.type === "lichess" ? (
                      <LichessLogo />
                    ) : (
                      <Image w="20px" h="20px" src="/chesscom.png" alt="chess.com" />
                    )}
                  </Group>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{row.username}</Text>
                </Table.Td>
                <Table.Td>
                  <Group gap="xs">
                    {row.stats.slice(0, 4).map((stat) => (
                      <Badge key={stat.label} size="sm" variant="light">
                        {capitalize(stat.label)}: {stat.value}
                      </Badge>
                    ))}
                  </Group>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{row.totalGames}</Text>
                </Table.Td>
                <Table.Td>
                  <Stack gap="xs">
                    <Text size="sm">{row.downloadedGames}</Text>
                    <Text size="xs" c="dimmed">
                      {row.percentage.toFixed(1)}%
                    </Text>
                  </Stack>
                </Table.Td>
                <Table.Td>
                  <Text size="xs" c="dimmed">
                    {t("formatters.dateFormat", {
                      date: parseDate(row.updatedAt),
                      interpolation: { escapeValue: false },
                    })}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Group gap="xs" wrap="nowrap">
                    <Tooltip label={t("accounts.accountCard.updateStats")}>
                      <ActionIcon size="sm" variant="subtle" onClick={() => handleReload(row.session)}>
                        <IconRefresh size="1rem" />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label={t("accounts.accountCard.downloadGames")}>
                      <ActionIcon size="sm" variant="subtle">
                        <IconDownload size="1rem" />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label={t("accounts.accountCard.removeAccount")}>
                      <ActionIcon size="sm" variant="subtle" color="red" onClick={() => handleRemove(row.session)}>
                        <IconX size="1rem" />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>
    </Paper>
  );
}

export default AccountsTableView;
