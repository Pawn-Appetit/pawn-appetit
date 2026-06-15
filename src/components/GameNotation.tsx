import { Divider, Group, Paper, Stack, Tooltip, ActionIcon } from "@mantine/core";
import { useHotkeys, useToggle } from "@mantine/hooks";
import {
  IconArrowRight,
  IconArrowsSplit,
  IconArticle,
  IconArticleOff,
  IconEye,
  IconEyeOff,
  IconListTree,
} from "@tabler/icons-react";
import { useAtom, useAtomValue } from "jotai";
import { useContext } from "react";
import { useTranslation } from "react-i18next";
import { TreeStateContext } from "@/components/TreeStateContext";
import { currentInvisibleAtom } from "@/state/atoms";
import { keyMapAtom } from "@/state/keybindings";
import type { NotationViewMode } from "@/utils/notationFlatten";
import OpeningName from "./OpeningName";
import VirtualizedNotation from "./VirtualizedNotation";

type VariationState = NotationViewMode;

function GameNotation({
  topBar,
  initialVariationState = "mainline",
}: {
  topBar?: boolean;
  initialVariationState?: VariationState;
}) {
  const store = useContext(TreeStateContext);
  if (!store) {
    throw new Error("GameNotation must be used within a TreeStateProvider");
  }

  const [invisibleValue, setInvisible] = useAtom(currentInvisibleAtom);
  const [variationState, setVariationState] = useToggle([
    initialVariationState,
    ...["mainline", "variations", "repertoire"].filter((v) => v !== initialVariationState),
  ]) as [VariationState, (value?: VariationState) => void];
  // The header button cycles modes; the fork chooser sets a specific mode (see setMode below).
  const cycleVariationState = () => setVariationState();
  const [showComments, toggleComments] = useToggle([true, false]);

  const invisible = topBar && invisibleValue;
  const keyMap = useAtomValue(keyMapAtom);

  useHotkeys([[keyMap.TOGGLE_BLUR.keys, () => setInvisible((prev: boolean) => !prev)]]);

  return (
    <Paper withBorder p="md" flex={1} style={{ position: "relative", overflow: "hidden" }}>
      <Stack h="100%" gap={0}>
        {topBar && (
          <NotationHeader
            showComments={showComments}
            toggleComments={toggleComments}
            variationState={variationState}
            toggleVariationState={cycleVariationState}
          />
        )}
        <VirtualizedNotation
          mode={variationState}
          showComments={showComments}
          invisible={invisible}
          setMode={setVariationState}
        />
      </Stack>
    </Paper>
  );
}

function NotationHeader({
  showComments,
  toggleComments,
  variationState,
  toggleVariationState,
}: {
  showComments: boolean;
  toggleComments: () => void;
  variationState: VariationState;
  toggleVariationState: () => void;
}) {
  const [invisible, setInvisible] = useAtom(currentInvisibleAtom);
  const { t } = useTranslation();

  return (
    <Stack>
      <Group justify="space-between">
        <OpeningName />
        <Group gap="sm">
          <Tooltip
            label={
              invisible
                ? t("features.gameNotation.showMoves")
                : t("features.gameNotation.hideMoves")
            }
          >
            <ActionIcon onClick={() => setInvisible((prev: boolean) => !prev)}>
              {invisible ? <IconEyeOff size="1rem" /> : <IconEye size="1rem" />}
            </ActionIcon>
          </Tooltip>
          <Tooltip
            label={
              showComments
                ? t("features.gameNotation.hideComments")
                : t("features.gameNotation.showComments")
            }
          >
            <ActionIcon onClick={toggleComments}>
              {showComments ? <IconArticle size="1rem" /> : <IconArticleOff size="1rem" />}
            </ActionIcon>
          </Tooltip>
          <Tooltip
            label={
              variationState === "variations"
                ? t("features.gameNotation.showVariations")
                : variationState === "repertoire"
                  ? t("features.gameNotation.repertoireView")
                  : t("features.gameNotation.mainLine")
            }
          >
            <ActionIcon onClick={toggleVariationState}>
              {variationState === "variations" ? (
                <IconArrowsSplit size="1rem" />
              ) : variationState === "repertoire" ? (
                <IconListTree size="1rem" />
              ) : (
                <IconArrowRight size="1rem" />
              )}
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>
      <Divider />
    </Stack>
  );
}

export default GameNotation;
