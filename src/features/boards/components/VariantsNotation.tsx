import {
  ActionIcon,
  Box,
  Divider,
  Group,
  Overlay,
  Paper,
  ScrollArea,
  Stack,
  Text,
  Tooltip,
  useMantineColorScheme,
} from "@mantine/core";
import { useColorScheme, useHotkeys, useToggle } from "@mantine/hooks";
import { IconArticle, IconArticleOff, IconEye, IconEyeOff } from "@tabler/icons-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useAtom, useAtomValue } from "jotai";
import { useContext, useDeferredValue, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";
import { Comment } from "@/components/Comment";
import CompleteMoveCell from "@/components/CompleteMoveCell";
import OpeningName from "@/components/OpeningName";
import { TreeStateContext } from "@/components/TreeStateContext";
import { currentInvisibleAtom, fontSizeAtom } from "@/state/atoms";
import { keyMapAtom } from "@/state/keybindings";

import type { TreeNode } from "@/utils/treeReducer";

type NotationItem =
  | { kind: "rootComment"; comment: string }
  | { kind: "empty" }
  | { kind: "move"; node: TreeNode; pathKey: string; indent: number }
  | { kind: "result"; result: string };

function buildNotationItems({
  root,
  headers,
  showComments,
}: {
  root: TreeNode;
  headers: { result?: string };
  showComments: boolean;
}) {
  const items: NotationItem[] = [];
  const pathToIndex = new Map<string, number>();

  if (showComments && root.comment) {
    items.push({ kind: "rootComment", comment: root.comment });
  }

  const walkLine = (node: TreeNode, pathKey: string, indent: number) => {
    items.push({ kind: "move", node, pathKey, indent });
    pathToIndex.set(pathKey, items.length - 1);

    if (!node.children.length) return;

    if (node.children.length === 1) {
      walkLine(node.children[0], `${pathKey}.0`, indent);
      return;
    }

    for (let i = 0; i < node.children.length; i++) {
      walkLine(node.children[i], `${pathKey}.${i}`, indent + 1);
    }
  };

  if (root.children.length === 0) {
    items.push({ kind: "empty" });
  } else {
    for (let i = 0; i < root.children.length; i++) {
      const child = root.children[i];
      if (!child) continue;
      walkLine(child, `${i}`, 0);
    }
  }

  if (headers.result && headers.result !== "*") {
    items.push({ kind: "result", result: headers.result });
  }

  return { items, pathToIndex };
}

function VariantsNotation({ topBar }: { topBar?: boolean; editingMode?: boolean }) {
  const store = useContext(TreeStateContext);
  if (!store) {
    throw new Error("VariantsNotation must be used within a TreeStateProvider");
  }

  const root = useStore(store, (s) => s.root);
  const headers = useStore(store, (s) => s.headers);
  const position = useStore(store, (s) => s.position);
  const startKey = headers.start?.join(".") ?? null;

  const viewportRef = useRef<HTMLDivElement>(null);
  const [invisibleValue, setInvisible] = useAtom(currentInvisibleAtom);
  const [showComments, toggleComments] = useToggle([true, false]);
  const invisible = topBar && invisibleValue;
  const { colorScheme } = useMantineColorScheme();
  const osColorScheme = useColorScheme();
  const keyMap = useAtomValue(keyMapAtom);
  const fontSize = useAtomValue(fontSizeAtom);
  const { t } = useTranslation();

  useHotkeys([[keyMap.TOGGLE_BLUR.keys, () => setInvisible((prev: boolean) => !prev)]]);

  const deferredRoot = useDeferredValue(root);
  const { items, pathToIndex } = useMemo(
    () => buildNotationItems({ root: deferredRoot, headers, showComments }),
    [deferredRoot, headers, showComments],
  );

  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => viewportRef.current,
    estimateSize: () => 32 * (fontSize / 100),
    overscan: 8,
    measureElement: (element) => element.getBoundingClientRect().height,
  });

  useEffect(() => {
    rowVirtualizer.measure();
  }, [rowVirtualizer, fontSize, showComments]);

  useEffect(() => {
    if (!viewportRef.current) return;

    if (position.length === 0) {
      rowVirtualizer.scrollToIndex(0, { align: "start" });
      return;
    }

    const key = position.join(".");
    const index = pathToIndex.get(key);
    if (index == null) return;

    rowVirtualizer.scrollToIndex(index, { align: "center" });
  }, [pathToIndex, position, rowVirtualizer]);

  const currentMoveRef = useRef<HTMLSpanElement | null>(null);

  return (
    <Paper withBorder p="md" flex={1} style={{ position: "relative", overflow: "hidden" }}>
      <Stack h="100%" gap={0}>
        {topBar && (
          <NotationHeader
            showComments={showComments}
            toggleComments={toggleComments}
            invisible={invisible ?? false}
            setInvisible={setInvisible}
          />
        )}
        <ScrollArea flex={1} offsetScrollbars viewportRef={viewportRef}>
          <Box style={{ position: "relative" }}>
            {invisible && (
              <Overlay
                backgroundOpacity={0.6}
                color={
                  colorScheme === "dark" || (osColorScheme === "dark" && colorScheme === "auto") ? "#1a1b1e" : undefined
                }
                blur={8}
                zIndex={2}
              />
            )}
            <Box
              style={{
                height: rowVirtualizer.getTotalSize(),
                width: "100%",
                position: "relative",
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const item = items[virtualRow.index];
                return (
                  <Box
                    key={virtualRow.index}
                    ref={rowVirtualizer.measureElement}
                    data-index={virtualRow.index}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${virtualRow.start}px)`,
                      paddingLeft: item?.kind === "move" ? `${item.indent * 0.75}rem` : undefined,
                    }}
                  >
                    {item?.kind === "rootComment" ? (
                      <Comment comment={item.comment} />
                    ) : item?.kind === "empty" ? (
                      <Text c="dimmed" size="sm">
                        {t("features.gameNotation.noMoves")}
                      </Text>
                    ) : item?.kind === "move" ? (
                      <CompleteMoveCell
                        targetRef={currentMoveRef}
                        annotations={item.node.annotations}
                        comment={item.node.comment}
                        halfMoves={item.node.halfMoves}
                        move={item.node.san}
                        fen={item.node.fen}
                        movePath={item.pathKey.split(".").map((v) => Number.parseInt(v, 10))}
                        showComments={showComments}
                        isStart={startKey === item.pathKey}
                        first
                        enableTranspositions={false}
                      />
                    ) : item?.kind === "result" ? (
                      <Text ta="center">
                        {item.result}
                        <br />
                        <Text span fs="italic">
                          {item.result === "1/2-1/2"
                            ? t("chess.outcome.draw")
                            : item.result === "1-0"
                              ? t("chess.outcome.whiteWins")
                              : t("chess.outcome.blackWins")}
                        </Text>
                      </Text>
                    ) : null}
                  </Box>
                );
              })}
            </Box>
          </Box>
        </ScrollArea>
      </Stack>
    </Paper>
  );
}

function NotationHeader({
  showComments,
  toggleComments,
  invisible,
  setInvisible,
}: {
  showComments: boolean;
  toggleComments: () => void;
  invisible: boolean;
  setInvisible: (value: boolean | ((prev: boolean) => boolean)) => void;
}) {
  const { t } = useTranslation();

  return (
    <Stack>
      <Group justify="space-between">
        <OpeningName />
        <Group gap="sm">
          <Tooltip label={invisible ? t("features.gameNotation.showMoves") : t("features.gameNotation.hideMoves")}>
            <ActionIcon onClick={() => setInvisible((prev: boolean) => !prev)}>
              {invisible ? <IconEyeOff size="1rem" /> : <IconEye size="1rem" />}
            </ActionIcon>
          </Tooltip>
          <Tooltip
            label={showComments ? t("features.gameNotation.hideComments") : t("features.gameNotation.showComments")}
          >
            <ActionIcon onClick={toggleComments}>
              {showComments ? <IconArticle size="1rem" /> : <IconArticleOff size="1rem" />}
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>
      <Divider />
    </Stack>
  );
}

export default VariantsNotation;
