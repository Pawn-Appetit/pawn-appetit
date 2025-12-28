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
import { useAtom, useAtomValue } from "jotai";
import React, { useContext, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";
import { Comment } from "@/components/Comment";
import OpeningName from "@/components/OpeningName";
import { TreeStateContext } from "@/components/TreeStateContext";
import { currentInvisibleAtom } from "@/state/atoms";
import { keyMapAtom } from "@/state/keybindings";
import { VariantsNotationTree } from "./VariantsNotationTree";

const variationRefs = {
  variants: React.createRef<HTMLSpanElement>(),
};

function VariantsNotationAutoScroll({
  viewportRef,
  targetRef,
}: {
  viewportRef: React.RefObject<HTMLDivElement | null>;
  targetRef: React.RefObject<HTMLSpanElement | null>;
}) {
  const store = useContext(TreeStateContext);
  if (!store) return null;

  const currentFen = useStore(store, (s) => s.currentNode().fen);

  useEffect(() => {
    const viewport = viewportRef.current;
    const target = targetRef.current;
    if (!viewport || !target) return;

    viewport.scrollTo({
      top: target.offsetTop - 65,
      behavior: "smooth",
    });
  }, [currentFen, targetRef, viewportRef]);

  return null;
}

function VariantsNotation({ topBar, editingMode: _editingMode }: { topBar?: boolean; editingMode?: boolean }) {
  const store = useContext(TreeStateContext);
  if (!store) {
    throw new Error("VariantsNotation must be used within a TreeStateProvider");
  }

  const root = useStore(store, (s) => s.root);
  const headers = useStore(store, (s) => s.headers);

  const viewport = useRef<HTMLDivElement>(null);
  const [invisibleValue, setInvisible] = useAtom(currentInvisibleAtom);
  const [showComments, toggleComments] = useToggle([true, false]);
  const invisible = topBar && invisibleValue;
  const { colorScheme } = useMantineColorScheme();
  const osColorScheme = useColorScheme();
  const keyMap = useAtomValue(keyMapAtom);
  const { t } = useTranslation();

  useHotkeys([[keyMap.TOGGLE_BLUR.keys, () => setInvisible((prev: boolean) => !prev)]]);

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
        <ScrollArea flex={1} offsetScrollbars viewportRef={viewport}>
          <VariantsNotationAutoScroll viewportRef={viewport} targetRef={variationRefs.variants} />
          <Stack pt="md">
            <Box>
              {invisible && (
                <Overlay
                  backgroundOpacity={0.6}
                  color={
                    colorScheme === "dark" || (osColorScheme === "dark" && colorScheme === "auto")
                      ? "#1a1b1e"
                      : undefined
                  }
                  blur={8}
                  zIndex={2}
                />
              )}
              {showComments && root.comment && <Comment comment={root.comment} />}
              {root.children.length === 0 ? (
                <Text c="dimmed" size="sm">
                  {t("features.gameNotation.noMoves")}
                </Text>
              ) : (
                <Box>
                  {root.children.length > 0 && (
                    <VariantsNotationTree
                      root={root}
                      start={headers.start}
                      showComments={showComments}
                      targetRef={variationRefs.variants}
                    />
                  )}
                </Box>
              )}
            </Box>
            {headers.result && headers.result !== "*" && (
              <Text ta="center">
                {headers.result}
                <br />
                <Text span fs="italic">
                  {headers.result === "1/2-1/2"
                    ? t("chess.outcome.draw")
                    : headers.result === "1-0"
                      ? t("chess.outcome.whiteWins")
                      : t("chess.outcome.blackWins")}
                </Text>
              </Text>
            )}
          </Stack>
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
