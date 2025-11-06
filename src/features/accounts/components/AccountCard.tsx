import {
  ActionIcon,
  Badge,
  Box,
  Card,
  Group,
  Image,
  Loader,
  Progress,
  rem,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import {
  IconArrowDownRight,
  IconArrowRight,
  IconArrowUpRight,
  IconCheck,
  IconCircle,
  IconCircleCheck,
  IconDownload,
  IconEdit,
  type IconProps,
  IconRefresh,
  IconX,
} from "@tabler/icons-react";
import { appDataDir, resolve } from "@tauri-apps/api/path";
import { info } from "@tauri-apps/plugin-log";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { DatabaseInfo } from "@/bindings";
import { commands, events } from "@/bindings";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import { downloadChessCom } from "@/utils/chess.com/api";
import { getDatabases, query_games } from "@/utils/db";
import { capitalize, parseDate } from "@/utils/format";
import { downloadLichess } from "@/utils/lichess/api";
import type { Session } from "@/utils/session";
import { unwrap } from "@/utils/unwrap";
import LichessLogo from "./LichessLogo";

interface AccountCardProps {
  name: string;
  type: "lichess" | "chesscom";
  database: DatabaseInfo | null;
  title: string;
  updatedAt: number;
  total: number;
  stats: {
    value: number;
    label: string;
    diff?: number;
  }[];
  setSessions: React.Dispatch<React.SetStateAction<Session[]>>;
  logout: () => void;
  reload: () => void;
  setDatabases: (databases: DatabaseInfo[]) => void;
  token?: string;
  isMain?: boolean;
  setMain?: () => void;
}

export function AccountCard({
  name,
  type,
  database,
  title,
  updatedAt,
  total,
  stats,
  logout,
  reload,
  setDatabases,
  token,
  setSessions,
  isMain,
  setMain,
}: AccountCardProps) {
  const { t } = useTranslation();
  const { layout } = useResponsiveLayout();
  const isMobile = layout.accounts.layoutType === "mobile";
  const items = stats.map((stat) => {
    let DiffIcon: React.FC<IconProps> = IconArrowRight;
    let badgeColor: string | undefined;

    if (stat.diff) {
      const sign = Math.sign(stat.diff);
      if (sign === 1) {
        DiffIcon = IconArrowUpRight;
        badgeColor = "teal";
      } else {
        DiffIcon = IconArrowDownRight;
        badgeColor = "red";
      }
    }

    return (
      <Card key={stat.label} withBorder p="sm" radius="md">
        <Stack gap={rem(8)}>
          <Group justify="space-between" align="center" wrap="nowrap">
            <Text size="xs" c="dimmed" tt="uppercase" fw={600} lh={1}>
              {capitalize(stat.label)}
            </Text>
            {stat.diff && (
              <Badge
                size="sm"
                variant="light"
                color={badgeColor}
                leftSection={<DiffIcon style={{ width: rem(12), height: rem(12) }} />}
                styles={{
                  root: { paddingLeft: rem(6) },
                  section: { marginRight: rem(4) },
                }}
              >
                {Math.abs(stat.diff)}
              </Badge>
            )}
          </Group>
          <Text fw={700} size="xl" lh={1} {...(!stat.value && { c: "dimmed", size: "md" })}>
            {stat.value || "N/A"}
          </Text>
        </Stack>
      </Card>
    );
  });
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [edit, setEdit] = useState(false);
  const [text, setText] = useState(name);
  useEffect(() => {
    setText(name);
  }, [name]);

  async function convert(filepath: string, timestamp: number | null) {
    info(`converting ${filepath} ${timestamp}`);
    const filename = title + (type === "lichess" ? " Lichess" : " Chess.com");
    const dbPath = await resolve(
      await appDataDir(),
      "db",
      `${filepath.split(/(\\|\/)/g).pop() ?? "unknown"}.db3`.replace(".pgn", ".db3"),
    );
    unwrap(await commands.convertPgn(filepath, dbPath, timestamp ? timestamp / 1000 : null, filename, null));
    events.downloadProgress.emit({
      id: `${type}_${title}`,
      progress: 100,
      finished: true,
    });
  }

  useEffect(() => {
    const unlisten = events.downloadProgress.listen(async (e) => {
      if (e.payload.id === `${type}_${title}`) {
        setProgress(e.payload.progress);
        if (e.payload.finished) {
          setLoading(false);
          setDatabases(await getDatabases());
        } else {
          setLoading(true);
        }
      }
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, [setDatabases, type, title]);

  const downloadedGames = database?.type === "success" ? database.game_count : 0;
  const percentage = total === 0 || downloadedGames === 0 ? "0" : ((downloadedGames / total) * 100).toFixed(2);

  async function getLastGameDate({ database }: { database: DatabaseInfo }) {
    const games = await query_games(database.file, {
      options: {
        page: 1,
        pageSize: 1,
        sort: "date",
        direction: "desc",
        skipCount: false,
      },
    });
    const count = games.count ?? 0;
    if (count > 0 && games.data[0].date && games.data[0].time) {
      const [year, month, day] = games.data[0].date.split(".").map(Number);
      const [hour, minute, second] = games.data[0].time.split(":").map(Number);
      const d = Date.UTC(year, month - 1, day, hour, minute, second);
      return d;
    }
    return null;
  }

  return (
    <Card
      withBorder
      shadow="sm"
      radius="md"
      p="lg"
      pos="relative"
      style={(theme) => ({
        transition: "box-shadow 150ms ease, transform 150ms ease",
        "&:hover": {
          boxShadow: theme.shadows.md,
          transform: "translateY(-2px)",
        },
      })}
    >
      {loading && (
        <Progress
          pos="absolute"
          top={0}
          left={0}
          w="100%"
          value={progress || 100}
          animated
          size="xs"
          radius={0}
          styles={{
            root: { borderTopLeftRadius: "var(--mantine-radius-md)", borderTopRightRadius: "var(--mantine-radius-md)" },
          }}
        />
      )}

      <Stack gap="md">
        <Card.Section inheritPadding py="sm" withBorder>
          <Group justify="space-between" wrap="nowrap">
            <Group gap="sm">
              <Box
                style={{
                  width: rem(40),
                  height: rem(40),
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {type === "lichess" ? (
                  <LichessLogo />
                ) : (
                  <Image w={rem(32)} h={rem(32)} src="/chesscom.png" alt="chess.com" />
                )}
              </Box>
              <Stack gap={2}>
                {edit ? (
                  <TextInput
                    variant="unstyled"
                    value={text}
                    onChange={(e) => setText(e.currentTarget.value)}
                    size="md"
                    styles={{
                      input: {
                        fontSize: rem(18),
                        fontWeight: 700,
                        padding: 0,
                        height: "auto",
                      },
                    }}
                    autoFocus
                  />
                ) : (
                  <Text size="lg" fw={700} lh={1.2}>
                    {name}
                  </Text>
                )}
                <Text size="sm" c="dimmed" fw={500} lh={1.2}>
                  @{title}
                </Text>
              </Stack>
            </Group>

            <Tooltip
              label={isMain ? t("accounts.accountCard.mainAccount") : t("accounts.accountCard.setAsMainAccount")}
              position="left"
            >
              <ActionIcon
                size="lg"
                variant={isMain ? "light" : "subtle"}
                color={isMain ? "blue" : "gray"}
                onClick={setMain}
                aria-label={isMain ? t("accounts.accountCard.mainAccount") : t("accounts.accountCard.setAsMainAccount")}
                radius="xl"
              >
                {isMain ? (
                  <IconCircleCheck style={{ width: rem(20), height: rem(20) }} />
                ) : (
                  <IconCircle style={{ width: rem(20), height: rem(20) }} />
                )}
              </ActionIcon>
            </Tooltip>
          </Group>
        </Card.Section>

        <SimpleGrid cols={isMobile ? 1 : 2} spacing="xs">
          {items}
        </SimpleGrid>

        <Stack gap="xs">
          <Group align="center" justify="space-between" wrap="nowrap">
            <Text size="sm" fw={600}>
              {t("accounts.accountCard.gamesCount", { count: total })}
            </Text>
            <Group gap={4}>
              <Text size="sm" fw={600} c={percentage === "0" ? "dimmed" : "blue"}>
                {percentage === "0" ? "0" : `${percentage}%`}
              </Text>
              <Text size="sm" c="dimmed">
                {t("accounts.accountCard.downloaded")}
              </Text>
            </Group>
          </Group>
          <Progress.Root size="sm" radius="xl">
            <Tooltip label={t("accounts.accountCard.gamesCount", { count: downloadedGames })} position="top" withArrow>
              <Progress.Section
                value={Number(percentage)}
                color={percentage === "100.00" ? "teal" : "blue"}
                animated={loading}
              />
            </Tooltip>
          </Progress.Root>
        </Stack>

        <Group gap="xs" justify="space-between" wrap="nowrap">
          <Text size="xs" c="dimmed" style={{ flex: 1 }}>
            {`${t("accounts.accountCard.lastUpdate")}: ${t("formatters.dateFormat", {
              date: parseDate(updatedAt),
              interpolation: { escapeValue: false },
            })}`}
          </Text>

          <Group gap={4} wrap="nowrap">
            {edit ? (
              <>
                <Tooltip label={t("accounts.accountCard.saveChanges")} position="top">
                  <ActionIcon
                    size="md"
                    variant="light"
                    color="teal"
                    onClick={() => {
                      setEdit(false);
                      setSessions((prev) =>
                        prev.map((s) => {
                          if (type === "lichess" && s.lichess?.username === title) {
                            return { ...s, player: text };
                          } else if (type === "chesscom" && s.chessCom?.username === title) {
                            return { ...s, player: text };
                          }
                          return s;
                        }),
                      );
                    }}
                    radius="md"
                  >
                    <IconCheck style={{ width: rem(16), height: rem(16) }} />
                  </ActionIcon>
                </Tooltip>
                <Tooltip label={t("accounts.accountCard.cancelEdit")} position="top">
                  <ActionIcon
                    size="md"
                    variant="subtle"
                    color="gray"
                    onClick={() => {
                      setEdit(false);
                      setText(name);
                    }}
                    radius="md"
                  >
                    <IconX style={{ width: rem(16), height: rem(16) }} />
                  </ActionIcon>
                </Tooltip>
              </>
            ) : (
              <>
                <Tooltip label={t("accounts.accountCard.editName")} position="top">
                  <ActionIcon size="md" variant="subtle" color="gray" onClick={() => setEdit(true)} radius="md">
                    <IconEdit style={{ width: rem(16), height: rem(16) }} />
                  </ActionIcon>
                </Tooltip>
                <Tooltip label={t("accounts.accountCard.updateStats")} position="top">
                  <ActionIcon size="md" variant="subtle" color="blue" onClick={() => reload()} radius="md">
                    <IconRefresh style={{ width: rem(16), height: rem(16) }} />
                  </ActionIcon>
                </Tooltip>
                <Tooltip label={t("accounts.accountCard.downloadGames")} position="top">
                  <ActionIcon
                    size="md"
                    variant="subtle"
                    color="green"
                    disabled={loading}
                    onClick={async () => {
                      setLoading(true);
                      const lastGameDate = database ? await getLastGameDate({ database }) : null;
                      if (type === "lichess") {
                        await downloadLichess(title, lastGameDate, total - downloadedGames, setProgress, token);
                      } else {
                        await downloadChessCom(title, lastGameDate);
                      }
                      const p = await resolve(await appDataDir(), "db", `${title}_${type}.pgn`);
                      try {
                        await convert(p, lastGameDate);
                      } catch (e) {
                        console.error(e);
                      }
                      setLoading(false);
                    }}
                    radius="md"
                  >
                    {loading ? <Loader size={16} /> : <IconDownload style={{ width: rem(16), height: rem(16) }} />}
                  </ActionIcon>
                </Tooltip>
                <Tooltip label={t("accounts.accountCard.removeAccount")} position="top">
                  <ActionIcon size="md" variant="subtle" color="red" onClick={() => logout()} radius="md">
                    <IconX style={{ width: rem(16), height: rem(16) }} />
                  </ActionIcon>
                </Tooltip>
              </>
            )}
          </Group>
        </Group>
      </Stack>
    </Card>
  );
}
