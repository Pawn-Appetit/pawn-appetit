import { ActionIcon, Badge, Box, Group, Stack, Text, Tooltip } from "@mantine/core";
import { IconEdit, IconEye } from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { useAtom, useSetAtom } from "jotai";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { commands } from "@/bindings";
import GameSelector from "@/components/panels/info/GameSelector";
import GamePreview from "@/features/databases/components/GamePreview";
import { activeTabAtom, tabsAtom } from "@/state/atoms";
import { createTab } from "@/utils/tabs";
import { unwrap } from "@/utils/unwrap";
import type { FileMetadata } from "./file";

function FileCard({
  selected,
  games,
  setGames,
  toggleEditModal,
}: {
  selected: FileMetadata;
  games: Map<number, string>;
  setGames: React.Dispatch<React.SetStateAction<Map<number, string>>>;
  toggleEditModal: () => void;
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

  return (
    <Stack h="100%">
      <Stack align="center">
        <Text ta="center" fz="xl" fw="bold">
          {selected?.name}
        </Text>
        <Badge>{t(`features.files.fileType.${selected.metadata.type.toLowerCase()}`)}</Badge>
      </Stack>

      <Group align="center" grow>
        <Group>
          <Tooltip label={t("common.open")}>
            <ActionIcon onClick={openGame}>
              <IconEye />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={t("features.files.editMetadata")}>
            <ActionIcon onClick={() => toggleEditModal()}>
              <IconEdit />
            </ActionIcon>
          </Tooltip>
        </Group>
        <Text ta="center" c="dimmed">
          {selected?.numGames === 1 && t("common.games.one", { count: selected?.numGames || 0 })}
          {selected?.numGames > 1 && t("common.games.other", { count: selected?.numGames || 0 })}
        </Text>
        <div />
      </Group>

      {selectedGame && (
        <>
          <Box h="45%" flex={1}>
            <GameSelector
              setGames={setGames}
              games={games}
              activePage={page}
              path={selected.path}
              setPage={setPage}
              total={selected.numGames}
            />
          </Box>
          <Box h="55%">
            <GamePreview pgn={selectedGame} />
          </Box>
        </>
      )}
    </Stack>
  );
}

export default FileCard;
