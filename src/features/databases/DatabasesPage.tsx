import {
  Alert,
  Badge,
  Box,
  Button,
  Chip,
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
import {
  IconArrowRight,
  IconArrowsSort,
  IconDatabase,
  IconPlus,
  IconPuzzle,
  IconSearch,
  IconStar,
} from "@tabler/icons-react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { listen } from "@tauri-apps/api/event";
import { open as openDialog, save } from "@tauri-apps/plugin-dialog";
import { readDir } from "@tauri-apps/plugin-fs";
import { useAtom } from "jotai";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import useSWR from "swr";
import type { DatabaseInfo, PuzzleDatabaseInfo } from "@/bindings";
import { commands } from "@/bindings";
import GenericCard from "@/common/components/GenericCard";
import * as classes from "@/common/components/GenericCard.css";
import OpenFolderButton from "@/common/components/OpenFolderButton";
import { processEntriesRecursively } from "@/features/files/components/file";
import { referenceDbAtom } from "@/state/atoms";
import { useActiveDatabaseViewStore } from "@/state/store/database";
import { getDatabases, type SuccessDatabaseInfo } from "@/utils/db";
import { getPuzzleDatabases } from "@/utils/puzzles";
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

type UnifiedDatabase =
  | (DatabaseInfo & { dbType: "game" })
  | (PuzzleDatabaseInfo & {
      dbType: "puzzle";
      type: "success";
      file: string;
      filename: string;
      indexed: false;
      player_count: number;
      event_count: number;
      game_count: number;
      storage_size: number;
    });

function isSuccessDatabase(db: UnifiedDatabase): db is UnifiedDatabase & { type: "success" } {
  return db.type === "success";
}

function isGameDatabase(db: UnifiedDatabase): db is DatabaseInfo & { dbType: "game" } {
  return db.dbType === "game";
}

function isPuzzleDatabase(db: UnifiedDatabase): db is UnifiedDatabase & {
  dbType: "puzzle";
  type: "success";
  file: string;
  filename: string;
  indexed: false;
  player_count: number;
  event_count: number;
  game_count: number;
  storage_size: number;
} {
  return db.dbType === "puzzle";
}

type DatabaseCategory = "all" | "games" | "puzzles";

const CATEGORY_OPTIONS = [
  { labelKey: "common.all", value: "all" as const },
  { labelKey: "features.databases.category.games", value: "games" as const },
  { labelKey: "features.databases.category.puzzles", value: "puzzles" as const },
] as const;

const SKELETON_COUNT = 3;

export default function DatabasesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const search = useSearch({ from: "/databases/" });

  const { data: databases, isLoading, mutate } = useSWR("databases", getDatabases);
  const { data: files } = useSWR("file-directory", fetchPuzzleFiles);

  const [puzzleDbs, setPuzzleDbs] = useState<PuzzleDatabaseInfo[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "games">("name");
  const [category, setCategory] = useState<DatabaseCategory>("all");
  const [convertLoading, setConvertLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);

  const setActiveDatabase = useActiveDatabaseViewStore((store) => store.setDatabase);
  const [referenceDatabase, setReferenceDatabase] = useAtom(referenceDbAtom);

  useEffect(() => {
    if (search.value === "add") {
      setOpen(true);
      if (search.tab === "puzzles") {
        setCategory("puzzles");
      } else if (search.tab === "games") {
        setCategory("games");
      }

      navigate({
        to: "/databases",
        search: {},
        replace: true,
      });
    }
  }, [search.value, search.tab, navigate]);

  useEffect(() => {
    if (files) {
      getPuzzleDatabases().then(setPuzzleDbs);
    }
  }, [files]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupProgressListener = async () => {
      unlisten = await listen<number[]>("convert_progress", (event) => {
        const [total, elapsed] = event.payload;
        setProgress({ total, elapsed: elapsed / 1000 });
      });
    };

    setupProgressListener();
    return () => unlisten?.();
  }, []);

  const unifiedDatabases = useMemo(() => {
    const gameDbs: UnifiedDatabase[] = (databases ?? []).map((db) => ({
      ...db,
      dbType: "game" as const,
    }));

    const puzzleDbsList: UnifiedDatabase[] = puzzleDbs
      .filter((db) => db.puzzleCount)
      .map((db) => ({
        ...db,
        dbType: "puzzle" as const,
        type: "success" as const,
        file: db.path,
        filename: db.title,
        indexed: false,
        player_count: 0,
        event_count: 0,
        game_count: db.puzzleCount,
        storage_size: db.storageSize,
      }));

    return [...gameDbs, ...puzzleDbsList];
  }, [databases, puzzleDbs]);

  const selectedDatabase = useMemo(
    () => unifiedDatabases.find((db) => db.file === selected) ?? null,
    [unifiedDatabases, selected],
  );

  const isReference = referenceDatabase === selectedDatabase?.file;

  const filteredDatabases = useMemo(() => {
    return filterAndSortDatabases(unifiedDatabases, category, query, sortBy, t);
  }, [unifiedDatabases, category, query, sortBy, t]);

  const handleCategoryChange = useCallback((newCategory: DatabaseCategory) => {
    setCategory(newCategory);
  }, []);

  const handleSortToggle = useCallback(() => {
    setSortBy((current) => (current === "name" ? "games" : "name"));
  }, []);

  const handleDatabaseDoubleClick = useCallback(
    (database: UnifiedDatabase) => {
      if (!isSuccessDatabase(database) || isPuzzleDatabase(database)) return;

      navigate({
        to: "/databases/$databaseId",
        params: { databaseId: database.title },
      });
      setActiveDatabase(database);
    },
    [navigate, setActiveDatabase],
  );

  const changeReferenceDatabase = useCallback(
    (file: string) => {
      commands.clearGames();
      setReferenceDatabase(file === referenceDatabase ? null : file);
    },
    [referenceDatabase, setReferenceDatabase],
  );

  const refreshPuzzleDatabases = useCallback(async () => {
    if (files) {
      const updatedPuzzleDbs = await getPuzzleDatabases();
      setPuzzleDbs(updatedPuzzleDbs);
    }
  }, [files]);

  return (
    <Stack h="100%">
      <AddDatabase
        databases={databases ?? []}
        opened={open}
        setOpened={setOpen}
        setLoading={setConvertLoading}
        setDatabases={mutate}
        puzzleDbs={puzzleDbs}
        setPuzzleDbs={setPuzzleDbs}
        initialTab={search.tab || "games"}
        redirectTo={search.redirect}
      />

      <Header />

      <Group grow flex={1} style={{ overflow: "hidden" }} align="start" px="md" pb="md">
        <DatabaseList
          query={query}
          onQueryChange={setQuery}
          sortBy={sortBy}
          onSortToggle={handleSortToggle}
          category={category}
          onCategoryChange={handleCategoryChange}
          onAddNew={() => setOpen(true)}
          convertLoading={convertLoading}
          progress={progress}
          isLoading={isLoading}
          databases={filteredDatabases}
          selectedDatabase={selectedDatabase}
          onSelectDatabase={setSelected}
          onDatabaseDoubleClick={handleDatabaseDoubleClick}
          referenceDatabase={referenceDatabase}
        />

        <DatabaseDetails
          selectedDatabase={selectedDatabase}
          isReference={isReference}
          onChangeReference={changeReferenceDatabase}
          mutate={mutate}
          exportLoading={exportLoading}
          setExportLoading={setExportLoading}
          convertLoading={convertLoading}
          setConvertLoading={setConvertLoading}
          onSelect={setSelected}
          refreshPuzzleDatabases={refreshPuzzleDatabases}
        />
      </Group>
    </Stack>
  );
}

function Header() {
  const { t } = useTranslation();

  return (
    <Group align="center" pl="lg" py="sm">
      <Title>{t("features.databases.title")}</Title>
      <OpenFolderButton base="AppDir" folder="db" />
    </Group>
  );
}

interface DatabaseListProps {
  query: string;
  onQueryChange: (query: string) => void;
  sortBy: "name" | "games";
  onSortToggle: () => void;
  category: DatabaseCategory;
  onCategoryChange: (category: DatabaseCategory) => void;
  onAddNew: () => void;
  convertLoading: boolean;
  progress: Progress | null;
  isLoading: boolean;
  databases: UnifiedDatabase[];
  selectedDatabase: UnifiedDatabase | null;
  onSelectDatabase: (id: string | null) => void;
  onDatabaseDoubleClick: (database: UnifiedDatabase) => void;
  referenceDatabase: string | null;
}

function DatabaseList({
  query,
  onQueryChange,
  sortBy,
  onSortToggle,
  category,
  onCategoryChange,
  onAddNew,
  convertLoading,
  progress,
  isLoading,
  databases,
  selectedDatabase,
  onSelectDatabase,
  onDatabaseDoubleClick,
  referenceDatabase,
}: DatabaseListProps) {
  const { t } = useTranslation();

  return (
    <Stack>
      <DatabaseControls
        query={query}
        onQueryChange={onQueryChange}
        sortBy={sortBy}
        onSortToggle={onSortToggle}
        category={category}
        onCategoryChange={onCategoryChange}
        onAddNew={onAddNew}
        convertLoading={convertLoading}
        progress={progress}
      />

      <ScrollArea h="calc(100vh - 240px)" offsetScrollbars aria-busy={isLoading} aria-live="polite">
        <DatabaseGrid
          isLoading={isLoading}
          databases={databases}
          selectedDatabase={selectedDatabase}
          onSelectDatabase={onSelectDatabase}
          onDatabaseDoubleClick={onDatabaseDoubleClick}
          referenceDatabase={referenceDatabase}
        />
      </ScrollArea>
    </Stack>
  );
}

interface DatabaseControlsProps {
  query: string;
  onQueryChange: (query: string) => void;
  sortBy: "name" | "games";
  onSortToggle: () => void;
  category: DatabaseCategory;
  onCategoryChange: (category: DatabaseCategory) => void;
  onAddNew: () => void;
  convertLoading: boolean;
  progress: Progress | null;
}

function DatabaseControls({
  query,
  onQueryChange,
  sortBy,
  onSortToggle,
  category,
  onCategoryChange,
  onAddNew,
  convertLoading,
  progress,
}: DatabaseControlsProps) {
  const { t } = useTranslation();

  const sortLabel = sortBy === "name" ? "Name" : category === "puzzles" ? "Puzzles" : "Games";

  return (
    <Stack>
      <Group wrap="wrap" gap="xs" justify="space-between">
        <Group>
          <TextInput
            aria-label="Search databases"
            placeholder="Search databases..."
            leftSection={<IconSearch size="1rem" />}
            value={query}
            onChange={(e) => onQueryChange(e.currentTarget.value)}
            w={{ base: "100%", sm: 260 }}
          />
          <Button
            variant="default"
            leftSection={<IconArrowsSort size="1rem" />}
            onClick={onSortToggle}
            aria-label={`Sort by ${sortBy === "name" ? "games" : "name"}`}
          >
            Sort: {sortLabel}
          </Button>
        </Group>
        <Button onClick={onAddNew} loading={convertLoading} size="xs" leftSection={<IconPlus size="1rem" />} mr="sm">
          {t("common.addNew")}
        </Button>
      </Group>

      <Group>
        {CATEGORY_OPTIONS.map((option) => (
          <Chip
            key={option.value}
            variant="outline"
            onChange={() => onCategoryChange(option.value)}
            checked={option.value === category}
          >
            {t(option.labelKey)}
          </Chip>
        ))}
      </Group>

      {progress && convertLoading && (
        <Group align="center" justify="space-between" maw={200}>
          <Text fz="xs">{progress.total} games</Text>
          <Text fz="xs">{(progress.total / progress.elapsed).toFixed(1)} games/s</Text>
        </Group>
      )}
    </Stack>
  );
}

interface DatabaseGridProps {
  isLoading: boolean;
  databases: UnifiedDatabase[];
  selectedDatabase: UnifiedDatabase | null;
  onSelectDatabase: (id: string | null) => void;
  onDatabaseDoubleClick: (database: UnifiedDatabase) => void;
  referenceDatabase: string | null;
}

function DatabaseGrid({
  isLoading,
  databases,
  selectedDatabase,
  onSelectDatabase,
  onDatabaseDoubleClick,
  referenceDatabase,
}: DatabaseGridProps) {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing={{ base: "md", md: "sm" }}>
        {Array.from({ length: SKELETON_COUNT }, (_, i) => (
          <Skeleton key={i} h="8rem" />
        ))}
      </SimpleGrid>
    );
  }

  if (databases.length === 0) {
    return (
      <Alert title="No databases found" color="gray" variant="light">
        Try adjusting your search or create a new database.
      </Alert>
    );
  }

  return (
    <SimpleGrid cols={{ base: 1, md: 2 }} spacing={{ base: "md", md: "sm" }}>
      {databases.map((database) => (
        <DatabaseCard
          key={database.filename}
          database={database}
          isSelected={selectedDatabase?.filename === database.filename}
          onSelect={onSelectDatabase}
          onDoubleClick={onDatabaseDoubleClick}
          isReference={referenceDatabase === database.file}
        />
      ))}
    </SimpleGrid>
  );
}

interface DatabaseCardProps {
  database: UnifiedDatabase;
  isSelected: boolean;
  onSelect: (id: string | null) => void;
  onDoubleClick: (database: UnifiedDatabase) => void;
  isReference: boolean;
}

function DatabaseCard({ database, isSelected, onSelect, onDoubleClick, isReference }: DatabaseCardProps) {
  const { t } = useTranslation();

  const stats = getDatabaseStats(database, t);

  return (
    <GenericCard
      id={database.file}
      isSelected={isSelected}
      setSelected={onSelect}
      error={!isSuccessDatabase(database) ? database.error : ""}
      onDoubleClick={() => onDoubleClick(database)}
      content={
        <>
          <Group wrap="nowrap" justify="space-between" align="flex-start">
            <Group wrap="nowrap" miw={0} gap="sm" align="start">
              <Box mt="sm">
                {isPuzzleDatabase(database) ? <IconPuzzle size="1.5rem" /> : <IconDatabase size="1.5rem" />}
              </Box>
              <Box miw={0}>
                <Stack gap="xs">
                  <Text fw={600} size="sm">
                    {isSuccessDatabase(database) ? database.title : database.error}
                  </Text>
                  <DatabaseBadges database={database} isReference={isReference} />
                  <Text size="xs" c="dimmed" style={{ wordWrap: "break-word" }}>
                    {isSuccessDatabase(database) ? database.description : database.file}
                  </Text>
                </Stack>
              </Box>
            </Group>
          </Group>

          <Group justify="space-between">
            {stats.map((stat) => (
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
  );
}

interface DatabaseBadgesProps {
  database: UnifiedDatabase;
  isReference: boolean;
}

function DatabaseBadges({ database, isReference }: DatabaseBadgesProps) {
  const { t } = useTranslation();

  return (
    <Group>
      {isSuccessDatabase(database) && database.indexed && (
        <Badge color="teal" variant="light" size="xs">
          {t("features.databases.settings.indexed")}
        </Badge>
      )}
      {isPuzzleDatabase(database) && (
        <Badge color="blue" variant="light" size="xs">
          {t("features.puzzle.title", "Puzzle")}
        </Badge>
      )}
      {isReference && (
        <Tooltip label={t("features.databases.settings.referenceDatabase")}>
          <Badge color="yellow" variant="light" size="xs" leftSection={<IconStar size={12} />}>
            {t("features.databases.settings.referenceDatabaseShort")}
          </Badge>
        </Tooltip>
      )}
    </Group>
  );
}

interface DatabaseDetailsProps {
  selectedDatabase: UnifiedDatabase | null;
  isReference: boolean;
  onChangeReference: (file: string) => void;
  mutate: () => void;
  exportLoading: boolean;
  setExportLoading: (loading: boolean) => void;
  convertLoading: boolean;
  setConvertLoading: (loading: boolean) => void;
  onSelect: (id: string | null) => void;
  refreshPuzzleDatabases: () => void;
}

function DatabaseDetails({
  selectedDatabase,
  isReference,
  onChangeReference,
  mutate,
  exportLoading,
  setExportLoading,
  convertLoading,
  setConvertLoading,
  onSelect,
  refreshPuzzleDatabases,
}: DatabaseDetailsProps) {
  const { t } = useTranslation();
  const setActiveDatabase = useActiveDatabaseViewStore((store) => store.setDatabase);

  if (!selectedDatabase) {
    return (
      <Paper withBorder p="md" h="100%">
        <Stack align="center" justify="center" h="100%">
          <Text ta="center">Select a database to see details</Text>
          <Text c="dimmed" size="sm" ta="center">
            Tip: Double-click a database to open it.
          </Text>
        </Stack>
      </Paper>
    );
  }

  if (!isSuccessDatabase(selectedDatabase)) {
    return (
      <Paper withBorder p="md" h="100%">
        <ScrollArea h="100%" offsetScrollbars>
          <Stack>
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
          </Stack>
        </ScrollArea>
      </Paper>
    );
  }

  return (
    <Paper withBorder p="md" h="100%">
      <ScrollArea h="100%" offsetScrollbars>
        <Stack>
          <Divider variant="dashed" label={t("common.generalSettings")} />

          {isGameDatabase(selectedDatabase) ? (
            <GeneralSettings key={selectedDatabase.filename} selectedDatabase={selectedDatabase} mutate={mutate} />
          ) : (
            <Stack>
              <TextInput label={t("common.name")} value={selectedDatabase.title} readOnly />
              <Textarea label={t("common.description")} value={selectedDatabase.description} readOnly />
            </Stack>
          )}

          {isGameDatabase(selectedDatabase) && (
            <>
              <Switch
                label={t("features.databases.settings.referenceDatabase")}
                checked={isReference}
                onChange={() => onChangeReference(selectedDatabase.file)}
              />
              <IndexInput indexed={selectedDatabase.indexed} file={selectedDatabase.file} setDatabases={mutate} />
            </>
          )}

          <Divider variant="dashed" label={t("common.data")} />
          <DatabaseStats database={selectedDatabase} />

          <div>
            {isGameDatabase(selectedDatabase) && (
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
            {isPuzzleDatabase(selectedDatabase) && (
              <Text size="sm" c="dimmed" ta="center">
                {t("features.puzzle.useInPuzzleBoard", "Use this database in the puzzle board to solve puzzles")}
              </Text>
            )}
          </div>

          {isGameDatabase(selectedDatabase) && (
            <>
              <Divider variant="dashed" label={t("features.databases.settings.advancedTools")} />
              <AdvancedSettings selectedDatabase={selectedDatabase} reload={mutate} />
            </>
          )}

          <Divider variant="dashed" label={t("features.databases.settings.actions")} />
          <DatabaseActions
            database={selectedDatabase}
            exportLoading={exportLoading}
            setExportLoading={setExportLoading}
            convertLoading={convertLoading}
            setConvertLoading={setConvertLoading}
            mutate={mutate}
            onSelect={onSelect}
            refreshPuzzleDatabases={refreshPuzzleDatabases}
          />
        </Stack>
      </ScrollArea>
    </Paper>
  );
}

function DatabaseStats({ database }: { database: UnifiedDatabase }) {
  const { t } = useTranslation();
  const stats = getDetailedDatabaseStats(database, t);

  return (
    <Group grow>
      {stats.map((stat) => (
        <Stack key={stat.label} gap={0} justify="center" ta="center">
          <Text size="md" tt="uppercase" fw="bold" c="dimmed">
            {stat.label}
          </Text>
          <Text fw={700} size="lg">
            {stat.value}
          </Text>
        </Stack>
      ))}
    </Group>
  );
}

interface DatabaseActionsProps {
  database: UnifiedDatabase;
  exportLoading: boolean;
  setExportLoading: (loading: boolean) => void;
  convertLoading: boolean;
  setConvertLoading: (loading: boolean) => void;
  mutate: () => void;
  onSelect: (id: string | null) => void;
  refreshPuzzleDatabases: () => void;
}

function DatabaseActions({
  database,
  exportLoading,
  setExportLoading,
  convertLoading,
  setConvertLoading,
  mutate,
  onSelect,
  refreshPuzzleDatabases,
}: DatabaseActionsProps) {
  const { t } = useTranslation();

  const handleAddGames = useCallback(async () => {
    const file = await openDialog({
      filters: [{ name: "PGN", extensions: ["pgn"] }],
    });
    if (!file || typeof file !== "string") return;

    setConvertLoading(true);
    try {
      await commands.convertPgn(file, database.file, null, "", null);
      mutate();
    } finally {
      setConvertLoading(false);
    }
  }, [database.file, setConvertLoading, mutate]);

  const handleExport = useCallback(async () => {
    const destFile = await save({
      filters: [{ name: "PGN", extensions: ["pgn"] }],
    });
    if (!destFile) return;

    setExportLoading(true);
    try {
      await commands.exportToPgn(database.file, destFile);
    } finally {
      setExportLoading(false);
    }
  }, [database.file, setExportLoading]);

  const handleDelete = useCallback(() => {
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
      onConfirm: async () => {
        await commands.deleteDatabase(database.file);
        mutate();
        onSelect(null);
        if (isPuzzleDatabase(database)) {
          refreshPuzzleDatabases();
        }
      },
    });
  }, [database, mutate, onSelect, refreshPuzzleDatabases, t]);

  if (isPuzzleDatabase(database)) {
    return (
      <Group justify="flex-end">
        <Button onClick={handleDelete} color="red">
          {t("common.delete")}
        </Button>
      </Group>
    );
  }

  return (
    <Group justify="space-between">
      <Group>
        <Button
          variant="filled"
          rightSection={<IconPlus size="1rem" />}
          onClick={handleAddGames}
          loading={convertLoading}
        >
          {t("features.databases.settings.addGames")}
        </Button>
        <Button
          rightSection={<IconArrowRight size="1rem" />}
          variant="outline"
          loading={exportLoading}
          onClick={handleExport}
        >
          {t("features.databases.settings.exportPGN")}
        </Button>
      </Group>
      <Button onClick={handleDelete} color="red">
        {t("common.delete")}
      </Button>
    </Group>
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

  const mergePlayers = useCallback(async () => {
    if (player1 === undefined || player2 === undefined) return;

    setLoading(true);
    try {
      const res = await commands.mergePlayers(selectedDatabase.file, player1, player2);
      unwrap(res);
    } finally {
      setLoading(false);
    }
  }, [player1, player2, selectedDatabase.file]);

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

  const handleRemoveDuplicates = useCallback(async () => {
    setLoading(true);
    try {
      await commands.deleteDuplicatedGames(selectedDatabase.file);
    } finally {
      setLoading(false);
      reload();
    }
  }, [selectedDatabase.file, reload]);

  const handleRemoveEmpty = useCallback(async () => {
    setLoading(true);
    try {
      await commands.deleteEmptyGames(selectedDatabase.file);
    } finally {
      setLoading(false);
      reload();
    }
  }, [selectedDatabase.file, reload]);

  return (
    <Stack>
      <Text fz="lg" fw="bold">
        {t("features.databases.settings.batchDelete")}
      </Text>
      <Text fz="sm">{t("features.databases.settings.batchDeleteDesc")}</Text>
      <Group>
        <Button loading={loading} onClick={handleRemoveDuplicates}>
          {t("features.databases.settings.removeDup")}
        </Button>
        <Button loading={loading} onClick={handleRemoveEmpty}>
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

  const handleToggleIndex = useCallback(
    async (checked: boolean) => {
      setLoading(true);
      try {
        const fn = checked ? commands.createIndexes : commands.deleteIndexes;
        await fn(file);
        const dbs = await getDatabases();
        setDatabases(dbs);
      } finally {
        setLoading(false);
      }
    },
    [file, setDatabases, setLoading],
  );

  return (
    <Group>
      <Tooltip label={t("features.databases.settings.indexed.Desc")}>
        <Switch
          onLabel="On"
          offLabel="Off"
          label={t("features.databases.settings.indexed")}
          disabled={loading}
          checked={indexed}
          onChange={(e) => handleToggleIndex(e.currentTarget.checked)}
        />
      </Tooltip>
      {loading && <Loader size="sm" />}
    </Group>
  );
}

async function fetchPuzzleFiles() {
  const { appDataDir, resolve } = await import("@tauri-apps/api/path");
  const appDir = await appDataDir();
  const puzzlesDir = await resolve(appDir, "puzzles");
  try {
    const entries = await readDir(puzzlesDir);
    return processEntriesRecursively(puzzlesDir, entries);
  } catch {
    return [];
  }
}

function filterAndSortDatabases(
  databases: UnifiedDatabase[],
  category: DatabaseCategory,
  query: string,
  sortBy: "name" | "games",
  t: any,
): UnifiedDatabase[] {
  let filtered = databases;

  if (category === "games") {
    filtered = filtered.filter(isGameDatabase);
  } else if (category === "puzzles") {
    filtered = filtered.filter(isPuzzleDatabase);
  }

  if (query.trim()) {
    const q = query.toLowerCase();
    filtered = filtered.filter((d) => {
      if (!isSuccessDatabase(d)) {
        return d.error?.toLowerCase().includes(q) || d.file.toLowerCase().includes(q);
      }
      return (
        d.title.toLowerCase().includes(q) ||
        (d.description ?? "").toLowerCase().includes(q) ||
        d.filename.toLowerCase().includes(q)
      );
    });
  }

  return filtered.sort((a, b) => {
    if (sortBy === "name") {
      const an = isSuccessDatabase(a) ? a.title.toLowerCase() : a.file.toLowerCase();
      const bn = isSuccessDatabase(b) ? b.title.toLowerCase() : b.file.toLowerCase();
      return an.localeCompare(bn);
    }
    const ag = isSuccessDatabase(a) ? a.game_count : -1;
    const bg = isSuccessDatabase(b) ? b.game_count : -1;
    return bg - ag;
  });
}

function getDatabaseStats(database: UnifiedDatabase, t: any) {
  if (isPuzzleDatabase(database)) {
    return [
      {
        label: t("features.puzzle.title", "Puzzles"),
        value: isSuccessDatabase(database) ? t("units.count", { count: database.game_count }) : "???",
      },
      {
        label: t("features.databases.card.storage"),
        value: isSuccessDatabase(database) ? t("units.bytes", { bytes: database.storage_size ?? 0 }) : "???",
      },
    ];
  }

  return [
    {
      label: t("features.databases.card.games"),
      value: isSuccessDatabase(database) ? t("units.count", { count: database.game_count }) : "???",
    },
    {
      label: t("features.databases.card.storage"),
      value: isSuccessDatabase(database) ? t("units.bytes", { bytes: database.storage_size ?? 0 }) : "???",
    },
  ];
}

function getDetailedDatabaseStats(database: UnifiedDatabase, t: any) {
  if (!isSuccessDatabase(database)) {
    return [];
  }

  if (isPuzzleDatabase(database)) {
    return [
      {
        label: t("features.puzzle.title", "Puzzles"),
        value: t("units.count", { count: database.game_count }),
      },
      {
        label: t("common.size"),
        value: t("units.bytes", { bytes: database.storage_size }),
      },
    ];
  }

  return [
    {
      label: t("features.databases.card.games"),
      value: t("units.count", { count: database.game_count }),
    },
    {
      label: t("features.databases.card.players"),
      value: t("units.count", { count: database.player_count }),
    },
    {
      label: t("features.databases.settings.events"),
      value: t("units.count", { count: database.event_count }),
    },
  ];
}
