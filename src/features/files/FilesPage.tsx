import { Button, Center, Chip, Group, Input, Paper, Stack, Text, Title } from "@mantine/core";
import { useToggle } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import { IconPlus, IconSearch, IconX } from "@tabler/icons-react";
import { useLoaderData } from "@tanstack/react-router";
import { readDir, remove } from "@tauri-apps/plugin-fs";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import useSWR from "swr";
import OpenFolderButton from "@/common/components/OpenFolderButton";
import DirectoryTable from "./components/DirectoryTable";
import FileCard from "./components/FileCard";
import { FILE_TYPES, type FileMetadata, type FileType, processEntriesRecursively } from "./components/file";
import { CreateModal, EditModal } from "./components/Modals";

const useFileDirectory = (dir: string) => {
  const { data, error, isLoading, mutate } = useSWR("file-directory", async () => {
    const entries = await readDir(dir);
    const allEntries = processEntriesRecursively(dir, entries);

    return allEntries;
  });
  return {
    files: data,
    isLoading,
    error,
    mutate,
  };
};

function FilesPage() {
  const { t } = useTranslation();

  const { documentDir } = useLoaderData({ from: "/files" });
  const { files, isLoading, mutate } = useFileDirectory(documentDir);

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<FileMetadata | null>(null);
  const [games, setGames] = useState<Map<number, string>>(new Map());
  const [filter, setFilter] = useState<FileType | null>(null);

  const [createModal, toggleCreateModal] = useToggle();
  const [editModal, toggleEditModal] = useToggle();

  useEffect(() => {
    setGames(new Map());
  }, [selected]);

  return (
    <Stack h="100%">
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
      <Group align="baseline" pl="lg" py="sm">
        <Title>{t("Files.Title")}</Title>
        <OpenFolderButton folder={documentDir} />
      </Group>

      <Group grow flex={1} style={{ overflow: "hidden" }} px="md" pb="md">
        <Stack h="100%">
          <Group>
            <Input
              style={{ flexGrow: 1 }}
              rightSection={<IconSearch size="1rem" />}
              placeholder={t("Files.Search")}
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
            />
            <Button size="xs" leftSection={<IconPlus size="1rem" />} onClick={() => toggleCreateModal()}>
              {t("Common.Create")}
            </Button>
            <Button
              size="xs"
              color="red"
              disabled={!selected}
              leftSection={<IconX size="1rem" />}
              onClick={() => {
                modals.openConfirmModal({
                  title: t("Files.Delete.Title"),
                  withCloseButton: false,
                  children: (
                    <>
                      <Text>
                        {t("Files.Delete.Message", {
                          fileName: selected?.name,
                        })}
                      </Text>
                      <Text>{t("Common.CannotUndo")}</Text>
                    </>
                  ),
                  labels: { confirm: t("Common.Remove"), cancel: t("Common.Cancel") },
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
              {t("Common.Delete")}
            </Button>
          </Group>
          <Group>
            {FILE_TYPES.map((item) => (
              <Chip
                variant="outline"
                key={item.value}
                onChange={(v) => setFilter((filter) => (v ? item.value : filter === item.value ? null : filter))}
                checked={filter === item.value}
              >
                {t(item.labelKey)}
              </Chip>
            ))}
          </Group>

          <DirectoryTable
            files={files}
            setFiles={mutate}
            isLoading={isLoading}
            setSelectedFile={setSelected}
            selectedFile={selected}
            search={search}
            filter={filter || ""}
          />
        </Stack>

        <Paper withBorder p="md" h="100%">
          {selected ? (
            <FileCard selected={selected} games={games} setGames={setGames} toggleEditModal={toggleEditModal} />
          ) : (
            <Center h="100%">
              <Text>{t("Files.NoFileSelected")}</Text>
            </Center>
          )}
        </Paper>
      </Group>
    </Stack>
  );
}
export default FilesPage;
