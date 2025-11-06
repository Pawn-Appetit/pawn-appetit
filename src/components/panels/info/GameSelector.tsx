import { ActionIcon, Badge, Box, Group, ScrollArea, Stack, Text, TextInput } from "@mantine/core";
import { modals } from "@mantine/modals";
import { IconSearch, IconX } from "@tabler/icons-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import cx from "clsx";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { commands } from "@/bindings";
import { fontSizeAtom } from "@/state/atoms";
import { parsePGN } from "@/utils/chess";
import { getGameName } from "@/utils/treeReducer";
import { unwrap } from "@/utils/unwrap";
import * as classes from "./GameSelector.css";

export default function GameSelector({
  games,
  setGames,
  setPage,
  total,
  path,
  activePage,
  deleteGame,
}: {
  games: Map<number, string>;
  setGames: React.Dispatch<React.SetStateAction<Map<number, string>>>;
  setPage: (v: number) => void;
  total: number;
  path: string;
  activePage: number;
  deleteGame?: (index: number) => void;
}) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");

  const isRowLoaded = useCallback(
    (index: number) => {
      return games.has(index);
    },
    [games],
  );

  const loadMoreRows = useCallback(
    async (startIndex: number, stopIndex: number) => {
      const data = unwrap(await commands.readGames(path, startIndex, stopIndex));

      const parsedGames = await Promise.all(
        data.map(async (game, index) => {
          const { headers } = await parsePGN(game);
          return [startIndex + index, getGameName(headers)] as const;
        }),
      );

      setGames((prevGames) => {
        const newGames = new Map(prevGames);
        parsedGames.forEach(([index, gameName]) => {
          newGames.set(index, gameName);
        });
        return newGames;
      });
    },
    [path, setGames],
  );

  const fontSize = useAtomValue(fontSizeAtom);

  // Filter games based on search query
  const filteredIndices = useMemo(() => {
    if (!searchQuery.trim()) {
      return Array.from({ length: total }, (_, i) => i);
    }

    const query = searchQuery.toLowerCase();
    return Array.from({ length: total }, (_, i) => i).filter((index) => {
      const gameName = games.get(index);
      if (!gameName) return false;
      return gameName.toLowerCase().includes(query);
    });
  }, [searchQuery, games, total]);

  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: filteredIndices.length,
    estimateSize: () => 38 * (fontSize / 100),
    getScrollElement: () => parentRef.current,
    overscan: 5,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();

  // biome-ignore lint/correctness/useExhaustiveDependencies: path is intentionally included to reset games map when path changes
  useEffect(() => {
    setGames(new Map());
  }, [path, setGames]);

  useEffect(() => {
    if (games.size === 0 && total > 0) {
      loadMoreRows(0, Math.min(20, total - 1));
    }
  }, [games.size, total, loadMoreRows]);

  useEffect(() => {
    const unloadedItems = virtualItems.filter((item) => !isRowLoaded(filteredIndices[item.index]));

    if (unloadedItems.length > 0) {
      const actualIndices = unloadedItems.map((item) => filteredIndices[item.index]);
      const startIndex = Math.min(...actualIndices);
      const stopIndex = Math.max(...actualIndices);
      loadMoreRows(startIndex, stopIndex);
    }
  }, [virtualItems, filteredIndices, loadMoreRows, isRowLoaded]);

  return (
    <Stack gap="xs" h="100%">
      {total > 10 && (
        <Group gap="xs" px="xs">
          <TextInput
            placeholder={t("common.search")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.currentTarget.value)}
            leftSection={<IconSearch size={16} />}
            rightSection={
              searchQuery && (
                <ActionIcon size="xs" variant="transparent" onClick={() => setSearchQuery("")}>
                  <IconX size={14} />
                </ActionIcon>
              )
            }
            flex={1}
            size="xs"
          />
          {searchQuery && (
            <Badge size="sm" variant="light">
              {filteredIndices.length} / {total}
            </Badge>
          )}
        </Group>
      )}

      <ScrollArea viewportRef={parentRef} flex={1} h="350px" scrollbars="y">
        <Box
          style={{
            height: rowVirtualizer.getTotalSize(),
            width: "100%",
            position: "relative",
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const actualIndex = filteredIndices[virtualRow.index];
            return (
              <GameRow
                key={actualIndex}
                index={actualIndex}
                game={games.get(actualIndex)}
                setGames={setGames}
                setPage={setPage}
                deleteGame={deleteGame}
                activePage={activePage}
                path={path}
                total={total}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: virtualRow.size,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              />
            );
          })}
        </Box>
      </ScrollArea>
    </Stack>
  );
}

function GameRow({
  style,
  index,
  game,
  setPage,
  activePage,
  deleteGame,
}: {
  style?: React.CSSProperties;
  index: number;
  game: string | undefined;
  setGames: (v: Map<number, string>) => void;
  setPage: (v: number) => void;
  path: string;
  total: number;
  activePage: number;
  deleteGame?: (index: number) => void;
}) {
  const { t } = useTranslation();

  return (
    <Group
      style={style}
      justify="space-between"
      align="center"
      pr="md"
      className={cx(classes.row, {
        [classes.active]: index === activePage,
      })}
    >
      <Group
        gap="xs"
        onClick={() => {
          setPage(index);
        }}
        flex={1}
        style={{ cursor: "pointer", minWidth: 0 }}
      >
        <Badge
          size="sm"
          variant={index === activePage ? "filled" : "light"}
          color={index === activePage ? "blue" : "gray"}
        >
          {t("units.count", { count: index + 1 })}
        </Badge>
        <Text
          fz="sm"
          truncate
          flex={1}
          style={{
            fontWeight: index === activePage ? 600 : 400,
          }}
        >
          {game || "..."}
        </Text>
      </Group>
      {deleteGame && (
        <ActionIcon
          onClick={() => {
            modals.openConfirmModal({
              title: t("features.files.game.delete.title"),
              withCloseButton: false,
              children: (
                <>
                  <Text>{t("features.files.game.delete.desc")}</Text>
                  <Text>{t("common.cannotUndo")}</Text>
                </>
              ),
              labels: { confirm: t("common.remove"), cancel: t("common.cancel") },
              confirmProps: { color: "red" },
              onConfirm: () => {
                deleteGame(index);
              },
            });
          }}
          variant="subtle"
          color="red"
          size="sm"
        >
          <IconX size={16} />
        </ActionIcon>
      )}
    </Group>
  );
}
