import { ActionIcon, Badge, Box, Group, Stack, Text, Tooltip } from "@mantine/core";
import { IconEdit, IconEye } from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { useAtom, useSetAtom } from "jotai";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { commands } from "@/bindings";
import GameSelector from "@/common/components/panels/info/GameSelector";
import GamePreview from "@/features/databases/components/GamePreview";
import { activeTabAtom, tabsAtom } from "@/state/atoms";
import { capitalize } from "@/utils/format";
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
  }, [selected]);

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
        <Badge>{t(`Files.FileType.${capitalize(selected.metadata.type)}`)}</Badge>
      </Stack>

      <Group align="center" grow>
        <Group>
          <Tooltip label={t("Common.Open")}>
            <ActionIcon onClick={openGame}>
              <IconEye />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={t("Files.EditMetadata")}>
            <ActionIcon onClick={() => toggleEditModal()}>
              <IconEdit />
            </ActionIcon>
          </Tooltip>
        </Group>
        <Text ta="center" c="dimmed">
          {t("Common.Games", { count: selected?.numGames || 0 })}
        </Text>
        <div />
      </Group>

      {selectedGame && (
        <>
          <Box h={0} flex={1}>
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
