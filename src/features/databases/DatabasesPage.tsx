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
import { useDebouncedValue, useToggle, useMediaQuery } from "@mantine/hooks";
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
import { useResponsiveLayout } from "@/common/hooks/useResponsiveLayout";
import { SidePanelDrawerLayout } from "@/common/components/SidePanelDrawerLayout";
import { vars } from "@/styles/theme";
import AddDatabase from "./components/AddDatabase";
import { PlayerSearchInput } from "./components/PlayerSearchInput";

type Progress = {
  total: number;
  elapsed: number;
};

export default function DatabasesPage() {
  const { t } = useTranslation();
  const { layout } = useResponsiveLayout();

  // Calculate responsive values based on layout flags
  const isMobile = layout.databases.layoutType === "mobile";
  const gridCols = isMobile ? 1 : { base: 1, md: 2 };
  const panelHeight = "100%";

  // Check if screen is below xl breakpoint for button label visibility
  const isLargeScreenMax = useMediaQuery(`(width < ${vars.breakpoints.lg})`);

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
        <Title>{t("Databases.Title")}</Title>
        <OpenFolderButton base="AppDir" folder="db" />
      </Group>

      <Box style={{ flex: 1, minHeight: 0 }}>
        <SidePanelDrawerLayout
          mainContent={
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
                      {!isLargeScreenMax && `Sort: ${sortBy === "name" ? "Name" : "Games"}`}
                    </Button>
                  </Group>
                  <Button
                    onClick={() => setOpen(true)}
                    loading={convertLoading}
                    size="xs"
                    leftSection={<IconPlus size="1rem" />}
                    mr="sm"
                  >
                    {!isLargeScreenMax && t("Common.AddNew")}
                  </Button>
                </Group>

                {progress && convertLoading && (
                  <Group align="center" justify="space-between" maw={200}>
                    <Text fz="xs">{progress.total} games</Text>
                    <Text fz="xs">{(progress.total / progress.elapsed).toFixed(1)} games/s</Text>
                  </Group>
                )}
              </Stack>
              <ScrollArea h="100%" aria-busy={isLoading} aria-live="polite">
                {isLoading ? (
                  isMobile ? (
                    <Stack gap="md">
                      <Skeleton h="8rem" />
                      <Skeleton h="8rem" />
                      <Skeleton h="8rem" />
                    </Stack>
                  ) : (
                    <SimpleGrid cols={gridCols} spacing={{ base: "md", md: "sm" }}>
                      <Skeleton h="8rem" />
                      <Skeleton h="8rem" />
                      <Skeleton h="8rem" />
                    </SimpleGrid>
                  )
                ) : filtered.length === 0 ? (
                  <Alert title="No databases found" color="gray" variant="light">
                    Try adjusting your search or create a new database.
                  </Alert>
                ) : isMobile ? (
                  <Stack gap="md">
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
                                          {t("Databases.Settings.Indexed")}
                                        </Badge>
                                      )}
                                      {referenceDatabase === item.file && (
                                        <Tooltip label={t("Databases.Settings.ReferenceDatabase")}>
                                          <Badge
                                            color="yellow"
                                            variant="light"
                                            size="xs"
                                            leftSection={<IconStar size={12} />}
                                          >
                                            {t("Databases.Settings.ReferenceDatabase_short")}
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
                                  label: t("Databases.Card.Games"),
                                  value: item.type === "success" ? t("Units.Count", { count: item.game_count }) : "???",
                                },
                                {
                                  label: t("Databases.Card.Storage"),
                                  value:
                                    item.type === "success"
                                      ? t("Units.Bytes", { bytes: item.storage_size ?? 0 })
                                      : "???",
                                },
                              ]?.map((stat) => (
                                <Stack key={stat.label} gap="xs">
                                  <Text size="xs" c="dimmed" fw="bold" className={classes.label}>
                                    {stat.label}
                                  </Text>
                                  <Text fw={700} size="lg" style={{ lineHeight: 1 }}>
                                    {stat.value}
                                  </Text>
                                </Stack>
                              ))}
                            </Group>
                          </>
                        }
                      />
                    ))}
                  </Stack>
                ) : (
                  <SimpleGrid cols={gridCols} spacing={{ base: "md", md: "sm" }}>
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
                                          {t("Databases.Settings.Indexed")}
                                        </Badge>
                                      )}
                                      {referenceDatabase === item.file && (
                                        <Tooltip label={t("Databases.Settings.ReferenceDatabase")}>
                                          <Badge
                                            color="yellow"
                                            variant="light"
                                            size="xs"
                                            leftSection={<IconStar size="0.5rem" />}
                                          >
                                            {t("Databases.Settings.Reference")}
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
                                  label: t("Databases.Card.Games"),
                                  value: item.type === "success" ? t("Units.Count", { count: item.game_count }) : "???",
                                },
                                {
                                  label: t("Databases.Card.Storage"),
                                  value:
                                    item.type === "success"
                                      ? t("Units.Bytes", { bytes: item.storage_size ?? 0 })
                                      : "???",
                                },
                              ]?.map((stat) => (
                                <Stack key={stat.label} gap="xs">
                                  <Text size="xs" c="dimmed" fw="bold" className={classes.label}>
                                    {stat.label}
                                  </Text>
                                  <Text fw={700} size="lg" style={{ lineHeight: 1 }}>
                                    {stat.value}
                                  </Text>
                                </Stack>
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
          }
          detailContent={
            selectedDatabase === null ? (
              <Stack align="center" justify="center" h="100%">
                <Text ta="center">Select a database to see details</Text>
                <Text c="dimmed" size="sm" ta="center">
                  Tip: Double-click a database to open it.
                </Text>
              </Stack>
            ) : (
              <ScrollArea h={panelHeight} offsetScrollbars>
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
                      <Divider variant="dashed" label={t("Common.GeneralSettings")} />
                      <GeneralSettings
                        key={selectedDatabase.filename}
                        selectedDatabase={selectedDatabase}
                        mutate={mutate}
                      />
                      <Switch
                        label={t("Databases.Settings.ReferenceDatabase")}
                        checked={isReference}
                        onChange={() => {
                          changeReferenceDatabase(selectedDatabase.file);
                        }}
                      />
                      <IndexInput
                        indexed={selectedDatabase.indexed}
                        file={selectedDatabase.file}
                        setDatabases={mutate}
                      />

                      <Divider variant="dashed" label={t("Common.Data")} />
                      <Group grow>
                        <Stack gap={0} justify="center" ta="center">
                          <Text size="md" tt="uppercase" fw="bold" c="dimmed">
                            {t("Databases.Card.Games")}
                          </Text>
                          <Text fw={700} size="lg">
                            {t("Units.Count", { count: selectedDatabase.game_count })}
                          </Text>
                        </Stack>
                        <Stack gap={0} justify="center" ta="center">
                          <Text size="md" tt="uppercase" fw="bold" c="dimmed">
                            {t("Databases.Card.Players")}
                          </Text>
                          <Text fw={700} size="lg">
                            {t("Units.Count", { count: selectedDatabase.player_count })}
                          </Text>
                        </Stack>
                        <Stack gap={0} justify="center" ta="center">
                          <Text size="md" tt="uppercase" fw="bold" c="dimmed">
                            {t("Databases.Settings.Events")}
                          </Text>
                          <Text fw={700} size="lg">
                            {t("Units.Count", { count: selectedDatabase.event_count })}
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
                            {t("Databases.Settings.Explore")}
                          </Button>
                        )}
                      </div>
                    </>
                  )}

                  <Divider variant="dashed" label={t("Databases.Settings.AdvancedTools")} />

                  {selectedDatabase.type === "success" && (
                    <AdvancedSettings selectedDatabase={selectedDatabase} reload={mutate} />
                  )}

                  <Divider variant="dashed" label={t("Databases.Settings.Actions")} />
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
                          {t("Databases.Settings.AddGames")}
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
                          {t("Databases.Settings.ExportPGN")}
                        </Button>
                      </Group>
                    )}
                    <Button
                      onClick={() => {
                        const fileToDelete = selectedDatabase?.file;
                        modals.openConfirmModal({
                          title: t("Databases.Delete.Title"),
                          withCloseButton: false,
                          children: (
                            <>
                              <Text>{t("Databases.Delete.Message")}</Text>
                              <Text>{t("Common.CannotUndo")}</Text>
                            </>
                          ),
                          labels: { confirm: t("Common.Remove"), cancel: t("Common.Cancel") },
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
                      {t("Common.Delete")}
                    </Button>
                  </Group>
                </Stack>
              </ScrollArea>
            )
          }
          isDetailOpen={selectedDatabase !== null}
          onDetailClose={() => setSelected(null)}
          detailTitle={selectedDatabase?.type === "success" ? selectedDatabase.title : "Database Details"}
          layoutType={layout.databases.layoutType}
        />
      </Box>
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
        label={t("Common.Name")}
        value={title}
        onChange={(e) => setTitle(e.currentTarget.value)}
        error={title === "" && t("Common.RequireName")}
      />
      <Textarea
        label={t("Common.Description")}
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
        {t("Databases.Settings.MergePlayers")}
      </Text>
      <Text fz="sm">{t("Databases.Settings.MergePlayers.Desc")}</Text>
      <Group grow>
        <PlayerSearchInput label="Player 1" file={selectedDatabase.file} setValue={setPlayer1} />
        <Button loading={loading} onClick={mergePlayers} rightSection={<IconArrowRight size="1rem" />}>
          {t("Databases.Settings.Merge")}
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
        {t("Databases.Settings.BatchDelete")}
      </Text>
      <Text fz="sm">{t("Databases.Settings.BatchDelete.Desc")}</Text>
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
          {t("Databases.Settings.RemoveDup")}
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
          {t("Databases.Settings.RemoveEmpty")}
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
      <Tooltip label={t("Databases.Settings.Indexed.Desc")}>
        <Switch
          onLabel="On"
          offLabel="Off"
          label={t("Databases.Settings.Indexed")}
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
