import { Button, Center, Chip, Drawer, Stack, Text } from "@mantine/core";
import { useToggle } from "@mantine/hooks";
import { IconPlus } from "@tabler/icons-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLoaderData } from "@tanstack/react-router";
import { readDir } from "@tauri-apps/plugin-fs";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import GenericHeader, { type SortState } from "@/components/GenericHeader";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import FileCard from "./components/drawers/FileCard";
import { CreateModal, EditModal } from "./components/modals/Modals";
import DirectoryTable from "./components/views/DirectoryTable";
import FileGridView from "./components/views/FileGridView";
import { type Directory, FILE_TYPES, type FileMetadata, type FileType, processEntriesRecursively } from "./utils/file";

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
  const [filter, setFilter] = useState<FileType | "all">("all");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [sortBy, setSortBy] = useState<SortState>({ field: "name", direction: "asc" });

  const [createModal, toggleCreateModal] = useToggle();
  const [editModal, toggleEditModal] = useToggle();

  useEffect(() => {
    setGames(new Map());
  }, []);

  const sortOptions = [
    { value: "name", label: t("common.name", "Name") },
    { value: "games", label: t("features.databases.card.games", "Games") },
  ];

  return (
    <>
      <GenericHeader
        title={t("features.files.title")}
        folder={documentDir}
        searchPlaceholder={t("features.files.search")}
        query={search}
        setQuery={setSearch}
        sortOptions={sortOptions}
        currentSort={sortBy}
        onSortChange={setSortBy}
        viewMode={viewMode}
        setViewMode={setViewMode}
        pageKey="files"
        filters={FILE_TYPES.map((item) => (
          <Chip
            variant="outline"
            key={item.value}
            onChange={(v) => setFilter((filter) => (v ? item.value : filter === item.value ? "all" : filter))}
            checked={filter === item.value}
          >
            {t(item.labelKey)}
          </Chip>
        ))}
        actions={
          <Button
            size={isMobile ? "sm" : "xs"}
            leftSection={<IconPlus size="1rem" />}
            onClick={() => toggleCreateModal()}
          >
            {t("common.create")}
          </Button>
        }
      />
      <Stack px="md" pb="md">
        {viewMode === "table" ? (
          <DirectoryTable
            files={files}
            setFiles={mutate}
            isLoading={isLoading}
            setSelectedFile={setSelected}
            selectedFile={selected}
            search={search}
            filter={filter || ""}
            onCreateFile={() => toggleCreateModal()}
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
            onCreateFile={() => toggleCreateModal()}
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
          <FileCard
            selected={selected}
            games={games}
            setGames={setGames}
            toggleEditModal={toggleEditModal}
            mutate={mutate}
            setSelected={setSelected}
            files={files}
          />
        ) : (
          <Center h="100%">
            <Text>{t("features.files.noFileSelected")}</Text>
          </Center>
        )}
      </Drawer>

      <CreateModal
        opened={createModal}
        setOpened={toggleCreateModal}
        files={files || []}
        setFiles={mutate}
        setSelected={setSelected}
      />
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
