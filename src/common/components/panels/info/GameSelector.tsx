import { ActionIcon, Box, Group, ScrollArea, Text } from "@mantine/core";
import { modals } from "@mantine/modals";
import { IconX } from "@tabler/icons-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import cx from "clsx";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useRef } from "react";
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
  function isRowLoaded(index: number) {
    return games.has(index);
  }

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

  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: total,
    estimateSize: () => 30 * (fontSize / 100),
    getScrollElement: () => parentRef.current!,
  });

  useEffect(() => {
    setGames(new Map());
  }, [path, setGames]);

  useEffect(() => {
    if (games.size === 0 && total > 0) {
      loadMoreRows(0, Math.min(10, total - 1));
    }

    const items = rowVirtualizer.getVirtualItems();
    const unloadedItems = items.filter((item) => !isRowLoaded(item.index));

    if (unloadedItems.length > 0) {
      const startIndex = Math.min(...unloadedItems.map((item) => item.index));
      const stopIndex = Math.max(...unloadedItems.map((item) => item.index));
      loadMoreRows(startIndex, stopIndex);
    }
  }, [games.size, total, loadMoreRows, rowVirtualizer]);

  return (
    <ScrollArea viewportRef={parentRef} h="100%">
      <Box
        style={{
          height: rowVirtualizer.getTotalSize(),
          width: "100%",
          position: "relative",
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => (
          <GameRow
            key={virtualRow.index}
            index={virtualRow.index}
            game={games.get(virtualRow.index)}
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
        ))}
      </Box>
    </ScrollArea>
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
      pr="xl"
      className={cx(classes.row, {
        [classes.active]: index === activePage,
      })}
    >
      <Text
        fz="sm"
        truncate
        maw={600}
        onClick={() => {
          setPage(index);
        }}
        flex={1}
      >
        {t("units.count", { count: index + 1 })}. {game}
      </Text>
      {deleteGame && (
        <Group>
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
            variant="outline"
            color="red"
            size="1rem"
          >
            <IconX />
          </ActionIcon>
        </Group>
      )}
    </Group>
  );
}
