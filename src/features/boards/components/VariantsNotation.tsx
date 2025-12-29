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
import { useCallback, useContext, useDeferredValue, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";
import { Comment } from "@/components/Comment";
import OpeningName from "@/components/OpeningName";
import { TreeStateContext } from "@/components/TreeStateContext";
import { currentInvisibleAtom } from "@/state/atoms";
import { keyMapAtom } from "@/state/keybindings";
import { VariantsNotationTree } from "./VariantsNotationTree";

function VariantsNotation({ topBar }: { topBar?: boolean; editingMode?: boolean }) {
  const store = useContext(TreeStateContext);
  if (!store) {
    throw new Error("VariantsNotation must be used within a TreeStateProvider");
  }

  const root = useStore(store, (s) => s.root);
  const headers = useStore(store, (s) => s.headers);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [invisibleValue, setInvisible] = useAtom(currentInvisibleAtom);
  const [showComments, toggleComments] = useToggle([true, false]);
  const [expandedDepths, setExpandedDepths] = useState<Map<string, number>>(() => new Map());
  const invisible = topBar && invisibleValue;
  const { colorScheme } = useMantineColorScheme();
  const osColorScheme = useColorScheme();
  const keyMap = useAtomValue(keyMapAtom);
  const { t } = useTranslation();

  useHotkeys([[keyMap.TOGGLE_BLUR.keys, () => setInvisible((prev: boolean) => !prev)]]);

  const deferredRoot = useDeferredValue(root);
  const maxVariationDepth = 5;
  const [expansionVersion, setExpansionVersion] = useState(0);
  const toggleExpandedPath = useCallback((pathKey: string) => {
    setExpandedDepths((prev) => {
      const next = new Map(prev);
      const current = next.get(pathKey) ?? 0;
      if (current > 0) {
        next.delete(pathKey);
      } else {
        next.set(pathKey, Number.POSITIVE_INFINITY);
      }
      return next;
    });
    setExpansionVersion((prev) => prev + 1);
  }, []);
  const getExtraDepth = useCallback((pathKey: string) => expandedDepths.get(pathKey) ?? 0, [expandedDepths]);

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
                width: "100%",
                position: "relative",
              }}
            >
              {deferredRoot.children.length === 0 ? (
                <Text c="dimmed" size="sm">
                  {t("features.gameNotation.noMoves")}
                </Text>
              ) : (
                <>
                  {showComments && deferredRoot.comment && <Comment comment={deferredRoot.comment} />}
                  <VariantsNotationTree
                    root={deferredRoot}
                    start={headers.start}
                    showComments={showComments}
                    targetRef={currentMoveRef}
                    maxVariationDepth={maxVariationDepth}
                    getExtraDepth={getExtraDepth}
                    onToggleExpanded={toggleExpandedPath}
                    expansionVersion={expansionVersion}
                  />
                </>
              )}
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
