import { Badge, Box, Group, SimpleGrid, Stack, Text } from "@mantine/core";
import { IconBook, IconChess, IconFileText, IconTarget, IconTrophy } from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import Fuse from "fuse.js";
import { useAtom, useSetAtom } from "jotai";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { commands } from "@/bindings";
import GenericCard from "@/components/GenericCard";
import * as classes from "@/components/GenericCard/styles.css";
import type { Directory, FileMetadata } from "@/features/files/utils/file";
import { FILE_TYPE_LABELS } from "@/features/files/utils/file";
import { getStats } from "@/features/files/utils/opening";
import { activeTabAtom, deckAtomFamily, tabsAtom } from "@/state/atoms";
import { createTab } from "@/utils/tabs";
import { unwrap } from "@/utils/unwrap";

function flattenFiles(files: (FileMetadata | Directory)[]): FileMetadata[] {
  return files.flatMap((f) => (f.type === "directory" ? flattenFiles(f.children) : [f]));
}

function getFileTypeIcon(fileType: string) {
  switch (fileType) {
    case "repertoire":
      return <IconBook size="1.5rem" />;
    case "game":
      return <IconChess size="1.5rem" />;
    case "tournament":
      return <IconTrophy size="1.5rem" />;
    case "puzzle":
      return <IconTarget size="1.5rem" />;
    default:
      return <IconFileText size="1.5rem" />;
  }
}

export default function FileGridView({
  files,
  isLoading,
  selectedFile,
  setSelectedFile,
  search,
  filter,
  gridCols,
}: {
  files: (FileMetadata | Directory)[] | undefined;
  isLoading: boolean;
  selectedFile: FileMetadata | null;
  setSelectedFile: (file: FileMetadata) => void;
  search: string;
  filter: string;
  gridCols: number | { base: number; md?: number; lg?: number };
}) {
  const { t } = useTranslation();

  const flattedFiles = useMemo(() => flattenFiles(files ?? []), [files]);
  const fuse = useMemo(
    () =>
      new Fuse(flattedFiles ?? [], {
        keys: ["name"],
      }),
    [flattedFiles],
  );

  let filteredFiles = flattedFiles;

  if (search) {
    const searchResults = fuse.search(search);
    filteredFiles = filteredFiles.filter((f) => searchResults.some((r) => r.item.path === f.path));
  }
  if (filter && filter !== "all") {
    filteredFiles = filteredFiles.filter((f) => f.metadata.type === filter);
  }

  filteredFiles = [...filteredFiles].sort((a, b) => b.lastModified - a.lastModified);

  if (isLoading) {
    return (
      <Box p="md">
        <Text c="dimmed">{t("common.loading")}</Text>
      </Box>
    );
  }

  if (!filteredFiles.length) {
    return (
      <Box p="md">
        <Text c="dimmed">{t("features.files.noFiles")}</Text>
      </Box>
    );
  }

  return (
    <SimpleGrid cols={gridCols}>
      {filteredFiles.map((file, index) => (
        <FileCard
          key={file.path}
          file={file}
          index={index}
          isSelected={selectedFile?.path === file.path}
          setSelected={() => setSelectedFile(file)}
        />
      ))}
    </SimpleGrid>
  );
}

function FileCard({
  file,
  index,
  isSelected,
  setSelected,
}: {
  file: FileMetadata;
  index: number;
  isSelected: boolean;
  setSelected: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [, setTabs] = useAtom(tabsAtom);
  const setActiveTab = useSetAtom(activeTabAtom);

  const openFile = async () => {
    const pgn = unwrap(await commands.readGames(file.path, 0, 0));
    createTab({
      tab: {
        name: file.name || "Untitled",
        type: "analysis",
      },
      setTabs,
      setActiveTab,
      pgn: pgn[0] || "",
      srcInfo: file,
      gameNumber: 0,
    });
    navigate({ to: "/boards" });
  };

  const content: ReactNode = (
    <Group wrap="nowrap" miw={0} gap="sm" align="start">
      <Box mt="xs">{getFileTypeIcon(file.metadata.type)}</Box>
      <Box miw={0}>
        <Stack gap="xs">
          <Text fw={600} size="md" lineClamp={1}>
            {file.name}
          </Text>
          <Group gap="xs">
            <Badge size="xs" variant="light">
              {t(FILE_TYPE_LABELS[file.metadata.type])}
            </Badge>
            <Badge size="xs" variant="filled" color="blue">
              {file.numGames === 1 && t("common.games.one", { count: file.numGames || 0 })}
              {file.numGames > 1 && t("common.games.other", { count: file.numGames || 0 })}
            </Badge>
            {file.metadata.type === "repertoire" && <DuePositions file={file.path} />}
          </Group>
          <Text size="xs" c="dimmed">
            {t("formatters.dateTimeFormat", {
              date: new Date(file.lastModified * 1000),
              interpolation: { escapeValue: false },
            })}
          </Text>
        </Stack>
      </Box>
    </Group>
  );

  return (
    <GenericCard
      id={index}
      key={file.path}
      isSelected={isSelected}
      setSelected={setSelected}
      content={content}
      onDoubleClick={openFile}
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
