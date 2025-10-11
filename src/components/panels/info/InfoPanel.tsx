import { Accordion, Box, Group, ScrollArea, Stack, Text } from "@mantine/core";
import { useHotkeys } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import { useLoaderData } from "@tanstack/react-router";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useContext, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";
import { commands } from "@/bindings";
import GameInfo from "@/components/GameInfo";
import { TreeStateContext } from "@/components/TreeStateContext";
import { currentTabAtom, missingMovesAtom } from "@/state/atoms";
import { keyMapAtom } from "@/state/keybindings";
import { parsePGN } from "@/utils/chess";
import { getTreeStats } from "@/utils/repertoire";
import { saveToFile } from "@/utils/tabs";
import { getGameName, getNodeAtPath } from "@/utils/treeReducer";
import { unwrap } from "@/utils/unwrap";
import FenSearch from "./FenSearch";
import FileInfo from "./FileInfo";
import GameSelector from "./GameSelector";
import PgnInput from "./PgnInput";

function InfoPanel() {
  const store = useContext(TreeStateContext)!;
  const root = useStore(store, (s) => s.root);
  const position = useStore(store, (s) => s.position);
  const headers = useStore(store, (s) => s.headers);
  const currentNode = getNodeAtPath(root, position);
  const [games, setGames] = useState<Map<number, string>>(new Map());
  const currentTab = useAtomValue(currentTabAtom);
  const isRepertoire = currentTab?.source?.type === "file" && currentTab.source.metadata.type === "repertoire";
  const isPuzzle = currentTab?.source?.type === "file" && currentTab.source.metadata.type === "puzzle";

  const { t } = useTranslation();

  const stats = useMemo(() => getTreeStats(root), [root]);

  return (
    <Stack h="100%">
      <FileInfo setGames={setGames} />
      <GameSelectorAccordion games={games} setGames={setGames} />
      <ScrollArea offsetScrollbars>
        <Stack>
          <GameInfo
            headers={headers}
            simplified={isRepertoire ? "repertoire" : isPuzzle ? "puzzle" : undefined}
            changeTitle={(title: string) => {
              setGames((prev) => {
                const newGames = new Map(prev);
                newGames.set(currentTab?.gameNumber || 0, title);
                return newGames;
              });
            }}
          />
          <FenSearch currentFen={currentNode.fen} />
          <PgnInput />

          <Group>
            <Text>
              {t("features.pgnInput.variations")}: {stats.leafs}
            </Text>
            <Text>
              {t("features.pgnInput.maxDepth")}: {stats.depth}
            </Text>
            <Text>
              {t("features.pgnInput.totalMoves")}: {stats.total}
            </Text>
          </Group>
        </Stack>
      </ScrollArea>
    </Stack>
  );
}

function GameSelectorAccordion({
  games,
  setGames,
}: {
  games: Map<number, string>;
  setGames: React.Dispatch<React.SetStateAction<Map<number, string>>>;
}) {
  const { t } = useTranslation();
  const store = useContext(TreeStateContext)!;
  const dirty = useStore(store, (s) => s.dirty);
  const setState = useStore(store, (s) => s.setState);
  const [currentTab, setCurrentTab] = useAtom(currentTabAtom);
  const setMissingMoves = useSetAtom(missingMovesAtom);
  const [tempPage, setTempPage] = useState(0);
  const { documentDir } = useLoaderData({ from: "/boards" });
  const keyMap = useAtomValue(keyMapAtom);

  const gameNumber = currentTab?.gameNumber || 0;

  async function setPage(page: number, forced?: boolean) {
    if (currentTab?.source?.type !== "file") return;

    if (!forced && dirty) {
      setTempPage(page);
      modals.openConfirmModal({
        title: t("common.unsavedChanges.title"),
        withCloseButton: false,
        children: <Text>{t("common.unsavedChanges.desc")}</Text>,
        labels: {
          confirm: t("common.unsavedChanges.saveAndClose"),
          cancel: t("common.unsavedChanges.closeWithoutSaving"),
        },
        onConfirm: async () => {
          if (currentTab) {
            saveToFile({
              dir: documentDir,
              setCurrentTab,
              tab: currentTab,
              store,
            });
          }
          setPage(tempPage, true);
        },
        onCancel: () => {
          setPage(tempPage, true);
        },
      });
      return;
    }

    if (currentTab?.source?.type === "file") {
      const data = unwrap(await commands.readGames(currentTab.source.path, page, page));
      const tree = await parsePGN(data[0]);
      setState(tree);

      const gameName = getGameName(tree.headers);
      setGames((prev) => {
        const newGames = new Map(prev);
        newGames.set(page, gameName);
        return newGames;
      });

      setCurrentTab((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          gameNumber: page,
        };
      });

      setMissingMoves((prev) => ({
        ...prev,
        [currentTab?.value]: null,
      }));
    }
  }

  async function deleteGame(index: number) {
    if (currentTab?.source?.type === "file") {
      await commands.deleteGame(currentTab.source.path, index);
      setCurrentTab((prev) => {
        if (prev?.source?.type === "file") {
          prev.source.numGames -= 1;
        }

        return { ...prev };
      });
      setGames(new Map());
    }
  }

  useHotkeys([
    [
      keyMap.NEXT_GAME.keys,
      () => {
        if (currentTab?.source?.type === "file") {
          setPage(Math.min(gameNumber + 1, currentTab.source.numGames - 1));
        }
      },
    ],
    [keyMap.PREVIOUS_GAME.keys, () => setPage(Math.max(0, gameNumber - 1))],
  ]);

  if (currentTab?.source?.type === "file") {
    const currentName = games.get(gameNumber) || "Untitled";

    return (
      <Accordion>
        <Accordion.Item value="game">
          <Accordion.Control>
            {t("units.count", { count: gameNumber + 1 })}. {currentName}
          </Accordion.Control>
          <Accordion.Panel>
            <Box h="10rem">
              <GameSelector
                games={games}
                setGames={setGames}
                setPage={setPage}
                deleteGame={deleteGame}
                path={currentTab.source.path}
                activePage={gameNumber || 0}
                total={currentTab.source.numGames}
              />
            </Box>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    );
  }

  return null;
}
export default InfoPanel;
