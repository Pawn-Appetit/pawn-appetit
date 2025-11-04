import { Button, Center, Chip, Drawer, Group, Input, SegmentedControl, Stack, Text, Title } from "@mantine/core";
import { useToggle } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import { IconGridDots, IconList, IconPlus, IconSearch, IconX } from "@tabler/icons-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLoaderData } from "@tanstack/react-router";
import { readDir, remove } from "@tauri-apps/plugin-fs";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import OpenFolderButton from "@/components/OpenFolderButton";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import DirectoryTable from "./components/DirectoryTable";
import FileCard from "./components/FileCard";
import FileGridView from "./components/FileGridView";
import {
  type Directory,
  FILE_TYPES,
  type FileMetadata,
  type FileType,
  processEntriesRecursively,
} from "./components/file";
import { CreateModal, EditModal } from "./components/Modals";

const useFileDirectory = (dir: string) => {
  const { data, error, isLoading, refetch } = useQuery({
    queryKey: ["file-directory", dir],
    queryFn: async () => {
      const entries = await readDir(dir);
      const allEntries = processEntriesRecursively(dir, entries);
      return allEntries;
    },
  });

  const queryClient = useQueryClient();

  const mutate = (newData?: (FileMetadata | Directory)[]) => {
    if (newData) {
      queryClient.setQueryData(["file-directory", dir], newData);
    } else {
      refetch();
    }
  };

  return {
    files: data,
    isLoading,
    error,
    mutate,
  };
};

function FilesPage() {
  const { t } = useTranslation();
  const { layout } = useResponsiveLayout();

  const { documentDir } = useLoaderData({ from: "/files" });
  const { files, isLoading, mutate } = useFileDirectory(documentDir);

  // Calculate responsive values based on layout flags
  const isMobile = layout.files.layoutType === "mobile";
  const gridCols = isMobile ? 1 : { base: 1, md: 4 };

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<FileMetadata | null>(null);
  const [games, setGames] = useState<Map<number, string>>(new Map());
  const [filter, setFilter] = useState<FileType>("all");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");

  const [createModal, toggleCreateModal] = useToggle();
  const [editModal, toggleEditModal] = useToggle();

  useEffect(() => {
    setGames(new Map());
  }, []);

  return (
    <>
      <Group align="baseline" p="md">
        <Title>{t("features.files.title")}</Title>
        <OpenFolderButton folder={documentDir} />
      </Group>

      <Stack px="md" pb="md">
        <Group wrap="wrap" gap="xs" justify="space-between">
          <Group wrap={isMobile ? "wrap" : "nowrap"}>
            <Input
              leftSection={<IconSearch size="1rem" />}
              placeholder={t("features.files.search")}
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              w={{ base: "100%", sm: 260 }}
            />
            <SegmentedControl
              value={viewMode}
              onChange={(v) => setViewMode(v as "grid" | "table")}
              data={[
                {
                  value: "grid",
                  label: (
                    <Center style={{ gap: 10 }}>
                      <IconGridDots size="1rem" />
                      <span>{t("common.grid")}</span>
                    </Center>
                  ),
                },
                {
                  value: "table",
                  label: (
                    <Center style={{ gap: 10 }}>
                      <IconList size="1rem" />
                      <span>{t("common.table")}</span>
                    </Center>
                  ),
                },
              ]}
            />
          </Group>
          <Group wrap={isMobile ? "wrap" : "nowrap"}>
            <Button
              size={isMobile ? "sm" : "xs"}
              leftSection={<IconPlus size="1rem" />}
              onClick={() => toggleCreateModal()}
            >
              {t("common.create")}
            </Button>
            <Button
              size={isMobile ? "sm" : "xs"}
              color="red"
              disabled={!selected}
              leftSection={<IconX size="1rem" />}
              onClick={() => {
                modals.openConfirmModal({
                  title: t("features.files.delete.title"),
                  withCloseButton: false,
                  children: (
                    <>
                      <Text>
                        {t("features.files.delete.message", {
                          fileName: selected?.name,
                        })}
                      </Text>
                      <Text>{t("common.cannotUndo")}</Text>
                    </>
                  ),
                  labels: { confirm: t("common.remove"), cancel: t("common.cancel") },
                  confirmProps: { color: "red" },
                  onConfirm: async () => {
                    if (selected) {
                      await remove(selected.path);
                      await remove(selected.path.replace(".pgn", ".info"));
                      mutate(files?.filter((file) => file.name !== selected.name));
                    }
                    setSelected(null);
                  },
                });
              }}
            >
              {t("common.delete")}
            </Button>
          </Group>
        </Group>
        <Group wrap={isMobile ? "wrap" : "nowrap"}>
          {FILE_TYPES.map((item) => (
            <Chip
              variant="outline"
              key={item.value}
              onChange={(v) => setFilter((filter) => (v ? item.value : filter === item.value ? "all" : filter))}
              checked={filter === item.value}
            >
              {t(item.labelKey)}
            </Chip>
          ))}
        </Group>

        {viewMode === "table" ? (
          <DirectoryTable
            files={files}
            setFiles={mutate}
            isLoading={isLoading}
            setSelectedFile={setSelected}
            selectedFile={selected}
            search={search}
            filter={filter || ""}
          />
        ) : (
          <FileGridView
            files={files}
            isLoading={isLoading}
            selectedFile={selected}
            setSelectedFile={setSelected}
            search={search}
            filter={filter || ""}
            gridCols={gridCols}
          />
        )}
      </Stack>

      <Drawer
        opened={selected !== null}
        onClose={() => setSelected(null)}
        position="right"
        size={layout.engines.layoutType === "mobile" ? "100%" : "xl"}
        title={selected?.name || "File Details"}
        overlayProps={{ backgroundOpacity: 0.5, blur: 4 }}
      >
        {selected ? (
          <FileCard selected={selected} games={games} setGames={setGames} toggleEditModal={toggleEditModal} />
        ) : (
          <Center h="100%">
            <Text>{t("features.files.noFileSelected")}</Text>
          </Center>
        )}
      </Drawer>

      {files && (
        <CreateModal
          opened={createModal}
          setOpened={toggleCreateModal}
          files={files}
          setFiles={mutate}
          setSelected={setSelected}
        />
      )}
      {selected && files && (
        <EditModal
          key={selected.name}
          opened={editModal}
          setOpened={toggleEditModal}
          mutate={mutate}
          setSelected={setSelected}
          metadata={selected}
        />
      )}
    </>
  );
}
export default FilesPage;
