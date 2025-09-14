import {
  Alert,
  Badge,
  Box,
  Button,
  Divider,
  Group,
  Loader,
  Paper,
  ScrollArea,
  SimpleGrid,
  Skeleton,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import { useDebouncedValue, useToggle } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import { IconArrowRight, IconArrowsSort, IconDatabase, IconPlus, IconSearch, IconStar } from "@tabler/icons-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { listen } from "@tauri-apps/api/event";
import { open as openDialog, save } from "@tauri-apps/plugin-dialog";
import { useAtom } from "jotai";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import useSWR from "swr";
import type { DatabaseInfo } from "@/bindings";
import { commands } from "@/bindings";
import GenericCard from "@/common/components/GenericCard";
import * as classes from "@/common/components/GenericCard.css";
import OpenFolderButton from "@/common/components/OpenFolderButton";
import { referenceDbAtom } from "@/state/atoms";
import { useActiveDatabaseViewStore } from "@/state/store/database";
import { getDatabases, type SuccessDatabaseInfo } from "@/utils/db";
import { unwrap } from "@/utils/unwrap";
import AddDatabase from "./components/AddDatabase";
import { PlayerSearchInput } from "./components/PlayerSearchInput";

type Progress = {
  total: number;
  elapsed: number;
};

export default function DatabasesPage() {
  const { t } = useTranslation();

  const { data: databases, isLoading, mutate } = useSWR("databases", () => getDatabases());

  const [progress, setProgress] = useState<Progress | null>(null);

  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "games">("name");
  const selectedDatabase = useMemo(
    () => (databases ?? []).find((db) => db.file === selected) ?? null,
    [databases, selected],
  );
  const setActiveDatabase = useActiveDatabaseViewStore((store) => store.setDatabase);
  const [referenceDatabase, setReferenceDatabase] = useAtom(referenceDbAtom);
  const isReference = referenceDatabase === selectedDatabase?.file;

  const [convertLoading, setConvertLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);

  function changeReferenceDatabase(file: string) {
    commands.clearGames();
    if (file === referenceDatabase) {
      setReferenceDatabase(null);
    } else {
      setReferenceDatabase(file);
    }
  }
  const navigate = useNavigate();

  const filtered = useMemo(() => {
    const list = (databases ?? []).filter((d) => {
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      if (d.type === "error") return d.error?.toLowerCase().includes(q) || d.file.toLowerCase().includes(q);
      return (
        d.title.toLowerCase().includes(q) ||
        (d.description ?? "").toLowerCase().includes(q) ||
        d.filename.toLowerCase().includes(q)
      );
    });
    return list.sort((a, b) => {
      if (sortBy === "name") {
        const an = a.type === "success" ? a.title.toLowerCase() : a.file.toLowerCase();
        const bn = b.type === "success" ? b.title.toLowerCase() : b.file.toLowerCase();
        return an.localeCompare(bn);
      }
      const ag = a.type === "success" ? a.game_count : -1;
      const bg = b.type === "success" ? b.game_count : -1;
      return bg - ag;
    });
  }, [databases, query, sortBy]);

  useEffect(() => {
    async function getProgress() {
      await listen<number[]>("convert_progress", (event) => {
        const progress = event.payload;
        setProgress({ total: progress[0], elapsed: progress[1] / 1000 });
      });
    }
    getProgress();
  }, []);

  return (
    <Stack h="100%">
      <AddDatabase
        databases={databases ?? []}
        opened={open}
        setOpened={setOpen}
        setLoading={setConvertLoading}
        setDatabases={mutate}
      />
      <Group align="center" pl="lg" py="sm">
        <Title>{t("features.databases.title")}</Title>
        <OpenFolderButton base="AppDir" folder="db" />
      </Group>

      <Group grow flex={1} style={{ overflow: "hidden" }} align="start" px="md" pb="md">
        <Stack>
          <Stack>
            <Group wrap="wrap" gap="xs" justify="space-between">
              <Group>
                <TextInput
                  aria-label="Search databases"
                  placeholder="Search databases..."
                  leftSection={<IconSearch size="1rem" />}
                  value={query}
                  onChange={(e) => setQuery(e.currentTarget.value)}
                  w={{ base: "100%", sm: 260 }}
                />
                <Button
                  variant="default"
                  leftSection={<IconArrowsSort size="1rem" />}
                  onClick={() => setSortBy((s) => (s === "name" ? "games" : "name"))}
                  aria-label={`Sort by ${sortBy === "name" ? "games" : "name"}`}
                >
                  Sort: {sortBy === "name" ? "Name" : "Games"}
                </Button>
              </Group>
              <Button
                onClick={() => setOpen(true)}
                loading={convertLoading}
                size="xs"
                leftSection={<IconPlus size="1rem" />}
                mr="sm"
              >
                {t("common.addNew")}
              </Button>
            </Group>

            {progress && convertLoading && (
              <Group align="center" justify="space-between" maw={200}>
                <Text fz="xs">{progress.total} games</Text>
                <Text fz="xs">{(progress.total / progress.elapsed).toFixed(1)} games/s</Text>
              </Group>
            )}
          </Stack>
          <ScrollArea h="calc(100vh - 190px)" offsetScrollbars aria-busy={isLoading} aria-live="polite">
            {isLoading ? (
              <SimpleGrid cols={{ base: 1, md: 2 }} spacing={{ base: "md", md: "sm" }}>
                <Skeleton h="8rem" />
                <Skeleton h="8rem" />
                <Skeleton h="8rem" />
              </SimpleGrid>
            ) : filtered.length === 0 ? (
              <Alert title="No databases found" color="gray" variant="light">
                Try adjusting your search or create a new database.
              </Alert>
            ) : (
              <SimpleGrid cols={{ base: 1, md: 2 }} spacing={{ base: "md", md: "sm" }}>
                {filtered.map((item) => (
                  <GenericCard
                    id={item.file}
                    key={item.filename}
                    isSelected={selectedDatabase?.filename === item.filename}
                    setSelected={setSelected}
                    error={item.type === "error" ? item.error : ""}
                    onDoubleClick={() => {
                      if (item.type === "error") return;
                      navigate({
                        to: "/databases/$databaseId",
                        params: {
                          databaseId: item.title,
                        },
                      });
                      setActiveDatabase(item);
                    }}
                    content={
                      <>
                        <Group wrap="nowrap" justify="space-between" align="flex-start">
                          <Group wrap="nowrap" miw={0} gap="sm" align="start">
                            <Box mt="sm">
                              <IconDatabase size="1.5rem" />
                            </Box>
                            <Box miw={0}>
                              <Stack gap="xs">
                                <Text fw={600} size="sm">
                                  {item.type === "success" ? item.title : item.error}
                                </Text>
                                <Group>
                                  {item.type === "success" && item.indexed && (
                                    <Badge color="teal" variant="light" size="xs">
                                      {t("features.databases.settings.indexed")}
                                    </Badge>
                                  )}
                                  {referenceDatabase === item.file && (
                                    <Tooltip label={t("features.databases.settings.referenceDatabase")}>
                                      <Badge
                                        color="yellow"
                                        variant="light"
                                        size="xs"
                                        leftSection={<IconStar size={12} />}
                                      >
                                        {t("features.databases.settings.referenceDatabaseShort")}
                                      </Badge>
                                    </Tooltip>
                                  )}
                                </Group>
                                <Text size="xs" c="dimmed" style={{ wordWrap: "break-word" }}>
                                  {item.type === "error" ? item.file : item.description}
                                </Text>
                              </Stack>
                            </Box>
                          </Group>
                        </Group>

                        <Group justify="space-between">
                          {[
                            {
                              label: t("features.databases.card.games"),
                              value: item.type === "success" ? t("units.count", { count: item.game_count }) : "???",
                            },
                            {
                              label: t("features.databases.card.storage"),
                              value:
                                item.type === "success" ? t("units.bytes", { bytes: item.storage_size ?? 0 }) : "???",
                            },
                          ]?.map((stat) => (
                            <div key={stat.label}>
                              <Text size="xs" c="dimmed" fw="bold" className={classes.label} mt="1rem">
                                {stat.label}
                              </Text>
                              <Text fw={700} size="lg" style={{ lineHeight: 1 }}>
                                {stat.value}
                              </Text>
                            </div>
                          ))}
                        </Group>
                      </>
                    }
                  />
                ))}
              </SimpleGrid>
            )}
          </ScrollArea>
        </Stack>

        <Paper withBorder p="md" h="100%">
          {selectedDatabase === null ? (
            <Stack align="center" justify="center" h="100%">
              <Text ta="center">Select a database to see details</Text>
              <Text c="dimmed" size="sm" ta="center">
                Tip: Double-click a database to open it.
              </Text>
            </Stack>
          ) : (
            <ScrollArea h="100%" offsetScrollbars>
              <Stack>
                {selectedDatabase.type === "error" ? (
                  <>
                    <Text fz="lg" fw="bold">
                      There was an error loading this database
                    </Text>

                    <Text>
                      <Text td="underline" span>
                        Reason:
                      </Text>
                      {` ${selectedDatabase.error}`}
                    </Text>

                    <Text>Check if the file exists and that it is not corrupted.</Text>
                  </>
                ) : (
                  <>
                    <Divider variant="dashed" label={t("common.generalSettings")} />
                    <GeneralSettings
                      key={selectedDatabase.filename}
                      selectedDatabase={selectedDatabase}
                      mutate={mutate}
                    />
                    <Switch
                      label={t("features.databases.settings.referenceDatabase")}
                      checked={isReference}
                      onChange={() => {
                        changeReferenceDatabase(selectedDatabase.file);
                      }}
                    />
                    <IndexInput indexed={selectedDatabase.indexed} file={selectedDatabase.file} setDatabases={mutate} />

                    <Divider variant="dashed" label={t("common.data")} />
                    <Group grow>
                      <Stack gap={0} justify="center" ta="center">
                        <Text size="md" tt="uppercase" fw="bold" c="dimmed">
                          {t("features.databases.card.games")}
                        </Text>
                        <Text fw={700} size="lg">
                          {t("units.count", { count: selectedDatabase.game_count })}
                        </Text>
                      </Stack>
                      <Stack gap={0} justify="center" ta="center">
                        <Text size="md" tt="uppercase" fw="bold" c="dimmed">
                          {t("features.databases.card.players")}
                        </Text>
                        <Text fw={700} size="lg">
                          {t("units.count", { count: selectedDatabase.player_count })}
                        </Text>
                      </Stack>
                      <Stack gap={0} justify="center" ta="center">
                        <Text size="md" tt="uppercase" fw="bold" c="dimmed">
                          {t("features.databases.settings.events")}
                        </Text>
                        <Text fw={700} size="lg">
                          {t("units.count", { count: selectedDatabase.event_count })}
                        </Text>
                      </Stack>
                    </Group>

                    <div>
                      {selectedDatabase.type === "success" && (
                        <Button
                          component={Link}
                          to="/databases/$databaseId"
                          // @ts-expect-error
                          params={{ databaseId: selectedDatabase.title }}
                          onClick={() => setActiveDatabase(selectedDatabase)}
                          fullWidth
                          variant="filled"
                          size="lg"
                          rightSection={<IconArrowRight size="1rem" />}
                        >
                          {t("features.databases.settings.explore")}
                        </Button>
                      )}
                    </div>
                  </>
                )}

                <Divider variant="dashed" label={t("features.databases.settings.advancedTools")} />

                {selectedDatabase.type === "success" && (
                  <AdvancedSettings selectedDatabase={selectedDatabase} reload={mutate} />
                )}

                <Divider variant="dashed" label={t("features.databases.settings.actions")} />
                <Group justify="space-between">
                  {selectedDatabase.type === "success" && (
                    <Group>
                      <Button
                        variant="filled"
                        rightSection={<IconPlus size="1rem" />}
                        onClick={async () => {
                          const file = await openDialog({
                            filters: [{ name: "PGN", extensions: ["pgn"] }],
                          });
                          if (!file || typeof file !== "string") return;
                          setConvertLoading(true);
                          await commands.convertPgn(file, selectedDatabase.file, null, "", null);
                          mutate();
                          setConvertLoading(false);
                        }}
                      >
                        {t("features.databases.settings.addGames")}
                      </Button>
                      <Button
                        rightSection={<IconArrowRight size="1rem" />}
                        variant="outline"
                        loading={exportLoading}
                        onClick={async () => {
                          const destFile = await save({
                            filters: [{ name: "PGN", extensions: ["pgn"] }],
                          });
                          if (!destFile) return;
                          setExportLoading(true);
                          await commands.exportToPgn(selectedDatabase.file, destFile);
                          setExportLoading(false);
                        }}
                      >
                        {t("features.databases.settings.exportPGN")}
                      </Button>
                    </Group>
                  )}
                  <Button
                    onClick={() => {
                      const fileToDelete = selectedDatabase?.file;
                      modals.openConfirmModal({
                        title: t("features.databases.delete.title"),
                        withCloseButton: false,
                        children: (
                          <>
                            <Text>{t("features.databases.delete.message")}</Text>
                            <Text>{t("common.cannotUndo")}</Text>
                          </>
                        ),
                        labels: { confirm: t("common.remove"), cancel: t("common.cancel") },
                        confirmProps: { color: "red" },
                        onConfirm: () => {
                          if (!fileToDelete) return;
                          commands.deleteDatabase(fileToDelete).then(() => {
                            mutate();
                            setSelected(null);
                          });
                        },
                      });
                    }}
                    color="red"
                  >
                    {t("common.delete")}
                  </Button>
                </Group>
              </Stack>
            </ScrollArea>
          )}
        </Paper>
      </Group>
    </Stack>
  );
}

function GeneralSettings({ selectedDatabase, mutate }: { selectedDatabase: SuccessDatabaseInfo; mutate: () => void }) {
  const { t } = useTranslation();

  const [title, setTitle] = useState(selectedDatabase.title);
  const [description, setDescription] = useState(selectedDatabase.description);

  const [debouncedTitle] = useDebouncedValue(title, 300);
  const [debouncedDescription] = useDebouncedValue(description, 300);

  useEffect(() => {
    commands
      .editDbInfo(selectedDatabase.file, debouncedTitle ?? null, debouncedDescription ?? null)
      .then(() => mutate());
  }, [debouncedTitle, debouncedDescription, selectedDatabase.file, mutate]);

  return (
    <>
      <TextInput
        label={t("common.name")}
        value={title}
        onChange={(e) => setTitle(e.currentTarget.value)}
        error={title === "" && t("common.requireName")}
      />
      <Textarea
        label={t("common.description")}
        value={description}
        onChange={(e) => setDescription(e.currentTarget.value)}
      />
    </>
  );
}

function AdvancedSettings({ selectedDatabase, reload }: { selectedDatabase: DatabaseInfo; reload: () => void }) {
  return (
    <Stack>
      <PlayerMerger selectedDatabase={selectedDatabase} />
      <DuplicateRemover selectedDatabase={selectedDatabase} reload={reload} />
    </Stack>
  );
}

function PlayerMerger({ selectedDatabase }: { selectedDatabase: DatabaseInfo }) {
  const { t } = useTranslation();

  const [player1, setPlayer1] = useState<number | undefined>(undefined);
  const [player2, setPlayer2] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  async function mergePlayers() {
    if (player1 === undefined || player2 === undefined) {
      return;
    }
    setLoading(true);
    const res = await commands.mergePlayers(selectedDatabase.file, player1, player2);
    setLoading(false);
    unwrap(res);
  }

  return (
    <Stack>
      <Text fz="lg" fw="bold">
        {t("features.databases.settings.mergePlayers")}
      </Text>
      <Text fz="sm">{t("features.databases.settings.mergePlayersDesc")}</Text>
      <Group grow>
        <PlayerSearchInput label="Player 1" file={selectedDatabase.file} setValue={setPlayer1} />
        <Button loading={loading} onClick={mergePlayers} rightSection={<IconArrowRight size="1rem" />}>
          {t("features.databases.settings.merge")}
        </Button>
        <PlayerSearchInput label="Player 2" file={selectedDatabase.file} setValue={setPlayer2} />
      </Group>
    </Stack>
  );
}

function DuplicateRemover({ selectedDatabase, reload }: { selectedDatabase: DatabaseInfo; reload: () => void }) {
  const { t } = useTranslation();

  const [loading, setLoading] = useState(false);
  return (
    <Stack>
      <Text fz="lg" fw="bold">
        {t("features.databases.settings.batchDelete")}
      </Text>
      <Text fz="sm">{t("features.databases.settings.batchDeleteDesc")}</Text>
      <Group>
        <Button
          loading={loading}
          onClick={async () => {
            setLoading(true);
            commands
              .deleteDuplicatedGames(selectedDatabase.file)
              .then(() => {
                setLoading(false);
                reload();
              })
              .catch(() => {
                setLoading(false);
                reload();
              });
          }}
        >
          {t("features.databases.settings.removeDup")}
        </Button>

        <Button
          loading={loading}
          onClick={async () => {
            setLoading(true);
            commands
              .deleteEmptyGames(selectedDatabase.file)
              .then(() => {
                setLoading(false);
                reload();
              })
              .catch(() => {
                setLoading(false);
                reload();
              });
          }}
        >
          {t("features.databases.settings.removeEmpty")}
        </Button>
      </Group>
    </Stack>
  );
}

function IndexInput({
  indexed,
  file,
  setDatabases,
}: {
  indexed: boolean;
  file: string;
  setDatabases: (dbs: DatabaseInfo[]) => void;
}) {
  const { t } = useTranslation();

  const [loading, setLoading] = useToggle();
  return (
    <Group>
      <Tooltip label={t("features.databases.settings.indexed.Desc")}>
        <Switch
          onLabel="On"
          offLabel="Off"
          label={t("features.databases.settings.indexed")}
          disabled={loading}
          checked={indexed}
          onChange={(e) => {
            setLoading(true);
            const fn = e.currentTarget.checked ? commands.createIndexes : commands.deleteIndexes;
            fn(file).then(() => {
              getDatabases().then((dbs) => {
                setDatabases(dbs);
                setLoading(false);
              });
            });
          }}
        />
      </Tooltip>
      {loading && <Loader size="sm" />}
    </Group>
  );
}
