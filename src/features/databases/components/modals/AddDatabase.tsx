import {
  Alert,
  Button,
  Center,
  Divider,
  Group,
  Loader,
  Modal,
  Paper,
  ScrollArea,
  SegmentedControl,
  Stack,
  Tabs,
  Text,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { IconAlertCircle } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { appDataDir, resolve } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-dialog";
import { remove } from "@tauri-apps/plugin-fs";
import { listen } from "@tauri-apps/api/event";
import { type Dispatch, type SetStateAction, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { commands, type DatabaseInfo, events, type PuzzleDatabaseInfo } from "@/bindings";
import FileInput from "@/components/FileInput";
import ProgressButton from "@/components/ProgressButton";
import { getDatabases, getDefaultPuzzleDatabases, type SuccessDatabaseInfo, useDefaultDatabases } from "@/utils/db";
import { capitalize } from "@/utils/format";
import { getPuzzleDatabases } from "@/utils/puzzles";
import { unwrap } from "@/utils/unwrap";

const DB_EXTENSIONS = ["pgn", "pgn.zst"];
const PUZZLE_EXTENSIONS = ["pgn", "pgn.zst", "csv", "csv.zst", "db", "db3"];

interface DatabaseFormValues extends Partial<Extract<DatabaseInfo, { type: "success" }>> {
  title: string;
  description?: string;
  file: string;
  filename: string;
}

interface PuzzleFormValues {
  title: string;
  description: string;
  file: string;
  filename: string;
}

interface AddDatabaseProps {
  databases: DatabaseInfo[];
  opened: boolean;
  setOpened: (opened: boolean) => void;
  setLoading: Dispatch<SetStateAction<boolean>>;
  setDatabases: () => void;
  puzzleDbs?: PuzzleDatabaseInfo[];
  setPuzzleDbs?: Dispatch<SetStateAction<PuzzleDatabaseInfo[]>>;
  initialTab?: "games" | "puzzles";
  redirectTo?: string;
}

interface DatabaseCardProps {
  setDatabases: () => void;
  database: SuccessDatabaseInfo;
  databaseId: number;
  initInstalled: boolean;
}

interface PuzzleDbCardProps {
  setPuzzleDbs: Dispatch<SetStateAction<PuzzleDatabaseInfo[]>>;
  puzzleDb: PuzzleDatabaseInfo & { downloadLink: string };
  databaseId: number;
  initInstalled: boolean;
}

const extractFilename = (path: string): string => {
  return path.split(/(\\|\/)/g).pop() || "";
};

const generateTitleFromFilename = (filename: string): string => {
  const nameWithoutExt = filename.replace(/\.(pgn|csv|db|db3)(.zst)?$/i, "");
  return capitalize(nameWithoutExt.replaceAll(/[_-]/g, " "));
};

const useFormValidation = (databases: DatabaseInfo[], puzzleDbs: PuzzleDatabaseInfo[] = []) => {
  const { t } = useTranslation();

  const validateDatabaseTitle = useCallback(
    (value: string | undefined) => {
      if (!value) return t("common.requireName");
      if (databases.find((e) => e.type === "success" && e.title === value)) {
        return t("common.nameAlreadyUsed");
      }
      return null;
    },
    [databases, t],
  );

  const validatePuzzleTitle = useCallback(
    (value: string | undefined) => {
      if (!value) return t("common.requireName");
      if (puzzleDbs?.find((e) => e.title === `${value}.db3`)) {
        return t("common.nameAlreadyUsed");
      }
      return null;
    },
    [puzzleDbs, t],
  );

  const validateFile = useCallback(
    (value: string | undefined) => {
      if (!value) return t("common.requirePath");
      return null;
    },
    [t],
  );

  return { validateDatabaseTitle, validatePuzzleTitle, validateFile };
};

const useDatabaseOperations = (
  setLoading: Dispatch<SetStateAction<boolean>>,
  setDatabases: () => void,
  setPuzzleDbs?: Dispatch<SetStateAction<PuzzleDatabaseInfo[]>>,
) => {
  const convertDatabase = useCallback(
    async (path: string, title: string, description?: string) => {
      try {
        setLoading(true);
        const dbPath = await resolve(await appDataDir(), "db", `${title}.db3`);
        unwrap(await commands.convertPgn(path, dbPath, null, title, description ?? null));
        setDatabases();
      } catch (error) {
        console.error("Failed to convert database:", error);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [setLoading, setDatabases],
  );

  const importPuzzleFile = useCallback(
    async (path: string, title: string, description?: string) => {
      if (!setPuzzleDbs) {
        throw new Error("Missing required dependencies for puzzle import");
      }

      const dbPath = await resolve(await appDataDir(), "puzzles", `${title}.db3`);
      const result = await commands.importPuzzleFile(path, dbPath, title, description ?? null);

      if (result.status === "error") {
        throw new Error(result.error);
      }

      await setPuzzleDbs(await getPuzzleDatabases());
    },
    [setPuzzleDbs],
  );

  return { convertDatabase, importPuzzleFile };
};

function AddDatabase({
  databases,
  opened,
  setOpened,
  setLoading,
  setDatabases,
  puzzleDbs,
  setPuzzleDbs,
  initialTab = "games",
  redirectTo,
}: AddDatabaseProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  
  // Local state for puzzle databases to ensure we always have the latest
  const [localPuzzleDbs, setLocalPuzzleDbs] = useState<PuzzleDatabaseInfo[]>(puzzleDbs || []);
  
  const { validateDatabaseTitle, validatePuzzleTitle, validateFile } = useFormValidation(databases, localPuzzleDbs);
  const { convertDatabase, importPuzzleFile } = useDatabaseOperations(setLoading, setDatabases, setPuzzleDbs);

  const { defaultDatabases, error, isLoading } = useDefaultDatabases(opened);
  const {
    data: defaultPuzzleDbs,
    error: puzzleError,
    isLoading: isPuzzleLoading,
  } = useQuery({
    queryKey: ["default_puzzle_databases"],
    queryFn: getDefaultPuzzleDatabases,
    staleTime: Infinity,
  });

  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [firstLevelTab, setFirstLevelTab] = useState<string>(initialTab);

  // Sync local state with prop when it changes
  useEffect(() => {
    if (puzzleDbs) {
      setLocalPuzzleDbs(puzzleDbs);
    }
  }, [puzzleDbs]);

  // Refresh puzzle databases when modal opens or when puzzles are updated
  useEffect(() => {
    if (!setPuzzleDbs) return;

    const refreshPuzzleDbs = async () => {
      console.debug("Refreshing puzzle databases...");
      try {
        const updatedPuzzleDbs = await getPuzzleDatabases();
        console.debug("Updated puzzle databases:", updatedPuzzleDbs.map((db) => db.title));
        setPuzzleDbs(updatedPuzzleDbs);
        setLocalPuzzleDbs(updatedPuzzleDbs);
      } catch (error) {
        console.error("Error refreshing puzzle databases:", error);
      }
    };

    // Refresh when modal opens - use a small delay to ensure file system is updated
    if (opened) {
      // Immediate refresh
      refreshPuzzleDbs();
      // Also refresh after a short delay to catch any file system caching issues
      const timeoutId = setTimeout(refreshPuzzleDbs, 100);
      return () => clearTimeout(timeoutId);
    }

    // Listen for puzzle database updates (e.g., when a database is deleted)
    window.addEventListener("puzzles:updated", refreshPuzzleDbs);

    return () => {
      window.removeEventListener("puzzles:updated", refreshPuzzleDbs);
    };
  }, [setPuzzleDbs, opened]);

  const databaseForm = useForm<DatabaseFormValues>({
    initialValues: {
      title: "",
      description: "",
      file: "",
      filename: "",
      indexed: false,
    },
    validate: {
      title: validateDatabaseTitle,
      file: validateFile,
    },
  });

  const puzzleForm = useForm<PuzzleFormValues>({
    initialValues: {
      title: "",
      description: "",
      file: "",
      filename: "",
    },
    validate: {
      title: validatePuzzleTitle,
      file: validateFile,
    },
  });

  const handleDatabaseSubmit = useCallback(
    async (values: DatabaseFormValues) => {
      if (values.file && values.title) {
        try {
          await convertDatabase(values.file, values.title, values.description);
          setOpened(false);
          databaseForm.reset();

          if (redirectTo) {
            navigate({ to: redirectTo });
          }
        } catch (error) {
          console.error("Database conversion failed:", error);
        }
      }
    },
    [convertDatabase, setOpened, databaseForm, redirectTo, navigate],
  );

  const handlePuzzleSubmit = useCallback(
    async (values: PuzzleFormValues) => {
      if (values.file && values.title) {
        try {
          setImporting(true);
          setImportError(null);
          await importPuzzleFile(values.file, values.title, values.description);
          setOpened(false);
          puzzleForm.reset();

          if (redirectTo) {
            navigate({ to: redirectTo });
          }
        } catch (error) {
          console.error("Failed to import puzzle file:", error);
          setImportError(error instanceof Error ? error.message : "Failed to import puzzle file");
        } finally {
          setImporting(false);
        }
      }
    },
    [importPuzzleFile, setOpened, puzzleForm, redirectTo, navigate],
  );

  const handleDatabaseFileSelect = useCallback(async () => {
    const selected = await open({
      multiple: false,
      filters: [
        {
          name: "PGN file",
          extensions: DB_EXTENSIONS,
        },
      ],
    });

    if (!selected || typeof selected === "object") return;

    const filename = extractFilename(selected);
    databaseForm.setFieldValue("file", selected);
    databaseForm.setFieldValue("filename", filename);

    if (!databaseForm.values.title && filename) {
      databaseForm.setFieldValue("title", generateTitleFromFilename(filename));
    }
  }, [databaseForm]);

  const handlePuzzleFileSelect = useCallback(async () => {
    const selected = await open({
      multiple: false,
      filters: [
        {
          name: "Puzzle files",
          extensions: PUZZLE_EXTENSIONS,
        },
      ],
    });

    if (!selected || typeof selected === "object") return;

    const filename = extractFilename(selected);
    puzzleForm.setFieldValue("file", selected);
    puzzleForm.setFieldValue("filename", filename);

    if (!puzzleForm.values.title && filename) {
      puzzleForm.setFieldValue("title", generateTitleFromFilename(filename));
    }
  }, [puzzleForm]);

  const installedDatabaseTitles = useMemo(
    () =>
      new Set(
        databases
          .filter((db): db is Extract<DatabaseInfo, { type: "success" }> => db.type === "success")
          .map((db) => db.title),
      ),
    [databases],
  );

  const installedPuzzleTitles = useMemo(() => {
    // Use local state which is always up-to-date
    // Normalize titles: remove .db3 extension if present for comparison
    const normalizedTitles = localPuzzleDbs.map((db) => {
      const title = db.title;
      const normalized = title.endsWith(".db3") ? title.slice(0, -4) : title;
      console.debug(`Normalizing puzzle title: "${title}" -> "${normalized}"`);
      return normalized;
    });
    console.debug("Installed puzzle titles (normalized):", normalizedTitles);
    console.debug("Current localPuzzleDbs:", localPuzzleDbs.map((db) => ({ title: db.title, path: db.path })));
    return new Set(normalizedTitles);
  }, [localPuzzleDbs]);

  const handleModalClose = useCallback(() => {
    setOpened(false);
    setImportError(null);
    setFirstLevelTab(initialTab);
    databaseForm.reset();
    puzzleForm.reset();
  }, [setOpened, databaseForm, puzzleForm, initialTab]);

  return (
    <Modal opened={opened} onClose={handleModalClose} title={t("features.databases.add.title")} size="lg">
      <Stack gap="md">
        <SegmentedControl
          value={firstLevelTab}
          onChange={setFirstLevelTab}
          data={[
            { label: t("features.databases.category.games", "Games"), value: "games" },
            { label: t("features.databases.category.puzzles", "Puzzles"), value: "puzzles" },
          ]}
          fullWidth
        />

        {firstLevelTab === "games" && (
          <Tabs defaultValue="web">
            <Tabs.List grow>
              <Tabs.Tab value="web">{t("features.databases.add.web")}</Tabs.Tab>
              <Tabs.Tab value="local">{t("common.local")}</Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="web" pt="xs">
              {isLoading ? (
                <Center>
                  <Loader />
                </Center>
              ) : (
                <ScrollArea.Autosize h={500} offsetScrollbars>
                  <Stack>
                    {defaultDatabases?.map((db, i) => (
                      <DatabaseCard
                        key={`${db.title}-${i}`}
                        database={db}
                        databaseId={i}
                        setDatabases={setDatabases}
                        initInstalled={installedDatabaseTitles.has(db.title)}
                      />
                    ))}
                    {error && (
                      <Alert icon={<IconAlertCircle size="1rem" />} title={t("common.error")} color="red">
                        {t("features.databases.add.errorFetch")}
                      </Alert>
                    )}
                  </Stack>
                </ScrollArea.Autosize>
              )}
            </Tabs.Panel>

            <Tabs.Panel value="local" pt="xs">
              <form onSubmit={databaseForm.onSubmit(handleDatabaseSubmit)}>
                <Stack>
                  <TextInput label={t("common.name")} withAsterisk {...databaseForm.getInputProps("title")} />

                  <TextInput label={t("common.description")} {...databaseForm.getInputProps("description")} />

                  <FileInput
                    label={t("common.pgnFile")}
                    description={t("features.databases.add.clickToSelectPGN")}
                    onClick={handleDatabaseFileSelect}
                    filename={databaseForm.values.filename || null}
                    error={databaseForm.errors.file}
                  />

                  <Button fullWidth type="submit">
                    {t("common.convert", "Convert")}
                  </Button>
                </Stack>
              </form>
            </Tabs.Panel>
          </Tabs>
        )}

        {firstLevelTab === "puzzles" && (
          <Tabs defaultValue="puzzleWeb">
            <Tabs.List grow>
              <Tabs.Tab value="puzzleWeb">{t("features.databases.add.web")}</Tabs.Tab>
              <Tabs.Tab value="puzzleLocal">{t("common.local")}</Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="puzzleWeb" pt="xs">
              {isPuzzleLoading ? (
                <Center>
                  <Loader />
                </Center>
              ) : (
                <ScrollArea.Autosize mah={500} offsetScrollbars>
                  <Stack>
                    {defaultPuzzleDbs?.map((db, i) => {
                      const isInstalled = installedPuzzleTitles.has(db.title);
                      console.debug(`Checking puzzle DB "${db.title}":`, {
                        isInstalled,
                        installedTitles: Array.from(installedPuzzleTitles),
                        localPuzzleDbs: localPuzzleDbs.map((p) => p.title),
                        propPuzzleDbs: puzzleDbs?.map((p) => p.title),
                      });
                      return (
                        <PuzzleDbCard
                          key={`puzzle-db-${db.title}-${i}`}
                          puzzleDb={db}
                          databaseId={i}
                          setPuzzleDbs={setPuzzleDbs || (() => {})}
                          initInstalled={isInstalled}
                        />
                      );
                    })}
                    {puzzleError && (
                      <Alert icon={<IconAlertCircle size="1rem" />} title={t("common.error")} color="red">
                        {t("features.databases.add.errorFetch")}
                      </Alert>
                    )}
                  </Stack>
                </ScrollArea.Autosize>
              )}
            </Tabs.Panel>

            <Tabs.Panel value="puzzleLocal" pt="xs">
              <form onSubmit={puzzleForm.onSubmit(handlePuzzleSubmit)}>
                <Stack>
                  <TextInput label={t("common.name")} withAsterisk {...puzzleForm.getInputProps("title")} />

                  <TextInput label={t("common.description")} {...puzzleForm.getInputProps("description")} />

                  <FileInput
                    label={t("features.files.fileType.puzzle")}
                    description={t("features.databases.add.clickToSelectPGN")}
                    onClick={handlePuzzleFileSelect}
                    filename={puzzleForm.values.filename || null}
                    error={puzzleForm.errors.file}
                  />

                  {importError && (
                    <Alert icon={<IconAlertCircle size="1rem" />} title={t("common.error")} color="red">
                      {importError}
                    </Alert>
                  )}

                  <Button fullWidth type="submit" loading={importing}>
                    {importing ? t("common.importing") : t("common.import")}
                  </Button>
                </Stack>
              </form>
            </Tabs.Panel>
          </Tabs>
        )}
      </Stack>
    </Modal>
  );
}

function DatabaseCard({ setDatabases, database, databaseId, initInstalled }: DatabaseCardProps) {
  const { t } = useTranslation();
  const [inProgress, setInProgress] = useState<boolean>(false);

  const downloadDatabase = useCallback(
    async (id: number, url: string, name: string) => {
      try {
        setInProgress(true);
        const path = await resolve(await appDataDir(), "db", `${name}.db3`);
        await commands.downloadFile(`db_${id}`, url, path, null, null, null);
        setDatabases();
      } catch (error) {
        console.error("Failed to download database:", error);
        throw error;
      } finally {
        setInProgress(false);
      }
    },
    [setDatabases],
  );

  const handleDownload = useCallback(() => {
    downloadDatabase(databaseId, database.downloadLink || "", database.title || "");
  }, [downloadDatabase, databaseId, database.downloadLink, database.title]);

  return (
    <Paper withBorder radius="md" p="md">
      <Text tt="uppercase" c="dimmed" fw={700} size="xs">
        {t("features.databases.add.title", "DATABASE")}
      </Text>
      <Text fw="bold" mb="xs">
        {database.title}
      </Text>

      <Text size="xs" c="dimmed" mb="md">
        {database.description}
      </Text>

      <Divider mb="md" />

      <Group justify="space-between" mb="md">
        <Stack gap={0} align="center">
          <Text tt="uppercase" c="dimmed" fw={700} size="xs">
            {t("common.size")}
          </Text>
          <Text size="xs">{t("units.bytes", { bytes: database.storage_size ?? 0 })}</Text>
        </Stack>
        <Stack gap={0} align="center">
          <Text tt="uppercase" c="dimmed" fw={700} size="xs">
            {t("features.databases.card.games")}
          </Text>
          <Text size="xs">{t("units.count", { count: database.game_count })}</Text>
        </Stack>
        <Stack gap={0} align="center">
          <Text tt="uppercase" c="dimmed" fw={700} size="xs">
            {t("features.databases.card.players")}
          </Text>
          <Text size="xs">{t("units.count", { count: database.player_count })}</Text>
        </Stack>
      </Group>

      <ProgressButton
        id={`db_${databaseId}`}
        progressEvent={events.downloadProgress}
        initInstalled={initInstalled}
        labels={{
          completed: t("common.installed"),
          action: t("common.install"),
          inProgress: t("common.downloading"),
          finalizing: t("common.extracting"),
        }}
        onClick={handleDownload}
        inProgress={inProgress}
        setInProgress={setInProgress}
      />
    </Paper>
  );
}

function PuzzleDbCard({ setPuzzleDbs, puzzleDb, databaseId, initInstalled }: PuzzleDbCardProps) {
  const { t } = useTranslation();
  const [inProgress, setInProgress] = useState<boolean>(false);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [willImport, setWillImport] = useState<boolean>(false); // Flag to indicate we will import after download

  // Check if it's a CSV file (needs import) or a database file (direct download)
  const isCsvFile = puzzleDb.downloadLink?.endsWith(".csv") || puzzleDb.downloadLink?.endsWith(".csv.zst");

  // Listen to import progress events for CSV files
  useEffect(() => {
    if (!isCsvFile) return;

    const unlistenPromise = listen<[number, number]>("import_puzzle_progress", (event) => {
      const [processed, total] = event.payload;
      
      // If total is 0, we're still processing (unknown total)
      // If processed === total and total > 0, import is complete
      if (total > 0 && processed === total) {
        // Import is complete
        setIsImporting(false);
      } else if (processed > 0) {
        // Import is in progress
        setIsImporting(true);
      }
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [isCsvFile]);

  // Combined progress state: true if downloading OR importing
  const combinedInProgress = inProgress || isImporting || willImport;

  const downloadDatabase = useCallback(
    async (id: number, url: string, name: string) => {
      try {
        setInProgress(true);
        setIsImporting(false);
        setWillImport(isCsvFile); // Set flag early for CSV files
        
        if (isCsvFile) {
          // For CSV files, download to a temp location first, then import
          const tempPath = await resolve(await appDataDir(), "puzzles", `${name}_temp${url.endsWith(".zst") ? ".csv.zst" : ".csv"}`);
          const dbPath = await resolve(await appDataDir(), "puzzles", `${name}.db3`);
          
          try {
            await commands.downloadFile(`puzzle_db_${id}`, url, tempPath, null, null, null);
            
            // Set importing state BEFORE starting import to prevent ProgressButton from
            // setting inProgress to false when download finishes
            setWillImport(false); // Clear flag, now we're actually importing
            setIsImporting(true);
            
            // Import the downloaded CSV file
            await commands.importPuzzleFile(tempPath, dbPath, name, puzzleDb.description || null);
          } catch (error) {
            // If import fails, remove the database file if it was created
            try {
              const { exists, remove: removeFile } = await import("@tauri-apps/plugin-fs");
              if (await exists(dbPath)) {
                await removeFile(dbPath);
                console.debug("Removed empty database file after failed import");
              }
            } catch (cleanupError) {
              console.warn("Failed to clean up database file after import error:", cleanupError);
            }
            setIsImporting(false);
            setWillImport(false);
            throw error;
          } finally {
            // Clean up temp file
            try {
              await remove(tempPath);
            } catch (e) {
              // Ignore cleanup errors
              console.warn("Failed to clean up temp file:", e);
            }
          }
        } else {
          // For database files, download directly
          const path = await resolve(await appDataDir(), "puzzles", `${name}.db3`);
          console.log("Downloading database file directly to:", path);
          console.log("Download URL:", url);
          const result = await commands.downloadFile(`puzzle_db_${id}`, url, path, null, null, null);
          if (result.status === "error") {
            throw new Error(result.error);
          }
          console.log("Database download completed successfully");
          
          // Validate the downloaded file is a valid SQLite database
          try {
            const validationResult = await commands.validatePuzzleDatabase(path);
            if (validationResult.status === "error") {
              // Remove the invalid file
              try {
                const { remove: removeFile } = await import("@tauri-apps/plugin-fs");
                await removeFile(path);
                console.debug("Removed invalid database file after validation failed");
              } catch (cleanupError) {
                console.warn("Failed to clean up invalid database file:", cleanupError);
              }
              throw new Error(validationResult.error);
            }
            console.log("Database validation passed");
          } catch (error) {
            console.error("Database validation failed:", error);
            throw error;
          }
        }
        
        await setPuzzleDbs(await getPuzzleDatabases());
      } catch (error) {
        console.error("Failed to download puzzle database:", error);
        throw error;
      } finally {
        // Ensure all states are cleared when everything is done
        setInProgress(false);
        setIsImporting(false);
        setWillImport(false);
      }
    },
    [setPuzzleDbs, puzzleDb.description, isCsvFile],
  );

  const handleDownload = useCallback(async () => {
    console.log("handleDownload called for:", puzzleDb.title);
    try {
      console.log("Starting download for:", puzzleDb.title, "URL:", puzzleDb.downloadLink);
      if (!puzzleDb.downloadLink) {
        throw new Error("No download link provided");
      }
      await downloadDatabase(databaseId, puzzleDb.downloadLink, puzzleDb.title);
      console.log("Download completed successfully for:", puzzleDb.title);
    } catch (error) {
      console.error("Download failed for:", puzzleDb.title, error);
      // Show error notification
      const { notifications } = await import("@mantine/notifications");
      notifications.show({
        title: t("common.error"),
        message: error instanceof Error ? error.message : String(error),
        color: "red",
        autoClose: 10000,
      });
    }
  }, [downloadDatabase, databaseId, puzzleDb.downloadLink, puzzleDb.title, t]);

  return (
    <Paper withBorder radius="md" p="md">
      <Text tt="uppercase" c="dimmed" fw={700} size="xs">
        {t("features.databases.add.title").toUpperCase()}
      </Text>
      <Text fw="bold" mb="xs">
        {puzzleDb.title}
      </Text>

      <Text size="xs" c="dimmed" mb="md">
        {puzzleDb.description}
      </Text>

      <Divider mb="md" />

      <Group justify="space-between" mb="md">
        <Stack gap={0} align="center">
          <Text tt="uppercase" c="dimmed" fw={700} size="xs">
            {t("common.size").toUpperCase()}
          </Text>
          <Text size="xs">{t("units.bytes", { bytes: puzzleDb.storageSize })}</Text>
        </Stack>
        <Stack gap={0} align="center">
          <Text tt="uppercase" c="dimmed" fw={700} size="xs">
            {t("features.files.fileType.puzzle").toUpperCase()}
          </Text>
          <Text size="xs">{t("units.count", { count: puzzleDb.puzzleCount })}</Text>
        </Stack>
      </Group>

      <ProgressButton
        id={`puzzle_db_${databaseId}`}
        progressEvent={events.downloadProgress}
        initInstalled={initInstalled}
        labels={{
          completed: t("common.installed"),
          action: t("common.install"),
          inProgress: isCsvFile && isImporting ? t("common.importing") || "Importing..." : t("common.downloading"),
          finalizing: isCsvFile && isImporting ? t("common.importing") || "Importing..." : t("common.extracting"),
        }}
        onClick={handleDownload}
        inProgress={combinedInProgress}
        setInProgress={(value) => {
          // For CSV files, prevent ProgressButton from setting inProgress to false
          // when download finishes, because we still need to import
          // For non-CSV files, allow normal behavior
          if (!isCsvFile || (!isImporting && !willImport)) {
            setInProgress(value);
          }
        }}
      />
    </Paper>
  );
}

export default AddDatabase;
