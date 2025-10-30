import {
  Alert,
  Box,
  Button,
  Center,
  Divider,
  Group,
  Loader,
  Modal,
  Paper,
  ScrollArea,
  Stack,
  Tabs,
  Text,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { IconAlertCircle } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { appDataDir, resolve } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-dialog";
import { type Dispatch, type SetStateAction, useState } from "react";
import { useTranslation } from "react-i18next";
import { commands, events, type PuzzleDatabaseInfo } from "@/bindings";
import FileInput from "@/components/FileInput";
import ProgressButton from "@/components/ProgressButton";
import { getDefaultPuzzleDatabases } from "@/utils/db";
import { capitalize } from "@/utils/format";
import { getPuzzleDatabases } from "@/utils/puzzles";

export function AddPuzzle({
  puzzleDbs,
  opened,
  setOpened,
  setPuzzleDbs,
}: {
  puzzleDbs: PuzzleDatabaseInfo[];
  opened: boolean;
  setOpened: (opened: boolean) => void;
  setPuzzleDbs: Dispatch<SetStateAction<PuzzleDatabaseInfo[]>>;
}) {
  const { t } = useTranslation();
  const {
    data: dbs,
    error,
    isLoading,
  } = useQuery({
    queryKey: ["default_puzzle_databases"],
    queryFn: getDefaultPuzzleDatabases,
    staleTime: Infinity,
  });
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  async function importPuzzleFile(path: string, title: string, description?: string) {
    try {
      setImporting(true);
      setImportError(null);

      const dbPath = await resolve(await appDataDir(), "puzzles", `${title}.db3`);

      const result = await commands.importPuzzleFile(path, dbPath, title, description ?? null);
      if (result.status === "error") {
        throw new Error(result.error);
      }

      setPuzzleDbs(await getPuzzleDatabases());
    } catch (error) {
      console.error("Failed to import puzzle file:", error);
      setImportError(error instanceof Error ? error.message : "Failed to import puzzle file");
    } finally {
      setImporting(false);
    }
  }

  const form = useForm<{ title: string; description: string; file: string; filename: string }>({
    initialValues: {
      title: "",
      description: "",
      file: "",
      filename: "",
    },

    validate: {
      title: (value) => {
        if (!value) return t("common.requireName");
        if (puzzleDbs.find((e) => e.title === `${value}.db3`)) return t("common.nameAlreadyUsed");
      },
      file: (value) => {
        if (!value) return t("common.requirePath");
      },
    },
  });

  return (
    <Modal opened={opened} onClose={() => setOpened(false)} title={t("features.databases.add.title")}>
      <Tabs defaultValue="web">
        <Tabs.List>
          <Tabs.Tab value="web">{t("features.databases.add.web")}</Tabs.Tab>
          <Tabs.Tab value="local">{t("common.local")}</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="web" pt="xs">
          {isLoading && (
            <Center>
              <Loader />
            </Center>
          )}
          <ScrollArea.Autosize mah={500} offsetScrollbars>
            <Stack>
              {dbs?.map((db, i) => (
                <PuzzleDbCard
                  puzzleDb={db}
                  databaseId={i}
                  key={`puzzle-db-${db.title}-${i}`}
                  setPuzzleDbs={setPuzzleDbs}
                  initInstalled={puzzleDbs.some((e) => e.title === `${db.title}.db3`)}
                />
              ))}
              {error && (
                <Alert icon={<IconAlertCircle size="1rem" />} title={t("common.error")} color="red">
                  {t("features.databases.add.errorFetch")}
                </Alert>
              )}
            </Stack>
          </ScrollArea.Autosize>
        </Tabs.Panel>
        <Tabs.Panel value="local" pt="xs">
          <form
            onSubmit={form.onSubmit(async (values) => {
              await importPuzzleFile(values.file, values.title, values.description);
              if (!importError) {
                setOpened(false);
                form.reset();
              }
            })}
          >
            <TextInput label={t("common.name")} withAsterisk {...form.getInputProps("title")} />

            <TextInput label={t("common.description")} {...form.getInputProps("description")} />

            <FileInput
              label={t("features.files.fileType.puzzle")}
              description={t("features.databases.add.clickToSelectPGN")}
              onClick={async () => {
                const selected = await open({
                  multiple: false,
                  filters: [
                    {
                      name: "Puzzle files",
                      extensions: ["pgn", "pgn.zst", "db", "db3"],
                    },
                  ],
                });
                if (!selected || typeof selected === "object") return;
                form.setFieldValue("file", selected);
                const filename = selected.split(/(\\|\/)/g).pop();
                if (filename) {
                  form.setFieldValue("filename", filename);
                  if (!form.values.title) {
                    const nameWithoutExt = filename.replace(/\.(pgn|db|db3)(.zst)?$/i, "");
                    form.setFieldValue("title", capitalize(nameWithoutExt.replaceAll(/[_-]/g, " ")));
                  }
                }
              }}
              filename={form.values.filename || null}
              {...form.getInputProps("file")}
            />

            {importError && (
              <Alert icon={<IconAlertCircle size="1rem" />} title={t("common.error")} color="red" mt="md">
                {importError}
              </Alert>
            )}

            <Button fullWidth mt="xl" type="submit" loading={importing}>
              {importing ? t("common.importing") : t("common.import")}
            </Button>
          </form>
        </Tabs.Panel>
      </Tabs>
    </Modal>
  );
}

function PuzzleDbCard({
  setPuzzleDbs,
  puzzleDb,
  databaseId,
  initInstalled,
}: {
  setPuzzleDbs: Dispatch<SetStateAction<PuzzleDatabaseInfo[]>>;
  puzzleDb: PuzzleDatabaseInfo & { downloadLink: string };
  databaseId: number;
  initInstalled: boolean;
}) {
  const { t } = useTranslation();
  const [inProgress, setInProgress] = useState<boolean>(false);

  async function downloadDatabase(id: number, url: string, name: string) {
    setInProgress(true);
    const path = await resolve(await appDataDir(), "puzzles", `${name}.db3`);
    await commands.downloadFile(`puzzle_db_${id}`, url, path, null, null, null);
    setPuzzleDbs(await getPuzzleDatabases());
  }

  return (
    <Paper withBorder radius="md" p={0} key={puzzleDb.title}>
      <Group wrap="nowrap" gap={0} grow>
        <Box p="md" flex={1}>
          <Text tt="uppercase" c="dimmed" fw={700} size="xs">
            {t("features.databases.add.title").toUpperCase()}
          </Text>
          <Text fw="bold" mb="xs">
            {puzzleDb.title}
          </Text>

          <Text size="xs" c="dimmed">
            {puzzleDb.description}
          </Text>
          <Divider />
          <Group wrap="nowrap" grow my="md">
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
              inProgress: t("common.downloading"),
              finalizing: t("common.extracting"),
            }}
            onClick={() => downloadDatabase(databaseId, puzzleDb.downloadLink || "", puzzleDb.title)}
            inProgress={inProgress}
            setInProgress={setInProgress}
          />
        </Box>
      </Group>
    </Paper>
  );
}

export default AddPuzzle;
