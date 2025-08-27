import {
  Accordion,
  ActionIcon,
  Box,
  Card,
  Group,
  Image,
  Loader,
  Progress,
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
import { downloadChessCom } from "@/utils/chess.com/api";
import { getDatabases, query_games } from "@/utils/db";
import { capitalize, parseDate } from "@/utils/format";
import { downloadLichess } from "@/utils/lichess/api";
import type { Session } from "@/utils/session";
import { unwrap } from "@/utils/unwrap";
import moduleClasses from "./AccountCard.module.css";
import LichessLogo from "./LichessLogo";
import * as classes from "./styles.css";

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
  const items = stats.map((stat) => {
    let color = "gray.5";
    let DiffIcon: React.FC<IconProps> = IconArrowRight;
    if (stat.diff) {
      const sign = Math.sign(stat.diff);
      if (sign === 1) {
        DiffIcon = IconArrowUpRight;
        color = "green";
      } else {
        DiffIcon = IconArrowDownRight;
        color = "red";
      }
    }
    return (
      <Card key={stat.label} withBorder p="xs">
        <Group align="start" justify="space-between">
          <Stack gap="5px">
            <Text size="xs" c="dimmed">
              {capitalize(stat.label)}
            </Text>
            <Group gap="5px" align="baseline">
              <Text fw="bold" fz="sm">
                {stat.value}
              </Text>
              {stat.diff && (
                <Text c={color} size="xs" fw={500} className={classes.diff}>
                  <span>{stat.diff}</span>
                </Text>
              )}
            </Group>
          </Stack>
          {stat.diff && (
            <Box c={color}>
              <DiffIcon size="1rem" stroke={1.5} />
            </Box>
          )}
        </Group>
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
      `${filepath
        .split(/(\\|\/)/g)
        .pop()!
        .replace(".pgn", ".db3")}`,
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
    if (games.count! > 0 && games.data[0].date && games.data[0].time) {
      const [year, month, day] = games.data[0].date.split(".").map(Number);
      const [hour, minute, second] = games.data[0].time.split(":").map(Number);
      const d = Date.UTC(year, month - 1, day, hour, minute, second);
      return d;
    }
    return null;
  }

  return (
    <Accordion.Item value={type + title} className={moduleClasses.accordionItem}>
      <Group justify="space-between" wrap="nowrap" pos="relative" pr="sm" className={classes.accordion}>
        <Group w="100%">
          <Accordion.Control flex={1}>
            <Group wrap="nowrap">
              <Box>
                {type === "lichess" ? <LichessLogo /> : <Image w="30px" h="30px" src="/chesscom.png" alt="chess.com" />}
              </Box>
              <Stack gap="5px">
                {edit ? (
                  <TextInput
                    variant="unstyled"
                    fw="bold"
                    value={text}
                    onChange={(e) => setText(e.currentTarget.value)}
                    styles={{
                      input: {
                        fontSize: "1.1rem",
                        textDecoration: "underline",
                      },
                    }}
                    autoFocus
                  />
                ) : (
                  <Text size="md" fw="bold">
                    {name}
                  </Text>
                )}
                <Group>
                  <Text size="xs" fw="bold" c="dimmed">
                    {title}
                  </Text>
                </Group>
                <Group wrap="nowrap">
                  <Group gap="3px">
                    <Text size="xs" fw="bold" c="dimmed">
                      {total}
                    </Text>
                    <Text size="xs" c="dimmed">
                      Games
                    </Text>
                  </Group>

                  <Group gap="3px">
                    <Tooltip label={`${downloadedGames} games`}>
                      <Text size="xs" fw="bold" c="dimmed">
                        {percentage === "0" ? "0" : `${percentage}%`}
                      </Text>
                    </Tooltip>
                    <Text size="xs" c="dimmed">
                      Downloaded
                    </Text>
                  </Group>
                </Group>
              </Stack>
            </Group>
          </Accordion.Control>
          <Group gap="xs" className={moduleClasses.accordionActions}>
            <Tooltip label={isMain ? "Main account" : "Set as main account"}>
              <ActionIcon size="sm" onClick={setMain} aria-label={isMain ? "Main account" : "Set as main account"}>
                {isMain ? <IconCircleCheck /> : <IconCircle />}
              </ActionIcon>
            </Tooltip>
            {edit ? (
              <ActionIcon
                size="sm"
                onClick={() => {
                  setEdit(false);
                  setSessions((prev) =>
                    prev.map((s) => {
                      if (type === "lichess" && s.lichess?.username === title) {
                        return {
                          ...s,
                          player: text,
                        };
                      } else if (type === "chesscom" && s.chessCom?.username === title) {
                        return {
                          ...s,
                          player: text,
                        };
                      } else {
                        return { ...s };
                      }
                    }),
                  );
                }}
              >
                <IconCheck />
              </ActionIcon>
            ) : (
              <ActionIcon
                size="sm"
                onClick={() => {
                  setEdit(true);
                }}
              >
                <IconEdit />
              </ActionIcon>
            )}
            <Tooltip label="Update stats">
              <ActionIcon onClick={() => reload()}>
                <IconRefresh size="1rem" />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Download games">
              <ActionIcon
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
              >
                {loading ? <Loader size="1rem" /> : <IconDownload size="1rem" />}
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Remove account">
              <ActionIcon onClick={() => logout()}>
                <IconX size="1rem" />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>

        {loading && <Progress pos="absolute" bottom={0} left={0} w="100%" value={progress || 100} animated size="xs" />}
      </Group>

      <Accordion.Panel px="0" py="md">
        <SimpleGrid cols={2}>{items}</SimpleGrid>
        <Text mt="xs" size="xs" c="dimmed" ta="right">
          {`Last update: ${t("{{date, dateformat}}", {
            date: parseDate(updatedAt),
            interpolation: { escapeValue: false },
          })}`}
        </Text>
      </Accordion.Panel>
    </Accordion.Item>
  );
}
