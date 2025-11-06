import { ActionIcon, Badge, Box, Divider, Group, Paper, Stack, Text, Tooltip } from "@mantine/core";
import { modals } from "@mantine/modals";
import { IconEdit, IconEye, IconTrash } from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { remove } from "@tauri-apps/plugin-fs";
import { useAtom, useSetAtom } from "jotai";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { commands } from "@/bindings";
import GameSelector from "@/components/panels/info/GameSelector";
import GamePreview from "@/features/databases/components/drawers/GamePreview";
import { activeTabAtom, tabsAtom } from "@/state/atoms";
import { createTab } from "@/utils/tabs";
import { unwrap } from "@/utils/unwrap";
import type { Directory, FileMetadata } from "../../utils/file";

function FileCard({
  selected,
  games,
  setGames,
  toggleEditModal,
  mutate,
  setSelected,
  files,
}: {
  selected: FileMetadata;
  games: Map<number, string>;
  setGames: React.Dispatch<React.SetStateAction<Map<number, string>>>;
  toggleEditModal: () => void;
  mutate: (newData?: (FileMetadata | Directory)[]) => void;
  setSelected: React.Dispatch<React.SetStateAction<FileMetadata | null>>;
  files: (FileMetadata | Directory)[] | undefined;
}) {
  const { t } = useTranslation();

  const [, setTabs] = useAtom(tabsAtom);
  const setActiveTab = useSetAtom(activeTabAtom);
  const navigate = useNavigate();

  const [selectedGame, setSelectedGame] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  useEffect(() => {
    setPage(0);
  }, []);

  useEffect(() => {
    async function loadGames() {
      const data = unwrap(await commands.readGames(selected.path, page, page));

      setSelectedGame(data[0]);
    }
    loadGames();
  }, [selected, page]);

  async function openGame() {
    createTab({
      tab: {
        name: selected.name || "Untitled",
        type: "analysis",
      },
      setTabs,
      setActiveTab,
      pgn: selectedGame || "",
      srcInfo: selected,
      gameNumber: page,
    });
    navigate({ to: "/boards" });
  }

  function handleDelete() {
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
        await remove(selected.path);
        await remove(selected.path.replace(".pgn", ".info"));
        mutate(files?.filter((file) => file.name !== selected.name));
        setSelected(null);
      },
    });
  }

  return (
    <Stack h="100%" gap="md">
      {/* Header Section */}
      <Paper shadow="xs" p="md" radius="md" withBorder>
        <Group justify="space-between" align="center">
          <Group>
            <Badge size="lg" variant="light">
              {t(`features.files.fileType.${selected.metadata.type.toLowerCase()}`)}
            </Badge>

            <Badge size="md" variant="filled" color="blue">
              {selected?.numGames === 1 && t("common.games.one", { count: selected?.numGames || 0 })}
              {selected?.numGames > 1 && t("common.games.other", { count: selected?.numGames || 0 })}
            </Badge>
          </Group>
          <Group gap="xs">
            <Tooltip label={t("common.open")}>
              <ActionIcon size="lg" variant="light" onClick={openGame}>
                <IconEye size={18} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label={t("features.files.editMetadata")}>
              <ActionIcon size="lg" variant="light" onClick={() => toggleEditModal()}>
                <IconEdit size={18} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label={t("common.delete")}>
              <ActionIcon size="lg" variant="light" color="red" onClick={handleDelete}>
                <IconTrash size={18} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
      </Paper>

      {selectedGame && (
        <>
          <Paper shadow="xs" p="sm" radius="md" withBorder flex={1} style={{ minHeight: 0 }}>
            <Stack gap="xs" h="100%">
              <Text fz="sm" fw={500} c="dimmed" px="xs">
                {t("common.games.other", { count: selected.numGames })}
              </Text>
              <Box style={{ flex: 1, minHeight: 0 }}>
                <GameSelector
                  setGames={setGames}
                  games={games}
                  activePage={page}
                  path={selected.path}
                  setPage={setPage}
                  total={selected.numGames}
                />
              </Box>
            </Stack>
          </Paper>

          <Paper shadow="xs" p="sm" radius="md" withBorder flex={1.2} style={{ minHeight: 0 }}>
            <GamePreview pgn={selectedGame} />
          </Paper>
        </>
      )}
    </Stack>
  );
}

export default FileCard;
