import { Badge, Box, Button, Group, Paper, Stack, Text } from "@mantine/core";
import { useForceUpdate } from "@mantine/hooks";
import {
  IconChevronRight,
  IconEye,
  IconFileText,
  IconPlus,
  IconSearch,
  IconTarget,
  IconTrash,
} from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { remove } from "@tauri-apps/plugin-fs";
import clsx from "clsx";
import Fuse from "fuse.js";
import { useAtom, useSetAtom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { useContextMenu } from "mantine-contextmenu";
import { DataTable, type DataTableSortStatus } from "mantine-datatable";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { commands } from "@/bindings";
import type { Directory, FileMetadata } from "@/features/files/utils/file";
import { FILE_TYPE_LABELS } from "@/features/files/utils/file";
import { getStats } from "@/features/files/utils/opening";
import { useLanguageChangeListener } from "@/hooks/useLanguageChangeListener";
import { activeTabAtom, deckAtomFamily, tabsAtom } from "@/state/atoms";
import { createTab } from "@/utils/tabs";
import { unwrap } from "@/utils/unwrap";
import * as classes from "./DirectoryTable.css";

function flattenFiles(files: (FileMetadata | Directory)[]): (FileMetadata | Directory)[] {
  return files.flatMap((f) => (f.type === "directory" ? flattenFiles(f.children) : [f]));
}

function recursiveSort(
  files: (FileMetadata | Directory)[],
  sort: DataTableSortStatus<FileMetadata | Directory>,
): (FileMetadata | Directory)[] {
  return files
    .map((f) => {
      if (f.type === "file") return f;
      return {
        ...f,
        children: recursiveSort(f.children, sort),
      };
    })
    .sort((a, b) => {
      return b.name.localeCompare(a.name, "en", { sensitivity: "base" });
    })
    .filter((f) => {
      return f.type === "file" || f.children.length > 0;
    })
    .sort((a, b) => {
      if (sort.direction === "desc") {
        if (sort.columnAccessor === "name") {
          return b.name.localeCompare(a.name);
        }
        // @ts-expect-error
        return b[sort.columnAccessor] > a[sort.columnAccessor] ? 1 : -1;
      }
      if (sort.columnAccessor === "name") {
        return a.name.localeCompare(b.name);
      }
      // @ts-expect-error
      return a[sort.columnAccessor] > b[sort.columnAccessor] ? 1 : -1;
    })
    .sort((a, b) => {
      if (a.type === "directory" && b.type === "file") {
        return -1;
      }
      if (a.type === "directory" && b.type === "directory") {
        return 0;
      }
      if (a.type === "file" && b.type === "file") {
        return 0;
      }
      return 1;
    });
}

type SortStatus = DataTableSortStatus<FileMetadata | Directory>;
const sortStatusStorageId = `${DirectoryTable.name}-sort-status` as const;
const sortStatusAtom = atomWithStorage<SortStatus>(
  sortStatusStorageId,
  {
    columnAccessor: "lastModified",
    direction: "desc",
  },
  undefined,
  { getOnInit: true },
);

export default function DirectoryTable({
  files,
  isLoading,
  setFiles,
  selectedFile,
  setSelectedFile,
  search,
  filter,
  onCreateFile,
}: {
  files: (FileMetadata | Directory)[] | undefined;
  isLoading: boolean;
  setFiles: (files: (FileMetadata | Directory)[]) => void;
  selectedFile: FileMetadata | null;
  setSelectedFile: (file: FileMetadata) => void;
  search: string;
  filter: string;
  onCreateFile?: () => void;
}) {
  const [sort, setSort] = useAtom<SortStatus>(sortStatusAtom);
  const { t } = useTranslation();

  const flattedFiles = useMemo(() => flattenFiles(files ?? []), [files]);
  const fuse = useMemo(
    () =>
      new Fuse(flattedFiles ?? [], {
        keys: ["name"],
      }),
    [flattedFiles],
  );

  let filteredFiles = files ?? [];

  if (search) {
    const searchResults = fuse.search(search);
    filteredFiles = filteredFiles
      .filter((f) => searchResults.some((r) => r.item.path.includes(f.path)))
      .map((f) => {
        if (f.type === "file") return f;
        const children = f.children.filter((c) => searchResults.some((r) => r.item.path.includes(c.path)));
        return {
          ...f,
          children,
        };
      });
  }
  if (filter && filter !== "all") {
    const typeFilteredFiles = flattedFiles.filter((f) => (f.type === "file" && f.metadata.type) === filter);
    filteredFiles = filteredFiles
      .filter((f) => typeFilteredFiles.some((r) => r.path.includes(f.path)))
      .map((f) => {
        if (f.type === "file") return f;
        const children = f.children.filter((c) => typeFilteredFiles.some((r) => r.path.includes(c.path)));
        return {
          ...f,
          children,
        };
      });
  }

  filteredFiles = recursiveSort(filteredFiles, sort);

  // Check if there are no files at all (before filtering)
  if (!isLoading && !flattedFiles.length) {
    return (
      <Paper withBorder p="xl" radius="md">
        <Stack align="center" justify="center" gap="md" py="xl">
          <IconFileText size={48} stroke={1.5} style={{ opacity: 0.5 }} />
          <Stack gap="xs" align="center">
            <Text size="lg" fw={700}>
              {t("features.files.noFilesTitle")}
            </Text>
            <Text size="sm" c="dimmed" ta="center" maw={400}>
              {t("features.files.noFilesDescription")}
            </Text>
          </Stack>
          {onCreateFile && (
            <Button onClick={onCreateFile} size="sm" leftSection={<IconPlus size="1rem" />}>
              {t("common.create")}
            </Button>
          )}
        </Stack>
      </Paper>
    );
  }

  // Check if filters/search returned no results
  if (!isLoading && flattedFiles.length > 0 && !filteredFiles.length) {
    return (
      <Paper withBorder p="xl" radius="md">
        <Stack align="center" justify="center" gap="md" py="xl">
          <IconSearch size={48} stroke={1.5} style={{ opacity: 0.5 }} />
          <Text size="lg" fw={500}>
            {t("features.files.noFilesFound")}
          </Text>
          <Text size="sm" c="dimmed">
            {t("features.files.noFilesFoundDescription")}
          </Text>
        </Stack>
      </Paper>
    );
  }

  return (
    <Table
      files={filteredFiles}
      isLoading={isLoading}
      setFiles={setFiles}
      depth={0}
      selected={selectedFile}
      setSelectedFile={setSelectedFile}
      sort={sort}
      setSort={setSort}
    />
  );
}

function Table({
  files,
  isLoading,
  depth,
  setFiles,
  selected,
  setSelectedFile,
  sort,
  setSort,
}: {
  files: (FileMetadata | Directory)[];
  isLoading: boolean;
  depth: number;
  setFiles: (files: (FileMetadata | Directory)[]) => void;
  selected: FileMetadata | null;
  setSelectedFile: (file: FileMetadata) => void;
  sort: DataTableSortStatus<FileMetadata | Directory>;
  setSort: (sort: SortStatus) => void;
}) {
  const { t } = useTranslation();
  const forceUpdate = useForceUpdate();
  useLanguageChangeListener(forceUpdate);

  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const expandedFiles = expandedIds.filter((id) => files?.find((f) => f.path === id && f.type === "directory"));
  const navigate = useNavigate();
  const [, setTabs] = useAtom(tabsAtom);
  const setActiveTab = useSetAtom(activeTabAtom);

  const { showContextMenu } = useContextMenu();

  const openFile = useCallback(
    async (record: FileMetadata) => {
      const pgn = unwrap(await commands.readGames(record.path, 0, 0));
      createTab({
        tab: {
          name: record?.name || "Untitled",
          type: "analysis",
        },
        setTabs,
        setActiveTab,
        pgn: pgn[0] || "",
        srcInfo: record,
        gameNumber: 0,
      });
      navigate({ to: "/boards" });
    },
    [setActiveTab, setTabs, navigate],
  );

  return (
    <DataTable
      noHeader={depth > 0}
      withTableBorder={depth === 0}
      withColumnBorders
      highlightOnHover
      fetching={isLoading}
      scrollAreaProps={{
        offsetScrollbars: depth === 0,
        scrollbars: "y",
      }}
      idAccessor="path"
      rowClassName={(record) => (record.path === selected?.path ? classes.selected : "")}
      sortStatus={sort}
      onRowDoubleClick={({ record }) => {
        if (record.type === "directory") return;
        openFile(record);
      }}
      onSortStatusChange={setSort}
      columns={[
        {
          accessor: "name",
          title: t("features.files.name"),
          sortable: true,
          noWrap: true,
          render: (row) => (
            <Box ml={20 * depth}>
              <Group>
                {row.type === "directory" && (
                  <IconChevronRight
                    className={clsx(classes.icon, classes.expandIcon, {
                      [classes.expandIconRotated]: expandedFiles.includes(row.path),
                    })}
                  />
                )}
                <span>{row.name}</span>
                {row.type === "file" && row.metadata.type === "repertoire" && <DuePositions file={row.path} />}
              </Group>
            </Box>
          ),
        },
        {
          accessor: "metadata.type",
          title: t("features.files.type"),
          width: 100,
          render: (row) => {
            if (row.type === "file") {
              return t(FILE_TYPE_LABELS[row.metadata.type]);
            }
            return t("features.files.folder");
          },
        },
        {
          accessor: "lastModified",
          title: t("features.files.lastModified"),
          sortable: true,
          textAlign: "right",
          width: 200,
          render: (row) => {
            if (row.type === "directory") return null;
            return (
              <Box ml={20 * depth}>
                {t("formatters.dateTimeFormat", {
                  date: new Date(row.lastModified * 1000),
                  interpolation: { escapeValue: false },
                })}
              </Box>
            );
          },
        },
      ]}
      records={files}
      noRecordsText={t("features.files.noFiles")}
      minHeight={!files.length ? 150 : undefined}
      rowExpansion={{
        allowMultiple: true,
        expanded: {
          recordIds: expandedFiles,
          onRecordIdsChange: setExpandedIds,
        },
        content: ({ record }) =>
          record.type === "directory" && (
            <Table
              files={record.children}
              isLoading={isLoading}
              setFiles={setFiles}
              depth={depth + 1}
              selected={selected}
              setSelectedFile={setSelectedFile}
              sort={sort}
              setSort={setSort}
            />
          ),
      }}
      onRowClick={({ record }) => {
        if (record.type === "file") {
          setSelectedFile(record);
        }
      }}
      onRowContextMenu={({ record, event }) => {
        return showContextMenu([
          {
            key: "open-file",
            icon: <IconEye size={16} />,
            title: t("common.open"),
            disabled: record.type === "directory",
            onClick: () => {
              if (record.type === "directory") return;
              openFile(record);
            },
          },
          {
            key: "delete-file",
            icon: <IconTrash size={16} />,
            title: t("features.files.delete.delete"),
            color: "red",
            onClick: async () => {
              if (record.type === "directory") {
                await remove(record.path, { recursive: true });
              } else {
                await remove(record.path);
              }
              setFiles(files?.filter((f) => record.path.includes(f.path)));
            },
          },
        ])(event);
      }}
    />
  );
}

function DuePositions({ file }: { file: string }) {
  const [deck] = useAtom(
    deckAtomFamily({
      file,
      game: 0,
    }),
  );

  const stats = getStats(deck.positions);

  if (stats.due + stats.unseen === 0) return null;

  return <Badge leftSection={<IconTarget size="1rem" />}>{stats.due + stats.unseen}</Badge>;
}
